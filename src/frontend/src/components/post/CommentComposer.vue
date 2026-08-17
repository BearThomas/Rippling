<!--
  评论输入组件

  支持 Markdown（textarea + 预览切换）、匿名选项（authorVisible=false）。
  通过 ref 暴露 focus() 供「回复某条评论」时聚焦。
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import MarkdownRenderer from "../markdown/MarkdownRenderer.vue";
import AppSvgIcon from "../layout/AppSvgIcon.vue";

withDefaults(
  defineProps<{
    /** 输入框占位文案 */
    placeholder?: string;
    /** 提交中状态（禁用发送按钮） */
    busy?: boolean;
  }>(),
  { placeholder: "写下你的评论…（支持 Markdown）", busy: false }
);

const emit = defineEmits<{
  /** 提交评论：内容 + 是否公开署名 */
  submit: [content: string, authorVisible: boolean];
}>();

const content = ref("");
/** 匿名发布（不公开署名） */
const anonymous = ref(false);
/** 预览模式 */
const preview = ref(false);

/** 预览内容（空时占位） */
const previewContent = computed(() => content.value || "（暂无内容）");

/** 发送 */
function onSubmit(): void {
  const text = content.value.trim();
  if (!text) return;
  emit("submit", text, !anonymous.value);
  content.value = "";
  preview.value = false;
}

/** 聚焦输入框（回复定位用） */
function focus(): void {
  preview.value = false;
  textareaEl.value?.focus();
}

const textareaEl = ref<HTMLTextAreaElement | null>(null);

defineExpose({ focus });
</script>

<template>
  <div class="card-base !p-2">
    <!-- 编辑 / 预览切换 -->
    <div v-if="preview" class="min-h-[72px] rounded-lg bg-page px-3 py-2">
      <MarkdownRenderer :content="previewContent" />
    </div>
    <textarea
      v-else
      ref="textareaEl"
      v-model="content"
      class="min-h-[72px] w-full resize-y rounded-lg bg-page px-3 py-2 text-sm outline-none placeholder:text-ink-soft/60"
      :placeholder="placeholder"
      maxlength="300"
    />

    <!-- 工具行：匿名 + 预览切换 + 发送 -->
    <div class="mt-1.5 flex items-center gap-3 px-1">
      <label class="flex items-center gap-1 text-xs text-ink-soft">
        <input v-model="anonymous" type="checkbox" class="accent-[var(--c-primary)]" />
        匿名
      </label>
      <button
        type="button"
        class="text-xs text-ink-soft transition-colors active:text-primary"
        @click="preview = !preview"
      >
        {{ preview ? "继续编辑" : "预览" }}
      </button>
      <span class="ml-auto text-[10px] text-ink-soft">{{ content.length }}/300</span>
      <button
        type="button"
        class="flex items-center gap-1 rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        :disabled="!content.trim() || busy"
        @click="onSubmit"
      >
        <AppSvgIcon name="send" :size="12" />
        {{ busy ? "发送中…" : "发送" }}
      </button>
    </div>
  </div>
</template>
