/**
 * 首次使用引导（onboarding tour）的状态与步骤
 *
 * 状态存 localStorage：unseen / skipped / done。
 *   只有 unseen 会自动弹出欢迎卡片；跳过和走完都记下来，不再打扰。
 *   设置页 → 「重新观看使用引导」可以把状态改回 unseen 并立刻打开。
 *
 * 每一步都可以带：
 *   route  —— 先跳到这个路由
 *   target —— 要高亮的元素（页面里挂 data-tour="xxx"）
 * 目标找不到时（页面结构变了 / 手机上不渲染桌面侧栏）自动跳过这一条，
 * 而不是卡住整段引导。
 */

import { ref } from "vue";
import { getRecommendFeed } from "../api/recommend";

export type TourStatus = "unseen" | "skipped" | "done";

const STORAGE_KEY = "rippling.onboarding.v1";

// ============================================================
//  持久化
// ============================================================

export function readTourStatus(): TourStatus {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "done" || raw === "skipped") return raw;
    return "unseen";
  } catch {
    // 隐私模式下 localStorage 可能不可用：当作"已看过"，别每次刷新都弹
    return "done";
  }
}

export function writeTourStatus(status: TourStatus): void {
  try {
    localStorage.setItem(STORAGE_KEY, status);
  } catch {
    // 写不进去就算了，不影响使用
  }
}

// ============================================================
//  步骤定义
// ============================================================

export interface TourStep {
  id: string;
  /** 需要先导航到的路由（不写 = 停在当前页） */
  route?: string;
  /** 高亮目标选择器（不写 = 居中的说明卡片） */
  target?: string;
  title: string;
  body: string;
}

export const WELCOME_STEP: TourStep = {
  id: "welcome",
  title: "第一次来？用一分钟熟悉一下",
  body: "接下来会带你走一遍首页、板块、应用、我的、帖子详情和搜索，每条只说一件事。随时可以跳过 —— 之后在「设置」里还能再看一遍。",
};

export const FINISH_STEP: TourStep = {
  id: "finish",
  title: "就这些，开始用吧",
  body: "想再看一遍：我的 → 设置 → 重新观看使用引导。遇到问题或者想建板块，去「我的 → 工单」提交。",
};

/** 首页第一条帖子的 id（用于「帖子详情」那一步），由首页加载后回填 */
export const tourContext = { firstPostId: null as string | null };

export function setTourFirstPostId(id: string | null): void {
  tourContext.firstPostId = id;
}

/** 兜底：首页还没加载完时，自己问一次推荐流 */
async function resolveFirstPostId(): Promise<string | null> {
  if (tourContext.firstPostId) return tourContext.firstPostId;
  try {
    const feed = await getRecommendFeed();
    const first = (feed.items ?? []).find((item) => item.type === "post");
    return first ? first.id : null;
  } catch {
    return null;
  }
}

/**
 * 组装步骤序列
 *
 */
export async function buildTourSteps(): Promise<TourStep[]> {
  const firstPostId = await resolveFirstPostId();

  const steps: TourStep[] = [
    WELCOME_STEP,
    {
      id: "home-feed",
      route: "/",
      target: '[data-tour="home-feed"]',
      title: "首页 · 推荐流",
      body: "这里按点赞、评论、关注、板块和时间算分排序，越新越活跃的内容越靠前。滑到底部会自动加载下一页。",
    },
    {
      id: "home-pinned",
      route: "/",
      target: '[data-tour="home-pinned"]',
      title: "首页 · 置顶区",
      body: "管理员置顶的通知固定在最上面；你点开过的置顶会自动折叠，不用每次都滚一遍。",
    },
    {
      id: "header-search",
      route: "/",
      target: '[data-tour="header-search"]',
      title: "搜索",
      body: "搜帖子、评论、用户、板块、大事记、表白墙。进搜索页后可以按类型只看其中一类。",
    },
    {
      id: "home-fab",
      route: "/",
      target: '[data-tour="home-fab"]',
      title: "发帖",
      body: "右下角这个按钮发帖。可见性可选「公开 / 仅自己 / 指定用户」，也能直接发到某个板块。",
    },
    {
      id: "tabbar",
      route: "/",
      target: '[data-tour="tabbar"]',
      title: "四个主入口",
      body: "首页看推荐流；板块按年级/班级组织；应用里是大事记、表白墙、投票这些；我的里是个人设置和小工具。",
    },
    {
      id: "blocks",
      route: "/blocks",
      target: '[data-tour="blocks-list"]',
      title: "板块",
      body: "上半部分是「我的板块」，下面是还能申请的板块。锁定的板块只能申请或邀请进入，退不出来的是官方年级/班级板块。",
    },
    {
      id: "apps",
      route: "/apps",
      target: '[data-tour="apps-list"]',
      title: "应用",
      body: "大事记、表白墙、投票、创建板块（走工单）、我的工单、管理日志都从这里进。",
    },
    {
      id: "profile",
      route: "/profile",
      target: '[data-tour="profile-menu"]',
      title: "我的",
      body: "「编辑资料」「管理提问箱」在头像下面；工单、申请认证、退出登录在下面这一段；再往下是别人也能看到的帖子和评论。",
    },
    {
      id: "search",
      route: "/search",
      target: '[data-tour="search-tabs"]',
      title: "搜索页",
      body: "上面这一排按类型筛选；翻页的「加载更多」是按你看得见的结果翻的，不会因为有些内容你没权限而卡住。",
    },
  ];

  if (firstPostId) {
    steps.push({
      id: "post-detail",
      route: `/post/${firstPostId}`,
      target: '[data-tour="post-actions"]',
      title: "帖子详情",
      body: "点赞、评论、编辑和删除都在这一行；评论支持 Markdown，匿名发评论会显示「匿名用户」。",
    });
  }

  steps.push(FINISH_STEP);
  return steps;
}

// ============================================================
//  运行状态（模块级单例：设置页也能触发）
// ============================================================

export const tourOpen = ref(false);
export const tourSteps = ref<TourStep[]>([]);
export const tourIndex = ref(0);

/** 开始引导（status 保持 unseen，走完 / 跳过时再写） */
export function startTour(steps: TourStep[]): void {
  tourSteps.value = steps;
  tourIndex.value = 0;
  tourOpen.value = true;
}

/** 结束引导并记录结果 */
export function endTour(status: Extract<TourStatus, "done" | "skipped">): void {
  writeTourStatus(status);
  tourOpen.value = false;
  tourIndex.value = 0;
}

/** 设置页的「重新观看」：状态改回 unseen 再打开 */
export function restartTour(steps: TourStep[]): void {
  writeTourStatus("unseen");
  startTour(steps);
}
