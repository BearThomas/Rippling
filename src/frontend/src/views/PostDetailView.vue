<!--
  帖子详情页（骨架实现）

  展示帖子正文（Markdown 渲染）与评论列表占位，
  评论交互 / 点赞 / 举报等后续任务完善。
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import MarkdownRenderer from "../components/markdown/MarkdownRenderer.vue";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import ErrorState from "../components/common/ErrorState.vue";
import EmptyState from "../components/common/EmptyState.vue";
import { getPost, getComments } from "../api/post";
import { formatDateTime } from "../utils/format";
import type { PostInfo } from "../types";

const route = useRoute();
const postId = route.params.id as string;

const loading = ref(true);
const error = ref(false);
const post = ref<PostInfo | null>(null);
const comments = ref<PostInfo[]>([]);

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    post.value = await getPost(postId);
    comments.value = await getComments(postId);
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
    <ErrorState v-else-if="error" message="帖子不存在或无权访问" @retry="load" />

    <template v-else-if="post">
      <!-- 正文 -->
      <article class="card-base">
        <h2 v-if="post.title" class="mb-2 text-lg font-bold">{{ post.title }}</h2>
        <div class="mb-3 text-xs text-ink-soft">
          {{ formatDateTime(post.createdAt) }}
        </div>
        <MarkdownRenderer :content="post.content" />
      </article>

      <!-- 评论区 -->
      <section class="mt-3 space-y-3">
        <h3 class="px-1 text-sm font-semibold text-ink-soft">评论</h3>
        <div v-for="comment in comments" :key="comment.id" class="card-base">
          <MarkdownRenderer :content="comment.content" />
          <div class="mt-2 text-xs text-ink-soft">{{ formatDateTime(comment.createdAt) }}</div>
        </div>
        <EmptyState v-if="comments.length === 0" text="还没有评论" icon="comment" />
      </section>
    </template>
  </div>
</template>
