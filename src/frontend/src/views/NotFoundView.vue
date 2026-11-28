<!--
  404 页面
-->
<script setup lang="ts">
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
</script>

<template>
  <main class="mx-auto flex min-h-screen min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
    <span
      class="flex h-14 w-14 items-center justify-center rounded-2xl bg-canvas-soft text-ink-muted"
      aria-hidden="true"
    >
      <AppSvgIcon name="search" :size="26" />
    </span>
    <h1 class="mt-1 text-2xl font-bold tracking-tight tabular-nums text-ink">404</h1>
    <p class="text-sm leading-relaxed text-ink-muted">
      页面不存在，或当前账号无权访问该资源。
    </p>
    <RouterLink to="/" class="btn-primary mt-3 !px-5">
      回到首页
    </RouterLink>
  </main>
</template>
