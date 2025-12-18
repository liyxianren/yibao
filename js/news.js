/**
 * 智慧医保助手 - 新闻模块
 * 调用后端 API 获取医保资讯
 */

class NewsManager {
    constructor() {
        this.newsGrid = document.getElementById('newsGrid');
        this.refreshBtn = document.getElementById('refreshNews');
        this.isLoading = false;
        this.newsCache = null;
        this.cacheTime = null;
        this.cacheTimeout = 5 * 60 * 1000; // 缓存 5 分钟

        this.init();
    }

    /**
     * 初始化
     */
    init() {
        // 绑定刷新按钮
        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => this.refreshNews());
        }

        // 首次加载新闻
        this.loadNews();
    }

    /**
     * 加载新闻
     */
    async loadNews() {
        // 检查缓存
        if (this.newsCache && this.cacheTime && (Date.now() - this.cacheTime < this.cacheTimeout)) {
            this.renderNews(this.newsCache);
            return;
        }

        await this.fetchNews();
    }

    /**
     * 刷新新闻
     */
    async refreshNews() {
        // 清除缓存强制刷新
        this.newsCache = null;
        this.cacheTime = null;
        await this.fetchNews();
    }

    /**
     * 获取新闻数据
     */
    async fetchNews() {
        if (this.isLoading) return;

        this.isLoading = true;
        this.showLoading();
        this.setRefreshButtonLoading(true);

        try {
            // 调用后端 API 获取新闻
            const news = await api.getNews();

            // 转换新闻格式并添加 ID
            const formattedNews = this.formatNewsData(news);

            // 更新缓存
            this.newsCache = formattedNews;
            this.cacheTime = Date.now();

            // 渲染新闻
            this.renderNews(formattedNews);
        } catch (error) {
            console.error('获取新闻失败:', error);
            this.showError();
        } finally {
            this.isLoading = false;
            this.setRefreshButtonLoading(false);
        }
    }

    /**
     * 格式化新闻数据
     * 将 API 返回的格式转换为前端需要的格式
     */
    formatNewsData(newsList) {
        if (!Array.isArray(newsList)) return [];

        return newsList.map((item, index) => ({
            id: index + 1,
            title: item.title || '无标题',
            summary: item.content || item.summary || '',
            url: item.url || '',
            tag: this.extractTag(item.title) || '医保资讯',
            source: this.extractSource(item.url) || '医保资讯',
            date: new Date().toISOString().split('T')[0]
        }));
    }

    /**
     * 从标题中提取标签
     */
    extractTag(title) {
        if (!title) return '资讯';

        const tagMap = {
            '政策': '政策解读',
            '报销': '报销指南',
            '备案': '便民服务',
            '药品': '药品目录',
            '通知': '政策解读',
            '改革': '政策解读',
            '门诊': '报销指南',
            '住院': '报销指南',
            '医保局': '官方通知',
            '异地': '异地就医'
        };

        for (const [keyword, tag] of Object.entries(tagMap)) {
            if (title.includes(keyword)) {
                return tag;
            }
        }

        return '医保资讯';
    }

    /**
     * 从 URL 中提取来源
     */
    extractSource(url) {
        if (!url) return '医保资讯';

        const sourceMap = {
            'toutiao': '今日头条',
            'sina': '新浪新闻',
            'sohu': '搜狐新闻',
            'qq.com': '腾讯新闻',
            'baidu': '百度新闻',
            '163.com': '网易新闻',
            'gov.cn': '政府网站',
            'nhsa.gov.cn': '国家医保局'
        };

        for (const [domain, source] of Object.entries(sourceMap)) {
            if (url.includes(domain)) {
                return source;
            }
        }

        return '医保资讯';
    }

    /**
     * 显示加载状态
     */
    showLoading() {
        if (!this.newsGrid) return;

        this.newsGrid.innerHTML = `
            <div class="news-loading" style="min-height: 200px;">
                <div class="loading-spinner"><span></span></div>
                <p>正在获取最新资讯...</p>
            </div>
        `;
    }

    /**
     * 显示错误状态
     */
    showError() {
        if (!this.newsGrid) return;

        this.newsGrid.innerHTML = `
            <div class="news-loading">
                <p style="color: var(--text-muted);">获取资讯失败，请稍后重试</p>
                <button class="btn btn-secondary" onclick="newsManager.refreshNews()" style="margin-top: 1rem;">
                    重新加载
                </button>
            </div>
        `;
    }

    /**
     * 设置刷新按钮加载状态
     */
    setRefreshButtonLoading(loading) {
        if (!this.refreshBtn) return;

        if (loading) {
            this.refreshBtn.classList.add('loading');
            this.refreshBtn.disabled = true;
        } else {
            this.refreshBtn.classList.remove('loading');
            this.refreshBtn.disabled = false;
        }
    }

    /**
     * 渲染新闻列表
     */
    renderNews(newsList) {
        if (!this.newsGrid) return;

        if (!newsList || newsList.length === 0) {
            this.newsGrid.innerHTML = `
                <div class="news-loading">
                    <p style="color: var(--text-muted);">暂无最新资讯</p>
                </div>
            `;
            return;
        }

        // 只显示前 6 条新闻
        const displayNews = newsList.slice(0, 6);

        this.newsGrid.innerHTML = displayNews.map((news, index) => {
            return `
                <article class="news-card fade-in" style="animation-delay: ${index * 0.1}s" onclick="newsManager.openNews(${news.id})">
                    <span class="news-tag">${this.escapeHtml(news.tag)}</span>
                    <h3 class="news-title">${this.escapeHtml(news.title)}</h3>
                    <p class="news-summary">${this.escapeHtml(this.truncateSummary(news.summary))}</p>
                    <div class="news-meta">
                        <span>${this.escapeHtml(news.source)}</span>
                        <span>${this.formatDate(news.date)}</span>
                    </div>
                </article>
            `;
        }).join('');
    }

    /**
     * 截断摘要
     */
    truncateSummary(summary) {
        if (!summary) return '';
        const maxLength = 100;
        if (summary.length <= maxLength) return summary;
        return summary.substring(0, maxLength) + '...';
    }

    /**
     * 打开新闻详情
     */
    openNews(newsId) {
        const news = this.newsCache?.find(n => n.id === newsId);
        if (news) {
            // 如果有 URL，直接打开链接
            if (news.url) {
                window.open(news.url, '_blank');
            } else {
                // 否则将新闻标题作为问题发送给 AI
                const chatInput = document.getElementById('chatInput');
                if (chatInput) {
                    chatInput.value = `请详细介绍一下：${news.title}`;
                    chatInput.focus();
                    // 滚动到对话区域
                    document.getElementById('chat')?.scrollIntoView({ behavior: 'smooth' });
                }
            }
        }
    }

    /**
     * 格式化日期
     */
    formatDate(dateStr) {
        if (!dateStr) return '今天';

        try {
            const date = new Date(dateStr);
            const now = new Date();
            const diff = now - date;

            if (diff < 86400000) { // 24小时内
                return '今天';
            } else if (diff < 172800000) { // 48小时内
                return '昨天';
            } else {
                return date.toLocaleDateString('zh-CN', {
                    month: 'short',
                    day: 'numeric'
                });
            }
        } catch {
            return dateStr;
        }
    }

    /**
     * HTML 转义
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 创建全局实例
let newsManager;
document.addEventListener('DOMContentLoaded', () => {
    newsManager = new NewsManager();
});

// 导出
window.NewsManager = NewsManager;
