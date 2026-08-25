<!--
  空状态占位：图标 + 文案（列表无数据时展示）
-->
<script setup lang="ts">
import AppSvgIcon from "../layout/AppSvgIcon.vue";

withDefaults(
  defineProps<{
    /** 提示文案 */
    text?: string;
    /** 图标名（AppSvgIcon 字典） */
    icon?: string;
  }>(),
  { text: "暂无内容", icon: "inbox" }
);
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 py-8 sm:py-12 text-ink-soft">
    <AppSvgIcon :name="icon" :size="40" class="opacity-40" />
    <p class="text-sm">{{ text }}</p>
  </div>
</template>
