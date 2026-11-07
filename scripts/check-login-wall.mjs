#!/usr/bin/env node
/**
 * 登录墙验收：三档逐条跑
 *
 * 用法：node scripts/check-login-wall.mjs [http://127.0.0.1:8788]
 * 前提：本地 `npx wrangler dev --config wrangler.worker.jsonc --port 8788` 起着，
 *       管理员 00000000 / testtest123（可用环境变量覆盖）。
 *
 * 验的不是"墙能拦"，而是三件容易糊弄过去的事：
 *   1. **对照组**：无墙档位下匿名必须能通（证明墙确实关了，不是一直坏着）；
 *   2. **软墙那几条只读接口真的放行了**：帖子页少一条就会弹错误 Toast，
 *      所以这四条要逐条断言 200，而不是只验"别的都 401"；
 *   3. **redirect 回跳**：硬墙下点开帖子链接 → 登录页 → 登录完成 → 回到那条帖子。
 *      这才是一个真正被人转发出去的链接会发生的事。
 *
 * 跑完会把档位改回原样（try/finally）。
 */

import { spawn } from "node:child_process";

const BASE = (process.argv[2] ?? "http://127.0.0.1:8788").replace(/\/$/, "");
const ADMIN_ID = process.env.ADMIN_STUDENT_ID ?? "00000000";
const ADMIN_PW = process.env.ADMIN_PASSWORD ?? "testtest123";
const PORT = Number(process.env.CDP_PORT ?? 9443);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
const failures = [];
const check = (name, ok, detail = "") => {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
};
const skip = (name) => console.log(`  - SKIP：${name}`);

// ------------------------------------------------------------
//  管理端（Node 侧直接打 API，用来切三档）
// ------------------------------------------------------------

const loginRes = await fetch(`${BASE}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: BASE, Referer: `${BASE}/login` },
  body: JSON.stringify({ email: `${ADMIN_ID}@rippling.local`, password: ADMIN_PW }),
});
if (loginRes.status !== 200) {
  console.error(`  管理员登录失败 HTTP ${loginRes.status}`);
  process.exit(2);
}
const adminCookie = `better-auth.session_token=${(loginRes.headers.get("set-cookie") ?? "").match(/better-auth\.session_token=([^;]+)/)?.[1] ?? ""}`;

const adminGet = async (path) => {
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: adminCookie } });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const adminPut = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: adminCookie, Origin: BASE, Referer: `${BASE}/admin` },
    body: JSON.stringify(body),
  });
  return res.status;
};

const originalConfig = (await adminGet("/api/admin/config")).json?.data;
if (!originalConfig) {
  console.error("  拿不到站点配置");
  process.exit(2);
}

async function setMode(mode) {
  const config = (await adminGet("/api/admin/config")).json?.data ?? originalConfig;
  config.loginWall = mode;
  const status = await adminPut("/api/admin/config", config);
  if (status !== 200) throw new Error(`切换档位失败 HTTP ${status}`);
  // 服务端档位有 10 秒进程内缓存，管理端保存会失效当前 isolate；本地单 isolate，等一下更稳
  await sleep(600);
}

/** 游客身份直接请求（不带 cookie） */
async function anonStatus(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Origin: BASE, ...(init.headers ?? {}) },
  });
  return res.status;
}

// 拿一条"游客真能看见"的帖子：软墙要验它的详情接口。
// 注意不能随便取推荐流第一条 —— 测试会造私密帖/锁定板块帖，那些匿名看是 404，
// 断言会变成"墙没拦但业务不给"，看起来像墙坏了。
const feed = (await adminGet("/api/recommend?limit=20")).json?.data;
const candidates = (feed?.items ?? []).filter((item) => item.type === "post").map((item) => item.data);
let post = null;
if (candidates.length > 0) {
  // 先切到无墙，才能用匿名请求探"这条帖子本身是不是公开的"
  await setMode("none");
  for (const candidate of candidates) {
    if ((await anonStatus(`/api/post?id=${candidate.id}`)) === 200) {
      post = candidate;
      break;
    }
  }
}
if (!post) {
  console.error("  找不到一条匿名人也能看的帖子（全是私密/锁定板块？）—— 先在站里发一条公开帖");
  process.exit(2);
}
console.log(`  选用帖子 ${post.id.slice(0, 8)}（匿名人也能看）`);
const detailPaths = [
  `/api/post?id=${post.id}`,
  `/api/post/comments?parentId=${post.id}&limit=5`,
  `/api/user/profile?userId=${post.authorId}`,
  `/api/block?id=${post.blockId}`,
];
const blockedPaths = [
  "/api/recommend?limit=3",
  `/api/search?q=${encodeURIComponent("测")}&type=post`,
  "/api/block/list",
  "/api/notification",
  "/api/ticket",
  "/api/admin-log",
  "/api/admin/config",
];

// ------------------------------------------------------------
//  浏览器
// ------------------------------------------------------------

const chrome = spawn(
  "chromium",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=/tmp/rippling-wall-${Date.now()}`,
    "--window-size=430,932",
    "about:blank",
  ],
  { stdio: "ignore" }
);

let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i += 1) {
  try {
    wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl;
  } catch {
    await sleep(250);
  }
}
if (!wsUrl) {
  chrome.kill("SIGKILL");
  console.error("  连不上无头 chromium");
  process.exit(2);
}

const ws = new WebSocket(wsUrl);
await new Promise((res) => ws.addEventListener("open", res, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) rej(new Error(JSON.stringify(msg.error)));
    else res(msg.result);
  }
});
const rawSend = (method, params = {}, sessionId) => {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        rej(new Error(`CDP timeout: ${method}`));
      }
    }, 30000);
  });
};
const { targetId } = await rawSend("Target.createTarget", { url: "about:blank" });
const { sessionId } = await rawSend("Target.attachToTarget", { targetId, flatten: true });
const send = (method, params) => rawSend(method, params, sessionId);

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.clearBrowserCookies");

const evaluate = async (expression) => {
  const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? "页面脚本报错");
  return res.result.value;
};

/** 清本地缓存后打开某个路径（模拟"游客第一次打开"） */
async function openAsGuest(path) {
  await send("Page.navigate", { url: `${BASE}/login` });
  await sleep(1200);
  await evaluate("localStorage.clear()");
  await send("Page.navigate", { url: `${BASE}${path}` });
  await sleep(3500);
  return evaluate(
    `({ path: location.pathname, search: location.search, text: document.body.innerText.slice(0, 200) })`
  );
}

try {
  // ---------------- 无墙 ----------------
  console.log("\n【无墙】");
  await setMode("none");
  for (const path of ["/api/recommend?limit=3", "/api/block/list", "/api/search?q=x&type=post"]) {
    const status = await anonStatus(path);
    check(`游客 ${path} → 200（对照组：墙确实关了）`, status === 200, `实际 ${status}`);
  }
  const nonePage = await openAsGuest("/");
  check("游客能直接进首页", nonePage.path === "/", `实际 ${nonePage.path}`);

  // ---------------- 软墙 ----------------
  console.log("\n【软墙】");
  await setMode("soft");
  for (const path of blockedPaths) {
    const status = await anonStatus(path);
    check(`游客 ${path} → 401`, status === 401, `实际 ${status}`);
  }
  for (const path of detailPaths) {
    const status = await anonStatus(path);
    // 断言的是"墙没拦"（业务自己的 400/404 不算墙的问题，比如帖子所在板块不可见）
    check(`游客 ${path.split("?")[0]} 不被墙拦（非 401）`, status !== 401, `实际 ${status}`);
  }
  {
    const status = await anonStatus(`/api/post?id=${post.id}`);
    check("其中单条帖子详情必须是 200（软墙的核心）", status === 200, `实际 ${status}`);
  }
  const softHome = await openAsGuest("/");
  const softRedirect = new URLSearchParams(softHome.search).get("redirect");
  check(
    "游客打开 / 被送到登录页（带 redirect=/）",
    softHome.path === "/login" && softRedirect === "/",
    `实际 ${softHome.path}${softHome.search}`
  );
  const softPost = await openAsGuest(`/post/${post.id}`);
  check(
    "游客打开单条帖子仍能看（软墙的重点）",
    softPost.path === `/post/${post.id}` && softPost.text.includes(post.title ?? post.content.slice(0, 6)),
    `实际 ${softPost.path}`
  );

  // ---------------- 硬墙 ----------------
  console.log("\n【硬墙】");
  await setMode("hard");
  for (const path of detailPaths) {
    const status = await anonStatus(path);
    check(`游客 ${path.split("?")[0]} → 401（硬墙连帖子详情也挡）`, status === 401, `实际 ${status}`);
  }

  const hardPost = await openAsGuest(`/post/${post.id}`);
  const hardRedirect = new URLSearchParams(hardPost.search).get("redirect");
  check(
    "游客打开帖子 → 登录页，且 redirect 指回那条帖子",
    hardPost.path === "/login" && hardRedirect === `/post/${post.id}`,
    `实际 ${hardPost.path}${hardPost.search}`
  );

  // 在登录页上真的填表单登录（模拟用户操作，而不是直接塞 cookie）
  const filled = await evaluate(`(() => {
    const set = (el, value) => {
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    };
    const okId = set(document.querySelector('#student-id'), ${JSON.stringify(ADMIN_ID)});
    const okPw = set(document.querySelector('#password'), ${JSON.stringify(ADMIN_PW)});
    return okId && okPw;
  })()`);
  check("登录页上填得进去（学号 + 密码）", filled === true);
  await evaluate(`document.querySelector('form button[type=submit]').click()`);
  await sleep(4500);
  const afterLogin = await evaluate(
    `({ path: location.pathname, text: document.body.innerText.slice(0, 200) })`
  );
  check(
    "登录完成后回到原来那条帖子（不是首页）",
    afterLogin.path === `/post/${post.id}`,
    `实际 ${afterLogin.path}`
  );

  // 已登录的人访问 /login 应该被送回首页
  await send("Page.navigate", { url: `${BASE}/login` });
  await sleep(2500);
  const loginWhileLoggedIn = await evaluate("location.pathname");
  check("已登录访问 /login 会回家", loginWhileLoggedIn === "/", `实际 ${loginWhileLoggedIn}`);

  // 登出后：缓存清掉，再打开 / 又被挡回登录页
  await send("Page.navigate", { url: `${BASE}/profile` });
  await sleep(3000);
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '退出登录');
    if (btn) { btn.click(); return true; } return false; })()`);
  await sleep(3000);
  const afterLogout = await evaluate(
    `({ path: location.pathname, bootstrap: localStorage.getItem('rippling.bootstrap.v1'), feed: localStorage.getItem('rippling.feed.v1') })`
  );
  {
    // 登出后会立刻再写一份"游客"快照（正常行为），要紧的是里面**没有上一个人的会话**
    const snap = afterLogout.bootstrap ? JSON.parse(afterLogout.bootstrap) : null;
    check(
      "退出登录后快照里没有上一个人的会话",
      !snap || (snap.data?.session === null && snap.data?.permissions === "0"),
      `session=${JSON.stringify(snap?.data?.session)?.slice(0, 40)}`
    );
  }
  check("退出登录后首页快照被清掉", afterLogout.feed === null, `还留着 ${String(afterLogout.feed).slice(0, 40)}`);

  const backHome = await openAsGuest("/");
  check("登出后打开 / 又被挡回登录页", backHome.path === "/login", `实际 ${backHome.path}`);
} finally {
  // 无论如何把档位改回去
  const restore = { ...(originalConfig ?? {}) };
  delete restore.loginWall;
  await setMode(restore.loginWall ?? "hard").catch(() => undefined);
  // 上面 setMode 会把 loginWall 设为 hard；按原值再写一次（原值可能是 undefined）
  try {
    const config = (await adminGet("/api/admin/config")).json?.data ?? {};
    if (originalConfig.loginWall === undefined) delete config.loginWall;
    else config.loginWall = originalConfig.loginWall;
    await adminPut("/api/admin/config", config);
  } catch (error) {
    console.error("  恢复原档位失败:", error);
  }
  await rawSend("Browser.close").catch(() => undefined);
  chrome.kill("SIGKILL");
}

console.log(
  `\n通过 ${passed} 项${failures.length ? `，失败 ${failures.length} 项：\n  - ${failures.join("\n  - ")}` : "，全绿"}`
);
process.exit(failures.length ? 1 : 0);
