<!--
  板块页 — 板块列表（骨架实现）

  展示全部板块，点击进入板块详情；详细交互后续任务完善。
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { listBlocks } from "../api/block";
import type { BlockInfo } from "../types";

const loading = ref(true);
const error = ref(false);
const blocks = ref<BlockInfo[]>([]);

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    blocks.value = await listBlocks();
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
    <ErrorState v-else-if="error" @retry="load" />

    <div v-else-if="blocks.length > 0" class="space-y-3">
      <RouterLink
        v-for="block in blocks"
        :key="block.id"
        :to="{ name: 'block-detail', params: { id: block.id } }"
        class="card-base block transition-opacity active:opacity-80"
      >
        <div class="flex items-center justify-between">
          <h3 class="font-semibold">{{ block.name }}</h3>
          <span v-if="block.isLocked" class="text-xs text-ink-soft">已锁定</span>
        </div>
        <p v-if="block.description" class="mt-1 text-sm text-ink-soft">
          {{ block.description }}
        </p>
      </RouterLink>
    </div>

    <EmptyState v-else text="还没有板块" />
  </div>
</template>
