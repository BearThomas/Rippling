# 推荐流

> 首页"推荐"这一列是怎么排序的、哪些参数能调、改完为什么有时候"看不出来"。

## 公式

```
score = like × w_like
      + comment × w_comment
      + 是否关注作者 × w_follow
      + 是否同板块 × w_block
      + time_decay × w_time
      + random(id) × w_random
      + 类型基础分
```

| 项 | 说明 |
|---|---|
| `like` / `comment` | 点赞数、顶级评论数 |
| `follow` / `block` | 布尔项：关注了作者 / 该作者的帖子在你的板块里 |
| `time_decay` | `1 / (1 + 小时数 / 24)`：刚发的≈1，24 小时≈0.5，48 小时≈0.33 |
| `random(id)` | 基于内容 id 的**稳定** hash（不是每次随机），保证翻页不重复不漏 |
| 类型基础分 | 帖子 0 / 表白墙 5 / 大事记 8 / 投票 6（可调） |

## 哪些参数能调

管理面板 → **站点配置**：

- **推荐流权重**：`like / comment / follow / block / time / random` 六个系数
- **推荐流 · 类型基础分**：`post / confession / timeline / vote` 四个加数

保存后**下一次请求就生效**（每次请求都会重新读一遍 `site_config`）。

> 历史坑：早期版本里这六个权重被写死在后端（`const weights = DEFAULT_WEIGHTS`），
> 管理面板改得再起劲，推荐流也完全不看。现在权重和基础分都从数据库读，
> 非法值（负数 / NaN / 非数字）逐项回落到默认值，上限 1000。

## 为什么改了参数"看不出来"

不是没生效，常见有三种原因：

1. **类型基础分在权重之后加**。大事记的 8 分是硬加数：你把 `time` 从 2 调到 4，
   对一篇刚发的帖子也就是 `+2`，追不上大事记的 `+8`。想让某类内容更容易上来，
   调"类型基础分"，而不是只调权重。
2. **候选池只有最近 300 条/类**。评分和权限过滤都在内存里做，所以每一类先取
   最新的 300 条候选（`FETCH_LIMIT`）。再老的内容不会参与排序 —— 它不是因为
   分数低，而是根本没进候选池。
3. **权重作用在相对量上**。`like` 从 1 调到 2，只有当某个内容本来就有很多赞时
   才看得出顺序变化；内容都很新、赞都很接近时，顺序不会变。

调参想看效果，最直接的办法是跑一遍断言：

```bash
node scripts/test-recommend.mjs http://127.0.0.1:8788   # 或线上地址
```

它会临时把权重改成极端值，检查分数真的跟着变（全 0 → 分数归零、只给时间 →
按时间倒序、只给随机 → 分数散开、投票基础分 50 → 投票排第一），最后把配置改回去。

## 分页

游标是 `(score, id)`：`WHERE score < lastScore OR (score = lastScore AND id > lastId)`。

已知的轻微问题：`time_decay` 依赖"当前时间"，两次翻页之间分数会有一点点漂移，
正好卡在游标附近的条目理论上可能重复或漏掉。实际影响很小（毫秒级的时间差
对应的分数差远小于两条内容之间的差距），没有为它引入快照表。

## 代码在哪

- 打分与排序：`src/db/recommend.ts`（`listRecommendations`）
- 权重/基础分的读取与兜底：同文件的 `normalizeWeights` / `normalizeTypeBonus`
- 配置存储：D1 `site_config`（key = `site_config`）中的 `recommendWeights` /
  `recommendTypeBonus`，没有就用内置默认值
- 管理面板：`src/frontend/src/components/admin/AdminConfigPanel.vue`
