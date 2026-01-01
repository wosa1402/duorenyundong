/**
 * 动态配置管理 API
 * 允许管理员在运行时修改系统配置
 */

import express from 'express';
import { getAllDynamicConfig, setDynamicConfigBatch } from '../dynamic-config.js';
import { requireAdminMiddleware } from '../users.js';

export const router = express.Router();

/**
 * 获取当前动态配置
 * GET /api/dynamic-config
 */
router.get('/', requireAdminMiddleware, async (request, response) => {
    try {
        const config = getAllDynamicConfig();
        return response.json(config);
    } catch (error) {
        console.error('Failed to get dynamic config:', error);
        return response.status(500).json({ error: 'Failed to get config' });
    }
});

/**
 * 更新动态配置
 * POST /api/dynamic-config
 * Body: { key: value, ... }
 */
router.post('/', requireAdminMiddleware, async (request, response) => {
    try {
        const config = request.body;

        if (!config || typeof config !== 'object') {
            return response.status(400).json({ error: 'Invalid config format' });
        }

        // 验证配置键
        const allowedKeys = [
            'enableInvitationCodes',
            'enableDiscreetLogin',
            'enableForum',
            'enablePublicCharacters',
        ];

        const filteredConfig = {};
        for (const key of allowedKeys) {
            if (key in config) {
                filteredConfig[key] = Boolean(config[key]);
            }
        }

        if (Object.keys(filteredConfig).length === 0) {
            return response.status(400).json({ error: 'No valid config keys provided' });
        }

        await setDynamicConfigBatch(filteredConfig);

        return response.json({
            success: true,
            updated: filteredConfig,
        });
    } catch (error) {
        console.error('Failed to update dynamic config:', error);
        return response.status(500).json({ error: 'Failed to update config' });
    }
});
