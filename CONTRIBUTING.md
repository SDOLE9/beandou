# 贡献指南

本项目是零依赖、零构建的纯静态项目，没有编译、打包、测试和 lint 流程，改动以人工验证为主。

## 本地运行

网页版必须经 HTTP 访问（Service Worker 与 PWA 在 `file://` 下不可用）：

```bash
# 方式一：Python
python -m http.server 8000

# 方式二：Node
npx --yes serve -l 8000 .
```

然后打开 `http://localhost:8000/index.html`。

微信小程序版：用微信开发者工具导入 `beandou-mp/` 目录（导入时填你自己的 AppID）。

## 改动约定

### 1. 改了 `app.js` 或 `styles.css`，必须同步递增缓存版本号

两个页面都通过带版本号的 query 引用静态资源，不改会导致线上继续用旧文件：

- `index.html`、`index-v4.html` 中的 `app.js?v=N`、`styles.css?v=N` 各 +1
- 涉及离线缓存行为时，同步改 `sw.js` 里的 `const CACHE = 'pdb-cache-vN'`

### 2. 两个页面共用同一份逻辑

`index.html` 与 `index-v4.html` 只差一行 `styles-v4.css` 引用，业务逻辑都在 `app.js`。
改功能时改 `app.js` 即可，两版同时生效；不要只改其中一个页面。

### 3. 计时模型不要改成累加

`tableRuntime()` 基于「起始时间戳与当前时间的差值」计算时长（`accumulatedMs + (now - sessionStart)`），
这是刷新、切后台、补记起始时间都能保持正确的前提。不要改成每秒 +1 的累加写法。

### 4. 代码风格

- 原生 JavaScript（ES2017+ 语法可用），不引入框架和依赖
- 沿用现有风格：函数声明式、模板字符串拼 HTML、状态集中在 `state` 并用 `saveState()` 落盘
- 用户输入渲染前用 `escHtml()` 转义

## 提交

- 分支：`main` 为发布分支，推送后 GitHub Pages 自动生效（无构建步骤）
- 提交信息简明说明改动点即可，例如：`计时：新增补记起始时间`
- 提交前确认：页面能正常打开、开台/暂停/结束主流程走通

## 数据

数据存在浏览器 `localStorage`（键名 `pindou_system_v1`），不上传服务器。
涉及数据结构变更时，注意 `loadState()` 对旧数据的兼容（缺字段要有默认值）。
