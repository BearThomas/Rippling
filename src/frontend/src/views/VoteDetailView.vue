<!--
  投票详情页（Elk 详情阅读流 + ConfirmDialog 提前关闭确认）
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import ErrorState from "../components/common/ErrorState.vue";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import { getVoteDetail, castVote, closeVote } from "../api/vote";
import { formatCountdown, formatDateTime, formatNumber } from "../utils/format";
import { showToast } from "../utils/toast";
import { confirmAction } from "../composables/useConfirm";
import { useAuthStore } from "../stores/auth";
import { getMyPermissions } from "../utils/myPermissions";
import { hasPermission, PERM_CREATE_VOTE } from "../utils/permission";
import type { VoteInfo } from "../types";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const voteId = route.params.id as string;

const loading = shallowRef(true);
const error = shallowRef(false);
const vote = ref<VoteInfo | null>(null);

const now = shallowRef(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

const selectedIds = ref<Set<string>>(new Set());
const casting = shallowRef(false);
const closing = shallowRef(false);
const myPermissions = shallowRef<string>("0");

const expired = computed(
  () => Boolean(vote.value) && new Date(vote.value!.endAt).getTime() <= now.value
);
const ended = computed(() => Boolean(vote.value) && (vote.value!.isClosed || expired.value));
const hasVoted = computed(() => (vote.value?.myVote?.length ?? 0) > 0);
const showResult = computed(
  () => Boolean(vote.value) && (vote.value!.resultsVisible || hasVoted.value)
);
const canCast = computed(() => !ended.value && !hasVoted.value);

const canClose = computed(
  () =>
    Boolean(vote.value) &&
    !ended.value &&
    (vote.value!.createdBy === auth.userId ||
      hasPermission(myPermissions.value, PERM_CREATE_VOTE))
);

const totalVotes = computed(() =>
  (vote.value?.options ?? []).reduce((sum, o) => sum + (o.voteCount ?? 0), 0)
);
const myVoteSet = computed(() => new Set(vote.value?.myVote ?? []));

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

function requireLogin(): boolean {
  if (auth.isLoggedIn) return true;
  void router.push({ path: "/login", query: { redirect: route.fullPath } });
  return false;
}

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

async function submitVote(): Promise<void> {
  if (!requireLogin() || selectedIds.value.size === 0 || casting.value) return;
  casting.value = true;
  try {
    await castVote(voteId, [...selectedIds.value]);
    showToast("投票成功", "success");
    vote.value = await getVoteDetail(voteId);
    selectedIds.value = new Set();
  } catch {
    // client.ts 已自动 Toast
  } finally {
    casting.value = false;
  }
}

async function onClose(): Promise<void> {
  if (closing.value) return;
  const confirmed = await confirmAction({
    title: "确定提前关闭投票吗？",
    description: "关闭后将无法继续投票，结果将立即定格。",
    confirmText: "关闭投票",
    variant: "danger",
  });
  if (!confirmed) return;

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
  <div class="pb-8">
    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" message="投票不存在或无权访问" @retry="load" />

    <article v-else-if="vote" class="px-4 py-4 sm:px-6">
      <!-- 状态行 -->
      <div class="flex items-center gap-2">
        <span class="tag-pill-accent">
          <AppSvgIcon name="chart" :size="12" />
          投票{{ vote.isMultiple ? " · 多选" : " · 单选" }}
        </span>
        <span
          class="ml-auto tabular-nums"
          :class="ended ? 'tag-pill' : 'tag-pill-accent'"
        >
          {{ ended ? "已结束" : formatCountdown(vote.endAt, now) }}
        </span>
      </div>

      <!-- 主标题与描述 -->
      <h1 class="mt-3 text-[20px] font-bold leading-[30px] tracking-tight text-ink sm:text-[22px]">
        {{ vote.title }}
      </h1>
      <p v-if="vote.description" class="mt-1.5 text-[15px] leading-relaxed text-ink-secondary">
        {{ vote.description }}
      </p>
      <p class="mt-2 text-xs tabular-nums text-ink-muted">
        截止时间：{{ formatDateTime(vote.endAt) }}
        <template v-if="showResult && totalVotes > 0">
          · 共 {{ formatNumber(totalVotes) }} 票
        </template>
      </p>

      <!-- 选项列表 -->
      <div class="mt-5 space-y-2.5">
        <button
          v-for="option in vote.options"
          :key="option.id"
          type="button"
          class="relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-xl border px-4 py-3 text-left text-sm transition-colors"
          :class="[
            selectedIds.has(option.id) || myVoteSet.has(option.id)
              ? 'border-primary bg-accent-soft text-primary'
              : 'border-subtle bg-canvas-soft text-ink hover:border-strong',
            canCast ? 'cursor-pointer' : 'cursor-default',
          ]"
          @click="toggleOption(option.id)"
        >
          <span
            v-if="showResult"
            class="pointer-events-none absolute inset-y-0 left-0 bg-accent-soft"
            :style="{ width: percentOf(option.voteCount) + '%' }"
          />
          <span class="relative flex min-w-0 flex-1 items-center gap-1.5 font-medium">
            <span class="break-words">{{ option.content }}</span>
            <AppSvgIcon
              v-if="myVoteSet.has(option.id)"
              name="check"
              :size="15"
              class="shrink-0 text-primary"
            />
          </span>
          <span
            v-if="showResult"
            class="relative shrink-0 text-xs tabular-nums text-ink-secondary"
          >
            {{ option.voteCount ?? 0 }} 票 · {{ percentOf(option.voteCount).toFixed(1) }}%
          </span>
          <AppSvgIcon
            v-else-if="selectedIds.has(option.id)"
            name="check"
            :size="16"
            class="relative shrink-0 text-primary"
          />
        </button>
      </div>

      <!-- 提交与状态提示 -->
      <div class="mt-5">
        <div v-if="canCast" class="flex items-center justify-between gap-3">
          <span class="text-xs text-ink-muted">
            已选 {{ selectedIds.size }} 项{{ vote.isMultiple ? "（可多选）" : "" }}
          </span>
          <button
            type="button"
            class="btn-primary !px-5 !py-2 text-sm"
            :disabled="selectedIds.size === 0 || casting"
            @click="submitVote"
          >
            {{ casting ? "提交中…" : "确认投票" }}
          </button>
        </div>
        <p v-else-if="hasVoted" class="text-xs text-ink-muted">你已参与过该投票。</p>
        <p v-else-if="ended" class="text-xs text-ink-muted">该投票已结束。</p>
      </div>

      <!-- 管理操作：提前关闭 -->
      <div v-if="canClose" class="mt-6 border-t border-subtle pt-4">
        <button
          type="button"
          class="btn-danger w-full !py-2 text-sm"
          :disabled="closing"
          @click="onClose"
        >
          {{ closing ? "关闭中…" : "提前关闭投票" }}
        </button>
      </div>
    </article>
  </div>
</template>
