<!--
  投票页 — 投票列表

  - 数据源：GET /api/vote/list（description 预览 + totalVotes 可见性由后端控制）
  - 每条显示标题 / 描述预览 / 截止倒计时 / 总票数（可见时）
  - 持有 create_vote 权限（位 37）时显示「创建投票」→ 页面内底部弹出层
  - 分页加载更多
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { getVoteList, createVote } from "../api/vote";
import { formatCountdown, formatDateTime, formatNumber } from "../utils/format";
import { showToast } from "../utils/toast";
import { useAuthStore } from "../stores/auth";
import { getMyPermissions } from "../utils/myPermissions";
import { hasPermission, PERM_CREATE_VOTE } from "../utils/permission";
import type { VoteListItem } from "../types";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

/** 每页条数 */
const PAGE_SIZE = 20;

const loading = ref(true);
const error = ref(false);
const votes = ref<VoteListItem[]>([]);

/** 分页状态 */
const loadingMore = ref(false);
const hasMore = ref(true);

/** 响应式当前时间（每 30 秒刷新一次倒计时） */
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

/** 是否有 create_vote 权限（创建按钮可见性） */
const canCreate = ref(false);

// ------------------------------------------------------------
//  创建投票弹层
// ------------------------------------------------------------

const showCreator = ref(false);
const creating = ref(false);

/** 创建表单状态 */
const form = ref({
  title: "",
  description: "",
  isMultiple: false,
  isRealTimeVisible: true,
  /** datetime-local 输入值（YYYY-MM-DDTHH:mm） */
  endAt: "",
  options: ["", ""],
});

/** 是否已结束（关闭或超时） */
function isEnded(item: VoteListItem): boolean {
  return item.isClosed || new Date(item.endAt).getTime() <= now.value;
}

/** 首次加载 */
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

/** 加载更多 */
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

/** 进详情 */
function openDetail(item: VoteListItem): void {
  router.push({ name: "vote-detail", params: { id: item.id } });
}

/** 探测创建权限 */
async function loadPermissions(): Promise<void> {
  const mask = await getMyPermissions();
  canCreate.value = hasPermission(mask, PERM_CREATE_VOTE);
}

/** 打开创建弹层 */
function openCreator(): void {
  if (!auth.isLoggedIn) {
    router.push({ path: "/login", query: { redirect: route.fullPath } });
    return;
  }
  showCreator.value = true;
}

/** 关闭创建弹层 */
function closeCreator(): void {
  if (creating.value) return;
  showCreator.value = false;
}

/** 增加 / 删除选项 */
function addOption(): void {
  if (form.value.options.length < 8) form.value.options.push("");
}

function removeOption(index: number): void {
  if (form.value.options.length > 2) form.value.options.splice(index, 1);
}

/** 提交创建投票 */
async function handleCreate(): Promise<void> {
  if (creating.value) return;

  const title = form.value.title.trim();
  const options = form.value.options.map((o) => o.trim()).filter(Boolean);

  if (!title) {
    showToast("标题不能为空", "error");
    return;
  }
  if (options.length < 2) {
    showToast("至少需要 2 个非空选项", "error");
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
    // 本地构造列表项插入顶部（结果不可见时 totalVotes 为 null）
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
    // 重置表单
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
  <div class="px-3 pt-3">
    <!-- 顶部操作行：说明 + 创建入口（需 create_vote 权限） -->
    <div class="mb-3 flex items-center justify-between gap-2">
      <p class="text-xs text-ink-soft">参与或创建校园投票。</p>
      <button
        v-if="canCreate"
        type="button"
        class="btn-primary shrink-0 !py-1.5 text-sm"
        @click="openCreator"
      >
        创建投票
      </button>
    </div>

    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" @retry="load" />

    <template v-else>
      <div v-if="votes.length > 0" class="space-y-3">
        <article
          v-for="item in votes"
          :key="item.id"
          class="card-base cursor-pointer transition-opacity active:opacity-80"
          role="button"
          tabindex="0"
          @click="openDetail(item)"
          @keydown.enter="openDetail(item)"
        >
          <div class="flex items-center justify-between gap-2">
            <h3 class="font-semibold">{{ item.title }}</h3>
            <span
              class="shrink-0 rounded px-1.5 py-0.5 text-[10px]"
              :class="isEnded(item) ? 'bg-line text-ink-soft' : 'text-accent'"
              :style="!isEnded(item) ? { background: 'color-mix(in srgb, var(--c-accent) 12%, transparent)' } : {}"
            >
              {{ isEnded(item) ? "已结束" : formatCountdown(item.endAt, now) }}
            </span>
          </div>
          <p v-if="item.description" class="mt-1 text-sm text-ink-soft">{{ item.description }}</p>
          <div class="mt-2 flex items-center gap-3 text-xs text-ink-soft">
            <span>截止：{{ formatDateTime(item.endAt) }}</span>
            <span v-if="item.totalVotes !== null">共 {{ formatNumber(item.totalVotes) }} 票</span>
          </div>
        </article>

        <!-- 加载更多 -->
        <div class="py-2 text-center">
          <button
            v-if="hasMore"
            type="button"
            class="btn-secondary !py-1.5 text-sm"
            :disabled="loadingMore"
            @click="loadMore"
          >
            {{ loadingMore ? "加载中…" : "加载更多" }}
          </button>
          <span v-else class="text-xs text-ink-soft">已经到底啦</span>
        </div>
      </div>

      <EmptyState v-else text="还没有投票" icon="chart" />
    </template>

    <!-- 创建投票弹层（底部弹出） -->
    <div
      v-if="showCreator"
      class="fixed inset-0 z-50 flex items-end bg-black/40"
      @click.self="closeCreator"
    >
      <div class="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-surface px-4 pb-6 pt-4">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-base font-semibold">创建投票</h3>
          <button type="button" aria-label="关闭" @click="closeCreator">
            <AppSvgIcon name="close" :size="18" class="text-ink-soft" />
          </button>
        </div>

        <div class="space-y-3">
          <!-- 标题 -->
          <input v-model="form.title" class="input-base" placeholder="投票标题（必填）" maxlength="100" />

          <!-- 描述 -->
          <textarea
            v-model="form.description"
            class="input-base min-h-16 resize-y"
            placeholder="投票描述（可选）"
            maxlength="500"
          />

          <!-- 选项 -->
          <div>
            <p class="mb-1.5 text-xs text-ink-soft">选项（至少 2 个，最多 8 个）</p>
            <div class="space-y-2">
              <div
                v-for="(option, index) in form.options"
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
                  class="shrink-0 text-ink-soft"
                  aria-label="删除选项"
                  @click="removeOption(index)"
                >
                  <AppSvgIcon name="trash" :size="16" />
                </button>
              </div>
            </div>
            <button
              v-if="form.options.length < 8"
              type="button"
              class="mt-2 flex items-center gap-1 text-xs text-primary"
              @click="addOption"
            >
              <AppSvgIcon name="plusSquare" :size="14" />
              添加选项
            </button>
          </div>

          <!-- 截止时间 -->
          <div>
            <p class="mb-1.5 text-xs text-ink-soft">截止时间（必填）</p>
            <input v-model="form.endAt" type="datetime-local" class="input-base" />
          </div>

          <!-- 开关选项 -->
          <label class="flex items-center gap-2 text-sm">
            <input v-model="form.isMultiple" type="checkbox" class="accent-[var(--c-primary)]" />
            允许多选
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input
              v-model="form.isRealTimeVisible"
              type="checkbox"
              class="accent-[var(--c-primary)]"
            />
            实时公开票数（关闭则结束后才显示结果）
          </label>

          <!-- 提交 -->
          <button
            type="button"
            class="btn-primary w-full disabled:opacity-50"
            :disabled="creating"
            @click="handleCreate"
          >
            {{ creating ? "创建中…" : "创建投票" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
