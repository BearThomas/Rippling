<!--
  工单创建页（/ticket/create?type=xxx — 极简表单页 + AppSelect + ConfirmDialog）

  覆盖 7 种工单类型：
    timeline_submit / block_create / report / permission_request /
    appeal / verification / account_deletion
-->
<script setup lang="ts">
import { computed, shallowRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppSelect, { type SelectOptionItem } from "../components/common/AppSelect.vue";
import EmptyState from "../components/common/EmptyState.vue";
import { useConfirm } from "../composables/useConfirm";
import { createTicket } from "../api/ticket";
import { showToast } from "../utils/toast";
import type { TicketType } from "../types";

const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();

const TYPE_META: Record<TicketType, { heading: string; hint: string }> = {
  timeline_submit: {
    heading: "提交大事记",
    hint: "提交后由管理员审核，通过后发布到大事记列表。",
  },
  block_create: {
    heading: "申请创建板块",
    hint: "提交后由管理员审核，通过后板块将自动创建。",
  },
  report: {
    heading: "举报",
    hint: "请如实填写举报对象与原因，管理员会尽快处理。",
  },
  permission_request: {
    heading: "申请权限",
    hint: "选择需要申请的权限并说明理由，管理员审核后生效。",
  },
  appeal: {
    heading: "申诉",
    hint: "如对处罚或处理结果有异议，可提交申诉。",
  },
  verification: {
    heading: "身份认证",
    hint: "提交认证说明，管理员核实后为你添加认证标识。",
  },
  account_deletion: {
    heading: "注销账号",
    hint: "注销后账号数据将被处理，请谨慎操作。",
  },
};

const REQUESTABLE_PERMISSIONS = [
  { key: "upload_image", label: "上传图片" },
  { key: "submit_timeline", label: "提交大事记" },
  { key: "create_confession", label: "发布表白" },
  { key: "create_vote", label: "创建投票" },
] as const;

const PERMISSION_SELECT_OPTIONS: readonly SelectOptionItem[] = REQUESTABLE_PERMISSIONS.map((p) => ({
  value: p.key,
  label: `${p.label}（${p.key}）`,
}));

const REPORT_TARGET_TYPES = [
  { value: "post", label: "帖子" },
  { value: "comment", label: "评论" },
  { value: "confession", label: "表白" },
] as const;

const REPORT_SELECT_OPTIONS: readonly SelectOptionItem[] = REPORT_TARGET_TYPES.map((t) => ({
  value: t.value,
  label: t.label,
}));

const ticketType = computed<TicketType | null>(() => {
  const t = route.query.type as string | undefined;
  return t && t in TYPE_META ? (t as TicketType) : null;
});

const title = shallowRef("");
const content = shallowRef("");
const eventDate = shallowRef("");
const reportTargetType = shallowRef<string>((route.query.targetType as string) ?? "post");
const reportTargetId = shallowRef<string>((route.query.targetId as string) ?? "");
const requestedPermission = shallowRef<string>(REQUESTABLE_PERMISSIONS[0].key);
const attachmentUrl = shallowRef("");
const submitting = shallowRef(false);

const needsTitleInput = computed(
  () => ticketType.value === "timeline_submit" || ticketType.value === "block_create"
);

const titlePlaceholder = computed(() =>
  ticketType.value === "timeline_submit" ? "输入大事记标题…" : "输入板块名称…"
);

const contentPlaceholder = computed(() => {
  switch (ticketType.value) {
    case "timeline_submit":
      return "描述发生了什么…";
    case "block_create":
      return "介绍板块的主题、定位与基本规则…";
    case "report":
      return "请尽量提供具体说明…";
    case "permission_request":
      return "填写申请该权限的理由…";
    case "appeal":
      return "说明申诉理由…";
    case "verification":
      return "说明你的身份以及希望认证的标识…";
    case "account_deletion":
      return "填写注销原因…";
    default:
      return "";
  }
});

async function handleSubmit(): Promise<void> {
  if (!ticketType.value || submitting.value) return;

  const body = content.value.trim();
  if (!body) {
    showToast("内容不能为空", "error");
    return;
  }

  let finalTitle = title.value.trim();
  let targetType: string | undefined;
  let targetId: string | undefined;
  let extraData: Record<string, unknown> | undefined;

  switch (ticketType.value) {
    case "timeline_submit": {
      if (!finalTitle) {
        showToast("标题不能为空", "error");
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate.value)) {
        showToast("请选择事件日期", "error");
        return;
      }
      extraData = { eventDate: eventDate.value };
      break;
    }
    case "block_create": {
      if (!finalTitle) {
        showToast("板块名称不能为空", "error");
        return;
      }
      break;
    }
    case "report": {
      if (!REPORT_TARGET_TYPES.some((t) => t.value === reportTargetType.value)) {
        showToast("请选择举报对象类型", "error");
        return;
      }
      if (!reportTargetId.value.trim()) {
        showToast("请填写目标 ID", "error");
        return;
      }
      targetType = reportTargetType.value;
      targetId = reportTargetId.value.trim();
      const label = REPORT_TARGET_TYPES.find((t) => t.value === targetType)?.label ?? "";
      finalTitle = `举报${label}内容`;
      break;
    }
    case "permission_request": {
      const perm = REQUESTABLE_PERMISSIONS.find((p) => p.key === requestedPermission.value);
      if (!perm) {
        showToast("请选择申请的权限", "error");
        return;
      }
      finalTitle = `权限申请：${perm.key}（${perm.label}）`;
      break;
    }
    case "appeal":
      finalTitle = "申诉";
      break;
    case "verification": {
      finalTitle = "身份认证申请";
      if (attachmentUrl.value.trim()) {
        extraData = { attachmentUrl: attachmentUrl.value.trim() };
      }
      break;
    }
    case "account_deletion": {
      const ok = await confirm({
        title: "确定提交账号注销申请？",
        description: "提交后将交由管理员审核处理，注销生效后不可撤销。",
        confirmText: "确认提交",
        variant: "danger",
      });
      if (!ok) return;
      finalTitle = "账号注销申请";
      break;
    }
  }

  if (finalTitle.length > 100) {
    showToast("标题最多 100 字", "error");
    return;
  }
  if (body.length > 2000) {
    showToast("内容最多 2000 字", "error");
    return;
  }

  submitting.value = true;
  try {
    await createTicket({
      type: ticketType.value,
      title: finalTitle,
      content: body,
      targetType,
      targetId,
      extraData,
    });
    showToast("工单提交成功", "success");
    void router.replace({ name: "ticket-list" });
  } catch {
    // client.ts 已自动 Toast
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 pb-12 pt-4 sm:px-5 sm:pt-5">
    <EmptyState
      v-if="!ticketType"
      text="未知的工单类型"
      description="请从应用页或个人菜单中的对应入口发起工单。"
      icon="file"
    />

    <form v-else class="space-y-5" @submit.prevent="handleSubmit">
      <!-- 顶部说明 -->
      <header class="border-b border-subtle pb-4">
        <h1 class="text-lg font-semibold text-ink">{{ TYPE_META[ticketType].heading }}</h1>
        <p class="mt-1 text-sm leading-relaxed text-ink-muted">
          {{ TYPE_META[ticketType].hint }}
        </p>
      </header>

      <!-- 标题（timeline_submit / block_create） -->
      <div v-if="needsTitleInput">
        <label for="ticket-title" class="mb-1.5 block text-sm font-medium text-ink">
          {{ ticketType === "timeline_submit" ? "大事记标题" : "板块名称" }}
        </label>
        <input
          id="ticket-title"
          v-model="title"
          name="title"
          type="text"
          autocomplete="off"
          class="input-base"
          :placeholder="titlePlaceholder"
          maxlength="100"
        />
      </div>

      <!-- timeline_submit：事件日期 -->
      <div v-if="ticketType === 'timeline_submit'">
        <label for="ticket-event-date" class="mb-1.5 block text-sm font-medium text-ink">
          事件日期
        </label>
        <input
          id="ticket-event-date"
          v-model="eventDate"
          name="eventDate"
          type="date"
          class="input-base"
        />
      </div>

      <!-- report：举报对象类型 + 目标 ID -->
      <template v-if="ticketType === 'report'">
        <div>
          <span class="mb-1.5 block text-sm font-medium text-ink">举报对象类型</span>
          <AppSelect
            v-model="reportTargetType"
            :options="REPORT_SELECT_OPTIONS"
            aria-label="举报对象类型"
          />
        </div>
        <div>
          <label for="ticket-target-id" class="mb-1.5 block text-sm font-medium text-ink">
            目标 ID
          </label>
          <input
            id="ticket-target-id"
            v-model="reportTargetId"
            name="targetId"
            type="text"
            autocomplete="off"
            spellcheck="false"
            class="input-base font-mono text-sm"
            placeholder="被举报对象的 ID…"
          />
        </div>
      </template>

      <!-- permission_request：权限下拉 -->
      <div v-if="ticketType === 'permission_request'">
        <span class="mb-1.5 block text-sm font-medium text-ink">申请权限</span>
        <AppSelect
          v-model="requestedPermission"
          :options="PERMISSION_SELECT_OPTIONS"
          aria-label="申请权限"
        />
      </div>

      <!-- 内容 / 理由 -->
      <div>
        <div class="mb-1.5 flex items-baseline justify-between">
          <label for="ticket-content" class="text-sm font-medium text-ink">
            {{
              ticketType === "appeal"
                ? "申诉理由"
                : ticketType === "account_deletion"
                  ? "注销原因"
                  : "详细说明"
            }}
          </label>
          <span class="text-xs tabular-nums text-ink-muted">{{ content.length }}/2000</span>
        </div>
        <textarea
          id="ticket-content"
          v-model="content"
          name="content"
          rows="5"
          class="input-base min-h-32 resize-y"
          :placeholder="contentPlaceholder"
          maxlength="2000"
        />
      </div>

      <!-- verification：附件链接（可选） -->
      <div v-if="ticketType === 'verification'">
        <label for="ticket-attachment" class="mb-1.5 block text-sm font-medium text-ink">
          附件链接
          <span class="ml-1 text-xs font-normal text-ink-muted">可选</span>
        </label>
        <input
          id="ticket-attachment"
          v-model="attachmentUrl"
          name="attachmentUrl"
          type="url"
          autocomplete="off"
          spellcheck="false"
          class="input-base"
          placeholder="例如 https://…（证明材料链接）"
        />
      </div>

      <!-- 提交 -->
      <button
        type="submit"
        class="w-full !py-2.5 disabled:opacity-50"
        :class="
          ticketType === 'account_deletion'
            ? 'inline-flex items-center justify-center rounded-lg bg-danger px-4 text-sm font-medium text-white pressable hover:opacity-90'
            : 'btn-primary'
        "
        :disabled="submitting || !content.trim()"
      >
        {{ submitting ? "提交中…" : ticketType === "account_deletion" ? "提交注销申请" : "提交工单" }}
      </button>
    </form>
  </div>
</template>
