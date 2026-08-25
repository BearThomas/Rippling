<!--
  加载指示器：旋转圆环 + 可选文字
-->
<script setup lang="ts">
withDefaults(defineProps<{ text?: string }>(), { text: "加载中…" });
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 py-10 text-ink-soft">
    <span
      class="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary"
      aria-hidden="true"
    />
    <span class="text-sm">{{ text }}</span>
  </div>
</template>
