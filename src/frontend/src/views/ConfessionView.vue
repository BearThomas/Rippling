<!--
  表白墙页 — 瀑布流卡片（骨架实现）

  发布表白墙需 create_confession 权限（登录用户默认拥有）。
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { listConfessions, createConfession } from "../api/confession";
import { formatRelativeTime, formatNumber } from "../utils/format";
import { showToast } from "../utils/toast";
import { useAuthStore } from "../stores/auth";
import type { ConfessionInfo } from "../types";

const auth = useAuthStore();

const loading = ref(true);
const error = ref(false);
const confessions = ref<ConfessionInfo[]>([]);

/** 发布框 */
const draft = ref("");
const submitting = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    confessions.value = await listConfessions();
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

/** 发布表白墙 */
async function handleSubmit(): Promise<void> {
  if (submitting.value) return;
  if (!auth.isLoggedIn) {
    showToast("请先登录", "error");
    return;
  }
  if (!draft.value.trim()) {
    showToast("内容不能为空", "error");
    return;
  }

  submitting.value = true;
  try {
    const created = await createConfession(draft.value.trim());
    confessions.value = [created, ...confessions.value];
    draft.value = "";
    showToast("发布成功", "success");
  } catch {
    // client 已弹错误提示
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="px-3 pt-3">
    <!-- 发布框 -->
    <form class="card-base mb-3" @submit.prevent="handleSubmit">
      <textarea
        v-model="draft"
        class="input-base min-h-20 resize-y"
        placeholder="匿名说出你想说的话…"
      />
      <div class="mt-2 flex justify-end">
        <button type="submit" class="btn-primary !py-1.5 text-sm" :disabled="submitting">
          {{ submitting ? "发布中…" : "发布" }}
        </button>
      </div>
    </form>

    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" @retry="load" />

    <div v-else-if="confessions.length > 0" class="space-y-3">
      <div v-for="item in confessions" :key="item.id" class="card-base">
        <p class="whitespace-pre-line break-all text-sm leading-relaxed">{{ item.content }}</p>
        <div class="mt-3 flex items-center gap-4 text-xs text-ink-soft">
          <span class="flex items-center gap-1">
            <AppSvgIcon name="heart" :size="14" />
            {{ formatNumber(item.likeCount ?? 0) }}
          </span>
          <span class="ml-auto">{{ formatRelativeTime(item.createdAt) }}</span>
        </div>
      </div>
    </div>

    <EmptyState v-else text="还没有表白，来抢沙发" icon="heart" />
  </div>
</template>
