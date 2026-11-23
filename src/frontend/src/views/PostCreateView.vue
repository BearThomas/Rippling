<!--
  发帖页（极简表单页：写作/预览 AppTabs + 板块 AppSelect）

  表单：
    - 标题（100 字限制）
    - 正文 Markdown 编辑器（AppTabs 写作 / 预览，1000 字限制）
    - 可见性：公开 / 仅自己 / 指定用户（搜索选择用户）/ 板块（AppSelect）
    - 图片上传：选图 → 压缩 → 传 B2 → 在光标处插入 Markdown 图片
  提交成功 → 跳转帖子详情。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import MarkdownRenderer from "../components/markdown/MarkdownRenderer.vue";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import AppTabs, { type TabOption } from "../components/common/AppTabs.vue";
import AppSelect, { type SelectOptionItem } from "../components/common/AppSelect.vue";
import UserAvatar from "../components/user/UserAvatar.vue";
import { createPost } from "../api/post";
import { uploadImage, MAX_IMAGE_SIZE } from "../api/upload";
import { compressImage } from "../utils/compressImage";
import { search } from "../api/search";
import { getBlockDetail, getBlockList } from "../api/block";
import { showToast } from "../utils/toast";
import type { BlockInfo, SearchUserResult } from "../types";

const route = useRoute();
const router = useRouter();

// ------------------------------------------------------------
//  表单状态
// ------------------------------------------------------------

const TITLE_LIMIT = 100;
const CONTENT_LIMIT = 1000;

const title = shallowRef("");
const content = shallowRef("");
const editorTab = shallowRef<"write" | "preview">("write");
const submitting = shallowRef(false);

const EDITOR_TABS: readonly TabOption[] = [
  { value: "write", label: "写作" },
  { value: "preview", label: "预览" },
];

function onEditorTabChange(val: string): void {
  editorTab.value = val === "preview" ? "preview" : "write";
}

/** 发布模式：公开 / 仅自己 / 指定用户 / 板块 */
type PublishMode = "public" | "private" | "selected" | "block";
const mode = shallowRef<PublishMode>("public");

const MODE_OPTIONS: readonly { value: PublishMode; label: string }[] = [
  { value: "public", label: "公开" },
  { value: "private", label: "仅自己" },
  { value: "selected", label: "指定用户" },
  { value: "block", label: "板块" },
];

// ------------------------------------------------------------
//  指定用户选择
// ------------------------------------------------------------

const userKeyword = shallowRef("");
const userResults = ref<SearchUserResult[]>([]);
const searchingUsers = shallowRef(false);
const selectedUsers = ref<SearchUserResult[]>([]);
let userSearchTimer: ReturnType<typeof setTimeout> | null = null;

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
      const selected = new Set(selectedUsers.value.map((u) => u.userId));
      userResults.value = (data.results.users ?? []).filter((u) => !selected.has(u.userId));
    } catch {
      userResults.value = [];
    } finally {
      searchingUsers.value = false;
    }
  }, 400);
}

function addUser(user: SearchUserResult): void {
  if (!selectedUsers.value.some((u) => u.userId === user.userId)) {
    selectedUsers.value.push(user);
  }
  userResults.value = userResults.value.filter((u) => u.userId !== user.userId);
}

function removeUser(userId: string): void {
  selectedUsers.value = selectedUsers.value.filter((u) => u.userId !== userId);
}

// ------------------------------------------------------------
//  板块选择
// ------------------------------------------------------------

const blocks = ref<BlockInfo[]>([]);
const blocksLoading = shallowRef(false);
const selectedBlockId = shallowRef("");

const blockOptions = computed<SelectOptionItem[]>(() =>
  blocks.value.map((b) => ({
    value: b.id,
    label: `${b.name}${b.isLocked ? "（已锁定）" : ""}`,
  }))
);

async function loadBlocks(): Promise<void> {
  if (blocks.value.length > 0 || blocksLoading.value) return;
  blocksLoading.value = true;
  try {
    blocks.value = await getBlockList();
  } catch {
    // client.ts 已自动 Toast
  } finally {
    blocksLoading.value = false;
  }
}

function selectMode(next: PublishMode): void {
  mode.value = next;
  if (next === "block") void loadBlocks();
}

// ------------------------------------------------------------
//  提交
// ------------------------------------------------------------

const validationError = computed(() => {
  if (!content.value.trim()) return "正文不能为空";
  if (title.value.length > TITLE_LIMIT) return `标题最多 ${TITLE_LIMIT} 字`;
  if (content.value.length > CONTENT_LIMIT) return `正文最多 ${CONTENT_LIMIT} 字`;
  if (mode.value === "selected" && selectedUsers.value.length === 0) return "请至少选择一名可见用户";
  if (mode.value === "block" && !selectedBlockId.value) return "请选择板块";
  return "";
});

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
    void router.replace({ name: "post-detail", params: { id: result.id } });
  } catch {
    // client.ts 已自动 Toast 后端错误信息
  } finally {
    submitting.value = false;
  }
}

// ------------------------------------------------------------
//  图片上传
// ------------------------------------------------------------

const imageInputEl = ref<HTMLInputElement | null>(null);
const contentEl = ref<HTMLTextAreaElement | null>(null);
const uploadingImage = shallowRef(false);

function onUploadImage(): void {
  if (uploadingImage.value) return;
  imageInputEl.value?.click();
}

async function onImagePicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("只能选图片文件", "error");
    return;
  }
  if (file.size > MAX_IMAGE_SIZE) {
    showToast("图片较大，正在压缩…", "info");
  }

  uploadingImage.value = true;
  try {
    const compressed = await compressImage(file, MAX_IMAGE_SIZE);
    const { url } = await uploadImage(compressed);

    const textarea = contentEl.value;
    const markdown = `\n![图片](${url})\n`;
    const start = textarea?.selectionStart ?? content.value.length;
    const end = textarea?.selectionEnd ?? content.value.length;
    content.value = content.value.slice(0, start) + markdown + content.value.slice(end);
    const caret = start + markdown.length;
    editorTab.value = "write";
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(caret, caret);
    });

    showToast("图片已插入", "success");
  } catch {
    // uploadImage 已 Toast
  } finally {
    uploadingImage.value = false;
  }
}

const previewContent = computed(() => content.value || "（暂无内容）");

onMounted(() => {
  void loadBlocks().then(async () => {
    const qBlockId = route.query.blockId;
    if (typeof qBlockId === "string" && qBlockId) {
      mode.value = "block";
      selectedBlockId.value = qBlockId;
      if (!blocks.value.some((b) => b.id === qBlockId)) {
        try {
          const detail = await getBlockDetail(qBlockId);
          blocks.value = [{ ...detail }, ...blocks.value];
        } catch {
          // 无权访问时忽略预选
        }
      }
    }
  });
});

onBeforeUnmount(() => {
  if (userSearchTimer) clearTimeout(userSearchTimer);
});
</script>

<template>
  <form
    class="mx-auto max-w-2xl space-y-5 px-4 pb-24 pt-4 sm:px-5 sm:pb-10 sm:pt-5"
    @submit.prevent="onSubmit"
  >
    <!-- 标题输入 -->
    <div>
      <div class="mb-1.5 flex items-baseline justify-between">
        <label for="post-title" class="text-sm font-medium text-ink">
          标题
          <span class="ml-1 text-xs font-normal text-ink-muted">可选</span>
        </label>
        <span class="text-xs tabular-nums text-ink-muted">
          {{ title.length }}/{{ TITLE_LIMIT }}
        </span>
      </div>
      <input
        id="post-title"
        v-model="title"
        name="title"
        type="text"
        autocomplete="off"
        class="input-base font-medium"
        placeholder="用一句话概括主题（100 字以内）…"
        :maxlength="TITLE_LIMIT"
      />
    </div>

    <!-- 正文编辑器（AppTabs 写作 / 预览） -->
    <div>
      <div class="mb-1.5 flex items-center justify-between gap-2">
        <label for="post-content" class="text-sm font-medium text-ink">正文</label>
        <AppTabs
          :model-value="editorTab"
          :items="EDITOR_TABS"
          variant="pills"
          aria-label="编辑与预览切换"
          @update:model-value="onEditorTabChange"
        />
      </div>

      <div
        class="rounded-xl border border-strong bg-surface transition-colors focus-within:border-primary"
      >
        <div v-if="editorTab === 'preview'" class="min-h-[220px] p-4">
          <MarkdownRenderer :content="previewContent" size="reading" />
        </div>
        <textarea
          v-else
          id="post-content"
          ref="contentEl"
          v-model="content"
          name="content"
          rows="8"
          class="min-h-[220px] w-full resize-y bg-transparent p-4 text-[15px] leading-[1.7] text-ink outline-none placeholder:text-ink-muted"
          placeholder="写下你的想法，支持 Markdown 语法（1000 字以内）…"
          :maxlength="CONTENT_LIMIT"
        />

        <!-- 底部工具行 -->
        <div class="flex items-center gap-3 border-t border-subtle px-3.5 py-2.5">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-ink-secondary hover:bg-hover hover:text-ink pressable disabled:opacity-50"
            :disabled="uploadingImage"
            @click="onUploadImage"
          >
            <AppSvgIcon name="image" :size="15" />
            <span>{{ uploadingImage ? "上传中…" : "插入图片" }}</span>
          </button>
          <input
            ref="imageInputEl"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onImagePicked"
          />
          <span class="ml-auto text-xs tabular-nums text-ink-muted">
            {{ content.length }}/{{ CONTENT_LIMIT }}
          </span>
        </div>
      </div>
    </div>

    <!-- 发布范围 -->
    <section>
      <h2 class="mb-2 text-sm font-medium text-ink">发布范围</h2>
      <div class="grid grid-cols-4 gap-2" role="radiogroup" aria-label="发布范围">
        <button
          v-for="option in MODE_OPTIONS"
          :key="option.value"
          type="button"
          role="radio"
          :aria-checked="mode === option.value"
          class="rounded-lg border px-2 py-2 text-xs font-medium pressable"
          :class="
            mode === option.value
              ? 'border-primary bg-accent-soft text-primary'
              : 'border-subtle bg-surface text-ink-secondary hover:bg-hover hover:text-ink'
          "
          @click="selectMode(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <!-- 指定用户选择器 -->
      <div v-if="mode === 'selected'" class="mt-3 space-y-2.5">
        <label for="post-user-search" class="sr-only">搜索可见用户</label>
        <input
          id="post-user-search"
          v-model="userKeyword"
          type="search"
          autocomplete="off"
          class="input-base"
          placeholder="按用户名搜索可见用户…"
          @input="onUserKeywordInput"
        />

        <div
          v-if="userResults.length > 0"
          class="rounded-xl border border-subtle bg-surface p-1"
        >
          <button
            v-for="user in userResults"
            :key="user.userId"
            type="button"
            class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-hover pressable"
            @click="addUser(user)"
          >
            <UserAvatar
              :src="user.avatar"
              :name="user.username"
              :name-color="user.nameColor"
              size="xs"
            />
            <span
              class="min-w-0 flex-1 truncate"
              :style="user.nameColor ? { color: user.nameColor } : undefined"
            >
              {{ user.username }}
            </span>
            <span class="shrink-0 text-xs font-medium text-primary">添加</span>
          </button>
        </div>
        <p v-else-if="searchingUsers" class="px-1 text-xs text-ink-muted">搜索中…</p>

        <div v-if="selectedUsers.length > 0" class="flex flex-wrap gap-2">
          <span
            v-for="user in selectedUsers"
            :key="user.userId"
            class="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-primary"
          >
            <span>{{ user.username }}</span>
            <button
              type="button"
              class="rounded-full p-0.5 hover:bg-hover"
              :aria-label="`移除 ${user.username}`"
              @click="removeUser(user.userId)"
            >
              <AppSvgIcon name="close" :size="12" />
            </button>
          </span>
        </div>
      </div>

      <!-- 板块选择器（AppSelect） -->
      <div v-if="mode === 'block'" class="mt-3 space-y-1.5">
        <AppSelect
          v-model="selectedBlockId"
          :options="blockOptions"
          :disabled="blocksLoading"
          :placeholder="blocksLoading ? '加载板块中…' : '选择发布板块'"
          aria-label="选择发布板块"
        />
        <p class="px-0.5 text-xs text-ink-muted">
          发帖需为该板块成员，锁定板块内容仅成员可见。
        </p>
      </div>
    </section>

    <!-- 校验提示 -->
    <p
      v-if="validationError && content"
      role="alert"
      class="text-xs text-danger"
    >
      {{ validationError }}
    </p>

    <!-- 提交按钮 -->
    <button
      type="submit"
      class="btn-primary w-full !py-2.5 text-sm disabled:opacity-50"
      :disabled="Boolean(validationError) || submitting"
    >
      {{ submitting ? "发布中…" : "发布帖子" }}
    </button>
  </form>
</template>
