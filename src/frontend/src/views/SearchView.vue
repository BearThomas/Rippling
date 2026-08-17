<!--
  搜索页 — 关键词搜索帖子与表白墙（骨架实现）
-->
<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import PostCard from "../components/post/PostCard.vue";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import { search as searchApi } from "../api/search";
import type { SearchResult } from "../api/search";

const route = useRoute();
const router = useRouter();

/** 关键词（支持从 ?q= 进入） */
const keyword = ref((route.query.q as string) ?? "");
const loading = ref(false);
const result = ref<SearchResult | null>(null);

/** 执行搜索 */
async function handleSearch(): Promise<void> {
  const kw = keyword.value.trim();
  if (!kw) return;

  // 同步 URL，便于分享
  router.replace({ query: { q: kw } });

  loading.value = true;
  try {
    result.value = await searchApi(kw);
  } catch {
    result.value = { posts: [], confessions: [] };
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="px-3 pt-3">
    <!-- 搜索框 -->
    <form class="flex gap-2" @submit.prevent="handleSearch">
      <input
        v-model="keyword"
        type="search"
        class="input-base flex-1"
        placeholder="搜索帖子、表白墙…"
        autofocus
      />
      <button type="submit" class="btn-primary shrink-0">搜索</button>
    </form>

    <LoadingSpinner v-if="loading" />

    <template v-else-if="result">
      <!-- 帖子结果 -->
      <section v-if="result.posts.length > 0" class="mt-3 space-y-3">
        <PostCard v-for="post in result.posts" :key="post.id" :post="post" />
      </section>

      <!-- 表白墙结果 -->
      <section v-if="result.confessions.length > 0" class="mt-3 space-y-3">
        <h3 class="px-1 text-sm font-semibold text-ink-soft">表白墙</h3>
        <div v-for="item in result.confessions" :key="item.id" class="card-base">
          <p class="whitespace-pre-line text-sm">{{ item.content }}</p>
        </div>
      </section>

      <EmptyState
        v-if="result.posts.length === 0 && result.confessions.length === 0"
        text="没有找到相关内容"
        icon="search"
      />
    </template>

    <EmptyState v-else text="输入关键词开始搜索" icon="search" />
  </div>
</template>
