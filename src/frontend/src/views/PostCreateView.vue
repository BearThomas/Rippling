<!--
  发帖页

  表单：
    - 标题（100 字限制）
    - 正文 Markdown 编辑器（textarea + 预览切换，1000 字限制）
    - 可见性：公开 / 仅自己 / 指定用户（搜索选择用户）
    - 板块：选择板块发帖（发帖需为该板块成员，后端校验）
    - 图片上传：UI 预留，点击提示「即将上线」
  提交成功 → 跳转帖子详情。
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import MarkdownRenderer from "../components/markdown/MarkdownRenderer.vue";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import { createPost } from "../api/post";
import { search } from "../api/search";
import { listBlocks } from "../api/block";
import { showToast } from "../utils/toast";
import type { BlockInfo, SearchUserResult } from "../types";

const router = useRouter();

// ------------------------------------------------------------
//  表单状态
// ------------------------------------------------------------

/** 标题（上限 100 字） */
const TITLE_LIMIT = 100;
/** 正文（上限 1000 字，与后端 LIMITS.CONTENT 一致） */
const CONTENT_LIMIT = 1000;

const title = ref("");
const content = ref("");
const preview = ref(false);
const submitting = ref(false);

/** 发布模式：公开 / 仅自己 / 指定用户 / 板块 */
const mode = ref<"public" | "private" | "selected" | "block">("public");

// ------------------------------------------------------------
//  指定用户选择
// ------------------------------------------------------------

const userKeyword = ref("");
const userResults = ref<SearchUserResult[]>([]);
const searchingUsers = ref(false);
/** 已选可见用户 */
const selectedUsers = ref<SearchUserResult[]>([]);
/** 用户搜索防抖计时器 */
let userSearchTimer: ReturnType<typeof setTimeout> | null = null;

/** 搜索用户（防抖 400ms） */
function onUserKeywordInput(): void {
  if (userSearchTimer) clearTimeout(userSearchTimer);
  const keyword = userKeyword.value.trim();
  if (!keyword) {
    userResults.value = [];
    return;
  }
  userSearchTimer = setTimeout(async () => {
    searchingUsers.value = true;
    try {
      const data = await search(keyword, "user", 10, 0);
      // 过滤已选中的用户
      const selected = new Set(selectedUsers.value.map((u) => u.userId));
      userResults.value = (data.results.users ?? []).filter((u) => !selected.has(u.userId));
    } catch {
      userResults.value = [];
    } finally {
      searchingUsers.value = false;
    }
  }, 400);
}

/** 添加可见用户 */
function addUser(user: SearchUserResult): void {
  if (!selectedUsers.value.some((u) => u.userId === user.userId)) {
    selectedUsers.value.push(user);
  }
  userResults.value = userResults.value.filter((u) => u.userId !== user.userId);
}

/** 移除可见用户 */
function removeUser(userId: string): void {
  selectedUsers.value = selectedUsers.value.filter((u) => u.userId !== userId);
}

// ------------------------------------------------------------
//  板块选择
// ------------------------------------------------------------

const blocks = ref<BlockInfo[]>([]);
const blocksLoading = ref(false);
const selectedBlockId = ref("");

/** 拉取板块列表（选择板块模式时加载一次） */
async function loadBlocks(): Promise<void> {
  if (blocks.value.length > 0 || blocksLoading.value) return;
  blocksLoading.value = true;
  try {
    blocks.value = await listBlocks();
  } catch {
    // client.ts 已自动 Toast
  } finally {
    blocksLoading.value = false;
  }
}

/** 切换发布模式 */
function selectMode(next: typeof mode.value): void {
  mode.value = next;
  if (next === "block") void loadBlocks();
}

// ------------------------------------------------------------
//  提交
// ------------------------------------------------------------

/** 表单校验错误提示 */
const validationError = computed(() => {
  if (!content.value.trim()) return "正文不能为空";
  if (title.value.length > TITLE_LIMIT) return `标题最多 ${TITLE_LIMIT} 字`;
  if (content.value.length > CONTENT_LIMIT) return `正文最多 ${CONTENT_LIMIT} 字`;
  if (mode.value === "selected" && selectedUsers.value.length === 0) return "请至少选择一名可见用户";
  if (mode.value === "block" && !selectedBlockId.value) return "请选择板块";
  return "";
});

/** 提交发帖 */
async function onSubmit(): Promise<void> {
  if (validationError.value || submitting.value) return;
  submitting.value = true;
  try {
    const result = await createPost({
      title: title.value.trim() || undefined,
      content: content.value.trim(),
      visibility: mode.value === "selected" ? "selected" : mode.value === "private" ? "private" : "public",
      visibleUserIds: mode.value === "selected" ? selectedUsers.value.map((u) => u.userId) : undefined,
      blockId: mode.value === "block" ? selectedBlockId.value : undefined,
    });
    showToast("发布成功", "success");
    router.replace({ name: "post-detail", params: { id: result.id } });
  } catch {
    // client.ts 已自动 Toast 后端错误信息
  } finally {
    submitting.value = false;
  }
}

/** 图片上传（UI 预留，Task 24 实现） */
function onUploadImage(): void {
  showToast("图片上传即将上线", "info");
}

/** 预览内容（空时占位） */
const previewContent = computed(() => content.value || "（暂无内容）");

onMounted(() => {
  // 预加载板块列表，避免切换模式时等待
  void loadBlocks();
});
</script>

<template>
  <div class="px-3 pb-24 pt-3">
    <!-- 标题输入 -->
    <input
      v-model="title"
      type="text"
      class="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base font-medium outline-none placeholder:text-ink-soft/60 focus:border-primary"
      placeholder="标题（可选，100 字以内）"
      :maxlength="TITLE_LIMIT"
    />
    <div class="mt-1 px-1 text-right text-[10px] text-ink-soft">{{ title.length }}/{{ TITLE_LIMIT }}</div>

    <!-- 正文编辑器 -->
    <div class="mt-2 rounded-xl border border-line bg-surface p-3 focus-within:border-primary">
      <div v-if="preview" class="min-h-[200px]">
        <MarkdownRenderer :content="previewContent" />
      </div>
      <textarea
        v-else
        v-model="content"
        class="min-h-[200px] w-full resize-y bg-transparent text-sm leading-relaxed outline-none placeholder:text-ink-soft/60"
        placeholder="正文（支持 Markdown，1000 字以内）"
        :maxlength="CONTENT_LIMIT"
      />
      <!-- 编辑器工具行 -->
      <div class="mt-2 flex items-center gap-3 border-t border-line pt-2">
        <button
          type="button"
          class="flex items-center gap-1 text-xs text-ink-soft transition-colors active:text-primary"
          @click="onUploadImage"
        >
          <AppSvgIcon name="image" :size="15" />
          图片
        </button>
        <button
          type="button"
          class="text-xs text-ink-soft transition-colors active:text-primary"
          @click="preview = !preview"
        >
          {{ preview ? "继续编辑" : "预览" }}
        </button>
        <span class="ml-auto text-[10px] text-ink-soft">{{ content.length }}/{{ CONTENT_LIMIT }}</span>
      </div>
    </div>

    <!-- 发布范围 -->
    <section class="mt-4">
      <h3 class="mb-2 px-1 text-sm font-semibold text-ink-soft">发布范围</h3>
      <div class="grid grid-cols-4 gap-2">
        <button
          v-for="option in [
            { value: 'public', label: '公开' },
            { value: 'private', label: '仅自己' },
            { value: 'selected', label: '指定用户' },
            { value: 'block', label: '板块' },
          ]"
          :key="option.value"
          type="button"
          class="rounded-lg border px-2 py-2 text-xs font-medium transition-colors"
          :class="
            mode === option.value
              ? 'border-primary bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] text-primary'
              : 'border-line text-ink-soft'
          "
          @click="selectMode(option.value as typeof mode)"
        >
          {{ option.label }}
        </button>
      </div>

      <!-- 指定用户选择器 -->
      <div v-if="mode === 'selected'" class="mt-3 space-y-2">
        <input
          v-model="userKeyword"
          type="text"
          class="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-ink-soft/60 focus:border-primary"
          placeholder="按用户名搜索…"
          @input="onUserKeywordInput"
        />
        <!-- 搜索结果 -->
        <div v-if="userResults.length > 0" class="card-base !p-1">
          <button
            v-for="user in userResults"
            :key="user.userId"
            type="button"
            class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors active:bg-[color-mix(in_srgb,var(--c-primary)_8%,transparent)]"
            @click="addUser(user)"
          >
            <span
              class="flex h-6 w-6 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] text-[10px] font-semibold"
              :style="{ color: user.nameColor ?? undefined }"
            >
              {{ user.username.slice(0, 1) }}
            </span>
            <span :style="{ color: user.nameColor ?? undefined }">{{ user.username }}</span>
            <span class="ml-auto text-xs text-primary">添加</span>
          </button>
        </div>
        <div v-else-if="searchingUsers" class="px-1 text-xs text-ink-soft">搜索中…</div>
        <!-- 已选用户 -->
        <div v-if="selectedUsers.length > 0" class="flex flex-wrap gap-2">
          <span
            v-for="user in selectedUsers"
            :key="user.userId"
            class="flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] px-2.5 py-1 text-xs text-primary"
          >
            {{ user.username }}
            <button type="button" aria-label="移除" @click="removeUser(user.userId)">
              <AppSvgIcon name="close" :size="12" />
            </button>
          </span>
        </div>
      </div>

      <!-- 板块选择器 -->
      <div v-if="mode === 'block'" class="mt-3">
        <select
          v-model="selectedBlockId"
          class="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="" disabled>{{ blocksLoading ? "加载中…" : "选择板块" }}</option>
          <option v-for="block in blocks" :key="block.id" :value="block.id">
            {{ block.name }}{{ block.isLocked ? "（已锁定）" : "" }}
          </option>
        </select>
        <p class="mt-1 px-1 text-[11px] text-ink-soft">
          发帖需为该板块成员，锁定板块仅成员可见
        </p>
      </div>
    </section>

    <!-- 校验提示 -->
    <p v-if="validationError && content" class="mt-3 px-1 text-xs text-red-400">
      {{ validationError }}
    </p>

    <!-- 提交按钮 -->
    <button
      type="button"
      class="btn-primary mt-4 w-full !py-3 text-base disabled:opacity-50"
      :disabled="!!validationError || submitting"
      @click="onSubmit"
    >
      {{ submitting ? "发布中…" : "发布" }}
    </button>
  </div>
</template>
