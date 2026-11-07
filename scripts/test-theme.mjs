#!/usr/bin/env node
/**
 * 主题验收：本地自定义 vs 全站默认
 *
 * 用法：node scripts/test-theme.mjs [http://127.0.0.1:8788]
 * 前提：本地 `npx wrangler dev --config wrangler.worker.jsonc --port 8788` 起着，
 *       站点已初始化（管理员 00000000 / testtest123，可用环境变量覆盖）。
 *
 * 要验的那句话是：
 *   「每个用户可以自己改主题；管理员改全站主题时，已经自己改过的用户不变。」
 * 所以除了"能改、能存"，还必须验：
 *   - **对照**：管理员改完之后，"跟随全站"的人**确实**跟着变了（否则第 4 条是空转）；
 *   - **早于 JS**：免闪烁脚本在 bundle 跑起来之前就把颜色摆好了（不然会先闪一下再变）；
 *   - **坏数据**：localStorage 里半份主题要被丢掉、回落到全站，而不是渲染成四不像。
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

const BASE = (process.argv[2] ?? "http://127.0.0.1:8788").replace(/\/$/, "");
const ADMIN_ID = process.env.ADMIN_STUDENT_ID ?? "00000000";
const ADMIN_PW = process.env.ADMIN_PASSWORD ?? "testtest123";
const PORT = Number(process.env.CDP_PORT ?? 9333);
const SHOT_DIR = "/tmp/theme-shots";

let passed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------
//  浏览器 & CDP
// ------------------------------------------------------------

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.seq;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30000);
    });
  }
}

async function connect() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const info = await res.json();
      return info.webSocketDebuggerUrl;
    } catch {
      await sleep(250);
    }
  }
  throw new Error("连不上无头 chromium 的调试端口");
}

// ------------------------------------------------------------
//  站点 API（Node 侧直连，用来"扮演管理员改全站配置"）
// ------------------------------------------------------------

let adminCookie = "";

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      // better-auth 对没有 Origin 的写请求直接 403（MISSING_OR_NULL_ORIGIN），这里补上
      Origin: BASE,
      Referer: `${BASE}/login`,
      ...(adminCookie ? { Cookie: adminCookie } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 非 JSON 就留 null */
  }
  return { status: res.status, json, text, setCookie: res.headers.get("set-cookie") };
}

async function loginAdmin() {
  const res = await api("/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email: `${ADMIN_ID}@rippling.local`, password: ADMIN_PW }),
  });
  if (res.status !== 200) throw new Error(`管理员登录失败 HTTP ${res.status}: ${res.text.slice(0, 160)}`);
  const raw = res.setCookie ?? "";
  const m = raw.match(/better-auth\.session_token=([^;]+)/);
  if (!m) throw new Error("登录响应里没有 session cookie");
  adminCookie = `better-auth.session_token=${m[1]}`;
  return m[1];
}

// ------------------------------------------------------------
//  主流程
// ------------------------------------------------------------

async function main() {
  rmSync(SHOT_DIR, { recursive: true, force: true });
  mkdirSync(SHOT_DIR, { recursive: true });

  const token = await loginAdmin();
  const siteBefore = (await api("/api/admin/config")).json?.data;
  if (!siteBefore) throw new Error("拿不到站点配置");
  const sitePresetBefore = siteBefore.theme.preset;

  const profileDir = `/tmp/rippling-theme-profile-${Date.now()}`;
  const chromium = spawn(
    "chromium",
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profileDir}`,
      "--window-size=430,932",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  let cdp;
  let sessionId;
  try {
    const wsUrl = await connect();
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    cdp = new CDP(ws);

    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const attached = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    sessionId = attached.sessionId;
    const send = (method, params) => cdp.send(method, params, sessionId);

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Network.setCookie", {
      name: "better-auth.session_token",
      value: decodeURIComponent(token),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
    });

    const evaluate = async (expression) => {
      const res = await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      });
      if (res.exceptionDetails) {
        throw new Error(`页面脚本报错: ${res.exceptionDetails.exception?.description ?? JSON.stringify(res.exceptionDetails)}`);
      }
      return res.result.value;
    };

    /** 打开某个路径并等应用把首屏画出来（等到 #app 里有内容） */
    const goto = async (path) => {
      await send("Page.navigate", { url: `${BASE}${path}` });
      for (let i = 0; i < 100; i += 1) {
        await sleep(120);
        const ready = await evaluate(
          `(() => { const el = document.getElementById('app'); return !!el && el.children.length > 0 && document.readyState === 'complete'; })()`
        ).catch(() => false);
        if (ready) break;
      }
      await sleep(400);
    };

    const themeNow = () =>
      evaluate(
        `(() => { const s = getComputedStyle(document.documentElement); return {
            attr: document.documentElement.getAttribute('data-theme'),
            source: document.documentElement.getAttribute('data-theme-source'),
            primary: s.getPropertyValue('--c-primary').trim(),
            bg: s.getPropertyValue('--c-bg').trim(),
            stored: localStorage.getItem('rippling.theme.v1'),
          }; })()`
      );

    const clickByText = (text) =>
      evaluate(
        `(() => {
           const target = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)});
           if (!target) return false;
           target.click();
           return true;
         })()`
      );

    // ---------- 1. 干净浏览器：跟随全站 ----------
    await goto("/");
    // 清掉本地主题，但把引导标记成已看过 —— 否则引导的遮罩会盖在截图上（看不清颜色）
    await evaluate(`localStorage.clear(); localStorage.setItem('rippling.onboarding.v1', 'done');`);
    await goto("/settings");

    const t1 = await themeNow();
    check(
      `没自定义时跟随全站主题（data-theme=${sitePresetBefore}）`,
      t1.attr === sitePresetBefore && t1.source === "site" && !t1.stored,
      `实际 ${t1.attr}/${t1.source}/stored=${t1.stored}`
    );

    // ---------- 2. 点「深色」 ----------
    const clickedDark = await clickByText("深色");
    await sleep(300);
    const t2 = await themeNow();
    const stored2 = t2.stored ? JSON.parse(t2.stored) : null;
    check("设置页点得到预设按钮", clickedDark === true);
    check(
      "点「深色」立即生效且记到本地",
      t2.attr === "dark" && t2.source === "local" && stored2?.preset === "dark",
      `实际 ${t2.attr}/${t2.source}/${t2.stored}`
    );
    writeFileSync(`${SHOT_DIR}/01-dark.png`, Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));

    // ---------- 3. 刷新后还在 + 免闪烁脚本先跑 ----------
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `document.addEventListener('DOMContentLoaded', () => { window.__earlyTheme = document.documentElement.getAttribute('data-theme'); window.__earlyPrimary = getComputedStyle(document.documentElement).getPropertyValue('--c-primary').trim(); });`,
    });
    await goto("/settings");
    const t3 = await themeNow();
    const early = await evaluate("({ theme: window.__earlyTheme, primary: window.__earlyPrimary })");
    check("刷新后仍然是自己的主题", t3.attr === "dark" && t3.source === "local", `实际 ${t3.attr}/${t3.source}`);
    check(
      "免闪烁：DOMContentLoaded 时颜色已经是深色（不用等 bundle）",
      early.theme === "dark" && early.primary.toLowerCase() === "#60a5fa",
      `实际 ${JSON.stringify(early)}`
    );

    // ---------- 4. 管理员改全站主题 → 自定义的人不该变 ----------
    const siteAfter = { ...siteBefore, theme: { preset: "warm", primaryColor: "#f97316", backgroundColor: "#fffbeb", textColor: "#431407", accentColor: "#ef4444" } };
    const put = await api("/api/admin/config", { method: "PUT", body: JSON.stringify(siteAfter) });
    check("管理员改全站主题（HTTP 200）", put.status === 200, `HTTP ${put.status} ${put.text.slice(0, 120)}`);

    await goto("/settings");
    const t4 = await themeNow();
    check(
      "全站换成暖色后，自定义用户仍然是深色",
      t4.attr === "dark" && t4.source === "local",
      `实际 ${t4.attr}/${t4.source}`
    );

    // ---------- 5. 「恢复跟随全站」→ 跟着变（同时是对照组） ----------
    const clickedFollow = await clickByText("恢复跟随全站");
    await sleep(400);
    const t5 = await themeNow();
    check("点得到「恢复跟随全站」", clickedFollow === true);
    check(
      "恢复后立刻变成全站的新主题（证明第 4 条不是空转）",
      t5.attr === "warm" && t5.source === "site" && !t5.stored,
      `实际 ${t5.attr}/${t5.source}/stored=${t5.stored}`
    );
    check(
      "暖色那套的具体颜色也真的用上了（--c-bg = #fffbeb）",
      t5.bg.toLowerCase() === "#fffbeb",
      `实际 ${t5.bg}`
    );
    writeFileSync(`${SHOT_DIR}/02-warm.png`, Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));

    // ---------- 6. 颜色微调（所有人可用） ----------
    const colorOk = await evaluate(
      `(() => {
         const input = document.querySelector('input[type="color"]');
         if (!input) return false;
         input.value = "#ff0000";
         input.dispatchEvent(new Event('input', { bubbles: true }));
         return true;
       })()`
    );
    await sleep(300);
    const t6 = await themeNow();
    const stored6 = t6.stored ? JSON.parse(t6.stored) : null;
    check("设置页有颜色微调框", colorOk === true);
    check(
      "改主色立即生效，预设不变",
      t6.primary.toLowerCase() === "#ff0000" && t6.attr === "warm" && stored6?.primaryColor === "#ff0000",
      `实际 primary=${t6.primary} preset=${t6.attr} stored=${t6.stored}`
    );

    // ---------- 7. 坏掉的本地主题要被丢掉 ----------
    await evaluate(`localStorage.setItem('rippling.theme.v1', JSON.stringify({ preset: 'dark' }))`);
    await goto("/settings");
    const t7 = await themeNow();
    check(
      "半份主题（缺颜色）不回落到坏数据，而是丢掉并跟随全站",
      t7.attr === "warm" && t7.source === "site" && !t7.stored,
      `实际 ${t7.attr}/${t7.source}/stored=${t7.stored}`
    );

    // ---------- 8. 「我的」页按钮改名 ----------
    await goto("/profile");
    const profileText = await evaluate("document.body.innerText");
    check(
      "「我的」页按钮叫「设置」而不是「编辑资料」",
      profileText.includes("设置") && !profileText.includes("编辑资料"),
      profileText.includes("编辑资料") ? "还在写编辑资料" : ""
    );

    // ---------- 收尾：把全站配置改回去 ----------
    const restore = await api("/api/admin/config", { method: "PUT", body: JSON.stringify(siteBefore) });
    const after = (await api("/api/admin/config")).json?.data;
    check(
      "全站配置已恢复原样",
      restore.status === 200 && JSON.stringify(after.theme) === JSON.stringify(siteBefore.theme),
      `现在 ${JSON.stringify(after?.theme)}`
    );

    await cdp.send("Browser.close").catch(() => {});
  } finally {
    chromium.kill("SIGKILL");
    rmSync(profileDir, { recursive: true, force: true });
  }

  console.log(`\n通过 ${passed} 项${failures.length ? `，失败 ${failures.length} 项：\n  - ${failures.join("\n  - ")}` : "，全绿"}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error("\n测试自身出错:", error);
  process.exit(2);
});
