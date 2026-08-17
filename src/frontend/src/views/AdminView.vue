<!--
  管理面板页（骨架实现）

  展示面板聚合信息；用户管理 / 数据库 / 归档等模块后续任务完善。
  无 access_admin_panel 权限时后端返回 404，页面展示相应提示。
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { getAdminSummary } from "../api/admin";
import type { AdminSummary } from "../api/admin";

const loading = ref(true);
const error = ref<string | null>(null);
const summary = ref<AdminSummary | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    summary.value = await getAdminSummary();
  } catch (err) {
    error.value =
      err instanceof Error && err.message.includes("404")
        ? "资源不存在或无权访问"
        : "加载失败，请稍后重试";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="px-3 pt-3">
    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" :message="error" @retry="load" />

    <template v-else-if="summary">
      <!-- 数据概览 -->
      <div class="grid grid-cols-2 gap-3">
        <div class="card-base text-center">
          <p class="text-2xl font-bold text-primary">{{ summary.totalUsers }}</p>
          <p class="mt-1 text-xs text-ink-soft">用户</p>
        </div>
        <div class="card-base text-center">
          <p class="text-2xl font-bold text-primary">{{ summary.totalPosts }}</p>
          <p class="mt-1 text-xs text-ink-soft">帖子</p>
        </div>
        <div class="card-base text-center">
          <p class="text-2xl font-bold text-primary">{{ summary.totalComments }}</p>
          <p class="mt-1 text-xs text-ink-soft">评论</p>
        </div>
        <div class="card-base text-center">
          <p class="text-2xl font-bold text-primary">{{ summary.totalConfessions }}</p>
          <p class="mt-1 text-xs text-ink-soft">表白墙</p>
        </div>
        <div class="card-base text-center">
          <p class="text-2xl font-bold text-primary">{{ summary.totalTickets }}</p>
          <p class="mt-1 text-xs text-ink-soft">工单</p>
        </div>
        <div class="card-base text-center">
          <p class="text-2xl font-bold text-primary">{{ summary.totalBlocks }}</p>
          <p class="mt-1 text-xs text-ink-soft">板块</p>
        </div>
      </div>

      <!-- 最近工单 -->
      <section class="mt-3">
        <h3 class="mb-2 px-1 text-sm font-semibold text-ink-soft">最近工单</h3>
        <div class="space-y-3">
          <RouterLink
            v-for="ticket in summary.recentTickets"
            :key="ticket.id"
            :to="{ name: 'ticket-detail', params: { id: ticket.id } }"
            class="card-base block transition-opacity active:opacity-80"
          >
            <p class="truncate text-sm font-medium">[{{ ticket.type }}] {{ ticket.title }}</p>
            <p class="mt-1 text-xs text-ink-soft">{{ ticket.status === "open" ? "待处理" : "已关闭" }}</p>
          </RouterLink>
        </div>
      </section>
    </template>
  </div>
</template>
