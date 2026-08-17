/**
 * 路由配置（History 模式）
 *
 * 结构：
 *   - 主布局路由（AppLayout：顶栏 + 内容区 + 底部导航）
 *   - 登录 / 注册 / 404 独立于布局之外
 *
 * meta 说明：
 *   - title：页面标题（AppHeader 与 document.title 使用）
 *   - showTabbar：是否显示底部导航（默认 true）
 *   - requiresAuth：需要登录（游客访问跳 /login）
 *   - showBack：顶栏显示返回按钮
 */

import { createRouter, createWebHistory } from "vue-router";
import type { RouteRecordRaw } from "vue-router";
import AppLayout from "../components/layout/AppLayout.vue";
import { useAuthStore } from "../stores/auth";

// 主布局页面（首屏依赖，直接静态导入）
import HomeView from "../views/HomeView.vue";
import BlocksView from "../views/BlocksView.vue";
import AppsView from "../views/AppsView.vue";
import ProfileView from "../views/ProfileView.vue";

// 次级页面（懒加载，减小首屏体积）
const PostDetailView = () => import("../views/PostDetailView.vue");
const PostCreateView = () => import("../views/PostCreateView.vue");
const CommentDetailView = () => import("../views/CommentDetailView.vue");
const SearchView = () => import("../views/SearchView.vue");
const LoginView = () => import("../views/LoginView.vue");
const RegisterView = () => import("../views/RegisterView.vue");
const NotificationView = () => import("../views/NotificationView.vue");
const SettingsView = () => import("../views/SettingsView.vue");
const AdminView = () => import("../views/AdminView.vue");
const TimelineView = () => import("../views/TimelineView.vue");
const TimelineDetailView = () => import("../views/TimelineDetailView.vue");
const ConfessionView = () => import("../views/ConfessionView.vue");
const ConfessionDetailView = () => import("../views/ConfessionDetailView.vue");
const VoteView = () => import("../views/VoteView.vue");
const VoteDetailView = () => import("../views/VoteDetailView.vue");
const BlockDetailView = () => import("../views/BlockDetailView.vue");
const TicketListView = () => import("../views/TicketListView.vue");
const TicketDetailView = () => import("../views/TicketDetailView.vue");
const TicketCreateView = () => import("../views/TicketCreateView.vue");
const AdminLogView = () => import("../views/AdminLogView.vue");
const QuestionBoxView = () => import("../views/QuestionBoxView.vue");
const NotFoundView = () => import("../views/NotFoundView.vue");

const routes: RouteRecordRaw[] = [
  // 登录 / 注册独立于主布局
  {
    path: "/login",
    name: "login",
    component: LoginView,
    meta: { title: "登录" },
  },
  {
    path: "/register",
    name: "register",
    component: RegisterView,
    meta: { title: "注册" },
  },

  // 主布局路由
  {
    path: "/",
    component: AppLayout,
    children: [
      {
        path: "",
        name: "home",
        component: HomeView,
        meta: { title: "首页" },
      },
      {
        path: "blocks",
        name: "blocks",
        component: BlocksView,
        meta: { title: "板块" },
      },
      {
        path: "apps",
        name: "apps",
        component: AppsView,
        meta: { title: "应用" },
      },
      {
        path: "profile",
        name: "profile",
        component: ProfileView,
        meta: { title: "我的" },
      },
      {
        // 注意：静态段 "post/create" 由 Vue Router 4 的打分机制保证
        // 优先于下方 "post/:id" 匹配，无需担心被详情路由吞掉
        path: "post/create",
        name: "post-create",
        component: PostCreateView,
        meta: { title: "发帖", showBack: true, showTabbar: false, requiresAuth: true },
      },
      {
        path: "post/:id",
        name: "post-detail",
        component: PostDetailView,
        meta: { title: "帖子详情", showBack: true, showTabbar: false },
      },
      {
        path: "comment/:id",
        name: "comment-detail",
        component: CommentDetailView,
        meta: { title: "评论详情", showBack: true, showTabbar: false },
      },
      {
        path: "search",
        name: "search",
        component: SearchView,
        meta: { title: "搜索", showBack: true, showTabbar: false },
      },
      {
        path: "notifications",
        name: "notifications",
        component: NotificationView,
        meta: { title: "通知", showBack: true, requiresAuth: true },
      },
      {
        path: "settings",
        name: "settings",
        component: SettingsView,
        meta: { title: "设置", showBack: true, requiresAuth: true },
      },
      {
        path: "admin",
        name: "admin",
        component: AdminView,
        meta: { title: "管理面板", showBack: true, requiresAuth: true },
      },
      {
        path: "timeline",
        name: "timeline",
        component: TimelineView,
        meta: { title: "大事记", showBack: true },
      },
      {
        path: "timeline/:id",
        name: "timeline-detail",
        component: TimelineDetailView,
        meta: { title: "大事记详情", showBack: true, showTabbar: false },
      },
      {
        path: "confession",
        name: "confession",
        component: ConfessionView,
        meta: { title: "表白墙", showBack: true },
      },
      {
        path: "confession/:id",
        name: "confession-detail",
        component: ConfessionDetailView,
        meta: { title: "表白详情", showBack: true, showTabbar: false },
      },
      {
        path: "vote",
        name: "vote",
        component: VoteView,
        meta: { title: "投票", showBack: true },
      },
      {
        path: "vote/:id",
        name: "vote-detail",
        component: VoteDetailView,
        meta: { title: "投票详情", showBack: true, showTabbar: false },
      },
      {
        path: "block/:id",
        name: "block-detail",
        component: BlockDetailView,
        meta: { title: "板块详情", showBack: true, showTabbar: false },
      },
      {
        path: "tickets",
        // 兼容任务约定的 /ticket/my 路径
        alias: "ticket/my",
        name: "ticket-list",
        component: TicketListView,
        meta: { title: "我的工单", showBack: true, requiresAuth: true },
      },
      {
        // 静态段 "ticket/create" 由打分机制保证优先于 "ticket/:id"
        path: "ticket/create",
        name: "ticket-create",
        component: TicketCreateView,
        meta: { title: "提交工单", showBack: true, showTabbar: false, requiresAuth: true },
      },
      {
        path: "ticket/:id",
        name: "ticket-detail",
        component: TicketDetailView,
        meta: { title: "工单详情", showBack: true, showTabbar: false, requiresAuth: true },
      },
      {
        path: "admin-log",
        name: "admin-log",
        component: AdminLogView,
        meta: { title: "管理日志", showBack: true },
      },
      {
        path: "question-box/:userId",
        name: "question-box",
        component: QuestionBoxView,
        meta: { title: "提问箱", showBack: true, showTabbar: false },
      },
    ],
  },

  // 404 兜底
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: NotFoundView,
    meta: { title: "页面不存在" },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 };
  },
});

// 全局前置守卫：登录校验 + 页面标题
router.beforeEach((to) => {
  if (to.meta.requiresAuth) {
    const auth = useAuthStore();
    // 会话尚未加载完成时先视为游客，由页面自行处理加载态
    if (auth.loaded && !auth.isLoggedIn) {
      return { path: "/login", query: { redirect: to.fullPath } };
    }
  }
  return true;
});

router.afterEach((to) => {
  const title = to.meta.title as string | undefined;
  document.title = title ? `${title} · Rippling` : "Rippling";
});

export default router;
