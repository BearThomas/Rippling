# 性能：把跨境往返压到最少

> 站点在香港/日本/新加坡以外的 Cloudflare 边缘上，中国大陆访问必然跨境。
> 这四条约束（免费 / 无信用卡 / 不备案 / 要快）下，能做的只有一件事：
> **让每次打开页面需要的跨境往返尽可能少，让能缓存的东西都缓存住。**

## 实测（深圳一条普通宽带，5 次加载取中位数）

| 指标 | 改造前 | 改造后 |
| --- | --- | --- |
| 首屏内容可见 | 2126 ~ 2215 ms | **325 ~ 330 ms** |
| 稳态（第 5 次加载，热缓存） | 1731 ~ 2051 ms | **322 ~ 330 ms** |
| 首屏 API 请求数 | 5 | **2** |
| 最后一个 API 完成 | 1670 ~ 2014 ms | **498 ~ 556 ms** |

## 做了什么

### 1. 首屏 4 个接口合成 1 个：`GET /api/bootstrap`

以前启动要打 `/api/setup/status`、`/api/config`、`/api/auth/get-session`、
`/api/permissions/me`，每个都是一次跨境往返 + Worker 冷启动 + D1 查询。
现在一次拿齐：

```json
{ "initialized": true, "config": {...}, "session": {...}, "permissions": "85701697087" }
```

### 2. 路由守卫不再每次导航都请求

`router.beforeEach` 里原来每次都 `fetch("/api/setup/status")` —— 站内点一下
就是一个跨境往返。现在走 bootstrap：有快照同步返回，没有才请求一次并记住。

### 3. 边缘缓存（Cache API）白名单

| 路径 | TTL | 共享方式 |
| --- | --- | --- |
| `/api/config` | 60s | 所有人共享 |
| `/api/setup/status` | 60s | 所有人共享 |
| `/api/recommend` | 30s | **按用户分桶**（key 里带会话 token 的 SHA-256 前 8 字节 + 配置版本） |
| `/api/image` | 1 年 | 所有人共享（不可变资源） |

细节与坑：

- 存进 Cache API 的那份必须去掉 `Cache-Control: private` —— Cloudflare 的
  Cache API **直接拒绝**带 private / no-store / Set-Cookie 的响应，留着就永远写不进去；
- 回给浏览器的那份要按规则重设头：`perUser` 的接口只能是 `private, max-age=15`，
  否则中间代理可能把 A 的推荐流给 B；
- **先 clone 再取 body**：反过来写会抛 "Response body is already used"，
  而这个异常会把请求变成 500（踩过一次，整站 500）；
- 缓存层任何异常都必须退化成"不缓存、照常返回"，绝不能把响应搞坏；
- 配置版本（`site_config.updatedAt`）进 perUser 的 key：管理面板一改权重，
  旧缓存自然失效，不用等 TTL；`/api/config`、`/api/setup/status` 由保存时直接 purge。

### 4. 前端快照（先画出来，再刷新）

- `localStorage["rippling.bootstrap.v1"]`：站名 / 主题 / 登录态 / 权限，**挂载前**应用，
  首帧就是正确的主题和登录态（不会先闪一下"未登录"）；
- `localStorage["rippling.feed.v1"]`：首页第一页（含置顶），5 分钟内直接渲染，
  同时后台拉最新的一页替换（不显示 loading 骨架）。

两条快照都只是"先把界面画出来"，真实数据回来后立刻覆盖；判断是否登录仍以服务器为准。

### 5. 静态资源

`/assets/*` 是 vite 打出来的带 hash 文件，可以长缓存；`sw.js` 里的 PWA 缓存
（Network First + SWR）已经兜住了重复访问。

## 已知取舍

- 推荐流有 **30 秒**的边缘缓存：内容新鲜度换速度。管理员改权重不用等 ——
  配置版本变了，key 就变了。
- 首页快照最长用 5 分钟：太旧就当成没有，直接走网络。
- 首次访问（冷缓存 + 冷 Worker）仍然要 1 秒左右，这是跨境的物理成本，
  不换到国内节点无法进一步优化（见部署文档里"国内访问"一节）。

## 怎么验证

```bash
# 缓存是否真的命中（看 X-Edge-Cache 头）
curl -s -D - -o /dev/null https://你的站点/api/recommend | grep -i x-edge-cache

# 改配置后是否立刻生效
node scripts/test-recommend.mjs https://你的站点
```
