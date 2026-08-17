<!--
  设置页

  账号设置：修改用户名（每月 4 次）/ 修改头像（前端压缩后上传 B2）/
            修改密码 / 注销账号（走工单）。
  主题设置：预设主题切换（所有人本地预览）；颜色变量自定义与
            自定义 CSS 仅超级管理员（edit_database 权限）可见。
  提问箱设置：启用开关 + 仅粉丝可提问。
  关于：版本 / 开源协议 / 仓库链接。
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import { updateUsername, updateAvatar, updatePassword } from "../api/user";
import { uploadImage } from "../api/upload";
import { getAdminSiteConfig, updateAdminSiteConfig } from "../api/admin";
import { getQuestionBox, updateQuestionBox } from "../api/question";
import { useAuthStore } from "../stores/auth";
import { useThemeStore } from "../stores/theme";
import { getMyPermissions } from "../utils/myPermissions";
import { hasPermission, PERM_EDIT_DATABASE } from "../utils/permission";
import { compressImage } from "../utils/compressImage";
import { showToast } from "../utils/toast";
import type { QuestionBoxInfo, SiteConfigTheme } from "../types";

const auth = useAuthStore();
const theme = useThemeStore();

// ============================================================
//  权限探测（超级管理员 = edit_database）
// ============================================================

const isSuperAdmin = ref(false);

onMounted(async () => {
  const mask = await getMyPermissions();
  isSuperAdmin.value = hasPermission(mask, PERM_EDIT_DATABASE);
  await loadQuestionBox();
});

// ============================================================
//  修改用户名（底部弹层，每月最多 4 次）
// ============================================================

/** 用户名合法字符：中文 / 字母 / 数字 / 下划线（与后端一致） */
const USERNAME_PATTERN = /^[\u4e00-\u9fa5A-Za-z0-9_]{1,50}$/;

const usernameSheet = ref(false);
const usernameDraft = ref("");
const usernameSubmitting = ref(false);

function openUsernameSheet(): void {
  usernameDraft.value = auth.username ?? "";
  usernameSheet.value = true;
}

async function submitUsername(): Promise<void> {
  const name = usernameDraft.value.trim();
  if (!USERNAME_PATTERN.test(name)) {
    showToast("用户名需 1-50 字，仅限中文、字母、数字、下划线", "error");
    return;
  }
  usernameSubmitting.value = true;
  try {
    await updateUsername(name);
    showToast("用户名修改成功（每月最多 4 次）", "success");
    usernameSheet.value = false;
    await auth.fetchSession(); // 同步会话中的用户名
  } catch {
    // client.ts 已自动 Toast（被占用 / 次数超限等）
  } finally {
    usernameSubmitting.value = false;
  }
}

// ============================================================
//  修改头像（canvas 压缩 → 上传 B2 → 写入）
// ============================================================

const avatarInput = ref<HTMLInputElement | null>(null);
const avatarUploading = ref(false);

function pickAvatar(): void {
  avatarInput.value?.click();
}

async function onAvatarPicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ""; // 允许重复选择同一文件
  if (!file) return;

  avatarUploading.value = true;
  try {
    // 超过 2MB 先压缩（后端上限 2MB）
    const compressed = await compressImage(file);
    const { url } = await uploadImage(compressed);
    await updateAvatar(url);
    showToast("头像已更新", "success");
    await auth.fetchSession();
  } catch (err) {
    // 上传 / 写入失败已由 API 层 Toast；压缩失败在此提示
    if (err instanceof Error && err.message.includes("图片")) {
      showToast(err.message, "error");
    }
  } finally {
    avatarUploading.value = false;
  }
}

// ============================================================
//  修改密码（新密码 ≥8 位 + 确认一致）
// ============================================================

const pwdCurrent = ref("");
const pwdNew = ref("");
const pwdConfirm = ref("");
const pwdSubmitting = ref(false);

async function submitPassword(): Promise<void> {
  if (!pwdCurrent.value) {
    showToast("请输入当前密码", "error");
    return;
  }
  if (pwdNew.value.length < 8) {
    showToast("新密码至少 8 位", "error");
    return;
  }
  if (pwdNew.value !== pwdConfirm.value) {
    showToast("两次输入的新密码不一致", "error");
    return;
  }
  pwdSubmitting.value = true;
  try {
    await updatePassword(pwdCurrent.value, pwdNew.value);
    showToast("密码修改成功", "success");
    pwdCurrent.value = "";
    pwdNew.value = "";
    pwdConfirm.value = "";
  } catch {
    // client.ts 已自动 Toast（当前密码不正确等）
  } finally {
    pwdSubmitting.value = false;
  }
}

// ============================================================
//  主题设置
// ============================================================

/** 四套预设的颜色变量（与 styles/theme.css 保持一致） */
const PRESET_COLORS: Record<
  SiteConfigTheme["preset"],
  Omit<SiteConfigTheme, "preset">
> = {
  light: {
    primaryColor: "#3b82f6",
    backgroundColor: "#f9fafb",
    textColor: "#1f2937",
    accentColor: "#10b981",
  },
  dark: {
    primaryColor: "#60a5fa",
    backgroundColor: "#111827",
    textColor: "#f9fafb",
    accentColor: "#34d399",
  },
  campus: {
    primaryColor: "#0d9488",
    backgroundColor: "#f0fdfa",
    textColor: "#134e4a",
    accentColor: "#f59e0b",
  },
  warm: {
    primaryColor: "#f97316",
    backgroundColor: "#fffbeb",
    textColor: "#431407",
    accentColor: "#ef4444",
  },
};

const PRESET_LABELS: Record<SiteConfigTheme["preset"], string> = {
  light: "明亮",
  dark: "深色",
  campus: "校园",
  warm: "暖色",
};

/** 当前预览中的主题（本地状态，超管保存后落库） */
const localTheme = ref<SiteConfigTheme>({
  preset: theme.preset,
  ...PRESET_COLORS[theme.preset],
});

const themeSaving = ref(false);

/** 切换预设（本地即时预览） */
function applyPreset(preset: SiteConfigTheme["preset"]): void {
  localTheme.value = { preset, ...PRESET_COLORS[preset] };
  // 通过 theme store 应用到 CSS 变量（config 缺失时仅切 data-theme 兜底）
  if (theme.config) {
    theme.config.theme = { ...localTheme.value };
    theme.applyTheme();
  } else {
    document.documentElement.setAttribute("data-theme", preset);
  }
}

/** 颜色变量自定义（仅超管，本地即时预览） */
function onColorInput(
  field: keyof Omit<SiteConfigTheme, "preset">,
  event: Event
): void {
  const value = (event.target as HTMLInputElement).value;
  localTheme.value[field] = value;
  if (theme.config) {
    theme.config.theme = { ...localTheme.value };
    theme.applyTheme();
  } else {
    document.documentElement.style.setProperty(
      {
        primaryColor: "--c-primary",
        backgroundColor: "--c-bg",
        textColor: "--c-text",
        accentColor: "--c-accent",
      }[field],
      value
    );
  }
}

/** 保存主题（超管：拉完整配置 → 覆写 theme → 落库） */
async function saveTheme(): Promise<void> {
  themeSaving.value = true;
  try {
    const config = await getAdminSiteConfig();
    config.theme = { ...localTheme.value };
    await updateAdminSiteConfig(config);
    showToast("主题已保存并全站生效", "success");
    await theme.loadConfig();
  } catch {
    // client.ts 已自动 Toast
  } finally {
    themeSaving.value = false;
  }
}

/** 自定义 CSS（超管；本任务仅本地预览，持久化由管理面板提供） */
const customCss = ref("");

function previewCustomCss(): void {
  theme.applyCustomCss(customCss.value.trim());
  showToast("已应用预览（刷新页面后恢复）", "success");
}

// ============================================================
//  提问箱设置
// ============================================================

const box = ref<QuestionBoxInfo | null>(null);
const boxSaving = ref(false);

async function loadQuestionBox(): Promise<void> {
  if (!auth.userId) return;
  try {
    box.value = await getQuestionBox(auth.userId);
  } catch {
    box.value = { enabled: false, onlyFollowers: false };
  }
}

/** 保存提问箱设置（开关变化即保存） */
async function saveQuestionBox(): Promise<void> {
  if (!box.value || boxSaving.value) return;
  boxSaving.value = true;
  const snapshot = { ...box.value };
  try {
    await updateQuestionBox(snapshot);
    showToast("提问箱设置已保存", "success");
  } catch {
    // 保存失败已 Toast；回滚本地开关
    box.value = { ...box.value, ...snapshot };
  } finally {
    boxSaving.value = false;
  }
}

// ============================================================
//  关于
// ============================================================

const ABOUT = {
  version: "0.1.0",
  license: "MIT License",
  repo: "https://github.com/",
} as const;

/** 当前头像（会话 image 字段） */
const currentAvatar = computed(() => auth.session?.user?.image ?? null);
</script>

<template>
  <div class="space-y-3 px-3 pt-3 pb-8">
    <!-- ===================== 账号设置 ===================== -->
    <section class="card-base">
      <h3 class="mb-3 font-semibold">账号设置</h3>

      <!-- 修改用户名 -->
      <button
        type="button"
        class="flex w-full items-center justify-between border-b border-line py-3 text-sm"
        @click="openUsernameSheet"
      >
        <span>修改用户名</span>
        <span class="text-ink-soft">{{ auth.username ?? "未登录" }}</span>
      </button>

      <!-- 修改头像 -->
      <button
        type="button"
        class="flex w-full items-center justify-between border-b border-line py-3 text-sm"
        :disabled="avatarUploading"
        @click="pickAvatar"
      >
        <span>修改头像</span>
        <span class="flex items-center gap-2 text-ink-soft">
          <template v-if="avatarUploading">上传中…</template>
          <img
            v-else-if="currentAvatar"
            :src="currentAvatar"
            alt="当前头像"
            class="h-8 w-8 rounded-full object-cover"
          />
          <span v-else class="flex h-8 w-8 items-center justify-center rounded-full text-white" style="background: var(--c-primary)">
            <AppSvgIcon name="user" :size="16" />
          </span>
        </span>
      </button>
      <input
        ref="avatarInput"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        class="hidden"
        @change="onAvatarPicked"
      />

      <!-- 注销账号 -->
      <RouterLink
        to="/ticket/create?type=account_deletion"
        class="flex w-full items-center justify-between py-3 text-sm text-red-500"
      >
        <span>注销账号</span>
        <AppSvgIcon name="back" :size="16" class="rotate-180" />
      </RouterLink>
    </section>

    <!-- 修改密码 -->
    <section class="card-base">
      <h3 class="mb-3 font-semibold">修改密码</h3>
      <form class="space-y-3" @submit.prevent="submitPassword">
        <input
          v-model="pwdCurrent"
          type="password"
          class="input-base"
          placeholder="当前密码"
          autocomplete="current-password"
        />
        <input
          v-model="pwdNew"
          type="password"
          class="input-base"
          placeholder="新密码（至少 8 位）"
          autocomplete="new-password"
        />
        <input
          v-model="pwdConfirm"
          type="password"
          class="input-base"
          placeholder="确认新密码"
          autocomplete="new-password"
        />
        <button type="submit" class="btn-primary w-full" :disabled="pwdSubmitting">
          {{ pwdSubmitting ? "提交中…" : "确认修改" }}
        </button>
      </form>
    </section>

    <!-- ===================== 主题设置 ===================== -->
    <section class="card-base">
      <h3 class="mb-3 font-semibold">主题设置</h3>

      <!-- 预设主题 -->
      <div class="grid grid-cols-4 gap-2">
        <button
          v-for="label in (Object.keys(PRESET_LABELS) as SiteConfigTheme['preset'][])"
          :key="label"
          type="button"
          class="rounded-lg border py-2 text-sm transition-colors"
          :class="localTheme.preset === label
            ? 'border-primary text-primary'
            : 'border-line text-ink-soft'"
          @click="applyPreset(label)"
        >
          {{ PRESET_LABELS[label] }}
        </button>
      </div>
      <p class="mt-2 text-xs text-ink-soft">
        切换后本地即时预览；全站主题由管理员保存。
      </p>

      <!-- 颜色变量自定义（仅超级管理员） -->
      <template v-if="isSuperAdmin">
        <h4 class="mb-2 mt-4 text-sm font-medium">颜色变量自定义</h4>
        <div class="grid grid-cols-2 gap-3">
          <label class="flex items-center justify-between text-sm">
            <span>主色</span>
            <input
              type="color"
              :value="localTheme.primaryColor"
              class="h-8 w-12 cursor-pointer rounded border border-line bg-surface"
              @input="onColorInput('primaryColor', $event)"
            />
          </label>
          <label class="flex items-center justify-between text-sm">
            <span>背景色</span>
            <input
              type="color"
              :value="localTheme.backgroundColor"
              class="h-8 w-12 cursor-pointer rounded border border-line bg-surface"
              @input="onColorInput('backgroundColor', $event)"
            />
          </label>
          <label class="flex items-center justify-between text-sm">
            <span>文字色</span>
            <input
              type="color"
              :value="localTheme.textColor"
              class="h-8 w-12 cursor-pointer rounded border border-line bg-surface"
              @input="onColorInput('textColor', $event)"
            />
          </label>
          <label class="flex items-center justify-between text-sm">
            <span>强调色</span>
            <input
              type="color"
              :value="localTheme.accentColor"
              class="h-8 w-12 cursor-pointer rounded border border-line bg-surface"
              @input="onColorInput('accentColor', $event)"
            />
          </label>
        </div>
        <button
          type="button"
          class="btn-primary mt-3 w-full"
          :disabled="themeSaving"
          @click="saveTheme"
        >
          {{ themeSaving ? "保存中…" : "保存主题（全站生效）" }}
        </button>

        <!-- 自定义 CSS 入口（仅超管，本任务为本地预览） -->
        <h4 class="mb-2 mt-4 text-sm font-medium">自定义 CSS</h4>
        <textarea
          v-model="customCss"
          rows="4"
          class="input-base font-mono text-xs"
          placeholder="例如：.card-base { border-radius: 4px; }"
        ></textarea>
        <button
          type="button"
          class="btn-secondary mt-2 w-full"
          @click="previewCustomCss"
        >
          应用预览
        </button>
        <p class="mt-2 text-xs text-ink-soft">
          预览仅当前会话生效；全站持久化入口在管理面板（后续任务开放）。
        </p>
      </template>
      <p v-else class="mt-3 text-xs text-ink-soft">
        颜色变量自定义与自定义 CSS 仅超级管理员可用。
      </p>
    </section>

    <!-- ===================== 提问箱设置 ===================== -->
    <section class="card-base">
      <h3 class="mb-3 font-semibold">提问箱设置</h3>
      <template v-if="box">
        <label class="flex items-center justify-between py-2 text-sm">
          <span>启用提问箱</span>
          <input
            v-model="box.enabled"
            type="checkbox"
            class="h-5 w-5 accent-[var(--c-primary)]"
            @change="saveQuestionBox"
          />
        </label>
        <label class="flex items-center justify-between py-2 text-sm">
          <span>仅粉丝可提问</span>
          <input
            v-model="box.onlyFollowers"
            type="checkbox"
            class="h-5 w-5 accent-[var(--c-primary)]"
            :disabled="!box.enabled"
            @change="saveQuestionBox"
          />
        </label>
      </template>
      <p v-else class="text-sm text-ink-soft">加载中…</p>
    </section>

    <!-- ===================== 关于 ===================== -->
    <section class="card-base text-sm">
      <h3 class="mb-3 font-semibold">关于</h3>
      <div class="space-y-2 text-ink-soft">
        <p>Rippling · 校园论坛</p>
        <p>版本：{{ ABOUT.version }}</p>
        <p>开源协议：{{ ABOUT.license }}</p>
        <a
          :href="ABOUT.repo"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-1 text-primary"
        >
          <AppSvgIcon name="link" :size="14" />
          GitHub 仓库
        </a>
      </div>
    </section>
  </div>

  <!-- 修改用户名底部弹层 -->
  <div
    v-if="usernameSheet"
    class="fixed inset-0 z-50 flex items-end bg-black/40"
    @click.self="usernameSheet = false"
  >
    <div class="mx-auto w-full max-w-app rounded-t-2xl bg-surface p-4" style="padding-bottom: calc(1rem + env(safe-area-inset-bottom))">
      <h3 class="mb-1 font-semibold">修改用户名</h3>
      <p class="mb-3 text-xs text-ink-soft">
        仅支持中文、字母、数字、下划线；每 30 天最多修改 4 次。
      </p>
      <input
        v-model="usernameDraft"
        type="text"
        class="input-base"
        maxlength="50"
        placeholder="新用户名"
      />
      <div class="mt-3 flex gap-3">
        <button
          type="button"
          class="btn-secondary flex-1"
          @click="usernameSheet = false"
        >
          取消
        </button>
        <button
          type="button"
          class="btn-primary flex-1"
          :disabled="usernameSubmitting"
          @click="submitUsername"
        >
          {{ usernameSubmitting ? "提交中…" : "确认修改" }}
        </button>
      </div>
    </div>
  </div>
</template>
