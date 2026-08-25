<!--
  404 页面
-->
<script setup lang="ts">
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
</script>

<template>
  <div class="flex min-h-screen min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
    <AppSvgIcon name="search" :size="48" class="text-ink-soft opacity-40" />
    <h1 class="text-xl font-bold">404</h1>
    <p class="text-sm text-ink-soft">页面不存在或无权访问</p>
    <RouterLink to="/" class="btn-primary mt-2">回到首页</RouterLink>
  </div>
</template>
