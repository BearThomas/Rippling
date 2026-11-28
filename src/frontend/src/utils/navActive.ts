/**
 * 底部导航 / 侧边栏激活归属规则
 *
 * - 移动端底栏（5 项）：广场 / 板块 / 表白墙 / 应用 / 我的
 * - 桌面 / 平板左栏（完整 Elk 导航）：广场 / 板块 / 表白墙 / 提问箱 / 应用 / 通知 / 我的 / 管理
 */

export type NavTabName = "home" | "blocks" | "confession" | "apps" | "profile";

export type SidebarNavName =
  | "home"
  | "blocks"
  | "confession"
  | "question-box"
  | "apps"
  | "notifications"
  | "profile"
  | "admin";

/** 移动端底部 5 项导航高亮归属 */
export function resolveActiveNav(path: string): NavTabName | null {
  const top = path.split("/")[1] ?? "";
  switch (top) {
    case "":
    case "home":
    case "post":
    case "comment":
    case "search":
      return "home";
    case "blocks":
    case "block":
      return "blocks";
    case "confession":
      return "confession";
    case "apps":
    case "timeline":
    case "vote":
    case "tickets":
    case "ticket":
    case "admin-log":
      return "apps";
    case "profile":
    case "user":
    case "settings":
    case "notification":
    case "notifications":
    case "question-box":
    case "admin":
      return "profile";
    default:
      return null;
  }
}

/** 桌面 / 平板左栏导航高亮归属（细分表白墙、提问箱、通知、管理入口） */
export function resolveActiveSidebarNav(path: string): SidebarNavName | null {
  const top = path.split("/")[1] ?? "";
  switch (top) {
    case "":
    case "home":
    case "post":
    case "comment":
    case "search":
      return "home";
    case "blocks":
    case "block":
      return "blocks";
    case "confession":
      return "confession";
    case "question-box":
      return "question-box";
    case "apps":
    case "timeline":
    case "vote":
    case "tickets":
    case "ticket":
    case "admin-log":
      return "apps";
    case "notification":
    case "notifications":
      return "notifications";
    case "profile":
    case "user":
    case "settings":
      return "profile";
    case "admin":
      return "admin";
    default:
      return null;
  }
}
