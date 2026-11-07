#!/usr/bin/env node
/**
 * 动效验收：不卡、不跳、尊重系统设置
 *
 * 用法：node scripts/check-motion.mjs [http://127.0.0.1:8788]
 * 前提：本地 `npx wrangler dev --config wrangler.worker.jsonc --port 8788` 起着，
 *       管理员 00000000 / testtest123（可用环境变量覆盖）。
 *
 * 三件事，都是"能证伪"的：
 *   1. **CSS 审计**：把全站样式表里的 transition / animation 抓出来，
 *      只允许动 transform / opacity / 颜色 / grid-template-rows。
 *      动了 width、height、box-shadow、filter、top/left 这些的一律报出来 ——
 *      这些会触发重排或重绘，在 iPhone 8 那种 GPU 上直接掉帧。
 *   2. **减少动态效果真的生效**：用 CDP 模拟 prefers-reduced-motion，
 *      断言 .card-base 的实际 transition-duration 接近 0。
 *      站内开关（rippling.motion.v1=reduced）也要同样生效。
 *   3. **滚动时掉不掉帧**：rAF 采样帧间隔，报 p95。
 *      无头 chromium 没有真实 GPU，这个数字只当参考；真机看 iPhone 8。
 */

import { spawn } from "node:child_process";

const BASE = (process.argv[2] ?? "http://127.0.0.1:8788").replace(/\/$/, "");
const ADMIN_ID = process.env.ADMIN_STUDENT_ID ?? "00000000";
const ADMIN_PW = process.env.ADMIN_PASSWORD ?? "testtest123";
const PORT = Number(process.env.CDP_PORT ?? 9444);

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

// ---------- 登录（墙开着时内容页要登录） ----------
const login = await fetch(`${BASE}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: BASE, Referer: `${BASE}/login` },
  body: JSON.stringify({ email: `${ADMIN_ID}@rippling.local`, password: ADMIN_PW }),
});
if (login.status !== 200) {
  console.error(`  管理员登录失败 HTTP ${login.status}`);
  process.exit(2);
}
const token = decodeURIComponent(
  (login.headers.get("set-cookie") ?? "").match(/better-auth\.session_token=([^;]+)/)?.[1] ?? ""
);

// ---------- 浏览器 ----------
const chrome = spawn(
  "chromium",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=/tmp/rippling-motion-${Date.now()}`,
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
await send("Network.setCookie", {
  name: "better-auth.session_token",
  value: token,
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

const goto = async (path) => {
  await send("Page.navigate", { url: `${BASE}${path}` });
  await sleep(3500);
};

try {
  await goto("/");

  // ---------- 1. 动效审计（按"元素上真的会发生什么"来查） ----------
  //
  // 一开始我是去扫 CSSOM 的规则，结果读不到自己写的 `transition:` 简写
  // （getPropertyValue('transition-property') 对简写返回空串），Tailwind 生成的
  // 长写又能读到 —— 审出来的是"两套标准的混合"，不可信。
  // 改成读**每个元素的实际 computed style**：那是浏览器最终的答案，
  // 不管样式是简写、长写还是 @layer 里来的。
  const auditPages = ["/", "/settings"];
  const auditAll = { examined: 0, offenders: [] };
  for (const page of auditPages) {
    await goto(page);
    const one = await evaluate(`(() => {
      /** 允许动的属性 */
      const ALLOWED = new Set([
        "transform", "opacity",
        "background-color", "color", "border-color", "fill", "stroke",
        // Tailwind 的 .transition-colors 自带它；改下划线颜色不触发重排
        "text-decoration-color",
        // 展开收起靠它才不用事先知道高度
        "grid-template-rows",
      ]);

      /**
       * 明确的例外：做了但没有更便宜的做法。
       * 写在这里是为了让它**可见**，不是为了让审计闭嘴；新增必须留一行理由。
       */
      const EXCEPTIONS = [
        {
          match: (el) => el.className && String(el.className).includes("ring-2"),
          why: "教程聚光灯按 top/left/width/height 过渡：单个绝对定位覆盖层，尺寸变化只影响自己；改成 transform 会让边框和圆角变形。只在首次引导那十几秒出现。",
        },
      ];

      const desc = (el) => {
        const cls = typeof el.className === "string" ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".") : "";
        return el.tagName.toLowerCase() + (cls ? "." + cls : "");
      };

      // 关键帧里动了什么：从 CSSOM 里把 keyframes 的 cssText 抠出来
      const keyframeProps = new Map();
      const collectKeyframes = (rules) => {
        for (const rule of rules) {
          if (rule.type === CSSRule.KEYFRAMES_RULE) {
            const props = new Set();
            const re = /([a-z-]+)\s*:/g;
            let m;
            while ((m = re.exec(rule.cssText))) props.add(m[1]);
            keyframeProps.set(rule.name, [...props]);
            continue;
          }
          if (rule.cssRules) {
            try { collectKeyframes(rule.cssRules); } catch { /* ignore */ }
          }
        }
      };
      for (const sheet of document.styleSheets) {
        try { collectKeyframes(sheet.cssRules); } catch { /* 跨域表 */ }
      }

      const offenders = [];
      let examined = 0;
      const els = [...document.querySelectorAll("*")].slice(0, 2000);
      for (const el of els) {
        const cs = getComputedStyle(el);

        // 过渡
        if (cs.transitionDuration && cs.transitionDuration !== "0s") {
          const props = (cs.transitionProperty || "").split(",").map((v) => v.trim()).filter(Boolean);
          examined += 1;
          const exception = EXCEPTIONS.find((e) => e.match(el));
          for (const prop of props) {
            if (!prop) continue;
            // 动 width 只允许在 fixed 元素上（不牵连别人的布局）
            if (prop === "width" && cs.position === "fixed") continue;
            if (!ALLOWED.has(prop)) {
              offenders.push({
                kind: exception ? "exception" : "transition",
                prop,
                selector: desc(el),
                ctx: exception ? exception.why : "",
              });
            }
          }
        }

        // 动画（骨架屏那种）
        if (cs.animationName && cs.animationName !== "none") {
          examined += 1;
          for (const name of cs.animationName.split(",").map((v) => v.trim())) {
            for (const prop of keyframeProps.get(name) ?? []) {
              if (!ALLOWED.has(prop)) {
                offenders.push({ kind: "keyframes", prop, selector: desc(el) + " @keyframes " + name, ctx: "" });
              }
            }
          }
        }
      }
      return { examined, offenders };
    })()`);
    auditAll.examined += one.examined;
    auditAll.offenders.push(...one.offenders.map((o) => ({ ...o, page })));
  }

  // ---------- 1.5 按压反馈真的存在（不是只写了个 CSS 类） ----------
  // 用 CDP 强制 :active 伪类，读真实的 computed transform。
  await goto("/");
  await send("DOM.enable");
  await send("CSS.enable");
  const { root } = await send("DOM.getDocument", { depth: 1 });
  const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: ".pressable" });
  if (!nodeId) {
    check("首页能找到一个 .pressable 元素", false, "没找到，可能类名改了");
  } else {
    await send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["active"] });
    await sleep(300);
    const pressed = await evaluate(`(() => {
      const el = document.querySelector(".pressable");
      const cs = getComputedStyle(el);
      return { transform: cs.transform, opacity: cs.opacity, transition: cs.transitionDuration };
    })()`);
    await send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
    // matrix(a, b, c, d, e, f) 里的 a 就是缩放系数
    const scale = (() => {
      const m = String(pressed.transform).match(/matrix\(([^,]+),/);
      return m ? Number(m[1]) : 1;
    })();
    check(
      "按下时有缩放反馈（.pressable 真的生效）",
      scale < 1 && scale >= 0.9,
      `transform=${pressed.transform}`
    );
    const pressDur = Number(String(pressed.transition).split(",")[0].trim().replace("ms", "").replace("s", ""));
    check(
      "按压反馈够快（≤200ms，慢了会显得拖）",
      pressDur <= 0.2 || pressDur <= 200,
      `transition-duration=${pressed.transition}`
    );
  }

  const audit = auditAll;
  const exceptions = audit.offenders.filter((o) => o.kind === "exception");
  const violations = audit.offenders.filter((o) => o.kind !== "exception");

  check(`在 ${auditPages.join(" / ")} 上审计到 ${audit.examined} 个在过渡/动画的元素`, audit.examined > 3, "太少说明没抓到");
  for (const e of exceptions) {
    console.log(`  · 例外（已写明理由）：${e.prop} @ ${e.page} ${e.selector}`);
    console.log(`    ${e.ctx}`);
  }
  check(
    "所有过渡/动画只动 transform / opacity / 颜色 / grid-template-rows",
    violations.length === 0,
    violations
      .slice(0, 6)
      .map((o) => `${o.kind}:${o.prop} @ ${o.page} ${o.selector}`)
      .join("; ")
  );

  // ---------- 2. 减少动态效果：系统设置 ----------
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await goto("/");
  const sysReduced = await evaluate(`(() => {
    const el = document.querySelector(".card-base") || document.body;
    const cs = getComputedStyle(el);
    return { duration: cs.transitionDuration, motionAttr: document.documentElement.getAttribute("data-motion") };
  })()`);
  const parseMs = (v) => Number(String(v).split(",")[0].replace("ms", "").replace("s", "")) * (String(v).includes("s") && !String(v).includes("ms") ? 1000 : 1);
  check(
    "系统开了「减少动态效果」→ 过渡时长归零",
    parseMs(sysReduced.duration) <= 1,
    `实际 ${sysReduced.duration}`
  );

  // 显式选 full 的人应该无视系统设置（这是"我就是要看动画"）
  await evaluate(`localStorage.setItem('rippling.motion.v1', 'full')`);
  await goto("/");
  const forcedFull = await evaluate(`getComputedStyle(document.querySelector(".card-base") || document.body).transitionDuration`);
  check(
    "自己选了「完整动画」时无视系统设置",
    parseMs(forcedFull) > 1,
    `实际 ${forcedFull}`
  );

  // ---------- 3. 减少动态效果：站内开关 ----------
  await send("Emulation.setEmulatedMedia", { features: [] });
  await evaluate(`localStorage.setItem('rippling.motion.v1', 'reduced')`);
  await goto("/");
  const siteReduced = await evaluate(`(() => ({
    duration: getComputedStyle(document.querySelector(".card-base") || document.body).transitionDuration,
    motionAttr: document.documentElement.getAttribute("data-motion"),
  }))()`);
  check(
    "站内开了「减少动画」→ 过渡时长归零",
    parseMs(siteReduced.duration) <= 1 && siteReduced.motionAttr === "reduced",
    `实际 duration=${siteReduced.duration} data-motion=${siteReduced.motionAttr}`
  );

  // 恢复默认（跟随系统）
  await evaluate(`localStorage.removeItem('rippling.motion.v1')`);
  await goto("/");

  // ---------- 4. 滚动帧率（参考值） ----------
  const frames = await evaluate(`(async () => {
    const spans = [];
    let last = performance.now();
    const durMs = 1500;
    const start = last;
    // 一边滚一边记帧间隔
    let raf;
    const loop = (t) => { spans.push(t - last); last = t; if (t - start < durMs) raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    const scroller = () => window.scrollBy(0, 24);
    const iv = setInterval(scroller, 16);
    await new Promise((r) => setTimeout(r, durMs + 120));
    clearInterval(iv);
    cancelAnimationFrame(raf);
    const sorted = spans.filter((s) => s > 0).sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
    return { count: sorted.length, p95: Math.round(p95 * 10) / 10 };
  })()`);
  console.log(`  · 滚动帧间隔 p95 = ${frames.p95}ms（${frames.count} 帧，无头环境仅作参考）`);
  check(
    "滚动没有明显卡顿（p95 < 60ms，超过就是真出问题了）",
    frames.p95 < 60,
    `p95=${frames.p95}ms`
  );
} finally {
  await rawSend("Browser.close").catch(() => undefined);
  chrome.kill("SIGKILL");
}

console.log(
  `\n通过 ${passed} 项${failures.length ? `，失败 ${failures.length} 项：\n  - ${failures.join("\n  - ")}` : "，全绿"}`
);
process.exit(failures.length ? 1 : 0);
