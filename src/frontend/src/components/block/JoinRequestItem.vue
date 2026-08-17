<!--
  加入申请列表项（板块管理面板）

  展示：申请用户名、申请时间。
  操作：批准 / 拒绝（后端不支持拒绝原因）。

  emit：approve / reject
-->
<script setup lang="ts">
import type { BlockJoinRequestInfo } from "../../api/block";
import { formatDateTime } from "../../utils/format";

defineProps<{
  request: BlockJoinRequestInfo;
  /** 操作进行中（禁用按钮防重复点击） */
  busy?: boolean;
}>();

const emit = defineEmits<{ approve: []; reject: [] }>();
</script>

<template>
  <div class="card-base !py-3">
    <div class="flex items-center gap-2">
      <!-- 头像占位（首字圆形） -->
      <span
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] text-sm font-semibold text-primary"
      >
        {{ (request.username || "?").slice(0, 1) }}
      </span>

      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium">{{ request.username || "未知用户" }}</p>
        <p class="mt-0.5 text-xs text-ink-soft">申请于 {{ formatDateTime(request.createdAt) }}</p>
      </div>

      <div class="flex shrink-0 gap-2">
        <button
          type="button"
          class="btn-primary !px-3 !py-1.5 text-xs"
          :disabled="busy"
          @click="emit('approve')"
        >
          批准
        </button>
        <button
          type="button"
          class="btn-secondary !px-3 !py-1.5 text-xs"
          :disabled="busy"
          @click="emit('reject')"
        >
          拒绝
        </button>
      </div>
    </div>
  </div>
</template>
