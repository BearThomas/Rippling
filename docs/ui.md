# UI 的三条硬规矩（以及怎么机器验）

这几条都不是"风格偏好"，是**同一件事有两个真相**或**Portal 常驻空遮罩**导致的真实 bug 类。
每次改 UI 之后跑一遍检查脚本，比肉眼看截图可靠：

```bash
npx wrangler@4 dev --config wrangler.worker.jsonc --port 8788 --local   # 另开一个终端
node scripts/check-layout.mjs     # 卡片行宽度与折叠区
node scripts/check-avatars.mjs    # 默认头像的颜色
```

## 一、默认头像只有一份实现

`src/frontend/src/components/user/UserAvatar.vue`

以前每个页面各写一遍"没头像就显示首字圆圈"，于是同一件事有四种写法：

| 位置 | 原来的样子 |
| --- | --- |
| 帖子卡片 / 帖子详情 | 主色 12% 淡底 + 主色字（有名字颜色时换成 14%） |
| 「我的」页那种大号 | **白字 + 实心主色** |
| 评论区 | 什么都没写（背景透明，像缺了一块） |
| 搜索页 / 关注列表 / 板块成员 | 又各抄了一遍 |

同一个人：首页是小蓝圈，进「我的」变成实心蓝，进评论区变成没底色。

现在所有地方都走 `<UserAvatar>`，规则只有一份：

- 有 `nameColor`（后端**按等级算**出来的，人人都有）→ 字色 = 名字颜色，底色 = 该色 14%
- 匿名内容 → 中性灰，不透露主色信息
- 都没有 → 主色 12%（兜底，真实数据一般走不到）

尺寸用 `size="xs|sm|md|lg|xl|2xl"`，**不传 class**：Tailwind 需要字面量才生成 CSS，
传 `"h-7 w-7"` 这种动态字符串扫不到。

`scripts/check-avatars.mjs` 会把各页面真正渲染出来的 `[data-avatar="default"]`
的 computed `color` / `background-color` 抓下来，要求**同一个首字在每个页面上完全一致**。
把某一处的 `:name-color` 去掉，它会立刻报出两种颜色（实测过）。

## 二、卡片行要跟容器一样宽

`<a class="card-base flex ...">` 会撑满（`display:flex` 让它变块级），
但同一个类名写在 `<button>` 上**不会** —— Chrome 里 button 的外框还是行内级。
「申请认证」就这么变成了 148px，夹在一列 456px 的卡片中间。

规矩：**行样式 + `flex` 的 `<button>` 必须显式写 `w-full`**（`<a>` 也建议写，图个明确）。

`scripts/check-layout.mjs` 逐页比较"卡片行宽度 vs 父容器**内容宽**"。
注意必须比内容宽（`clientWidth` 减去 padding/border）：
直接比 `getBoundingClientRect()` 会把"卡片放在有内边距的容器里"误报成不齐
（第一版就把 `/apps` 的 7 行全误报了）。

## 三、浮层交互原语与 Portal 防遮挡

弹窗、确认框、下拉菜单、选择器、开关与标签页统一使用 `src/frontend/src/components/common/` 中基于 `reka-ui` 封装的原语（`AppDialog` / `ConfirmDialog` + `useConfirm` / `AppDropdown` / `AppSelect` / `AppSwitch` / `AppTabs`），全站不再使用 `window.confirm()` 或手写全屏 `fixed inset-0` 遮罩。

编写或修改基于 `<DialogPortal>` / `<AlertDialogPortal>` 的组件时须遵守：

- `reka-ui` 关闭弹窗时只会卸载内部的 `*Overlay` / `*Content`，**Portal 自身仍常驻在 `<body>`**；
- 禁止在 `<*Portal>` 内放置无条件挂载的全屏定位 `div`，外层定位容器必须同时带 `v-if="open"` 与 `pointer-events-none`，并将 `pointer-events-auto` 挂在弹窗主体卡片上，否则关闭后会残留透明遮罩拦截整页点击。

整体视觉规范（Elk 主框架 + Memos 树洞区与语义 Token）见仓库根目录 [DESIGN.md](../DESIGN.md)。
