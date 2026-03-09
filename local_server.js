
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 8080;
const DATA_FILE = path.join(__dirname, 'BAHATI_DATA_BACKUP.json');

app.use(cors());
app.use(express.json());

// 静态文件服务（打包后的 dist 目录）
app.use(express.static(path.join(__dirname, 'dist')));

// 核心数据接口：读取硬盘里的 107 台机器资料
app.get('/api/backup-data', (req, res) => {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: '硬盘资料读取失败' });
  }
});

// 保存数据到硬盘
app.post('/api/save-backup', (req, res) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '硬盘资料保存失败' });
  }
});

app.listen(PORT, () => {
  console.log(`
  ===========================================
  🚀 BAHATI 硬盘版服务器已启动！
  -------------------------------------------
  访问地址: http://localhost:${PORT}
  数据源: ${DATA_FILE} (107台机器)
  ===========================================
  `);
});
