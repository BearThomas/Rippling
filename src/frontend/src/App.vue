<!--
  应用根组件

  提供 RouterView 出口与全局 ConfirmDialog 挂载点；
  主布局（侧栏 / 顶栏 / 右栏 / 底栏）由 AppLayout 在主布局路由中承载，
  登录 / 注册 / 初始化 / 404 页不套主布局。
-->
<script setup lang="ts">
import ConfirmDialog from "./components/common/ConfirmDialog.vue";
</script>

<template>
  <RouterView />
  <ConfirmDialog />
</template>
