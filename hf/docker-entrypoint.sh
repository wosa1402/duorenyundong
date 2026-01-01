#!/bin/sh

# ============================================
# SillyTavern + 实时备份同步 启动脚本
# 用于 Hugging Face Space 部署
# 支持备份和恢复 data 和 config 目录
# ============================================

echo "🚀 Starting SillyTavern with Real-time Backup..."

# 创建必要的目录
mkdir -p config data

# ============================================
# 从环境变量生成备份配置（使用 HF Secrets）
# ============================================
if [ -n "$WEBDAV_URL" ] && [ -n "$WEBDAV_USERNAME" ] && [ -n "$WEBDAV_PASSWORD" ]; then
    echo "📝 Generating backup config from environment variables..."
    cat > backup-sync/config.json << EOF
{
    "webdav": {
        "url": "${WEBDAV_URL}",
        "username": "${WEBDAV_USERNAME}",
        "password": "${WEBDAV_PASSWORD}",
        "remotePath": "${WEBDAV_REMOTE_PATH:-/SillyTavern-Backup}"
    },
    "watchDir": "../data",
    "watchConfigDir": "../config",
    "debounceMs": 2000,
    "initialSync": false,
    "syncDelete": false,
    "verbose": false,
    "statsInterval": 300,
    "restoreConcurrency": 50,
    "ignorePatterns": [
        "_cache",
        "_webpack",
        "thumbnails",
        ".tmp",
        ".temp",
        "node_modules"
    ]
}
EOF
    echo "✅ Backup config generated"
fi

# ============================================
# 从 WebDAV 恢复数据和配置
# ============================================
if [ -f "backup-sync/config.json" ]; then
    if [ ! -f "data/.restored" ]; then
        echo "📥 Restoring data and config from WebDAV..."
        cd backup-sync
        node restore.js
        RESTORE_STATUS=$?
        cd ..

        if [ $RESTORE_STATUS -eq 0 ]; then
            touch data/.restored
            echo "✅ Data and config restoration complete"
        else
            echo "⚠️  Restoration had issues, continuing anyway..."
        fi
    else
        echo "⏭️  Data already restored, skipping..."
    fi
fi

# ============================================
# 复制默认配置（仅当配置不存在时）
# 如果从 WebDAV 恢复了配置，则不会覆盖
# ============================================
if [ ! -e "config/config.yaml" ]; then
    echo "📋 Config not found, copying from defaults: config.yaml"
    cp -r "default/config.yaml" "config/config.yaml"
fi

# 修改配置以适配 HuggingFace（端口 7860）
if [ -f "config/config.yaml" ]; then
    # 只在端口还是 8000 时修改，避免覆盖用户设置
    grep -q "port: 8000" config/config.yaml && sed -i 's/port: 8000/port: 7860/' config/config.yaml 2>/dev/null || true
fi

# Execute postinstall to auto-populate config.yaml with missing values
npm run postinstall

# ============================================
# 启动备份同步服务（后台运行）
# ============================================
if [ -f "backup-sync/config.json" ]; then
    echo "🔄 Starting backup sync service..."
    echo "   监控目录: data/ 和 config/"
    cd backup-sync
    node sync.js &
    BACKUP_PID=$!
    echo "✅ Backup sync started (PID: $BACKUP_PID)"
    cd ..
else
    echo "⚠️  No backup config found, skipping backup service"
    echo "   To enable backup, set WEBDAV_URL, WEBDAV_USERNAME, WEBDAV_PASSWORD environment variables"
fi

# ============================================
# 启动主服务
# ============================================
echo ""
echo "🌐 Starting SillyTavern server on port 7860..."
echo "📝 配置文件修改会自动同步到 WebDAV"
exec node server.js --listen
