<!--
  信息流骨架屏（支持 Elk 分割线流与 Memos 轻白卡流双形态）

  仅在 opacity 上呼吸（见 main.css .skeleton），不触发重排、不耗 GPU 填充率。
-->
<script setup lang="ts">
withDefaults(
  defineProps<{
    count?: number;
    /** elk = 无边框 1px 分割线流；memos = 柔和底上的圆角轻白卡 */
    variant?: "elk" | "memos";
  }>(),
  { count: 4, variant: "elk" }
);
</script>

<template>
  <!-- Elk 无边框信息流骨架 -->
  <div v-if="variant === 'elk'" aria-hidden="true">
    <div v-for="i in count" :key="i" class="feed-row">
      <div class="flex items-center gap-2.5">
        <div class="skeleton h-8 w-8 shrink-0 rounded-full" />
        <div class="flex-1 space-y-1.5">
          <div class="skeleton h-3.5 w-24 rounded" />
          <div class="skeleton h-2.5 w-16 rounded" />
        </div>
      </div>
      <div class="mt-3 space-y-2">
        <div class="skeleton h-4 w-3/5 rounded" />
        <div class="skeleton h-3.5 w-full rounded" />
        <div class="skeleton h-3.5 w-4/5 rounded" />
      </div>
      <div class="mt-3.5 flex items-center gap-5">
        <div class="skeleton h-3 w-10 rounded" />
        <div class="skeleton h-3 w-10 rounded" />
      </div>
    </div>
  </div>

  <!-- Memos 轻白卡骨架 -->
  <div v-else class="space-y-3" aria-hidden="true">
    <div v-for="i in count" :key="i" class="memo-card">
      <div class="flex items-center justify-between gap-2">
        <div class="skeleton h-3.5 w-20 rounded-full" />
        <div class="skeleton h-3 w-14 rounded" />
      </div>
      <div class="mt-3 space-y-2">
        <div class="skeleton h-3.5 w-full rounded" />
        <div class="skeleton h-3.5 w-5/6 rounded" />
        <div class="skeleton h-3.5 w-2/3 rounded" />
      </div>
      <div class="mt-3.5 flex items-center gap-4">
        <div class="skeleton h-3 w-10 rounded" />
        <div class="skeleton h-3 w-10 rounded" />
      </div>
    </div>
  </div>
</template>
