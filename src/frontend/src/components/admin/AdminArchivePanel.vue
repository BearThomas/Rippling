<!--
  管理面板 — 归档查看子面板（view_database 权限）

  - 归档文件列表（分页，GET /archive/files）
  - 点击文件查看解密内容（GET /archive/file；路径由客户端自动 URL 编码）
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import LoadingSpinner from "../common/LoadingSpinner.vue";
import EmptyState from "../common/EmptyState.vue";
import ErrorState from "../common/ErrorState.vue";
import { listArchiveFiles, getArchiveFileContent } from "../../api/admin";
import type { ArchiveFileInfo, ArchiveFileContent } from "../../api/admin";
import { formatDateTime } from "../../utils/format";

/** 每页条数 */
const PAGE_SIZE = 20;

const loading = ref(true);
const loadingMore = ref(false);
const error = ref(false);
const files = ref<ArchiveFileInfo[]>([]);
const hasMore = ref(true);

/** 文件内容弹窗 */
const contentFile = ref<ArchiveFileInfo | null>(null);
const content = ref<ArchiveFileContent | null>(null);
const contentLoading = ref(false);
const contentError = ref(false);

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
    // Toast 由 client 层统一处理
  } finally {
    loadingMore.value = false;
  }
}

/** 打开文件内容弹窗（解密读取） */
async function openContent(file: ArchiveFileInfo): Promise<void> {
  contentFile.value = file;
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

function closeContent(): void {
  contentFile.value = null;
  content.value = null;
}

/** JSON 美化输出 */
function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

onMounted(load);
</script>

<template>
  <div>
    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" @retry="load" />

    <template v-else-if="files.length > 0">
      <div class="card-base !p-0 divide-y divide-line">
        <button
          v-for="file in files"
          :key="file.id"
          type="button"
          class="block w-full px-4 py-2.5 text-left transition-opacity active:opacity-70"
          @click="openContent(file)"
        >
          <p class="truncate font-mono text-xs">{{ file.filePath }}</p>
          <p class="mt-0.5 text-xs text-ink-soft">
            {{ file.targetType ?? "—" }} · {{ formatDateTime(file.archivedAt) }}
          </p>
        </button>
      </div>

      <button
        v-if="hasMore"
        type="button"
        class="btn-secondary mt-3 w-full"
        :disabled="loadingMore"
        @click="loadMore"
      >
        {{ loadingMore ? "加载中…" : "加载更多" }}
      </button>
    </template>

    <EmptyState v-else text="暂无归档文件" icon="file" />

    <!-- 解密内容弹窗 -->
    <div
      v-if="contentFile"
      class="fixed inset-0 z-50 flex items-end bg-black/40"
      @click.self="closeContent"
    >
      <div class="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-4">
        <div class="mb-2 flex items-center justify-between gap-2">
          <h3 class="truncate font-mono text-sm">{{ contentFile.filePath }}</h3>
          <button type="button" class="shrink-0 text-sm text-ink-soft" @click="closeContent">
            关闭
          </button>
        </div>

        <LoadingSpinner v-if="contentLoading" />
        <ErrorState v-else-if="contentError" message="文件读取失败" @retry="openContent(contentFile)" />

        <template v-else-if="content">
          <p class="mb-2 text-xs text-ink-soft">
            归档时间：{{ formatDateTime(content.archivedAt) }} · 格式版本 v{{ content.version }}
          </p>

          <h4 class="mb-1 text-xs font-semibold text-ink-soft">最终状态快照</h4>
          <pre class="mb-3 overflow-x-auto rounded-lg bg-page p-3 font-mono text-xs leading-relaxed">{{ prettyJson(content.result) }}</pre>

          <h4 class="mb-1 text-xs font-semibold text-ink-soft">操作链（{{ content.operations.length }} 条）</h4>
          <pre class="overflow-x-auto rounded-lg bg-page p-3 font-mono text-xs leading-relaxed">{{ prettyJson(content.operations) }}</pre>
        </template>
      </div>
    </div>
  </div>
</template>
