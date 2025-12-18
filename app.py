# -*- coding: utf-8 -*-
"""
智慧医保助手 - Flask 后端
提供 AI 对话和新闻推送 API
"""

from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import requests
import json
import os
from datetime import datetime, date
import threading
import sqlite3

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)  # 允许跨域请求

# COZE API 配置
COZE_CONFIG = {
    "access_token": "sat_lnoDhfJ0He2hTLyqAlZqo4ItOHNQLR5I4cg2XVjG5YZPKAkR5Il167YigxeXotHK",
    "bot_id": "7504643730922848271",
    "base_url": "https://api.coze.cn",
}

# SQLite 数据库配置
DB_FILE = os.path.join(os.path.dirname(__file__), 'data', 'stats.db')
stats_lock = threading.Lock()

def get_db_connection():
    """获取数据库连接"""
    os.makedirs(os.path.dirname(DB_FILE), exist_ok=True)
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """初始化数据库表结构"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 创建总体统计表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS stats_summary (
            id INTEGER PRIMARY KEY,
            start_date TEXT NOT NULL,
            initial_visits INTEGER DEFAULT 520,
            initial_api_calls INTEGER DEFAULT 1231,
            total_visits INTEGER DEFAULT 0,
            total_api_calls INTEGER DEFAULT 0
        )
    ''')

    # 创建每日统计表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS daily_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT UNIQUE NOT NULL,
            visits INTEGER DEFAULT 0,
            api_calls INTEGER DEFAULT 0
        )
    ''')

    # 检查是否有初始数据，如果没有则插入
    cursor.execute('SELECT COUNT(*) FROM stats_summary')
    if cursor.fetchone()[0] == 0:
        # 插入初始数据（从之前的JSON迁移）
        cursor.execute('''
            INSERT INTO stats_summary (id, start_date, initial_visits, initial_api_calls, total_visits, total_api_calls)
            VALUES (1, '2025-10-08', 520, 1231, 3, 1)
        ''')
        # 迁移现有的每日数据
        cursor.execute('''
            INSERT OR IGNORE INTO daily_stats (date, visits, api_calls)
            VALUES ('2025-12-17', 3, 1)
        ''')

    conn.commit()
    conn.close()
    print("[STATS] SQLite 数据库初始化完成")

def record_visit():
    """记录网站访问"""
    with stats_lock:
        conn = get_db_connection()
        cursor = conn.cursor()
        today = date.today().isoformat()

        # 更新总访问量
        cursor.execute('UPDATE stats_summary SET total_visits = total_visits + 1 WHERE id = 1')

        # 更新或插入今日统计
        cursor.execute('''
            INSERT INTO daily_stats (date, visits, api_calls)
            VALUES (?, 1, 0)
            ON CONFLICT(date) DO UPDATE SET visits = visits + 1
        ''', (today,))

        conn.commit()
        conn.close()

def record_api_call():
    """记录API调用"""
    with stats_lock:
        conn = get_db_connection()
        cursor = conn.cursor()
        today = date.today().isoformat()

        # 更新总API调用量
        cursor.execute('UPDATE stats_summary SET total_api_calls = total_api_calls + 1 WHERE id = 1')

        # 更新或插入今日统计
        cursor.execute('''
            INSERT INTO daily_stats (date, visits, api_calls)
            VALUES (?, 0, 1)
            ON CONFLICT(date) DO UPDATE SET api_calls = api_calls + 1
        ''', (today,))

        conn.commit()
        conn.close()

def get_headers():
    """获取 API 请求头"""
    return {
        "Authorization": f"Bearer {COZE_CONFIG['access_token']}",
        "Content-Type": "application/json"
    }


@app.route('/api/chat', methods=['POST'])
def chat():
    """
    聊天 API - 流式响应
    请求体: {
        "message": "用户消息",
        "user_id": "用户ID(可选)",
        "conversation_id": "会话ID(可选，用于上下文)",
        "history": [{"role": "user/assistant", "content": "..."}] (可选)
    }
    """
    record_api_call()  # 记录API调用
    import sys
    data = request.get_json()
    message = data.get('message', '')
    # 如果 user_id 为空或 null，生成默认值
    user_id = data.get('user_id') or ('web_user_' + str(hash(request.remote_addr))[-8:])
    conversation_id = data.get('conversation_id') or ''
    history = data.get('history') or []

    print(f"[BACKEND] 收到请求: message='{message}', user_id='{user_id}', conversation_id='{conversation_id}'", file=sys.stderr, flush=True)
    print(f"[BACKEND] history长度: {len(history)}, 内容: {history[:2] if history else 'empty'}", file=sys.stderr, flush=True)

    if not message:
        return jsonify({"error": "消息不能为空"}), 400

    # 构建消息列表（包含历史上下文）
    additional_messages = []

    # 添加历史消息作为上下文
    for msg in history[-6:]:  # 最多保留最近6条历史
        additional_messages.append({
            "role": msg.get("role", "user"),
            "content": msg.get("content", ""),
            "content_type": "text"
        })

    # 添加当前消息
    additional_messages.append({
        "role": "user",
        "content": message,
        "content_type": "text"
    })

    payload = {
        "bot_id": COZE_CONFIG['bot_id'],
        "user_id": user_id,
        "stream": True,
        "auto_save_history": True,
        "additional_messages": additional_messages
    }

    # 如果有会话ID，添加到请求中以保持上下文
    if conversation_id:
        payload["conversation_id"] = conversation_id

    print(f"[BACKEND] 发送到COZE的payload: {json.dumps(payload, ensure_ascii=False)[:500]}", file=sys.stderr, flush=True)

    def generate():
        """生成流式响应"""
        import sys
        print("[BACKEND] generate() 开始执行", file=sys.stderr, flush=True)
        chunk_count = 0

        try:
            response = requests.post(
                f"{COZE_CONFIG['base_url']}/v3/chat",
                headers=get_headers(),
                json=payload,
                stream=True,
                timeout=120
            )

            print(f"[BACKEND] COZE响应状态: {response.status_code}", file=sys.stderr, flush=True)

            if response.status_code != 200:
                yield f"data: {json.dumps({'error': '请求失败', 'status': response.status_code})}\n\n"
                return

            current_event = None
            conv_id = None  # 保存会话ID用于上下文

            for line in response.iter_lines():
                if line:
                    decoded_line = line.decode('utf-8')

                    if decoded_line.startswith('event:'):
                        current_event = decoded_line[6:].strip()
                    elif decoded_line.startswith('data:'):
                        data_str = decoded_line[5:].strip()
                        if data_str and data_str != "[DONE]":
                            try:
                                data = json.loads(data_str)

                                # 获取会话ID（在 chat.created 事件中）
                                if current_event == "conversation.chat.created":
                                    conv_id = data.get("conversation_id", "")
                                    if conv_id:
                                        chunk_count += 1
                                        output = f"data: {json.dumps({'type': 'init', 'conversation_id': conv_id})}\n\n"
                                        print(f"[BACKEND] 发送chunk {chunk_count}: init", file=sys.stderr, flush=True)
                                        yield output

                                elif current_event == "conversation.message.delta":
                                    content = data.get("content", "")
                                    msg_type = data.get("type", "")
                                    if msg_type == "answer" and content:
                                        # 发送内容片段到前端
                                        chunk_count += 1
                                        output = f"data: {json.dumps({'type': 'delta', 'content': content})}\n\n"
                                        print(f"[BACKEND] 发送chunk {chunk_count}: delta '{content}'", file=sys.stderr, flush=True)
                                        yield output

                                elif current_event == "conversation.message.completed":
                                    msg_type = data.get("type", "")
                                    if msg_type == "answer":
                                        chunk_count += 1
                                        output = f"data: {json.dumps({'type': 'completed'})}\n\n"
                                        print(f"[BACKEND] 发送chunk {chunk_count}: completed", file=sys.stderr, flush=True)
                                        yield output

                                elif current_event == "conversation.chat.completed":
                                    usage = data.get("usage", {})
                                    chunk_count += 1
                                    output = f"data: {json.dumps({'type': 'done', 'conversation_id': conv_id, 'usage': usage})}\n\n"
                                    print(f"[BACKEND] 发送chunk {chunk_count}: done", file=sys.stderr, flush=True)
                                    yield output

                            except json.JSONDecodeError:
                                pass

            chunk_count += 1
            print(f"[BACKEND] 发送chunk {chunk_count}: [DONE]", file=sys.stderr, flush=True)
            yield "data: [DONE]\n\n"
            print(f"[BACKEND] generate() 结束，共发送 {chunk_count} chunks", file=sys.stderr, flush=True)

        except requests.Timeout:
            yield f"data: {json.dumps({'error': '请求超时，请重试'})}\n\n"
        except Exception as e:
            print(f"[BACKEND] 错误: {e}", file=sys.stderr, flush=True)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            'Transfer-Encoding': 'chunked'
        }
    )


@app.route('/api/chat/sync', methods=['POST'])
def chat_sync():
    """
    聊天 API - 同步响应（非流式）
    请求体: { "message": "用户消息", "user_id": "用户ID(可选)" }
    """
    record_api_call()  # 记录API调用
    data = request.get_json()
    message = data.get('message', '')
    user_id = data.get('user_id', 'web_user_' + str(hash(request.remote_addr))[-8:])

    if not message:
        return jsonify({"error": "消息不能为空"}), 400

    payload = {
        "bot_id": COZE_CONFIG['bot_id'],
        "user_id": user_id,
        "stream": True,  # 仍使用流式，但收集完整响应
        "auto_save_history": True,
        "additional_messages": [
            {
                "role": "user",
                "content": message,
                "content_type": "text"
            }
        ]
    }

    try:
        response = requests.post(
            f"{COZE_CONFIG['base_url']}/v3/chat",
            headers=get_headers(),
            json=payload,
            stream=True,
            timeout=120
        )

        if response.status_code != 200:
            return jsonify({"error": "请求失败", "status": response.status_code}), 500

        full_response = ""
        current_event = None

        for line in response.iter_lines():
            if line:
                decoded_line = line.decode('utf-8')

                if decoded_line.startswith('event:'):
                    current_event = decoded_line[6:].strip()
                elif decoded_line.startswith('data:'):
                    data_str = decoded_line[5:].strip()
                    if data_str and data_str != "[DONE]":
                        try:
                            data = json.loads(data_str)

                            if current_event == "conversation.message.delta":
                                content = data.get("content", "")
                                msg_type = data.get("type", "")
                                if msg_type == "answer" and content:
                                    full_response += content

                        except json.JSONDecodeError:
                            pass

        return jsonify({
            "success": True,
            "response": full_response
        })

    except requests.Timeout:
        return jsonify({"error": "请求超时，请重试"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/news', methods=['GET'])
def get_news():
    """
    获取新闻 API
    通过发送"最新新闻"指令获取医保新闻
    """
    payload = {
        "bot_id": COZE_CONFIG['bot_id'],
        "user_id": "news_fetcher",
        "stream": True,
        "auto_save_history": False,
        "additional_messages": [
            {
                "role": "user",
                "content": "最新新闻",
                "content_type": "text"
            }
        ]
    }

    try:
        response = requests.post(
            f"{COZE_CONFIG['base_url']}/v3/chat",
            headers=get_headers(),
            json=payload,
            stream=True,
            timeout=120
        )

        if response.status_code != 200:
            return jsonify({"error": "获取新闻失败", "status": response.status_code}), 500

        full_response = ""
        current_event = None

        for line in response.iter_lines():
            if line:
                decoded_line = line.decode('utf-8')

                if decoded_line.startswith('event:'):
                    current_event = decoded_line[6:].strip()
                elif decoded_line.startswith('data:'):
                    data_str = decoded_line[5:].strip()
                    if data_str and data_str != "[DONE]":
                        try:
                            data = json.loads(data_str)

                            # 新闻内容在 completed 事件的 answer 类型中
                            if current_event == "conversation.message.completed":
                                msg_type = data.get("type", "")
                                if msg_type == "answer":
                                    content = data.get("content", "")
                                    if content:
                                        full_response = content  # 完整内容一次性返回

                            # 也尝试从 delta 事件收集
                            elif current_event == "conversation.message.delta":
                                content = data.get("content", "")
                                msg_type = data.get("type", "")
                                if msg_type == "answer" and content:
                                    full_response += content

                        except json.JSONDecodeError:
                            pass

        # 解析新闻 JSON
        news_list = parse_news_response(full_response)

        return jsonify({
            "success": True,
            "news": news_list
        })

    except requests.Timeout:
        return jsonify({"error": "请求超时，请重试"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def parse_news_response(response_text):
    """
    解析新闻响应
    COZE 返回的是卡片 JSON 格式，新闻在 data 字段的嵌套 JSON 中
    """
    news_list = []

    try:
        # 尝试解析 JSON 卡片格式
        data = json.loads(response_text)

        # COZE 卡片格式：data 字段是一个 JSON 字符串
        if "data" in data and isinstance(data["data"], str):
            # 解析嵌套的 JSON 字符串
            inner_data = json.loads(data["data"])
            # 从 variables.data.defaultValue 提取新闻
            variables = inner_data.get("variables", {})
            news_data = variables.get("data", {}).get("defaultValue", [])

            for item in news_data:
                news_item = {
                    "title": item.get("title", ""),
                    "content": item.get("content", ""),
                    "url": item.get("url", "")
                }
                if news_item["title"]:
                    news_list.append(news_item)

        # 兼容其他格式
        elif data.get("type") == "card":
            variables = data.get("data", {}).get("variables", {})
            news_data = variables.get("data", {}).get("defaultValue", [])
            for item in news_data:
                news_item = {
                    "title": item.get("title", ""),
                    "content": item.get("content", ""),
                    "url": item.get("url", "")
                }
                if news_item["title"]:
                    news_list.append(news_item)
        elif isinstance(data, list):
            news_list = data
        elif "news" in data:
            news_list = data["news"]

    except json.JSONDecodeError:
        # 如果不是 JSON，尝试从文本中提取新闻
        lines = response_text.strip().split('\n')
        current_news = {}

        for line in lines:
            line = line.strip()
            if not line:
                if current_news.get("title"):
                    news_list.append(current_news)
                    current_news = {}
            elif line.startswith('http'):
                current_news["url"] = line
            elif not current_news.get("title"):
                current_news["title"] = line
            else:
                current_news["content"] = current_news.get("content", "") + line

        if current_news.get("title"):
            news_list.append(current_news)

    return news_list


@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({
        "status": "healthy",
        "service": "智慧医保助手 API"
    })


@app.route('/api/stats', methods=['GET'])
def get_stats():
    """获取统计数据"""
    conn = get_db_connection()
    cursor = conn.cursor()
    today = date.today().isoformat()

    # 获取总体统计
    cursor.execute('SELECT * FROM stats_summary WHERE id = 1')
    summary = cursor.fetchone()

    if summary:
        start_date = summary['start_date']
        total_visits = summary['initial_visits'] + summary['total_visits']
        total_api_calls = summary['initial_api_calls'] + summary['total_api_calls']
    else:
        start_date = '2025-10-08'
        total_visits = 520
        total_api_calls = 1231

    # 获取今日数据
    cursor.execute('SELECT visits, api_calls FROM daily_stats WHERE date = ?', (today,))
    today_row = cursor.fetchone()
    today_visits = today_row['visits'] if today_row else 0
    today_api_calls = today_row['api_calls'] if today_row else 0

    # 获取最近7天的数据
    cursor.execute('''
        SELECT date, visits, api_calls FROM daily_stats
        ORDER BY date DESC LIMIT 7
    ''')
    daily_data = []
    for row in cursor.fetchall():
        daily_data.append({
            'date': row['date'],
            'visits': row['visits'],
            'api_calls': row['api_calls']
        })

    conn.close()

    return jsonify({
        'start_date': start_date,
        'total_visits': total_visits,
        'total_api_calls': total_api_calls,
        'today_visits': today_visits,
        'today_api_calls': today_api_calls,
        'daily': daily_data
    })


@app.route('/admin')
def admin_page():
    """管理页面"""
    return app.send_static_file('admin.html')


@app.route('/')
def index():
    """首页 - 返回 index.html"""
    record_visit()  # 记录访问
    return app.send_static_file('index.html')


@app.route('/<path:path>')
def serve_static(path):
    """提供静态文件（排除 API 路径）"""
    if path.startswith('api/'):
        return jsonify({"error": "Not found"}), 404
    return app.send_static_file(path)


if __name__ == '__main__':
    # 初始化数据库
    init_db()
    # 从环境变量获取端口（Zeabur 使用 PORT 环境变量）
    port = int(os.getenv('PORT', 8080))
    # 开发模式运行
    app.run(host='0.0.0.0', port=port, debug=True)
