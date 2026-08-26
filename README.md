拼豆计时管理系统 · 功能介绍与使用指南
拼豆计时管理系统是一款专为拼豆手作工坊量身打造的全平台计时管理系统，适配桌面端与移动端，集成桌台计时、销售记录、作品储存管理等核心经营功能，轻量化、易上手，满足手作工坊日常经营需求。
✨ 核心功能特性
一、核心经营功能
- 智能计时管理：支持一键完成开台开始、暂停、结账、清空等操作，操作简洁高效
- 可视化桌台状态
  - 🟢 绿灯：桌台正常计时中
  - 🔵 蓝灯：桌台暂停状态
  - 🔴 红灯：消费超时提醒
- 分区桌台管理：划分A、B两大区域，支持多桌台同时独立计时、单独管理
- 作品储存管理：拼豆作品制作完成后，可自主记录储存日期，方便作品归档管理
- 完整销售记录：自动留存每日开台、消费、结账全流程数据，经营数据可追溯
- 数据持久化：基于本地 localStorage 存储数据，杜绝数据丢失问题
二、精致界面设计
- 液态玻璃质感：复刻Apple系统玻璃态UI，界面精致简约、颜值出众
- 双版本可选
  - v1 玻璃态版：https://sdole9.github.io/beandou/index.html
  - v3 拼豆手作定制版：https://sdole9.github.io/beandou/index-v3.html
- 全响应式适配：完美适配电脑、平板、手机等各类设备屏幕
- 自定义壁纸：支持自主上传、切换背景图片，个性化定制界面
三、移动端专属支持
- PWA原生体验：可添加至手机主屏幕，使用体验媲美原生APP
- 离线可用：依托Service Worker缓存技术，无网络环境也可正常使用
- 全平台兼容：全面支持iOS、Android两大手机系统
📱 快速上手 · 安装访问
访问地址
- v1 玻璃态版：https://sdole9.github.io/beandou/index.html
- v3 拼豆手作版：https://sdole9.github.io/beandou/index-v3.html
手机安装教程
iPhone（iOS系统）
1. 使用Safari浏览器打开对应系统网址
2. 点击页面分享按钮，选择「添加到主屏幕」
3. 完成添加后，可直接从手机桌面启动使用
Android（安卓系统）
1. 使用Chrome浏览器打开对应系统网址
2. 点击浏览器菜单，选择「添加到主屏幕/安装应用」
3. 安装完成后，桌面直接启动即可使用
🗂️ 项目文件结构
├── index.html &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;# v1 玻璃态版主页面
├── index-v3.html &nbsp;&nbsp;&nbsp;# v3 拼豆手作定制版主页面
├── styles.css &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;# v1 版本样式文件
├── styles-v3.css &nbsp;&nbsp;&nbsp;# v3 版本样式文件
├── app.js &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;# 系统核心逻辑文件
├── sw.js &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;# 离线缓存服务文件
├── manifest-v1.webmanifest &nbsp;# v1 PWA配置文件
├── manifest-v3.webmanifest &nbsp;# v3 PWA配置文件
└── icon.jpg &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;# 系统应用图标
🛠️ 项目技术栈
- 基础架构：纯 HTML / CSS / JavaScript，无需编译构建，轻量化部署
- 数据存储：LocalStorage 本地持久化存储
- 离线能力：Service Worker 离线缓存机制
- 应用适配：PWA 渐进式Web应用技术
📝 详细使用说明
1. 开台计时：点击对应桌台「开始」按钮，即可启动桌台计时，记录消费时长
2. 暂停计时：顾客中途休息时，点击「暂停」按钮暂停计时，避免无效计费
3. 结算结账：消费结束后点击「结账」，系统自动生成消费记录并留存数据
4. 作品储存：拼豆作品制作完成需寄存时，录入并记录作品储存日期
5. 数据查询：可在销售记录、储存记录页面，随时查看所有历史经营、寄存数据
🔄 更新日志
v1.0 初始版本
- 完成系统初始版本搭建与发布
- 上线拼豆计时、销售管理、作品储存管理核心功能
- 搭载液态玻璃质感UI界面
- 完成全移动端适配优化
- 支持PWA桌面安装、离线使用功能
📄 开源协议
本项目仅供学习研究、个人使用，请勿用于商业滥用。
Made with ❤️ for 拼豆手作工坊
