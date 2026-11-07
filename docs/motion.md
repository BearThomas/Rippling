# 动效：一套 token，五个复用件，三条红线

目标不是"到处加动画"，是**手感一致**：同样的动作在任何页面都是同样的时长和曲线。

## 三条红线（脚本会抓）

1. **只许动 `transform` / `opacity` / 颜色 / `grid-template-rows`**。
   `width`、`height`、`top/left`、`box-shadow`、`filter` 一律不行 ——
   前四个触发重排，`box-shadow`/`filter` 在 iPhone 8 这种 GPU 上直接掉帧。
   两个例外，都是**刻意**的、写进脚本里的：
   - `position: fixed` 元素上的 `width`（侧栏展开，不牵连别的元素布局）；
   - 教程聚光灯按 top/left/width/height 过渡（单个覆盖层，改 transform 会变形）。
2. **时长/曲线只从 token 取**：`--dur-fast` 120ms / `--dur-base` 180ms /
   `--dur-slow` 240ms，曲线 `--ease-out`。组件里不许再写裸的 `duration-300`。
3. **尊重"减少动态效果"**：系统设置和站内开关（设置 → 主题 → 减少动画）都要生效；
   显式选了"完整动画"的人无视系统设置（他明确表示要看）。

## 五个复用件

| 东西 | 在哪 | 说明 |
| --- | --- | --- |
| `.pressable` | `styles/main.css` | 可点区域统一的"按下去"：缩放 0.98 + 略变淡，120ms。原来 29 处各写 `active:opacity-80`，力度都不一样 |
| `.card-base` | 同上 | 只给颜色加过渡：切主题、hover 都不硬跳 |
| `.collapse` + `<Collapse>` | `components/common/Collapse.vue` | 展开收起用 `grid-template-rows: 0fr → 1fr`，不用事先知道高度。老 Safari 不支持这个动画，那边瞬间展开（降级不坏） |
| `.skeleton` + `<FeedSkeleton>` | `components/common/FeedSkeleton.vue` | 骨架屏代替转圈：形状先出来，内容到位时几乎不跳 |
| `motion` store | `stores/motion.ts` | 动效偏好（跟随系统 / 减少 / 完整），跟主题一样存本地 |

## 为什么不做整页路由转场

首屏刚从 2.1s 优化到 0.33s，加一层淡入淡出会把感知速度拖回去，还会破坏滚动位置恢复。
真要做"连续感"就走**渐进增强**（`document.startViewTransition`，Chrome / 新 Safari 才有），
不支持就干脆没有动画 —— iPhone 8 最高 iOS 16，本来也不支持，别为它付出首屏代价。

## 验收

`node scripts/check-motion.mjs`（8 项）

- **动效审计**：不看 CSS 源码，读**每个元素的实际 computed style**（62 个元素在过渡/动画），
  发现动了重属性就报出选择器和属性名。※ 第一版是扫 CSSOM 规则的，结果自己写的
  `transition:` 简写读不到（`getPropertyValue('transition-property')` 对简写返回空串），
  Tailwind 的长写又能读到 —— 审出来是两套标准的混合，不可信，所以改成按元素查。
- **按压反馈真的存在**：用 CDP `CSS.forcePseudoState` 强制 `:active`，读真实 `transform`，
  必须是 `scale(0.98)` 且时长 ≤200ms。只写个类名不算。
- **减少动态效果两条路都验**：模拟 `prefers-reduced-motion: reduce` → 过渡时长归零；
  站内开关 → 同样归零；显式选 full → 无视系统设置。
- **滚动帧率**：rAF 采样 p95（无头环境只作参考，真机看 iPhone 8）。

证伪过两次：给 `.pressable` 偷偷加一条 `box-shadow` 过渡 → 报
`transition:box-shadow @ /settings button.btn-secondary…`；把减少动效的 media 查询改坏 →
`实际 0.12s, 0.18s…`。然后把断言写清楚，别让"差不多"混过去。
