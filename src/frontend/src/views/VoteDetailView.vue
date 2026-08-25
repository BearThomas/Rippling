<!--
  投票详情页（/vote/:id）

  功能：
    - 标题 / 描述 / 截止倒计时 / 选项列表
    - 票数可见性由后端 resultsVisible 决定（实时可见 / 已关闭 / 已截止）；
      不可见时选项只显示内容，不显示票数
    - 投票操作：单选或多选（isMultiple），已投过显示我的选择（myVote）
    - 创建者本人或管理员（create_vote 权限）可关闭投票
    - 进度条 + 倒计时
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import ErrorState from "../components/common/ErrorState.vue";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import { getVoteDetail, castVote, closeVote } from "../api/vote";
import { formatCountdown, formatDateTime, formatNumber } from "../utils/format";
import { showToast } from "../utils/toast";
import { useAuthStore } from "../stores/auth";
import { getMyPermissions } from "../utils/myPermissions";
import { hasPermission, PERM_CREATE_VOTE } from "../utils/permission";
import type { VoteInfo } from "../types";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

/** 投票 ID */
const voteId = route.params.id as string;

// ------------------------------------------------------------
//  数据状态
// ------------------------------------------------------------

const loading = ref(true);
const error = ref(false);
const vote = ref<VoteInfo | null>(null);

/** 响应式当前时间（每 30 秒刷新倒计时） */
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

/** 选择状态（未投过时可操作） */
const selectedIds = ref<Set<string>>(new Set());
const casting = ref(false);
const closing = ref(false);

/** 权限掩码（判断管理员关闭权限） */
const myPermissions = ref<string>("0");

/** 是否已超时（本地时间判定） */
const expired = computed(
  () => !!vote.value && new Date(vote.value.endAt).getTime() <= now.value
);

/** 是否已结束（关闭或超时） */
const ended = computed(() => !!vote.value && (vote.value.isClosed || expired.value));

/** 是否已投过票 */
const hasVoted = computed(() => (vote.value?.myVote?.length ?? 0) > 0);

/** 结果是否展示（后端可见性 + 已投过票时也展示自己的结果视图） */
const showResult = computed(
  () => !!vote.value && (vote.value.resultsVisible || hasVoted.value)
);

/** 是否还能投票 */
const canCast = computed(() => !ended.value && !hasVoted.value);

/** 关闭按钮可见：未结束 且（创建者本人 或 持有 create_vote 权限的管理员） */
const canClose = computed(
  () =>
    !!vote.value &&
    !ended.value &&
    (vote.value.createdBy === auth.userId ||
      hasPermission(myPermissions.value, PERM_CREATE_VOTE))
);

/** 总票数（结果可见时） */
const totalVotes = computed(() =>
  (vote.value?.options ?? []).reduce((sum, o) => sum + (o.voteCount ?? 0), 0)
);

/** 我的选择集合（高亮用） */
const myVoteSet = computed(() => new Set(vote.value?.myVote ?? []));

// ------------------------------------------------------------
//  加载
// ------------------------------------------------------------

/** 加载详情 */
async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    vote.value = await getVoteDetail(voteId);
    myPermissions.value = await getMyPermissions();
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

// ------------------------------------------------------------
//  交互
// ------------------------------------------------------------

/** 未登录引导 */
function requireLogin(): boolean {
  if (auth.isLoggedIn) return true;
  router.push({ path: "/login", query: { redirect: route.fullPath } });
  return false;
}

/** 切换选项选中（单选投票时互斥） */
function toggleOption(optionId: string): void {
  if (!vote.value || !canCast.value || casting.value) return;
  const next = new Set(selectedIds.value);
  if (next.has(optionId)) {
    next.delete(optionId);
  } else {
    if (!vote.value.isMultiple) next.clear();
    next.add(optionId);
  }
  selectedIds.value = next;
}

/** 提交投票 */
async function submitVote(): Promise<void> {
  if (!requireLogin() || selectedIds.value.size === 0 || casting.value) return;
  casting.value = true;
  try {
    await castVote(voteId, [...selectedIds.value]);
    showToast("投票成功", "success");
    // cast 接口无返回，重新拉详情获取票数与我的投票
    vote.value = await getVoteDetail(voteId);
    selectedIds.value = new Set();
  } catch {
    // client.ts 已自动 Toast
  } finally {
    casting.value = false;
  }
}

/** 关闭投票（二次确认） */
async function onClose(): Promise<void> {
  if (!window.confirm("确定提前关闭投票吗？关闭后无法再投票。")) return;
  if (closing.value) return;
  closing.value = true;
  try {
    await closeVote(voteId);
    showToast("投票已关闭", "success");
    vote.value = await getVoteDetail(voteId);
  } catch {
    // client.ts 已自动 Toast
  } finally {
    closing.value = false;
  }
}

/** 选项百分比（结果可见时） */
function percentOf(voteCount: number | null): number {
  const total = totalVotes.value;
  if (!total || voteCount === null) return 0;
  return (voteCount / total) * 100;
}

onMounted(() => {
  void load();
  timer = setInterval(() => {
    now.value = Date.now();
  }, 30_000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="px-3 pt-3">
    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" message="投票不存在或无权访问" @retry="load" />

    <template v-else-if="vote">
      <article class="card-base">
        <!-- 状态行：倒计时 / 已结束 -->
        <div class="mb-2 flex items-center gap-2 text-xs">
          <span class="flex items-center gap-1 font-medium text-primary">
            <AppSvgIcon name="chart" :size="14" />
            投票
            <template v-if="vote.isMultiple"> · 多选</template>
          </span>
          <span
            class="ml-auto rounded px-1.5 py-0.5 text-[10px]"
            :class="ended ? 'bg-line text-ink-soft' : 'text-accent'"
            :style="!ended ? { background: 'color-mix(in srgb, var(--c-accent) 12%, transparent)' } : {}"
          >
            {{ ended ? "已结束" : formatCountdown(vote.endAt, now) }}
          </span>
        </div>

        <!-- 标题与描述 -->
        <h1 class="mb-1 text-lg font-bold">{{ vote.title }}</h1>
        <p v-if="vote.description" class="mb-2 text-sm text-ink-soft">{{ vote.description }}</p>
        <p class="text-xs text-ink-soft">
          截止时间：{{ formatDateTime(vote.endAt) }}
          <template v-if="showResult && totalVotes > 0">
            · 共 {{ formatNumber(totalVotes) }} 票
          </template>
        </p>

        <!-- 选项列表 -->
        <div class="mt-3 space-y-2">
          <div
            v-for="option in vote.options"
            :key="option.id"
            class="relative overflow-hidden rounded-lg border px-3 py-2.5 text-sm transition-colors"
            :class="[
              selectedIds.has(option.id) || myVoteSet.has(option.id)
                ? 'border-primary text-primary'
                : 'border-line text-ink',
              canCast ? 'cursor-pointer active:opacity-80' : 'cursor-default',
            ]"
            @click="toggleOption(option.id)"
          >
            <!-- 结果进度条背景（结果可见时） -->
            <span
              v-if="showResult"
              class="absolute inset-y-0 left-0 bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)]"
              :style="{ width: percentOf(option.voteCount) + '%' }"
            />
            <span class="relative flex items-center justify-between gap-2">
              <span class="flex items-center gap-1.5">
                {{ option.content }}
                <!-- 我的选择标记 -->
                <AppSvgIcon
                  v-if="myVoteSet.has(option.id)"
                  name="check"
                  :size="14"
                  class="shrink-0 text-primary"
                />
              </span>
              <span v-if="showResult" class="shrink-0 text-xs text-ink-soft">
                {{ option.voteCount ?? 0 }} 票 · {{ percentOf(option.voteCount).toFixed(1) }}%
              </span>
              <AppSvgIcon
                v-else-if="selectedIds.has(option.id)"
                name="check"
                :size="16"
                class="shrink-0 text-primary"
              />
            </span>
          </div>
        </div>

        <!-- 投票 / 状态提示 -->
        <div class="mt-3">
          <template v-if="canCast">
            <div class="flex items-center justify-between">
              <span class="text-xs text-ink-soft">
                已选 {{ selectedIds.size }} 项{{ vote.isMultiple ? "（可多选）" : "" }}
              </span>
              <button
                type="button"
                class="btn-primary !py-1.5 text-sm disabled:opacity-50"
                :disabled="selectedIds.size === 0 || casting"
                @click="submitVote"
              >
                {{ casting ? "提交中…" : "投票" }}
              </button>
            </div>
          </template>
          <p v-else-if="hasVoted" class="text-xs text-ink-soft">你已参与过该投票。</p>
          <p v-else-if="ended" class="text-xs text-ink-soft">该投票已结束。</p>
        </div>

        <!-- 管理操作：关闭投票 -->
        <div v-if="canClose" class="mt-3 border-t border-line pt-3">
          <button
            type="button"
            class="btn-secondary w-full !py-1.5 text-sm text-red-500"
            :disabled="closing"
            @click="onClose"
          >
            {{ closing ? "关闭中…" : "关闭投票" }}
          </button>
        </div>
      </article>
    </template>
  </div>
</template>
