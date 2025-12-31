#!/usr/bin/env node
/**
 * SillyTavern 数据恢复脚本
 * 从 WebDAV 下载备份数据到本地
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

// 统计
const stats = {
    downloaded: 0,
    skipped: 0,
    errors: 0,
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
 * 递归下载目录
 */
async function downloadDirectory(remotePath, localPath) {
    try {
        const items = await webdavClient.getDirectoryContents(remotePath);

        for (const item of items) {
            const itemRemotePath = item.filename;
            const relativePath = itemRemotePath.replace(remoteBasePath, '').replace(/^\//, '');
            const itemLocalPath = path.join(localPath, relativePath);

            // 检查是否应该忽略
            if (shouldIgnore(relativePath)) {
                console.log(`⏭️  忽略: ${relativePath}`);
                continue;
            }

            if (item.type === 'directory') {
                // 递归下载子目录
                await downloadDirectory(itemRemotePath, localPath);
            } else {
                // 下载文件
                await downloadFile(itemRemotePath, itemLocalPath);
            }
        }
    } catch (error) {
        console.error(`❌ 读取目录失败: ${remotePath}`, error.message);
        stats.errors++;
    }
}

/**
 * 下载单个文件
 */
async function downloadFile(remotePath, localPath) {
    try {
        // 检查本地文件是否已存在且相同
        if (fs.existsSync(localPath)) {
            const localStat = fs.statSync(localPath);
            const remoteInfo = await webdavClient.stat(remotePath);

            // 如果本地文件更新，跳过
            if (localStat.mtime >= new Date(remoteInfo.lastmod)) {
                stats.skipped++;
                if (config.verbose) {
                    console.log(`⏭️  本地较新，跳过: ${path.basename(localPath)}`);
                }
                return;
            }
        }

        // 确保目录存在
        ensureLocalDir(localPath);

        // 下载文件
        const content = await webdavClient.getFileContents(remotePath);
        fs.writeFileSync(localPath, Buffer.from(content));

        stats.downloaded++;
        console.log(`✅ 已下载: ${remotePath.replace(remoteBasePath, '')}`);
    } catch (error) {
        console.error(`❌ 下载失败: ${remotePath}`, error.message);
        stats.errors++;
    }
}

/**
 * 检查是否应该忽略
 */
function shouldIgnore(relativePath) {
    const ignorePatterns = config.ignorePatterns || [];

    for (const pattern of ignorePatterns) {
        if (relativePath.includes(pattern)) {
            return true;
        }
    }

    return false;
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
    console.log('📥 SillyTavern 数据恢复脚本');
    console.log(`🌐 WebDAV: ${config.webdav.url}${remoteBasePath}`);
    console.log(`📁 本地目录: ${localDataDir}`);
    console.log('');

    // 测试连接
    const connected = await testConnection();
    if (!connected) {
        process.exit(0); // 远程目录不存在时正常退出
    }

    // 确保本地数据目录存在
    if (!fs.existsSync(localDataDir)) {
        fs.mkdirSync(localDataDir, { recursive: true });
    }

    console.log('🔄 开始恢复数据...');
    console.log('');

    // 开始下载
    await downloadDirectory(remoteBasePath, localDataDir);

    // 打印统计
    console.log('');
    console.log('📊 恢复完成:');
    console.log(`   已下载: ${stats.downloaded} 个文件`);
    console.log(`   已跳过: ${stats.skipped} 个文件`);
    console.log(`   错误数: ${stats.errors}`);
}

main().catch((error) => {
    console.error('❌ 恢复失败:', error);
    process.exit(1);
});
