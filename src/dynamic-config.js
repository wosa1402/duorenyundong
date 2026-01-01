/**
 * 动态配置服务
 * 允许在运行时修改配置，配置保存到 _storage 中（会同步到 WebDAV）
 */

import storage from 'node-persist';
import { getConfigValue } from './util.js';

const CONFIG_KEY = 'dynamic-config';

// 默认配置值（从 config.yaml 读取）
const defaultConfig = {
    enableInvitationCodes: getConfigValue('enableInvitationCodes', false, 'boolean'),
    enableUserAccounts: getConfigValue('enableUserAccounts', false, 'boolean'),
    enableDiscreetLogin: getConfigValue('enableDiscreetLogin', false, 'boolean'),
    enableForum: getConfigValue('enableForum', true, 'boolean'),
    enablePublicCharacters: getConfigValue('enablePublicCharacters', true, 'boolean'),
};

// 缓存动态配置
let dynamicConfig = null;

/**
 * 初始化动态配置（从存储加载）
 * @returns {Promise<void>}
 */
export async function initDynamicConfig() {
    try {
        const saved = await storage.getItem(CONFIG_KEY);
        if (saved) {
            dynamicConfig = { ...defaultConfig, ...saved };
            console.log('Dynamic config loaded from storage');
        } else {
            dynamicConfig = { ...defaultConfig };
            console.log('Using default config');
        }
    } catch (error) {
        console.error('Failed to load dynamic config:', error);
        dynamicConfig = { ...defaultConfig };
    }
}

/**
 * 获取动态配置值
 * @param {string} key 配置键
 * @returns {any} 配置值
 */
export function getDynamicConfig(key) {
    if (!dynamicConfig) {
        // 如果尚未初始化，返回默认值
        return defaultConfig[key];
    }
    return dynamicConfig[key] ?? defaultConfig[key];
}

/**
 * 获取所有动态配置
 * @returns {object} 所有配置
 */
export function getAllDynamicConfig() {
    return { ...dynamicConfig } || { ...defaultConfig };
}

/**
 * 设置动态配置值
 * @param {string} key 配置键
 * @param {any} value 配置值
 * @returns {Promise<void>}
 */
export async function setDynamicConfig(key, value) {
    if (!dynamicConfig) {
        await initDynamicConfig();
    }

    dynamicConfig[key] = value;
    await storage.setItem(CONFIG_KEY, dynamicConfig);
    console.log(`Dynamic config updated: ${key} = ${value}`);
}

/**
 * 批量设置动态配置
 * @param {object} config 配置对象
 * @returns {Promise<void>}
 */
export async function setDynamicConfigBatch(config) {
    if (!dynamicConfig) {
        await initDynamicConfig();
    }

    dynamicConfig = { ...dynamicConfig, ...config };
    await storage.setItem(CONFIG_KEY, dynamicConfig);
    console.log('Dynamic config batch updated:', Object.keys(config).join(', '));
}

/**
 * 检查邀请码功能是否启用（动态）
 * @returns {boolean}
 */
export function isInvitationCodesEnabled() {
    return getDynamicConfig('enableInvitationCodes');
}

/**
 * 检查用户账户功能是否启用（动态）
 * @returns {boolean}
 */
export function isUserAccountsEnabled() {
    return getDynamicConfig('enableUserAccounts');
}
