# 置顶机制

> 本文说明"置顶"到底改了什么、哪里能看到、权限怎么判。
> 改这里之前先看一眼，置顶以前坏就坏在"写一处、读另一处"。

## 一句话

**帖子置顶只改 `post.isPinned`；大事记 / 投票置顶才写 `pinned_item` 表。**
首页"置顶内容"区是两者的并集，并且这些内容不会再出现在下面的推荐列表里。

## 两种置顶

| | 帖子置顶 | 大事记 / 投票置顶 |
|---|---|---|
| 状态的唯一真相 | `post.isPinned`（0/1） | `pinned_item` 表的一行 |
| 唯一写入口 | `POST /api/post/pin`（切换语义） | `POST /api/recommend/pin` / `DELETE /api/recommend/pin` |
| 需要的权限 | 非板块帖：`pin_post`<br>板块帖：板块内 `block_pin_post` | 全站 `pin_post` |
| 生效位置 | 首页置顶区 + **板块帖子流置顶优先** | 首页置顶区 |
| 期限 | 无（取消 / 删除 / 归档后消失） | `expiresAt`，`null` 表示永久 |
| 读取 | `db/pinned.ts` 的 `listActivePinned` | 同上 |

## 为什么不是一张表

`pinned_item` 支持"期限 + 多类型"，但帖子的置顶还要区分"全站权限"与"板块权限"，
而且板块帖子流需要一个能直接排序的列（`ORDER BY isPinned DESC, createdAt DESC`）。
两套机制并存没问题，**真正的问题是同一件事有两个写入口**：

- 以前点"置顶"只写 `post.isPinned`，而首页置顶区只读 `pinned_item`
  → 置顶成功、首页什么都没变；
- `/api/recommend/pin` 不校验目标是否存在，随便传个 id 也返回成功
  → "置顶成功"但永远看不到；
- 板块帖子流不按 `isPinned` 排序
  → 板块内置顶点了等于没点。

现在的约定：**每种内容只有一个写入口**，读的时候再合并。

## 接口

### 帖子

```
POST /api/post/pin        { "id": "<postId>" }
→ { "success": true, "data": { "pinned": true } }
```

切换语义：置顶→取消置顶→置顶。返回的是**切换后的真实状态**，
前端不要再自己取反（以前后端没改成功时，界面照样显示"已置顶"）。

无权限与帖子不存在都返回 404（不区分，避免泄露"这个 id 存在"）。

### 大事记 / 投票

```
POST   /api/recommend/pin   { "targetType": "timeline" | "vote", "targetId": "...", "expiresAt": "2030-01-01T00:00:00Z" }
DELETE /api/recommend/pin?targetType=timeline&targetId=...
```

- `expiresAt` 可省略（永久）；给了就必须是**未来**的有效 ISO 8601，否则 400。
- 目标不存在 / 大事记未通过审核 / 已归档 → 404。
- 已经置顶过 → 409 `ALREADY_PINNED`。
- `targetType: "post"` 会被拒绝（400），并提示改用 `POST /api/post/pin`。
- `DELETE` 也认 `targetType=post`：用于清理历史数据（同时清 `isPinned`）。

## 读取

`listActivePinned(db, user)`（首页第一页）：

1. 帖子：`isPinned = 1 AND parentId IS NULL AND isDeleted = 0 AND isArchived = 0`，
   按发布时间倒序；
2. 然后 `pinned_item` 里未过期的行（大事记 / 投票，以及历史遗留的帖子行），
   按置顶时间倒序；
3. 两步之间按 `类型:id` 去重，最多返回 **30** 条。

每一项都做可见性过滤，**看不到的内容不返回**：

- `visibility = private`：不进置顶区；
- `visibility = selected`：只有作者和白名单成员看得到；
- 板块帖：需要板块访问权（成员或 `manage_block`）；
- 大事记：必须 `status = approved` 且未归档。

`listPinnedRefs(db)` 是同一份数据的"便宜版"（只有类型 + id），
推荐流每一页都用它把置顶内容剔除——**每一页都要剔**，
只在第一页剔会让游标错位、正文重复。

## 已知限制

- 帖子置顶没有期限（`post` 表没有过期列）；要有时限目前只能手动取消。
- 置顶区只出现在首页第一页（翻页后不再返回）。
- 一次置顶太多会到 30 条上限，超出部分只出现在推荐流里。
- 帖子的置顶状态是"全站可见范围内"的：板块帖被置顶后，首页置顶区只对有该板块
  访问权的人显示。板块长看到的置顶帖，游客看不到，这是预期的。

## 手工验证（本地）

```bash
# 起本地（见 docs/deploy.md 的本地开发一节）
curl -s -b cookie.txt -X POST http://127.0.0.1:8788/api/post/pin \
  -H 'Content-Type: application/json' -d '{"id":"<postId>"}'
# 期望：{"success":true,"data":{"pinned":true}}

curl -s -b cookie.txt http://127.0.0.1:8788/api/recommend | jq '.data.pinned[].targetId'
# 期望：包含 <postId>，且 .data.items 里不再出现它

curl -s -b cookie.txt http://127.0.0.1:8788/api/recommend/pin \
  -H 'Content-Type: application/json' -d '{"targetType":"vote","targetId":"nope"}'
# 期望：404（以前是 200，然后永远看不到）
```
