#!/usr/bin/env node
/**
 * SillyTavern 实时备份同步脚本
 * 监控 data 和 config 目录的文件变化，实时同步到 WebDAV
 * 支持多目录监控，配置文件变更也会被备份
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

// 监控目录配置
// watchDirs 是一个数组，每个元素包含 localDir 和 remotePrefix
const watchDirs = config.watchDirs || [
    { localDir: config.watchDir || '../data', remotePrefix: 'data' }
];

// 如果配置了 watchConfigDir，添加 config 目录监控
if (config.watchConfigDir) {
    watchDirs.push({ localDir: config.watchConfigDir, remotePrefix: 'config' });
}

// 防抖队列 - 避免频繁上传
const uploadQueue = new Map();
const DEBOUNCE_MS = config.debounceMs || 2000;

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
        return false;
    }

    fileHashCache.set(filePath, currentHash);
    return true;
}

/**
 * 获取文件所属的监控目录配置
 */
function getWatchDirConfig(filePath) {
    const absPath = path.resolve(filePath);
    for (const watchDir of watchDirs) {
        const absWatchDir = path.resolve(watchDir.localDir);
        if (absPath.startsWith(absWatchDir)) {
            return watchDir;
        }
    }
    return null;
}

/**
 * 获取相对路径（包含远程前缀）
 */
function getRelativePath(filePath, watchDirConfig) {
    if (!watchDirConfig) {
        watchDirConfig = getWatchDirConfig(filePath);
    }
    if (!watchDirConfig) return null;

    const absWatchDir = path.resolve(watchDirConfig.localDir);
    const relative = path.relative(absWatchDir, filePath);
    return path.posix.join(watchDirConfig.remotePrefix, relative);
}

/**
 * 获取本地相对路径（用于日志显示）
 */
function getLocalRelativePath(filePath) {
    const watchDirConfig = getWatchDirConfig(filePath);
    if (!watchDirConfig) return filePath;

    const absWatchDir = path.resolve(watchDirConfig.localDir);
    return path.relative(absWatchDir, filePath);
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

        const watchDirConfig = getWatchDirConfig(filePath);
        if (!watchDirConfig) {
            console.log(`⏭️  文件不在监控目录内: ${filePath}`);
            return;
        }

        const relativePath = getRelativePath(filePath, watchDirConfig);
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
        if (!relativePath) return;

        const remotePath = path.posix.join(config.webdav.remotePath || '/', relativePath);

        const exists = await webdavClient.exists(remotePath);
        if (exists) {
            await webdavClient.deleteFile(remotePath);
            console.log(`🗑️  已删除远程文件: ${remotePath}`);
        }

        fileHashCache.delete(filePath);
    } catch (error) {
        console.error(`❌ 删除远程文件失败: ${filePath}`, error.message);
    }
}

/**
 * 防抖处理文件变化
 */
function queueUpload(filePath) {
    if (uploadQueue.has(filePath)) {
        clearTimeout(uploadQueue.get(filePath));
    }

    const timer = setTimeout(async () => {
        uploadQueue.delete(filePath);
        await uploadFile(filePath);
    }, DEBOUNCE_MS);

    uploadQueue.set(filePath, timer);
}

/**
 * 检查是否应该忽略文件
 */
function shouldIgnore(relativePath) {
    const ignorePatterns = config.ignorePatterns || [];

    // 始终忽略 default-user 目录
    if (relativePath.startsWith('default-user/') || relativePath === 'default-user') {
        return true;
    }

    // 忽略 data/default-user
    if (relativePath.startsWith('data/default-user')) {
        return true;
    }

    for (const pattern of ignorePatterns) {
        if (typeof pattern === 'string') {
            if (relativePath.includes(pattern)) return true;
        } else if (pattern instanceof RegExp) {
            if (pattern.test(relativePath)) return true;
        }
    }

    return false;
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

    const allFiles = [];

    for (const watchDir of watchDirs) {
        const absDir = path.resolve(watchDir.localDir);

        if (!fs.existsSync(absDir)) {
            console.log(`⚠️  目录不存在，跳过: ${absDir}`);
            continue;
        }

        const walkDir = (dir) => {
            const files = [];
            try {
                const items = fs.readdirSync(dir, { withFileTypes: true });

                for (const item of items) {
                    const fullPath = path.join(dir, item.name);
                    const relativePath = getRelativePath(fullPath, watchDir);

                    if (shouldIgnore(relativePath)) continue;

                    if (item.isDirectory()) {
                        files.push(...walkDir(fullPath));
                    } else if (item.isFile()) {
                        files.push(fullPath);
                    }
                }
            } catch (error) {
                console.error(`❌ 读取目录失败: ${dir}`, error.message);
            }
            return files;
        };

        const files = walkDir(absDir);
        allFiles.push(...files);
        console.log(`📁 ${watchDir.remotePrefix}: 发现 ${files.length} 个文件`);
    }

    console.log(`📊 共发现 ${allFiles.length} 个文件需要检查`);

    let synced = 0;
    for (const file of allFiles) {
        await uploadFile(file);
        synced++;
        if (synced % 50 === 0) {
            console.log(`📊 进度: ${synced}/${allFiles.length}`);
        }
    }

    console.log('✅ 初始同步完成');
}

/**
 * 测试 WebDAV 连接
 */
async function testConnection() {
    try {
        console.log('🔗 测试 WebDAV 连接...');
        const exists = await webdavClient.exists(config.webdav.remotePath || '/');
        if (!exists) {
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
    console.log(`🌐 WebDAV: ${config.webdav.url}${config.webdav.remotePath || '/'}`);
    console.log('📁 监控目录:');
    for (const watchDir of watchDirs) {
        console.log(`   - ${path.resolve(watchDir.localDir)} → ${watchDir.remotePrefix}/`);
    }
    console.log('');

    // 测试连接
    const connected = await testConnection();
    if (!connected) {
        process.exit(1);
    }

    // 初始同步
    await initialSync();

    // 设置文件监控（监控所有目录）
    const watchPaths = watchDirs.map(w => path.resolve(w.localDir)).filter(p => fs.existsSync(p));

    if (watchPaths.length === 0) {
        console.error('❌ 没有可监控的目录');
        process.exit(1);
    }

    const watcher = chokidar.watch(watchPaths, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
            stabilityThreshold: 1000,
            pollInterval: 100,
        },
        ignored: (filePath) => {
            const relativePath = getRelativePath(filePath);
            return relativePath ? shouldIgnore(relativePath) : false;
        },
    });

    watcher
        .on('add', (filePath) => {
            console.log(`📝 新文件: ${getLocalRelativePath(filePath)}`);
            queueUpload(filePath);
        })
        .on('change', (filePath) => {
            console.log(`📝 文件修改: ${getLocalRelativePath(filePath)}`);
            queueUpload(filePath);
        })
        .on('unlink', (filePath) => {
            console.log(`🗑️  文件删除: ${getLocalRelativePath(filePath)}`);
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

    if (config.statsInterval) {
        setInterval(printStats, config.statsInterval * 1000);
    }
}

main().catch((error) => {
    console.error('❌ 启动失败:', error);
    process.exit(1);
});
