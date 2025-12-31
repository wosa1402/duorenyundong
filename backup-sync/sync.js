#!/usr/bin/env node
/**
 * SillyTavern 实时备份同步脚本
 * 监控 data 和 config 目录的文件变化，实时同步到 WebDAV
 */

const chokidar = require('chokidar');
const { createClient } = require('webdav');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 加载配置
const configPath = process.env.SYNC_CONFIG || path.join(__dirname, 'config.json');
let config;

try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
    console.error('❌ 无法读取配置文件:', configPath);
    console.error('请复制 config.example.json 为 config.json 并填写配置');
    process.exit(1);
}

// WebDAV 客户端
const webdavClient = createClient(config.webdav.url, {
    username: config.webdav.username,
    password: config.webdav.password,
});

// 防抖队列 - 避免频繁上传
const uploadQueue = new Map();
const DEBOUNCE_MS = config.debounceMs || 2000; // 默认 2 秒防抖

// 文件哈希缓存 - 避免重复上传
const fileHashCache = new Map();

// 统计信息
const stats = {
    uploaded: 0,
    skipped: 0,
    errors: 0,
    startTime: Date.now(),
};

/**
 * 计算文件 MD5 哈希
 */
function getFileHash(filePath) {
    try {
        const content = fs.readFileSync(filePath);
        return crypto.createHash('md5').update(content).digest('hex');
    } catch {
        return null;
    }
}

/**
 * 检查文件是否需要上传
 */
function shouldUpload(filePath) {
    const currentHash = getFileHash(filePath);
    if (!currentHash) return false;

    const cachedHash = fileHashCache.get(filePath);
    if (cachedHash === currentHash) {
        return false; // 内容未变化
    }

    fileHashCache.set(filePath, currentHash);
    return true;
}

/**
 * 获取相对路径（用于 WebDAV 远程路径）
 */
function getRelativePath(filePath) {
    const baseDir = path.resolve(config.watchDir);
    const relative = path.relative(baseDir, filePath);
    return relative;
}

/**
 * 确保远程目录存在
 */
async function ensureRemoteDir(remotePath) {
    const dir = path.dirname(remotePath);
    if (dir === '.' || dir === '/') return;

    const parts = dir.split('/').filter(Boolean);
    let currentPath = config.webdav.remotePath || '/';

    for (const part of parts) {
        currentPath = path.posix.join(currentPath, part);
        try {
            const exists = await webdavClient.exists(currentPath);
            if (!exists) {
                await webdavClient.createDirectory(currentPath);
                console.log(`📁 创建远程目录: ${currentPath}`);
            }
        } catch (error) {
            // 目录可能已存在，忽略错误
        }
    }
}

/**
 * 上传文件到 WebDAV
 */
async function uploadFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            console.log(`⏭️  文件已删除，跳过: ${filePath}`);
            return;
        }

        if (!shouldUpload(filePath)) {
            stats.skipped++;
            if (config.verbose) {
                console.log(`⏭️  内容未变化，跳过: ${filePath}`);
            }
            return;
        }

        const relativePath = getRelativePath(filePath);
        const remotePath = path.posix.join(config.webdav.remotePath || '/', relativePath);

        // 确保远程目录存在
        await ensureRemoteDir(relativePath);

        // 读取并上传文件
        const content = fs.readFileSync(filePath);
        await webdavClient.putFileContents(remotePath, content, { overwrite: true });

        stats.uploaded++;
        console.log(`✅ 已同步: ${relativePath} → ${remotePath}`);
    } catch (error) {
        stats.errors++;
        console.error(`❌ 上传失败: ${filePath}`, error.message);
    }
}

/**
 * 删除远程文件
 */
async function deleteRemoteFile(filePath) {
    if (!config.syncDelete) return;

    try {
        const relativePath = getRelativePath(filePath);
        const remotePath = path.posix.join(config.webdav.remotePath || '/', relativePath);

        const exists = await webdavClient.exists(remotePath);
        if (exists) {
            await webdavClient.deleteFile(remotePath);
            console.log(`🗑️  已删除远程文件: ${remotePath}`);
        }

        // 清除哈希缓存
        fileHashCache.delete(filePath);
    } catch (error) {
        console.error(`❌ 删除远程文件失败: ${filePath}`, error.message);
    }
}

/**
 * 防抖处理文件变化
 */
function queueUpload(filePath) {
    // 清除之前的定时器
    if (uploadQueue.has(filePath)) {
        clearTimeout(uploadQueue.get(filePath));
    }

    // 设置新的定时器
    const timer = setTimeout(async () => {
        uploadQueue.delete(filePath);
        await uploadFile(filePath);
    }, DEBOUNCE_MS);

    uploadQueue.set(filePath, timer);
}

/**
 * 初始全量同步
 */
async function initialSync() {
    if (!config.initialSync) {
        console.log('⏭️  跳过初始同步（配置中已禁用）');
        return;
    }

    console.log('🔄 开始初始全量同步...');

    const walkDir = (dir) => {
        const files = [];
        const items = fs.readdirSync(dir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = path.join(dir, item.name);

            // 检查是否应该忽略
            const relativePath = getRelativePath(fullPath);
            if (shouldIgnore(relativePath)) continue;

            if (item.isDirectory()) {
                files.push(...walkDir(fullPath));
            } else if (item.isFile()) {
                files.push(fullPath);
            }
        }

        return files;
    };

    const files = walkDir(path.resolve(config.watchDir));
    console.log(`📊 发现 ${files.length} 个文件需要检查`);

    let synced = 0;
    for (const file of files) {
        await uploadFile(file);
        synced++;
        if (synced % 50 === 0) {
            console.log(`📊 进度: ${synced}/${files.length}`);
        }
    }

    console.log('✅ 初始同步完成');
}

/**
 * 检查是否应该忽略文件
 */
function shouldIgnore(relativePath) {
    const ignorePatterns = config.ignorePatterns || [];

    for (const pattern of ignorePatterns) {
        if (typeof pattern === 'string') {
            // 简单字符串匹配
            if (relativePath.includes(pattern)) return true;
        } else if (pattern instanceof RegExp) {
            if (pattern.test(relativePath)) return true;
        }
    }

    return false;
}

/**
 * 测试 WebDAV 连接
 */
async function testConnection() {
    try {
        console.log('🔗 测试 WebDAV 连接...');
        const exists = await webdavClient.exists(config.webdav.remotePath || '/');
        if (!exists) {
            // 尝试创建根目录
            await webdavClient.createDirectory(config.webdav.remotePath || '/');
        }
        console.log('✅ WebDAV 连接成功');
        return true;
    } catch (error) {
        console.error('❌ WebDAV 连接失败:', error.message);
        return false;
    }
}

/**
 * 打印统计信息
 */
function printStats() {
    const runtime = Math.floor((Date.now() - stats.startTime) / 1000);
    console.log('\n📊 统计信息:');
    console.log(`   运行时间: ${runtime} 秒`);
    console.log(`   已上传: ${stats.uploaded} 个文件`);
    console.log(`   已跳过: ${stats.skipped} 个文件`);
    console.log(`   错误数: ${stats.errors}`);
}

/**
 * 主函数
 */
async function main() {
    console.log('🚀 SillyTavern 实时备份同步脚本');
    console.log(`📁 监控目录: ${path.resolve(config.watchDir)}`);
    console.log(`🌐 WebDAV: ${config.webdav.url}${config.webdav.remotePath || '/'}`);
    console.log('');

    // 测试连接
    const connected = await testConnection();
    if (!connected) {
        process.exit(1);
    }

    // 初始同步
    await initialSync();

    // 设置文件监控
    const watchPath = path.resolve(config.watchDir);
    const watcher = chokidar.watch(watchPath, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
            stabilityThreshold: 1000,
            pollInterval: 100,
        },
        ignored: (filePath) => {
            const relativePath = getRelativePath(filePath);
            return shouldIgnore(relativePath);
        },
    });

    // 监听文件变化事件
    watcher
        .on('add', (filePath) => {
            console.log(`📝 新文件: ${getRelativePath(filePath)}`);
            queueUpload(filePath);
        })
        .on('change', (filePath) => {
            console.log(`📝 文件修改: ${getRelativePath(filePath)}`);
            queueUpload(filePath);
        })
        .on('unlink', (filePath) => {
            console.log(`🗑️  文件删除: ${getRelativePath(filePath)}`);
            deleteRemoteFile(filePath);
        })
        .on('error', (error) => {
            console.error('❌ 监控错误:', error.message);
        })
        .on('ready', () => {
            console.log('');
            console.log('👀 开始监控文件变化...');
            console.log('   按 Ctrl+C 停止');
            console.log('');
        });

    // 优雅退出
    process.on('SIGINT', () => {
        console.log('\n⏹️  正在停止...');
        printStats();
        watcher.close();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        watcher.close();
        process.exit(0);
    });

    // 定期打印统计
    if (config.statsInterval) {
        setInterval(printStats, config.statsInterval * 1000);
    }
}

main().catch((error) => {
    console.error('❌ 启动失败:', error);
    process.exit(1);
});
