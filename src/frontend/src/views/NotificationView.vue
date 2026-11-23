<!--
  通知中心（Elk 顶部类型筛选 AppTabs + 无边框紧凑分割行）

  服务器只存未读通知；点击条目跳转对应内容并删除（已读），
  也可单条删除或一键全部已读（后端无批量接口，循环删除）。
-->
<script setup lang="ts">
import { computed, onMounted, shallowRef } from "vue";
import { useRouter } from "vue-router";
import type { RouteLocationRaw } from "vue-router";
import FeedSkeleton from "../components/common/FeedSkeleton.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import AppTabs, { type TabOption } from "../components/common/AppTabs.vue";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import NotificationItem from "../components/notification/NotificationItem.vue";
import { useNotificationStore } from "../stores/notification";
import { showToast } from "../utils/toast";
import type { NotificationInfo } from "../types";

type NotificationFilter = "all" | "comment" | "follow" | "system";

const router = useRouter();
const notification = useNotificationStore();

const loading = shallowRef(true);
const error = shallowRef(false);
const markingAll = shallowRef(false);
const activeFilter = shallowRef<NotificationFilter>("all");

/** 按类型统计计数与前端筛选结果 */
const commentItems = computed(() =>
  notification.notifications.filter((n) => n.type === "comment")
);
const followItems = computed(() =>
  notification.notifications.filter((n) => n.type === "follow")
);
const systemItems = computed(() =>
  notification.notifications.filter((n) => n.type !== "comment" && n.type !== "follow")
);

const filteredNotifications = computed<NotificationInfo[]>(() => {
  switch (activeFilter.value) {
    case "comment":
      return commentItems.value;
    case "follow":
      return followItems.value;
    case "system":
      return systemItems.value;
    default:
      return notification.notifications;
  }
});

const filterTabs = computed<TabOption[]>(() => [
  {
    value: "all",
    label: "全部",
    count: notification.notifications.length || undefined,
  },
  {
    value: "comment",
    label: "回复",
    count: commentItems.value.length || undefined,
  },
  {
    value: "follow",
    label: "关注",
    count: followItems.value.length || undefined,
  },
  {
    value: "system",
    label: "系统",
    count: systemItems.value.length || undefined,
  },
]);

const emptyHint = computed(() => {
  switch (activeFilter.value) {
    case "comment":
      return "暂无新的评论回复通知";
    case "follow":
      return "暂无新的关注通知";
    case "system":
      return "暂无系统通知";
    default:
      return "暂无未读通知";
  }
});

function onFilterChange(val: string): void {
  if (val === "comment" || val === "follow" || val === "system") {
    activeFilter.value = val;
  } else {
    activeFilter.value = "all";
  }
}

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
  if (target) void router.push(target);
  try {
    await notification.markRead(item.id);
  } catch {
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

onMounted(() => {
  void load();
});
</script>

<template>
  <div>
    <!-- 顶部前端类型筛选 AppTabs -->
    <AppTabs
      :model-value="activeFilter"
      :items="filterTabs"
      variant="underline"
      stretch
      aria-label="通知类型筛选"
      @update:model-value="onFilterChange"
    />

    <FeedSkeleton v-if="loading" variant="elk" :count="5" />
    <div v-else-if="error" class="px-4 py-6">
      <ErrorState @retry="load" />
    </div>

    <template v-else>
      <!-- 工具条：未读汇总 + 全部已读 -->
      <div
        v-if="notification.notifications.length > 0"
        class="flex items-center justify-between border-b border-subtle bg-canvas-soft px-4 py-2 sm:px-5"
      >
        <span class="text-xs tabular-nums text-ink-muted">
          共 {{ notification.notifications.length }} 条未读
        </span>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-accent-soft pressable disabled:opacity-50"
          :disabled="markingAll"
          @click="handleMarkAll"
        >
          <AppSvgIcon name="check" :size="13" />
          <span>{{ markingAll ? "处理中…" : "全部已读" }}</span>
        </button>
      </div>

      <!-- 通知列表（Elk 紧凑分割行） -->
      <ul v-if="filteredNotifications.length > 0" role="list" class="pb-6">
        <NotificationItem
          v-for="item in filteredNotifications"
          :key="item.id"
          :notification="item"
          @click="handleOpen(item)"
          @delete="handleDelete(item)"
        />
      </ul>

      <div v-else class="px-4 py-6">
        <EmptyState :text="emptyHint" icon="bell" />
      </div>
    </template>
  </div>
</template>
