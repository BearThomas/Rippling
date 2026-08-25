/**
 * 底部导航 / 侧边栏激活归属规则
 *
 * 按当前路由路径的第一段映射到对应导航项，
 * AppTabbar 与 AppSidebar 共用，保证两处高亮一致。
 *
 * 归属规则：
 *   - 首页：/ 以及帖子 /post/*、评论 /comment/*、搜索 /search、
 *     大事记 /timeline、表白墙 /confession、投票 /vote 等内容流页面
 *   - 板块：/blocks 与板块详情 /block/:id
 *   - 应用：/apps
 *   - 我的：/profile、/user/:id、/settings、/notifications、
 *     提问箱 /question-box/*、工单 /tickets 与 /ticket/*、管理后台 /admin*
 *   - 其余未知路径不高亮任何导航项
 */

export type NavTabName = "home" | "blocks" | "apps" | "profile";

/** 根据路由路径解析应高亮的导航项（未知路径返回 null） */
export function resolveActiveNav(path: string): NavTabName | null {
  const top = path.split("/")[1] ?? "";
  switch (top) {
    case "":
    case "home":
    case "post":
    case "comment":
    case "search":
    case "timeline":
    case "confession":
    case "vote":
      return "home";
    case "blocks":
    case "block":
      return "blocks";
    case "apps":
      return "apps";
    case "profile":
    case "user":
    case "settings":
    case "notification":
    case "notifications":
    case "question-box":
    case "tickets":
    case "ticket":
    case "admin":
    case "admin-log":
      return "profile";
    default:
      return null;
  }
}
