<!--
  表白墙页 — Memos 轻白卡树洞流

  设计要点（DESIGN.md 第 1、6 节）：
    - 画布由 AppLayout 自动切至 --bg-canvas-soft（柔和暖灰 / 柔炭黑）
    - 顶部置入 Memos 风格内联发布框：默认单行轻输入态，点击平滑展开多行输入与提交按钮
    - 卡片流采用 .memo-card（rounded-xl + 1px --border-subtle + p-4 + gap-3），禁止厚重阴影
    - 移动端滚远后仍可通过右下角快捷按钮唤起 AppDialog 发布表白
-->
<script setup lang="ts">
import { nextTick, onMounted, ref, shallowRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import AppDialog from "../components/common/AppDialog.vue";
import Collapse from "../components/common/Collapse.vue";
import FeedSkeleton from "../components/common/FeedSkeleton.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import ConfessionCard from "../components/post/ConfessionCard.vue";
import { getConfessionList, createConfession } from "../api/confession";
import { showToast } from "../utils/toast";
import { useAuthStore } from "../stores/auth";
import type { ConfessionListItem } from "../types";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const PAGE_SIZE = 20;

const loading = shallowRef(true);
const error = shallowRef(false);
const confessions = ref<ConfessionListItem[]>([]);

const loadingMore = shallowRef(false);
const hasMore = shallowRef(true);

/** 顶部 Memos 内联发布框状态 */
const inlineExpanded = shallowRef(false);
const inlineTextarea = ref<HTMLTextAreaElement | null>(null);

/** 移动端快捷发布弹窗（复用 AppDialog） */
const mobileDialogOpen = shallowRef(false);

const draft = shallowRef("");
const submitting = shallowRef(false);

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    confessions.value = await getConfessionList(PAGE_SIZE, 0);
    hasMore.value = confessions.value.length >= PAGE_SIZE;
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

async function loadMore(): Promise<void> {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    const more = await getConfessionList(PAGE_SIZE, confessions.value.length);
    confessions.value = [...confessions.value, ...more];
    hasMore.value = more.length >= PAGE_SIZE;
  } catch {
    // client.ts 已自动 Toast
  } finally {
    loadingMore.value = false;
  }
}

function ensureLogin(): boolean {
  if (auth.isLoggedIn) return true;
  void router.push({ path: "/login", query: { redirect: route.fullPath } });
  return false;
}

async function expandInline(): Promise<void> {
  if (!ensureLogin()) return;
  inlineExpanded.value = true;
  await nextTick();
  inlineTextarea.value?.focus();
}

function collapseInline(): void {
  if (submitting.value) return;
  inlineExpanded.value = false;
}

function openMobileDialog(): void {
  if (!ensureLogin()) return;
  mobileDialogOpen.value = true;
}

function closeMobileDialog(): void {
  if (submitting.value) return;
  mobileDialogOpen.value = false;
}

async function handleSubmit(): Promise<void> {
  if (submitting.value || !ensureLogin()) return;
  const content = draft.value.trim();
  if (!content) {
    showToast("内容不能为空", "error");
    return;
  }
  submitting.value = true;
  try {
    const { id } = await createConfession(content);
    confessions.value = [
      {
        id,
        preview: content.length > 100 ? content.slice(0, 100) + "..." : content,
        createdAt: new Date().toISOString(),
        likeCount: 0,
      },
      ...confessions.value,
    ];
    draft.value = "";
    inlineExpanded.value = false;
    mobileDialogOpen.value = false;
    showToast("发布成功", "success");
  } catch {
    // client.ts 已自动 Toast
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="px-3.5 pb-20 pt-4 sm:px-5 sm:pb-8 sm:pt-5">
    <!-- 顶部 Memos 风格内联匿名发布框 -->
    <section
      class="memo-card mb-4 transition-colors focus-within:border-primary"
      :class="inlineExpanded ? 'border-strong' : 'hover:border-strong'"
    >
      <!-- 默认单行轻输入态 -->
      <button
        v-if="!inlineExpanded"
        type="button"
        class="flex w-full items-center gap-3 text-left pressable"
        @click="expandInline"
      >
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-warm-soft text-accent-warm"
        >
          <AppSvgIcon name="heart" :size="16" />
        </span>
        <span class="min-w-0 flex-1 truncate text-sm text-ink-muted">
          {{ auth.isLoggedIn ? "匿名写下一句想说的话…" : "登录后匿名写下一句想说的话…" }}
        </span>
        <span class="tag-pill shrink-0">写表白</span>
      </button>

      <!-- 展开多行发布态（使用 Collapse .disclosure 平滑过渡） -->
      <Collapse :open="inlineExpanded">
        <div>
          <textarea
            ref="inlineTextarea"
            v-model="draft"
            rows="4"
            aria-label="匿名表白内容"
            class="w-full resize-none bg-transparent text-[15px] leading-[1.7] text-ink outline-none placeholder:text-ink-muted"
            placeholder="匿名说出你想说的话…不会公开你的任何身份信息"
            maxlength="1000"
          />

          <div class="mt-2.5 flex items-center gap-2 border-t border-subtle pt-2.5">
            <span class="inline-flex items-center gap-1 text-xs text-ink-muted">
              <AppSvgIcon name="lock" :size="12" />
              完全匿名
            </span>
            <span class="ml-auto text-xs tabular-nums text-ink-muted">
              {{ draft.length }}/1000
            </span>
            <button
              type="button"
              class="btn-ghost !px-2.5 !py-1.5 text-xs"
              :disabled="submitting"
              @click="collapseInline"
            >
              收起
            </button>
            <button
              type="button"
              class="btn-primary !rounded-full !px-4 !py-1.5 text-xs"
              :disabled="!draft.trim() || submitting"
              @click="handleSubmit"
            >
              {{ submitting ? "发布中…" : "匿名发布" }}
            </button>
          </div>
        </div>
      </Collapse>
    </section>

    <!-- 加载 / 错误 / 轻白卡流 -->
    <FeedSkeleton v-if="loading" variant="memos" :count="4" />
    <ErrorState v-else-if="error" @retry="load" />

    <template v-else>
      <div v-if="confessions.length > 0" class="space-y-3">
        <ConfessionCard
          v-for="item in confessions"
          :key="item.id"
          variant="memos"
          :id="item.id"
          :content="item.preview"
          :like-count="item.likeCount"
          :created-at="item.createdAt"
        />

        <!-- 加载更多 -->
        <div class="py-3 text-center">
          <button
            v-if="hasMore"
            type="button"
            class="btn-secondary !py-1.5 text-xs"
            :disabled="loadingMore"
            @click="loadMore"
          >
            {{ loadingMore ? "加载中…" : "加载更多" }}
          </button>
          <span v-else class="text-xs text-ink-muted">已经到底啦</span>
        </div>
      </div>

      <EmptyState
        v-else
        text="还没有表白"
        description="在上方匿名写下第一句温柔的话吧。"
        icon="heart"
      />
    </template>

    <!-- 移动端快捷悬浮按钮（仅 <768px 显示，复用 AppDialog） -->
    <button
      type="button"
      class="fixed right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-accent-warm text-white shadow-fab pressable md:hidden"
      style="bottom: calc(4.75rem + env(safe-area-inset-bottom, 0px))"
      aria-label="发布表白"
      @click="openMobileDialog"
    >
      <AppSvgIcon name="penLine" :size="20" />
    </button>

    <!-- 移动端快捷发布弹层（reka-ui AppDialog） -->
    <AppDialog
      :open="mobileDialogOpen"
      title="匿名发布表白"
      description="完全匿名发布，不会显示你的身份信息。"
      size="md"
      :dismissible="!submitting"
      @close="closeMobileDialog"
    >
      <textarea
        v-model="draft"
        rows="5"
        class="input-base resize-y leading-relaxed"
        placeholder="匿名说出你想说的话…"
        maxlength="1000"
      />
      <p class="mt-1.5 text-right text-xs tabular-nums text-ink-muted">
        {{ draft.length }}/1000
      </p>

      <template #footer>
        <div class="flex items-center justify-end gap-2.5">
          <button
            type="button"
            class="btn-secondary flex-1 sm:flex-none"
            :disabled="submitting"
            @click="closeMobileDialog"
          >
            取消
          </button>
          <button
            type="button"
            class="btn-primary flex-1 sm:flex-none"
            :disabled="!draft.trim() || submitting"
            @click="handleSubmit"
          >
            {{ submitting ? "发布中…" : "发布" }}
          </button>
        </div>
      </template>
    </AppDialog>
  </div>
</template>
