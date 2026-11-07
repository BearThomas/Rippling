#!/usr/bin/env node
/**
 * 默认头像体检：所有地方的头像底色/字色必须一致
 *
 * 用法：node scripts/check-avatars.mjs [http://127.0.0.1:8788]
 * 前提：本地 `npx wrangler dev --config wrangler.worker.jsonc --port 8788` 起着，
 *       管理员 00000000 / testtest123（可用环境变量覆盖）。
 *
 * 验的是什么：没有头像的人，那一圈「首字」在所有页面上的颜色和底色必须一样 ——
 * 首页、帖子详情、评论区、「我的」页那个大号、搜索、关注列表、板块成员……
 * 以前每个地方各写一遍，于是同一个人首页是小蓝圈、进帖子变实心蓝、进评论区变成没底色。
 *
 * 规则（以帖子页那套为准）：
 *   没设名字颜色 → 字色 = 主色，底色 = 主色 12% 混合
 *   设了名字颜色 → 字色 = 名字颜色，底色 = 名字颜色 14% 混合
 *   匿名         → 中性灰（bg-line / text-ink-soft），不透露主色信息
 *
 * 判断方式不是"看代码写没写对"，而是把每个页面上真的渲染出来的
 * [data-avatar="default"] 元素的 computed color / background-color 抓下来比。
 * 同一个首字在不同页面上必须给出**完全相同**的两个字符串。
 */

import { spawn } from "node:child_process";

const BASE = (process.argv[2] ?? "http://127.0.0.1:8788").replace(/\/$/, "");
const ADMIN_ID = process.env.ADMIN_STUDENT_ID ?? "00000000";
const ADMIN_PW = process.env.ADMIN_PASSWORD ?? "testtest123";
const PORT = Number(process.env.CDP_PORT ?? 9439);

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

// ---------- 登录 + 拿一点页面要用的数据 ----------
const login = await fetch(`${BASE}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: BASE, Referer: `${BASE}/login` },
  body: JSON.stringify({ email: `${ADMIN_ID}@rippling.local`, password: ADMIN_PW }),
});
if (login.status !== 200) {
  console.error(`  管理员登录失败 HTTP ${login.status}（检查 ADMIN_STUDENT_ID / ADMIN_PASSWORD）`);
  process.exit(2);
}
const cookie = `better-auth.session_token=${(login.headers.get("set-cookie") ?? "").match(/better-auth\.session_token=([^;]+)/)?.[1] ?? ""}`;

const getJson = async (path) => {
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
  return res.json().catch(() => null);
};

const config = (await getJson("/api/config"))?.data;
const primaryHex = config?.theme?.primaryColor ?? "#3B82F6";

const feed = (await getJson("/api/recommend?limit=30"))?.data?.items ?? [];
const firstPost = feed.find((item) => item.type === "post")?.data;
if (!firstPost) {
  console.error("  本地库里没有帖子，扫不到帖子页（先在站里发一条再跑）");
  process.exit(2);
}
const searchUsers = (await getJson(`/api/search?q=${encodeURIComponent("张")}&type=user`))?.data?.results?.users ?? [];
const otherUser = searchUsers[0];
if (!otherUser) {
  console.error("  搜索不到第二个用户（脚本需要至少两个人，才能验『不同用户不同规则』）");
  process.exit(2);
}

/** 名字颜色 → 期望的 (color, bgAlpha) */
const userShown = firstPost.author;
const PAGES = [
  "/",
  "/profile",
  `/post/${firstPost.id}`,
  `/user/${otherUser.userId}`,
  `/search?q=${encodeURIComponent(otherUser.username)}&type=user`,
  "/settings",
];

// 有板块就把板块页也扫上（成员列表里也有默认头像）
const blocks = (await getJson("/api/block/list"))?.data ?? [];
for (const block of blocks.slice(0, 2)) {
  if (block?.id) PAGES.push(`/block/${block.id}`);
}

// ---------- 浏览器 ----------
const chrome = spawn(
  "chromium",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=/tmp/rippling-avatars-${Date.now()}`,
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
await send("Network.setCookie", {
  name: "better-auth.session_token",
  value: decodeURIComponent(cookie.split("=")[1]),
  domain: "127.0.0.1",
  path: "/",
  httpOnly: true,
});
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: "try { localStorage.setItem('rippling.onboarding.v1', 'done'); } catch (e) { console.warn(e); }",
});

const evaluate = async (expression) => {
  const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? "页面脚本报错");
  return res.result.value;
};

const PROBE = `(() => [...document.querySelectorAll('[data-avatar]')].map((el) => {
  const cs = getComputedStyle(el);
  return { kind: el.dataset.avatar, text: (el.textContent || '').trim(),
           color: cs.color, bg: cs.backgroundColor,
           cls: el.className };
}))()`;

const samples = [];
try {
  for (const path of PAGES) {
    await send("Page.navigate", { url: `${BASE}${path}` });
    await sleep(3800);
    const found = await evaluate(PROBE);
    for (const item of found) samples.push({ ...item, page: path });
    console.log(`  ${path}: ${found.length} 个头像（默认 ${found.filter((f) => f.kind === "default").length}）`);
  }
} finally {
  await rawSend("Browser.close").catch(() => undefined);
  chrome.kill("SIGKILL");
}

const defaults = samples.filter((s) => s.kind === "default");
const images = samples.filter((s) => s.kind === "image");

// ---------- 断言 ----------
check(`扫到足够多的默认头像（${defaults.length} 个，至少 4 个）`, defaults.length >= 4, `只有 ${defaults.length} 个`);

/** 同一个首字 → 必须只有一种 (color, bg) */
const byInitial = new Map();
for (const item of defaults) {
  const key = item.text.slice(0, 1);
  if (!byInitial.has(key)) byInitial.set(key, new Set());
  byInitial.get(key).add(`${item.color} | ${item.bg}`);
}
const inconsistent = [...byInitial.entries()].filter(([, set]) => set.size > 1);
check(
  "同一个首字在所有页面上颜色/底色完全一致",
  inconsistent.length === 0,
  inconsistent.map(([k, v]) => `「${k}」出现 ${v.size} 种：${[...v].join(" / ")}`).join("；")
);

/** 主色那份：字色 = 主色 */
const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return `rgb(${parseInt(full.slice(0, 2), 16)}, ${parseInt(full.slice(2, 4), 16)}, ${parseInt(full.slice(4, 6), 16)})`;
};
const expectedPrimary = hexToRgb(primaryHex);

/** 从 computed background-color 里取 alpha（可能是 color(srgb … / 0.12) 或 rgba(…)） */
const alphaOf = (value) => {
  const m = value.match(/\/\s*([0-9.]+)\s*\)/) ?? value.match(/rgba?\([^)]*,\s*([0-9.]+)\s*\)/);
  return m ? Number(m[1]) : null;
};

/** 每个首字属于哪套规则（已知的两个用户；其余只能做"不是灰"的软检查） */
const expectations = new Map();
expectations.set((userShown?.username ?? "").slice(0, 1), userShown?.nameColor ?? null);
expectations.set(otherUser.username.slice(0, 1), otherUser.nameColor ?? null);

for (const [initial, set] of byInitial) {
  const [pair] = [...set];
  const [color, bg] = pair.split(" | ");
  const alpha = alphaOf(bg);
  const nameColor = expectations.get(initial);

  if (nameColor) {
    check(
      `「${initial}」用了自己的名字颜色（${nameColor}），底色 14%`,
      color === hexToRgb(nameColor) && Math.abs((alpha ?? 0) - 0.14) < 0.02,
      `实际 color=${color} alpha=${alpha}`
    );
  } else if (expectations.has(initial)) {
    check(
      `「${initial}」没有名字颜色 → 字色用主色 ${primaryHex}，底色 12%`,
      color === expectedPrimary && Math.abs((alpha ?? 0) - 0.12) < 0.02,
      `实际 color=${color} alpha=${alpha}`
    );
  } else {
    check(`「${initial}」不是匿名灰（走的是正常用户规则）`, !/^rgb\(1[0-9]{2}, 1[0-9]{2}, 1[0-9]{2}\)$/.test(color), `实际 ${color}`);
  }
}

// 有头像的人：必须是 <img> + object-cover；本库里没图时不硬造，明说跳过
if (images.length > 0) {
  check(
    `有头像的人走 <img>（${images.length} 个）`,
    images.every((i) => i.cls.includes("object-cover") && i.cls.includes("rounded-full")),
    images.map((i) => i.cls).join(" / ")
  );
} else {
  console.log("  - SKIP：本站没有设置过头像的用户，图片分支这次跑不到");
}

if (failures.length) {
  console.log(`\n✗ 通过 ${passed} 项，失败 ${failures.length} 项：\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
const nullColorCount = [...expectations.values()].filter((v) => !v).length;
if (nullColorCount === 0) {
  console.log("  - SKIP：后端 nameColor 是**按等级算出来的**，每个用户都有值，所以『没名字颜色 → 主色兜底』这条路真实数据跑不到");
}
console.log(`\n✓ 通过 ${passed} 项，${byInitial.size} 个不同首字在所有页面上一致`);
