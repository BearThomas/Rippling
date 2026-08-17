<!--
  表白墙卡片

  展示匿名表白内容；点赞可交互（/api/like targetType=confession）。
  点击整卡跳转表白墙页面。
-->
<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import AppSvgIcon from "../layout/AppSvgIcon.vue";
import { formatRelativeTime, formatNumber } from "../../utils/format";
import { toggleLike } from "../../api/like";
import { showToast } from "../../utils/toast";
import { useAuthStore } from "../../stores/auth";

const props = defineProps<{
  id: string;
  content: string;
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
  // 未登录 → 引导登录
  if (!auth.isLoggedIn) {
    router.push({ path: "/login", query: { redirect: router.currentRoute.value.fullPath } });
    return;
  }
  if (likeBusy.value) return;
  likeBusy.value = true;
  try {
    const result = await toggleLike("confession", props.id);
    liked.value = result.liked;
    likeCount.value = result.likeCount;
  } catch {
    showToast("点赞失败，请稍后重试", "error");
  } finally {
    likeBusy.value = false;
  }
}

/** 跳转表白详情页 */
function openConfession(): void {
  router.push({ name: "confession-detail", params: { id: props.id } });
}
</script>

<template>
  <article
    class="card-base cursor-pointer transition-opacity active:opacity-80"
    role="button"
    tabindex="0"
    @click="openConfession"
    @keydown.enter="openConfession"
  >
    <!-- 头部：类型标签 + 时间 -->
    <div class="mb-2 flex items-center gap-2">
      <span class="flex items-center gap-1 text-xs font-medium text-accent">
        <AppSvgIcon name="heart" :size="14" />
        表白墙
      </span>
      <span class="ml-auto text-xs text-ink-soft">{{ formatRelativeTime(createdAt) }}</span>
    </div>

    <!-- 内容 -->
    <p class="whitespace-pre-line break-all text-sm leading-relaxed text-ink">
      {{ content }}
    </p>

    <!-- 点赞 -->
    <div class="mt-3 flex items-center gap-4 text-xs text-ink-soft">
      <button
        type="button"
        class="flex items-center gap-1 transition-colors"
        :class="liked ? 'text-accent' : ''"
        @click="onToggleLike"
      >
        <AppSvgIcon name="heart" :size="14" />
        {{ formatNumber(likeCount) }}
      </button>
    </div>
  </article>
</template>
