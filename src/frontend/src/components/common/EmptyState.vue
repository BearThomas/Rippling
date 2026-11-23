<!--
  空状态占位：柔和圆形图标容器 + 引导文案 + 可选行动插槽
-->
<script setup lang="ts">
import AppSvgIcon from "../layout/AppSvgIcon.vue";

withDefaults(
  defineProps<{
    /** 主提示文案 */
    text?: string;
    /** 可选补充引导说明 */
    description?: string;
    /** 图标名（AppSvgIcon 字典） */
    icon?: string;
  }>(),
  { text: "暂无内容", description: "", icon: "inbox" }
);
</script>

<template>
  <div class="flex flex-col items-center justify-center px-6 py-12 text-center sm:py-16">
    <span
      class="flex h-12 w-12 items-center justify-center rounded-full bg-hover text-ink-muted"
    >
      <AppSvgIcon :name="icon" :size="22" />
    </span>
    <p class="mt-3.5 text-sm font-medium text-ink-secondary">{{ text }}</p>
    <p v-if="description" class="mt-1 max-w-xs text-xs leading-relaxed text-ink-muted">
      {{ description }}
    </p>
    <div v-if="$slots.default" class="mt-4">
      <slot />
    </div>
  </div>
</template>
