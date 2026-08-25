<!--
  板块页 — 板块列表

  页面结构：
    1. 顶部搜索框：点击跳转搜索页
    2. "我的板块"：当前用户已加入的板块（GET /api/block/my）
    3. "推荐板块"：未加入的板块（全部板块 - 已加入，过滤锁定板块，
       稳定随机排序），卡片带"申请加入 / 已申请"按钮
    4. 未加入任何板块时显示空状态提示

  黑名单说明：后端 join 接口会拦截黑名单用户；被拉黑用户看不到推荐板块中
  的申请入口由后端 join 返回 404 兜底（零信任）。
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import BlockCard from "../components/block/BlockCard.vue";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { getBlockList, getMyBlocks, getMyPendingRequests, joinBlock } from "../api/block";
import { showToast } from "../utils/toast";
import type { BlockInfo } from "../types";

const router = useRouter();

// ------------------------------------------------------------
//  状态
// ------------------------------------------------------------

const loading = ref(true);
const error = ref(false);

/** 我加入的板块 */
const myBlocks = ref<BlockInfo[]>([]);
/** 推荐板块（未加入） */
const recommendBlocks = ref<BlockInfo[]>([]);
/** 我的待审申请所属板块 ID 集合 */
const pendingBlockIds = ref<Set<string>>(new Set());
/** 正在申请中的板块 ID（防重复点击） */
const applyingId = ref<string | null>(null);

/** 稳定随机排序：按 (板块 ID + 当天日期) 生成哈希权重，一天内顺序稳定 */
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

// ------------------------------------------------------------
//  数据加载
// ------------------------------------------------------------

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    // 三个请求并发拉取，减少白屏时间
    const [mine, all, pending] = await Promise.all([
      getMyBlocks(),
      getBlockList(),
      getMyPendingRequests(),
    ]);

    myBlocks.value = mine;
    pendingBlockIds.value = new Set(pending);

    const joinedIds = new Set(mine.map((b) => b.id));
    // 推荐 = 全部板块 - 已加入 - 锁定（锁定板块非成员不可见，点进去也是 404）
    const candidates = all.filter((b) => !joinedIds.has(b.id) && !b.isLocked);
    recommendBlocks.value = stableShuffle(candidates);
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

/** 申请加入板块（推荐区卡片按钮） */
async function handleJoin(block: BlockInfo): Promise<void> {
  if (applyingId.value) return;
  applyingId.value = block.id;
  try {
    await joinBlock(block.id);
    // 成功后标记为已申请（待审核），按钮变为"已申请 / 审核中"
    pendingBlockIds.value.add(block.id);
    showToast("申请已提交，等待审核", "success");
  } catch {
    // client.ts 已自动 Toast（黑名单 / 已是成员等由后端 404 兜底）
  } finally {
    applyingId.value = null;
  }
}

/** 跳转搜索页 */
function goSearch(): void {
  router.push({ name: "search" });
}

/** 是否存在任何板块内容（用于区分"完全无板块"与"只是未加入"） */
const hasAnyBlock = computed(() => myBlocks.value.length > 0 || recommendBlocks.value.length > 0);

onMounted(load);
</script>

<template>
  <div class="px-3 pb-6 pt-3">
    <!-- 顶部搜索框（点击跳搜索页） -->
    <button
      type="button"
      class="mb-4 flex w-full items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-sm text-ink-soft"
      @click="goSearch"
    >
      <AppSvgIcon name="search" :size="16" />
      搜索板块、帖子…
    </button>

    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" @retry="load" />

    <template v-else>
      <!-- 我的板块 -->
      <section v-if="myBlocks.length > 0" class="mb-5">
        <h2 class="mb-2 flex items-center gap-1 px-1 text-sm font-semibold">
          <AppSvgIcon name="blocks" :size="14" />
          我的板块
        </h2>
        <div class="space-y-3">
          <BlockCard v-for="block in myBlocks" :key="block.id" :block="block" mode="mine" />
        </div>
      </section>

      <!-- 未加入任何板块的空状态 -->
      <EmptyState
        v-if="myBlocks.length === 0"
        icon="blocks"
        text="还没有加入板块，赶紧加入吧"
      />

      <!-- 推荐板块 -->
      <section v-if="recommendBlocks.length > 0" class="mt-2">
        <h2 class="mb-2 flex items-center gap-1 px-1 text-sm font-semibold">
          <AppSvgIcon name="refresh" :size="14" />
          推荐板块
        </h2>
        <div class="space-y-3">
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

      <!-- 完全没有板块 -->
      <EmptyState v-if="!hasAnyBlock" text="还没有板块" />
    </template>
  </div>
</template>
