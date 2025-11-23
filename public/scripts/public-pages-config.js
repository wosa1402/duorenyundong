/**
 * 公共页面配置管理
 * 根据服务器配置动态控制页面链接的显示
 */

let publicPagesConfig = {
    enablePublicCharacters: true,
    enableForum: true
};

/**
 * 获取公共页面配置
 */
async function fetchPublicPagesConfig() {
    try {
        const response = await fetch('/api/public-config/public-pages', {
            method: 'GET',
            credentials: 'include'
        });

        if (response.ok) {
            const config = await response.json();
            publicPagesConfig = config;
            return config;
        } else {
            console.warn('Failed to fetch public pages config, using defaults');
            return publicPagesConfig;
        }
    } catch (error) {
        console.warn('Error fetching public pages config:', error);
        return publicPagesConfig;
    }
}

/**
 * 根据配置隐藏或显示页面链接
 */
function updatePageLinks() {
    // 更新角色卡分享链接
    const publicCharactersLinks = document.querySelectorAll('a[href="/public-characters"], #publicCharactersLink');
    publicCharactersLinks.forEach(link => {
        if (!publicPagesConfig.enablePublicCharacters) {
            link.style.display = 'none';
        } else {
            link.style.display = '';
        }
    });

    // 更新论坛链接
    const forumLinks = document.querySelectorAll('a[href="/forum"], #forumLink');
    forumLinks.forEach(link => {
        if (!publicPagesConfig.enableForum) {
            link.style.display = 'none';
        } else {
            link.style.display = '';
        }
    });
}

/**
 * 初始化公共页面配置
 */
async function initPublicPagesConfig() {
    await fetchPublicPagesConfig();
    updatePageLinks();
}

// 当DOM加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPublicPagesConfig);
} else {
    initPublicPagesConfig();
}

// 导出函数供其他脚本使用
window.publicPagesConfig = {
    fetch: fetchPublicPagesConfig,
    update: updatePageLinks,
    init: initPublicPagesConfig,
    getConfig: () => publicPagesConfig
};
