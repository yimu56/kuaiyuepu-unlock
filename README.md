# 快乐谱 访问限制绕过（优化版）

一个 Tampermonkey / 油猴用户脚本。当访问快乐谱（kuaiyuepu.com）的简谱页被重定向到登录页时，
脚本会自动取回原始简谱内容并就地渲染，同时提供**右下角手动刷新按钮**和 **24 小时本地缓存**。

> **免责声明**：本项目仅供个人学习与研究浏览器脚本技术使用。请遵守目标网站的
> 服务条款、robots 协议与相关法律法规，并支持正版内容。因使用本脚本产生的一切后果
> 由使用者自行承担。作者与本站点无任何关联。

---

## 功能特性

| 特性 | 说明 |
| --- | --- |
| **随机 UA 池** | 每次请求从 5 条常见浏览器 UA 中随机选取一条，降低固定 UA 被识别/计数的概率 |
| **本地缓存** | 以页面完整 URL 为键缓存 HTML，默认有效期 24 小时；命中缓存时秒开且不发起请求 |
| **自动接管** | 检测到 `web/user.php?action=login&jumpto=/jianpu/...` 形式的登录重定向后，自动取回 `jumpto` 指向的简谱页 |
| **手动刷新** | 右下角绿色悬浮按钮，点击后清除 Cookie 并重新拉取目标页面，失败可重试 |
| **零依赖** | 单文件脚本，无需构建、无需安装任何依赖 |

## 安装

### 前置条件

浏览器需先安装用户脚本管理器：

- [Tampermonkey](https://www.tampermonkey.net/)（Chrome / Edge / Firefox / Safari 均可）
- 或 Violentmonkey、Userscripts（Safari）

### 方式一：直接安装（推荐）

打开 `kuaiyuepu-unlock.user.js` 的 Raw 地址，Tampermonkey 会自动弹出安装界面：

```
https://raw.githubusercontent.com/yimu56/kuaiyuepu-unlock/main/kuaiyuepu-unlock.user.js
```

### 方式二：手动新建

1. 点击浏览器扩展图标 → 打开 Tampermonkey 面板 → **添加新脚本**
2. 删除编辑器中的模板内容
3. 将 `kuaiyuepu-unlock.user.js` 的全部内容粘贴进去
4. `Ctrl + S` 保存

安装完成后访问快乐谱的简谱页面即可生效。

## 使用

正常浏览即可，脚本分三种情况处理：

1. **已能正常打开简谱页** → 不做任何干预，直接放行。
2. **被重定向到登录页，但目标页有缓存** → 立即用缓存内容渲染，不发起网络请求。
3. **被重定向到登录页，无缓存** → 自动清 Cookie 并携带随机 UA 请求原始页面，
   成功后写入缓存并渲染；失败则显示刷新按钮，供手动重试。

右下角出现 **「刷新简谱」** 按钮时，点击即可强制重新拉取当前简谱；失败时按钮会变为
**「失败，点击重试」**。

浏览器控制台的过滤关键字是 `[快乐谱绕过]`，可用于排查日志。

## 配置

脚本顶部的 `CONFIG` 对象集中了全部可调项：

```javascript
const CONFIG = {
    cacheExpire: 24 * 60 * 60 * 1000, // 缓存有效期，毫秒。默认 24 小时
    timeout: 15000,                   // 单次请求超时，毫秒。默认 15 秒
    autoFetch: true,                  // 检测到登录页时是否自动获取。false 则只显示按钮
    showButton: true,                 // 是否显示右下角手动刷新按钮
};
```

需要扩充或替换 UA 时，直接编辑 `UA_POOL` 数组即可。

## 工作原理

```
访问 /jianpu/xxx
      │
      ├─ 正常返回简谱页 ────────────────► 不做处理，直接放行
      │
      └─ 被重定向到 /web/user.php?action=login&jumpto=/jianpu/xxx
                 │
                 ├─ 命中 GM 缓存 ──────► document.write 渲染缓存 HTML
                 │
                 └─ 未命中缓存
                        │
                        ├─ 清空 kuaiyuepu.com 域下 Cookie
                        ├─ GM_xmlhttpRequest + 随机 UA 请求 jumpto 目标页
                        │      └─ 校验：status === 200 且响应体不含 action=login
                        ├─ 写入 GM 缓存（含时间戳）
                        └─ document.write 渲染 + 挂载刷新按钮
```

脚本通过 `@run-at document-start` 尽早介入，用 `document.open/write/close` 整体替换
文档内容，避免站点自身的脚本在被限制的页面上抢先执行。

## 项目结构

```
kuaiyuepu-unlock/
├── kuaiyuepu-unlock.user.js   # 脚本本体（唯一需要安装的文件）
├── README.md                  # 本文档
├── LICENSE                    # MIT 许可证
├── .gitignore
└── .gitattributes
```

## 已知限制

- **整体替换文档**：使用 `document.write` 重写页面，站点自身的脚本执行时序可能受影响；
  若页面出现样式或交互异常，优先点一次刷新按钮。
- **缓存键为完整 URL**：带不同查询参数的同一首简谱会各存一份缓存，长期使用可能占用
  少量扩展存储空间；卸载脚本或清除 Tampermonkey 存储即可释放。
- **依赖站点结构**：登录页判定条件是「路径含 `/web/user.php` 且查询串含 `action=login`」，
  简谱页判定条件是「URL 含 `/jianpu/`」。站点改版后需同步更新这两处判断。
- **不适用于其他站点**：`@match` 与 `@connect` 均限定在 `kuaiyuepu.com` 域内。

## 兼容性

在 Tampermonkey（Chrome / Edge / Firefox）下开发与验证，依赖 `GM_xmlhttpRequest`、
`GM_setValue`、`GM_getValue` 三个 API。Violentmonkey 同样提供这三个 API，理论可用但未逐项验证。

## 许可证

[MIT](LICENSE) © 2026 yimu56
