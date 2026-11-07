#!/usr/bin/env node
/**
 * 推荐流不变量检查（本地开发 / 线上都能跑，零依赖）
 *
 * 用法：
 *   node scripts/test-recommend.mjs [http://127.0.0.1:8799]
 *
 * 环境变量：
 *   ADMIN_STUDENT_ID / ADMIN_PASSWORD（默认 00000000 / testtest123）
 *
 * 它干的事：临时改写站点配置里的推荐权重与类型基础分，检查推荐流的分数
 * 真的跟着变，然后在 finally 里把配置改回去（会校验分数回到原样）。
 *
 * 这一条断言就是为了守住"管理面板里改了权重、推荐流没反应"那个 bug。
 */

const BASE = (process.argv[2] ?? "http://127.0.0.1:8799").replace(/\/$/, "");
const ADMIN_STUDENT_ID = process.env.ADMIN_STUDENT_ID ?? "00000000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "testtest123";

const jar = new Map();
const cookieHeader = () => (jar.size ? [...jar].map(([k, v]) => `${k}=${v}`).join("; ") : null);

async function call(path, { method = "GET", body } = {}) {
  const headers = { Origin: BASE };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const c = cookieHeader();
  if (c) headers.Cookie = c;

  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 非 JSON */ }
  return { status: res.status, json, text };
}

const checks = [];
let skipped = 0;
function check(name, ok, detail = "") {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   ${detail}` : ""}`);
}

/** 没有造出对应内容时，明确算"跳过"，不要假装 PASS */
function skip(name, reason) {
  skipped++;
  console.log(`SKIP  ${name}   ${reason}`);
}

const scoresOf = (res) => (res.json?.data?.items ?? []).map((i) => Number(i.score.toFixed(4)));
const round = (n) => Number(n.toFixed(4));
const same = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 0.01);

const status = await call("/api/setup/status");
if (status.json?.data?.initialized !== true) {
  console.error(`\n✘ 站点还没初始化（${BASE}）\n`);
  process.exit(2);
}

const login = await call("/api/auth/sign-in/email", {
  method: "POST",
  body: { email: `${ADMIN_STUDENT_ID}@rippling.local`, password: ADMIN_PASSWORD },
});
if (login.status !== 200) {
  console.error(`\n✘ 管理员登录失败（HTTP ${login.status}）\n`);
  process.exit(2);
}

const original = (await call("/api/admin/config")).json?.data;
if (!original) {
  console.error("\n✘ 拿不到站点配置（需要 edit_database 权限）\n");
  process.exit(2);
}

const before = scoresOf(await call("/api/recommend"));
if (before.length === 0) {
  console.error("\n✘ 推荐流是空的，先发几篇帖子再跑这个脚本\n");
  process.exit(2);
}

async function applyConfig(patch) {
  const next = { ...original, ...patch };
  const r = await call("/api/admin/config", { method: "PUT", body: next });
  if (r.status !== 200) throw new Error(`保存配置失败：${r.status} ${r.text.slice(0, 160)}`);
  return scoresOf(await call("/api/recommend"));
}

try {
  // 1) 全 0：所有分数应当也全是 0
  const zeroed = await applyConfig({
    recommendWeights: { like: 0, comment: 0, follow: 0, block: 0, time: 0, random: 0 },
    recommendTypeBonus: { post: 0, confession: 0, timeline: 0, vote: 0 },
  });
  check(
    "权重全 0 时分数归零（说明配置真的被读取了）",
    zeroed.length > 0 && zeroed.every((s) => s === 0),
    JSON.stringify(zeroed.slice(0, 5))
  );

  // 2) 只给时间权重：分数必须 > 0，且按发布时间倒序（越新越高）
  const timeOnly = await applyConfig({
    recommendWeights: { like: 0, comment: 0, follow: 0, block: 0, time: 10, random: 0 },
    recommendTypeBonus: { post: 0, confession: 0, timeline: 0, vote: 0 },
  });
  const sortedDesc = timeOnly.every((v, i) => i === 0 || v <= timeOnly[i - 1] + 0.01);
  check("只给时间权重时分数 > 0", timeOnly.every((s) => s >= 0) && timeOnly.some((s) => s > 0), JSON.stringify(timeOnly.slice(0, 5)));
  check("只给时间权重时按时间倒序排列", sortedDesc, JSON.stringify(timeOnly.slice(0, 5)));

  // 3) 只给随机权重：分数各不相同（按 id 的稳定 hash），且和"全 0"不一样
  const randomOnly = await applyConfig({
    recommendWeights: { like: 0, comment: 0, follow: 0, block: 0, time: 0, random: 100 },
    recommendTypeBonus: { post: 0, confession: 0, timeline: 0, vote: 0 },
  });
  check("随机权重生效（分数不全为 0 且不全相同）", randomOnly.some((s) => s > 0) && new Set(randomOnly).size > 1, JSON.stringify(randomOnly.slice(0, 5)));

  // 4) 类型基础分：权重全 0、只给"帖子"50 → 每条帖子的分数必须正好是 50
  //    （用帖子而不是投票，因为帖子里一定有内容，断言不会因为站点没投票而空转）
  await applyConfig({
    recommendWeights: { like: 0, comment: 0, follow: 0, block: 0, time: 0, random: 0 },
    recommendTypeBonus: { post: 50, confession: 0, timeline: 0, vote: 0 },
  });
  const feed4 = (await call("/api/recommend")).json?.data?.items ?? [];
  const postScores = feed4.filter((i) => i.type === "post").map((i) => round(i.score));
  const otherScores = feed4.filter((i) => i.type !== "post").map((i) => round(i.score));
  if (postScores.length === 0) {
    throw new Error("推荐流里没有帖子，先发一篇帖子再跑这个脚本");
  }
  check(
    "帖子基础分 50 时，每条帖子的分数正好是 50",
    postScores.every((v) => Math.abs(v - 50) < 0.01),
    JSON.stringify(postScores.slice(0, 5))
  );
  if (otherScores.length === 0) {
    skip("其他类型不加帖子的基础分", "推荐流里暂时没有表白墙/大事记/投票");
  } else {
    check(
      "其他类型不加帖子的基础分",
      otherScores.every((v) => Math.abs(v) < 0.01),
      JSON.stringify(otherScores.slice(0, 5))
    );
  }
} finally {
  // 无论如何都把配置改回去，并确认分数回到原样
  await call("/api/admin/config", { method: "PUT", body: original });
  const restored = scoresOf(await call("/api/recommend"));
  check("恢复原配置后分数回到原样", same(before, restored), `${JSON.stringify(before.slice(0, 4))} vs ${JSON.stringify(restored.slice(0, 4))}`);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length} 条断言，FAIL ${failed.length} 条${skipped ? `，SKIP ${skipped} 条` : ""}`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f.name}`);
  process.exit(1);
}
