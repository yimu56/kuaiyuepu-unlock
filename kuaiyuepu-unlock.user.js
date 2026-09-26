// ==UserScript==
// @name         快乐谱访问助手
// @namespace    https://github.com/yimu56/kuaiyuepu-access-helper
// @version      0.4
// @description  快乐谱未登录访问辅助：基于时间动态生成随机UA + 本地缓存 + 手动刷新
// @author       yimu56
// @license      MIT
// @match        *://*.kuaiyuepu.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      kuaiyuepu.com
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 配置 ====================
    const CONFIG = {
        cacheExpire: 24 * 60 * 60 * 1000, // 缓存有效期 24 小时
        timeout: 15000,                   // 请求超时 15 秒
        autoFetch: true,                  // 检测到登录页时是否自动获取原始内容
        showButton: true,                 // 是否显示右下角手动刷新按钮
    };

    // ==================== 日志 ====================
    function log(...args) {
        console.log('[快乐谱助手]', ...args);
    }

    // ==================== 基于时间的随机 UA 生成 ====================

    // mulberry32 伪随机数生成器
    function createSeededRandom(seed) {
        let state = seed >>> 0;
        return function() {
            state |= 0;
            state = state + 0x6D2B79F5 | 0;
            let t = Math.imul(state ^ state >>> 15, 1 | state);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    function randInt(rand, min, max) {
        return Math.floor(rand() * (max - min + 1)) + min;
    }

    function pickWeighted(rand, items, weights) {
        const total = weights.reduce((a, b) => a + b, 0);
        let r = rand() * total;
        for (let i = 0; i < items.length; i++) {
            r -= weights[i];
            if (r <= 0) return items[i];
        }
        return items[items.length - 1];
    }

    // 生成 Windows UA
    function generateWindowsUA(rand) {
        const winVer = rand() > 0.15 ? 'Windows NT 10.0' : 'Windows NT 6.1';
        const arch = rand() > 0.25 ? 'Win64; x64' : 'WOW64';
        const browser = pickWeighted(rand, ['chrome', 'edge', 'firefox'], [0.5, 0.3, 0.2]);

        if (browser === 'chrome') {
            const v = randInt(rand, 118, 132);
            return `Mozilla/5.0 (${winVer}; ${arch}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`;
        }
        if (browser === 'edge') {
            const v = randInt(rand, 118, 132);
            return `Mozilla/5.0 (${winVer}; ${arch}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36 Edg/${v}.0.0.0`;
        }
        const v = randInt(rand, 115, 128);
        return `Mozilla/5.0 (${winVer}; ${arch}; rv:${v}.0) Gecko/20100101 Firefox/${v}.0`;
    }

    // 生成 macOS UA
    function generateMacUA(rand) {
        const macVer = pickWeighted(
            rand,
            ['10_15_7', '13_0_0', '13_6_0', '14_0_0', '14_2_0'],
            [0.3, 0.2, 0.2, 0.15, 0.15]
        );
        const browser = pickWeighted(rand, ['chrome', 'safari', 'firefox'], [0.4, 0.4, 0.2]);

        if (browser === 'chrome') {
            const v = randInt(rand, 118, 132);
            return `Mozilla/5.0 (Macintosh; Intel Mac OS X ${macVer}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`;
        }
        if (browser === 'safari') {
            const ver = randInt(rand, 16, 18);
            const sub = randInt(rand, 0, 6);
            const wkVer = '605.1.15';
            return `Mozilla/5.0 (Macintosh; Intel Mac OS X ${macVer}) AppleWebKit/${wkVer} (KHTML, like Gecko) Version/${ver}.${sub} Safari/${wkVer}`;
        }
        const v = randInt(rand, 115, 128);
        return `Mozilla/5.0 (Macintosh; Intel Mac OS X ${macVer}; rv:${v}.0) Gecko/20100101 Firefox/${v}.0`;
    }

    // 生成 Linux UA
    function generateLinuxUA(rand) {
        const distro = pickWeighted(
            rand,
            ['X11; Linux x86_64', 'X11; Ubuntu; Linux x86_64', 'X11; Fedora; Linux x86_64'],
            [0.5, 0.3, 0.2]
        );
        const browser = pickWeighted(rand, ['chrome', 'firefox'], [0.6, 0.4]);

        if (browser === 'chrome') {
            const v = randInt(rand, 118, 132);
            return `Mozilla/5.0 (${distro}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`;
        }
        const v = randInt(rand, 115, 128);
        return `Mozilla/5.0 (${distro}; rv:${v}.0) Gecko/20100101 Firefox/${v}.0`;
    }

    // 生成 Android UA
    function generateAndroidUA(rand) {
        const androidVer = randInt(rand, 11, 14);
        const devices = [
            'SM-S918B', 'SM-S928B', 'Pixel 6', 'Pixel 7', 'Pixel 8',
            'V2118A', 'M2102J20SG', 'CPH2451', 'ONEPLUS A6013'
        ];
        const device = devices[randInt(rand, 0, devices.length - 1)];
        const v = randInt(rand, 118, 132);
        return `Mozilla/5.0 (Linux; Android ${androidVer}; ${device}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Mobile Safari/537.36`;
    }

    // 生成 iOS UA
    function generateIOSUA(rand) {
        const iosVer = randInt(rand, 15, 17);
        const iosSubVer = randInt(rand, 0, 6);
        const isIPad = rand() > 0.7;
        const device = isIPad ? 'iPad' : 'iPhone';
        const ver = randInt(rand, 15, 17);
        const sub = randInt(rand, 0, 6);
        return `Mozilla/5.0 (${device}; CPU ${isIPad ? 'OS' : 'iPhone OS'} ${iosVer}_${iosSubVer} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${ver}.${sub} Mobile/15E148 Safari/604.1`;
    }

    // 对外暴露：每次调用都基于当前时间生成一个全新 UA
    function randomUA() {
        const seed = (Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0;
        const rand = createSeededRandom(seed);

        const os = pickWeighted(
            rand,
            ['windows', 'macos', 'linux', 'android', 'ios'],
            [0.45, 0.20, 0.10, 0.15, 0.10]
        );

        let ua;
        if (os === 'windows') ua = generateWindowsUA(rand);
        else if (os === 'macos') ua = generateMacUA(rand);
        else if (os === 'linux') ua = generateLinuxUA(rand);
        else if (os === 'android') ua = generateAndroidUA(rand);
        else ua = generateIOSUA(rand);

        log('本次随机 UA:', ua);
        return ua;
    }

    // 根据 UA 推断 Client Hints
    function getClientHintsFromUA(ua) {
        if (ua.includes('Windows NT')) return { platform: '"Windows"', mobile: '?0' };
        if (ua.includes('Macintosh')) return { platform: '"macOS"', mobile: '?0' };
        if (ua.includes('Android')) return { platform: '"Android"', mobile: '?1' };
        if (ua.includes('iPhone') || ua.includes('iPad')) return { platform: '"iOS"', mobile: '?1' };
        if (ua.includes('Linux')) return { platform: '"Linux"', mobile: '?0' };
        return { platform: '"Windows"', mobile: '?0' };
    }

    // ==================== URL 工具 ====================
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
            GM_setValue(key, null);
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
            const hints = getClientHintsFromUA(ua);

            log('请求原始页面:', url);
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: {
                    'User-Agent': ua,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Referer': 'https://www.kuaiyuepu.com/',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Sec-CH-UA-Mobile': hints.mobile,
                    'Sec-CH-UA-Platform': hints.platform
                },
                timeout: CONFIG.timeout,
                onload: function(response) {
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

        // 已在简谱页且不是登录页，说明正常访问
        if (window.location.href.includes('/jianpu/') && !isLoginPage()) {
            log('当前已是简谱页面，无需绕过');
            return;
        }

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
                        setTimeout(() => addRefreshButton(jumpto), 100);
                    }
                } else {
                    setTimeout(() => addRefreshButton(jumpto), 100);
                }
            }
        }
    }

    main();
})();