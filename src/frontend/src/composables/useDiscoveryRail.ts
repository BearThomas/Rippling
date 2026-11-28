/**
 * 桌面端右栏（>=1280px）辅助发现数据加载
 *
 * 严格遵循不改后端 / Store 原则：
 *   - 复用只读接口 getBlockList() 与 getTimelineList(4, 0)
 *   - 仅在桌面宽屏（>=1280px）且允许匿名浏览（loginWall === "none"）或已登录时发起请求，
 *     避免软墙/硬墙游客触发 401 跳转登录页，也避免移动端浪费请求
 *   - 使用会话内短缓存（2 分钟），切换路由不重复请求；登出时自动清空
 */

import { onBeforeUnmount, onMounted, readonly, shallowRef, watch } from "vue";
import { getBlockList } from "../api/block";
import { getLoginWallMode } from "../api/bootstrap";
import { getTimelineList } from "../api/timeline";
import { useAuthStore } from "../stores/auth";
import type { BlockInfo, TimelineEvent } from "../types";

const CACHE_TTL_MS = 2 * 60 * 1000;
const DESKTOP_RAIL_QUERY = "(min-width: 1280px)";

let cachedBlocks: BlockInfo[] = [];
let cachedTimeline: TimelineEvent[] = [];
let cachedAt = 0;
let cachedForUser: string | null = null;
let inflight: Promise<void> | null = null;

export function useDiscoveryRail() {
  const auth = useAuthStore();
  const blocks = shallowRef<BlockInfo[]>(cachedBlocks);
  const timeline = shallowRef<TimelineEvent[]>(cachedTimeline);
  const loading = shallowRef(false);

  let mql: MediaQueryList | null = null;
  let active = true;

  function isDesktopRailVisible(): boolean {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia(DESKTOP_RAIL_QUERY).matches;
  }

  function resetCache(): void {
    cachedBlocks = [];
    cachedTimeline = [];
    cachedAt = 0;
    cachedForUser = null;
    blocks.value = [];
    timeline.value = [];
  }

  async function load(): Promise<void> {
    if (!auth.loaded || !isDesktopRailVisible()) return;

    const viewerKey = auth.userId ?? "guest";

    // 未登录时先核对登录墙档位：仅 none 模式允许匿名拉取板块与大事记
    if (!auth.isLoggedIn) {
      try {
        const mode = await getLoginWallMode();
        if (mode !== "none") {
          resetCache();
          return;
        }
      } catch {
        return;
      }
    }

    const fresh =
      cachedAt > 0 &&
      Date.now() - cachedAt < CACHE_TTL_MS &&
      cachedForUser === viewerKey;
    if (fresh) {
      blocks.value = cachedBlocks;
      timeline.value = cachedTimeline;
      return;
    }

    if (inflight) {
      await inflight;
      if (active) {
        blocks.value = cachedBlocks;
        timeline.value = cachedTimeline;
      }
      return;
    }

    loading.value = true;
    inflight = (async () => {
      const [blockRes, timelineRes] = await Promise.allSettled([
        getBlockList(),
        getTimelineList(4, 0),
      ]);

      if (blockRes.status === "fulfilled" && Array.isArray(blockRes.value)) {
        cachedBlocks = blockRes.value
          .filter((b) => !b.isLocked)
          .sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0))
          .slice(0, 5);
      }

      if (timelineRes.status === "fulfilled" && Array.isArray(timelineRes.value)) {
        cachedTimeline = timelineRes.value.slice(0, 4);
      }

      cachedAt = Date.now();
      cachedForUser = viewerKey;
    })();

    try {
      await inflight;
      if (active) {
        blocks.value = cachedBlocks;
        timeline.value = cachedTimeline;
      }
    } finally {
      inflight = null;
      if (active) loading.value = false;
    }
  }

  function onMediaChange(event: MediaQueryListEvent): void {
    if (event.matches) void load();
  }

  watch(
    () => [auth.loaded, auth.userId] as const,
    ([loaded, userId], prev) => {
      if (!loaded) return;
      const prevUserId = prev?.[1] ?? null;
      if (prevUserId && !userId) {
        resetCache();
      }
      void load();
    },
    { immediate: true }
  );

  onMounted(() => {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      mql = window.matchMedia(DESKTOP_RAIL_QUERY);
      mql.addEventListener("change", onMediaChange);
    }
    void load();
  });

  onBeforeUnmount(() => {
    active = false;
    mql?.removeEventListener("change", onMediaChange);
    mql = null;
  });

  return {
    blocks: readonly(blocks),
    timeline: readonly(timeline),
    loading: readonly(loading),
  };
}
