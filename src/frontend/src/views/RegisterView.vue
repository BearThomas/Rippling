<!--
  注册页 — 用户名 + 学号 + 密码

  学号格式由站点配置的 studentIdPattern 校验（默认 ^20\d{6}$）。
  注册成功后 Better Auth 自动登录，刷新会话跳回来源页。
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
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

const username = ref("");
const studentId = ref("");
const password = ref("");
const confirmPassword = ref("");
const submitting = ref(false);

/** 注册验证问题（随机 2 道；未配置 / 获取失败时为空数组，不显示问题区） */
const questions = ref<RegisterQuestionItem[]>([]);
/** 两道题的答案输入 */
const answers = ref(["", ""]);
/** 是否已获取到 2 道验证问题 */
const needQuestions = computed(() => questions.value.length >= 2);

onMounted(async () => {
  try {
    questions.value = await getRegisterQuestions();
  } catch {
    // 获取失败不阻塞注册：不展示问题区
    questions.value = [];
  }
});

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

  // 后端配置了验证问题时，两道答案必填
  if (needQuestions.value) {
    if (!answers.value[0].trim() || !answers.value[1].trim()) {
      return showToast("请回答验证问题", "error");
    }
  }

  const payload: SignUpInput = {
    name: username.value.trim(),
    email: studentId.value.trim(),
    password: password.value,
  };

  // 携带验证问题下标与答案（index 为题目在原数组中的下标）
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

      <!-- 验证问题（后端配置了 >= 2 道题时显示，答案必填） -->
      <div v-if="needQuestions" class="space-y-3 rounded-xl border border-line bg-surface p-3">
        <p class="text-sm font-semibold text-ink">验证问题</p>
        <div v-for="(q, qi) in questions.slice(0, 2)" :key="q.index">
          <label class="mb-1 block text-sm text-ink-soft">{{ q.question }}</label>
          <input
            v-model="answers[qi]"
            type="text"
            class="input-base"
            :placeholder="`请输入答案（${qi + 1}）`"
          />
        </div>
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
