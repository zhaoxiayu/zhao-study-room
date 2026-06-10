# 赵四儿自习室部署说明

## 本地运行

```bash
npm start
```

默认端口是 `5180`，访问：

```text
http://127.0.0.1:5180
```

## 环境变量

- `PORT`: 服务端口，云平台通常会自动提供。
- `DATA_DIR`: 数据保存目录。部署到云平台时建议设置到持久磁盘目录。

## VPS 云服务器运行

```bash
cd /path/to/study-todo
npm install
PORT=5180 DATA_DIR=/var/zhaosier-data npm start
```

生产环境建议用 PM2 守护进程：

```bash
npm install -g pm2
PORT=5180 DATA_DIR=/var/zhaosier-data pm2 start server.js --name zhaosier-study-room
pm2 save
pm2 startup
```
