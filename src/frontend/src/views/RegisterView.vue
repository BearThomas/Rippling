<!--
  注册页 — 用户名 + 学号 + 密码

  学号格式由站点配置的 studentIdPattern 校验（默认 ^20\d{6}$）。
  注册成功后 Better Auth 自动登录，刷新会话跳回来源页。
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { signUp } from "../api/auth";
import { useAuthStore } from "../stores/auth";
import { useThemeStore } from "../stores/theme";
import { showToast } from "../utils/toast";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const theme = useThemeStore();

const username = ref("");
const studentId = ref("");
const password = ref("");
const confirmPassword = ref("");
const submitting = ref(false);

/** 学号格式提示（来自站点配置） */
const studentIdHint = computed(
  () => theme.config?.studentIdHint ?? "格式：20 开头 + 6 位数字"
);

/** 学号校验正则（来自站点配置，编译失败时回退默认） */
const studentIdPattern = computed(() => {
  try {
    return new RegExp(theme.config?.studentIdPattern ?? "^20\\d{6}$");
  } catch {
    return /^20\d{6}$/;
  }
});

/** 提交注册 */
async function handleSubmit(): Promise<void> {
  if (submitting.value) return;

  if (!username.value.trim()) return showToast("请输入用户名", "error");
  if (!studentIdPattern.value.test(studentId.value.trim())) {
    return showToast(`学号格式不正确（${studentIdHint.value}）`, "error");
  }
  if (password.value.length < 8) return showToast("密码至少 8 位", "error");
  if (password.value !== confirmPassword.value) return showToast("两次密码不一致", "error");

  submitting.value = true;
  try {
    await signUp({
      name: username.value.trim(),
      email: studentId.value.trim(),
      password: password.value,
    });
    await auth.fetchSession();
    showToast("注册成功", "success");

    const redirect = route.query.redirect as string | undefined;
    router.replace(redirect && redirect.startsWith("/") ? redirect : "/");
  } catch (err) {
    const message = err instanceof Error ? err.message : "注册失败";
    showToast(message, "error");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="mx-auto flex min-h-screen w-full max-w-app flex-col justify-center px-6 py-10">
    <h1 class="mb-6 text-center text-2xl font-bold text-primary">注册</h1>

    <form class="space-y-4" @submit.prevent="handleSubmit">
      <div>
        <label for="username" class="mb-1 block text-sm text-ink-soft">用户名</label>
        <input
          id="username"
          v-model="username"
          type="text"
          autocomplete="nickname"
          class="input-base"
          placeholder="你的昵称"
        />
      </div>

      <div>
        <label for="reg-student-id" class="mb-1 block text-sm text-ink-soft">学号</label>
        <input
          id="reg-student-id"
          v-model="studentId"
          type="text"
          inputmode="numeric"
          autocomplete="username"
          class="input-base"
          :placeholder="studentIdHint"
        />
      </div>

      <div>
        <label for="reg-password" class="mb-1 block text-sm text-ink-soft">密码</label>
        <input
          id="reg-password"
          v-model="password"
          type="password"
          autocomplete="new-password"
          class="input-base"
          placeholder="至少 8 位"
        />
      </div>

      <div>
        <label for="reg-confirm" class="mb-1 block text-sm text-ink-soft">确认密码</label>
        <input
          id="reg-confirm"
          v-model="confirmPassword"
          type="password"
          autocomplete="new-password"
          class="input-base"
          placeholder="再次输入密码"
        />
      </div>

      <button type="submit" class="btn-primary w-full" :disabled="submitting">
        {{ submitting ? "注册中…" : "注册" }}
      </button>
    </form>

    <p class="mt-6 text-center text-sm text-ink-soft">
      已有账号？
      <RouterLink to="/login" class="font-medium text-primary">去登录</RouterLink>
    </p>
  </div>
</template>
