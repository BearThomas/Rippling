<!--
  板块页 — Elk 轻量 2 列目录网格

  保留 data-tour="blocks-list"；包含「我的板块」与「推荐板块」，
  桌面/平板为 2 列简洁网格，移动端单列铺满。
-->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import { useRouter } from "vue-router";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import BlockCard from "../components/block/BlockCard.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { getBlockList, getMyBlocks, getMyPendingRequests, joinBlock } from "../api/block";
import { showToast } from "../utils/toast";
import type { BlockInfo } from "../types";

const router = useRouter();

const loading = shallowRef(true);
const error = shallowRef(false);

const myBlocks = ref<BlockInfo[]>([]);
const recommendBlocks = ref<BlockInfo[]>([]);
const pendingBlockIds = ref<Set<string>>(new Set());
const applyingId = shallowRef<string | null>(null);

function stableShuffle(blocks: BlockInfo[]): BlockInfo[] {
  const dayKey = new Date().toISOString().slice(0, 10);
  const weight = (id: string): number => {
    const s = `${id}:${dayKey}`;
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return h;
  };
  return [...blocks].sort((a, b) => weight(a.id) - weight(b.id));
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    const [mine, all, pending] = await Promise.all([
      getMyBlocks(),
      getBlockList(),
      getMyPendingRequests(),
    ]);

    myBlocks.value = mine;
    pendingBlockIds.value = new Set(pending);

    const joinedIds = new Set(mine.map((b) => b.id));
    const candidates = all.filter((b) => !joinedIds.has(b.id) && !b.isLocked);
    recommendBlocks.value = stableShuffle(candidates);
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

async function handleJoin(block: BlockInfo): Promise<void> {
  if (applyingId.value) return;
  applyingId.value = block.id;
  try {
    await joinBlock(block.id);
    pendingBlockIds.value.add(block.id);
    showToast("申请已提交，等待审核", "success");
  } catch {
    // client.ts 已自动 Toast
  } finally {
    applyingId.value = null;
  }
}

function goSearch(): void {
  void router.push({ name: "search" });
}

const hasAnyBlock = computed(() => myBlocks.value.length > 0 || recommendBlocks.value.length > 0);

onMounted(load);
</script>

<template>
  <div data-tour="blocks-list" class="px-4 py-4 sm:px-5">
    <!-- 搜索入口 -->
    <button
      type="button"
      class="mb-5 flex w-full items-center gap-2.5 rounded-full border border-subtle bg-canvas-soft px-4 py-2.5 text-sm text-ink-muted hover:border-strong hover:text-ink-secondary pressable"
      @click="goSearch"
    >
      <AppSvgIcon name="search" :size="16" class="shrink-0" />
      <span>搜索板块、帖子…</span>
    </button>

    <!-- 网格骨架屏 -->
    <div v-if="loading" class="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-hidden="true">
      <div v-for="i in 4" :key="i" class="rounded-xl border border-subtle bg-surface p-4">
        <div class="flex items-center gap-3">
          <div class="skeleton h-9 w-9 shrink-0 rounded-lg" />
          <div class="flex-1 space-y-2">
            <div class="skeleton h-3.5 w-24 rounded" />
            <div class="skeleton h-3 w-4/5 rounded" />
          </div>
        </div>
        <div class="mt-4 flex items-center justify-between border-t border-subtle pt-2.5">
          <div class="skeleton h-3 w-16 rounded" />
          <div class="skeleton h-4 w-12 rounded" />
        </div>
      </div>
    </div>

    <ErrorState v-else-if="error" @retry="load" />

    <template v-else>
      <!-- 我的板块 -->
      <section v-if="myBlocks.length > 0" class="mb-6">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-ink">
            我的板块
            <span class="ml-1 font-normal tabular-nums text-ink-muted">
              {{ myBlocks.length }}
            </span>
          </h2>
          <RouterLink
            to="/ticket/create?type=block_create"
            class="text-xs font-medium text-primary hover:underline"
          >
            申请建板
          </RouterLink>
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <BlockCard v-for="block in myBlocks" :key="block.id" :block="block" mode="mine" />
        </div>
      </section>

      <EmptyState
        v-else-if="hasAnyBlock"
        icon="blocks"
        text="还没有加入板块"
        description="从下方推荐板块挑一个感兴趣的加入吧。"
      />

      <!-- 推荐板块 -->
      <section v-if="recommendBlocks.length > 0">
        <h2 class="mb-3 text-sm font-semibold text-ink">
          发现板块
          <span class="ml-1 font-normal tabular-nums text-ink-muted">
            {{ recommendBlocks.length }}
          </span>
        </h2>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <BlockCard
            v-for="block in recommendBlocks"
            :key="block.id"
            :block="block"
            mode="recommend"
            :applied="pendingBlockIds.has(block.id)"
            :applying="applyingId === block.id"
            @join="handleJoin(block)"
          />
        </div>
      </section>

      <EmptyState v-if="!hasAnyBlock" icon="blocks" text="还没有板块" />
    </template>
  </div>
</template>
