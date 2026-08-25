/**
 * Backblaze B2 图片存储工具（S3 兼容 API）
 *
 * Cloudflare Workers 环境没有 Node.js 的 Buffer / crypto，
 * 这里使用 Web Crypto API（crypto.subtle）手动实现 AWS Signature V4 签名，
 * 直接调用 S3 兼容端点的 PutObject / GetObject 操作。
 *
 * 签名流程（AWS Signature V4）：
 *   1. 生成 UTC 时间戳（x-amz-date）与日期（yyyyMMdd）
 *   2. 计算请求体 SHA-256（PUT 为图片二进制；GET 为空体固定哈希）
 *   3. 构造 CanonicalRequest → StringToSign
 *   4. 四级 HMAC-SHA256 派生签名密钥后签名
 *
 * 签名核心抽取为 signB2Request()，上传（PutObject）与读取（GetObject）共用。
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
//  AWS Signature V4 通用签名
// ============================================================

/** GET 等无请求体操作的 payload 哈希（空字符串的 SHA-256，AWS 规范固定值） */
const EMPTY_PAYLOAD_HASH =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/** signB2Request 的返回值：完整请求 URL + 需要附加的请求头 */
interface B2SignedRequest {
  /** 完整请求 URL（path-style：{endpoint}/{bucket}/{key}） */
  url: string;
  /** 签名相关请求头（x-amz-date / x-amz-content-sha256 / Authorization） */
  headers: Record<string, string>;
}

/**
 * 为 B2 S3 兼容请求生成 AWS Signature V4 签名（PutObject / GetObject 共用）
 *
 * 采用 path-style 路径：{endpoint}/{bucket}/{key}，与上传保持一致；
 * 参与签名的头按字典序：host, x-amz-content-sha256, x-amz-date。
 *
 * @param method      HTTP 方法（"PUT" / "GET"）
 * @param bucket      B2 Bucket 名称
 * @param region      B2 region（如 us-west-000）
 * @param key         对象 key（如 images/2025-08/xxx.jpg）
 * @param payloadHash 请求体 SHA-256 十六进制（GET 传 EMPTY_PAYLOAD_HASH）
 * @param env         Cloudflare 环境变量（含 B2_ACCESS_KEY_ID / B2_SECRET_ACCESS_KEY）
 * @returns 签名后的请求 URL 与附加请求头
 */
async function signB2Request(
  method: "PUT" | "GET",
  bucket: string,
  region: string,
  key: string,
  payloadHash: string,
  env: CloudflareEnv
): Promise<B2SignedRequest> {
  const accessKeyId = env.B2_ACCESS_KEY_ID!;
  const secretAccessKey = env.B2_SECRET_ACCESS_KEY!;
  const endpoint = env.B2_ENDPOINT!;

  // host 取自端点（path-style），如 s3.us-west-000.backblazeb2.com
  const endpointUrl = new URL(endpoint);
  const host = endpointUrl.host;

  // ----------------------------------------------------------
  //  1. 时间戳（UTC，格式 yyyyMMdd'T'HHmmss'Z'）
  // ----------------------------------------------------------
  const iso = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const amzDate = iso; // 20260817T120000Z
  const dateStamp = iso.slice(0, 8); // 20260817

  // ----------------------------------------------------------
  //  2. Canonical Request
  //     路径风格（path-style）：{METHOD} /{bucket}/{key}
  // ----------------------------------------------------------
  const canonicalUri = `/${bucket}/${awsUriEncode(key, true)}`;
  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    method,
    canonicalUri,
    "", // 无查询参数
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  // ----------------------------------------------------------
  //  3. StringToSign
  // ----------------------------------------------------------
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest)),
  ].join("\n");

  // ----------------------------------------------------------
  //  4. 派生签名密钥并签名（四级 HMAC 链）
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

  return {
    url: `${endpointUrl.origin}${canonicalUri}`,
    headers: {
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      Authorization: authorization,
    },
  };
}

/**
 * 解析并校验 B2 配置，返回 endpoint / bucket / region
 *
 * @throws 缺少 B2_* 环境变量时抛出 Error
 */
function resolveB2Config(env: CloudflareEnv): {
  bucket: string;
  region: string;
  origin: string;
  host: string;
} {
  const bucket = env.B2_BUCKET_NAME;
  const accessKeyId = env.B2_ACCESS_KEY_ID;
  const secretAccessKey = env.B2_SECRET_ACCESS_KEY;
  const endpoint = env.B2_ENDPOINT;

  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error("B2 存储未配置（缺少 B2_* 环境变量）");
  }

  // region 从 s3.{region}.backblazeb2.com 提取
  const endpointUrl = new URL(endpoint);
  return {
    bucket,
    region: endpointUrl.host.split(".")[1] ?? "us-west-000",
    origin: endpointUrl.origin,
    host: endpointUrl.host,
  };
}

// ============================================================
//  上传（PutObject）
// ============================================================

/**
 * 上传图片到 Backblaze B2
 *
 * 对象 key 规则：images/{yyyy-MM}/{uuid}.{ext}（按月份分目录，UUID 防冲突）。
 *
 * @param file 前端上传的文件（已完成类型 / 大小校验）
 * @param env  Cloudflare 环境变量（含 B2 配置）
 * @returns url：B2 直连地址（Bucket 私有，仅供调试参考）；key：对象 key，用于拼接代理地址
 * @throws B2 配置缺失或上传失败时抛出 Error
 */
export async function uploadImageToB2(
  file: File,
  env: CloudflareEnv
): Promise<{ url: string; key: string }> {
  const { bucket, region, host } = resolveB2Config(env);

  // ----------------------------------------------------------
  //  1. 对象 key 与请求体哈希
  // ----------------------------------------------------------
  const now = new Date();
  const monthDir = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const ext = MIME_TO_EXT[file.type] ?? "bin";
  const key = `images/${monthDir}/${generateUUID()}.${ext}`;

  const payload = await file.arrayBuffer();
  const payloadHash = await sha256Hex(payload);

  // ----------------------------------------------------------
  //  2. 签名（AWS Signature V4）并发起 PutObject 请求
  // ----------------------------------------------------------
  const signed = await signB2Request("PUT", bucket, region, key, payloadHash, env);
  const response = await fetch(signed.url, {
    method: "PUT",
    headers: {
      ...signed.headers,
      "Content-Type": file.type,
    },
    body: payload,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`B2 上传失败（${response.status}）：${text.slice(0, 200)}`);
  }

  // ----------------------------------------------------------
  //  3. 返回 B2 直连 URL（虚拟主机风格，私有 Bucket 仅供调试）与对象 key
  // ----------------------------------------------------------
  return {
    url: `https://${bucket}.${host}/${key}`,
    key,
  };
}

// ============================================================
//  读取（GetObject）
// ============================================================

/**
 * 从 Backblaze B2 私有 Bucket 读取图片（S3 兼容 GetObject + SigV4 签名）
 *
 * @param key 对象 key（如 images/2025-08/xxx.jpg，调用方需先做路径安全校验）
 * @param env Cloudflare 环境变量（含 B2 配置）
 * @returns 图片二进制与 Content-Type；对象不存在（B2 返回 404）时返回 null
 * @throws B2 配置缺失或非 404 的读取失败时抛出 Error
 */
export async function getImageFromB2(
  key: string,
  env: CloudflareEnv
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const { bucket, region } = resolveB2Config(env);

  // GET 无请求体，payload 哈希为固定空串 SHA-256
  const signed = await signB2Request("GET", bucket, region, key, EMPTY_PAYLOAD_HASH, env);
  const response = await fetch(signed.url, {
    method: "GET",
    headers: signed.headers,
  });

  // 对象不存在：返回 null，由路由层统一转 404 响应
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`B2 读取失败（${response.status}）：${text.slice(0, 200)}`);
  }

  return {
    body: await response.arrayBuffer(),
    contentType: response.headers.get("Content-Type") ?? "application/octet-stream",
  };
}
