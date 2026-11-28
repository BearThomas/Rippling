<!--
  注册页 — 用户名 + 学号 + 密码（极简居中单栏表单）

  学号格式由站点配置的 studentIdPattern 校验（默认 ^20\d{6}$）。
  注册成功后 Better Auth 自动登录，刷新会话跳回来源页。
-->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getRegisterQuestions,
  signUp,
  type RegisterQuestionItem,
  type SignUpInput,
} from "../api/auth";
import { useAuthStore } from "../stores/auth";
import { useThemeStore } from "../stores/theme";
import { showToast } from "../utils/toast";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const theme = useThemeStore();

const username = shallowRef("");
const studentId = shallowRef("");
const password = shallowRef("");
const confirmPassword = shallowRef("");
const submitting = shallowRef(false);
const errorMsg = shallowRef("");

/** 注册验证问题（随机 2 道；未配置 / 获取失败时为空数组，不显示问题区） */
const questions = ref<RegisterQuestionItem[]>([]);
const answers = ref(["", ""]);
const needQuestions = computed(() => questions.value.length >= 2);

onMounted(async () => {
  try {
    questions.value = await getRegisterQuestions();
  } catch {
    questions.value = [];
  }
});

const studentIdHint = computed(
  () => theme.config?.studentIdHint ?? "格式：20 开头 + 6 位数字"
);

const studentIdPattern = computed(() => {
  try {
    return new RegExp(theme.config?.studentIdPattern ?? "^20\\d{6}$");
  } catch {
    return /^20\d{6}$/;
  }
});

async function handleSubmit(): Promise<void> {
  if (submitting.value) return;
  errorMsg.value = "";

  if (!username.value.trim()) {
    errorMsg.value = "请输入用户名";
    return showToast(errorMsg.value, "error");
  }
  if (!studentIdPattern.value.test(studentId.value.trim())) {
    errorMsg.value = `学号格式不正确（${studentIdHint.value}）`;
    return showToast(errorMsg.value, "error");
  }
  if (password.value.length < 8) {
    errorMsg.value = "密码至少 8 位";
    return showToast(errorMsg.value, "error");
  }
  if (password.value !== confirmPassword.value) {
    errorMsg.value = "两次密码不一致";
    return showToast(errorMsg.value, "error");
  }
  if (needQuestions.value) {
    if (!answers.value[0].trim() || !answers.value[1].trim()) {
      errorMsg.value = "请回答全部验证问题";
      return showToast(errorMsg.value, "error");
    }
  }

  const payload: SignUpInput = {
    name: username.value.trim(),
    email: studentId.value.trim(),
    password: password.value,
  };

  if (needQuestions.value) {
    payload.questionIndex1 = questions.value[0].index;
    payload.questionIndex2 = questions.value[1].index;
    payload.answer1 = answers.value[0].trim();
    payload.answer2 = answers.value[1].trim();
  }

  submitting.value = true;
  try {
    await signUp(payload);
    await auth.fetchSession();
    showToast("注册成功", "success");

    const redirect = route.query.redirect as string | undefined;
    void router.replace(redirect && redirect.startsWith("/") ? redirect : "/");
  } catch (err) {
    const message = err instanceof Error ? err.message : "注册失败";
    errorMsg.value = message;
    showToast(message, "error");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="mx-auto flex min-h-screen min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
    <div class="mb-7 text-center">
      <div class="mb-2 flex items-center justify-center gap-2.5">
        <img
          v-if="theme.siteIcon"
          :src="theme.siteIcon"
          alt=""
          width="36"
          height="36"
          class="h-9 w-9 rounded-lg object-cover"
        />
        <h1 class="text-2xl font-bold tracking-tight text-ink">注册账号</h1>
      </div>
      <p class="text-sm text-ink-muted">加入 {{ theme.siteName }}</p>
    </div>

    <form class="space-y-4" @submit.prevent="handleSubmit">
      <div>
        <label for="username" class="mb-1.5 block text-sm font-medium text-ink">
          用户名
        </label>
        <input
          id="username"
          v-model="username"
          name="nickname"
          type="text"
          autocomplete="nickname"
          spellcheck="false"
          class="input-base"
          placeholder="设置你的显示昵称…"
        />
      </div>

      <div>
        <label for="reg-student-id" class="mb-1.5 block text-sm font-medium text-ink">
          学号
        </label>
        <input
          id="reg-student-id"
          v-model="studentId"
          name="username"
          type="text"
          inputmode="numeric"
          autocomplete="username"
          spellcheck="false"
          class="input-base"
          :placeholder="`${studentIdHint}…`"
        />
      </div>

      <div>
        <label for="reg-password" class="mb-1.5 block text-sm font-medium text-ink">
          密码
        </label>
        <input
          id="reg-password"
          v-model="password"
          name="new-password"
          type="password"
          autocomplete="new-password"
          class="input-base"
          placeholder="至少 8 位字符…"
        />
      </div>

      <div>
        <label for="reg-confirm" class="mb-1.5 block text-sm font-medium text-ink">
          确认密码
        </label>
        <input
          id="reg-confirm"
          v-model="confirmPassword"
          name="confirm-password"
          type="password"
          autocomplete="new-password"
          class="input-base"
          placeholder="再次输入密码…"
        />
      </div>

      <!-- 验证问题（后端配置了 >= 2 道题时显示，答案必填） -->
      <section
        v-if="needQuestions"
        class="space-y-3 rounded-xl border border-subtle bg-canvas-soft p-4"
      >
        <h2 class="text-sm font-semibold text-ink">入站验证问题</h2>
        <div v-for="(q, qi) in questions.slice(0, 2)" :key="q.index">
          <label
            :for="`reg-question-${qi}`"
            class="mb-1.5 block text-sm text-ink-secondary"
          >
            {{ q.question }}
          </label>
          <input
            :id="`reg-question-${qi}`"
            v-model="answers[qi]"
            type="text"
            autocomplete="off"
            class="input-base"
            :placeholder="`请输入第 ${qi + 1} 题答案…`"
          />
        </div>
      </section>

      <p v-if="errorMsg" role="alert" class="text-xs text-danger">
        {{ errorMsg }}
      </p>

      <button type="submit" class="btn-primary w-full !py-2.5" :disabled="submitting">
        {{ submitting ? "注册中…" : "完成注册" }}
      </button>
    </form>

    <p class="mt-6 text-center text-sm text-ink-muted">
      已有账号？
      <RouterLink to="/login" class="font-medium text-primary hover:underline underline-offset-4">
        去登录
      </RouterLink>
    </p>
  </main>
</template>
