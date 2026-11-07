# 登录墙（三档）

一句话：**`site_config.loginWall` 决定"没登录的人能看到什么"**，一个字段三档：

| 档位 | 值 | 没登录的人能看到 | 适合 |
| --- | --- | --- | --- |
| 无墙 | `"none"` | 跟登录后一样（推荐流、搜索、板块、帖子都能刷） | 想让人先看看再决定注册 |
| 软墙 | `"soft"` | **只能看单条帖子详情**，其余全部跳到登录页 | 群里转发链接（点开能看那条，想刷别的再注册） |
| 硬墙 | `"hard"` | 只有登录/注册/初始化页 | 只想让本校的人用 |

默认 `hard`。老配置里没有这个字段时也按 `hard` 处理，不需要迁移。
管理面板 → 站点配置 → 访问控制，改完最多 10 秒生效（见下面缓存那条）。

## 为什么后端也要拦

**只在前端 `router.beforeEach` 里跳登录页是假墙。** 实测过：游客直接 `curl`

```
游客 GET /api/recommend   200   ← 推荐流整段可读
游客 GET /api/block/list  200
游客 GET /api/search?q=   200
```

所以墙做在 `src/middleware/loginWall.ts`：挂在 `authMiddleware` 之后，
**默认拒绝，白名单放行**，拒了就是 `401 UNAUTHORIZED`。

## 白名单（就是全部规则）

永远放行的（没登录也要能用，否则登录页都画不出来）：

- `/api/auth/*` —— 登录 / 注册本身（它挂在另一个 entry，本来就不经过这层）
- `/api/config` —— 站名、学号规则、主题；登录页要用
- `/api/setup/status`、`/api/setup/initialize` —— 首次初始化
- `/api/bootstrap` —— 判断"我登录了没有"
- `/api/health`、`/api/image` —— 探活；图片是随机 UUID 的 key，公开不泄露内容
- `/api/permissions/me` —— 游客返回 `"0"`，没有信息量

软墙额外放行（**只放 GET**，写操作一律要登录）：

- `GET /api/post`（`?id=` 单条）、`GET /api/post/comments`
- `GET /api/user/profile`（作者资料）
- `GET /api/block`（`?id=` 板块详情，帖子页要显示板块名）

这四条不是随手挑的：`PostDetailView` 打开一条帖子正好调这四个，少一个页面就会弹错误 Toast。

站点**未初始化**时豁免整面墙（`initialized !== true` → 当作 `none`）：
否则初始化向导还没跑完，你自己都进不去。

## 两处容易忘的地方

1. **墙的档位有 10 秒进程内缓存**。每个 API 请求都去 D1 读一次配置太浪费，
   所以 `loginWall.ts` 里带 TTL 缓存（管理面板保存时会顺手失效当前 isolate 的缓存，
   其它 isolate 靠 TTL）。文档写在这里，就是提醒"改完不是瞬间全网生效"。
2. **登出必须清本地缓存**。`rippling.bootstrap.v1` 里存着 session + permissions，
   `rippling.feed.v1` 是首页第一页的 5 分钟缓存 —— 两个都不分用户。
   有了墙以后这就不再是"体验问题"：同一台手机上，下一个人打开会先闪一下
   上一个登录者的状态，还能看到他刷出来的那页帖子。现在登出会清掉，
   首页缓存也带上 `userId`，对不上就作废。

## 验收

`node scripts/check-login-wall.mjs [http://127.0.0.1:8788]`（三档逐条跑）

不是"试一下能拦就行"，而是每一档都验：
- **无墙**：匿名把内容接口全打通（这是对照组 —— 证明墙确实关了，不是一直坏着）
- **软墙**：`GET /api/post?id=` 200，`/api/recommend`、`/api/search`、`/api/block/list`
  逐条 401；浏览器里游客打开 `/` 落到登录页，打开 `/post/<id>` **能正常渲染**
- **硬墙**：`/api/post?id=` 也 401；游客打开 `/post/<id>` 落到登录页，
  **登录后回到那条帖子**（`redirect` 参数）
- 登出后再打开 `/` 又被挡回登录页，且两个本地缓存已清空

## 一个连带影响：测试脚本要换"对照账号"

`scripts/test-search.mjs` 里的可见性断言（私密帖搜不到、匿名帖不露真名、分页不重复）
需要一个**看不到私密内容的人**当对照。以前用游客就够了；开了墙之后游客连
`/api/search` 都是 401，"游客看不到私密帖"就变成空转。

所以墙开着时它要用一个普通学生账号：

```bash
VIEWER_STUDENT_ID=20249999 VIEWER_PASSWORD=*** node scripts/test-search.mjs
```

没给就明确打 `SKIP`（不是假装 PASS），汇总里也会写清楚跳过了几条。
