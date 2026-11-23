<!--
  加入申请列表项（板块管理面板 · Elk 紧凑分割行）
-->
<script setup lang="ts">
import type { BlockJoinRequestInfo } from "../../api/block";
import { formatDateTime } from "../../utils/format";
import UserAvatar from "../user/UserAvatar.vue";

defineProps<{
  request: BlockJoinRequestInfo;
  busy?: boolean;
}>();

const emit = defineEmits<{ approve: []; reject: [] }>();
</script>

<template>
  <div class="flex items-center gap-3 border-b border-subtle px-4 py-3 sm:px-5">
    <UserAvatar :name="request.username || '?'" size="md" />

    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium text-ink">
        {{ request.username || "未知用户" }}
      </p>
      <p class="mt-0.5 text-xs tabular-nums text-ink-muted">
        申请于 {{ formatDateTime(request.createdAt) }}
      </p>
    </div>

    <div class="flex shrink-0 items-center gap-2">
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
</template>
