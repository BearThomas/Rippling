/**
 * 每日归档脚本（Node.js 环境，GitHub Workflow 执行）
 *
 * 流程：
 *   1. 通过 Cloudflare REST API 查询 D1，找出 updatedAt 超过归档阈值的记录
 *   2. 对每条记录查询 archive_operation 操作链
 *   3. 构建归档文件 → AES-256-GCM 加密 → 写入 archive/ 目录
 *   4. 在 D1 中标记 isArchived = 1
 *
 * 环境变量：
 *   ENCRYPTION_KEY         — 64 字符十六进制密钥
 *   CLOUDFLARE_API_TOKEN   — Cloudflare API Token（需 D1 编辑权限）
 *   CLOUDFLARE_ACCOUNT_ID  — Cloudflare Account ID
 *   D1_DATABASE_ID         — D1 数据库 UUID
 *   ARCHIVE_DAYS           — 归档阈值天数（默认 30）
 *
 * 运行方式：npx tsx scripts/archive.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { encryptData } from "../src/utils/crypto";
import { buildArchiveFile, getArchivePath } from "../src/utils/archive";
import { generateUUID } from "../src/utils/uuid";
import { nowISO } from "../src/utils/time";

// ============================================================
//  配置
// ============================================================

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "";
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? "";
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const D1_DATABASE_ID = process.env.D1_DATABASE_ID ?? "";
const ARCHIVE_DAYS = parseInt(process.env.ARCHIVE_DAYS ?? "30", 10);

const CF_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}`;

// 要归档的类型及对应表名
const ARCHIVE_TARGETS: { type: string; table: string }[] = [
  { type: "post", table: "post" },
  { type: "confession", table: "confession" },
  { type: "timeline", table: "timeline_event" },
  { type: "block", table: "block" },
];

// ============================================================
//  Cloudflare D1 REST API 封装
// ============================================================

interface D1QueryResult<T = Record<string, unknown>> {
  success: boolean;
  result: T[];
}

/** 执行 D1 SQL 查询（SELECT） */
async function d1Query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const resp = await fetch(`${CF_API_BASE}/raw`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`D1 query failed (${resp.status}): ${text}`);
  }

  const json = (await resp.json()) as D1QueryResult<T>;
  if (!json.success) {
    throw new Error(`D1 query error: ${JSON.stringify(json)}`);
  }

  return json.result;
}

/** 执行 D1 SQL 写入（UPDATE / INSERT） */
async function d1Execute(sql: string, params: unknown[] = []): Promise<void> {
  await d1Query(sql, params);
}

// ============================================================
//  归档核心逻辑
// ============================================================

/** 计算归档截止日期（ISO 8601） */
function getArchiveCutoff(): string {
  const d = new Date();
  d.setDate(d.getDate() - ARCHIVE_DAYS);
  return d.toISOString();
}

/** 获取今天的日期字符串 YYYY-MM-DD */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 确保目录存在 */
function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * 归档单个类型的记录
 *
 * @returns { archived: number, failed: number }
 */
async function archiveType(
  type: string,
  table: string,
  cutoff: string,
  date: string
): Promise<{ archived: number; failed: number }> {
  let archived = 0;
  let failed = 0;

  // 查询待归档记录：isArchived = 0 且 updatedAt 早于截止日期
  // confession 和 block 表有 isDeleted 字段但不影响归档判断
  let sql: string;
  if (type === "timeline") {
    // timeline_event 没有 isDeleted 字段
    sql = `SELECT * FROM ${table} WHERE isArchived = 0 AND updatedAt < ?`;
  } else {
    sql = `SELECT * FROM ${table} WHERE isArchived = 0 AND updatedAt < ?`;
  }

  const records = await d1Query<Record<string, unknown>>(sql, [cutoff]);
  console.log(`  [${type}] 找到 ${records.length} 条待归档记录`);

  for (const record of records) {
    const id = record.id as string;
    try {
      // 1. 查询操作链
      const operations = await d1Query<Record<string, unknown>>(
        "SELECT * FROM archive_operation WHERE targetType = ? AND targetId = ? ORDER BY createdAt ASC",
        [type, id]
      );

      // 2. 构建归档文件内容
      const archiveContent = buildArchiveFile(record, operations);

      // 3. 加密
      const encrypted = await encryptData(archiveContent, ENCRYPTION_KEY);

      // 4. 写入文件
      const filePath = getArchivePath(type, id, date);
      const fullPath = path.resolve(filePath);
      ensureDir(path.dirname(fullPath));
      fs.writeFileSync(fullPath, encrypted, "utf-8");

      // 5. 登记归档文件到 archive_index（供管理面板归档查看器使用）
      const archivedAt = nowISO();
      await d1Execute(
        `INSERT INTO archive_index (id, filePath, targetType, targetId, archivedAt)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(filePath) DO UPDATE SET archivedAt = ?`,
        [generateUUID(), filePath, type, id, archivedAt, archivedAt]
      );

      // 6. 在 D1 中标记已归档
      await d1Execute(
        `UPDATE ${table} SET isArchived = 1 WHERE id = ?`,
        [id]
      );

      archived++;
      console.log(`    ✓ ${id} → ${filePath}`);
    } catch (err) {
      failed++;
      console.error(`    ✗ ${id} 失败:`, err);
    }
  }

  return { archived, failed };
}

// ============================================================
//  主入口
// ============================================================

async function main(): Promise<void> {
  console.log("=== Rippling 每日归档 ===");
  console.log(`归档阈值: ${ARCHIVE_DAYS} 天`);
  console.log(`截止日期: ${getArchiveCutoff()}`);
  console.log("");

  // 校验环境变量
  if (!ENCRYPTION_KEY || !CF_API_TOKEN || !CF_ACCOUNT_ID || !D1_DATABASE_ID) {
    console.error("错误: 缺少必要环境变量");
    console.error(
      "需要: ENCRYPTION_KEY, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID"
    );
    process.exit(1);
  }

  if (ENCRYPTION_KEY.length !== 64) {
    console.error("错误: ENCRYPTION_KEY 必须为 64 字符十六进制字符串");
    process.exit(1);
  }

  const date = todayStr();
  let totalArchived = 0;
  let totalFailed = 0;

  for (const target of ARCHIVE_TARGETS) {
    try {
      const { archived, failed } = await archiveType(
        target.type,
        target.table,
        getArchiveCutoff(),
        date
      );
      totalArchived += archived;
      totalFailed += failed;
    } catch (err) {
      console.error(`[${target.type}] 查询失败:`, err);
      totalFailed++;
    }
  }

  console.log("");
  console.log(`=== 归档完成 ===`);
  console.log(`成功: ${totalArchived} 条`);
  console.log(`失败: ${totalFailed} 条`);

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("归档脚本异常:", err);
  process.exit(1);
});
