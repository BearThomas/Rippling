<!--
  工单创建页（/ticket/create?type=xxx）

  根据 query.type 动态渲染表单，覆盖 7 种工单类型：
    - timeline_submit：大事记标题 / 事件日期（extraData.eventDate）/ 描述
    - block_create：板块名称 / 板块描述
    - report：举报对象类型（query.targetType 预填）/ 目标 ID / 举报原因
    - permission_request：下拉选择白名单权限（title 须含英文权限名）/ 申请理由
    - appeal：申诉理由
    - verification：认证说明 / 附件链接（可选，存 extraData）
    - account_deletion：注销原因（二次确认）

  提交走 api/ticket.ts createTicket，成功后跳「我的工单」。
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { createTicket } from "../api/ticket";
import { showToast } from "../utils/toast";
import type { TicketType } from "../types";

const route = useRoute();
const router = useRouter();

// ============================================================
//  类型配置
// ============================================================

/** 支持的工单类型 → 页面标题与说明 */
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

/** 可申请的权限白名单（与后端 REQUESTABLE_PERMISSIONS 一致；title 须含英文 key） */
const REQUESTABLE_PERMISSIONS = [
  { key: "upload_image", label: "上传图片" },
  { key: "submit_timeline", label: "提交大事记" },
  { key: "create_confession", label: "发布表白" },
  { key: "create_vote", label: "创建投票" },
] as const;

/** 举报对象类型白名单（与后端 REPORT_TARGET_TYPES 一致） */
const REPORT_TARGET_TYPES = [
  { value: "post", label: "帖子" },
  { value: "comment", label: "评论" },
  { value: "confession", label: "表白" },
] as const;

/** 当前工单类型（query.type，非法时为空） */
const ticketType = computed<TicketType | null>(() => {
  const t = route.query.type as string | undefined;
  return t && t in TYPE_META ? (t as TicketType) : null;
});

// ============================================================
//  表单状态
// ============================================================

/** 通用标题 / 内容（部分类型自动生成 title，无需用户输入） */
const title = ref("");
const content = ref("");
/** timeline_submit：事件日期（YYYY-MM-DD） */
const eventDate = ref("");
/** report：对象类型与目标 ID（从 query 预填） */
const reportTargetType = ref<string>((route.query.targetType as string) ?? "post");
const reportTargetId = ref<string>((route.query.targetId as string) ?? "");
/** permission_request：所选权限 key */
const requestedPermission = ref<string>(REQUESTABLE_PERMISSIONS[0].key);
/** verification：附件链接（可选） */
const attachmentUrl = ref("");

const submitting = ref(false);

/** 当前类型是否需要用户输入标题（其余类型自动生成） */
const needsTitleInput = computed(
  () => ticketType.value === "timeline_submit" || ticketType.value === "block_create"
);

/** 标题占位文案 */
const titlePlaceholder = computed(() =>
  ticketType.value === "timeline_submit" ? "大事记标题" : "板块名称"
);

/** 内容占位文案 */
const contentPlaceholder = computed(() => {
  switch (ticketType.value) {
    case "timeline_submit":
      return "大事记描述（发生了什么）";
    case "block_create":
      return "板块描述（主题、定位、规则等）";
    case "report":
      return "举报原因（请尽量提供具体说明）";
    case "permission_request":
      return "申请理由";
    case "appeal":
      return "申诉理由";
    case "verification":
      return "认证说明（你是谁、希望认证什么身份）";
    case "account_deletion":
      return "注销原因";
    default:
      return "";
  }
});

// ============================================================
//  提交
// ============================================================

/** 组装并校验后提交工单 */
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

  // 按类型组装特有字段
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
      // 后端要求 title 中包含英文权限名（批准时据此定位权限位）
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
      if (!window.confirm("确定提交账号注销申请吗？此操作不可撤销。")) return;
      finalTitle = "账号注销申请";
      break;
    }
  }

  // 后端限制：title ≤100、content ≤2000
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
    router.replace({ name: "ticket-list" });
  } catch {
    // client.ts 已自动 Toast
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="px-3 pt-3">
    <!-- 非法类型兜底 -->
    <div v-if="!ticketType" class="card-base text-center text-sm text-ink-soft">
      未知的工单类型，请从应用页入口进入。
    </div>

    <form v-else class="space-y-4" @submit.prevent="handleSubmit">
      <!-- 类型说明 -->
      <div class="card-base">
        <h2 class="text-base font-semibold">{{ TYPE_META[ticketType].heading }}</h2>
        <p class="mt-1 text-xs leading-relaxed text-ink-soft">{{ TYPE_META[ticketType].hint }}</p>
      </div>

      <!-- 标题（仅 timeline_submit / block_create 需要用户输入） -->
      <div v-if="needsTitleInput">
        <label class="mb-1.5 block text-sm font-medium">
          {{ ticketType === "timeline_submit" ? "大事记标题" : "板块名称" }}
        </label>
        <input v-model="title" class="input-base" :placeholder="titlePlaceholder" maxlength="100" />
      </div>

      <!-- timeline_submit：事件日期 -->
      <div v-if="ticketType === 'timeline_submit'">
        <label class="mb-1.5 block text-sm font-medium">事件日期</label>
        <input v-model="eventDate" type="date" class="input-base" />
      </div>

      <!-- report：举报对象类型 + 目标 ID -->
      <template v-if="ticketType === 'report'">
        <div>
          <label class="mb-1.5 block text-sm font-medium">举报对象类型</label>
          <select v-model="reportTargetType" class="input-base">
            <option v-for="t in REPORT_TARGET_TYPES" :key="t.value" :value="t.value">
              {{ t.label }}
            </option>
          </select>
        </div>
        <div>
          <label class="mb-1.5 block text-sm font-medium">目标 ID</label>
          <input v-model="reportTargetId" class="input-base" placeholder="被举报对象的 ID" />
        </div>
      </template>

      <!-- permission_request：权限下拉 -->
      <div v-if="ticketType === 'permission_request'">
        <label class="mb-1.5 block text-sm font-medium">申请权限</label>
        <select v-model="requestedPermission" class="input-base">
          <option v-for="p in REQUESTABLE_PERMISSIONS" :key="p.key" :value="p.key">
            {{ p.label }}（{{ p.key }}）
          </option>
        </select>
      </div>

      <!-- 内容 / 理由 -->
      <div>
        <label class="mb-1.5 block text-sm font-medium">
          {{ ticketType === "appeal" ? "申诉理由" : ticketType === "account_deletion" ? "注销原因" : "详细说明" }}
        </label>
        <textarea
          v-model="content"
          class="input-base min-h-28 resize-y"
          :placeholder="contentPlaceholder"
          maxlength="2000"
        />
        <p class="mt-1 text-right text-[10px] text-ink-soft">{{ content.length }}/2000</p>
      </div>

      <!-- verification：附件链接（可选） -->
      <div v-if="ticketType === 'verification'">
        <label class="mb-1.5 block text-sm font-medium">附件链接（可选）</label>
        <input v-model="attachmentUrl" class="input-base" placeholder="如证明材料链接" />
      </div>

      <!-- 提交 -->
      <button
        type="submit"
        class="btn-primary w-full disabled:opacity-50"
        :disabled="submitting || !content.trim()"
      >
        {{ submitting ? "提交中…" : "提交工单" }}
      </button>
    </form>
  </div>
</template>
