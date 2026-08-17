/**
 * Backblaze B2 图片上传（S3 兼容 API）
 *
 * Cloudflare Workers 环境没有 Node.js 的 Buffer / crypto，
 * 这里使用 Web Crypto API（crypto.subtle）手动实现 AWS Signature V4 签名，
 * 直接调用 S3 兼容端点的 PutObject 操作。
 *
 * 签名流程（AWS Signature V4）：
 *   1. 生成 UTC 时间戳（x-amz-date）与日期（yyyyMMdd）
 *   2. 计算请求体 SHA-256（图片为二进制，真实计算而非 UNSIGNED-PAYLOAD）
 *   3. 构造 CanonicalRequest → StringToSign
 *   4. 四级 HMAC-SHA256 派生签名密钥后签名
 *
 * 需要的环境变量：
 *   B2_BUCKET_NAME / B2_ACCESS_KEY_ID / B2_SECRET_ACCESS_KEY / B2_ENDPOINT
 *   B2_ENDPOINT 形如 https://s3.us-west-000.backblazeb2.com
 */

import type { CloudflareEnv } from "../auth";
import { generateUUID } from "./uuid";

// ============================================================
//  基础加解密辅助（Web Crypto）
// ============================================================

/** ArrayBuffer → 小写十六进制字符串 */
function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}

/** SHA-256 摘要（十六进制） */
async function sha256Hex(data: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufToHex(digest);
}

/** HMAC-SHA256，返回原始 ArrayBuffer（用于链式派生签名密钥） */
async function hmacSha256(
  key: BufferSource,
  data: string
): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

/**
 * URI 编码（AWS 规范）
 *
 * 与 encodeURIComponent 的差异：!*'() 也需要编码；
 * 对象 key 中的 "/" 保留不编码（isPath=true）。
 */
function awsUriEncode(value: string, isPath = false): string {
  let result = "";
  for (const ch of value) {
    if (
      (ch >= "A" && ch <= "Z") ||
      (ch >= "a" && ch <= "z") ||
      (ch >= "0" && ch <= "9") ||
      ch === "-" ||
      ch === "_" ||
      ch === "." ||
      ch === "~"
    ) {
      result += ch;
    } else if (ch === "/" && isPath) {
      result += ch;
    } else {
      // UTF-8 多字节字符逐字节编码
      for (const byte of new TextEncoder().encode(ch)) {
        result += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
      }
    }
  }
  return result;
}

// ============================================================
//  MIME 类型 → 文件扩展名
// ============================================================

/** 允许上传的图片 MIME 类型（路由层校验，这里仅做扩展名映射） */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// ============================================================
//  上传主函数
// ============================================================

/**
 * 上传图片到 Backblaze B2
 *
 * 对象 key 规则：images/{yyyy-MM}/{uuid}.{ext}（按月份分目录，UUID 防冲突）。
 *
 * @param file 前端上传的文件（已完成类型 / 大小校验）
 * @param env  Cloudflare 环境变量（含 B2 配置）
 * @returns 图片公开访问 URL（B2 虚拟主机风格）
 * @throws B2 配置缺失或上传失败时抛出 Error
 */
export async function uploadImageToB2(
  file: File,
  env: CloudflareEnv
): Promise<string> {
  const bucket = env.B2_BUCKET_NAME;
  const accessKeyId = env.B2_ACCESS_KEY_ID;
  const secretAccessKey = env.B2_SECRET_ACCESS_KEY;
  const endpoint = env.B2_ENDPOINT;

  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error("B2 存储未配置（缺少 B2_* 环境变量）");
  }

  // ----------------------------------------------------------
  //  1. 解析端点：region 从 s3.{region}.backblazeb2.com 提取
  // ----------------------------------------------------------
  const endpointUrl = new URL(endpoint);
  const host = endpointUrl.host; // 如 s3.us-west-000.backblazeb2.com
  const region = host.split(".")[1] ?? "us-west-000";

  // ----------------------------------------------------------
  //  2. 对象 key 与请求体哈希
  // ----------------------------------------------------------
  const now = new Date();
  const monthDir = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const ext = MIME_TO_EXT[file.type] ?? "bin";
  const key = `images/${monthDir}/${generateUUID()}.${ext}`;

  const payload = await file.arrayBuffer();
  const payloadHash = await sha256Hex(payload);

  // ----------------------------------------------------------
  //  3. 时间戳（UTC，格式 yyyyMMdd'T'HHmmss'Z'）
  // ----------------------------------------------------------
  const iso = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const amzDate = iso; // 20260817T120000Z
  const dateStamp = iso.slice(0, 8); // 20260817

  // ----------------------------------------------------------
  //  4. Canonical Request
  //
  //  路径风格（path-style）：PUT /{bucket}/{key}
  //  参与签名的头按名称字典序排列：host, x-amz-content-sha256, x-amz-date
  // ----------------------------------------------------------
  const canonicalUri = `/${bucket}/${awsUriEncode(key, true)}`;
  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "", // 无查询参数
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  // ----------------------------------------------------------
  //  5. StringToSign
  // ----------------------------------------------------------
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest)),
  ].join("\n");

  // ----------------------------------------------------------
  //  6. 派生签名密钥并签名（四级 HMAC 链）
  // ----------------------------------------------------------
  const kDate = await hmacSha256(
    new TextEncoder().encode(`AWS4${secretAccessKey}`),
    dateStamp
  );
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, "s3");
  const kSigning = await hmacSha256(kService, "aws4_request");
  const signature = bufToHex(await hmacSha256(kSigning, stringToSign));

  const authorization =
    `AWS4-HMAC-SHA256 ` +
    `Credential=${accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, ` +
    `Signature=${signature}`;

  // ----------------------------------------------------------
  //  7. 发起 PutObject 请求
  // ----------------------------------------------------------
  const requestUrl = `${endpointUrl.origin}${canonicalUri}`;
  const response = await fetch(requestUrl, {
    method: "PUT",
    headers: {
      host,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      Authorization: authorization,
      "Content-Type": file.type,
    },
    body: payload,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`B2 上传失败（${response.status}）：${text.slice(0, 200)}`);
  }

  // ----------------------------------------------------------
  //  8. 返回公开 URL（虚拟主机风格）
  //     https://{bucket}.s3.{region}.backblazeb2.com/{key}
  // ----------------------------------------------------------
  return `https://${bucket}.${host}/${key}`;
}
