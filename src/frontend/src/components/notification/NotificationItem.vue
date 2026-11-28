<!--
  通知列表项（Elk 无边框紧凑分割行）

  按通知类型显示语义图标（评论 / 关注 / 系统）；
  左侧主体按钮点击跳转并已读，右侧独立删除按钮仅标记已读（避免交互元素嵌套）。
-->
<script setup lang="ts">
import { computed } from "vue";
import AppSvgIcon from "../layout/AppSvgIcon.vue";
import { formatRelativeTime } from "../../utils/format";
import type { NotificationInfo } from "../../types";

const props = defineProps<{
  notification: NotificationInfo;
}>();

const emit = defineEmits<{
  /** 点击条目（跳转 + 已读） */
  click: [];
  /** 点击删除按钮（仅删除，不跳转） */
  delete: [];
}>();

/** 类型 → 图标与语义底色映射 */
const typeMeta = computed(() => {
  switch (props.notification.type) {
    case "comment":
      return {
        icon: "comment",
        badgeClass: "bg-accent-soft text-primary",
        label: "互动回复",
      };
    case "follow":
      return {
        icon: "user",
        badgeClass: "bg-accent-warm-soft text-accent-warm",
        label: "新增关注",
      };
    default:
      return {
        icon: "bell",
        badgeClass: "bg-hover text-ink-secondary",
        label: "系统通知",
      };
  }
});
</script>

<template>
  <li
    class="flex items-start gap-2 border-b border-subtle px-4 py-3.5 transition-colors hover:bg-hover sm:px-5"
  >
    <button
      type="button"
      class="flex min-w-0 flex-1 items-start gap-3 text-left pressable"
      @click="emit('click')"
    >
      <span
        class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        :class="typeMeta.badgeClass"
        aria-hidden="true"
      >
        <AppSvgIcon :name="typeMeta.icon" :size="15" />
      </span>

      <span class="min-w-0 flex-1">
        <span class="block text-sm leading-relaxed text-ink break-words">
          {{ notification.content }}
        </span>
        <span class="mt-1 flex items-center gap-2 text-xs text-ink-muted">
          <span>{{ typeMeta.label }}</span>
          <span aria-hidden="true">·</span>
          <time :datetime="notification.createdAt" class="tabular-nums">
            {{ formatRelativeTime(notification.createdAt) }}
          </time>
        </span>
      </span>
    </button>

    <!-- 删除（已读）按钮 -->
    <button
      type="button"
      class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-canvas-soft hover:text-ink pressable"
      aria-label="标记已读并移除通知"
      @click="emit('delete')"
    >
      <AppSvgIcon name="close" :size="15" />
    </button>
  </li>
</template>
