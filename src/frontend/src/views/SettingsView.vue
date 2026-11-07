<!--
  设置页

  账号设置：修改用户名（每月 4 次）/ 修改头像（前端压缩后上传 B2）/
            修改密码 / 退出登录 / 注销账号（走工单）。
  主题：两层 —— 全站默认由管理员设；每个人都可以在这里换成自己的（只存本地）。
        自己换过的人不会被"管理员改主题"带走；自定义 CSS 仍仅超管可见。
  提问箱设置：启用开关 + 仅粉丝可提问。
  关于：版本 / 开源协议 / 仓库链接。
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import { updateUsername, updateAvatar, updatePassword, updateBadge, getUserProfile, getUserDevices, deleteUserDevice, setMainDevice } from "../api/user";
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
import UserAvatar from "../components/user/UserAvatar.vue";

const router = useRouter();
const auth = useAuthStore();
const theme = useThemeStore();
const motion = useMotionStore();

// ============================================================
//  权限探测（超级管理员 = edit_database）
// ============================================================

const isSuperAdmin = ref(false);
const canSetBadge = ref(false);
const myBadge = ref<string>("");
/** 自己的名字颜色（默认头像的首字要用它染色，跟帖子页一致） */
const myNameColor = ref<string | null>(null);
/** 自己的头像地址（资料接口拿到的为准，会话里的 image 可能过期） */
const myAvatarUrl = ref<string | null>(null);

/** 重新观看首次使用引导（每次都从第一步开始，不影响其他设置） */
async function onRestartTour(): Promise<void> {
  try {
    restartTour(await buildTourSteps());
  } catch {
    // 拼装失败就不弹，别打扰用户
  }
}

onMounted(async () => {
  const mask = await getMyPermissions();
  isSuperAdmin.value = hasPermission(mask, PERM_EDIT_DATABASE);
  canSetBadge.value = hasPermission(mask, PERM_SET_NAME_BADGE);
  // 加载当前用户的 badge（用于名字牌子设置）
  if (auth.userId) {
    try {
      const profile = await getUserProfile(auth.userId);
      myBadge.value = profile.badge ?? "";
      // 头像预览要用跟别处一模一样的规则（首字占位要按自己的名字颜色染）
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
    // 本地立即同步会话用户名（界面即时生效，不依赖重新拉取会话）
    auth.setUsername(name);
    // 后端已同步 user.name，重新拉取会话以保持与服务端一致
    await auth.fetchSession();
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
//  修改名字牌子（0-7 字，无换行与控制字符）
// ============================================================

const badgeSheet = ref(false);
const badgeDraft = ref("");
const badgeSubmitting = ref(false);

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
    myBadge.value = badge; // 同步本地状态
    badgeSheet.value = false;
    await auth.fetchSession();
  } catch {
    // client.ts 已自动 Toast
  } finally {
    badgeSubmitting.value = false;
  }
}

// ============================================================
//  登录设备管理
// ============================================================

const devicesSheet = ref(false);
const devicesLoading = ref(false);
const devices = ref<UserDevice[]>([]);
const deviceOperating = ref<string | null>(null);

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
  if (!confirm(device.isCurrentDevice ? "确定要解绑当前设备吗？" : "确定要解绑/移除该设备吗？")) {
    return;
  }
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
//  退出登录
//
//  跟「我的」页那个按钮是同一套动作：清会话 → 清权限缓存（不然换个人登录
//  还会拿着上一个人的权限位）→ 回登录页。退出是可逆的，不弹确认框。
// ============================================================

const signingOut = ref(false);

async function handleSignOut(): Promise<void> {
  if (signingOut.value) return;
  signingOut.value = true;
  try {
    await auth.signOut();
    clearPermissionCache();
    showToast("已退出登录", "success");
    router.push("/login");
  } finally {
    signingOut.value = false;
  }
}

// ============================================================
//  主题（每台设备各自一份）
//
//  规则只有一条：**本地自定义优先于全站默认**。
//  所以这里改的永远是 theme.setLocalTheme / clearLocalTheme，
//  绝不碰站点配置 —— 碰了就是"改全站"，别人也变了。
// ============================================================

/** 当前生效的主题（给模板用；也是颜色框的初值） */
const activeTheme = computed(() => theme.theme);

/** 预设色块里的三个色点（从共享表取，别在这里再写一份颜色） */
function presetDots(preset: ThemePreset): string[] {
  return [
    PRESET_COLORS[preset].primaryColor,
    PRESET_COLORS[preset].accentColor,
    PRESET_COLORS[preset].backgroundColor,
  ];
}

/** 点预设 = 换一套（写本地，立即生效，刷新后还在） */
function pickPreset(preset: ThemePreset): void {
  theme.setPreset(preset);
}

/** 颜色框改一个值：其余颜色保持不变 */
function onColorInput(field: keyof Omit<SiteConfigTheme, "preset">, event: Event): void {
  theme.setColor(field, (event.target as HTMLInputElement).value);
}

/** "跟随全站"：把本地那份删掉，回到管理员设的默认 */
function followSite(): void {
  if (!theme.hasLocalTheme) return;
  theme.clearLocalTheme();
  showToast("已恢复跟随全站主题", "success");
}

/** 四条颜色变量的中文名（顺序与模板里的 as const 数组一致） */
const COLOR_LABELS: Record<keyof Omit<SiteConfigTheme, "preset">, string> = {
  primaryColor: "主色",
  backgroundColor: "背景",
  textColor: "文字",
  accentColor: "强调色",
};

const themeSaving = ref(false);

/**
 * 超管：把"现在这套"存成全站默认
 *
 * 它只影响**没自定义过的人** —— 存完自己看到的还是自己那份，
 * 这是设计如此（不然超管每次存完还得手动切一次）。Toast 里说清楚。
 */
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
  /** 这个站自己的仓库（原来写的是 https://github.com/ 首页，等于没填） */
  repo: "https://github.com/BearThomas/Rippling",
  repoLabel: "BearThomas/Rippling",
} as const;

/** 当前头像：资料接口优先，会话里的 image 兜底 */
const currentAvatar = computed(() => myAvatarUrl.value ?? auth.session?.user?.image ?? null);
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
          <UserAvatar
            v-else
            :src="currentAvatar"
            :name="auth.username ?? '?'"
            :name-color="myNameColor"
            size="md"
            alt="当前头像"
          />
        </span>
      </button>
      <input
        ref="avatarInput"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        class="hidden"
        @change="onAvatarPicked"
      />

      <!-- 名字牌子（set_name_badge 权限） -->
      <button
        v-if="canSetBadge"
        type="button"
        class="flex w-full items-center justify-between border-b border-line py-3 text-sm"
        @click="openBadgeSheet"
      >
        <span>名字牌子</span>
        <span class="text-ink-soft">
          {{ myBadge || "未设置" }}
        </span>
      </button>

      <!-- 登录设备管理 -->
      <button
        v-if="auth.isLoggedIn"
        type="button"
        class="flex w-full items-center justify-between border-b border-line py-3 text-sm"
        @click="openDevicesSheet"
      >
        <span>登录设备管理</span>
        <div class="flex items-center gap-1.5 text-ink-soft">
          <span v-if="devices.length > 0">{{ devices.length }} 台设备</span>
          <AppSvgIcon name="back" :size="16" class="rotate-180" />
        </div>
      </button>

      <!-- 退出登录（注销是走工单的不可逆操作，跟它分开摆，别手滑） -->
      <button
        v-if="auth.isLoggedIn"
        type="button"
        class="flex w-full items-center justify-between border-b border-line py-3 text-sm"
        :disabled="signingOut"
        @click="handleSignOut"
      >
        <span>{{ signingOut ? "退出中…" : "退出登录" }}</span>
        <AppSvgIcon name="logout" :size="16" class="text-ink-soft" />
      </button>

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

    <!-- ===================== 主题 ===================== -->
    <section class="card-base">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="font-semibold">主题</h3>
        <span
          class="rounded-full px-2 py-0.5 text-xs"
          :class="theme.hasLocalTheme ? 'bg-primary/10 text-primary' : 'bg-page text-ink-soft'"
        >
          {{ theme.hasLocalTheme ? "我自己的" : "跟随全站" }}
        </span>
      </div>

      <!-- 预设：每个按钮自带三个色点，选中的那套描边 -->
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="preset in PRESET_ORDER"
          :key="preset"
          type="button"
          class="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors pressable"
          :class="theme.hasLocalTheme && activeTheme.preset === preset
            ? 'border-primary'
            : 'border-line'"
          @click="pickPreset(preset)"
        >
          <span class="flex shrink-0 gap-1">
            <i
              v-for="(dot, i) in presetDots(preset)"
              :key="i"
              class="h-3.5 w-3.5 rounded-full ring-1 ring-black/5"
              :style="{ background: dot }"
            ></i>
          </span>
          <span class="flex-1 text-sm">{{ PRESET_LABELS[preset] }}</span>
          <AppSvgIcon
            v-if="theme.hasLocalTheme && activeTheme.preset === preset"
            name="check"
            :size="15"
            class="text-primary"
          />
        </button>
      </div>

      <!-- 颜色微调：所有人都能用，只改自己这份 -->
      <h4 class="mb-2 mt-4 text-sm font-medium">颜色</h4>
      <div class="space-y-2">
        <label
          v-for="field in (['primaryColor', 'backgroundColor', 'textColor', 'accentColor'] as const)"
          :key="field"
          class="flex items-center gap-3 text-sm"
        >
          <span class="flex-1">{{ COLOR_LABELS[field] }}</span>
          <span class="font-mono text-xs text-ink-soft">{{ activeTheme[field] }}</span>
          <input
            type="color"
            :value="activeTheme[field]"
            class="h-8 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-surface"
            @input="onColorInput(field, $event)"
          />
        </label>
      </div>
      <p class="mt-2 text-xs text-ink-soft">
        只存在这台设备上，别人看不到；管理员改全站主题时，你这套不会被改掉。
      </p>

      <!-- 减少动画：跟系统设置一个效果，给"系统里没设、但就想安静点"的人 -->
      <label class="mt-4 flex items-center justify-between border-t border-line pt-3 text-sm">
        <span>
          减少动画
          <span class="mt-0.5 block text-xs text-ink-soft">
            关掉过渡和呼吸效果（系统里开了"减少动态效果"时本来就会关）
          </span>
        </span>
        <input
          type="checkbox"
          class="h-5 w-5 shrink-0 accent-[var(--c-primary)]"
          :checked="motion.reduced"
          @change="motion.toggleReduced(($event.target as HTMLInputElement).checked)"
        />
      </label>

      <button
        v-if="theme.hasLocalTheme"
        type="button"
        class="btn-secondary mt-3 w-full"
        @click="followSite"
      >
        恢复跟随全站
      </button>

      <!-- 超管：把现在这套存成所有人的默认 -->
      <template v-if="isSuperAdmin">
        <button
          type="button"
          class="btn-primary mt-3 w-full"
          :disabled="themeSaving"
          @click="saveAsSiteDefault"
        >
          {{ themeSaving ? "保存中…" : "存为全站默认" }}
        </button>
        <p class="mt-2 text-xs text-ink-soft">
          只影响"跟随全站"的人；已经有自己主题的用户不会被改。
        </p>

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
          预览仅当前会话生效；全站持久化入口在管理面板。
        </p>
      </template>
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
        <p>{{ theme.siteName }} · 校园论坛</p>
        <p>版本：{{ ABOUT.version }}</p>
        <p>开源协议：{{ ABOUT.license }}</p>
        <a
          :href="ABOUT.repo"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-1 text-primary"
        >
          <AppSvgIcon name="link" :size="14" />
          GitHub · {{ ABOUT.repoLabel }}
        </a>
        <button
          type="button"
          class="flex items-center gap-1 text-primary pressable"
          @click="onRestartTour"
        >
          <AppSvgIcon name="sliders" :size="14" />
          重新观看使用引导
        </button>
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

  <!-- 修改名字牌子底部弹层 -->
  <div
    v-if="badgeSheet"
    class="fixed inset-0 z-50 flex items-end bg-black/40"
    @click.self="badgeSheet = false"
  >
    <div class="mx-auto w-full max-w-app rounded-t-2xl bg-surface p-4" style="padding-bottom: calc(1rem + env(safe-area-inset-bottom))">
      <h3 class="mb-1 font-semibold">名字牌子</h3>
      <p class="mb-3 text-xs text-ink-soft">
        最多 7 个字，不能包含换行或控制字符。
      </p>
      <input
        v-model="badgeDraft"
        type="text"
        class="input-base"
        maxlength="7"
        placeholder="留空则移除名字牌子"
      />
      <p class="mt-2 text-right text-xs text-ink-soft">
        {{ badgeDraft.length }}/7
      </p>
      <div class="mt-3 flex gap-3">
        <button
          type="button"
          class="btn-secondary flex-1"
          @click="badgeSheet = false"
        >
          取消
        </button>
        <button
          type="button"
          class="btn-primary flex-1"
          :disabled="badgeSubmitting"
          @click="submitBadge"
        >
          {{ badgeSubmitting ? "提交中…" : "确认修改" }}
        </button>
      </div>
    </div>
  </div>

  <!-- 登录设备管理底部弹层 -->
  <div
    v-if="devicesSheet"
    class="fixed inset-0 z-50 flex items-end bg-black/40"
    @click.self="devicesSheet = false"
  >
    <div
      class="mx-auto flex max-h-[85vh] w-full max-w-app flex-col rounded-t-2xl bg-surface p-4"
      style="padding-bottom: calc(1rem + env(safe-area-inset-bottom))"
    >
      <div class="flex items-center justify-between border-b border-line pb-3">
        <div>
          <h3 class="font-semibold">登录设备管理</h3>
          <p class="text-xs text-ink-soft">管理已在此账号登录的所有设备</p>
        </div>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft active:bg-page"
          aria-label="关闭"
          @click="devicesSheet = false"
        >
          <AppSvgIcon name="close" :size="18" />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto divide-y divide-line py-2">
        <div v-if="devicesLoading && devices.length === 0" class="py-8 text-center text-xs text-ink-soft">
          加载中…
        </div>
        <div v-else-if="devices.length === 0" class="py-8 text-center text-xs text-ink-soft">
          暂无登录设备记录
        </div>
        <div
          v-for="d in devices"
          :key="d.id"
          class="flex items-center justify-between gap-3 py-3"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-page text-ink-soft">
              <AppSvgIcon name="smartphone" :size="20" />
            </span>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-mono text-xs font-medium truncate max-w-[140px] sm:max-w-[200px]">
                  {{ d.deviceId.length > 16 ? d.deviceId.slice(0, 8) + '…' + d.deviceId.slice(-6) : d.deviceId }}
                </span>
                <span
                  v-if="d.isCurrentDevice"
                  class="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                >
                  当前设备
                </span>
                <span
                  v-if="d.isMainDevice"
                  class="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
                >
                  主设备
                </span>
              </div>
              <p class="mt-0.5 text-[11px] text-ink-soft">
                活跃于 {{ d.lastLoginAt ? formatDateTime(d.lastLoginAt) : "未知" }}
              </p>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="flex items-center gap-2 shrink-0">
            <button
              v-if="!d.isMainDevice"
              type="button"
              class="rounded-md border border-line px-2 py-1 text-xs text-ink-soft transition-colors active:bg-page"
              :disabled="deviceOperating === d.deviceId"
              @click="handleSetMainDevice(d)"
            >
              设为主设备
            </button>
            <button
              type="button"
              class="rounded-md px-2 py-1 text-xs text-red-500 transition-colors active:bg-red-50 dark:active:bg-red-950/30"
              :disabled="deviceOperating === d.deviceId"
              @click="handleRemoveDevice(d)"
            >
              {{ deviceOperating === d.deviceId ? "处理中…" : "解绑" }}
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        class="btn-secondary mt-2 w-full"
        @click="devicesSheet = false"
      >
        关闭
      </button>
    </div>
  </div>
</template>
