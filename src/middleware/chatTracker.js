import systemMonitor from '../system-monitor.js';

/**
 * 聊天消息跟踪中间件
 * 用于监听和记录用户的聊天活动
 */
export default function chatTrackerMiddleware() {
    return (request, response, next) => {
        // 监听聊天相关的API请求
        const chatEndpoints = [
            '/api/chats/save',
            '/api/chats/group/save',
            '/api/backends/chat-completions/generate',
            '/api/backends/text-completions/generate',
            '/api/generate',
            '/api/openai/generate'
        ];

        const isChatEndpoint = chatEndpoints.some(endpoint =>
            request.path === endpoint ||
            request.path.includes('/generate') ||
            request.path.includes('/save')
        );

        if (!isChatEndpoint) {
            return next();
        }

        // 获取用户信息
        const userHandle = request.user?.profile?.handle || 'anonymous';

        // 重写响应方法来捕获聊天数据
        const originalSend = response.send;
        const originalJson = response.json;

        function trackChatActivity() {
            if (response.chatTracked) return; // 防止重复记录
            response.chatTracked = true;

            try {
                // 根据不同的端点类型处理
                if (request.path === '/api/chats/save' && request.method === 'POST') {
                    // 单人聊天保存
                    const chatData = request.body.chat;
                    if (chatData && Array.isArray(chatData)) {
                        // 调试日志
                        if (process.env.NODE_ENV === 'development') {
                            console.log(`追踪到聊天保存: ${chatData.length} 条消息`);
                        }
                        chatData.forEach(message => {
                            if (message.mes && message.send_date) {
                                const messageType = message.is_user ? 'user' : 'character';
                                const messageData = {
                                    content: message.mes,
                                    characterName: message.name || '未知角色',
                                    timestamp: new Date(message.send_date).getTime()
                                };

                                systemMonitor.recordUserChatActivity(userHandle, messageType, messageData);
                            }
                        });
                    }
                } else if (request.path === '/api/chats/group/save' && request.method === 'POST') {
                    // 群聊保存
                    const chatData = request.body.chat;
                    if (chatData && Array.isArray(chatData)) {
                        // 调试日志
                        if (process.env.NODE_ENV === 'development') {
                            console.log(`追踪到群聊保存: ${chatData.length} 条消息`);
                        }
                        chatData.forEach(message => {
                            if (message.mes && message.send_date) {
                                const messageType = message.is_user ? 'user' : 'character';
                                const messageData = {
                                    content: message.mes,
                                    characterName: message.name || '群聊',
                                    timestamp: new Date(message.send_date).getTime()
                                };

                                systemMonitor.recordUserChatActivity(userHandle, messageType, messageData);
                            }
                        });
                    }
                } else if (request.path.includes('/generate') && request.method === 'POST') {
                    // AI生成响应 - 记录生成请求
                    if (response.statusCode === 200) {
                        let userMessage = '';
                        let characterName = '未知角色';

                        // 尝试从不同的请求格式中提取消息内容
                        if (request.body.messages && Array.isArray(request.body.messages)) {
                            const lastMessage = request.body.messages[request.body.messages.length - 1];
                            userMessage = lastMessage?.content || lastMessage?.text || '';
                        } else if (request.body.prompt) {
                            userMessage = request.body.prompt;
                        } else if (request.body.text) {
                            userMessage = request.body.text;
                        }

                        if (request.body.character_name) {
                            characterName = request.body.character_name;
                        } else if (request.body.name) {
                            characterName = request.body.name;
                        }

                        if (userMessage) {
                            const requestData = {
                                content: userMessage,
                                characterName: characterName,
                                timestamp: Date.now(),
                                isGeneration: true
                            };

                            systemMonitor.recordUserChatActivity(userHandle, 'user', requestData);
                        }
                    }
                }
            } catch (error) {
                console.error('聊天跟踪错误:', error);
            }
        }

        // 重写response.send方法
        response.send = function(body) {
            trackChatActivity();
            return originalSend.call(this, body);
        };

        // 重写response.json方法
        response.json = function(obj) {
            trackChatActivity();
            return originalJson.call(this, obj);
        };

        // 监听响应完成事件
        response.on('finish', trackChatActivity);
        response.on('close', trackChatActivity);

        next();
    };
}

/**
 * 手动记录聊天消息
 * 可以在其他地方调用来记录聊天活动
 * @param {string} userHandle 用户句柄
 * @param {string} messageType 消息类型
 * @param {Object} messageData 消息数据
 */
export function recordChatMessage(userHandle, messageType, messageData) {
    try {
        systemMonitor.recordUserChatActivity(userHandle, messageType, messageData);
    } catch (error) {
        console.error('记录聊天消息失败:', error);
    }
}

/**
 * 批量记录聊天历史
 * 用于导入现有的聊天记录
 * @param {string} userHandle 用户句柄
 * @param {Array} chatHistory 聊天历史数组
 */
export function recordChatHistory(userHandle, chatHistory) {
    try {
        if (!Array.isArray(chatHistory)) return;

        chatHistory.forEach(message => {
            if (message.mes && message.send_date) {
                const messageType = message.is_user ? 'user' : 'character';
                const messageData = {
                    content: message.mes,
                    characterName: message.name || 'Unknown',
                    timestamp: new Date(message.send_date).getTime(),

                };

                systemMonitor.recordUserChatActivity(userHandle, messageType, messageData);
            }
        });

        console.log(`为用户 ${userHandle} 导入了 ${chatHistory.length} 条聊天记录`);
    } catch (error) {
        console.error('导入聊天历史失败:', error);
    }
}
