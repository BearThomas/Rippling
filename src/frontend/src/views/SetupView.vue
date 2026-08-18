<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
    <div class="container mx-auto px-4 py-8">
      <!-- 页面标题 -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          🚀 Rippling 初始化向导
        </h1>
        <p class="text-gray-600 dark:text-gray-300">
          欢迎使用 Rippling！请完成以下设置来初始化您的站点
        </p>
      </div>

      <!-- 初始化表单 -->
      <div class="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <form @submit.prevent="handleSubmit" class="space-y-6">
          <!-- 站点名称 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              站点名称 *
            </label>
            <input
              v-model="form.siteName"
              type="text"
              class="input-base w-full"
              placeholder="请输入站点名称"
              required
            />
          </div>

          <!-- 学号格式 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              学号格式正则 *
            </label>
            <input
              v-model="form.studentIdPattern"
              type="text"
              class="input-base w-full font-mono text-sm"
              placeholder="例如：^20\d{6}$"
              required
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              用于验证用户输入的学号格式，支持正则表达式
            </p>
          </div>

          <!-- 学号提示 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              学号提示文本 *
            </label>
            <input
              v-model="form.studentIdHint"
              type="text"
              class="input-base w-full"
              placeholder="例如：格式：20 开头 + 6 位数字"
              required
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              用户注册时显示的学号格式提示
            </p>
          </div>

          <!-- 超级管理员学号 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              超级管理员学号 *
            </label>
            <input
              v-model="form.adminStudentId"
              type="text"
              class="input-base w-full"
              placeholder="请输入超级管理员的学号"
              required
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              该学号将拥有站点的所有权限
            </p>
          </div>

          <!-- 超级管理员密码 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              超级管理员密码 *
            </label>
            <div class="relative">
              <input
                v-model="form.adminPassword"
                :type="showPassword ? 'text' : 'password'"
                class="input-base w-full pr-10"
                placeholder="请输入密码（至少8位）"
                required
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <AppSvgIcon name="lock" :size="16" />
              </button>
            </div>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              密码长度至少8位，建议包含字母、数字和特殊字符
            </p>
            <div class="mt-2">
              <div class="flex items-center space-x-1">
                <div
                  v-for="i in 8"
                  :key="i"
                  class="h-1 flex-1 rounded-full transition-all duration-200"
                  :class="getPasswordStrengthClass(i)"
                ></div>
              </div>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                密码强度：{{ getPasswordStrengthText() }}
              </p>
            </div>
          </div>

          <!-- 主题预设 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              主题预设
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label
                v-for="theme in themes"
                :key="theme.value"
                class="cursor-pointer"
              >
                <input
                  v-model="form.theme"
                  type="radio"
                  :value="theme.value"
                  class="sr-only"
                />
                <div
                  class="p-3 rounded-lg border-2 transition-all duration-200"
                  :class="[
                    form.theme === theme.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                  ]"
                >
                  <div class="flex items-center space-x-3">
                    <div
                      class="w-8 h-8 rounded-full flex items-center justify-center"
                      :style="{ backgroundColor: theme.color }"
                    ></div>
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {{ theme.label }}
                    </span>
                  </div>
                </div>
              </label>
            </div>
          </div>

          <!-- 提交按钮 -->
          <div class="pt-4">
            <button
              type="submit"
              :disabled="loading || !isFormValid"
              class="btn-primary w-full flex items-center justify-center space-x-2"
            >
              <span>{{ loading ? "初始化中..." : "开始初始化" }}</span>
            </button>
          </div>
        </form>
      </div>

      <!-- 页脚 -->
      <div class="text-center mt-8 text-sm text-gray-500 dark:text-gray-400">
        <p>
          初始化完成后，您可以使用超级管理员账号登录并管理站点
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { showToast } from "../utils/toast";
import { apiGet, apiPost } from "../api/client";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";

interface SetupFormData {
  siteName: string;
  studentIdPattern: string;
  studentIdHint: string;
  adminStudentId: string;
  adminPassword: string;
  theme: string;
}

const router = useRouter();
const loading = ref(false);
const showPassword = ref(false);
const form = ref<SetupFormData>({
  siteName: "",
  studentIdPattern: "^20\\d{6}$",
  studentIdHint: "格式：20 开头 + 6 位数字",
  adminStudentId: "",
  adminPassword: "",
  theme: "campus",
});

const themes = [
  {
    value: "light",
    label: "明亮",
    color: "#3B82F6",
  },
  {
    value: "dark",
    label: "深色",
    color: "#1F2937",
  },
  {
    value: "campus",
    label: "校园",
    color: "#10B981",
  },
  {
    value: "warm",
    label: "温暖",
    color: "#F59E0B",
  },
];

const isFormValid = computed(() => {
  return (
    form.value.siteName.trim() &&
    form.value.studentIdPattern.trim() &&
    form.value.studentIdHint.trim() &&
    form.value.adminStudentId.trim() &&
    form.value.adminPassword.length >= 8
  );
});

function getPasswordStrengthClass(index: number): string {
  const password = form.value.adminPassword;
  if (password.length === 0) return "bg-gray-200 dark:bg-gray-600";
  if (password.length < 6) return "bg-red-500";
  if (password.length < 8) return "bg-yellow-500";
  if (index <= password.length / 2) return "bg-green-500";
  if (index <= password.length) return "bg-yellow-500";
  return "bg-gray-200 dark:bg-gray-600";
}

function getPasswordStrengthText(): string {
  const password = form.value.adminPassword;
  if (password.length === 0) return "未输入";
  if (password.length < 6) return "弱";
  if (password.length < 8) return "中等";
  return "强";
}

async function handleSubmit() {
  if (!isFormValid.value) {
    showToast("请填写所有必填字段", "error");
    return;
  }

  loading.value = true;
  try {
    await apiPost("/api/setup/initialize", { ...form.value });
    showToast("初始化成功，请使用超级管理员账号登录", "success");
    // 跳转到登录页
    setTimeout(() => {
      router.push("/login");
    }, 2000);
  } catch (error) {
    console.error("初始化失败:", error);
    showToast(error instanceof Error ? error.message : "初始化失败，请检查网络连接", "error");
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  // 检查是否已经初始化
  try {
    const data = await apiGet<{ initialized: boolean }>("/api/setup/status", {
      silentError: true,
    });

    if (data.initialized) {
      showToast("站点已初始化，正在跳转到首页...", "info");
      setTimeout(() => {
        router.push("/");
      }, 2000);
    }
  } catch (error) {
    console.error("检查初始化状态失败:", error);
  }
});
</script>