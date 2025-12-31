#!/bin/sh

# ============================================
# SillyTavern + 实时备份同步 启动脚本
# 用于 Hugging Face Space 部署
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
    "debounceMs": 2000,
    "initialSync": false,
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
EOF
    echo "✅ Backup config generated"
fi

# ============================================
# 从 WebDAV 恢复数据（如果配置存在且数据未恢复）
# ============================================
if [ -f "backup-sync/config.json" ]; then
    if [ ! -f "data/.restored" ]; then
        echo "📥 Restoring data from WebDAV..."
        cd backup-sync
        node restore.js
        RESTORE_STATUS=$?
        cd ..

        if [ $RESTORE_STATUS -eq 0 ]; then
            touch data/.restored
            echo "✅ Data restoration complete"
        else
            echo "⚠️  Data restoration had issues, continuing anyway..."
        fi
    else
        echo "⏭️  Data already restored, skipping..."
    fi
fi

# ============================================
# 复制默认配置（如果不存在）
# ============================================
if [ ! -e "config/config.yaml" ]; then
    echo "📋 Resource not found, copying from defaults: config.yaml"
    cp -r "default/config.yaml" "config/config.yaml"
fi

# 修改配置以适配 HuggingFace（端口 7860）
if [ -f "config/config.yaml" ]; then
    sed -i 's/port: 8000/port: 7860/' config/config.yaml 2>/dev/null || true
fi

# Execute postinstall to auto-populate config.yaml with missing values
npm run postinstall

# ============================================
# 启动备份同步服务（后台运行）
# ============================================
if [ -f "backup-sync/config.json" ]; then
    echo "🔄 Starting backup sync service..."
    cd backup-sync
    node sync.js &
    BACKUP_PID=$!
    echo "✅ Backup sync started (PID: $BACKUP_PID)"
    cd ..
else
    echo "⚠️  No backup config found, skipping backup service"
    echo "   To enable backup, set WEBDAV_URL, WEBDAV_USERNAME, WEBDAV_PASSWORD environment variables"
    echo "   Or create backup-sync/config.json manually"
fi

# ============================================
# 启动主服务
# ============================================
echo ""
echo "🌐 Starting SillyTavern server on port 7860..."
exec node server.js --listen
