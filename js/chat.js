/**
 * 智慧医保助手 - 对话功能模块
 * ChatGPT 风格的对话界面
 */

class ChatManager {
    constructor() {
        // DOM 元素
        this.messagesContainer = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.newChatBtn = document.getElementById('newChatBtn');
        this.historyList = document.getElementById('chatHistoryList');

        // 状态
        this.isLoading = false;
        this.currentConversationId = null;
        this.cozeConversationId = null;  // COZE 会话ID，用于上下文
        this.conversations = [];

        // 初始化
        this.init();
    }

    /**
     * 初始化
     */
    init() {
        // 绑定事件
        this.bindEvents();

        // 加载历史记录
        this.loadConversations();

        // 检查是否有当前对话
        if (!this.currentConversationId) {
            this.createNewConversation();
        }

        // 自动聚焦输入框
        this.chatInput.focus();
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 发送按钮点击
        this.sendBtn.addEventListener('click', () => this.sendMessage());

        // 输入框回车发送
        this.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // 输入框内容变化
        this.chatInput.addEventListener('input', () => {
            this.autoResizeInput();
            this.updateSendButtonState();
        });

        // 新对话按钮
        this.newChatBtn.addEventListener('click', () => {
            this.createNewConversation();
            this.renderHistoryList();
        });

        // 移动端侧边栏切换
        const sidebarToggle = document.querySelector('.sidebar-toggle');
        const sidebar = document.querySelector('.chat-sidebar');
        const overlay = document.querySelector('.sidebar-overlay');

        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => {
                sidebar.classList.toggle('active');
                overlay?.classList.toggle('active');
            });
        }

        if (overlay) {
            overlay.addEventListener('click', () => {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
            });
        }
    }

    /**
     * 自动调整输入框高度
     */
    autoResizeInput() {
        this.chatInput.style.height = 'auto';
        this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 150) + 'px';
    }

    /**
     * 更新发送按钮状态
     */
    updateSendButtonState() {
        const hasContent = this.chatInput.value.trim().length > 0;
        this.sendBtn.disabled = !hasContent || this.isLoading;
    }

    /**
     * 发送消息
     */
    async sendMessage() {
        const message = this.chatInput.value.trim();
        if (!message || this.isLoading) return;

        // 清空输入框
        this.chatInput.value = '';
        this.autoResizeInput();
        this.updateSendButtonState();

        // 添加用户消息到界面
        this.addMessage('user', message);

        // 显示加载状态
        this.isLoading = true;
        this.updateSendButtonState();
        const loadingId = this.showLoadingMessage();
        console.log('[CHAT] 创建loadingId:', loadingId);

        try {
            // 获取历史上下文（在保存当前消息之前获取，避免重复）
            const context = this.getConversationContext();
            console.log('[CHAT] 获取上下文:', context);

            // 保存用户消息到对话历史（在获取上下文之后）
            this.saveMessageToConversation('user', message);

            // 调用后端 API（流式，带上下文）
            let fullResponse = '';

            await api.streamChat(
                message,
                {
                    onInit: (data) => {
                        console.log('[CHAT] onInit被调用:', data);
                        // 保存 COZE 会话ID
                        if (data.conversationId) {
                            this.cozeConversationId = data.conversationId;
                            this.saveCozeConversationId(data.conversationId);
                        }
                    },
                    onMessage: (content) => {
                        console.log('[CHAT] onMessage被调用, content:', content);
                        if (content) {
                            fullResponse += content;
                            console.log('[CHAT] fullResponse长度:', fullResponse.length);
                            console.log('[CHAT] 调用updateLoadingMessage, loadingId:', loadingId);
                            this.updateLoadingMessage(loadingId, fullResponse);
                        }
                    },
                    onError: (error) => {
                        console.error('[CHAT] onError被调用:', error);
                        this.removeLoadingMessage(loadingId);
                        this.addErrorMessage('抱歉，发生了错误，请稍后重试。');
                    },
                    onComplete: (data) => {
                        console.log('[CHAT] onComplete被调用, fullResponse长度:', fullResponse.length);
                        // 将流式消息转换为最终消息（保留内容，移除光标）
                        this.finalizeLoadingMessage(loadingId, fullResponse);

                        if (fullResponse) {
                            this.saveMessageToConversation('assistant', fullResponse);
                        }
                        // 更新会话ID
                        if (data && data.conversationId) {
                            this.cozeConversationId = data.conversationId;
                            this.saveCozeConversationId(data.conversationId);
                        }
                    }
                },
                {
                    conversationId: this.cozeConversationId,
                    history: context.history || []
                }
            );
        } catch (error) {
            console.error('[CHAT] 发送消息失败:', error);
            this.removeLoadingMessage(loadingId);

            // 尝试非流式调用
            try {
                const response = await api.sendChat(message);
                this.addMessage('assistant', response);
                this.saveMessageToConversation('assistant', response);
            } catch (e) {
                this.addErrorMessage('网络错误，请检查您的网络连接后重试。');
            }
        } finally {
            this.isLoading = false;
            this.updateSendButtonState();
        }
    }

    /**
     * 保存 COZE 会话ID 到当前对话
     */
    saveCozeConversationId(cozeId) {
        const conversation = this.conversations.find(c => c.id === this.currentConversationId);
        if (conversation) {
            conversation.cozeConversationId = cozeId;
            this.saveConversations();
        }
    }

    /**
     * 添加消息到界面
     */
    addMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${role}`;

        const avatar = role === 'user' ? '👤' : '🤖';
        const time = this.formatTime(new Date());

        messageDiv.innerHTML = `
            <div class="message-avatar">
                <span>${avatar}</span>
            </div>
            <div class="message-content">
                <div class="message-bubble">
                    ${this.formatMessageContent(content)}
                </div>
                <span class="message-time">${time}</span>
            </div>
        `;

        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    /**
     * 格式化消息内容（支持 Markdown：标题、表格、列表等）
     */
    formatMessageContent(content) {
        // 过滤 COZE 内部标记（如 <|FunctionCallEnd|> 等）
        content = content.replace(/<\|[^|]+\|>/g, '');

        // 转义 HTML（但保留换行符用于后续处理）
        let formatted = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // 处理表格（必须在换行转换之前）
        formatted = this.parseMarkdownTable(formatted);

        // 处理标题（必须在换行转换之前，从高级到低级处理避免误匹配）
        // ###### 六级标题
        formatted = formatted.replace(/^###### (.+)$/gm, '<h6 class="md-h6">$1</h6>');
        // ##### 五级标题
        formatted = formatted.replace(/^##### (.+)$/gm, '<h5 class="md-h5">$1</h5>');
        // #### 四级标题
        formatted = formatted.replace(/^#### (.+)$/gm, '<h4 class="md-h4">$1</h4>');
        // ### 三级标题
        formatted = formatted.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
        // ## 二级标题
        formatted = formatted.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
        // # 一级标题
        formatted = formatted.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');

        // 处理分隔符 ▶
        formatted = formatted.replace(/^(#{1,6} )?▶ (.+)$/gm, '<div class="md-section-title">▶ $2</div>');

        // 处理粗体 **text**
        formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // 处理斜体 *text*（单个星号，排除已处理的粗体）
        formatted = formatted.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

        // 处理行内代码 `code`
        formatted = formatted.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

        // 处理无序列表项 - item
        formatted = formatted.replace(/^- (.+)$/gm, '<li class="md-ul-item">$1</li>');

        // 处理有序列表项 1. item
        formatted = formatted.replace(/^\d+\. (.+)$/gm, '<li class="md-ol-item">$1</li>');

        // 将连续的 li 包裹在 ul/ol 中
        formatted = formatted.replace(/((?:<li class="md-ul-item">.*<\/li>\n?)+)/g, '<ul class="md-list">$1</ul>');
        formatted = formatted.replace(/((?:<li class="md-ol-item">.*<\/li>\n?)+)/g, '<ol class="md-list">$1</ol>');

        // 处理换行（在其他处理之后）
        formatted = formatted.replace(/\n/g, '<br>');

        // 清理多余的 <br>（标题和表格后不需要）
        formatted = formatted.replace(/(<\/h[1-6]>)<br>/g, '$1');
        formatted = formatted.replace(/(<\/table>)<br>/g, '$1');
        formatted = formatted.replace(/(<\/ul>)<br>/g, '$1');
        formatted = formatted.replace(/(<\/ol>)<br>/g, '$1');
        formatted = formatted.replace(/(<\/div>)<br>/g, '$1');

        return `<div class="md-content">${formatted}</div>`;
    }

    /**
     * 解析 Markdown 表格
     */
    parseMarkdownTable(text) {
        const lines = text.split('\n');
        let result = [];
        let inTable = false;
        let tableRows = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // 检测表格行（包含 | 且不是分隔行）
            if (line.startsWith('|') && line.endsWith('|')) {
                // 跳过分隔行 |---|---|
                if (/^\|[\s\-:]+\|$/.test(line.replace(/\|/g, '|').replace(/[\s\-:]+/g, ''))) {
                    continue;
                }
                if (/^[\|\s\-:]+$/.test(line)) {
                    continue;
                }

                if (!inTable) {
                    inTable = true;
                    tableRows = [];
                }
                tableRows.push(line);
            } else {
                if (inTable) {
                    // 结束表格，生成 HTML
                    result.push(this.generateTableHtml(tableRows));
                    inTable = false;
                    tableRows = [];
                }
                result.push(line);
            }
        }

        // 处理末尾的表格
        if (inTable && tableRows.length > 0) {
            result.push(this.generateTableHtml(tableRows));
        }

        return result.join('\n');
    }

    /**
     * 生成表格 HTML
     */
    generateTableHtml(rows) {
        if (rows.length === 0) return '';

        let html = '<table class="md-table"><thead><tr>';

        // 第一行作为表头
        const headerCells = rows[0].split('|').filter(cell => cell.trim() !== '');
        headerCells.forEach(cell => {
            // 还原单元格内的 <br> 标签
            let cellContent = cell.trim().replace(/&lt;br&gt;/gi, '<br>');
            html += `<th>${cellContent}</th>`;
        });
        html += '</tr></thead><tbody>';

        // 其余行作为数据
        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].split('|').filter(cell => cell.trim() !== '');
            html += '<tr>';
            cells.forEach(cell => {
                // 还原单元格内的 <br> 标签
                let cellContent = cell.trim().replace(/&lt;br&gt;/gi, '<br>');
                html += `<td>${cellContent}</td>`;
            });
            html += '</tr>';
        }

        html += '</tbody></table>';
        return html;
    }

    /**
     * 显示加载消息
     */
    showLoadingMessage() {
        const id = 'loading-' + Date.now();
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message message-assistant';
        messageDiv.id = id;

        messageDiv.innerHTML = `
            <div class="message-avatar">
                <span>🤖</span>
            </div>
            <div class="message-content">
                <div class="message-bubble">
                    <div class="typing-indicator">
                        <span class="typing-dot"></span>
                        <span class="typing-dot"></span>
                        <span class="typing-dot"></span>
                    </div>
                </div>
            </div>
        `;

        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();

        return id;
    }

    /**
     * 更新加载消息（流式输出）
     */
    updateLoadingMessage(id, content) {
        console.log('[CHAT] updateLoadingMessage开始, id:', id);
        const messageDiv = document.getElementById(id);
        console.log('[CHAT] 找到messageDiv:', !!messageDiv);
        if (messageDiv) {
            const bubble = messageDiv.querySelector('.message-bubble');
            console.log('[CHAT] 找到bubble:', !!bubble);
            if (bubble) {
                const formatted = this.formatMessageContent(content);
                console.log('[CHAT] 格式化后内容长度:', formatted.length);
                bubble.innerHTML = `
                    ${formatted}
                    <span class="streaming-cursor"></span>
                `;
                console.log('[CHAT] bubble.innerHTML已更新');
                this.scrollToBottom();
            }
        } else {
            console.error('[CHAT] 找不到id为', id, '的元素！');
            console.log('[CHAT] 当前DOM中的message元素:', document.querySelectorAll('.message').length);
        }
    }

    /**
     * 移除加载消息
     */
    removeLoadingMessage(id) {
        const messageDiv = document.getElementById(id);
        if (messageDiv) {
            messageDiv.remove();
        }
    }

    /**
     * 将流式消息转换为最终消息（移除光标，添加时间戳）
     */
    finalizeLoadingMessage(id, content) {
        const messageDiv = document.getElementById(id);
        if (messageDiv && content) {
            const time = this.formatTime(new Date());
            const bubble = messageDiv.querySelector('.message-bubble');
            const contentDiv = messageDiv.querySelector('.message-content');

            // 更新气泡内容（移除光标）
            if (bubble) {
                bubble.innerHTML = this.formatMessageContent(content);
            }

            // 添加时间戳（如果不存在）
            if (contentDiv && !contentDiv.querySelector('.message-time')) {
                const timeSpan = document.createElement('span');
                timeSpan.className = 'message-time';
                timeSpan.textContent = time;
                contentDiv.appendChild(timeSpan);
            }

            // 移除 ID（避免重复处理）
            messageDiv.removeAttribute('id');
            this.scrollToBottom();
        } else if (!content) {
            // 如果没有内容，移除加载消息
            this.removeLoadingMessage(id);
        }
    }

    /**
     * 添加错误消息
     */
    addErrorMessage(text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message message-assistant message-error';

        messageDiv.innerHTML = `
            <div class="message-avatar">
                <span>🤖</span>
            </div>
            <div class="message-content">
                <div class="message-bubble">
                    <p>${text}</p>
                    <button class="error-retry" onclick="chatManager.retryLastMessage()">
                        重试
                    </button>
                </div>
            </div>
        `;

        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    /**
     * 滚动到底部
     */
    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    /**
     * 格式化时间
     */
    formatTime(date) {
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) {
            return '刚刚';
        } else if (diff < 3600000) {
            return Math.floor(diff / 60000) + '分钟前';
        } else if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        } else {
            return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
        }
    }

    // ==================== 对话历史管理 ====================

    /**
     * 创建新对话
     */
    createNewConversation() {
        const conversation = {
            id: 'conv-' + Date.now(),
            title: '新对话',
            messages: [],
            cozeConversationId: null,  // COZE 会话ID
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.conversations.unshift(conversation);
        this.currentConversationId = conversation.id;
        this.cozeConversationId = null;  // 重置 COZE 会话ID
        this.saveConversations();
        this.renderHistoryList();
        this.clearMessages();

        // 添加欢迎消息
        this.addWelcomeMessage();
    }

    /**
     * 添加欢迎消息
     */
    addWelcomeMessage() {
        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'message message-assistant';

        welcomeDiv.innerHTML = `
            <div class="message-avatar">
                <span>🤖</span>
            </div>
            <div class="message-content">
                <div class="message-bubble">
                    <p>您好！我是智慧医保助手，专注于解答异地医保相关问题。</p>
                    <p>您可以问我：</p>
                    <ul>
                        <li>如何办理异地就医备案？</li>
                        <li>深圳医保在上海怎么使用？</li>
                        <li>异地就医报销比例是多少？</li>
                        <li>急诊就医如何报销？</li>
                    </ul>
                    <p>请问有什么可以帮您的？</p>
                </div>
                <span class="message-time">刚刚</span>
            </div>
        `;

        this.messagesContainer.appendChild(welcomeDiv);
    }

    /**
     * 清空消息区域
     */
    clearMessages() {
        this.messagesContainer.innerHTML = '';
    }

    /**
     * 保存消息到当前对话
     */
    saveMessageToConversation(role, content) {
        const conversation = this.conversations.find(c => c.id === this.currentConversationId);
        if (conversation) {
            conversation.messages.push({
                role,
                content,
                timestamp: new Date().toISOString()
            });

            // 更新标题（使用第一条用户消息）
            if (role === 'user' && conversation.title === '新对话') {
                conversation.title = content.slice(0, 20) + (content.length > 20 ? '...' : '');
            }

            conversation.updatedAt = new Date().toISOString();
            this.saveConversations();
            this.renderHistoryList();
        }
    }

    /**
     * 获取对话上下文
     */
    getConversationContext() {
        const conversation = this.conversations.find(c => c.id === this.currentConversationId);
        if (conversation && conversation.messages.length > 0) {
            // 返回最近的几条消息作为上下文
            const recentMessages = conversation.messages.slice(-6);
            return {
                history: recentMessages.map(m => ({
                    role: m.role,
                    content: m.content
                }))
            };
        }
        return {};
    }

    /**
     * 加载对话历史
     */
    loadConversations() {
        try {
            const saved = localStorage.getItem('medicalAI_conversations');
            if (saved) {
                this.conversations = JSON.parse(saved);
                if (this.conversations.length > 0) {
                    this.currentConversationId = this.conversations[0].id;
                    this.loadConversation(this.currentConversationId);
                }
            }
        } catch (e) {
            console.error('加载对话历史失败:', e);
            this.conversations = [];
        }
        this.renderHistoryList();
    }

    /**
     * 保存对话历史
     */
    saveConversations() {
        try {
            // 只保留最近 20 个对话
            const toSave = this.conversations.slice(0, 20);
            localStorage.setItem('medicalAI_conversations', JSON.stringify(toSave));
        } catch (e) {
            console.error('保存对话历史失败:', e);
        }
    }

    /**
     * 加载指定对话
     */
    loadConversation(conversationId) {
        const conversation = this.conversations.find(c => c.id === conversationId);
        if (!conversation) return;

        this.currentConversationId = conversationId;
        this.cozeConversationId = conversation.cozeConversationId || null;  // 恢复 COZE 会话ID
        this.clearMessages();

        // 添加欢迎消息
        this.addWelcomeMessage();

        // 加载历史消息
        conversation.messages.forEach(msg => {
            this.addMessage(msg.role, msg.content);
        });

        this.renderHistoryList();
    }

    /**
     * 渲染历史列表
     */
    renderHistoryList() {
        if (!this.historyList) return;

        if (this.conversations.length === 0) {
            this.historyList.innerHTML = '<div class="history-empty">暂无对话历史</div>';
            return;
        }

        this.historyList.innerHTML = this.conversations.map(conv => {
            const isActive = conv.id === this.currentConversationId;
            const date = new Date(conv.updatedAt);
            const timeStr = this.formatTime(date);

            return `
                <div class="chat-history-item ${isActive ? 'active' : ''}"
                     onclick="chatManager.loadConversation('${conv.id}')">
                    <div class="history-title">${this.escapeHtml(conv.title)}</div>
                    <div class="history-meta">${conv.messages.length} 条消息 · ${timeStr}</div>
                </div>
            `;
        }).join('');
    }

    /**
     * 删除对话
     */
    deleteConversation(conversationId) {
        this.conversations = this.conversations.filter(c => c.id !== conversationId);
        this.saveConversations();

        if (this.currentConversationId === conversationId) {
            if (this.conversations.length > 0) {
                this.loadConversation(this.conversations[0].id);
            } else {
                this.createNewConversation();
            }
        }

        this.renderHistoryList();
    }

    /**
     * HTML 转义
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 重试上一条消息
     */
    retryLastMessage() {
        const conversation = this.conversations.find(c => c.id === this.currentConversationId);
        if (conversation && conversation.messages.length > 0) {
            // 找到最后一条用户消息
            for (let i = conversation.messages.length - 1; i >= 0; i--) {
                if (conversation.messages[i].role === 'user') {
                    const message = conversation.messages[i].content;
                    // 移除错误消息
                    const errorMsg = this.messagesContainer.querySelector('.message-error');
                    if (errorMsg) errorMsg.remove();
                    // 重新发送
                    this.chatInput.value = message;
                    this.sendMessage();
                    break;
                }
            }
        }
    }
}

// 创建全局实例
let chatManager;
document.addEventListener('DOMContentLoaded', () => {
    chatManager = new ChatManager();
});

// 导出
window.ChatManager = ChatManager;
