<!--
  投票信息流行（Elk 无边框 1px 分割线风格）

  支持展开选项直接投票与实时查看进度条；点击标题进投票详情页。
-->
<script setup lang="ts">
import { computed, ref, shallowRef } from "vue";
import { useRouter } from "vue-router";
import AppSvgIcon from "../layout/AppSvgIcon.vue";
import { formatRelativeTime, formatNumber } from "../../utils/format";
import { getVoteDetail, castVote } from "../../api/vote";
import { toggleLike } from "../../api/like";
import { showToast } from "../../utils/toast";
import { useAuthStore } from "../../stores/auth";
import type { VoteInfo, VoteOption } from "../../types";

const props = defineProps<{
  id: string;
  title: string;
  description: string | null;
  endAt: string;
  isClosed: boolean;
  likeCount: number;
  createdAt: string;
}>();

const router = useRouter();
const auth = useAuthStore();

const options = ref<VoteOption[] | null>(null);
const optionsLoading = shallowRef(false);
const optionsError = shallowRef(false);

const selectedIds = ref<Set<string>>(new Set());
const casting = shallowRef(false);
const isMultiple = shallowRef(false);
const showResult = shallowRef(false);

const liked = shallowRef(false);
const likeCount = shallowRef(props.likeCount);
const likeBusy = shallowRef(false);

const ended = computed(
  () => props.isClosed || (props.endAt && new Date(props.endAt).getTime() < Date.now())
);

const totalVotes = computed(() =>
  (options.value ?? []).reduce((sum, option) => sum + (option.voteCount ?? 0), 0)
);

async function loadOptions(): Promise<void> {
  if (options.value || optionsLoading.value) return;
  optionsLoading.value = true;
  optionsError.value = false;
  try {
    const detail: VoteInfo = await getVoteDetail(props.id);
    options.value = detail.options;
    isMultiple.value = detail.isMultiple;
    showResult.value = detail.resultsVisible || (detail.myVote?.length ?? 0) > 0;
  } catch {
    optionsError.value = true;
  } finally {
    optionsLoading.value = false;
  }
}

function toggleOption(option: VoteOption, multiple: boolean): void {
  if (showResult.value || ended.value || casting.value) return;
  const next = new Set(selectedIds.value);
  if (next.has(option.id)) {
    next.delete(option.id);
  } else {
    if (!multiple) next.clear();
    next.add(option.id);
  }
  selectedIds.value = next;
}

async function submitVote(): Promise<void> {
  if (!auth.isLoggedIn) {
    void router.push({ path: "/login", query: { redirect: router.currentRoute.value.fullPath } });
    return;
  }
  if (selectedIds.value.size === 0 || casting.value) return;
  casting.value = true;
  try {
    await castVote(props.id, [...selectedIds.value]);
    const fresh = await getVoteDetail(props.id);
    options.value = fresh.options;
    showResult.value = true;
    showToast("投票成功", "success");
  } catch {
    // client.ts 已自动 Toast
  } finally {
    casting.value = false;
  }
}

async function onToggleLike(event: Event): Promise<void> {
  event.stopPropagation();
  if (!auth.isLoggedIn) {
    void router.push({ path: "/login", query: { redirect: router.currentRoute.value.fullPath } });
    return;
  }
  if (likeBusy.value) return;
  likeBusy.value = true;
  try {
    const result = await toggleLike("vote", props.id);
    liked.value = result.liked;
    likeCount.value = result.likeCount;
  } catch {
    showToast("点赞失败，请稍后重试", "error");
  } finally {
    likeBusy.value = false;
  }
}

function openVotePage(): void {
  void router.push({ name: "vote-detail", params: { id: props.id } });
}
</script>

<template>
  <article class="feed-row">
    <!-- 头部：轻量标签 + 状态 + 时间 -->
    <div class="flex items-center gap-2">
      <span class="tag-pill-accent">
        <AppSvgIcon name="chart" :size="12" />
        投票
      </span>
      <span v-if="ended" class="tag-pill">已结束</span>
      <time
        class="ml-auto shrink-0 text-xs tabular-nums text-ink-muted"
        :datetime="createdAt"
      >
        {{ formatRelativeTime(createdAt) }}
      </time>
    </div>

    <!-- 标题（点击进投票详情） -->
    <h3
      class="mt-2 cursor-pointer text-[15px] font-semibold leading-[22px] text-ink transition-colors hover:text-primary sm:text-base"
      @click="openVotePage"
    >
      {{ title }}
    </h3>
    <p v-if="description" class="mt-1 text-sm leading-6 text-ink-secondary">
      {{ description }}
    </p>

    <!-- 选项区 -->
    <div v-if="!options && !optionsError" class="mt-3">
      <button
        type="button"
        class="btn-secondary !px-3.5 !py-1.5 text-xs"
        :disabled="optionsLoading"
        @click="loadOptions"
      >
        {{ optionsLoading ? "加载选项…" : ended ? "查看结果" : "展开投票" }}
      </button>
    </div>

    <div v-else-if="optionsError" class="mt-2.5">
      <button type="button" class="text-xs text-primary hover:underline" @click="loadOptions">
        加载失败，点击重试
      </button>
    </div>

    <div v-else-if="options" class="mt-3 space-y-2">
      <button
        v-for="option in options"
        :key="option.id"
        type="button"
        class="relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-colors"
        :class="[
          selectedIds.has(option.id)
            ? 'border-primary bg-accent-soft text-primary'
            : 'border-subtle bg-canvas-soft text-ink hover:border-strong',
          showResult || ended ? 'cursor-default' : 'cursor-pointer',
        ]"
        @click="toggleOption(option, isMultiple)"
      >
        <span
          v-if="showResult || ended"
          class="pointer-events-none absolute inset-y-0 left-0 bg-accent-soft"
          :style="{
            width: totalVotes > 0 ? ((option.voteCount ?? 0) / totalVotes) * 100 + '%' : '0%',
          }"
        />
        <span class="relative min-w-0 flex-1 truncate font-medium">{{ option.content }}</span>
        <span
          v-if="showResult || ended"
          class="relative shrink-0 text-xs tabular-nums text-ink-secondary"
        >
          {{ option.voteCount ?? 0 }} 票
        </span>
        <AppSvgIcon
          v-else-if="selectedIds.has(option.id)"
          name="check"
          :size="15"
          class="relative shrink-0 text-primary"
        />
      </button>

      <div v-if="!showResult && !ended" class="flex items-center justify-between pt-1">
        <span class="text-xs text-ink-muted">
          已选 {{ selectedIds.size }} 项{{ isMultiple ? "（可多选）" : "" }}
        </span>
        <button
          type="button"
          class="btn-primary !px-3.5 !py-1.5 text-xs"
          :disabled="selectedIds.size === 0 || casting"
          @click="submitVote"
        >
          {{ casting ? "提交中…" : "确认投票" }}
        </button>
      </div>
    </div>

    <!-- 底部操作栏 -->
    <div class="mt-3 flex items-center gap-5 text-xs tabular-nums text-ink-muted">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md py-0.5 hover:text-primary pressable"
        :class="liked ? 'font-medium text-primary' : ''"
        :disabled="likeBusy"
        @click="onToggleLike"
      >
        <AppSvgIcon name="thumbUp" :size="15" />
        {{ formatNumber(likeCount) }}
      </button>
      <span v-if="showResult || ended">共 {{ formatNumber(totalVotes) }} 票</span>
      <button
        type="button"
        class="ml-auto text-xs text-ink-muted transition-colors hover:text-primary"
        @click="openVotePage"
      >
        查看详情
      </button>
    </div>
  </article>
</template>
