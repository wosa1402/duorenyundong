/**
 * 用户心跳机制
 * 定期向服务器发送心跳信号，确保在线状态统计的准确性
 */

class UserHeartbeat {
    constructor() {
        this.heartbeatInterval = null;
        this.isActive = false;
        this.lastActivity = Date.now();
        this.heartbeatIntervalMs = 2 * 60 * 1000; // 2分钟
        this.inactivityThreshold = 5 * 60 * 1000; // 5分钟无活动则暂停心跳

        // 绑定页面活动监听器
        this.bindActivityListeners();

        // 绑定页面可见性变化监听器
        this.bindVisibilityListeners();

        // 绑定页面关闭监听器
        this.bindBeforeUnloadListener();
    }

    /**
     * 开始心跳
     */
    start() {
        if (this.heartbeatInterval) {
            return; // 已经在运行
        }

        console.log('User heartbeat started');
        this.isActive = true;
        this.lastActivity = Date.now();

        // 延迟发送第一次心跳，确保CSRF token已经初始化
        setTimeout(() => {
            this.sendHeartbeat();
        }, 1000);

        // 设置定时心跳
        this.heartbeatInterval = setInterval(() => {
            this.checkAndSendHeartbeat();
        }, this.heartbeatIntervalMs);
    }

    /**
     * 停止心跳
     */
    stop() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
            console.log('User heartbeat stopped');
        }
        this.isActive = false;
    }

    /**
     * 检查是否需要发送心跳
     */
    checkAndSendHeartbeat() {
        const now = Date.now();
        const timeSinceLastActivity = now - this.lastActivity;

        // 如果用户长时间无活动，暂停心跳
        if (timeSinceLastActivity > this.inactivityThreshold) {
            console.log('User inactive, skipping heartbeat');
            return;
        }

        // 如果页面不可见，也暂停心跳
        if (document.hidden) {
            console.log('Page hidden, skipping heartbeat');
            return;
        }

        this.sendHeartbeat();
    }

    /**
     * 发送心跳到服务器
     */
    async sendHeartbeat() {
        try {
            const response = await fetch('/api/users/heartbeat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.getRequestHeaders()
                },
                body: JSON.stringify({
                    timestamp: Date.now(),
                    userAgent: navigator.userAgent
                })
            });

            if (response.ok) {
                // 心跳发送成功
            } else if (response.status === 401 || response.status === 403) {
                // 用户未认证或权限不足，停止心跳
                console.log('User session ended, stopping heartbeat');
                this.stop();
            }
        } catch (error) {
            // 网络错误，继续尝试
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                // 网络连接问题，暂时停止心跳
                this.stop();
            }
        }
    }

    /**
     * 获取请求头
     */
    getRequestHeaders() {
        // 优先尝试使用全局的getRequestHeaders函数
        if (window.getRequestHeaders && typeof window.getRequestHeaders === 'function') {
            try {
                return window.getRequestHeaders();
            } catch (e) {
                // 降级到手动构建
            }
        }

        // 降级方案：手动构建headers
        const headers = { 'Content-Type': 'application/json' };
        let csrfToken = null;

        // 尝试多种方式获取CSRF token
        if (window.csrfToken) {
            csrfToken = window.csrfToken;
        } else if (window.token) {
            csrfToken = window.token;
        } else {
            // 从meta标签获取
            const metaTag = document.querySelector('meta[name="csrf-token"]');
            if (metaTag) {
                csrfToken = metaTag.getAttribute('content');
            }
        }

        if (csrfToken) {
            headers['x-csrf-token'] = csrfToken;
            headers['X-CSRF-Token'] = csrfToken;
        }

        return headers;
    }

    /**
     * 记录用户活动
     */
    recordActivity() {
        this.lastActivity = Date.now();

        // 如果心跳已停止但用户又开始活动，重新启动心跳
        if (!this.isActive && !this.heartbeatInterval) {
            this.start();
        }
    }

    /**
     * 绑定用户活动监听器
     */
    bindActivityListeners() {
        const activityEvents = [
            'click', 'keydown', 'keyup', 'mousemove', 'mousedown',
            'mouseup', 'scroll', 'touchstart', 'touchend'
        ];

        // 使用节流来避免过于频繁的活动记录
        const throttledRecordActivity = this.throttle(() => {
            this.recordActivity();
        }, 1000); // 1秒内最多记录一次活动

        activityEvents.forEach(event => {
            document.addEventListener(event, throttledRecordActivity, { passive: true });
        });
    }

    /**
     * 绑定页面可见性变化监听器
     */
    bindVisibilityListeners() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // 页面隐藏时暂停心跳活动记录
                this.lastActivity = Date.now() - this.inactivityThreshold + 60000; // 留1分钟缓冲
            } else {
                // 页面重新可见时恢复活动
                this.recordActivity();

                // 页面重新可见时，立即发送一次心跳
                if (this.isActive) {
                    this.sendHeartbeat();
                }
            }
        });
    }

    /**
     * 绑定页面关闭监听器
     */
    bindBeforeUnloadListener() {
        window.addEventListener('beforeunload', () => {
            // 页面关闭时停止心跳
            this.stop();
        });
    }

    /**
     * 节流函数
     */
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
}

// 全局心跳实例
let userHeartbeat = null;

/**
 * 初始化用户心跳
 */
function initUserHeartbeat() {
    if (!userHeartbeat) {
        userHeartbeat = new UserHeartbeat();
    }
    return userHeartbeat;
}

/**
 * 启动用户心跳（仅在用户已登录时）
 */
function startUserHeartbeat() {
    // 检查用户是否已登录 - 多种方式检测
    const checkLoginStatus = () => {
        return (typeof window !== 'undefined' &&
            (window.currentUser ||
             document.querySelector('#logout_button') ||
             document.querySelector('#account_controls') ||
             document.querySelector('#admin_button')));
    };

    const attemptStart = (attempt = 1) => {
        const isLoggedIn = checkLoginStatus();

        if (isLoggedIn) {
            const heartbeat = initUserHeartbeat();
            heartbeat.start();
            return true;
        } else if (attempt < 5) {
            // 最多重试5次，每次延迟递增
            setTimeout(() => attemptStart(attempt + 1), attempt * 1000);
        }
        return false;
    };

    attemptStart();
}

/**
 * 停止用户心跳
 */
function stopUserHeartbeat() {
    if (userHeartbeat) {
        userHeartbeat.stop();
    }
}

// 页面加载完成后自动启动心跳
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // 延迟启动，确保其他脚本已加载和CSRF token初始化
            setTimeout(startUserHeartbeat, 3000);
        });
    } else {
        // 页面已加载完成，延迟更长时间确保所有脚本初始化完成
        setTimeout(startUserHeartbeat, 5000);
    }
}

// 导出函数供其他脚本使用
if (typeof window !== 'undefined') {
    window.userHeartbeat = {
        init: initUserHeartbeat,
        start: startUserHeartbeat,
        stop: stopUserHeartbeat,
        instance: () => userHeartbeat,
        forceStart: () => {
            console.log('Force starting user heartbeat...');
            const heartbeat = initUserHeartbeat();
            heartbeat.start();
            return heartbeat;
        },
    };
}
