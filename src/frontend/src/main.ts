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
import { getBootstrap, getBootstrapSnapshot } from "./api/bootstrap";
import { primePermissions } from "./utils/myPermissions";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

const theme = useThemeStore();
const auth = useAuthStore();

// 0) 本地主题先上来（存 localStorage，不等网络）——自己挑过主题的人不会看到
//    "先按全站主题闪一下再变"；「跟随全站」的人这里什么都不会发生
theme.init();
const notification = useNotificationStore();

// 1) 先用上次的 bootstrap 快照把站名 / 主题 / 登录态画出来（0 请求，不闪白）
const snapshot = getBootstrapSnapshot();
if (snapshot) {
  theme.applyBootstrap(snapshot);
  auth.applyBootstrap(snapshot);
  primePermissions(snapshot.permissions);
}

app.mount("#app");

// 2) 再拉一次真实数据覆盖快照（网络慢也不影响首屏已经出来了）
void getBootstrap()
  .then((data) => {
    theme.applyBootstrap(data);
    auth.applyBootstrap(data);

    const route = router.currentRoute.value;
    const title = route.meta.title as string | undefined;
    document.title = title ? `${title} · ${theme.siteName}` : theme.siteName;

    if (auth.isLoggedIn) notification.startPolling();
  })
  .catch((error) => {
    // 拿不到就继续用快照 / 默认主题，不阻塞使用
    console.warn("bootstrap 加载失败，继续使用本地快照:", error);
    theme.loaded = true;
    auth.loaded = true;
  });

// PWA：生产环境注册 Service Worker（window load 后），并监听离线状态
registerServiceWorker();
setupOfflineListener();
