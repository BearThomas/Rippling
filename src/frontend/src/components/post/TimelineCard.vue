<!--
  大事记卡片

  展示校园大事记：事件日期、标题、描述、点赞数（可交互）。
  点击整卡跳转大事记页面。
-->
<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import AppSvgIcon from "../layout/AppSvgIcon.vue";
import { formatDate, formatNumber } from "../../utils/format";
import { toggleLike } from "../../api/like";
import { showToast } from "../../utils/toast";
import { useAuthStore } from "../../stores/auth";

const props = defineProps<{
  id: string;
  title: string;
  description: string;
  eventDate: string;
  likeCount: number;
  createdAt: string;
}>();

const router = useRouter();
const auth = useAuthStore();

/** 本地点赞状态（推荐流不返回是否已赞，默认未赞） */
const liked = ref(false);
const likeCount = ref(props.likeCount);
const likeBusy = ref(false);

/** 切换点赞（阻止冒泡，避免触发整卡跳转） */
async function onToggleLike(event: Event): Promise<void> {
  event.stopPropagation();
  if (!auth.isLoggedIn) {
    router.push({ path: "/login", query: { redirect: router.currentRoute.value.fullPath } });
    return;
  }
  if (likeBusy.value) return;
  likeBusy.value = true;
  try {
    const result = await toggleLike("timeline", props.id);
    liked.value = result.liked;
    likeCount.value = result.likeCount;
  } catch {
    showToast("点赞失败，请稍后重试", "error");
  } finally {
    likeBusy.value = false;
  }
}

/** 跳转大事记页面 */
function openTimeline(): void {
  router.push({ name: "timeline" });
}
</script>

<template>
  <article
    class="card-base cursor-pointer transition-opacity active:opacity-80"
    role="button"
    tabindex="0"
    @click="openTimeline"
    @keydown.enter="openTimeline"
  >
    <!-- 头部：类型标签 + 事件日期 -->
    <div class="mb-2 flex items-center gap-2">
      <span class="flex items-center gap-1 text-xs font-medium text-primary">
        <AppSvgIcon name="calendar" :size="14" />
        大事记
      </span>
      <span class="ml-auto text-xs text-ink-soft">{{ formatDate(eventDate) }}</span>
    </div>

    <!-- 标题与描述 -->
    <h3 class="mb-1 text-base font-semibold">{{ title }}</h3>
    <p class="whitespace-pre-line break-all text-sm leading-relaxed text-ink">
      {{ description }}
    </p>

    <!-- 点赞 -->
    <div class="mt-3 flex items-center gap-4 text-xs text-ink-soft">
      <button
        type="button"
        class="flex items-center gap-1 transition-colors"
        :class="liked ? 'text-primary' : ''"
        @click="onToggleLike"
      >
        <AppSvgIcon name="thumbUp" :size="14" />
        {{ formatNumber(likeCount) }}
      </button>
    </div>
  </article>
</template>
