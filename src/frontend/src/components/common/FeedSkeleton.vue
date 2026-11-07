<!--
  推荐流骨架

  转圈的问题是"让你盯着它等"，骨架是"先把形状给你看"——同样的等待时间，
  后者感觉快一截。形状照着 FeedItem 的卡片来（头像 + 两行标题 + 三行正文），
  所以内容真出来的时候位置几乎不跳。

  只在 opacity 上呼吸（见 main.css 的 .skeleton），不跑 GPU 填充率。
-->
<script setup lang="ts">
withDefaults(defineProps<{ count?: number }>(), { count: 3 });
</script>

<template>
  <div class="space-y-3" aria-hidden="true">
    <div v-for="i in count" :key="i" class="card-base">
      <div class="flex items-center gap-2">
        <div class="skeleton h-7 w-7 shrink-0 rounded-full"></div>
        <div class="skeleton h-3 w-20 rounded"></div>
      </div>
      <div class="mt-3 space-y-2">
        <div class="skeleton h-3.5 w-3/4 rounded"></div>
        <div class="skeleton h-3 w-full rounded"></div>
        <div class="skeleton h-3 w-2/3 rounded"></div>
      </div>
    </div>
  </div>
</template>
