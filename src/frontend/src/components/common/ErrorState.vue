<!--
  错误状态：错误信息 + 重试按钮
-->
<script setup lang="ts">
withDefaults(
  defineProps<{
    /** 错误信息 */
    message?: string;
  }>(),
  { message: "加载失败，请稍后重试" }
);

const emit = defineEmits<{ retry: [] }>();
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 py-14">
    <p class="text-sm text-ink-soft">{{ message }}</p>
    <button type="button" class="btn-secondary !py-1.5 text-sm" @click="emit('retry')">
      重试
    </button>
  </div>
</template>
