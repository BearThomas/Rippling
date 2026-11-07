/**
 * 从 Markdown 正文里抽出图片地址
 *
 * 帖子里写图片有两种写法，都要认：
 *   ![](url)          —— 标准 Markdown
 *   <img src="url">   —— 有人会直接贴 HTML（DOMPurify 允许 img，所以能渲染）
 *
 * 只收 http(s) 与站内的 /api/image 代理地址，其它（data:、javascript:）一律丢掉。
 */

/** 单篇最多展示多少张（再多就只取前几张，卡片里横滑也不至于太长） */
const MAX_IMAGES = 12;

const MARKDOWN_IMAGE = /!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
const HTML_IMAGE = /<img[^>]*\ssrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

/** 判断地址是否安全可展示 */
function isAllowedUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("/api/image")) return true;
  return /^https?:\/\//i.test(url);
}

/**
 * 提取正文里的图片地址（按出现顺序、去重）
 *
 * @param content Markdown 原文
 * @returns 图片 URL 列表（最多 MAX_IMAGES 条）
 */
export function extractImageUrls(content: string | null | undefined): string[] {
  if (!content) return [];

  const found: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string | undefined): void => {
    if (!raw) return;
    const url = raw.trim();
    if (!isAllowedUrl(url) || seen.has(url)) return;
    seen.add(url);
    found.push(url);
  };

  for (const match of content.matchAll(MARKDOWN_IMAGE)) push(match[1]);
  for (const match of content.matchAll(HTML_IMAGE)) push(match[1]);

  return found.slice(0, MAX_IMAGES);
}

/**
 * 正文去掉图片后还剩多少内容（用来决定"要不要显示文字预览"）
 *
 * 一条只有图片的帖子，没必要再显示一行空预览。
 */
export function hasTextBesidesImages(content: string | null | undefined): boolean {
  if (!content) return false;
  const stripped = content
    .replace(MARKDOWN_IMAGE, " ")
    .replace(HTML_IMAGE, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > 0;
}
/**
 * 去掉正文里的图片，只留文字（列表预览用）
 *
 * 列表里图片已经单独渲染成横滑条了，正文预览里再出现 `![宽](http://…)`
 * 这种原始 Markdown 会很难看。
 */
export function stripImages(content: string | null | undefined): string {
  if (!content) return "";
  return content
    .replace(MARKDOWN_IMAGE, " ")
    .replace(HTML_IMAGE, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
