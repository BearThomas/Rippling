<!--
  投票列表页（Elk 无边框信息流 + AppDialog/AppSwitch 创建投票弹窗）
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef } from "vue";
import { useRouter } from "vue-router";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import AppDialog from "../components/common/AppDialog.vue";
import AppSwitch from "../components/common/AppSwitch.vue";
import FeedSkeleton from "../components/common/FeedSkeleton.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { getVoteList, createVote } from "../api/vote";
import { getMyPermissions } from "../utils/myPermissions";
import { hasPermission, PERM_CREATE_VOTE } from "../utils/permission";
import { formatCountdown, formatDateTime, formatNumber } from "../utils/format";
import { showToast } from "../utils/toast";
import type { VoteListItem } from "../types";

const router = useRouter();
const PAGE_SIZE = 20;

const loading = shallowRef(true);
const error = shallowRef(false);
const votes = ref<VoteListItem[]>([]);

const loadingMore = shallowRef(false);
const hasMore = shallowRef(true);

const canCreate = shallowRef(false);
const now = shallowRef(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

const showCreator = shallowRef(false);
const creating = shallowRef(false);
const form = ref({
  title: "",
  description: "",
  isMultiple: false,
  isRealTimeVisible: true,
  endAt: "",
  options: ["", ""],
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    votes.value = await getVoteList(PAGE_SIZE, 0);
    hasMore.value = votes.value.length >= PAGE_SIZE;
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
    const more = await getVoteList(PAGE_SIZE, votes.value.length);
    votes.value = [...votes.value, ...more];
    hasMore.value = more.length >= PAGE_SIZE;
  } catch {
    // client.ts 已自动 Toast
  } finally {
    loadingMore.value = false;
  }
}

async function loadPermissions(): Promise<void> {
  const mask = await getMyPermissions();
  canCreate.value = hasPermission(mask, PERM_CREATE_VOTE);
}

function isEnded(item: VoteListItem): boolean {
  return item.isClosed || new Date(item.endAt).getTime() <= now.value;
}

function openDetail(item: VoteListItem): void {
  void router.push({ name: "vote-detail", params: { id: item.id } });
}

function openCreator(): void {
  if (!form.value.endAt) {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    form.value.endAt =
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  showCreator.value = true;
}

function closeCreator(): void {
  if (creating.value) return;
  showCreator.value = false;
}

function addOption(): void {
  if (form.value.options.length >= 8) return;
  form.value.options.push("");
}

function removeOption(index: number): void {
  if (form.value.options.length <= 2) return;
  form.value.options.splice(index, 1);
}

async function handleCreate(): Promise<void> {
  if (creating.value) return;
  const title = form.value.title.trim();
  if (!title) {
    showToast("请输入投票标题", "error");
    return;
  }
  const options = form.value.options.map((o) => o.trim()).filter(Boolean);
  if (options.length < 2) {
    showToast("至少需要 2 个有效选项", "error");
    return;
  }
  if (!form.value.endAt) {
    showToast("请选择截止时间", "error");
    return;
  }
  const endAtDate = new Date(form.value.endAt);
  if (isNaN(endAtDate.getTime()) || endAtDate.getTime() <= Date.now()) {
    showToast("截止时间须晚于当前时间", "error");
    return;
  }

  creating.value = true;
  try {
    const { id } = await createVote({
      title,
      description: form.value.description.trim() || undefined,
      options,
      isMultiple: form.value.isMultiple,
      isRealTimeVisible: form.value.isRealTimeVisible,
      endAt: endAtDate.toISOString(),
    });
    votes.value = [
      {
        id,
        title,
        description: form.value.description.trim() || null,
        endAt: endAtDate.toISOString(),
        isClosed: false,
        createdAt: new Date().toISOString(),
        totalVotes: 0,
      },
      ...votes.value,
    ];
    showToast("投票创建成功", "success");
    showCreator.value = false;
    form.value = {
      title: "",
      description: "",
      isMultiple: false,
      isRealTimeVisible: true,
      endAt: "",
      options: ["", ""],
    };
  } catch {
    // client.ts 已自动 Toast
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  void load();
  void loadPermissions();
  timer = setInterval(() => {
    now.value = Date.now();
  }, 30_000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="pb-6">
    <!-- 顶部操作栏 -->
    <div class="flex items-center justify-between gap-3 border-b border-subtle px-4 py-3 sm:px-5">
      <p class="text-xs text-ink-muted">参与或发起校园投票。</p>
      <button
        v-if="canCreate"
        type="button"
        class="btn-primary shrink-0 !px-3.5 !py-1.5 text-xs"
        @click="openCreator"
      >
        <AppSvgIcon name="plus" :size="14" />
        创建投票
      </button>
    </div>

    <FeedSkeleton v-if="loading" variant="elk" :count="4" />
    <ErrorState v-else-if="error" @retry="load" />

    <template v-else>
      <div v-if="votes.length > 0">
        <article
          v-for="item in votes"
          :key="item.id"
          class="feed-row-interactive"
          role="button"
          tabindex="0"
          @click="openDetail(item)"
          @keydown.enter="openDetail(item)"
        >
          <div class="flex items-start justify-between gap-2.5">
            <h3 class="text-[15px] font-semibold leading-[22px] text-ink sm:text-base">
              {{ item.title }}
            </h3>
            <span
              class="shrink-0 tabular-nums"
              :class="isEnded(item) ? 'tag-pill' : 'tag-pill-accent'"
            >
              {{ isEnded(item) ? "已结束" : formatCountdown(item.endAt, now) }}
            </span>
          </div>

          <p v-if="item.description" class="mt-1 line-clamp-2 text-sm leading-6 text-ink-secondary">
            {{ item.description }}
          </p>

          <div class="mt-2.5 flex items-center gap-4 text-xs tabular-nums text-ink-muted">
            <span>截止 {{ formatDateTime(item.endAt) }}</span>
            <span v-if="item.totalVotes !== null">共 {{ formatNumber(item.totalVotes) }} 票</span>
          </div>
        </article>

        <div class="py-5 text-center">
          <button
            v-if="hasMore"
            type="button"
            class="btn-secondary !py-1.5 text-xs"
            :disabled="loadingMore"
            @click="loadMore"
          >
            {{ loadingMore ? "加载中…" : "加载更多" }}
          </button>
          <span v-else class="text-xs text-ink-muted">已经到底啦</span>
        </div>
      </div>

      <EmptyState v-else text="还没有投票" icon="chart" />
    </template>

    <!-- 创建投票弹窗（reka-ui AppDialog + AppSwitch） -->
    <AppDialog
      :open="showCreator"
      title="创建投票"
      description="设置投票主题、选项与截止时间"
      size="md"
      :dismissible="!creating"
      @close="closeCreator"
    >
      <div class="space-y-4">
        <div>
          <label class="mb-1.5 block text-xs font-medium text-ink-secondary">投票标题 *</label>
          <input
            v-model="form.title"
            class="input-base"
            placeholder="例如：本周电影之夜放哪一部？"
            maxlength="100"
          />
        </div>

        <div>
          <label class="mb-1.5 block text-xs font-medium text-ink-secondary">补充说明</label>
          <textarea
            v-model="form.description"
            class="input-base min-h-[68px] resize-y"
            placeholder="投票背景或规则说明（可选）"
            maxlength="500"
          />
        </div>

        <div>
          <p class="mb-1.5 text-xs font-medium text-ink-secondary">选项（至少 2 个，最多 8 个）</p>
          <div class="space-y-2">
            <div
              v-for="(_option, index) in form.options"
              :key="index"
              class="flex items-center gap-2"
            >
              <input
                v-model="form.options[index]"
                class="input-base flex-1"
                :placeholder="`选项 ${index + 1}`"
                maxlength="100"
              />
              <button
                v-if="form.options.length > 2"
                type="button"
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-danger-soft hover:text-danger pressable"
                aria-label="删除选项"
                @click="removeOption(index)"
              >
                <AppSvgIcon name="trash" :size="15" />
              </button>
            </div>
          </div>
          <button
            v-if="form.options.length < 8"
            type="button"
            class="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            @click="addOption"
          >
            <AppSvgIcon name="plus" :size="14" />
            添加选项
          </button>
        </div>

        <div>
          <label class="mb-1.5 block text-xs font-medium text-ink-secondary">截止时间 *</label>
          <input v-model="form.endAt" type="datetime-local" class="input-base" />
        </div>

        <div class="divide-y divide-subtle rounded-xl border border-subtle bg-canvas-soft px-3.5">
          <div class="flex items-center justify-between gap-3 py-2.5">
            <span class="text-sm text-ink">允许多选</span>
            <AppSwitch v-model="form.isMultiple" aria-label="允许多选" />
          </div>
          <div class="flex items-center justify-between gap-3 py-2.5">
            <div>
              <span class="block text-sm text-ink">实时公开票数</span>
              <span class="block text-xs text-ink-muted">关闭后仅在截止时展示结果</span>
            </div>
            <AppSwitch v-model="form.isRealTimeVisible" aria-label="实时公开票数" />
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-end gap-2.5">
          <button
            type="button"
            class="btn-secondary flex-1 sm:flex-none"
            :disabled="creating"
            @click="closeCreator"
          >
            取消
          </button>
          <button
            type="button"
            class="btn-primary flex-1 sm:flex-none"
            :disabled="creating"
            @click="handleCreate"
          >
            {{ creating ? "创建中…" : "发布投票" }}
          </button>
        </div>
      </template>
    </AppDialog>
  </div>
</template>
