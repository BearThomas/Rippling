/**
 * 应用入口
 *
 * 启动顺序：
 *   1. 创建 Pinia / Router
 *   2. 拉取站点配置应用主题（不阻塞渲染）
 *   3. 拉取会话，登录用户启动通知轮询
 */

import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import "./styles/main.css";
import { useThemeStore } from "./stores/theme";
import { useAuthStore } from "./stores/auth";
import { useNotificationStore } from "./stores/notification";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.mount("#app");

// 初始化：主题与会话（并行，互不阻塞）
const theme = useThemeStore();
const auth = useAuthStore();
const notification = useNotificationStore();

void theme.loadConfig();
void auth.fetchSession().then(() => {
  // 登录用户启动未读通知轮询（红点）
  if (auth.isLoggedIn) notification.startPolling();
});
