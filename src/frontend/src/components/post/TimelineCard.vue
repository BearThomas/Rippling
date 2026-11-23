<!--
  大事记信息流行（Elk 无边框 1px 分割线风格）

  展示事件日期、标题、摘要与点赞交互；点击整行进详情页。
-->
<script setup lang="ts">
import { shallowRef } from "vue";
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

const liked = shallowRef(false);
const likeCount = shallowRef(props.likeCount);
const likeBusy = shallowRef(false);

async function onToggleLike(event: Event): Promise<void> {
  event.stopPropagation();
  if (!auth.isLoggedIn) {
    void router.push({ path: "/login", query: { redirect: router.currentRoute.value.fullPath } });
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

function openTimeline(): void {
  void router.push({ name: "timeline-detail", params: { id: props.id } });
}
</script>

<template>
  <article
    class="feed-row-interactive"
    role="button"
    tabindex="0"
    @click="openTimeline"
    @keydown.enter="openTimeline"
  >
    <!-- 头部：轻量分类胶囊 + 事件日期 -->
    <div class="flex items-center gap-2">
      <span class="tag-pill-accent">
        <AppSvgIcon name="calendar" :size="12" />
        大事记
      </span>
      <time
        class="ml-auto shrink-0 text-xs font-medium tabular-nums text-ink-muted"
        :datetime="eventDate"
      >
        {{ formatDate(eventDate) }}
      </time>
    </div>

    <!-- 标题与描述 -->
    <h3 class="mt-2 line-clamp-2 text-[15px] font-semibold leading-[22px] text-ink sm:text-base">
      {{ title }}
    </h3>
    <p class="mt-1 line-clamp-3 break-words text-sm leading-6 text-ink-secondary">
      {{ description }}
    </p>

    <!-- 底部操作栏 -->
    <div class="mt-2.5 flex items-center gap-5 text-xs tabular-nums text-ink-muted">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md py-0.5 hover:text-primary pressable"
        :class="liked ? 'font-medium text-primary' : ''"
        :disabled="likeBusy"
        @click="onToggleLike"
      >
        <AppSvgIcon name="thumbUp" :size="15" />
        {{ formatNumber(likeCount) }}
      </button>
    </div>
  </article>
</template>
