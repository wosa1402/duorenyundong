// 论坛页面JavaScript
let currentUser = null;
let articles = [];
let currentPage = 1;
let articlesPerPage = 12;
let currentArticle = null;

document.addEventListener('DOMContentLoaded', function() {
    initializeForum();
});

async function initializeForum() {
    try {
        // 检查用户登录状态 - 带重试机制
        await checkUserStatus();

        // 加载文章
        await loadArticles();

        // 绑定事件
        bindEvents();

    } catch (error) {
        console.error('Forum initialization error:', error);
    }
}

async function checkUserStatus(retryCount = 0) {
    const maxRetries = 3;
    const retryDelay = 500; // 毫秒

    try {
        const response = await fetch('/api/users/me', {
            credentials: 'include',
            cache: 'no-cache'
        });

        if (response.ok) {
            const user = await response.json();
            currentUser = user;
            updateUserInterface(user);
            console.log('User logged in:', user.handle);
        } else {
            // 如果是 401 且还有重试次数，则重试
            if (response.status === 401 && retryCount < maxRetries) {
                console.log(`User status check failed (attempt ${retryCount + 1}/${maxRetries + 1}), retrying...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return await checkUserStatus(retryCount + 1);
            }
            currentUser = null;
            updateUserInterface(null);
        }
    } catch (error) {
        console.error('Error checking user status:', error);
        // 如果是网络错误且还有重试次数，则重试
        if (retryCount < maxRetries) {
            console.log(`Network error (attempt ${retryCount + 1}/${maxRetries + 1}), retrying...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return await checkUserStatus(retryCount + 1);
        }
        currentUser = null;
        updateUserInterface(null);
    }
}

function updateUserInterface(user) {
    const userInfo = document.getElementById('userInfo');
    const loginPrompt = document.getElementById('loginPrompt');
    const userName = document.getElementById('userName');

    if (user) {
        // currentUser 已经在 checkUserStatus 中设置，这里只更新 UI
        userInfo.style.display = 'flex';
        loginPrompt.style.display = 'none';
        userName.textContent = user.name || user.handle;
        console.log('UI updated for logged-in user:', user.handle);
    } else {
        // currentUser 已经在 checkUserStatus 中设置为 null，这里只更新 UI
        userInfo.style.display = 'none';
        loginPrompt.style.display = 'block';
        console.log('UI updated for logged-out state');
    }
}

async function loadArticles() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const articlesGrid = document.getElementById('articlesGrid');
    const noArticles = document.getElementById('noArticles');

    try {
        loadingIndicator.style.display = 'block';
        noArticles.style.display = 'none';

        const response = await fetch('/api/forum/articles', {
            credentials: 'include'
        });
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                // 未登录或未授权：显示登录提示，不抛错
                updateUserInterface(null);
                articlesGrid.innerHTML = '<div class="error-message">请先登录后再访问论坛</div>';
                return;
            }
            throw new Error('Failed to load articles');
        }

        articles = await response.json();
        renderArticles();

    } catch (error) {
        console.error('Error loading articles:', error);
        if (String(error && error.message || '').includes('401') || String(error && error.message || '').includes('403')) {
            articlesGrid.innerHTML = '<div class="error-message">请先登录后再访问论坛</div>';
        } else {
            articlesGrid.innerHTML = '<div class="error-message">加载文章失败，请刷新页面重试</div>';
        }
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

function renderArticles() {
    const articlesGrid = document.getElementById('articlesGrid');
    const noArticles = document.getElementById('noArticles');

    if (articles.length === 0) {
        articlesGrid.innerHTML = '';
        noArticles.style.display = 'block';
        return;
    }

    noArticles.style.display = 'none';

    const startIndex = (currentPage - 1) * articlesPerPage;
    const endIndex = startIndex + articlesPerPage;
    const pageArticles = articles.slice(startIndex, endIndex);

    articlesGrid.innerHTML = pageArticles.map(article => createArticleCard(article)).join('');

    updatePagination();
}

function createArticleCard(article) {
    const excerpt = stripHtml(article.content).substring(0, 150) + '...';
    const tags = article.tags ? article.tags.map(tag => `<span class="tag">${tag}</span>`).join('') : '';
    const categoryName = getCategoryName(article.category);

    return `
        <div class="article-card" onclick="openArticleDetail('${article.id}')">
            <div class="article-header">
                <h3 class="article-title">${escapeHtml(article.title)}</h3>
                <div class="article-meta">
                    <span><i class="fa-solid fa-user"></i> ${escapeHtml(article.author.name)}</span>
                    <span><i class="fa-solid fa-calendar"></i> ${formatDate(article.created_at)}</span>
                    <span><i class="fa-solid fa-eye"></i> ${article.views || 0}</span>
                </div>
            </div>
            <div class="article-content">
                <p class="article-excerpt">${escapeHtml(excerpt)}</p>
                <div class="article-tags">${tags}</div>
            </div>
            <div class="article-footer">
                <div class="article-stats">
                    <span><i class="fa-solid fa-heart"></i> ${article.likes || 0}</span>
                    <span><i class="fa-solid fa-comment"></i> ${article.comments_count || 0}</span>
                </div>
                <span class="article-category">${categoryName}</span>
            </div>
        </div>
    `;
}

function bindEvents() {
    // 搜索功能
    const searchInput = /** @type {HTMLInputElement} */ (document.getElementById('searchInput'));
    searchInput.addEventListener('input', debounce(handleSearch, 300));

    // 筛选功能
    const categoryFilter = /** @type {HTMLSelectElement} */ (document.getElementById('categoryFilter'));
    const sortFilter = /** @type {HTMLSelectElement} */ (document.getElementById('sortFilter'));
    categoryFilter.addEventListener('change', handleFilter);
    sortFilter.addEventListener('change', handleFilter);

    // 发布文章按钮 - 移除onclick属性并绑定事件
    const publishButton = /** @type {HTMLButtonElement|null} */ (document.querySelector('button[onclick="createArticle()"]'));
    if (publishButton) {
        publishButton.removeAttribute('onclick');
        publishButton.addEventListener('click', createArticle);
    }

    // 文章表单提交
    const articleForm = /** @type {HTMLFormElement} */ (document.getElementById('articleForm'));
    articleForm.addEventListener('submit', handleArticleSubmit);
}

function handleSearch() {
    const searchTerm = /** @type {HTMLInputElement} */ (document.getElementById('searchInput')).value.toLowerCase();

    if (!searchTerm) {
        renderArticles();
        return;
    }

    const filteredArticles = articles.filter(article =>
        article.title.toLowerCase().includes(searchTerm) ||
        article.content.toLowerCase().includes(searchTerm) ||
        (article.tags && article.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
    );

    renderFilteredArticles(filteredArticles);
}

function handleFilter() {
    const category = /** @type {HTMLSelectElement} */ (document.getElementById('categoryFilter')).value;
    const sort = /** @type {HTMLSelectElement} */ (document.getElementById('sortFilter')).value;

    let filteredArticles = [...articles];

    // 分类筛选
    if (category) {
        filteredArticles = filteredArticles.filter(article => article.category === category);
    }

    // 排序
    switch (sort) {
        case 'popular':
            filteredArticles.sort((a, b) => (b.likes || 0) - (a.likes || 0));
            break;
        case 'views':
            filteredArticles.sort((a, b) => (b.views || 0) - (a.views || 0));
            break;
        default: // latest
            filteredArticles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    renderFilteredArticles(filteredArticles);
}

function renderFilteredArticles(filteredArticles) {
    const articlesGrid = document.getElementById('articlesGrid');
    const noArticles = document.getElementById('noArticles');

    if (filteredArticles.length === 0) {
        articlesGrid.innerHTML = '';
        noArticles.style.display = 'block';
        return;
    }

    noArticles.style.display = 'none';
    articlesGrid.innerHTML = filteredArticles.map(article => createArticleCard(article)).join('');
}

function createArticle() {
    if (!currentUser) {
        alert('请先登录');
        return;
    }

    (/** @type {HTMLElement} */ (document.getElementById('articleModal'))).style.display = 'flex';
    (/** @type {HTMLFormElement} */ (document.getElementById('articleForm'))).reset();
    document.getElementById('articleModalTitle').textContent = '发布新文章';
}

function closeArticleModal() {
    document.getElementById('articleModal').style.display = 'none';
}

async function handleArticleSubmit(e) {
    e.preventDefault();

    if (!currentUser) {
        alert('请先登录');
        return;
    }

    const titleInput = /** @type {HTMLInputElement} */ (document.getElementById('articleTitle'));
    const contentEl = /** @type {HTMLElement} */ (document.getElementById('articleContent'));
    const categorySelect = /** @type {HTMLSelectElement} */ (document.getElementById('articleCategory'));
    const tagsInput = /** @type {HTMLInputElement} */ (document.getElementById('articleTags'));

    const formData = {
        title: titleInput.value.trim(),
        content: contentEl.innerHTML.trim(),
        category: categorySelect.value,
        tags: tagsInput.value.split(',').map(tag => tag.trim()).filter(tag => tag)
    };

    if (!formData.title || !formData.content) {
        alert('请填写标题和内容');
        return;
    }

    try {
        // 获取CSRF token
        const csrfToken = await getCsrfToken();

        const headers = /** @type {HeadersInit} */ ({
            'Content-Type': 'application/json',
        });

        if (csrfToken) {
            headers['x-csrf-token'] = csrfToken;
        }

        const response = await fetch('/api/forum/articles', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(formData),
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '发布失败');
        }

        const newArticle = await response.json();
        articles.unshift(newArticle);
        renderArticles();
        closeArticleModal();

        alert('文章发布成功！');

    } catch (error) {
        console.error('Error creating article:', error);
        alert(error.message || '发布失败，请稍后重试');
    }
}

// 获取CSRF token
async function getCsrfToken() {
    try {
        const response = await fetch('/csrf-token', {
            credentials: 'include'
        });
        if (response.ok) {
            const data = await response.json();
            return data.token;
        }
    } catch (error) {
        console.error('Error getting CSRF token:', error);
    }
    return null;
}

async function openArticleDetail(articleId) {
    try {
        const response = await fetch(`/api/forum/articles/${articleId}`, { credentials: 'include' });
        if (!response.ok) {
            throw new Error('Failed to load article');
        }

        currentArticle = await response.json();
        renderArticleDetail();
        document.getElementById('articleDetailModal').style.display = 'flex';

    } catch (error) {
        console.error('Error loading article detail:', error);
        alert('加载文章详情失败');
    }
}

function renderArticleDetail() {
    if (!currentArticle) return;

    document.getElementById('articleDetailTitle').textContent = currentArticle.title;
    document.getElementById('articleDetailAuthor').textContent = currentArticle.author.name;
    document.getElementById('articleDetailDate').textContent = formatDate(currentArticle.created_at);
    document.getElementById('articleDetailCategory').textContent = getCategoryName(currentArticle.category);
    document.getElementById('articleDetailViews').textContent = currentArticle.views || 0;
    document.getElementById('articleDetailContent').innerHTML = currentArticle.content;
    document.getElementById('articleLikes').textContent = currentArticle.likes || 0;
    document.getElementById('commentsCount').textContent = currentArticle.comments_count || 0;

    // 渲染标签
    const tagsContainer = document.getElementById('articleDetailTags');
    if (currentArticle.tags && currentArticle.tags.length > 0) {
        tagsContainer.innerHTML = currentArticle.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
    } else {
        tagsContainer.innerHTML = '';
    }

    // 渲染评论
    renderComments();

    // 显示/隐藏删除按钮
    const deleteBtn = /** @type {HTMLButtonElement} */ (document.getElementById('deleteArticleBtn'));
    if (currentUser && (currentUser.handle === currentArticle.author.handle || currentUser.admin)) {
        deleteBtn.style.display = 'inline-flex';
        // 绑定删除事件
        deleteBtn.onclick = () => deleteArticle(currentArticle.id);
    } else {
        deleteBtn.style.display = 'none';
    }

    // 更新点赞按钮状态
    updateLikeButtonState();
}

function renderComments() {
    const commentsList = /** @type {HTMLElement} */ (document.getElementById('commentsList'));
    const commentForm = /** @type {HTMLElement} */ (document.getElementById('commentForm'));

    if (!currentUser) {
        commentForm.style.display = 'none';
    } else {
        commentForm.style.display = 'block';
    }

    if (!currentArticle.comments || currentArticle.comments.length === 0) {
        commentsList.innerHTML = '<p style="text-align: center; color: #666;">暂无评论</p>';
        return;
    }

    // 构建嵌套评论结构
    const commentsHtml = buildNestedComments(currentArticle.comments);
    commentsList.innerHTML = commentsHtml;
}

function buildNestedComments(comments, parentId = null, level = 0) {
    // 过滤出当前层级的评论
    const currentLevelComments = comments.filter(comment => comment.parent_id === parentId);

    if (currentLevelComments.length === 0) {
        return '';
    }

    let html = '';

    for (const comment of currentLevelComments) {
        html += createCommentHtml(comment, level);

        // 递归添加子评论
        const childComments = buildNestedComments(comments, comment.id, level + 1);
        if (childComments) {
            html += childComments;
        }
    }

    return html;
}

function createCommentHtml(comment, level = 0) {
    const canDelete = currentUser && (
        currentUser.handle === comment.author.handle ||
        currentUser.admin
    );

    const deleteButton = canDelete ?
        `<button class="comment-delete-btn" onclick="deleteComment('${comment.id}')">
            <i class="fa-solid fa-trash"></i>
        </button>` : '';

    const replyButton = currentUser ?
        `<button class="comment-reply-btn" onclick="showReplyForm('${comment.id}')">
            <i class="fa-solid fa-reply"></i> 回复
        </button>` : '';

    const marginLeft = level * 30; // 每层缩进30px

    return `
        <div class="comment" style="margin-left: ${marginLeft}px;" data-comment-id="${comment.id}">
            <div class="comment-header">
                <span class="comment-author">${escapeHtml(comment.author.name)}</span>
                <span class="comment-date">${formatDate(comment.created_at)}</span>
                <div class="comment-actions">
                    ${replyButton}
                    ${deleteButton}
                </div>
            </div>
            <div class="comment-content">${escapeHtml(comment.content)}</div>

            <!-- 回复表单 -->
            <div class="reply-form" id="replyForm_${comment.id}" style="display: none;">
                <textarea placeholder="写下你的回复..." rows="2"></textarea>
                <div class="reply-actions">
                    <button class="btn btn-primary btn-sm" onclick="submitReply('${comment.id}')">
                        <i class="fa-solid fa-paper-plane"></i> 回复
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="hideReplyForm('${comment.id}')">
                        取消
                    </button>
                </div>
            </div>
        </div>
    `;
}

function closeArticleDetailModal() {
    document.getElementById('articleDetailModal').style.display = 'none';
    currentArticle = null;
}

async function submitComment() {
    // 重新检查用户登录状态
    if (!currentUser) {
        console.warn('submitComment: currentUser is null, checking user status...');
        await checkUserStatus();

        // 再次检查
        if (!currentUser) {
            alert('请先登录后再发表评论');
            window.location.href = '/login';
            return;
        }
    }

    if (!currentArticle) {
        alert('文章信息获取失败，请刷新页面');
        return;
    }

    const contentTextarea = /** @type {HTMLTextAreaElement} */ (document.getElementById('commentContent'));
    const content = contentTextarea.value.trim();
    if (!content) {
        alert('请输入评论内容');
        return;
    }

    try {
        // 获取CSRF token
        const csrfToken = await getCsrfToken();

        const headers = /** @type {HeadersInit} */ ({
            'Content-Type': 'application/json',
        });

        if (csrfToken) {
            headers['x-csrf-token'] = csrfToken;
        }

        const response = await fetch(`/api/forum/articles/${currentArticle.id}/comments`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ content }),
            credentials: 'include'
        });

        if (!response.ok) {
            if (response.status === 401) {
                alert('登录状态已过期，请重新登录');
                window.location.href = '/login';
                return;
            }
            const error = await response.json();
            throw new Error(error.error || '评论失败');
        }

        const newComment = await response.json();
        currentArticle.comments = currentArticle.comments || [];
        currentArticle.comments.push(newComment);
        currentArticle.comments_count = (currentArticle.comments_count || 0) + 1;

        renderComments();
        contentTextarea.value = '';
        document.getElementById('commentsCount').textContent = currentArticle.comments_count;

        // 显示成功提示
        console.log('Comment submitted successfully');

    } catch (error) {
        console.error('Error submitting comment:', error);
        alert(error.message || '评论失败，请稍后重试');
    }
}

// 删除文章
async function deleteArticle(articleId) {
    if (!currentUser) {
        alert('请先登录');
        return;
    }

    if (!confirm('确定要删除这篇文章吗？此操作不可撤销。')) {
        return;
    }

    try {
        // 获取CSRF token
        const csrfToken = await getCsrfToken();

        /** @type {HeadersInit} */
        const headers = csrfToken ? { 'x-csrf-token': csrfToken } : {};

        const response = await fetch(`/api/forum/articles/${articleId}`, {
            method: 'DELETE',
            headers: headers,
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '删除失败');
        }

        // 删除成功，关闭模态框并刷新文章列表
        closeArticleDetailModal();
        await loadArticles();
        alert('文章删除成功！');

    } catch (error) {
        console.error('Error deleting article:', error);
        alert(error.message || '删除失败，请稍后重试');
    }
}

// 显示回复表单
function showReplyForm(commentId) {
    // 隐藏所有其他回复表单
    document.querySelectorAll('.reply-form').forEach(form => {
        (/** @type {HTMLElement} */ (form)).style.display = 'none';
    });

    // 显示当前评论的回复表单
    const replyForm = /** @type {HTMLElement} */ (document.getElementById(`replyForm_${commentId}`));
    if (replyForm) {
        replyForm.style.display = 'block';
        const textarea = /** @type {HTMLTextAreaElement} */ (replyForm.querySelector('textarea'));
        textarea.focus();
    }
}

// 隐藏回复表单
function hideReplyForm(commentId) {
    const replyForm = /** @type {HTMLElement} */ (document.getElementById(`replyForm_${commentId}`));
    if (replyForm) {
        replyForm.style.display = 'none';
        const textarea = /** @type {HTMLTextAreaElement} */ (replyForm.querySelector('textarea'));
        textarea.value = '';
    }
}

// 提交回复
async function submitReply(parentCommentId) {
    // 重新检查用户登录状态
    if (!currentUser) {
        console.warn('submitReply: currentUser is null, checking user status...');
        await checkUserStatus();

        // 再次检查
        if (!currentUser) {
            alert('请先登录后再回复');
            window.location.href = '/login';
            return;
        }
    }

    if (!currentArticle) {
        alert('文章信息获取失败，请刷新页面');
        return;
    }

    const replyForm = document.getElementById(`replyForm_${parentCommentId}`);
    const textarea = replyForm.querySelector('textarea');
    const content = textarea.value.trim();

    if (!content) {
        alert('请输入回复内容');
        return;
    }

    try {
        // 获取CSRF token
        const csrfToken = await getCsrfToken();

        const headers = {
            'Content-Type': 'application/json',
        };

        if (csrfToken) {
            headers['x-csrf-token'] = csrfToken;
        }

        const response = await fetch(`/api/forum/articles/${currentArticle.id}/comments`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                content: content,
                parent_id: parentCommentId
            }),
            credentials: 'include'
        });

        if (!response.ok) {
            if (response.status === 401) {
                alert('登录状态已过期，请重新登录');
                window.location.href = '/login';
                return;
            }
            const error = await response.json();
            throw new Error(error.error || '回复失败');
        }

        const newReply = await response.json();
        currentArticle.comments = currentArticle.comments || [];
        currentArticle.comments.push(newReply);
        currentArticle.comments_count = (currentArticle.comments_count || 0) + 1;

        renderComments();
        hideReplyForm(parentCommentId);
        document.getElementById('commentsCount').textContent = currentArticle.comments_count;

        // 显示成功提示
        console.log('Reply submitted successfully');

    } catch (error) {
        console.error('Error submitting reply:', error);
        alert(error.message || '回复失败，请稍后重试');
    }
}

/**
 * 递归获取评论及其所有子评论的ID列表
 * @param {string} commentId 评论ID
 * @param {Array} comments 所有评论列表
 * @returns {Array<string>} 评论ID列表
 */
function getCommentAndChildrenIds(commentId, comments) {
    const ids = [commentId];
    const children = comments.filter(c => c.parent_id === commentId);

    for (const child of children) {
        ids.push(...getCommentAndChildrenIds(child.id, comments));
    }

    return ids;
}

// 删除评论
async function deleteComment(commentId) {
    if (!currentUser) {
        alert('请先登录');
        return;
    }

    if (!confirm('确定要删除这条评论吗？此操作不可撤销。\n注意：删除评论会同时删除所有回复。')) {
        return;
    }

    try {
        // 获取CSRF token
        const csrfToken = await getCsrfToken();

        /** @type {HeadersInit} */
        const headers = csrfToken ? { 'x-csrf-token': csrfToken } : {};

        const response = await fetch(`/api/forum/comments/${commentId}`, {
            method: 'DELETE',
            headers: headers,
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '删除失败');
        }

        const result = await response.json();
        const deletedCount = result.deletedCount || 1;

        // 获取所有要删除的评论ID（包括子评论）
        const idsToDelete = getCommentAndChildrenIds(commentId, currentArticle.comments);

        // 从评论列表中移除所有被删除的评论
        currentArticle.comments = currentArticle.comments.filter(comment => !idsToDelete.includes(comment.id));
        currentArticle.comments_count = Math.max(0, (currentArticle.comments_count || 0) - deletedCount);

        renderComments();
        document.getElementById('commentsCount').textContent = currentArticle.comments_count;

        if (deletedCount > 1) {
            alert(`成功删除 ${deletedCount} 条评论（包括回复）！`);
        } else {
            alert('评论删除成功！');
        }

    } catch (error) {
        console.error('Error deleting comment:', error);
        alert(error.message || '删除失败，请稍后重试');
    }
}

// 点赞文章
async function likeArticle() {
    if (!currentUser) {
        alert('请先登录后再点赞');
        return;
    }

    if (!currentArticle) {
        alert('文章信息获取失败');
        return;
    }

    try {
        // 获取CSRF token
        const csrfToken = await getCsrfToken();

        const headers = {
            'Content-Type': 'application/json',
        };

        if (csrfToken) {
            headers['x-csrf-token'] = csrfToken;
        }

        const response = await fetch(`/api/forum/articles/${currentArticle.id}/like`, {
            method: 'POST',
            headers: headers,
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '点赞失败');
        }

        const result = await response.json();

        // 更新文章数据
        currentArticle.likes = result.likes;
        currentArticle.user_liked = result.liked;

        // 更新点赞数显示
        const likesElement = document.getElementById('articleLikes');
        likesElement.textContent = result.likes;

        // 更新点赞按钮状态
        updateLikeButtonState();

        // 给点赞数添加动画效果
        if (likesElement) {
            likesElement.style.color = result.liked ? '#ff6b6b' : '#4CAF50';
            likesElement.style.transform = 'scale(1.2)';
            likesElement.style.fontWeight = 'bold';

            setTimeout(() => {
                likesElement.style.color = '';
                likesElement.style.transform = '';
                likesElement.style.fontWeight = '';
            }, 500);
        }

    } catch (error) {
        console.error('Error liking article:', error);
        alert(error.message || '点赞失败，请稍后重试');
    }
}

// 更新点赞按钮状态
function updateLikeButtonState() {
    const likeButton = /** @type {HTMLButtonElement|null} */ (document.querySelector('button[onclick="likeArticle()"]'));
    if (!likeButton || !currentArticle) return;

    const heartIcon = /** @type {HTMLElement|null} */ (likeButton.querySelector('i'));

    if (currentArticle.user_liked) {
        // 已点赞状态
        likeButton.classList.add('liked');
        if (heartIcon) {
            heartIcon.className = 'fa-solid fa-heart'; // 实心红心
        }
        likeButton.title = '取消点赞';
    } else {
        // 未点赞状态
        likeButton.classList.remove('liked');
        if (heartIcon) {
            heartIcon.className = 'fa-regular fa-heart'; // 空心红心
        }
        likeButton.title = '点赞';
    }
}

// 分享文章
async function shareArticle() {
    if (!currentArticle) {
        alert('文章信息获取失败');
        return;
    }

    const shareUrl = `${window.location.origin}/forum#article-${currentArticle.id}`;
    const shareText = `${currentArticle.title} - ${currentArticle.author.name}`;

    // 检查是否支持Web Share API
    if (navigator.share) {
        try {
            await navigator.share({
                title: currentArticle.title,
                text: shareText,
                url: shareUrl
            });
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error sharing:', error);
                fallbackShare(shareUrl, shareText);
            }
        }
    } else {
        fallbackShare(shareUrl, shareText);
    }
}

// 备用分享方法
function fallbackShare(url, text) {
    // 尝试复制到剪贴板
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
            alert('文章链接已复制到剪贴板！\n\n' + text + '\n' + url);
        }).catch(() => {
            showShareDialog(url, text);
        });
    } else {
        showShareDialog(url, text);
    }
}

// 显示分享对话框
function showShareDialog(url, text) {
    const shareContent = `${text}\n\n${url}`;

    // 创建一个临时的文本域来选择和复制
    const textArea = document.createElement('textarea');
    textArea.value = shareContent;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        document.execCommand('copy');
        alert('文章信息已复制到剪贴板！');
    } catch (err) {
        // 如果复制失败，显示分享信息供手动复制
        alert('请手动复制以下信息：\n\n' + shareContent);
    }

    document.body.removeChild(textArea);
}

function updatePagination() {
    const totalPages = Math.ceil(articles.length / articlesPerPage);
    const pagination = document.getElementById('pagination');
    const pageInfo = document.getElementById('pageInfo');
    const prevPage = /** @type {HTMLButtonElement} */ (document.getElementById('prevPage'));
    const nextPage = /** @type {HTMLButtonElement} */ (document.getElementById('nextPage'));

    if (totalPages <= 1) {
        pagination.style.display = 'none';
        return;
    }

    pagination.style.display = 'flex';
    pageInfo.textContent = `第 ${currentPage} 页，共 ${totalPages} 页`;

    prevPage.disabled = currentPage <= 1;
    nextPage.disabled = currentPage >= totalPages;
}

function previousPage() {
    if (currentPage > 1) {
        currentPage--;
        renderArticles();
        window.scrollTo(0, 0);
    }
}

function nextPage() {
    const totalPages = Math.ceil(articles.length / articlesPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        renderArticles();
        window.scrollTo(0, 0);
    }
}

// 工具函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
}

function formatDate(dateString) {
    if (!dateString) return 'Invalid Date';

    let date;

    // 处理后端返回的特殊格式: "2024-1-15 @14h 30m 45s 123ms"
    if (dateString.includes('@') && dateString.includes('h ') && dateString.includes('m ')) {
        try {
            // 解析自定义格式
            const parts = dateString.split(' @');
            const datePart = parts[0]; // "2024-1-15"
            const timePart = parts[1]; // "14h 30m 45s 123ms"

            const dateComponents = datePart.split('-');
            const year = parseInt(dateComponents[0]);
            const month = parseInt(dateComponents[1]) - 1; // JavaScript月份从0开始
            const day = parseInt(dateComponents[2]);

            const timeComponents = timePart.match(/(\d+)h (\d+)m (\d+)s (\d+)ms/);
            if (timeComponents) {
                const hour = parseInt(timeComponents[1]);
                const minute = parseInt(timeComponents[2]);
                const second = parseInt(timeComponents[3]);
                const millisecond = parseInt(timeComponents[4]);

                date = new Date(year, month, day, hour, minute, second, millisecond);
            } else {
                // 如果时间部分解析失败，只使用日期部分
                date = new Date(year, month, day);
            }
        } catch (error) {
            console.error('Error parsing custom date format:', error);
            date = new Date(dateString);
        }
    } else {
        // 尝试标准日期格式
        date = new Date(dateString);
    }

    // 检查日期是否有效
    if (isNaN(date.getTime())) {
        console.error('Invalid date:', dateString);
        return 'Invalid Date';
    }

    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

function getCategoryName(category) {
    const categoryMap = {
        'tutorial': '教程',
        'discussion': '讨论',
        'announcement': '公告',
        'question': '问答',
        'showcase': '展示'
    };
    return categoryMap[category] || '其他';
}
