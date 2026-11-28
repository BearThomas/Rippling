<!--
  登录页 — 学号 + 密码（极简居中单栏表单）

  站点认证方式为 student_id：学号即 Better Auth 的 email 字段。
  登录成功后刷新会话并跳回 redirect 指定的页面。
-->
<script setup lang="ts">
import { shallowRef } from "vue";
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

const studentId = shallowRef("");
const password = shallowRef("");
const submitting = shallowRef(false);
const errorMsg = shallowRef("");

/** 提交登录 */
async function handleSubmit(): Promise<void> {
  if (submitting.value) return;
  errorMsg.value = "";
  if (!studentId.value.trim() || !password.value) {
    errorMsg.value = "请输入学号和密码";
    showToast(errorMsg.value, "error");
    return;
  }

  submitting.value = true;
  try {
    await signIn({ email: studentId.value.trim(), password: password.value });
    await auth.fetchSession();
    // 登录后清权限缓存，避免沿用游客 "0" 权限
    clearPermissionCache();
    notification.startPolling();
    showToast("登录成功", "success");

    const redirect = route.query.redirect as string | undefined;
    void router.replace(redirect && redirect.startsWith("/") ? redirect : "/");
  } catch (err) {
    const message = err instanceof Error ? err.message : "登录失败，请检查学号或密码";
    errorMsg.value = message;
    showToast(message, "error");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="mx-auto flex min-h-screen min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-12">
    <div class="mb-8 text-center">
      <div class="mb-2 flex items-center justify-center gap-2.5">
        <img
          v-if="theme.siteIcon"
          :src="theme.siteIcon"
          alt=""
          width="36"
          height="36"
          class="h-9 w-9 rounded-lg object-cover"
        />
        <h1 class="text-2xl font-bold tracking-tight text-ink">
          {{ theme.siteName }}
        </h1>
      </div>
      <p class="text-sm text-ink-muted">登录校园社区账号</p>
    </div>

    <form class="space-y-4" @submit.prevent="handleSubmit">
      <div>
        <label for="student-id" class="mb-1.5 block text-sm font-medium text-ink">
          学号
        </label>
        <input
          id="student-id"
          v-model="studentId"
          name="username"
          type="text"
          inputmode="numeric"
          autocomplete="username"
          spellcheck="false"
          class="input-base"
          placeholder="例如 20240001…"
        />
      </div>

      <div>
        <label for="password" class="mb-1.5 block text-sm font-medium text-ink">
          密码
        </label>
        <input
          id="password"
          v-model="password"
          name="password"
          type="password"
          autocomplete="current-password"
          class="input-base"
          placeholder="请输入密码…"
        />
      </div>

      <p v-if="errorMsg" role="alert" class="text-xs text-danger">
        {{ errorMsg }}
      </p>

      <button type="submit" class="btn-primary w-full !py-2.5" :disabled="submitting">
        {{ submitting ? "登录中…" : "登录" }}
      </button>
    </form>

    <p class="mt-6 text-center text-sm text-ink-muted">
      还没有账号？
      <RouterLink to="/register" class="font-medium text-primary hover:underline underline-offset-4">
        立即注册
      </RouterLink>
    </p>
  </main>
</template>
