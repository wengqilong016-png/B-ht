
FROM node:20-slim
WORKDIR /app
# 复制硬盘数据和服务器代码
COPY package*.json ./
RUN npm install --production
COPY dist ./dist
COPY local_server.js ./
COPY BAHATI_DATA_BACKUP.json ./
# 环境变量
ENV PORT=8080
EXPOSE 8080
# 运行
CMD [ "node", "local_server.js" ]
