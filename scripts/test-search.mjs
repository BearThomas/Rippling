#!/usr/bin/env node
/**
 * 搜索不变量检查（本地开发用，零依赖）
 *
 * 用法：
 *   1. 起本地站点（见 docs/deploy.md / README）：
 *        npx wrangler pages dev public --port 8799
 *      并已经跑过 migrations + 初始化向导
 *   2. node scripts/test-search.mjs [http://127.0.0.1:8799]
 *
 * 环境变量：
 *   ADMIN_STUDENT_ID  管理员学号（默认 00000000）
 *   ADMIN_PASSWORD    管理员密码（默认 testtest123）
 *
 * 说明：
 *   - 用"管理员 + 游客"两种身份就够了：可见性断言都靠这两者对比。
 *   - 会造 4 篇帖子 + 1 条评论 + 1 个板块，帖子的频率限制是 5 次/小时，
 *     反复跑之前先重启本地 dev server（频率限制存在进程内存里）。
 *   - 每条断言都打印 PASS/FAIL 与证据；有 FAIL 时退出码非 0。
 */

const BASE = (process.argv[2] ?? "http://127.0.0.1:8799").replace(/\/$/, "");
const ADMIN_STUDENT_ID = process.env.ADMIN_STUDENT_ID ?? "00000000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "testtest123";
const SUF = String(Date.now()).slice(-5);

// ============================================================
//  极简 HTTP 客户端（带 cookie jar）
// ============================================================

const jar = new Map();

function cookieHeader() {
  if (jar.size === 0) return null;
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function call(path, { method = "GET", body, useCookie = true } = {}) {
  // 浏览器发 POST 一定带 Origin；Better Auth 的 CSRF 检查要求它（缺了会 403）
  const headers = { Origin: BASE };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (useCookie) {
    const c = cookieHeader();
    if (c) headers.Cookie = c;
  }

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const raw of setCookies) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // 非 JSON（例如 500 的 HTML 错误页）—— 调用方自己看 status
  }
  return { status: res.status, json, text };
}

const api = (path, opts) => call(`/api${path}`, { ...opts, useCookie: true });
const apiGuest = (path) => call(`/api${path}`, { useCookie: false });

// ============================================================
//  断言
// ============================================================

const checks = [];

function check(name, ok, detail = "") {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   ${detail}` : ""}`);
}

const idsOf = (items) => (items ?? []).map((i) => i.id);
const postIds = (res) => idsOf((res.json?.data?.results?.posts) ?? []);
const blockIds = (res) => idsOf((res.json?.data?.results?.blocks) ?? []);
const commentIds = (res) => idsOf((res.json?.data?.results?.comments) ?? []);

async function search(q, type = "all", limit = 20, offset = 0, guest = false) {
  const qs = new URLSearchParams({ q, type, limit: String(limit), offset: String(offset) });
  return guest ? apiGuest(`/search?${qs}`) : api(`/search?${qs}`);
}

function die(msg) {
  console.error(`\n✘ ${msg}\n`);
  process.exit(2);
}

// ============================================================
//  0. 前置检查
// ============================================================

const status = await call("/api/setup/status", { useCookie: false });
if (status.json?.data?.initialized !== true) {
  die(`站点还没初始化（${BASE}）。先在本地跑完初始化向导再来。`);
}

// ============================================================
//  1. 登录管理员
// ============================================================

const login = await call("/api/auth/sign-in/email", {
  method: "POST",
  body: { email: `${ADMIN_STUDENT_ID}@rippling.local`, password: ADMIN_PASSWORD },
});
if (login.status !== 200) {
  die(`管理员登录失败（HTTP ${login.status}）。检查 ADMIN_STUDENT_ID / ADMIN_PASSWORD。`);
}

// ============================================================
//  2. 造数据
// ============================================================

async function createPost(payload) {
  const r = await api("/post", { method: "POST", body: payload });
  if (r.status === 429) {
    die("发帖触发了频率限制（5 次/小时）。重启本地 dev server 后重跑。");
  }
  if (!r.json?.data?.id) die(`创建帖子失败：${r.status} ${r.text.slice(0, 200)}`);
  return r.json.data.id;
}

const postPublic = await createPost({ title: `SEARCH${SUF}公开帖`, content: "公开正文", visibility: "public" });
const postAnon = await createPost({
  title: `SEARCH${SUF}匿名帖`,
  content: "匿名正文",
  visibility: "public",
  authorVisible: false,
});
// 标题与关键词完全一致 → rank 0，排在所有可见结果之前；
// 旧实现"先 LIMIT/OFFSET 再过滤"分页一定会因此重复
const postPrivate = await createPost({ title: `SEARCH${SUF}`, content: "私密正文", visibility: "private" });

const comment = await api("/post/comment", {
  method: "POST",
  body: { parentId: postPublic, content: `SEARCH${SUF}评论内容`, authorVisible: true },
});
if (!comment.json?.data?.id) die(`创建评论失败：${comment.status} ${comment.text.slice(0, 200)}`);
const commentId = comment.json.data.id;

const block = await api("/block", { method: "POST", body: { name: `SEARCH${SUF}板块`, description: "搜索测试" } });
const blockId = block.json?.data?.id ?? null;
const blockPost = blockId
  ? await createPost({ title: `SEARCH${SUF}板块帖`, content: "板块正文", visibility: "public", blockId })
  : null;
if (blockId) await api("/block/lock", { method: "POST", body: { blockId } });

console.log(`fixtures: 公开=${postPublic.slice(0, 8)} 匿名=${postAnon.slice(0, 8)} 私密=${postPrivate.slice(0, 8)} 评论=${commentId.slice(0, 8)}\n`);


// ============================================================
//  3. 断言
// ============================================================

const q = `SEARCH${SUF}`;

// 3.1 帖子 / 评论分离
const all = await search(q, "all", 50, 0);
check("评论不出现在「帖子」结果里", !postIds(all).includes(commentId));
check("评论出现在「评论」结果里", commentIds(all).includes(commentId));

// 3.2 匿名作者
// 游客视角：匿名帖的 authorId 必须是 null（这一条同时守着"创建接口真的把
// authorVisible=false 存下来了"——存不下来的话游客这里会露出真名）
const allGuest = await search(q, "all", 50, 0, true);
const anonGuest = (allGuest.json?.data?.results?.posts ?? []).find((p) => p.id === postAnon);
check("匿名帖出现在游客结果里", !!anonGuest);
check("匿名帖对游客不返回 authorId", !anonGuest || anonGuest.authorId === null, `authorId=${anonGuest?.authorId ?? "(缺失)"}`);

// 管理员有查看匿名身份权限，应该看得到真名
const anonAdmin = (all.json?.data?.results?.posts ?? []).find((p) => p.id === postAnon);
check("管理员（有匿名权限）能看到 authorId", !!anonAdmin && anonAdmin.authorId !== null, `authorId=${anonAdmin?.authorId ?? "(缺失)"}`);

// 3.3 私密帖：仅作者
const privGuest = await search(q, "post", 20, 0, true);
const privAdmin = await search(q, "post", 20, 0);
check("私密帖游客搜不到", !postIds(privGuest).includes(postPrivate));
check("私密帖作者搜得到", postIds(privAdmin).includes(postPrivate));

// 3.4 锁定板块
const blkGuest = await search(q, "post", 50, 0, true);
check("锁定板块的帖子游客搜不到", !blockPost || !postIds(blkGuest).includes(blockPost));
const blockGuest = await search(q, "block", 50, 0, true);
const blockAdmin = await search(q, "block", 50, 0);
check("锁定板块本身游客搜不到", !blockId || !blockIds(blockGuest).includes(blockId));
check("锁定板块管理员搜得到", !blockId || blockIds(blockAdmin).includes(blockId));

// 3.5 type 过滤互斥
for (const [t, key] of [["post", "posts"], ["comment", "comments"]]) {
  const r = await search(q, t, 20, 0);
  const nonEmpty = Object.entries(r.json?.data?.results ?? {})
    .filter(([, v]) => Array.isArray(v) && v.length > 0)
    .map(([k]) => k);
  check(`type=${t} 只返回 ${key}`, nonEmpty.every((k) => k === key), `返回了 ${JSON.stringify(nonEmpty)}`);
}

// 3.6 分页：offset 语义必须作用在"可见结果"上
// 用游客身份：私密帖对游客不可见，却排在 rank 0，正好卡在分页窗口最前面。
// 旧实现（SQL 先 LIMIT/OFFSET 再过滤）会跳过可见行，第 2 页重复第 1 页。
const p1 = await search(q, "post", 1, 0, true);
const p2 = await search(q, "post", 1, 1, true);
const p1Ids = idsOf(p1.json?.data?.results?.posts);
const p2Ids = idsOf(p2.json?.data?.results?.posts);
check("分页第 2 页与第 1 页不重复", p1Ids.length > 0 && p1Ids.concat(p2Ids).length === new Set(p1Ids.concat(p2Ids)).size, `p1=${p1Ids} p2=${p2Ids}`);
check("limit=1 时返回 1 条", p1Ids.length <= 1, `got ${p1Ids.length}`);

// ============================================================
//  4. 汇总
// ============================================================

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length} 条断言，FAIL ${failed.length} 条`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  - ${f.name}`);
  process.exit(1);
}
