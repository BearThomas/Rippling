<!--
  错误状态：柔和警示图标 + 清晰错误信息 + 重试按钮
-->
<script setup lang="ts">
import AppSvgIcon from "../layout/AppSvgIcon.vue";

withDefaults(
  defineProps<{
    /** 错误信息 */
    message?: string;
    /** 重试按钮文案 */
    retryText?: string;
  }>(),
  { message: "加载失败，请稍后重试", retryText: "重试" }
);

const emit = defineEmits<{ retry: [] }>();
</script>

<template>
  <div class="flex flex-col items-center justify-center px-6 py-14 text-center">
    <span
      class="flex h-11 w-11 items-center justify-center rounded-full bg-danger-soft text-danger"
    >
      <AppSvgIcon name="alertTriangle" :size="20" />
    </span>
    <p class="mt-3 text-sm font-medium text-ink-secondary">{{ message }}</p>
    <button
      type="button"
      class="btn-secondary mt-4 !py-1.5 text-sm"
      @click="emit('retry')"
    >
      {{ retryText }}
    </button>
  </div>
</template>
