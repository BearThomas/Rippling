<!--
  通知列表项

  按通知类型显示图标（评论 / 关注 / 系统）；
  点击条目跳转对应内容，右侧删除按钮直接已读。
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

/** 类型 → 图标映射（未知类型按系统通知处理） */
const icon = computed(() => {
  switch (props.notification.type) {
    case "comment":
      return "comment";
    case "follow":
      return "user";
    default:
      return "bell";
  }
});

/** 类型 → 图标底色（仅用预设令牌支持的颜色） */
const iconClass = computed(() => {
  switch (props.notification.type) {
    case "comment":
      return "text-primary";
    case "follow":
      return "text-accent";
    default:
      return "text-ink-soft";
  }
});
</script>

<template>
  <div
    class="card-base flex cursor-pointer items-start gap-3 transition-opacity active:opacity-80"
    role="button"
    @click="emit('click')"
  >
    <span class="mt-0.5 shrink-0">
      <AppSvgIcon :name="icon" :size="18" :class="iconClass" />
    </span>

    <div class="min-w-0 flex-1">
      <p class="text-sm leading-relaxed">{{ notification.content }}</p>
      <p class="mt-1 text-xs text-ink-soft">
        {{ formatRelativeTime(notification.createdAt) }}
      </p>
    </div>

    <!-- 删除（已读）按钮 -->
    <button
      type="button"
      class="shrink-0 p-1 text-ink-soft transition-opacity active:opacity-60"
      aria-label="删除通知"
      @click.stop="emit('delete')"
    >
      <AppSvgIcon name="close" :size="16" />
    </button>
  </div>
</template>
