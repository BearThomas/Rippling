#!/usr/bin/env node
/**
 * 布局体检：卡片行是不是都跟容器一样宽
 *
 * 用法：node scripts/check-layout.mjs [http://127.0.0.1:8788]
 * 前提：本地 `npx wrangler dev --config wrangler.worker.jsonc --port 8788` 起着，
 *       管理员 00000000 / testtest123（可用环境变量覆盖）。
 *
 * 为什么要有这个脚本：
 *   `<a class="card-base flex ...">` 会撑满（display:flex 让它变成块级），
 *   但同一个类名写在 `<button>` 上**不会** —— Chrome 里 button 的外框还是行内级，
 *   于是"申请认证"那一行只有 148px，夹在一列 456px 的卡片里。
 *   这类问题看不出来是哪个属性的错，只能**量**。所以这里把每个页面的
 *   "卡片行"和它父容器的内容宽比一遍。
 *
 * 注意比的是父容器的**内容宽**（clientWidth 减掉 padding/border）——
 * 直接比 getBoundingClientRect 会把"卡片放在有内边距的容器里"误报成不齐
 * （第一版就误报了 /apps 的 7 行）。
 */

import { spawn } from "node:child_process";

const BASE = (process.argv[2] ?? "http://127.0.0.1:8788").replace(/\/$/, "");
const ADMIN_ID = process.env.ADMIN_STUDENT_ID ?? "00000000";
const ADMIN_PW = process.env.ADMIN_PASSWORD ?? "testtest123";
const PORT = Number(process.env.CDP_PORT ?? 9438);
/** 要巡检的页面（登录后可见的都在这里） */
const PAGES = (process.env.PAGES ?? "/,/profile,/settings,/apps,/blocks,/tickets").split(",");
const TOLERANCE_PX = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const login = await fetch(`${BASE}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: BASE, Referer: `${BASE}/login` },
  body: JSON.stringify({ email: `${ADMIN_ID}@rippling.local`, password: ADMIN_PW }),
});
if (login.status !== 200) {
  console.error(`  管理员登录失败 HTTP ${login.status}（检查 ADMIN_STUDENT_ID / ADMIN_PASSWORD）`);
  process.exit(2);
}
const token = decodeURIComponent(
  (login.headers.get("set-cookie") ?? "").match(/better-auth\.session_token=([^;]+)/)?.[1] ?? ""
);
if (!token) {
  console.error("  登录响应里没有 session cookie");
  process.exit(2);
}

const chrome = spawn(
  "chromium",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=/tmp/rippling-layout-${Date.now()}`,
    // 跟常见手机差不多宽，窄屏更容易暴露"撑不满"
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
  console.error("  连不上无头 chromium 的调试端口");
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
await send("Network.setCookie", {
  name: "better-auth.session_token",
  value: token,
  domain: "127.0.0.1",
  path: "/",
  httpOnly: true,
});
// 引导遮罩会挡住页面，也会让取到的矩形不是最终布局
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: "try { localStorage.setItem('rippling.onboarding.v1', 'done'); } catch (e) { console.warn(e); }",
});

const evaluate = async (expression) => {
  const res = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error(`页面脚本报错: ${res.exceptionDetails.exception?.description ?? "unknown"}`);
  }
  return res.result.value;
};

/** 量一个页面里所有"卡片行"：元素宽 vs 父容器内容宽 */
const PROBE = `(() => {
  const rows = [];
  for (const el of document.querySelectorAll("button, a")) {
    const cls = el.className;
    if (typeof cls !== "string" || !cls.includes("card-base")) continue;
    const parent = el.parentElement;
    const cs = getComputedStyle(parent);
    const contentWidth =
      parent.clientWidth -
      parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) -
      parseFloat(cs.borderLeftWidth || 0) - parseFloat(cs.borderRightWidth || 0);
    rows.push({
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 12),
      width: Math.round(el.getBoundingClientRect().width),
      container: Math.round(contentWidth),
    });
  }
  return rows;
})()`;

const problems = [];
let checked = 0;
try {
  for (const path of PAGES) {
    await send("Page.navigate", { url: `${BASE}${path}` });
    await sleep(3500);
    const rows = await evaluate(PROBE);
    checked += rows.length;
    const bad = rows.filter((r) => Math.abs(r.width - r.container) > TOLERANCE_PX);
    console.log(`  ${path}: ${rows.length} 个卡片行${bad.length ? `，${bad.length} 个不齐` : ""}`);
    for (const r of bad) {
      problems.push(`${path} <${r.tag}>「${r.text}」 宽 ${r.width}px / 容器 ${r.container}px`);
    }
  }
} finally {
  await rawSend("Browser.close").catch(() => undefined);
  chrome.kill("SIGKILL");
}

if (problems.length) {
  console.log(`\n✗ ${problems.length} 处不齐（共 ${checked} 行）：\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`\n✓ ${checked} 个卡片行全部跟容器同宽`);
