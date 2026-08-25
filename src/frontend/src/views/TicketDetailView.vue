<!--
  工单详情页

  - 基本信息：标题 / 类型 / 状态 / 提交时间 / 提交人 / 内容 / extraData
  - 已关闭显示处理结果；提交者本人显示"这是我的工单"标记
  - 处理操作区：handle_ticket 权限 + 工单 open 时按类型动态渲染按钮组，
    拒绝必须填写原因，处理成功后刷新详情
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { getTicket, handleTicket } from "../api/ticket";
import type { HandleAction } from "../api/ticket";
import { getUserProfile } from "../api/user";
import { useAuthStore } from "../stores/auth";
import { getMyPermissions } from "../utils/myPermissions";
import { hasPermission, PERM_HANDLE_TICKET } from "../utils/permission";
import {
  ticketTypeLabel,
  ticketStatusLabel,
  TICKET_ALLOWED_ACTIONS,
  HANDLE_ACTION_LABELS,
} from "../utils/ticket";
import { formatDateTime } from "../utils/format";
import { showToast } from "../utils/toast";
import type { TicketInfo } from "../types";

const route = useRoute();
const auth = useAuthStore();
const ticketId = route.params.id as string;

const loading = ref(true);
const error = ref(false);
const ticket = ref<TicketInfo | null>(null);

/** 提交人用户名（后端工单只存 userId，异步拉取公开资料获得） */
const submitterName = ref<string | null>(null);

/** 是否具备 handle_ticket 权限 */
const canHandle = ref(false);

/** 处理中（按钮防重复点击） */
const handling = ref(false);
/** 拒绝原因（仅 reject 必填） */
const rejectReason = ref("");

/** 当前工单是否由我提交 */
const isMine = computed(
  () => !!ticket.value && !!auth.userId && ticket.value.submittedBy === auth.userId
);

/** 按类型取允许的处理动作（与后端 ALLOWED_ACTIONS 一致） */
const actions = computed<string[]>(() =>
  ticket.value ? TICKET_ALLOWED_ACTIONS[ticket.value.type] ?? [] : []
);

/** 是否显示处理操作区：有权限 + 工单未关闭 + 有可用动作 */
const showHandlePanel = computed(
  () => canHandle.value && ticket.value?.status === "open" && actions.value.length > 0
);

/** extraData 解析结果（JSON 字符串 → 对象，解析失败为 null） */
const extraEntries = computed<{ key: string; value: string }[]>(() => {
  if (!ticket.value?.extraData) return [];
  try {
    const parsed = JSON.parse(ticket.value.extraData) as Record<string, unknown>;
    return Object.entries(parsed).map(([key, value]) => ({
      key,
      value: typeof value === "string" ? value : JSON.stringify(value),
    }));
  } catch {
    return [];
  }
});

/** 加载工单详情 + 提交人用户名 + 处理权限 */
async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    ticket.value = await getTicket(ticketId);
    // 提交人用户名拉取失败不影响详情页展示
    getUserProfile(ticket.value.submittedBy)
      .then((profile) => {
        submitterName.value = profile.username;
      })
      .catch(() => {});
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

/**
 * 执行处理动作
 *
 * 拒绝时必填原因（按钮禁用双保险）；警告 / 处罚 / 封禁二次确认防误触。
 */
async function doHandle(action: HandleAction): Promise<void> {
  if (!ticket.value || handling.value) return;

  const reason = action === "reject" ? rejectReason.value.trim() : undefined;
  if (action === "reject" && !reason) {
    showToast("请填写拒绝原因", "error");
    return;
  }

  if (["warn", "punish", "ban"].includes(action)) {
    const confirmed = window.confirm(`确认对举报目标执行「${HANDLE_ACTION_LABELS[action]}」？`);
    if (!confirmed) return;
  }

  handling.value = true;
  try {
    await handleTicket(ticket.value.id, action, reason);
    showToast("处理成功", "success");
    rejectReason.value = "";
    // 重新拉取详情展示最新状态与结果
    await load();
  } catch {
    // 错误 Toast 由 client 层统一处理
  } finally {
    handling.value = false;
  }
}

onMounted(async () => {
  const mask = await getMyPermissions();
  canHandle.value = hasPermission(mask, PERM_HANDLE_TICKET);
  load();
});
</script>

<template>
  <div class="px-3 pt-3">
    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" message="工单不存在或无权访问" @retry="load" />

    <template v-else-if="ticket">
      <div class="card-base">
        <!-- 状态行 -->
        <div class="mb-2 flex items-center gap-2 text-xs">
          <span class="text-primary">{{ ticketTypeLabel(ticket.type) }}</span>
          <span
            class="rounded px-1.5 py-0.5 text-[10px]"
            :class="ticket.status === 'open' ? 'text-accent' : 'bg-line text-ink-soft'"
            :style="ticket.status === 'open' ? { background: 'color-mix(in srgb, var(--c-accent) 12%, transparent)' } : {}"
          >
            {{ ticketStatusLabel(ticket.status) }}
          </span>
          <span v-if="isMine" class="rounded bg-line px-1.5 py-0.5 text-[10px] text-ink-soft">
            这是我的工单
          </span>
          <span class="ml-auto text-ink-soft">{{ formatDateTime(ticket.createdAt) }}</span>
        </div>

        <h2 class="text-lg font-bold">{{ ticket.title }}</h2>

        <!-- 提交人 -->
        <p v-if="submitterName" class="mt-1 text-xs text-ink-soft">提交人：{{ submitterName }}</p>

        <p class="mt-2 whitespace-pre-line break-all text-sm leading-relaxed">
          {{ ticket.content ?? "（无正文）" }}
        </p>

        <!-- extraData 格式化展示（如 timeline_submit 的 eventDate） -->
        <div v-if="extraEntries.length > 0" class="mt-3 rounded-lg bg-page p-3 text-sm">
          <div v-for="entry in extraEntries" :key="entry.key" class="flex gap-2 py-0.5">
            <span class="shrink-0 text-ink-soft">{{ entry.key }}</span>
            <span class="break-all">{{ entry.value }}</span>
          </div>
        </div>
      </div>

      <!-- 处理结果（已关闭时展示） -->
      <div v-if="ticket.status === 'closed' && ticket.result" class="card-base mt-3">
        <h3 class="mb-1 text-sm font-semibold text-ink-soft">处理结果</h3>
        <p class="whitespace-pre-line text-sm">{{ ticket.result }}</p>
      </div>

      <!-- 处理操作区（handle_ticket 权限 + open） -->
      <div v-if="showHandlePanel" class="card-base mt-3">
        <h3 class="mb-2 text-sm font-semibold text-ink-soft">处理工单</h3>

        <!-- 拒绝原因输入 -->
        <div v-if="actions.includes('reject')" class="mb-3">
          <textarea
            v-model="rejectReason"
            rows="2"
            maxlength="500"
            class="input-base w-full resize-none"
            placeholder="拒绝原因（拒绝时必填）"
          ></textarea>
        </div>

        <!-- 动态按钮组 -->
        <div class="flex flex-wrap gap-2">
          <button
            v-for="action in actions"
            :key="action"
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-medium transition-opacity active:opacity-80 disabled:opacity-40"
            :class="
              action === 'approve'
                ? 'bg-primary text-white'
                : ['reject', 'punish', 'ban'].includes(action)
                  ? 'bg-red-500 text-white'
                  : 'border border-line bg-surface text-ink'
            "
            :disabled="handling || (action === 'reject' && !rejectReason.trim())"
            @click="doHandle(action as HandleAction)"
          >
            {{ HANDLE_ACTION_LABELS[action] ?? action }}
          </button>
        </div>
        <p v-if="handling" class="mt-2 text-xs text-ink-soft">处理中…</p>
      </div>
    </template>
  </div>
</template>
