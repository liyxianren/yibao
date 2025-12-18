/**
 * 智慧医保助手 - 主逻辑文件
 * 页面初始化、导航、动画等
 */

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    initPageLoader();
    initNavigation();
    initScrollEffects();
    initAnimations();
    initStatCounters();
    initMouseGlow();
});

/**
 * 页面加载动画
 */
function initPageLoader() {
    const loader = document.getElementById('pageLoader');
    if (loader) {
        // 延迟隐藏加载动画，让用户看到效果
        setTimeout(() => {
            loader.classList.add('hidden');
            // 完全隐藏后移除元素
            setTimeout(() => {
                loader.remove();
            }, 500);
        }, 800);
    }
}

/**
 * 鼠标跟随光效
 */
function initMouseGlow() {
    const glow = document.getElementById('mouseGlow');
    if (!glow) return;

    let mouseX = 0;
    let mouseY = 0;
    let glowX = 0;
    let glowY = 0;

    // 监听鼠标移动
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    // 平滑跟随动画
    function animateGlow() {
        const speed = 0.15;
        glowX += (mouseX - glowX) * speed;
        glowY += (mouseY - glowY) * speed;

        glow.style.left = glowX + 'px';
        glow.style.top = glowY + 'px';

        requestAnimationFrame(animateGlow);
    }

    animateGlow();

    // 鼠标离开窗口时隐藏光效
    document.addEventListener('mouseleave', () => {
        glow.style.opacity = '0';
    });

    document.addEventListener('mouseenter', () => {
        glow.style.opacity = '1';
    });
}

/**
 * 初始化导航功能
 */
function initNavigation() {
    const navbar = document.querySelector('.navbar');
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-link');

    // 创建移动端导航遮罩
    const overlay = document.createElement('div');
    overlay.className = 'nav-overlay';
    document.body.appendChild(overlay);

    // 移动端菜单切换
    navToggle?.addEventListener('click', () => {
        navToggle.classList.toggle('active');
        navMenu.classList.toggle('active');
        overlay.classList.toggle('active');
        document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
    });

    // 点击遮罩关闭菜单
    overlay.addEventListener('click', () => {
        navToggle?.classList.remove('active');
        navMenu?.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    });

    // 点击导航链接后关闭菜单
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navToggle?.classList.remove('active');
            navMenu?.classList.remove('active');
            overlay.classList.remove('active');
            document.body.style.overflow = '';

            // 更新活动状态
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    // 滚动时导航栏样式变化
    let lastScrollY = 0;
    window.addEventListener('scroll', () => {
        const currentScrollY = window.scrollY;

        if (currentScrollY > 50) {
            navbar?.classList.add('scrolled');
        } else {
            navbar?.classList.remove('scrolled');
        }

        lastScrollY = currentScrollY;
    });

    // 根据滚动位置更新导航活动状态
    updateActiveNavOnScroll();
}

/**
 * 根据滚动位置更新导航活动状态
 */
function updateActiveNavOnScroll() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');

    const observerOptions = {
        rootMargin: '-20% 0px -80% 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.id;
                navLinks.forEach(link => {
                    link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
                });
            }
        });
    }, observerOptions);

    sections.forEach(section => observer.observe(section));
}

/**
 * 初始化滚动效果
 */
function initScrollEffects() {
    // 平滑滚动到锚点
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const headerOffset = 80;
                const elementPosition = target.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

/**
 * 初始化页面动画
 */
function initAnimations() {
    // 元素进入视口时的动画
    const animatedElements = document.querySelectorAll(
        '.feature-card, .news-card, .section-header'
    );

    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const animationObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
                animationObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);

    animatedElements.forEach(el => {
        el.style.opacity = '0';
        animationObserver.observe(el);
    });
}

/**
 * 初始化数字计数器动画
 */
function initStatCounters() {
    const counters = document.querySelectorAll('.stat-number[data-count]');

    const observerOptions = {
        threshold: 0.5
    };

    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const counter = entry.target;
                const target = parseInt(counter.dataset.count, 10);
                animateCounter(counter, target);
                counterObserver.unobserve(counter);
            }
        });
    }, observerOptions);

    counters.forEach(counter => counterObserver.observe(counter));
}

/**
 * 数字计数动画
 */
function animateCounter(element, target) {
    const duration = 2000;
    const frameDuration = 1000 / 60;
    const totalFrames = Math.round(duration / frameDuration);
    const easeOutQuad = t => t * (2 - t);

    let frame = 0;
    const countTo = target;

    const counter = setInterval(() => {
        frame++;
        const progress = easeOutQuad(frame / totalFrames);
        const currentCount = Math.round(countTo * progress);

        if (parseInt(element.innerText, 10) !== currentCount) {
            element.innerText = formatNumber(currentCount);
        }

        if (frame === totalFrames) {
            clearInterval(counter);
            element.innerText = formatNumber(target);
        }
    }, frameDuration);
}

/**
 * 格式化数字（添加千分位）
 */
function formatNumber(num) {
    if (num >= 10000) {
        return (num / 10000).toFixed(0) + '万+';
    }
    return num.toLocaleString();
}

/**
 * 工具函数：防抖
 */
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

/**
 * 工具函数：节流
 */
function throttle(func, limit) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * 显示 Toast 提示
 */
function showToast(message, type = 'info', duration = 3000) {
    // 移除已有的 toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-message">${message}</span>
    `;

    // 添加样式
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        background: ${type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(102, 126, 234, 0.9)'};
        color: white;
        border-radius: 8px;
        font-size: 14px;
        z-index: 10000;
        animation: toastIn 0.3s ease;
        backdrop-filter: blur(10px);
    `;

    document.body.appendChild(toast);

    // 自动移除
    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// 添加 Toast 动画样式
const toastStyles = document.createElement('style');
toastStyles.textContent = `
    @keyframes toastIn {
        from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    }
    @keyframes toastOut {
        from {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
        to {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
        }
    }
`;
document.head.appendChild(toastStyles);

/**
 * API 配置更新（供管理后台使用）
 */
function updateAPIConfig(config) {
    if (config.accessToken) {
        cozeAPI.setAccessToken(config.accessToken);
    }
    if (config.chatWorkflowId) {
        cozeAPI.setWorkflowId('chat', config.chatWorkflowId);
    }
    if (config.newsWorkflowId) {
        cozeAPI.setWorkflowId('news', config.newsWorkflowId);
    }
    showToast('配置已更新', 'info');
}

// 导出到全局
window.showToast = showToast;
window.updateAPIConfig = updateAPIConfig;
window.debounce = debounce;
window.throttle = throttle;

// 页面可见性变化处理
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        // 页面重新可见时，可以刷新数据等
        console.log('页面已可见');
    }
});

// 控制台输出项目信息
console.log('%c 智慧医保助手 ', 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 8px 16px; border-radius: 4px; font-size: 16px; font-weight: bold;');
console.log('%c Powered by COZE AI ', 'color: #667eea; font-size: 12px;');
