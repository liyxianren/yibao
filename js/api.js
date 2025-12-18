/**
 * 智慧医保助手 - API 封装模块
 * 连接 Flask 后端 API
 */

// API 配置
const API_CONFIG = {
    // Flask 后端地址
    baseUrl: window.location.origin,
    // 开发环境备用地址
    devUrl: 'http://localhost:8080'
};

/**
 * 医保助手 API 类
 * 封装所有与后端 API 的交互
 */
class MedicalInsuranceAPI {
    constructor(config = API_CONFIG) {
        this.config = config;
        // 检测是否使用开发服务器
        this.baseUrl = this.detectBaseUrl();
    }

    /**
     * 检测 API 基础地址
     */
    detectBaseUrl() {
        console.log('[API] 检测baseUrl...');
        console.log('[API] window.location.protocol:', window.location.protocol);
        console.log('[API] window.location.origin:', window.location.origin);
        console.log('[API] config.baseUrl:', this.config.baseUrl);
        console.log('[API] config.devUrl:', this.config.devUrl);

        // 如果是本地文件访问，使用开发服务器地址
        if (window.location.protocol === 'file:') {
            console.log('[API] 使用devUrl (file协议):', this.config.devUrl);
            return this.config.devUrl;
        }
        console.log('[API] 使用baseUrl:', this.config.baseUrl);
        return this.config.baseUrl;
    }

    /**
     * 发送聊天消息（流式响应，支持上下文）
     * @param {string} message - 用户消息
     * @param {object} callbacks - 回调函数 { onMessage, onError, onComplete, onInit }
     * @param {object} options - 选项 { userId, conversationId, history }
     */
    async streamChat(message, { onMessage, onError, onComplete, onInit }, options = {}) {
        const url = `${this.baseUrl}/api/chat`;
        const { userId, conversationId, history } = options;

        try {
            console.log('[API] ===== 发起流式请求 =====');
            console.log('[API] 请求URL:', url);
            console.log('[API] 请求body:', JSON.stringify({ message, user_id: userId, conversation_id: conversationId }));

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    user_id: userId || null,
                    conversation_id: conversationId || null,
                    history: history || []
                })
            });

            console.log('[API] 收到response');
            console.log('[API] response.status:', response.status);
            console.log('[API] response.ok:', response.ok);
            console.log('[API] Content-Type:', response.headers.get('Content-Type'));
            console.log('[API] response.body:', response.body);
            console.log('[API] response.body是否ReadableStream:', response.body instanceof ReadableStream);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[API] HTTP错误响应:', errorText);
                throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
            }

            console.log('[API] 开始读取流式响应');
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let newConversationId = null;

            while (true) {
                const { done, value } = await reader.read();
                console.log('[API] 读取chunk, done:', done, 'value长度:', value?.length);

                if (done) {
                    console.log('[API] 流结束，调用onComplete');
                    if (onComplete) onComplete({ conversationId: newConversationId });
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                console.log('[API] buffer内容:', buffer.substring(0, 200));

                // 处理 SSE 格式的数据
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                console.log('[API] 解析到', lines.length, '行');

                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        const dataStr = line.slice(5).trim();
                        console.log('[API] SSE数据:', dataStr.substring(0, 100));

                        if (dataStr === '[DONE]') {
                            console.log('[API] 收到[DONE]信号');
                            if (onComplete) onComplete({ conversationId: newConversationId });
                            return;
                        }

                        if (dataStr) {
                            try {
                                const data = JSON.parse(dataStr);
                                console.log('[API] 解析JSON成功, type:', data.type);

                                if (data.error) {
                                    console.error('[API] 收到错误:', data.error);
                                    if (onError) onError(new Error(data.error));
                                    return;
                                }

                                // 初始化事件，获取会话ID
                                if (data.type === 'init' && data.conversation_id) {
                                    newConversationId = data.conversation_id;
                                    console.log('[API] 收到init事件, conversationId:', newConversationId);
                                    if (onInit) onInit({ conversationId: newConversationId });
                                }
                                // 内容增量
                                else if (data.type === 'delta' && data.content) {
                                    console.log('[API] 收到delta, content:', data.content);
                                    if (onMessage) onMessage(data.content);
                                }
                                // 完成事件
                                else if (data.type === 'done') {
                                    if (data.conversation_id) {
                                        newConversationId = data.conversation_id;
                                    }
                                    console.log('[API] 收到done事件, Token usage:', data.usage);
                                }
                            } catch (e) {
                                console.warn('[API] JSON解析失败:', dataStr, e);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[API] 流式聊天错误:', error);
            if (onError) onError(error);
        }
    }

    /**
     * 发送聊天消息（同步响应）
     * @param {string} message - 用户消息
     * @param {string} userId - 用户 ID（可选）
     * @returns {Promise<string>} - AI 回复
     */
    async sendChat(message, userId = null) {
        const url = `${this.baseUrl}/api/chat/sync`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    user_id: userId
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            if (result.error) {
                throw new Error(result.error);
            }

            return result.response;
        } catch (error) {
            console.error('聊天请求错误:', error);
            throw error;
        }
    }

    /**
     * 获取新闻列表
     * @returns {Promise<array>} - 新闻列表
     */
    async getNews() {
        const url = `${this.baseUrl}/api/news`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            if (result.error) {
                throw new Error(result.error);
            }

            return result.news || [];
        } catch (error) {
            console.error('获取新闻错误:', error);
            throw error;
        }
    }

    /**
     * 健康检查
     * @returns {Promise<boolean>} - API 是否可用
     */
    async healthCheck() {
        try {
            const response = await fetch(`${this.baseUrl}/api/health`);
            const result = await response.json();
            return result.status === 'healthy';
        } catch (error) {
            console.error('健康检查失败:', error);
            return false;
        }
    }
}

// 创建全局 API 实例
const api = new MedicalInsuranceAPI();

// 调试函数：直接测试流式请求
window.debugStreamTest = async function() {
    const url = api.baseUrl + '/api/chat';
    console.log('=== 调试流式测试 ===');
    console.log('URL:', url);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'hello' })
        });

        console.log('Status:', response.status);
        console.log('Content-Type:', response.headers.get('Content-Type'));

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let chunkCount = 0;
        let totalBytes = 0;

        while (true) {
            const { done, value } = await reader.read();
            chunkCount++;

            if (done) {
                console.log('=== 流结束 ===');
                console.log('总chunks:', chunkCount);
                console.log('总字节:', totalBytes);
                break;
            }

            totalBytes += value.length;
            const text = decoder.decode(value, { stream: true });
            console.log(`[Chunk ${chunkCount}] ${value.length} bytes:`, text.substring(0, 100));
        }
    } catch (e) {
        console.error('错误:', e);
    }
};

console.log('[API] 调试函数已加载，在控制台运行 debugStreamTest() 测试流式请求');

// 兼容旧的 cozeAPI 接口
const cozeAPI = {
    /**
     * 流式聊天（兼容旧接口）
     */
    async streamChatMessage(message, callbacks, context = {}) {
        return api.streamChat(message, {
            onMessage: (content) => {
                if (callbacks.onMessage) {
                    callbacks.onMessage({ message: content });
                }
            },
            onError: callbacks.onError,
            onComplete: callbacks.onComplete
        });
    },

    /**
     * 获取新闻（兼容旧接口）
     */
    async getNews(options = {}) {
        return api.getNews();
    },

    /**
     * 设置访问令牌（已弃用，由后端管理）
     */
    setAccessToken(token) {
        console.warn('setAccessToken 已弃用，令牌由后端管理');
    },

    /**
     * 设置工作流 ID（已弃用）
     */
    setWorkflowId(type, id) {
        console.warn('setWorkflowId 已弃用');
    }
};

// 导出
window.MedicalInsuranceAPI = MedicalInsuranceAPI;
window.api = api;
window.cozeAPI = cozeAPI;
