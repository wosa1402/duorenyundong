# SillyTavern 实时备份同步工具

监控 SillyTavern 数据目录的文件变化，实时同步到 WebDAV 服务器。

## 功能特点

- 🔄 **实时同步** - 文件修改后自动上传，无需定时任务
- 🛡️ **防抖处理** - 避免频繁写入导致的重复上传
- 🔒 **内容校验** - 通过 MD5 哈希检测，只上传真正变化的文件
- 📁 **自动创建目录** - 远程目录结构自动同步
- 🚀 **初始全量同步** - 首次运行可选择全量同步
- 🐳 **Docker 支持** - 可作为 sidecar 容器运行

## 快速开始

### 方式一：直接运行（推荐用于测试）

```bash
# 进入备份同步目录
cd backup-sync

# 安装依赖
npm install

# 复制并编辑配置文件
cp config.example.json config.json
# 编辑 config.json，填入你的 WebDAV 信息

# 启动同步
npm start
```

### 方式二：Docker Compose（推荐用于生产）

1. 创建备份配置文件：

```bash
cd docker
cp ../backup-sync/config.docker.example.json backup-config.json
# 编辑 backup-config.json，填入你的 WebDAV 信息
```

2. 使用带备份的 compose 文件启动：

```bash
docker compose -f docker-compose.backup.yml up -d
```

### 方式三：单独运行 Docker 容器

```bash
# 构建镜像
cd backup-sync
docker build -t sillytavern-backup-sync .

# 运行容器
docker run -d \
  --name backup-sync \
  -v /path/to/sillytavern/data:/data:ro \
  -v /path/to/config.json:/config/config.json:ro \
  sillytavern-backup-sync
```

## 配置说明

```json
{
    "webdav": {
        "url": "https://your-webdav-server.com",  // WebDAV 服务器地址
        "username": "your-username",              // 用户名
        "password": "your-password",              // 密码
        "remotePath": "/SillyTavern-Backup"       // 远程备份目录
    },
    "watchDir": "../data",          // 监控的目录（相对于 sync.js）
    "debounceMs": 2000,             // 防抖时间（毫秒）
    "initialSync": true,            // 启动时是否全量同步
    "syncDelete": false,            // 是否同步删除操作
    "verbose": false,               // 详细日志
    "statsInterval": 300,           // 统计信息打印间隔（秒），0 为禁用
    "ignorePatterns": [             // 忽略的文件/目录
        "_cache",
        "_webpack",
        "thumbnails"
    ]
}
```

## 常用 WebDAV 服务

| 服务 | URL 格式 |
|-----|---------|
| 坚果云 | `https://dav.jianguoyun.com/dav/` |
| NextCloud | `https://your-nextcloud.com/remote.php/dav/files/USERNAME/` |
| Alist | `http://your-alist:5244/dav/` |
| Synology | `https://your-nas:5006/` |

### 坚果云配置示例

```json
{
    "webdav": {
        "url": "https://dav.jianguoyun.com/dav/",
        "username": "your-email@example.com",
        "password": "your-app-password",
        "remotePath": "/SillyTavern-Backup"
    }
}
```

> ⚠️ 坚果云需要使用**应用密码**，不是登录密码。在坚果云设置 → 安全选项 → 第三方应用管理中创建。

## 恢复数据

当需要恢复数据时：

1. 从 WebDAV 下载整个备份目录
2. 将文件复制到新部署的 `./data` 目录
3. 重启 SillyTavern 服务

```bash
# 使用 rclone 恢复示例
rclone copy webdav:/SillyTavern-Backup ./data
```

## 注意事项

1. **首次同步** - 如果数据量大，首次全量同步可能需要较长时间
2. **网络问题** - 网络不稳定时会自动重试
3. **敏感数据** - `secrets.json` 包含 API 密钥，请确保 WebDAV 传输使用 HTTPS
4. **存储空间** - 请确保 WebDAV 服务有足够的存储空间

## 日志示例

```
🚀 SillyTavern 实时备份同步脚本
📁 监控目录: /home/user/SillyTavern/data
🌐 WebDAV: https://dav.jianguoyun.com/dav//SillyTavern-Backup

🔗 测试 WebDAV 连接...
✅ WebDAV 连接成功
🔄 开始初始全量同步...
📊 发现 156 个文件需要检查
✅ 已同步: default-user/characters/example.png → /SillyTavern-Backup/default-user/characters/example.png
...
✅ 初始同步完成

👀 开始监控文件变化...
   按 Ctrl+C 停止

📝 文件修改: default-user/chats/Example/2024-01-01.jsonl
✅ 已同步: default-user/chats/Example/2024-01-01.jsonl → /SillyTavern-Backup/default-user/chats/Example/2024-01-01.jsonl
```
