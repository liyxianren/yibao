FROM python:3.11-slim

WORKDIR /app

# 安装依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制项目文件
COPY . .

# 创建数据目录
RUN mkdir -p /app/data

# 暴露端口（Zeabur 会通过 PORT 环境变量指定）
EXPOSE 8080

# 初始化数据库并启动服务
CMD python -c "from app import init_db; init_db()" && \
    gunicorn --bind 0.0.0.0:${PORT:-8080} --workers 2 --threads 4 --timeout 120 app:app
