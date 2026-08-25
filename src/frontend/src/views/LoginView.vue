<!--
  登录页 — 学号 + 密码

  站点认证方式为 student_id：学号即 Better Auth 的 email 字段。
  登录成功后刷新会话并跳回 redirect 指定的页面。
-->
<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { signIn } from "../api/auth";
import { useAuthStore } from "../stores/auth";
import { useThemeStore } from "../stores/theme";
import { useNotificationStore } from "../stores/notification";
import { clearPermissionCache } from "../utils/myPermissions";
import { showToast } from "../utils/toast";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const theme = useThemeStore();
const notification = useNotificationStore();

const studentId = ref("");
const password = ref("");
const submitting = ref(false);

/** 提交登录 */
async function handleSubmit(): Promise<void> {
  if (submitting.value) return;
  if (!studentId.value.trim() || !password.value) {
    showToast("请输入学号和密码", "error");
    return;
  }

  submitting.value = true;
  try {
    await signIn({ email: studentId.value.trim(), password: password.value });
    await auth.fetchSession();
    // 登录后清权限缓存：若此前以游客身份访问过站点（缓存权限 "0"），
    // 不清除会导致管理面板等按权限显隐的入口在本次会话内一直不显示。
    clearPermissionCache();
    notification.startPolling();
    showToast("登录成功", "success");

    // 跳回来源页（无则回首页）
    const redirect = route.query.redirect as string | undefined;
    router.replace(redirect && redirect.startsWith("/") ? redirect : "/");
  } catch (err) {
    const message = err instanceof Error ? err.message : "登录失败";
    showToast(message, "error");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="mx-auto flex min-h-screen min-h-dvh w-full max-w-app flex-col justify-center px-6">
    <div class="mb-1 flex items-center justify-center gap-3">
      <img
        v-if="theme.siteIcon"
        :src="theme.siteIcon"
        alt=""
        class="h-10 w-10 rounded-lg object-cover"
      />
      <h1 class="text-center text-2xl font-bold text-primary">{{ theme.siteName }}</h1>
    </div>
    <p class="mb-8 text-center text-sm text-ink-soft">校园社区论坛</p>

    <form class="space-y-4" @submit.prevent="handleSubmit">
      <div>
        <label for="student-id" class="mb-1 block text-sm text-ink-soft">学号</label>
        <input
          id="student-id"
          v-model="studentId"
          type="text"
          inputmode="numeric"
          autocomplete="username"
          class="input-base"
          placeholder="20 开头 + 6 位数字"
        />
      </div>

      <div>
        <label for="password" class="mb-1 block text-sm text-ink-soft">密码</label>
        <input
          id="password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          class="input-base"
          placeholder="请输入密码"
        />
      </div>

      <button type="submit" class="btn-primary w-full" :disabled="submitting">
        {{ submitting ? "登录中…" : "登录" }}
      </button>
    </form>

    <p class="mt-6 text-center text-sm text-ink-soft">
      还没有账号？
      <RouterLink to="/register" class="font-medium text-primary">立即注册</RouterLink>
    </p>
  </div>
</template>
