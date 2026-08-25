<!--
  管理面板 — 用户管理子面板

  - 搜索框（300ms 防抖）按用户名 / 学号模糊搜索
  - 用户列表：用户名、学号、权限掩码（十进制）、违规次数、状态（正常/封禁/注销）
  - 操作（edit_others_permission 权限）：查看详情弹窗、修改权限弹窗、
    封禁 / 解封、重置违规次数
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import LoadingSpinner from "../common/LoadingSpinner.vue";
import EmptyState from "../common/EmptyState.vue";
import ErrorState from "../common/ErrorState.vue";
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

/** 是否具备 edit_others_permission（写操作入口显隐） */
const props = defineProps<{ canManage: boolean }>();

/** 每页条数 */
const PAGE_SIZE = 20;
/** 封禁态掩码：仅保留 view_site（位0），十进制为 "1" */
const BANNED_MASK = "1";

const searchInput = ref("");
const loading = ref(true);
const loadingMore = ref(false);
const error = ref(false);
const users = ref<AdminUserInfo[]>([]);
const hasMore = ref(true);
/** 搜索防抖定时器 */
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** 用户详情弹窗 */
const detailUser = ref<AdminUserInfo | null>(null);
const detailLoading = ref(false);

/** 权限编辑弹窗 */
const permUser = ref<AdminUserInfo | null>(null);
const permInput = ref("");
const permSaving = ref(false);

/** 用户状态标签：注销 > 封禁 > 正常 */
function statusOf(user: AdminUserInfo): { label: string; tone: "danger" | "soft" | "ok" } {
  if (user.isDeactivated) return { label: "已注销", tone: "soft" };
  if (user.permissions === BANNED_MASK) return { label: "已封禁", tone: "danger" };
  return { label: "正常", tone: "ok" };
}

const statusClass = computed(() => ({
  danger: "text-red-500",
  soft: "text-ink-soft",
  ok: "text-accent",
}));

/** 加载第一页 */
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

/** 加载更多 */
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
    // Toast 由 client 层统一处理
  } finally {
    loadingMore.value = false;
  }
}

/** 搜索输入防抖（300ms） */
function onSearchInput(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    load();
  }, 300);
}

/** 打开用户详情弹窗（拉最新数据） */
async function openDetail(user: AdminUserInfo): Promise<void> {
  detailLoading.value = true;
  detailUser.value = user;
  try {
    detailUser.value = await getAdminUser(user.id);
  } catch {
    // 拉取失败时沿用列表数据
  } finally {
    detailLoading.value = false;
  }
}

/** 打开权限编辑弹窗（预填当前掩码） */
function openPermEditor(user: AdminUserInfo): void {
  permUser.value = user;
  permInput.value = user.permissions;
}

/** 提交权限修改：数字输入 → BigInt → 十进制字符串 */
async function submitPermissions(): Promise<void> {
  if (!permUser.value || permSaving.value) return;
  const raw = permInput.value.trim();
  if (!/^\d+$/.test(raw)) {
    showToast("权限掩码须为非负十进制整数", "error");
    return;
  }
  permSaving.value = true;
  try {
    // BigInt 转换避免超出 Number 安全范围
    await setUserPermissions(permUser.value.id, BigInt(raw).toString());
    showToast("权限已更新", "success");
    permUser.value = null;
    load();
  } catch {
    // Toast 由 client 层统一处理
  } finally {
    permSaving.value = false;
  }
}

/** 封禁 / 解封 / 重置违规（二次确认防误触） */
async function executeAction(
  user: AdminUserInfo,
  action: "ban" | "unban" | "reset"
): Promise<void> {
  const confirmText = {
    ban: `确认封禁用户「${user.username}」？封禁后仅保留浏览权限`,
    unban: `确认解封用户「${user.username}」？将恢复注册用户默认权限`,
    reset: `确认重置用户「${user.username}」的违规次数？`,
  }[action];
  if (!window.confirm(confirmText)) return;

  try {
    if (action === "ban") await banUser(user.id);
    else if (action === "unban") await unbanUser(user.id);
    else await resetUserViolations(user.id);
    showToast("操作成功", "success");
    load();
  } catch {
    // Toast 由 client 层统一处理
  }
}

onMounted(load);
onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
});
</script>

<template>
  <div>
    <!-- 搜索框 -->
    <input
      v-model="searchInput"
      type="search"
      class="input-base mb-3 w-full"
      placeholder="按用户名或学号搜索"
      @input="onSearchInput"
    />

    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" @retry="load" />

    <template v-else-if="users.length > 0">
      <div class="space-y-3">
        <div v-for="user in users" :key="user.id" class="card-base">
          <div class="flex items-center gap-2">
            <p class="truncate text-sm font-semibold" :style="user.nameColor ? { color: user.nameColor } : {}">
              {{ user.username }}
            </p>
            <span
              class="rounded px-1.5 py-0.5 text-[10px]"
              :class="statusClass[statusOf(user).tone]"
            >
              {{ statusOf(user).label }}
            </span>
            <span class="ml-auto text-xs text-ink-soft">违规 {{ user.violationCount }} 次</span>
          </div>
          <div class="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-soft">
            <span>学号：{{ user.studentId ?? "未绑定" }}</span>
            <span class="break-all">权限：{{ user.permissions }}</span>
          </div>

          <!-- 操作按钮组 -->
          <div class="mt-2 flex flex-wrap gap-2 text-xs">
            <button type="button" class="btn-secondary !px-3 !py-1" @click="openDetail(user)">
              详情
            </button>
            <template v-if="props.canManage">
              <button type="button" class="btn-secondary !px-3 !py-1" @click="openPermEditor(user)">
                权限
              </button>
              <button
                v-if="user.permissions === BANNED_MASK"
                type="button"
                class="btn-secondary !px-3 !py-1"
                @click="executeAction(user, 'unban')"
              >
                解封
              </button>
              <button
                v-else
                type="button"
                class="btn-secondary !px-3 !py-1 text-red-500"
                @click="executeAction(user, 'ban')"
              >
                封禁
              </button>
              <button type="button" class="btn-secondary !px-3 !py-1" @click="executeAction(user, 'reset')">
                重置违规
              </button>
            </template>
          </div>
        </div>
      </div>

      <button
        v-if="hasMore"
        type="button"
        class="btn-secondary mt-3 w-full"
        :disabled="loadingMore"
        @click="loadMore"
      >
        {{ loadingMore ? "加载中…" : "加载更多" }}
      </button>
    </template>

    <EmptyState v-else text="没有匹配的用户" icon="user" />

    <!-- 用户详情弹窗 -->
    <div v-if="detailUser" class="fixed inset-0 z-50 flex items-end bg-black/40" @click.self="detailUser = null">
      <div class="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-4">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-base font-semibold">用户详情</h3>
          <button type="button" class="text-sm text-ink-soft" @click="detailUser = null">关闭</button>
        </div>
        <LoadingSpinner v-if="detailLoading" />
        <div v-else class="space-y-2 text-sm">
          <div class="flex justify-between gap-3">
            <span class="shrink-0 text-ink-soft">用户名</span>
            <span class="break-all" :style="detailUser.nameColor ? { color: detailUser.nameColor } : {}">
              {{ detailUser.username }}
            </span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="shrink-0 text-ink-soft">学号</span>
            <span>{{ detailUser.studentId ?? "未绑定" }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="shrink-0 text-ink-soft">状态</span>
            <span :class="statusClass[statusOf(detailUser).tone]">{{ statusOf(detailUser).label }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="shrink-0 text-ink-soft">违规次数</span>
            <span>{{ detailUser.violationCount }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="shrink-0 text-ink-soft">牌子</span>
            <span>{{ detailUser.badge ?? "无" }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="shrink-0 text-ink-soft">注册时间</span>
            <span>{{ detailUser.createdAt.slice(0, 10) }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="shrink-0 text-ink-soft">权限掩码</span>
            <span class="break-all">{{ detailUser.permissions }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 权限编辑弹窗 -->
    <div v-if="permUser" class="fixed inset-0 z-50 flex items-end bg-black/40" @click.self="permUser = null">
      <div class="w-full rounded-t-2xl bg-surface p-4">
        <h3 class="text-base font-semibold">修改权限 · {{ permUser.username }}</h3>
        <p class="mt-1 text-xs text-ink-soft">输入十进制权限掩码（将转为 BigInt 提交）</p>
        <input
          v-model="permInput"
          type="text"
          inputmode="numeric"
          class="input-base mt-3 w-full"
          placeholder="如 70368744177665"
        />
        <div class="mt-3 flex gap-2">
          <button type="button" class="btn-secondary flex-1" @click="permUser = null">取消</button>
          <button
            type="button"
            class="btn-primary flex-1"
            :disabled="permSaving"
            @click="submitPermissions"
          >
            {{ permSaving ? "保存中…" : "保存" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
