import express from 'express';
import { isEmailServiceAvailable } from '../email-service.js';

export const router = express.Router();

/**
 * 检查邮件服务是否启用（公开接口，无需认证）
 */
router.get('/status', async (request, response) => {
    try {
        const enabled = isEmailServiceAvailable();
        return response.json({ enabled });
    } catch (error) {
        console.error('Get email status failed:', error);
        return response.json({ enabled: false });
    }
});

