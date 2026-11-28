<!--
  设置页（极简分层表单页 + AppDialog 弹层 + AppSwitch 开关 + ConfirmDialog 解绑确认）

  - 保留两层主题架构与 test-theme.mjs 断言（预设按钮精准文案、"恢复跟随全站"按钮与 input[type="color"]）
  - 保留退出登录一键行为（可逆操作，不弹确认框）
  - 3 个手写底部弹层替换为 AppDialog，原生复选框替换为 AppSwitch，设备解绑接入 ConfirmDialog
-->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import { useRouter } from "vue-router";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import AppDialog from "../components/common/AppDialog.vue";
import AppSwitch from "../components/common/AppSwitch.vue";
import UserAvatar from "../components/user/UserAvatar.vue";
import { useConfirm } from "../composables/useConfirm";
import {
  updateUsername,
  updateAvatar,
  updatePassword,
  updateBadge,
  getUserProfile,
  getUserDevices,
  deleteUserDevice,
  setMainDevice,
} from "../api/user";
import { uploadImage } from "../api/upload";
import { getAdminSiteConfig, updateAdminSiteConfig } from "../api/admin";
import { getQuestionBox, updateQuestionBox } from "../api/question";
import { useAuthStore } from "../stores/auth";
import { useThemeStore } from "../stores/theme";
import { useMotionStore } from "../stores/motion";
import { clearPermissionCache, getMyPermissions } from "../utils/myPermissions";
import { hasPermission, PERM_EDIT_DATABASE, PERM_SET_NAME_BADGE } from "../utils/permission";
import { compressImage } from "../utils/compressImage";
import { formatDateTime } from "../utils/format";
import { showToast } from "../utils/toast";
import { buildTourSteps, restartTour } from "../utils/onboarding";
import { PRESET_COLORS, PRESET_LABELS, PRESET_ORDER } from "../utils/themePresets";
import type { ThemePreset } from "../utils/themePresets";
import type { QuestionBoxInfo, SiteConfigTheme, UserDevice } from "../types";

const router = useRouter();
const auth = useAuthStore();
const theme = useThemeStore();
const motion = useMotionStore();
const { confirm } = useConfirm();

// ============================================================
//  权限探测（超级管理员 = edit_database）
// ============================================================

const isSuperAdmin = shallowRef(false);
const canSetBadge = shallowRef(false);
const myBadge = shallowRef("");
const myNameColor = shallowRef<string | null>(null);
const myAvatarUrl = shallowRef<string | null>(null);

async function onRestartTour(): Promise<void> {
  try {
    restartTour(await buildTourSteps());
  } catch {
    // 拼装失败不打扰用户
  }
}

onMounted(async () => {
  const mask = await getMyPermissions();
  isSuperAdmin.value = hasPermission(mask, PERM_EDIT_DATABASE);
  canSetBadge.value = hasPermission(mask, PERM_SET_NAME_BADGE);
  if (auth.userId) {
    try {
      const profile = await getUserProfile(auth.userId);
      myBadge.value = profile.badge ?? "";
      myNameColor.value = profile.nameColor ?? null;
      if (profile.avatar) myAvatarUrl.value = profile.avatar;
    } catch {
      myBadge.value = "";
    }
  }
  await loadQuestionBox();
  if (auth.isLoggedIn) {
    void loadDevices();
  }
});

// ============================================================
//  修改用户名（AppDialog，每月最多 4 次）
// ============================================================

const USERNAME_PATTERN = /^[\u4e00-\u9fa5A-Za-z0-9_]{1,50}$/;

const usernameSheet = shallowRef(false);
const usernameDraft = shallowRef("");
const usernameSubmitting = shallowRef(false);

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
    auth.setUsername(name);
    await auth.fetchSession();
  } catch {
    // client.ts 已自动 Toast
  } finally {
    usernameSubmitting.value = false;
  }
}

// ============================================================
//  修改头像（canvas 压缩 → 上传 B2 → 写入）
// ============================================================

const avatarInput = ref<HTMLInputElement | null>(null);
const avatarUploading = shallowRef(false);

function pickAvatar(): void {
  avatarInput.value?.click();
}

async function onAvatarPicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  avatarUploading.value = true;
  try {
    const compressed = await compressImage(file);
    const { url } = await uploadImage(compressed);
    await updateAvatar(url);
    myAvatarUrl.value = url;
    showToast("头像已更新", "success");
    await auth.fetchSession();
  } catch (err) {
    if (err instanceof Error && err.message.includes("图片")) {
      showToast(err.message, "error");
    }
  } finally {
    avatarUploading.value = false;
  }
}

// ============================================================
//  修改名字牌子（AppDialog，0-7 字）
// ============================================================

const badgeSheet = shallowRef(false);
const badgeDraft = shallowRef("");
const badgeSubmitting = shallowRef(false);

function openBadgeSheet(): void {
  badgeDraft.value = myBadge.value;
  badgeSheet.value = true;
}

async function submitBadge(): Promise<void> {
  const badge = badgeDraft.value.trim();
  if (badge.length > 7) {
    showToast("名字牌子最多 7 个字", "error");
    return;
  }
  if (/[\n\r\t]/.test(badge)) {
    showToast("名字牌子不能包含换行或控制字符", "error");
    return;
  }
  badgeSubmitting.value = true;
  try {
    await updateBadge(badge);
    showToast("名字牌子已更新", "success");
    myBadge.value = badge;
    badgeSheet.value = false;
    await auth.fetchSession();
  } catch {
    // client.ts 已自动 Toast
  } finally {
    badgeSubmitting.value = false;
  }
}

// ============================================================
//  登录设备管理（AppDialog + ConfirmDialog）
// ============================================================

const devicesSheet = shallowRef(false);
const devicesLoading = shallowRef(false);
const devices = ref<UserDevice[]>([]);
const deviceOperating = shallowRef<string | null>(null);

async function loadDevices(): Promise<void> {
  if (!auth.isLoggedIn) return;
  devicesLoading.value = true;
  try {
    const res = await getUserDevices();
    devices.value = res.devices;
  } catch {
    // client.ts 已自动 Toast
  } finally {
    devicesLoading.value = false;
  }
}

function openDevicesSheet(): void {
  devicesSheet.value = true;
  void loadDevices();
}

async function handleSetMainDevice(device: UserDevice): Promise<void> {
  if (device.isMainDevice || deviceOperating.value) return;
  deviceOperating.value = device.deviceId;
  try {
    await setMainDevice(device.deviceId);
    showToast("已设为主设备", "success");
    await loadDevices();
  } catch {
    // client.ts 已自动 Toast
  } finally {
    deviceOperating.value = null;
  }
}

async function handleRemoveDevice(device: UserDevice): Promise<void> {
  if (deviceOperating.value) return;
  const ok = await confirm({
    title: device.isCurrentDevice ? "解绑当前设备？" : "解绑该设备？",
    description: device.isCurrentDevice
      ? "解绑后当前设备可能需要重新登录。"
      : "解绑后该设备将被移出已登录列表。",
    confirmText: "确认解绑",
    variant: "danger",
  });
  if (!ok) return;

  deviceOperating.value = device.deviceId;
  try {
    await deleteUserDevice(device.deviceId);
    showToast("设备已解绑", "success");
    await loadDevices();
  } catch {
    // client.ts 已自动 Toast
  } finally {
    deviceOperating.value = null;
  }
}

// ============================================================
//  修改密码
// ============================================================

const pwdCurrent = shallowRef("");
const pwdNew = shallowRef("");
const pwdConfirm = shallowRef("");
const pwdSubmitting = shallowRef(false);

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
    // client.ts 已自动 Toast
  } finally {
    pwdSubmitting.value = false;
  }
}

// ============================================================
//  退出登录
// ============================================================

const signingOut = shallowRef(false);

async function handleSignOut(): Promise<void> {
  if (signingOut.value) return;
  signingOut.value = true;
  try {
    await auth.signOut();
    clearPermissionCache();
    showToast("已退出登录", "success");
    void router.push("/login");
  } finally {
    signingOut.value = false;
  }
}

// ============================================================
//  主题（本地自定义优先于全站默认）
// ============================================================

const activeTheme = computed(() => theme.theme);

function presetDots(preset: ThemePreset): string[] {
  return [
    PRESET_COLORS[preset].primaryColor,
    PRESET_COLORS[preset].accentColor,
    PRESET_COLORS[preset].backgroundColor,
  ];
}

function pickPreset(preset: ThemePreset): void {
  theme.setPreset(preset);
}

function onColorInput(field: keyof Omit<SiteConfigTheme, "preset">, event: Event): void {
  theme.setColor(field, (event.target as HTMLInputElement).value);
}

function followSite(): void {
  if (!theme.hasLocalTheme) return;
  theme.clearLocalTheme();
  showToast("已恢复跟随全站主题", "success");
}

const COLOR_FIELDS = ["primaryColor", "backgroundColor", "textColor", "accentColor"] as const;

const COLOR_LABELS: Record<keyof Omit<SiteConfigTheme, "preset">, string> = {
  primaryColor: "主色",
  backgroundColor: "背景",
  textColor: "文字",
  accentColor: "强调色",
};

const themeSaving = shallowRef(false);

async function saveAsSiteDefault(): Promise<void> {
  themeSaving.value = true;
  try {
    const config = await getAdminSiteConfig();
    config.theme = { ...activeTheme.value };
    await updateAdminSiteConfig(config);
    showToast("已存为全站默认（你自己仍在使用自定义主题）", "success");
    await theme.loadConfig(true);
  } catch {
    // client.ts 已自动 Toast
  } finally {
    themeSaving.value = false;
  }
}

const customCss = shallowRef("");

function previewCustomCss(): void {
  theme.applyCustomCss(customCss.value.trim());
  showToast("已应用预览（刷新页面后恢复）", "success");
}

// ============================================================
//  提问箱设置（AppSwitch）
// ============================================================

const box = ref<QuestionBoxInfo | null>(null);
const boxSaving = shallowRef(false);

async function loadQuestionBox(): Promise<void> {
  if (!auth.userId) return;
  try {
    box.value = await getQuestionBox(auth.userId);
  } catch {
    box.value = { enabled: false, onlyFollowers: false };
  }
}

async function saveQuestionBox(next: Partial<QuestionBoxInfo>): Promise<void> {
  if (!box.value || boxSaving.value) return;
  const prev = { ...box.value };
  const merged = { ...prev, ...next };
  box.value = merged;
  boxSaving.value = true;
  try {
    await updateQuestionBox(merged);
    showToast("提问箱设置已保存", "success");
  } catch {
    box.value = prev;
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
  repo: "https://github.com/BearThomas/Rippling",
  repoLabel: "BearThomas/Rippling",
} as const;

const currentAvatar = computed(() => myAvatarUrl.value ?? auth.session?.user?.image ?? null);
</script>

<template>
  <div class="divide-y divide-[var(--border-subtle)] pb-10">
    <!-- ===================== 账号设置 ===================== -->
    <section class="px-4 py-5 sm:px-5">
      <h2 class="mb-2 text-sm font-semibold text-ink">账号设置</h2>

      <div class="divide-y divide-[var(--border-subtle)]">
        <!-- 修改用户名 -->
        <button
          type="button"
          class="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-3 text-left text-sm hover:bg-hover pressable"
          @click="openUsernameSheet"
        >
          <span class="text-ink">修改用户名</span>
          <span class="flex min-w-0 items-center gap-1.5 text-ink-muted">
            <span class="truncate">{{ auth.username ?? "未登录" }}</span>
            <AppSvgIcon name="chevronRight" :size="15" class="shrink-0" />
          </span>
        </button>

        <!-- 修改头像 -->
        <button
          type="button"
          class="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-3 text-left text-sm hover:bg-hover pressable disabled:opacity-50"
          :disabled="avatarUploading"
          @click="pickAvatar"
        >
          <span class="text-ink">修改头像</span>
          <span class="flex items-center gap-2 text-ink-muted">
            <template v-if="avatarUploading">上传中…</template>
            <UserAvatar
              v-else
              :src="currentAvatar"
              :name="auth.username ?? '?'"
              :name-color="myNameColor"
              size="md"
              alt="当前头像"
            />
            <AppSvgIcon name="chevronRight" :size="15" class="shrink-0" />
          </span>
        </button>
        <input
          ref="avatarInput"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          class="hidden"
          @change="onAvatarPicked"
        />

        <!-- 名字牌子 -->
        <button
          v-if="canSetBadge"
          type="button"
          class="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-3 text-left text-sm hover:bg-hover pressable"
          @click="openBadgeSheet"
        >
          <span class="text-ink">名字牌子</span>
          <span class="flex items-center gap-1.5 text-ink-muted">
            <span>{{ myBadge || "未设置" }}</span>
            <AppSvgIcon name="chevronRight" :size="15" class="shrink-0" />
          </span>
        </button>

        <!-- 登录设备管理 -->
        <button
          v-if="auth.isLoggedIn"
          type="button"
          class="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-3 text-left text-sm hover:bg-hover pressable"
          @click="openDevicesSheet"
        >
          <span class="text-ink">登录设备管理</span>
          <span class="flex items-center gap-1.5 text-ink-muted">
            <span v-if="devices.length > 0" class="tabular-nums">{{ devices.length }} 台设备</span>
            <AppSvgIcon name="chevronRight" :size="15" class="shrink-0" />
          </span>
        </button>

        <!-- 退出登录 -->
        <button
          v-if="auth.isLoggedIn"
          type="button"
          class="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-3 text-left text-sm hover:bg-hover pressable disabled:opacity-50"
          :disabled="signingOut"
          @click="handleSignOut"
        >
          <span class="text-ink">{{ signingOut ? "退出中…" : "退出登录" }}</span>
          <AppSvgIcon name="logout" :size="16" class="text-ink-muted" />
        </button>

        <!-- 注销账号 -->
        <RouterLink
          to="/ticket/create?type=account_deletion"
          class="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-3 text-sm text-danger hover:bg-danger-soft pressable"
        >
          <span>注销账号</span>
          <AppSvgIcon name="chevronRight" :size="15" class="shrink-0" />
        </RouterLink>
      </div>
    </section>

    <!-- ===================== 修改密码 ===================== -->
    <section class="px-4 py-5 sm:px-5">
      <h2 class="mb-3 text-sm font-semibold text-ink">修改密码</h2>
      <form class="space-y-3" @submit.prevent="submitPassword">
        <div>
          <label for="pwd-current" class="sr-only">当前密码</label>
          <input
            id="pwd-current"
            v-model="pwdCurrent"
            name="current-password"
            type="password"
            class="input-base"
            placeholder="当前密码…"
            autocomplete="current-password"
          />
        </div>
        <div>
          <label for="pwd-new" class="sr-only">新密码</label>
          <input
            id="pwd-new"
            v-model="pwdNew"
            name="new-password"
            type="password"
            class="input-base"
            placeholder="新密码（至少 8 位）…"
            autocomplete="new-password"
          />
        </div>
        <div>
          <label for="pwd-confirm" class="sr-only">确认新密码</label>
          <input
            id="pwd-confirm"
            v-model="pwdConfirm"
            name="confirm-password"
            type="password"
            class="input-base"
            placeholder="确认新密码…"
            autocomplete="new-password"
          />
        </div>
        <button type="submit" class="btn-primary w-full" :disabled="pwdSubmitting">
          {{ pwdSubmitting ? "提交中…" : "确认修改" }}
        </button>
      </form>
    </section>

    <!-- ===================== 外观与动效 ===================== -->
    <section class="px-4 py-5 sm:px-5">
      <div class="mb-3 flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold text-ink">主题</h2>
        <span
          class="rounded-full px-2.5 py-0.5 text-xs font-medium"
          :class="theme.hasLocalTheme ? 'bg-accent-soft text-primary' : 'bg-hover text-ink-secondary'"
        >
          {{ theme.hasLocalTheme ? "我自己的" : "跟随全站" }}
        </span>
      </div>

      <!-- 预设（保持按钮文本仅为预设名以兼容 test-theme.mjs） -->
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="preset in PRESET_ORDER"
          :key="preset"
          type="button"
          class="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left pressable"
          :class="
            theme.hasLocalTheme && activeTheme.preset === preset
              ? 'border-primary bg-accent-soft'
              : 'border-subtle bg-surface hover:border-strong'
          "
          @click="pickPreset(preset)"
        >
          <span class="flex shrink-0 gap-1" aria-hidden="true">
            <i
              v-for="(dot, i) in presetDots(preset)"
              :key="i"
              class="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
              :style="{ backgroundColor: dot }"
            />
          </span>
          <span class="flex-1 text-sm font-medium text-ink">{{ PRESET_LABELS[preset] }}</span>
          <AppSvgIcon
            v-if="theme.hasLocalTheme && activeTheme.preset === preset"
            name="check"
            :size="15"
            class="shrink-0 text-primary"
          />
        </button>
      </div>

      <!-- 颜色微调 -->
      <h3 class="mb-2.5 mt-5 text-xs font-semibold text-ink-muted">颜色微调</h3>
      <div class="space-y-2.5">
        <label
          v-for="field in COLOR_FIELDS"
          :key="field"
          class="flex items-center gap-3 text-sm text-ink"
        >
          <span class="flex-1">{{ COLOR_LABELS[field] }}</span>
          <span class="font-mono text-xs uppercase tabular-nums text-ink-muted">
            {{ activeTheme[field] }}
          </span>
          <input
            type="color"
            :value="activeTheme[field]"
            :aria-label="`${COLOR_LABELS[field]}颜色`"
            class="h-8 w-11 shrink-0 cursor-pointer rounded-lg border border-strong bg-surface p-0.5"
            @input="onColorInput(field, $event)"
          />
        </label>
      </div>
      <p class="mt-2.5 text-xs leading-relaxed text-ink-muted">
        只保存在这台设备上；管理员修改全站主题时，不会覆盖你的自定义配色。
      </p>

      <!-- 减少动画（AppSwitch） -->
      <div class="mt-4 flex items-center justify-between gap-4 border-t border-subtle pt-4">
        <label for="switch-reduced-motion" class="min-w-0 flex-1 cursor-pointer">
          <span class="block text-sm font-medium text-ink">减少动画</span>
          <span class="mt-0.5 block text-xs text-ink-muted">
            关闭过渡与呼吸动效（系统开启“减少动态效果”时默认生效）
          </span>
        </label>
        <AppSwitch
          id="switch-reduced-motion"
          :model-value="motion.reduced"
          aria-label="减少动画"
          @update:model-value="motion.toggleReduced($event)"
        />
      </div>

      <button
        v-if="theme.hasLocalTheme"
        type="button"
        class="btn-secondary mt-4 w-full"
        @click="followSite"
      >
        恢复跟随全站
      </button>

      <!-- 超管：存为全站默认 & 自定义 CSS 预览 -->
      <template v-if="isSuperAdmin">
        <button
          type="button"
          class="btn-primary mt-3 w-full"
          :disabled="themeSaving"
          @click="saveAsSiteDefault"
        >
          {{ themeSaving ? "保存中…" : "存为全站默认" }}
        </button>
        <p class="mt-2 text-xs text-ink-muted">
          仅影响“跟随全站”的用户，不会改动已自定义主题的设备。
        </p>

        <div class="mt-5 border-t border-subtle pt-4">
          <label for="custom-css-preview" class="mb-2 block text-xs font-semibold text-ink-muted">
            自定义 CSS 本地预览
          </label>
          <textarea
            id="custom-css-preview"
            v-model="customCss"
            rows="4"
            spellcheck="false"
            class="input-base font-mono text-xs"
            placeholder="例如：.memo-card { border-radius: 16px; }…"
          />
          <button
            type="button"
            class="btn-secondary mt-2 w-full"
            @click="previewCustomCss"
          >
            应用预览
          </button>
          <p class="mt-1.5 text-xs text-ink-muted">
            预览仅当前会话生效，刷新后恢复。
          </p>
        </div>
      </template>
    </section>

    <!-- ===================== 提问箱设置 ===================== -->
    <section class="px-4 py-5 sm:px-5">
      <h2 class="mb-3 text-sm font-semibold text-ink">提问箱设置</h2>
      <div v-if="box" class="space-y-3.5">
        <div class="flex items-center justify-between gap-4">
          <label for="switch-qbox-enabled" class="cursor-pointer text-sm text-ink">
            启用提问箱
          </label>
          <AppSwitch
            id="switch-qbox-enabled"
            :model-value="box.enabled"
            :disabled="boxSaving"
            aria-label="启用提问箱"
            @update:model-value="saveQuestionBox({ enabled: $event })"
          />
        </div>
        <div class="flex items-center justify-between gap-4">
          <label
            for="switch-qbox-followers"
            class="cursor-pointer text-sm"
            :class="box.enabled ? 'text-ink' : 'text-ink-muted'"
          >
            仅粉丝可提问
          </label>
          <AppSwitch
            id="switch-qbox-followers"
            :model-value="box.onlyFollowers"
            :disabled="!box.enabled || boxSaving"
            aria-label="仅粉丝可提问"
            @update:model-value="saveQuestionBox({ onlyFollowers: $event })"
          />
        </div>
      </div>
      <p v-else class="text-sm text-ink-muted">加载中…</p>
    </section>

    <!-- ===================== 关于 ===================== -->
    <section class="px-4 py-5 text-sm sm:px-5">
      <h2 class="mb-3 text-sm font-semibold text-ink">关于</h2>
      <div class="space-y-2 text-ink-secondary">
        <p>{{ theme.siteName }} · 校园论坛</p>
        <p class="tabular-nums text-xs text-ink-muted">
          版本 {{ ABOUT.version }} · {{ ABOUT.license }}
        </p>
        <div class="flex flex-wrap items-center gap-4 pt-1">
          <a
            :href="ABOUT.repo"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 text-sm text-primary hover:underline underline-offset-4"
          >
            <AppSvgIcon name="link" :size="14" />
            <span>GitHub · {{ ABOUT.repoLabel }}</span>
          </a>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 text-sm text-primary hover:underline underline-offset-4 pressable"
            @click="onRestartTour"
          >
            <AppSvgIcon name="sliders" :size="14" />
            <span>重新观看使用引导</span>
          </button>
        </div>
      </div>
    </section>
  </div>

  <!-- 修改用户名弹窗（AppDialog） -->
  <AppDialog
    v-model:open="usernameSheet"
    title="修改用户名"
    description="仅支持中文、字母、数字、下划线；每 30 天最多修改 4 次。"
    size="sm"
    :dismissible="!usernameSubmitting"
  >
    <form id="username-form" @submit.prevent="submitUsername">
      <label for="username-draft-input" class="sr-only">新用户名</label>
      <input
        id="username-draft-input"
        v-model="usernameDraft"
        type="text"
        autocomplete="off"
        spellcheck="false"
        class="input-base"
        maxlength="50"
        placeholder="输入新用户名…"
      />
    </form>

    <template #footer>
      <div class="flex gap-2.5">
        <button
          type="button"
          class="btn-secondary flex-1"
          :disabled="usernameSubmitting"
          @click="usernameSheet = false"
        >
          取消
        </button>
        <button
          type="submit"
          form="username-form"
          class="btn-primary flex-1"
          :disabled="usernameSubmitting"
        >
          {{ usernameSubmitting ? "提交中…" : "确认修改" }}
        </button>
      </div>
    </template>
  </AppDialog>

  <!-- 修改名字牌子弹窗（AppDialog） -->
  <AppDialog
    v-model:open="badgeSheet"
    title="名字牌子"
    description="最多 7 个字，不能包含换行或控制字符；留空可移除。"
    size="sm"
    :dismissible="!badgeSubmitting"
  >
    <form id="badge-form" @submit.prevent="submitBadge">
      <label for="badge-draft-input" class="sr-only">名字牌子</label>
      <input
        id="badge-draft-input"
        v-model="badgeDraft"
        type="text"
        autocomplete="off"
        class="input-base"
        maxlength="7"
        placeholder="留空则移除名字牌子…"
      />
      <p class="mt-2 text-right text-xs tabular-nums text-ink-muted">
        {{ badgeDraft.length }}/7
      </p>
    </form>

    <template #footer>
      <div class="flex gap-2.5">
        <button
          type="button"
          class="btn-secondary flex-1"
          :disabled="badgeSubmitting"
          @click="badgeSheet = false"
        >
          取消
        </button>
        <button
          type="submit"
          form="badge-form"
          class="btn-primary flex-1"
          :disabled="badgeSubmitting"
        >
          {{ badgeSubmitting ? "提交中…" : "确认修改" }}
        </button>
      </div>
    </template>
  </AppDialog>

  <!-- 登录设备管理弹窗（AppDialog） -->
  <AppDialog
    v-model:open="devicesSheet"
    title="登录设备管理"
    description="管理已在此账号登录的所有设备"
    size="md"
  >
    <div v-if="devicesLoading && devices.length === 0" class="py-8 text-center text-xs text-ink-muted">
      加载中…
    </div>
    <div v-else-if="devices.length === 0" class="py-8 text-center text-xs text-ink-muted">
      暂无登录设备记录
    </div>
    <ul v-else role="list" class="divide-y divide-[var(--border-subtle)]">
      <li
        v-for="d in devices"
        :key="d.id"
        class="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
      >
        <div class="flex min-w-0 items-center gap-2.5">
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-canvas-soft text-ink-muted"
            aria-hidden="true"
          >
            <AppSvgIcon name="smartphone" :size="18" />
          </span>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="max-w-[140px] truncate font-mono text-xs font-medium text-ink sm:max-w-[200px]">
                {{ d.deviceId.length > 16 ? `${d.deviceId.slice(0, 8)}…${d.deviceId.slice(-6)}` : d.deviceId }}
              </span>
              <span v-if="d.isCurrentDevice" class="tag-pill-accent">
                当前设备
              </span>
              <span
                v-if="d.isMainDevice"
                class="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning"
              >
                主设备
              </span>
            </div>
            <p class="mt-0.5 text-xs tabular-nums text-ink-muted">
              活跃于 {{ d.lastLoginAt ? formatDateTime(d.lastLoginAt) : "未知" }}
            </p>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-1.5">
          <button
            v-if="!d.isMainDevice"
            type="button"
            class="rounded-lg border border-subtle px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-hover hover:text-ink pressable disabled:opacity-50"
            :disabled="deviceOperating === d.deviceId"
            @click="handleSetMainDevice(d)"
          >
            设为主设备
          </button>
          <button
            type="button"
            class="rounded-lg px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger-soft pressable disabled:opacity-50"
            :disabled="deviceOperating === d.deviceId"
            @click="handleRemoveDevice(d)"
          >
            {{ deviceOperating === d.deviceId ? "处理中…" : "解绑" }}
          </button>
        </div>
      </li>
    </ul>

    <template #footer>
      <button type="button" class="btn-secondary w-full" @click="devicesSheet = false">
        关闭
      </button>
    </template>
  </AppDialog>
</template>
