<!--
  首页 — 推荐流

  当前为骨架实现：拉取推荐流，展示 loading / 错误 / 空状态与帖子卡片列表。
  推荐算法调优与无限滚动在后续 Task 24 完善。
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import PostCard from "../components/post/PostCard.vue";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { getRecommendFeed } from "../api/recommend";
import type { PostInfo } from "../types";

const loading = ref(true);
const error = ref(false);
const pinned = ref<PostInfo[]>([]);
const posts = ref<PostInfo[]>([]);

/** 拉取推荐流 */
async function loadFeed(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    const feed = await getRecommendFeed();
    pinned.value = feed.pinned ?? [];
    posts.value = feed.posts ?? [];
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(loadFeed);
</script>

<template>
  <div class="space-y-3 px-3 pt-3">
    <LoadingSpinner v-if="loading" />

    <ErrorState v-else-if="error" @retry="loadFeed" />

    <template v-else>
      <!-- 置顶区 -->
      <section v-if="pinned.length > 0" class="space-y-3">
        <PostCard v-for="post in pinned" :key="post.id" :post="post" />
      </section>

      <!-- 推荐帖子 -->
      <section v-if="posts.length > 0" class="space-y-3">
        <PostCard v-for="post in posts" :key="post.id" :post="post" />
      </section>

      <!-- 空状态 -->
      <EmptyState
        v-if="pinned.length === 0 && posts.length === 0"
        text="还没有内容，来发布第一篇帖子吧"
      />
    </template>
  </div>
</template>
