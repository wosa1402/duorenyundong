#!/usr/bin/env node
/**
 * SillyTavern 数据恢复脚本
 * 从 WebDAV 下载备份数据到本地
 * 优化版：并发下载 + 跳过 default-user
 */

const { createClient } = require('webdav');
const fs = require('fs');
const path = require('path');

// 加载配置
const configPath = process.env.SYNC_CONFIG || path.join(__dirname, 'config.json');
let config;

try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
    console.error('❌ 无法读取配置文件:', configPath);
    process.exit(1);
}

// WebDAV 客户端
const webdavClient = createClient(config.webdav.url, {
    username: config.webdav.username,
    password: config.webdav.password,
});

const localDataDir = path.resolve(config.watchDir || '../data');
const remoteBasePath = config.webdav.remotePath || '/';

// 并发控制
const CONCURRENCY = config.restoreConcurrency || 50; // 默认 50 个并发

// 统计
const stats = {
    downloaded: 0,
    skipped: 0,
    errors: 0,
    total: 0,
};

/**
 * 确保本地目录存在
 */
function ensureLocalDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * 检查是否应该忽略
 */
function shouldIgnore(relativePath) {
    // 始终忽略 default-user 目录
    if (relativePath.startsWith('default-user/') || relativePath === 'default-user') {
        return true;
    }

    const ignorePatterns = config.ignorePatterns || [];
    for (const pattern of ignorePatterns) {
        if (relativePath.includes(pattern)) {
            return true;
        }
    }

    return false;
}

/**
 * 收集所有需要下载的文件
 */
async function collectFiles(remotePath, files = []) {
    try {
        const items = await webdavClient.getDirectoryContents(remotePath);

        for (const item of items) {
            const itemRemotePath = item.filename;
            const relativePath = itemRemotePath.replace(remoteBasePath, '').replace(/^\//, '');

            // 检查是否应该忽略
            if (shouldIgnore(relativePath)) {
                continue;
            }

            if (item.type === 'directory') {
                // 递归收集子目录
                await collectFiles(itemRemotePath, files);
            } else {
                // 添加到文件列表
                files.push({
                    remotePath: itemRemotePath,
                    localPath: path.join(localDataDir, relativePath),
                    relativePath: relativePath,
                });
            }
        }
    } catch (error) {
        console.error(`❌ 读取目录失败: ${remotePath}`, error.message);
        stats.errors++;
    }

    return files;
}

/**
 * 下载单个文件（不检查时间戳，直接下载）
 */
async function downloadFile(fileInfo) {
    const { remotePath, localPath, relativePath } = fileInfo;

    try {
        // 确保目录存在
        ensureLocalDir(localPath);

        // 下载文件
        const content = await webdavClient.getFileContents(remotePath);
        fs.writeFileSync(localPath, Buffer.from(content));

        stats.downloaded++;

        // 每下载 20 个文件打印一次进度
        if (stats.downloaded % 20 === 0) {
            console.log(`📊 进度: ${stats.downloaded}/${stats.total}`);
        }
    } catch (error) {
        console.error(`❌ 下载失败: ${relativePath}`, error.message);
        stats.errors++;
    }
}

/**
 * 并发下载文件
 */
async function downloadFilesInParallel(files) {
    const chunks = [];

    // 将文件分成多个批次
    for (let i = 0; i < files.length; i += CONCURRENCY) {
        chunks.push(files.slice(i, i + CONCURRENCY));
    }

    // 逐批并发下载
    for (const chunk of chunks) {
        await Promise.all(chunk.map(file => downloadFile(file)));
    }
}

/**
 * 测试连接
 */
async function testConnection() {
    try {
        console.log('🔗 测试 WebDAV 连接...');
        const exists = await webdavClient.exists(remoteBasePath);
        if (!exists) {
            console.log('⚠️  远程备份目录不存在，无需恢复');
            return false;
        }
        console.log('✅ WebDAV 连接成功');
        return true;
    } catch (error) {
        console.error('❌ WebDAV 连接失败:', error.message);
        return false;
    }
}

/**
 * 主函数
 */
async function main() {
    const startTime = Date.now();

    console.log('📥 SillyTavern 数据恢复脚本 (优化版)');
    console.log(`🌐 WebDAV: ${config.webdav.url}${remoteBasePath}`);
    console.log(`📁 本地目录: ${localDataDir}`);
    console.log(`⚡ 并发数: ${CONCURRENCY}`);
    console.log('');

    // 测试连接
    const connected = await testConnection();
    if (!connected) {
        process.exit(0);
    }

    // 确保本地数据目录存在
    if (!fs.existsSync(localDataDir)) {
        fs.mkdirSync(localDataDir, { recursive: true });
    }

    console.log('🔍 扫描远程文件...');
    const files = await collectFiles(remoteBasePath);
    stats.total = files.length;

    if (files.length === 0) {
        console.log('⚠️  没有找到需要恢复的文件');
        process.exit(0);
    }

    console.log(`📊 发现 ${files.length} 个文件需要下载`);
    console.log('🔄 开始并发下载...');
    console.log('');

    // 并发下载
    await downloadFilesInParallel(files);

    // 打印统计
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('');
    console.log('📊 恢复完成:');
    console.log(`   已下载: ${stats.downloaded} 个文件`);
    console.log(`   错误数: ${stats.errors}`);
    console.log(`   耗时: ${duration} 秒`);
}

main().catch((error) => {
    console.error('❌ 恢复失败:', error);
    process.exit(1);
});
