FROM node:20-alpine

WORKDIR /app

# 安装依赖
COPY package.json ./
RUN npm install --production

# 复制脚本
COPY sync.js ./

# 创建数据挂载点
RUN mkdir -p /data /config

# 默认配置路径
ENV SYNC_CONFIG=/config/config.json

CMD ["node", "sync.js"]
