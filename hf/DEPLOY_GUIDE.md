# Hugging Face Space 部署教程

本教程将指导你如何将 SillyTavernChat 部署到 Hugging Face Space，并配置实时备份到 WebDAV。

---

## 📋 目录

1. [准备工作](#1-准备工作)
2. [创建 Hugging Face Space](#2-创建-hugging-face-space)
3. [上传代码](#3-上传代码)
4. [配置 WebDAV 备份](#4-配置-webdav-备份)
5. [启动和验证](#5-启动和验证)
6. [数据恢复](#6-数据恢复)
7. [常见问题](#7-常见问题)

---

## 1. 准备工作

### 1.1 注册账号

- **Hugging Face 账号**: https://huggingface.co/join
- **WebDAV 服务**（选择其一）:
  - 坚果云: https://www.jianguoyun.com
  - NextCloud（自建）
  - Alist（自建）

### 1.2 获取 WebDAV 凭据

#### 坚果云配置（推荐国内用户）

1. 登录坚果云
2. 点击右上角用户名 → **账户信息**
3. 选择 **安全选项** 标签
4. 在 **第三方应用管理** 中，点击 **添加应用**
5. 输入应用名称（如 `SillyTavern`）
6. 记录生成的 **应用密码**（不是登录密码！）

WebDAV 信息：
- URL: `https://dav.jianguoyun.com/dav/`
- 用户名: 你的坚果云邮箱
- 密码: 刚才生成的应用密码

---

## 2. 创建 Hugging Face Space

### 2.1 创建新 Space

1. 登录 Hugging Face
2. 点击右上角头像 → **New Space**
3. 填写信息：
   - **Space name**: `sillytavern`（或你喜欢的名字）
   - **License**: `AGPL-3.0`
   - **SDK**: 选择 **Docker**
   - **Hardware**: 选择 `CPU basic`（免费）或更高配置
4. 点击 **Create Space**

### 2.2 设置 Space 为私有（推荐）

因为聊天数据是私密的，建议设置为私有：

1. 进入 Space 页面
2. 点击 **Settings**
3. 在 **Visibility** 中选择 **Private**

---

## 3. 上传代码

### 方式一：通过 Git（推荐）

```bash
# 克隆你的 Space（替换为你的用户名和 space 名）
git clone https://huggingface.co/spaces/YOUR_USERNAME/sillytavern
cd sillytavern

# 复制项目文件
# 注意：需要复制整个 SillyTavernChat 项目

# 使用 hf 目录中的文件替换默认文件
cp /path/to/SillyTavernchat/hf/Dockerfile ./Dockerfile
cp /path/to/SillyTavernchat/hf/README.md ./README.md

# 复制入口脚本到 docker 目录
mkdir -p docker
cp /path/to/SillyTavernchat/hf/docker-entrypoint.sh ./docker/

# 配置 WebDAV 备份（重要！）
cp backup-sync/config.example.json backup-sync/config.json
# 编辑 backup-sync/config.json，填入你的 WebDAV 信息

# 提交并推送
git add .
git commit -m "Initial deployment"
git push
```

### 方式二：通过 Web 界面上传

1. 进入 Space 的 **Files** 标签
2. 点击 **Upload files**
3. 上传整个项目文件

---

## 4. 配置 WebDAV 备份

### 4.1 创建配置文件

在项目的 `backup-sync/` 目录下，复制 `config.example.json` 为 `config.json`：

```json
{
    "webdav": {
        "url": "https://dav.jianguoyun.com/dav/",
        "username": "your-email@example.com",
        "password": "your-app-password",
        "remotePath": "/SillyTavern-Backup"
    },
    "watchDir": "../data",
    "debounceMs": 2000,
    "initialSync": true,
    "syncDelete": false,
    "verbose": false,
    "statsInterval": 300,
    "ignorePatterns": [
        "_cache",
        "_webpack",
        "thumbnails",
        ".tmp",
        ".temp",
        "node_modules"
    ]
}
```

### 4.2 配置说明

| 字段 | 说明 |
|------|------|
| `webdav.url` | WebDAV 服务器地址 |
| `webdav.username` | 用户名 |
| `webdav.password` | 密码/应用密码 |
| `webdav.remotePath` | 远程备份目录路径 |
| `initialSync` | 启动时是否全量同步（恢复数据时设为 `false`） |
| `debounceMs` | 防抖时间，避免频繁上传 |

### 4.3 使用 Secrets 保护敏感信息（推荐）

为了不在代码中暴露密码，可以使用 Hugging Face Secrets：

1. 进入 Space → **Settings** → **Repository secrets**
2. 添加以下 secrets：
   - `WEBDAV_URL`: WebDAV 地址
   - `WEBDAV_USERNAME`: 用户名
   - `WEBDAV_PASSWORD`: 密码

然后修改 `docker-entrypoint.sh`，在启动备份前动态生成配置：

```bash
# 从环境变量生成备份配置
if [ -n "$WEBDAV_URL" ]; then
    cat > backup-sync/config.json << EOF
{
    "webdav": {
        "url": "${WEBDAV_URL}",
        "username": "${WEBDAV_USERNAME}",
        "password": "${WEBDAV_PASSWORD}",
        "remotePath": "/SillyTavern-Backup"
    },
    "watchDir": "../data",
    "debounceMs": 2000,
    "initialSync": true
}
EOF
fi
```

---

## 5. 启动和验证

### 5.1 查看构建日志

1. 进入 Space 页面
2. 点击 **Logs** 标签
3. 查看 **Building** 和 **Running** 日志

成功启动后会看到类似输出：

```
🚀 Starting SillyTavern with Real-time Backup...
📋 Resource not found, copying from defaults: config.yaml
🔄 Starting backup sync service...
✅ Backup sync started (PID: 123)
🌐 Starting SillyTavern server on port 7860...
```

### 5.2 访问应用

Space 构建完成后，点击 **App** 标签即可访问 SillyTavern。

URL 格式: `https://YOUR_USERNAME-sillytavern.hf.space`

### 5.3 验证备份

1. 在 SillyTavern 中创建一个角色或发送一条消息
2. 登录你的 WebDAV 服务（如坚果云）
3. 检查 `/SillyTavern-Backup` 目录是否有新文件

---

## 6. 数据恢复

当 Space 重启或重新部署后，需要恢复数据。

### 6.1 自动恢复（推荐）

如果 `config.json` 中 `initialSync: true`，备份服务会在启动时自动检查并上传本地文件。

但这不会从 WebDAV 下载数据。要实现自动恢复，需要修改启动脚本。

### 6.2 添加自动恢复功能

在 `docker-entrypoint.sh` 中添加恢复逻辑：

```bash
# 在启动备份服务之前，先从 WebDAV 恢复数据
if [ -f "backup-sync/config.json" ] && [ ! -f "data/.restored" ]; then
    echo "📥 Restoring data from WebDAV..."
    cd backup-sync
    node restore.js
    touch ../data/.restored
    cd ..
fi
```

### 6.3 手动恢复

1. 从 WebDAV 下载备份文件
2. 通过 Hugging Face 的 Files 界面上传到 `data/` 目录
3. 重启 Space

---

## 7. 常见问题

### Q: Space 休眠后数据会丢失吗？

**A**: 是的，Hugging Face 免费 Space 会在一段时间不活动后休眠，重启后 `/data` 目录会重置。这就是为什么需要实时备份到 WebDAV。

### Q: 如何升级 Space 防止休眠？

**A**:
- 在 Settings 中选择付费 Hardware
- 或者使用 Persistent Storage（部分 Space 支持）

### Q: 备份同步失败怎么办？

**A**: 查看 Logs，常见原因：
- WebDAV 凭据错误
- 网络连接问题
- 远程目录权限问题

### Q: 如何查看备份状态？

**A**: 在 Space 的 Logs 中可以看到实时的同步日志：

```
✅ 已同步: default-user/chats/Example/2024-01-01.jsonl
```

### Q: 坚果云有流量限制吗？

**A**: 免费账户每月有 1GB 上传和 3GB 下载限制。对于正常使用的聊天记录来说足够了。

### Q: 如何备份到多个位置？

**A**: 可以修改 `sync.js` 支持多个 WebDAV 目标，或者使用坚果云的同步功能同步到本地电脑。

---

## 📁 文件结构参考

```
your-space/
├── Dockerfile              # 来自 hf/Dockerfile
├── README.md               # 来自 hf/README.md（Space 描述）
├── docker/
│   └── docker-entrypoint.sh  # 来自 hf/docker-entrypoint.sh
├── backup-sync/
│   ├── sync.js             # 同步脚本
│   ├── package.json
│   ├── config.json         # ⚠️ 包含 WebDAV 密码，建议用 Secrets
│   └── config.example.json
├── src/                    # SillyTavern 源码
├── public/                 # 前端文件
├── default/                # 默认配置
└── ... 其他 SillyTavern 文件
```

---

## 🔗 相关链接

- [Hugging Face Spaces 文档](https://huggingface.co/docs/hub/spaces)
- [Docker SDK 文档](https://huggingface.co/docs/hub/spaces-sdks-docker)
- [坚果云 WebDAV 帮助](https://help.jianguoyun.com/?p=2064)
