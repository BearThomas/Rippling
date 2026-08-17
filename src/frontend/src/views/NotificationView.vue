<!--
  通知页 — 未读通知列表

  服务器只存未读通知；点击条目即已读（删除），可一键全部已读。
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { useNotificationStore } from "../stores/notification";
import { formatRelativeTime } from "../utils/format";

const notification = useNotificationStore();
const loading = ref(true);
const error = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    await notification.loadNotifications();
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="px-3 pt-3">
    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" @retry="load" />

    <template v-else>
      <!-- 全部已读 -->
      <div v-if="notification.notifications.length > 0" class="mb-3 flex justify-end">
        <button type="button" class="text-sm text-primary" @click="notification.markAllRead()">
          全部已读
        </button>
      </div>

      <div class="space-y-3">
        <button
          v-for="item in notification.notifications"
          :key="item.id"
          type="button"
          class="card-base block w-full text-left transition-opacity active:opacity-80"
          @click="notification.markRead(item.id)"
        >
          <p class="text-sm leading-relaxed">{{ item.content }}</p>
          <p class="mt-2 text-xs text-ink-soft">
            {{ formatRelativeTime(item.createdAt) }}
          </p>
        </button>
      </div>

      <EmptyState
        v-if="notification.notifications.length === 0"
        text="没有未读通知"
        icon="bell"
      />
    </template>
  </div>
</template>
