<!--
  工单详情页（Elk 分层阅读流 + ConfirmDialog 处置确认）

  - 基本信息：标题 / 类型 / 状态 / 提交时间 / 提交人 / 内容 / extraData
  - 已关闭显示处理结果；提交者本人显示“我的工单”标记
  - 处理操作区：handle_ticket 权限 + 工单 open 时按类型动态渲染按钮组
-->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import { useRoute } from "vue-router";
import FeedSkeleton from "../components/common/FeedSkeleton.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { useConfirm } from "../composables/useConfirm";
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
const { confirm } = useConfirm();
const ticketId = route.params.id as string;

const loading = shallowRef(true);
const error = shallowRef(false);
const ticket = ref<TicketInfo | null>(null);

const submitterName = shallowRef<string | null>(null);
const canHandle = shallowRef(false);
const handling = shallowRef(false);
const rejectReason = shallowRef("");

const isMine = computed(
  () => Boolean(ticket.value) && Boolean(auth.userId) && ticket.value?.submittedBy === auth.userId
);

const actions = computed<string[]>(() =>
  ticket.value ? TICKET_ALLOWED_ACTIONS[ticket.value.type] ?? [] : []
);

const showHandlePanel = computed(
  () => canHandle.value && ticket.value?.status === "open" && actions.value.length > 0
);

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

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    ticket.value = await getTicket(ticketId);
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

async function doHandle(action: HandleAction): Promise<void> {
  if (!ticket.value || handling.value) return;

  const reason = action === "reject" ? rejectReason.value.trim() : undefined;
  if (action === "reject" && !reason) {
    showToast("请填写拒绝原因", "error");
    return;
  }

  if (["warn", "punish", "ban"].includes(action)) {
    const actionLabel = HANDLE_ACTION_LABELS[action] ?? action;
    const ok = await confirm({
      title: `确认执行「${actionLabel}」？`,
      description: "该操作将对被举报目标生效，并计入公开管理日志。",
      confirmText: `确认${actionLabel}`,
      variant: "danger",
    });
    if (!ok) return;
  }

  handling.value = true;
  try {
    await handleTicket(ticket.value.id, action, reason);
    showToast("处理成功", "success");
    rejectReason.value = "";
    await load();
  } catch {
    // client.ts 已自动 Toast
  } finally {
    handling.value = false;
  }
}

onMounted(async () => {
  const mask = await getMyPermissions();
  canHandle.value = hasPermission(mask, PERM_HANDLE_TICKET);
  void load();
});
</script>

<template>
  <div>
    <FeedSkeleton v-if="loading" variant="elk" :count="3" />
    <div v-else-if="error" class="px-4 py-6">
      <ErrorState message="工单不存在或无权访问" @retry="load" />
    </div>

    <div v-else-if="ticket" class="divide-y divide-[var(--border-subtle)] pb-10">
      <!-- 工单主体 -->
      <article class="px-4 py-5 sm:px-5">
        <div class="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span class="tag-pill-accent">{{ ticketTypeLabel(ticket.type) }}</span>
          <span
            class="rounded-full px-2 py-0.5 text-[11px] font-medium"
            :class="
              ticket.status === 'open'
                ? 'bg-accent-warm-soft text-accent-warm'
                : 'bg-hover text-ink-muted'
            "
          >
            {{ ticketStatusLabel(ticket.status) }}
          </span>
          <span v-if="isMine" class="tag-pill">我的工单</span>
          <time
            :datetime="ticket.createdAt"
            class="ml-auto tabular-nums text-ink-muted"
          >
            {{ formatDateTime(ticket.createdAt) }}
          </time>
        </div>

        <h1 class="text-xl font-bold leading-snug text-ink break-words">
          {{ ticket.title }}
        </h1>

        <p v-if="submitterName" class="mt-1.5 text-xs text-ink-muted">
          提交人：
          <RouterLink
            :to="{ name: 'user-profile', params: { id: ticket.submittedBy } }"
            class="font-medium text-ink-secondary hover:text-primary hover:underline underline-offset-4"
          >
            {{ submitterName }}
          </RouterLink>
        </p>

        <p class="mt-4 whitespace-pre-line break-words text-[15px] leading-[1.7] text-ink">
          {{ ticket.content ?? "（无正文）" }}
        </p>

        <!-- extraData 浅底信息块（禁止二级边框套娃） -->
        <dl
          v-if="extraEntries.length > 0"
          class="mt-4 space-y-1.5 rounded-xl bg-canvas-soft p-3.5 text-sm"
        >
          <div v-for="entry in extraEntries" :key="entry.key" class="flex gap-3">
            <dt class="shrink-0 font-mono text-xs text-ink-muted">{{ entry.key }}</dt>
            <dd class="min-w-0 flex-1 break-all text-xs text-ink">{{ entry.value }}</dd>
          </div>
        </dl>
      </article>

      <!-- 处理结果（已关闭时展示） -->
      <section v-if="ticket.status === 'closed' && ticket.result" class="px-4 py-5 sm:px-5">
        <h2 class="mb-2 text-sm font-semibold text-ink">处理结果</h2>
        <p class="whitespace-pre-line break-words text-sm leading-relaxed text-ink-secondary">
          {{ ticket.result }}
        </p>
      </section>

      <!-- 处理操作区（handle_ticket 权限 + open） -->
      <section v-if="showHandlePanel" class="px-4 py-5 sm:px-5">
        <h2 class="mb-3 text-sm font-semibold text-ink">处理工单</h2>

        <div v-if="actions.includes('reject')" class="mb-3.5">
          <label for="ticket-reject-reason" class="mb-1.5 block text-xs text-ink-muted">
            拒绝原因（执行拒绝操作时必填）
          </label>
          <textarea
            id="ticket-reject-reason"
            v-model="rejectReason"
            rows="2"
            maxlength="500"
            class="input-base resize-none"
            placeholder="填写拒绝原因…"
          />
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            v-for="action in actions"
            :key="action"
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-medium pressable disabled:opacity-40"
            :class="
              action === 'approve'
                ? 'bg-primary text-white hover:opacity-90'
                : ['reject', 'punish', 'ban'].includes(action)
                  ? 'bg-danger text-white hover:opacity-90'
                  : 'border border-strong bg-surface text-ink hover:bg-hover'
            "
            :disabled="handling || (action === 'reject' && !rejectReason.trim())"
            @click="doHandle(action as HandleAction)"
          >
            {{ HANDLE_ACTION_LABELS[action] ?? action }}
          </button>
        </div>
        <p v-if="handling" class="mt-2.5 text-xs text-ink-muted">处理中…</p>
      </section>
    </div>
  </div>
</template>
