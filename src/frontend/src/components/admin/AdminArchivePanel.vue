<!--
  管理面板 — 归档查看子面板（Elk 紧凑分割行 + AppDialog 解密查看弹窗）
-->
<script setup lang="ts">
import { onMounted, ref, shallowRef } from "vue";
import FeedSkeleton from "../common/FeedSkeleton.vue";
import EmptyState from "../common/EmptyState.vue";
import ErrorState from "../common/ErrorState.vue";
import AppDialog from "../common/AppDialog.vue";
import AppSvgIcon from "../layout/AppSvgIcon.vue";
import { listArchiveFiles, getArchiveFileContent } from "../../api/admin";
import type { ArchiveFileInfo, ArchiveFileContent } from "../../api/admin";
import { formatDateTime } from "../../utils/format";

const PAGE_SIZE = 20;

const loading = shallowRef(true);
const loadingMore = shallowRef(false);
const error = shallowRef(false);
const files = ref<ArchiveFileInfo[]>([]);
const hasMore = shallowRef(true);

/** 文件内容弹窗（AppDialog） */
const contentOpen = shallowRef(false);
const contentFile = ref<ArchiveFileInfo | null>(null);
const content = ref<ArchiveFileContent | null>(null);
const contentLoading = shallowRef(false);
const contentError = shallowRef(false);

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    files.value = await listArchiveFiles(PAGE_SIZE, 0);
    hasMore.value = files.value.length === PAGE_SIZE;
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
    const page = await listArchiveFiles(PAGE_SIZE, files.value.length);
    files.value.push(...page);
    hasMore.value = page.length === PAGE_SIZE;
  } catch {
    // client.ts 已自动 Toast
  } finally {
    loadingMore.value = false;
  }
}

async function openContent(file: ArchiveFileInfo): Promise<void> {
  contentFile.value = file;
  contentOpen.value = true;
  content.value = null;
  contentLoading.value = true;
  contentError.value = false;
  try {
    content.value = await getArchiveFileContent(file.filePath);
  } catch {
    contentError.value = true;
  } finally {
    contentLoading.value = false;
  }
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div>
    <FeedSkeleton v-if="loading" variant="elk" :count="5" />
    <div v-else-if="error" class="px-4 py-6">
      <ErrorState @retry="load" />
    </div>

    <template v-else-if="files.length > 0">
      <ul role="list" class="divide-y divide-[var(--border-subtle)] border-b border-subtle">
        <li v-for="file in files" :key="file.id">
          <button
            type="button"
            class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover pressable sm:px-5"
            @click="openContent(file)"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate font-mono text-xs font-medium text-ink">
                {{ file.filePath }}
              </p>
              <p class="mt-0.5 text-xs tabular-nums text-ink-muted">
                {{ file.targetType ?? "—" }} · {{ formatDateTime(file.archivedAt) }}
              </p>
            </div>
            <AppSvgIcon name="chevronRight" :size="15" class="shrink-0 text-ink-muted" />
          </button>
        </li>
      </ul>

      <div v-if="hasMore" class="px-4 py-4 text-center">
        <button
          type="button"
          class="btn-secondary !py-1.5 text-xs"
          :disabled="loadingMore"
          @click="loadMore"
        >
          {{ loadingMore ? "加载中…" : "加载更多" }}
        </button>
      </div>
    </template>

    <div v-else class="px-4 py-6">
      <EmptyState text="暂无归档文件" icon="file" />
    </div>

    <!-- 解密内容弹窗（AppDialog） -->
    <AppDialog
      v-model:open="contentOpen"
      :title="contentFile?.filePath ?? '归档内容'"
      :description="
        content
          ? `归档时间：${formatDateTime(content.archivedAt)} · 格式版本 v${content.version}`
          : 'AES-256-GCM 解密内容预览'
      "
      size="xl"
    >
      <div v-if="contentLoading" class="py-8 text-center text-xs text-ink-muted">
        正在解密读取…
      </div>
      <ErrorState
        v-else-if="contentError && contentFile"
        message="归档文件读取失败"
        @retry="openContent(contentFile)"
      />

      <div v-else-if="content" class="space-y-4">
        <section>
          <h3 class="mb-1.5 text-xs font-semibold text-ink-secondary">最终状态快照</h3>
          <pre
            class="overflow-x-auto rounded-xl bg-canvas-soft p-3.5 font-mono text-xs leading-relaxed text-ink"
          >{{ prettyJson(content.result) }}</pre>
        </section>

        <section>
          <h3 class="mb-1.5 text-xs font-semibold text-ink-secondary">
            操作链（{{ content.operations.length }} 条）
          </h3>
          <pre
            class="overflow-x-auto rounded-xl bg-canvas-soft p-3.5 font-mono text-xs leading-relaxed text-ink"
          >{{ prettyJson(content.operations) }}</pre>
        </section>
      </div>

      <template #footer>
        <button type="button" class="btn-secondary w-full" @click="contentOpen = false">
          关闭
        </button>
      </template>
    </AppDialog>
  </div>
</template>
