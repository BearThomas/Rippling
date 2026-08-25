<!--
  通知中心

  服务器只存未读通知；点击条目跳转对应内容并删除（已读），
  也可单条删除或一键全部已读（后端无批量接口，循环删除）。
  历史已读通知本任务先简化为删除即消失（后续任务接本地存储）。
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type { RouteLocationRaw } from "vue-router";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import NotificationItem from "../components/notification/NotificationItem.vue";
import { useNotificationStore } from "../stores/notification";
import { showToast } from "../utils/toast";
import type { NotificationInfo } from "../types";

const router = useRouter();
const notification = useNotificationStore();

const loading = ref(true);
const error = ref(false);
const markingAll = ref(false);

/** 拉取未读通知列表 */
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

/**
 * 解析通知跳转目标
 *
 * comment：按 targetType 跳帖子 / 评论 / 大事记详情；
 * follow：后端 targetId 存的是被关注者（即收件人自己），跳本人主页；
 * system：无跳转。
 */
function resolveTarget(item: NotificationInfo): RouteLocationRaw | null {
  if (!item.targetId) return null;
  if (item.type === "comment") {
    switch (item.targetType) {
      case "post":
        return { name: "post-detail", params: { id: item.targetId } };
      case "comment":
        return { name: "comment-detail", params: { id: item.targetId } };
      case "timeline":
        return { name: "timeline-detail", params: { id: item.targetId } };
      default:
        return null;
    }
  }
  if (item.type === "follow") {
    return { name: "user-profile", params: { id: item.targetId } };
  }
  return null;
}

/** 点击通知：先跳转再删除（删除失败不阻塞跳转） */
async function handleOpen(item: NotificationInfo): Promise<void> {
  const target = resolveTarget(item);
  if (target) router.push(target);
  try {
    await notification.markRead(item.id);
  } catch {
    // 删除失败（如已被删除）→ 本地移除兜底
    notification.removeLocal(item.id);
  }
}

/** 单条删除（不跳转） */
async function handleDelete(item: NotificationInfo): Promise<void> {
  try {
    await notification.markRead(item.id);
  } catch {
    notification.removeLocal(item.id);
  }
}

/** 全部已读（循环调用单条删除） */
async function handleMarkAll(): Promise<void> {
  if (markingAll.value || notification.notifications.length === 0) return;
  markingAll.value = true;
  try {
    await notification.markAllRead();
    showToast("已全部标记为已读", "success");
  } finally {
    markingAll.value = false;
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
        <button
          type="button"
          class="text-sm text-primary disabled:opacity-50"
          :disabled="markingAll"
          @click="handleMarkAll"
        >
          {{ markingAll ? "处理中…" : "全部已读" }}
        </button>
      </div>

      <!-- 通知列表 -->
      <div class="space-y-3">
        <NotificationItem
          v-for="item in notification.notifications"
          :key="item.id"
          :notification="item"
          @click="handleOpen(item)"
          @delete="handleDelete(item)"
        />
      </div>

      <EmptyState
        v-if="notification.notifications.length === 0"
        text="暂无通知"
        icon="bell"
      />
    </template>
  </div>
</template>
