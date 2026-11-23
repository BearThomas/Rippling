<!--
  管理面板 — 用户管理子面板（Elk 紧凑分割行 + AppDialog 弹窗 + ConfirmDialog 确认）
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef } from "vue";
import FeedSkeleton from "../common/FeedSkeleton.vue";
import EmptyState from "../common/EmptyState.vue";
import ErrorState from "../common/ErrorState.vue";
import AppDialog from "../common/AppDialog.vue";
import AppSvgIcon from "../layout/AppSvgIcon.vue";
import { useConfirm } from "../../composables/useConfirm";
import {
  listUsersForAdmin,
  getAdminUser,
  setUserPermissions,
  banUser,
  unbanUser,
  resetUserViolations,
} from "../../api/admin";
import { showToast } from "../../utils/toast";
import type { AdminUserInfo } from "../../types";

const props = defineProps<{ canManage: boolean }>();

const { confirm } = useConfirm();

const PAGE_SIZE = 20;
const BANNED_MASK = "1";

const searchInput = shallowRef("");
const loading = shallowRef(true);
const loadingMore = shallowRef(false);
const error = shallowRef(false);
const users = ref<AdminUserInfo[]>([]);
const hasMore = shallowRef(true);
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** 用户详情弹窗 */
const detailOpen = shallowRef(false);
const detailUser = ref<AdminUserInfo | null>(null);
const detailLoading = shallowRef(false);

/** 权限编辑弹窗 */
const permOpen = shallowRef(false);
const permUser = ref<AdminUserInfo | null>(null);
const permInput = shallowRef("");
const permSaving = shallowRef(false);

function statusOf(user: AdminUserInfo): { label: string; cls: string } {
  if (user.isDeactivated) {
    return { label: "已注销", cls: "bg-hover text-ink-muted" };
  }
  if (user.permissions === BANNED_MASK) {
    return { label: "已封禁", cls: "bg-danger-soft text-danger" };
  }
  return { label: "正常", cls: "bg-accent-soft text-primary" };
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    users.value = await listUsersForAdmin({
      search: searchInput.value.trim() || undefined,
      limit: PAGE_SIZE,
      offset: 0,
    });
    hasMore.value = users.value.length === PAGE_SIZE;
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

async function loadMore(): Promise<void> {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    const page = await listUsersForAdmin({
      search: searchInput.value.trim() || undefined,
      limit: PAGE_SIZE,
      offset: users.value.length,
    });
    users.value.push(...page);
    hasMore.value = page.length === PAGE_SIZE;
  } catch {
    // client.ts 已自动 Toast
  } finally {
    loadingMore.value = false;
  }
}

function onSearchInput(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void load();
  }, 300);
}

async function openDetail(user: AdminUserInfo): Promise<void> {
  detailUser.value = user;
  detailOpen.value = true;
  detailLoading.value = true;
  try {
    detailUser.value = await getAdminUser(user.id);
  } catch {
    // 拉取失败沿用列表数据
  } finally {
    detailLoading.value = false;
  }
}

function openPermEditor(user: AdminUserInfo): void {
  permUser.value = user;
  permInput.value = user.permissions;
  permOpen.value = true;
}

async function submitPermissions(): Promise<void> {
  if (!permUser.value || permSaving.value) return;
  const raw = permInput.value.trim();
  if (!/^\d+$/.test(raw)) {
    showToast("权限掩码须为非负十进制整数", "error");
    return;
  }
  permSaving.value = true;
  try {
    await setUserPermissions(permUser.value.id, BigInt(raw).toString());
    showToast("权限已更新", "success");
    permOpen.value = false;
    permUser.value = null;
    void load();
  } catch {
    // client.ts 已自动 Toast
  } finally {
    permSaving.value = false;
  }
}

async function executeAction(
  user: AdminUserInfo,
  action: "ban" | "unban" | "reset"
): Promise<void> {
  const modalConfig = {
    ban: {
      title: `封禁用户「${user.username}」？`,
      description: "封禁后该用户仅保留基础浏览权限，发帖与互动将受限。",
      confirmText: "确认封禁",
      variant: "danger" as const,
    },
    unban: {
      title: `解封用户「${user.username}」？`,
      description: "解封后将恢复为注册用户默认权限。",
      confirmText: "确认解封",
      variant: "default" as const,
    },
    reset: {
      title: `重置「${user.username}」的违规次数？`,
      description: "违规计数将归零，操作会记入公开管理日志。",
      confirmText: "确认重置",
      variant: "default" as const,
    },
  }[action];

  const ok = await confirm(modalConfig);
  if (!ok) return;

  try {
    if (action === "ban") await banUser(user.id);
    else if (action === "unban") await unbanUser(user.id);
    else await resetUserViolations(user.id);
    showToast("操作成功", "success");
    void load();
  } catch {
    // client.ts 已自动 Toast
  }
}

onMounted(() => {
  void load();
});
onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
});
</script>

<template>
  <div>
    <!-- 搜索框 -->
    <div class="border-b border-subtle px-4 py-3 sm:px-5">
      <label for="admin-user-search" class="sr-only">搜索用户</label>
      <div class="relative">
        <AppSvgIcon
          name="search"
          :size="15"
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
        />
        <input
          id="admin-user-search"
          v-model="searchInput"
          type="search"
          autocomplete="off"
          spellcheck="false"
          class="input-base pl-9"
          placeholder="按用户名或学号搜索…"
          @input="onSearchInput"
        />
      </div>
    </div>

    <FeedSkeleton v-if="loading" variant="elk" :count="5" />
    <div v-else-if="error" class="px-4 py-6">
      <ErrorState @retry="load" />
    </div>

    <template v-else-if="users.length > 0">
      <ul role="list">
        <li
          v-for="user in users"
          :key="user.id"
          class="border-b border-subtle px-4 py-3.5 sm:px-5"
        >
          <div class="flex items-center gap-2">
            <span
              class="min-w-0 truncate text-sm font-semibold text-ink"
              :style="user.nameColor ? { color: user.nameColor } : undefined"
            >
              {{ user.username }}
            </span>
            <span
              class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
              :class="statusOf(user).cls"
            >
              {{ statusOf(user).label }}
            </span>
            <span class="ml-auto shrink-0 text-xs tabular-nums text-ink-muted">
              违规 {{ user.violationCount }} 次
            </span>
          </div>

          <div class="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-muted">
            <span class="tabular-nums">学号：{{ user.studentId ?? "未绑定" }}</span>
            <span class="font-mono break-all">权限：{{ user.permissions }}</span>
          </div>

          <!-- 轻量描边操作行 -->
          <div class="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              class="btn-secondary !px-3 !py-1 text-xs"
              @click="openDetail(user)"
            >
              详情
            </button>
            <template v-if="props.canManage">
              <button
                type="button"
                class="btn-secondary !px-3 !py-1 text-xs"
                @click="openPermEditor(user)"
              >
                权限
              </button>
              <button
                v-if="user.permissions === BANNED_MASK"
                type="button"
                class="btn-secondary !px-3 !py-1 text-xs"
                @click="executeAction(user, 'unban')"
              >
                解封
              </button>
              <button
                v-else
                type="button"
                class="rounded-lg border border-subtle bg-surface px-3 py-1 text-xs font-medium text-danger hover:bg-danger-soft pressable"
                @click="executeAction(user, 'ban')"
              >
                封禁
              </button>
              <button
                type="button"
                class="btn-secondary !px-3 !py-1 text-xs"
                @click="executeAction(user, 'reset')"
              >
                重置违规
              </button>
            </template>
          </div>
        </li>
      </ul>

      <div v-if="hasMore" class="px-4 py-4 text-center">
        <button
          type="button"
          class="btn-secondary !py-1.5 text-xs"
          :disabled="loadingMore"
          @click="loadMore"
        >
          {{ loadingMore ? "加载中…" : "加载更多" }}
        </button>
      </div>
    </template>

    <div v-else class="px-4 py-6">
      <EmptyState text="没有匹配的用户" icon="user" />
    </div>

    <!-- 用户详情弹窗（AppDialog） -->
    <AppDialog
      v-model:open="detailOpen"
      title="用户详情"
      :description="detailUser ? detailUser.username : ''"
      size="sm"
    >
      <div v-if="detailLoading" class="py-6 text-center text-xs text-ink-muted">
        加载中…
      </div>
      <dl v-else-if="detailUser" class="divide-y divide-[var(--border-subtle)] text-sm">
        <div class="flex justify-between gap-3 py-2.5 first:pt-0">
          <dt class="shrink-0 text-ink-muted">用户名</dt>
          <dd
            class="min-w-0 break-all text-right font-medium text-ink"
            :style="detailUser.nameColor ? { color: detailUser.nameColor } : undefined"
          >
            {{ detailUser.username }}
          </dd>
        </div>
        <div class="flex justify-between gap-3 py-2.5">
          <dt class="shrink-0 text-ink-muted">学号</dt>
          <dd class="tabular-nums text-ink">{{ detailUser.studentId ?? "未绑定" }}</dd>
        </div>
        <div class="flex justify-between gap-3 py-2.5">
          <dt class="shrink-0 text-ink-muted">状态</dt>
          <dd>
            <span
              class="rounded-full px-2 py-0.5 text-xs font-medium"
              :class="statusOf(detailUser).cls"
            >
              {{ statusOf(detailUser).label }}
            </span>
          </dd>
        </div>
        <div class="flex justify-between gap-3 py-2.5">
          <dt class="shrink-0 text-ink-muted">违规次数</dt>
          <dd class="tabular-nums text-ink">{{ detailUser.violationCount }}</dd>
        </div>
        <div class="flex justify-between gap-3 py-2.5">
          <dt class="shrink-0 text-ink-muted">牌子</dt>
          <dd class="text-ink">{{ detailUser.badge ?? "无" }}</dd>
        </div>
        <div class="flex justify-between gap-3 py-2.5">
          <dt class="shrink-0 text-ink-muted">注册时间</dt>
          <dd class="tabular-nums text-ink">{{ detailUser.createdAt.slice(0, 10) }}</dd>
        </div>
        <div class="flex justify-between gap-3 py-2.5 last:pb-0">
          <dt class="shrink-0 text-ink-muted">权限掩码</dt>
          <dd class="min-w-0 break-all text-right font-mono text-xs text-ink">
            {{ detailUser.permissions }}
          </dd>
        </div>
      </dl>

      <template #footer>
        <button type="button" class="btn-secondary w-full" @click="detailOpen = false">
          关闭
        </button>
      </template>
    </AppDialog>

    <!-- 权限编辑弹窗（AppDialog） -->
    <AppDialog
      v-model:open="permOpen"
      :title="permUser ? `修改权限 · ${permUser.username}` : '修改权限'"
      description="输入十进制权限掩码（后端以 BigInt 校验保存）"
      size="sm"
      :dismissible="!permSaving"
    >
      <form id="admin-perm-form" @submit.prevent="submitPermissions">
        <label for="admin-perm-input" class="sr-only">十进制权限掩码</label>
        <input
          id="admin-perm-input"
          v-model="permInput"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          spellcheck="false"
          class="input-base font-mono"
          placeholder="例如 274877906943…"
        />
      </form>

      <template #footer>
        <div class="flex gap-2.5">
          <button
            type="button"
            class="btn-secondary flex-1"
            :disabled="permSaving"
            @click="permOpen = false"
          >
            取消
          </button>
          <button
            type="submit"
            form="admin-perm-form"
            class="btn-primary flex-1"
            :disabled="permSaving"
          >
            {{ permSaving ? "保存中…" : "保存" }}
          </button>
        </div>
      </template>
    </AppDialog>
  </div>
</template>
