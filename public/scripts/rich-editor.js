// 富文本编辑器功能
let richEditor = null;

// 初始化富文本编辑器
function initRichEditor() {
    const editorElement = document.getElementById('articleContent');
    if (!editorElement) return;

    // 设置编辑器为可编辑
    editorElement.contentEditable = true;

    // 绑定工具栏按钮事件
    bindToolbarEvents();

    // 绑定图片上传事件
    bindImageUpload();

    richEditor = {
        getContent: () => editorElement.innerHTML,
        setContent: (content) => { editorElement.innerHTML = content; },
        focus: () => editorElement.focus()
    };
}

// 绑定工具栏按钮事件
function bindToolbarEvents() {
    const toolbarButtons = document.querySelectorAll('.toolbar-btn');

    toolbarButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const command = button.dataset.command;
            const value = button.dataset.value;

            if (command) {
                document.execCommand(command, false, value);
                editorElement.focus();
            }
        });
    });
}

// 绑定图片上传事件
function bindImageUpload() {
    const insertImageBtn = document.getElementById('insertImageBtn');
    const imageUpload = document.getElementById('imageUpload');

    if (insertImageBtn && imageUpload) {
        insertImageBtn.addEventListener('click', () => {
            imageUpload.click();
        });

        imageUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await uploadImage(file);
            }
        });
    }
}

// 上传图片
async function uploadImage(file) {
    try {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch('/api/forum/upload-image', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '图片上传失败');
        }

        const result = await response.json();

        // 插入图片到编辑器
        const img = document.createElement('img');
        img.src = result.url;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';

        // 在光标位置插入图片
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(img);
            range.setStartAfter(img);
            range.setEndAfter(img);
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            // 如果没有选择，插入到编辑器末尾
            const editorElement = document.getElementById('articleContent');
            editorElement.appendChild(img);
        }

        // 清空文件输入
        document.getElementById('imageUpload').value = '';

    } catch (error) {
        console.error('Error uploading image:', error);
        alert('图片上传失败: ' + error.message);
    }
}

// 修改原有的文章表单提交处理，使用富文本编辑器内容
const originalHandleArticleSubmit = window.handleArticleSubmit;
if (originalHandleArticleSubmit) {
    window.handleArticleSubmit = async function(event) {
        event.preventDefault();

        if (!window.currentUser && !currentUser) {
            alert('请先登录后再发布文章');
            return;
        }

        const formData = new FormData(event.target);
        const articleData = {
            title: formData.get('title'),
            content: richEditor ? richEditor.getContent() : formData.get('content'),
            category: formData.get('category'),
            tags: (() => {
                const tagsValue = formData.get('tags');
                return tagsValue && typeof tagsValue === 'string' ?
                       tagsValue.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
            })()
        };

        try {
            // 获取CSRF token
            const csrfToken = await getCsrfToken();

            const headers = {
                'Content-Type': 'application/json'
            };

            if (csrfToken) {
                headers['x-csrf-token'] = csrfToken;
            }

            const response = await fetch('/api/forum/articles', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(articleData),
                credentials: 'include'
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || '发布失败');
            }

            const result = await response.json();
            alert('文章发布成功！');
            window.closeArticleModal();
            window.loadArticles();
        } catch (error) {
            console.error('Failed to create article:', error);
            alert(`发布失败: ${error.message}`);
        }
    };
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

// 页面加载完成后初始化编辑器
document.addEventListener('DOMContentLoaded', () => {
    initRichEditor();
});
