<!--
  评论输入组件（去双层套娃，单层清爽边框输入容器）

  支持 Markdown（写作 / 预览切换）、匿名选项（authorVisible=false）；
  通过 defineExpose({ focus }) 供详情页点击回复时聚焦。
-->
<script setup lang="ts">
import { computed, ref, shallowRef } from "vue";
import MarkdownRenderer from "../markdown/MarkdownRenderer.vue";
import AppSvgIcon from "../layout/AppSvgIcon.vue";

withDefaults(
  defineProps<{
    placeholder?: string;
    busy?: boolean;
  }>(),
  { placeholder: "写下你的评论…（支持 Markdown）", busy: false }
);

const emit = defineEmits<{
  submit: [content: string, authorVisible: boolean];
}>();

const content = shallowRef("");
const anonymous = shallowRef(false);
const preview = shallowRef(false);
const textareaEl = ref<HTMLTextAreaElement | null>(null);

const previewContent = computed(() => content.value || "（暂无内容）");

function onSubmit(): void {
  const text = content.value.trim();
  if (!text) return;
  emit("submit", text, !anonymous.value);
  content.value = "";
  preview.value = false;
}

function focus(): void {
  preview.value = false;
  textareaEl.value?.focus();
}

defineExpose({ focus });
</script>

<template>
  <div
    class="rounded-xl border border-strong bg-surface transition-colors focus-within:border-primary"
  >
    <!-- 编辑 / 预览区 -->
    <div v-if="preview" class="min-h-[68px] max-h-44 overflow-y-auto px-3.5 py-2.5">
      <MarkdownRenderer :content="previewContent" size="compact" />
    </div>
    <textarea
      v-else
      ref="textareaEl"
      v-model="content"
      rows="2"
      class="min-h-[68px] max-h-44 w-full resize-none bg-transparent px-3.5 py-2.5 text-base leading-relaxed text-ink outline-none placeholder:text-ink-muted sm:text-sm"
      :placeholder="placeholder"
      maxlength="300"
    />

    <!-- 底部轻量工具栏 -->
    <div class="flex items-center gap-2.5 border-t border-subtle px-3 py-1.5">
      <label class="inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink-secondary select-none">
        <input
          v-model="anonymous"
          type="checkbox"
          class="h-3.5 w-3.5 rounded accent-[var(--accent)]"
        />
        匿名
      </label>

      <button
        type="button"
        class="rounded-md px-2 py-1 text-xs font-medium transition-colors"
        :class="preview ? 'bg-accent-soft text-primary' : 'text-ink-muted hover:bg-hover hover:text-ink'"
        @click="preview = !preview"
      >
        {{ preview ? "继续编辑" : "预览" }}
      </button>

      <span class="ml-auto text-xs tabular-nums text-ink-muted">
        {{ content.length }}/300
      </span>

      <button
        type="button"
        class="btn-primary !rounded-full !px-3.5 !py-1.5 text-xs"
        :disabled="!content.trim() || busy"
        @click="onSubmit"
      >
        <AppSvgIcon name="send" :size="12" />
        {{ busy ? "发送中…" : "发送" }}
      </button>
    </div>
  </div>
</template>
