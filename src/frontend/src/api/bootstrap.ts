/**
 * 首屏引导数据（bootstrap）
 *
 * 一次请求拿齐：是否已初始化 / 站点配置 / 会话 / 自己权限。
 * 以前这四样分别要打 /api/setup/status、/api/config、/api/auth/get-session、
 * /api/permissions/me —— 跨境环境下每个 0.7~2 秒，串起来就是首屏卡住的主因。
 *
 * 两级缓存：
 *   1. 进程内 memo（同一次会话里只请求一次）
 *   2. localStorage 快照（下次打开先用旧数据渲染，再后台刷新）
 * 快照只用来"先把界面画出来"，拿到新数据后立刻覆盖；判断是否登录仍以新数据为准。
 */

import { apiGet } from "./client";
import type { BootstrapData, SessionInfo, SiteConfig } from "../types";

/** 快照存储键（版本化，结构变了直接作废旧快照） */
const SNAPSHOT_KEY = "rippling.bootstrap.v1";
/** 快照最长可信时间：超过就只用它做「首屏占位」，不当作已初始化状态 */
const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Snapshot {
  savedAt: number;
  data: BootstrapData;
}

/** 进程内缓存 */
let cached: BootstrapData | null = null;
let inflight: Promise<BootstrapData> | null = null;

function readSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot;
    if (!parsed?.data || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > SNAPSHOT_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSnapshot(data: BootstrapData): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // 隐私模式 / 配额满：忽略，不影响功能
  }
}

/** 同步读取上次的快照（没有就 null），用于首屏立即渲染 */
export function getBootstrapSnapshot(): BootstrapData | null {
  return cached ?? readSnapshot()?.data ?? null;
}

/** 真正去请求一次 */
async function fetchBootstrap(): Promise<BootstrapData> {
  const data = await apiGet<BootstrapData>("/api/bootstrap", { silentError: true });
  cached = data;
  writeSnapshot(data);
  return data;
}

/**
 * 取 bootstrap 数据（带并发去重 + 进程内缓存）
 *
 * @param force true 时强制重新请求（登录 / 登出 / 改配置后调用）
 */
export function getBootstrap(force = false): Promise<BootstrapData> {
  if (force) cached = null;
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;

  inflight = fetchBootstrap().finally(() => {
    inflight = null;
  });
  return inflight;
}

/**
 * 只要"是否已初始化"这一个信息（路由守卫用）
 *
 * 命中快照时同步返回，不产生请求；否则等一次 bootstrap。
 */
export async function isSiteInitialized(): Promise<boolean> {
  const snapshot = getBootstrapSnapshot();
  if (snapshot) return snapshot.initialized;
  const data = await getBootstrap();
  return data.initialized;
}

/** 清空缓存并重新拉取（登录 / 登出 / 保存配置后调用） */
export function refreshBootstrap(): Promise<BootstrapData> {
  return getBootstrap(true);
}

/** 供主题 / 认证 store 直接用快照里的字段 */
export function snapshotConfig(): SiteConfig | null {
  return getBootstrapSnapshot()?.config ?? null;
}

export function snapshotSession(): SessionInfo | null {
  return getBootstrapSnapshot()?.session ?? null;
}

export function snapshotPermissions(): string | null {
  return getBootstrapSnapshot()?.permissions ?? null;
}
