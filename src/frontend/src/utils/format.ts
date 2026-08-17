/**
 * 格式化工具（时间、数字）
 */

/**
 * 相对时间：几分钟前 / 几小时前 / 几天前，超过 7 天显示日期
 */
export function formatRelativeTime(isoString: string | null | undefined): string {
  if (!isoString) return "";

  const time = new Date(isoString).getTime();
  if (Number.isNaN(time)) return "";

  const diffMs = Date.now() - time;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "刚刚";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)} 分钟前`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)} 小时前`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)} 天前`;

  return formatDate(isoString);
}

/**
 * 日期：YYYY-MM-DD
 */
export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 日期时间：YYYY-MM-DD HH:mm
 */
export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";

  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(isoString)} ${hh}:${mm}`;
}

/**
 * 数字简写：1234 -> 1.2k，1234567 -> 123.4w
 */
export function formatNumber(count: number | null | undefined): string {
  if (!count || count <= 0) return "0";
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1).replace(/\.0$/, "")}w`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(count);
}

/**
 * 截断长文本（列表卡片预览用）
 */
export function truncateText(text: string, maxLength = 120): string {
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/**
 * 倒计时：剩余天/小时/分钟；已截止返回「已结束」
 *
 * @param nowMs - 当前时间戳（传入响应式 now 可驱动定时刷新）
 */
export function formatCountdown(isoString: string, nowMs = Date.now()): string {
  const target = new Date(isoString).getTime();
  if (Number.isNaN(target)) return "";

  const diff = target - nowMs;
  if (diff <= 0) return "已结束";

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  const d = Math.floor(diff / day);
  const h = Math.floor((diff % day) / hour);
  const m = Math.floor((diff % hour) / minute);

  if (d > 0) return `剩 ${d} 天 ${h} 小时`;
  if (h > 0) return `剩 ${h} 小时 ${m} 分钟`;
  return `剩 ${m} 分钟`;
}
