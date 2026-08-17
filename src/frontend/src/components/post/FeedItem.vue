<!--
  推荐流内容项分发组件

  根据 item.type 渲染对应卡片：
    post → PostCard / confession → ConfessionCard /
    timeline → TimelineCard / vote → VoteCard
-->
<script setup lang="ts">
import PostCard from "./PostCard.vue";
import ConfessionCard from "./ConfessionCard.vue";
import TimelineCard from "./TimelineCard.vue";
import VoteCard from "./VoteCard.vue";
import type { RecommendItem } from "../../types";

defineProps<{ item: RecommendItem }>();
</script>

<template>
  <PostCard v-if="item.type === 'post'" :post="item.data" />
  <ConfessionCard v-else-if="item.type === 'confession'" v-bind="item.data" />
  <TimelineCard v-else-if="item.type === 'timeline'" v-bind="item.data" />
  <VoteCard v-else v-bind="item.data" />
</template>
