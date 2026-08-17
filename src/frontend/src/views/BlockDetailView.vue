<!--
  板块详情页（骨架实现）

  展示板块信息与帖子列表占位；加入 / 管理功能后续任务完善。
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { getBlock, joinBlock } from "../api/block";
import { showToast } from "../utils/toast";
import type { BlockInfo } from "../types";

const route = useRoute();
const blockId = route.params.id as string;

const loading = ref(true);
const error = ref(false);
const block = ref<BlockInfo | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    block.value = await getBlock(blockId);
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

/** 申请加入板块 */
async function handleJoin(): Promise<void> {
  try {
    await joinBlock(blockId);
    showToast("申请已提交，等待审核", "success");
  } catch {
    // client 已弹错误提示
  }
}

onMounted(load);
</script>

<template>
  <div class="px-3 pt-3">
    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" message="板块不存在或无权访问" @retry="load" />

    <template v-else-if="block">
      <!-- 板块信息 -->
      <div class="card-base">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-bold">{{ block.name }}</h2>
          <button
            v-if="!block.isLocked"
            type="button"
            class="btn-primary !py-1.5 text-sm"
            @click="handleJoin"
          >
            申请加入
          </button>
        </div>
        <p v-if="block.description" class="mt-2 text-sm text-ink-soft">
          {{ block.description }}
        </p>
      </div>

      <!-- 帖子列表占位 -->
      <p class="mt-4 px-1 text-sm text-ink-soft">板块帖子列表将在后续任务中完善。</p>
    </template>
  </div>
</template>
