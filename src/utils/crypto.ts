/**
 * AES-256-GCM 加密 / 解密工具
 *
 * 使用 Web Crypto API（crypto.subtle）实现。
 * 密钥格式：ENCRYPTION_KEY 为 64 字符十六进制字符串（= 32 字节 = 256 位）。
 *
 * 加密输出格式：base64( IV(12 bytes) || ciphertext+tag )
 * 解密时从 base64 中拆分 IV 和密文，再调用 AES-GCM 解密。
 */

// ============================================================
//  内部辅助
// ============================================================

/** 十六进制字符串 → Uint8Array */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/** Uint8Array → base64 字符串 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** base64 字符串 → Uint8Array */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 将十六进制密钥字符串导入为 CryptoKey
 *
 * 密钥必须为 64 字符十六进制（32 字节 = 256 位），否则抛出错误。
 */
async function importKey(hexKey: string): Promise<CryptoKey> {
  if (hexKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(hexKey)) {
    throw new Error(
      "ENCRYPTION_KEY 必须为 64 字符十六进制字符串（32 字节）"
    );
  }

  const keyData = hexToBytes(hexKey);

  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ============================================================
//  导出函数
// ============================================================

/**
 * 加密 JSON 对象
 *
 * 1. JSON.stringify → UTF-8 编码
 * 2. 生成随机 12 字节 IV
 * 3. AES-256-GCM 加密
 * 4. 返回 base64( IV || ciphertext+tag )
 */
export async function encryptData(
  data: object,
  key: string
): Promise<string> {
  const cryptoKey = await importKey(key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    plaintext
  );

  // 拼接 IV + 密文，再 base64 编码
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return bytesToBase64(combined);
}

/**
 * 解密并还原 JSON 对象
 *
 * 1. base64 解码 → 拆分 IV（前 12 字节）和密文
 * 2. AES-256-GCM 解密
 * 3. UTF-8 解码 → JSON.parse
 */
export async function decryptData(
  encrypted: string,
  key: string
): Promise<object> {
  const cryptoKey = await importKey(key);
  const combined = base64ToBytes(encrypted);

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    ciphertext
  );

  const jsonStr = new TextDecoder().decode(plaintext);
  return JSON.parse(jsonStr);
}
