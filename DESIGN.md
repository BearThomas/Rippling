# Rippling UI 设计改造规范（Elk 主框架 + Memos 树洞区）

本规范面向 [HZX0831/Rippling](https://github.com/HZX0831/Rippling) 前端工程（`src/frontend`，技术栈为 Vue 3 + TypeScript + Pinia + Vue Router + Tailwind CSS v3），可直接放在仓库根目录供 Antigravity CLI (`agy`) 与设计 Skill 读取执行。

## 1. 整体视觉定位与双模式原则

Rippling 是校园社区论坛，同时包含「高频浏览的帖子流」与「偏情绪表达的表白墙/提问箱」。本次改造采用 **1 主 + 1 副** 的视觉分工，避免全站千篇一律或视觉过载：

* **主框架参照 [Elk](https://github.com/elk-zone/elk)**：负责全局导航骨架、首页帖子流、板块页、帖子详情、通知与个人主页。核心气质是**克制、通透、低噪音**——去掉多余的厚重阴影和双层卡片嵌套，用 `1px` 极淡分割线、宽敞留白和清晰的字重层级建立秩序。
* **副视觉参照 [Memos](https://github.com/usememos/memos)**：负责表白墙（`ConfessionView` / `ConfessionDetailView`）与提问箱（`QuestionBoxView`）。核心气质是**柔和、轻盈、有温度**——在极淡暖灰画布上放置轻边框纯白卡片，顶部提供简洁的内联发布框，正文突出舒适的 Markdown 阅读节奏。

## 2. 配色体系与 CSS 变量（浅色 / 深色）

全站遵循 **90% 中性灰白 + 1 个品牌主色 + 克制语义色** 原则，保证正文与背景对比度达到 WCAG AA（≥ 4.5:1）。建议在 `src/frontend/src/styles/` 中统一定义以下 CSS 变量并映射到 `tailwind.config.ts`：

| 语义 Token | 浅色模式（Light） | 深色模式（Dark） | 用途说明 |
| :--- | :--- | :--- | :--- |
| `--bg-canvas` | `#FFFFFF` | `#111214` | Elk 主信息流画布背景 |
| `--bg-canvas-soft` | `#F7F7F5` | `#16171A` | Memos 树洞区画布、右侧辅助栏、次级底色 |
| `--bg-surface` | `#FFFFFF` | `#1B1D21` | Memos 轻白卡、弹窗、下拉菜单表面 |
| `--bg-hover` | `#F4F4F5` | `#23262B` | 列表行悬停、侧边栏菜单项悬停 |
| `--border-subtle` | `#E8E8EC` | `#272A30` | 主信息流极细 `1px` 分割线、轻卡片描边 |
| `--border-strong` | `#D4D4DC` | `#383C45` | 输入框默认边框、聚焦前轮廓 |
| `--text-primary` | `#18181B` | `#F4F4F5` | 帖子标题、正文、用户名 |
| `--text-secondary` | `#52525B` | `#A1A1AA` | 摘要、评论正文、次级按钮文字 |
| `--text-muted` | `#8B8B96` | `#71717A` | 时间戳、浏览数、占位符、辅助说明 |
| `--accent` | `#2563EB`（或校园主色） | `#60A5FA` | 主操作按钮、当前导航高亮、链接与点赞激活态 |
| `--accent-soft` | `#EFF6FF` | `rgba(96, 165, 250, 0.14)` | 选中态浅底、轻量标签背景 |
| `--accent-warm` | `#E11D48` | `#FB7185` | 仅用于表白墙心动图标、收藏或高优提醒 |
| `--danger` | `#DC2626` | `#F87171` | 删除、举报、表单报错 |

> 如需更换校园主色，只改 `--accent` 与 `--accent-soft` 两个变量即可，不要给每个板块分配高饱和度彩虹色。

## 3. 排版与信息层级

* **字体栈**：优先使用系统无衬线字体，兼顾中文清晰度与渲染速度：
  `Inter, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, -apple-system, sans-serif`；代码块使用 `JetBrains Mono, ui-monospace, SFMono-Regular, monospace`。
* **字号与字重规范**：

| 信息层级 | 字号 / 行高 | 字重 | 颜色 Token | 适用位置 |
| :--- | :--- | :--- | :--- | :--- |
| 页面顶栏标题 | `18px / 24px` | `600` | `--text-primary` | 吸顶 Header（如「广场」「表白墙」「提问箱」） |
| 帖子详情主标题 | `20px–22px / 30px` | `700` | `--text-primary` | `PostDetailView` 顶部标题 |
| 列表帖子标题 | `15px–16px / 22px` | `600` | `--text-primary` | `HomeView`、`BlockDetailView` 帖子行 |
| 正文与评论 | `14px–15px / 24px` | `400` | `--text-primary` / `--text-secondary` | Markdown 渲染正文、表白墙内容、回复 |
| 元信息与标签 | `12px–13px / 18px` | `400`–`500` | `--text-muted` | 作者名后时间、板块标签、评论/点赞计数 |

* **Markdown 排版（`components/markdown/`）**：保持 `marked` + `DOMPurify` 安全链路不变；段落间距 `0.75rem`，代码块采用 `--bg-canvas-soft` 底色 + `1px` 细边框，引用块使用左侧 `3px` `--border-strong` 竖线，图片统一 `rounded-lg` 且最大高度受控防止撑爆信息流。

## 4. 间距、圆角与“反 AI 味”禁令

* **圆角阶梯**：小标签/胶囊按钮用 `rounded-full`；输入框与普通按钮用 `rounded-lg`（`8px`）；Memos 轻白卡与弹窗用 `rounded-xl`（`12px`）。不要混用 `rounded-3xl` 与直角。
* **间距节奏**：页面区块间留白明显大于卡片内部留白；单条帖子行内边距统一 `px-4 py-3.5`（桌面 `px-5 py-4`），Memos 卡片内边距 `p-4` 且卡片间距 `gap-3`。
* **严格禁止的视觉噪音**：
  * 禁止给首页每条帖子套厚重外阴影（`shadow-md` / `shadow-lg`），主信息流只用 `border-b border-[var(--border-subtle)]` 分隔。
  * 禁止卡片里面再套带边框的二级卡片（引用回复或附件预览仅用 `--bg-canvas-soft` 浅底色区分）。
  * 禁止使用渐变紫蓝按钮、玻璃拟态大面积滥用或高饱和度多色板块徽章；板块标签统一用极淡灰底（或极淡主色底）+ 清晰文字。
  * 禁止在移动端挤占阅读宽度：小屏主内容区左右外边距归零或极窄，确保单行可读字数充足。

## 5. 响应式布局骨架（`components/layout/`）

### 桌面端（`>= 1024px`）：Elk 三栏居中结构

* **容器总宽**：最大宽度 `1200px` 居中，三栏比例清晰且中间主栏锁定最佳阅读宽度。
* **左栏（主导航，`220px–240px`，`sticky top-0`）**：
  * 顶部放 Rippling 简洁 Logo。
  * 纵向极简导航项（图标 + 16px 文字）：首页广场、板块、表白墙、提问箱、大事记/应用、通知（带简洁小红点）、个人主页、管理入口（按权限展示）。
  * 底部放一个醒目但不浮夸的「发布」主按钮与浅/深色切换入口。
* **中栏（主内容区，`640px–680px`）**：
  * 顶部 `52px` 吸顶半透明顶栏（`backdrop-blur-md` + `border-b`），左侧放当前页标题或返回按钮，右侧放筛选/搜索入口。
  * 左右两侧用极细 `1px` 边框与左右栏隔开（Elk 标志性结构）。
* **右栏（辅助发现区，`260px–280px`，`>= 1280px` 显示）**：
  * 顶部轻量搜索框。
  * 热门板块快速入口、社区大事记/公告摘要（纯轻量列表，不堆砌花哨统计大卡）。

### 平板端（`768px–1023px`）与移动端（`< 768px`）

* **平板端**：隐藏右栏，左栏折叠为 `68px` 纯图标侧边栏，中栏自适应填满。
* **移动端**：隐藏左右两栏；顶部保留精简吸顶顶栏（标题 + 搜索/返回），底部固定 5 个核心入口的 Tab 栏（广场、板块、表白墙、应用、我的），表白墙与首页等按需提供右下角悬浮发布按钮（FAB）。

## 6. Rippling 页面与视觉模式映射表

| 模块 / 视图文件 | 采用风格 | 核心改造要点 |
| :--- | :--- | :--- |
| `HomeView.vue`、`BlockDetailView.vue`、`SearchView.vue` | **Elk 无边框信息流** | 极细分割线分隔每一条帖子；顶部作者头像 + 昵称 + 时间 + 轻量板块胶囊；正文限 3–4 行截断；底部低对比度评论/点赞/分享操作栏，悬停才显强调色 |
| `PostDetailView.vue`、`CommentDetailView.vue` | **Elk 详情阅读流** | 顶部返回顶栏；正文区字号略放大、行高 `1.7`；评论区采用扁平时间轴或最多 2 层轻量缩进，评论框固定在内容下方或吸底 |
| `BlocksView.vue`、`AppsView.vue` | **Elk 轻量目录网格** | 2 列简洁板块列表（图标 + 名称 + 一句话简介 + 帖子数），去掉花哨封面渐变 |
| `ConfessionView.vue`、`ConfessionDetailView.vue` | **Memos 轻白卡流** | 画布切为 `--bg-canvas-soft`；顶部放可一键展开的匿名/实名表白发布框；下方为 `rounded-xl` 轻边框纯白卡片流，时间戳与匿名标识克制置于顶部，心动/评论按钮轻巧对齐左下角 |
| `QuestionBoxView.vue` | **Memos 问答卡片流** | 同样采用 `--bg-canvas-soft` 画布 + 轻白卡；每张卡片内分为「提问区（浅灰微底或左侧竖线）」与「回答区（纯白主文）」，层次一目了然 |
| `NotificationView.vue`、`UserProfileView.vue`、`FollowListView.vue` | **Elk 紧凑列表** | 顶部横向 Tab（下划线指示器 `AppTabs`）切换分类；个人主页采用简洁纯色顶条 + 清晰统计数字 + 分割线动态流 |
| `PostCreateView.vue`、`LoginView.vue`、`RegisterView.vue`、`SettingsView.vue` | **极简表单页** | 单栏居中（`max-w-lg` / `max-w-2xl`），充足输入内边距、清晰标签与错误提示；发帖页提供「写作 / 预览」简洁切换 |
| `AdminView.vue`、`AdminLogView.vue` | **克制工具页** | 复用同一套灰阶与边框 Token，表格行高紧凑、操作按钮用轻量文字或描边样式，保持和前台一致的干净观感 |

## 7. 交互、动效与无障碍底线

* **保留并收敛现有动效**：沿用 `src/frontend/src/styles/` 已有的按压反馈与 `.disclosure` 折叠过渡，所有过渡时长控制在 `150ms–200ms`（`ease-out`），避免夸张弹跳。
* **复杂浮层建议接入 [Reka UI](https://reka-ui.com/)**：弹窗（Dialog）、下拉菜单（DropdownMenu）、弹出气泡（Popover）、Tabs 等交互原语优先使用 `reka-ui` 处理焦点陷阱、ESC 关闭、外部点击关闭和键盘导航，样式仍由 Tailwind 控制。
* **骨架屏与空状态**：列表加载时提供与帖子/卡片结构一致的柔和骨架屏，空列表提供简洁图标 + 一句话引导，避免裸露的“暂无数据”纯文本。
