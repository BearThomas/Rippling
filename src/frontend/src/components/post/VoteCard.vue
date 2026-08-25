<!--
  投票卡片

  展示投票标题 / 描述 / 状态；点开后拉取选项（GET /api/vote），
  支持直接投票（POST /api/vote/cast）。点击标题区跳转投票页。
-->
<script setup lang="ts">
import { computed, ref } from "vue";
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

/** 详情（含选项）拉取状态 */
const options = ref<VoteOption[] | null>(null);
const optionsLoading = ref(false);
const optionsError = ref(false);

/** 投票状态 */
const selectedIds = ref<Set<string>>(new Set());
const casting = ref(false);
/** 是否多选投票（来自详情接口） */
const isMultiple = ref(false);
/** 是否已展示投票结果（投过票 / 投票已关闭 / 实时可见） */
const showResult = ref(false);

/** 点赞本地状态 */
const liked = ref(false);
const likeCount = ref(props.likeCount);
const likeBusy = ref(false);

/** 是否已结束（关闭或超时） */
const ended = computed(
  () => props.isClosed || (props.endAt && new Date(props.endAt).getTime() < Date.now())
);

/** 总票数（结果不可见时 voteCount 为 null，按 0 计） */
const totalVotes = computed(() =>
  (options.value ?? []).reduce((sum, option) => sum + (option.voteCount ?? 0), 0)
);

/** 拉取投票选项 */
async function loadOptions(): Promise<void> {
  if (options.value || optionsLoading.value) return;
  optionsLoading.value = true;
  optionsError.value = false;
  try {
    const detail: VoteInfo = await getVoteDetail(props.id);
    options.value = detail.options;
    isMultiple.value = detail.isMultiple;
    // 结果可见（实时可见 / 已结束）或已投过票 → 直接展示结果
    showResult.value = detail.resultsVisible || (detail.myVote?.length ?? 0) > 0;
  } catch {
    optionsError.value = true;
  } finally {
    optionsLoading.value = false;
  }
}

/** 切换选项选中（多选投票时支持多选） */
function toggleOption(option: VoteOption, multiple: boolean): void {
  if (showResult.value || casting.value) return;
  const next = new Set(selectedIds.value);
  if (next.has(option.id)) {
    next.delete(option.id);
  } else {
    if (!multiple) next.clear();
    next.add(option.id);
  }
  selectedIds.value = next;
}

/** 提交投票 */
async function submitVote(): Promise<void> {
  if (!auth.isLoggedIn) {
    router.push({ path: "/login", query: { redirect: router.currentRoute.value.fullPath } });
    return;
  }
  if (selectedIds.value.size === 0 || casting.value) return;
  casting.value = true;
  try {
    await castVote(props.id, [...selectedIds.value]);
    // cast 接口无返回，重新拉详情获取票数与我的投票
    const fresh = await getVoteDetail(props.id);
    options.value = fresh.options;
    showResult.value = true;
    showToast("投票成功", "success");
  } catch {
    // client.ts 已自动 Toast 后端错误信息
  } finally {
    casting.value = false;
  }
}

/** 切换点赞 */
async function onToggleLike(event: Event): Promise<void> {
  event.stopPropagation();
  if (!auth.isLoggedIn) {
    router.push({ path: "/login", query: { redirect: router.currentRoute.value.fullPath } });
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

/** 跳转投票详情页 */
function openVotePage(): void {
  router.push({ name: "vote-detail", params: { id: props.id } });
}
</script>

<template>
  <article class="card-base">
    <!-- 头部：类型标签 + 状态 + 时间 -->
    <div class="mb-2 flex items-center gap-2">
      <span class="flex items-center gap-1 text-xs font-medium text-primary">
        <AppSvgIcon name="chart" :size="14" />
        投票
      </span>
      <span
        v-if="ended"
        class="rounded bg-line px-1 text-[10px] text-ink-soft"
      >
        已结束
      </span>
      <span class="ml-auto text-xs text-ink-soft">{{ formatRelativeTime(createdAt) }}</span>
    </div>

    <!-- 标题（点击跳转投票页） -->
    <h3
      class="mb-1 cursor-pointer text-base font-semibold transition-opacity active:opacity-70"
      @click="openVotePage"
    >
      {{ title }}
    </h3>
    <p v-if="description" class="mb-2 text-sm text-ink-soft">{{ description }}</p>

    <!-- 选项区（展开后显示） -->
    <div v-if="!options && !optionsError" class="mt-2">
      <button type="button" class="btn-secondary !py-1.5 text-sm" @click="loadOptions">
        {{ ended ? "查看结果" : "参与投票" }}
      </button>
    </div>

    <div v-if="optionsLoading" class="mt-2 text-center text-xs text-ink-soft">加载中…</div>
    <div v-else-if="optionsError" class="mt-2">
      <button type="button" class="text-xs text-primary underline" @click="loadOptions">
        加载失败，点击重试
      </button>
    </div>

    <div v-else-if="options" class="mt-2 space-y-2">
      <div
        v-for="option in options"
        :key="option.id"
        class="relative overflow-hidden rounded-lg border px-3 py-2 text-sm transition-colors"
        :class="[
          selectedIds.has(option.id)
            ? 'border-primary text-primary'
            : 'border-line text-ink',
          showResult || ended ? 'cursor-default' : 'cursor-pointer active:opacity-80',
        ]"
        @click="toggleOption(option, isMultiple)"
      >
        <!-- 结果进度条背景 -->
        <span
          v-if="showResult || ended"
          class="absolute inset-y-0 left-0 bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)]"
          :style="{
            width: totalVotes > 0 ? ((option.voteCount ?? 0) / totalVotes) * 100 + '%' : '0%',
          }"
        />
        <span class="relative flex items-center justify-between gap-2">
          <span>{{ option.content }}</span>
          <span v-if="showResult || ended" class="shrink-0 text-xs text-ink-soft">
            {{ option.voteCount ?? 0 }} 票
          </span>
          <AppSvgIcon v-else-if="selectedIds.has(option.id)" name="check" :size="16" class="shrink-0 text-primary" />
        </span>
      </div>

      <!-- 投票按钮（未展示结果且未结束时） -->
      <div v-if="!showResult && !ended" class="flex items-center justify-between pt-1">
        <span class="text-xs text-ink-soft">已选 {{ selectedIds.size }} 项</span>
        <button
          type="button"
          class="btn-primary !py-1.5 text-sm disabled:opacity-50"
          :disabled="selectedIds.size === 0 || casting"
          @click="submitVote"
        >
          {{ casting ? "提交中…" : "投票" }}
        </button>
      </div>
    </div>

    <!-- 底部：点赞 + 总票数 -->
    <div class="mt-3 flex items-center gap-4 text-xs text-ink-soft">
      <button
        type="button"
        class="flex items-center gap-1 transition-colors"
        :class="liked ? 'text-primary' : ''"
        @click="onToggleLike"
      >
        <AppSvgIcon name="thumbUp" :size="14" />
        {{ formatNumber(likeCount) }}
      </button>
      <span v-if="showResult || ended">共 {{ formatNumber(totalVotes) }} 票</span>
    </div>
  </article>
</template>
