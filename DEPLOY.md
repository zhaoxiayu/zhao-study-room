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
- `DATA_DIR`: 数据保存目录。没有挂载持久磁盘时可以不设置；挂载 Render Disk 后再设置到磁盘目录。

Render 免费测试时可以先不设置 `DATA_DIR`。如果已经设置了 `DATA_DIR=/var/data` 但没有添加 Disk，会出现 `EACCES: permission denied, mkdir '/var/data'`。

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
