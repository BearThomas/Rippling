/**
 * 应用入口
 *
 * 启动顺序：
 *   1. 创建 Pinia / Router
 *   2. 拉取站点配置应用主题（不阻塞渲染）
 *   3. 拉取会话，登录用户启动通知轮询
 *   4. PWA：注册 Service Worker（仅生产环境）+ 离线监听
 */

import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import "./styles/main.css";
import { useThemeStore } from "./stores/theme";
import { useAuthStore } from "./stores/auth";
import { useNotificationStore } from "./stores/notification";
import { registerServiceWorker, setupOfflineListener } from "./utils/pwa";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.mount("#app");

// 初始化：主题与会话（并行，互不阻塞）
const theme = useThemeStore();
const auth = useAuthStore();
const notification = useNotificationStore();

void theme.loadConfig().then(() => {
  // 配置加载完成后刷新当前页标题：
  // 首次路由导航的 afterEach 可能早于 /api/config 返回（当时回退为 Rippling），
  // 这里用自定义 siteName 重新拼接，保证首屏即显示正确标题
  const route = router.currentRoute.value;
  const title = route.meta.title as string | undefined;
  document.title = title ? `${title} · ${theme.siteName}` : theme.siteName;
});
void auth.fetchSession().then(() => {
  // 登录用户启动未读通知轮询（红点）
  if (auth.isLoggedIn) notification.startPolling();
});

// PWA：生产环境注册 Service Worker（window load 后），并监听离线状态
registerServiceWorker();
setupOfflineListener();
