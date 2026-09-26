// ==UserScript==
// @name         快乐谱 访问限制绕过（优化版）
// @name:en      Kuaiyuepu Unlock
// @namespace    https://github.com/yimu56/kuaiyuepu-unlock
// @version      0.3.0
// @description  绕过快乐谱未登录访问限制：随机 UA + 本地缓存 + 手动刷新按钮
// @description:en  Bypass the login wall on kuaiyuepu.com with random UA, local cache and a manual refresh button.
// @author       yimu56
// @license      MIT
// @homepageURL  https://github.com/yimu56/kuaiyuepu-unlock
// @supportURL   https://github.com/yimu56/kuaiyuepu-unlock/issues
// @match        *://*.kuaiyuepu.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      kuaiyuepu.com
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置 ====================
    const CONFIG = {
        cacheExpire: 24 * 60 * 60 * 1000, // 缓存有效期 24 小时
        timeout: 15000,                   // 请求超时 15 秒
        autoFetch: true,                  // 检测到登录页时是否自动获取原始内容
        showButton: true,                 // 是否显示右下角手动刷新按钮
    };

    // 随机 UA 池，每次请求随机选一个，降低被固定 UA 计数的概率
    const UA_POOL = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
        'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    ];

    // ==================== 工具函数 ====================
    function log(...args) {
        console.log('[快乐谱绕过]', ...args);
    }

    function randomUA() {
        return UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
    }

    function getUrlParam(url, param) {
        try {
            return new URL(url).searchParams.get(param);
        } catch (e) {
            return null;
        }
    }

    function isLoginPage() {
        return window.location.pathname.includes('/web/user.php') &&
               window.location.search.includes('action=login');
    }

    function isJianpuPage(url) {
        return url && url.includes('/jianpu/');
    }

    function getJumptoFromLoginPage() {
        const jumpto = getUrlParam(window.location.href, 'jumpto');
        return jumpto ? decodeURIComponent(jumpto) : null;
    }

    function clearAllCookies() {
        document.cookie.split(';').forEach(cookie => {
            const name = cookie.split('=')[0].trim();
            document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
            document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.kuaiyuepu.com';
        });
        log('已清除 Cookie');
    }

    // ==================== 缓存 ====================
    function getCacheKey(url) {
        return 'kuaiyuepu_cache_' + url;
    }

    function getCache(url) {
        const key = getCacheKey(url);
        const cached = GM_getValue(key, null);
        if (!cached) return null;
        if (Date.now() - cached.time > CONFIG.cacheExpire) {
            GM_setValue(key, null); // 过期清除
            return null;
        }
        log('命中缓存:', url);
        return cached.html;
    }

    function setCache(url, html) {
        const key = getCacheKey(url);
        GM_setValue(key, { time: Date.now(), html: html });
        log('已缓存页面:', url);
    }

    // ==================== 网络请求 ====================
    function fetchOriginalPage(url) {
        return new Promise((resolve, reject) => {
            const ua = randomUA();
            log('请求原始页面:', url, '| UA:', ua);
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: {
                    'User-Agent': ua,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Referer': 'https://www.kuaiyuepu.com/',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                timeout: CONFIG.timeout,
                onload: function (response) {
                    log('请求完成，状态码:', response.status);
                    if (response.status === 200 &&
                        response.responseText &&
                        !response.responseText.includes('action=login')) {
                        resolve(response.responseText);
                    } else {
                        reject(new Error('返回内容不是有效的简谱页面，状态码: ' + response.status));
                    }
                },
                onerror: reject,
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }

    // ==================== 页面替换 ====================
    function replacePageContent(html) {
        log('替换页面内容...');
        document.open();
        document.write(html);
        document.close();
    }

    // ==================== 浮动刷新按钮 ====================
    function addRefreshButton(targetUrl) {
        if (!CONFIG.showButton) return;
        // 避免重复添加
        if (document.getElementById('kuaiyuepu-refresh-btn')) return;

        const btn = document.createElement('div');
        btn.id = 'kuaiyuepu-refresh-btn';
        btn.textContent = '刷新简谱';
        btn.style.cssText = `
            position: fixed;
            right: 20px;
            bottom: 20px;
            z-index: 999999;
            background: #18B22A;
            color: #fff;
            padding: 10px 16px;
            border-radius: 20px;
            font-size: 14px;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            user-select: none;
            transition: transform 0.2s, opacity 0.2s;
        `;
        btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.05)'; });
        btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });

        btn.addEventListener('click', async () => {
            btn.textContent = '加载中...';
            btn.style.opacity = '0.7';
            try {
                clearAllCookies();
                const html = await fetchOriginalPage(targetUrl);
                setCache(targetUrl, html);
                replacePageContent(html);
                // 替换后重新添加按钮
                setTimeout(() => addRefreshButton(targetUrl), 100);
            } catch (e) {
                log('手动刷新失败:', e.message);
                btn.textContent = '失败，点击重试';
            } finally {
                btn.style.opacity = '1';
            }
        });

        document.body.appendChild(btn);
        log('已添加刷新按钮');
    }

    // ==================== 主流程 ====================
    async function main() {
        log('脚本已加载，当前 URL:', window.location.href);

        // 如果当前已经在简谱页面且不是登录页，说明访问正常，无需处理
        if (window.location.href.includes('/jianpu/') && !isLoginPage()) {
            log('当前已是简谱页面，无需绕过');
            return;
        }

        // 检测是否被重定向到登录页
        if (isLoginPage()) {
            const jumpto = getJumptoFromLoginPage();
            if (jumpto && isJianpuPage(jumpto)) {
                log('检测到登录重定向，目标页面:', jumpto);

                // 1. 先尝试缓存
                const cachedHtml = getCache(jumpto);
                if (cachedHtml) {
                    replacePageContent(cachedHtml);
                    setTimeout(() => addRefreshButton(jumpto), 100);
                    return;
                }

                // 2. 自动获取
                if (CONFIG.autoFetch) {
                    try {
                        clearAllCookies();
                        const html = await fetchOriginalPage(jumpto);
                        setCache(jumpto, html);
                        replacePageContent(html);
                        setTimeout(() => addRefreshButton(jumpto), 100);
                    } catch (e) {
                        log('自动获取失败:', e.message);
                        // 失败时也添加按钮，让用户手动重试
                        setTimeout(() => addRefreshButton(jumpto), 100);
                    }
                } else {
                    // 不自动获取，仅提供手动按钮
                    setTimeout(() => addRefreshButton(jumpto), 100);
                }
            }
        }
    }

    main();
})();
