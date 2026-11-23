<!--
  Markdown 渲染组件（marked + DOMPurify）

  安全策略：marked 解析后的 HTML 必须经过 DOMPurify 清洗再渲染，
  防止 XSS（脚本注入、事件属性等）—— 清洗逻辑严格保持原样不变。
-->
<script setup lang="ts">
import { computed } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";

const props = withDefaults(
  defineProps<{
    /** Markdown 原文 */
    content: string;
    /** 排版密度：compact（评论/列表预览 14px）/ reading（帖子详情长文 15px 1.7 行高） */
    size?: "compact" | "reading";
  }>(),
  { content: "", size: "compact" }
);

// marked 全局配置：禁用 mangle/headerIds 警告（v12 已移除对应选项），同步解析
marked.setOptions({ gfm: true, breaks: true });

/** 解析 + 清洗后的安全 HTML */
const safeHtml = computed(() => {
  if (!props.content) return "";
  const rawHtml = marked.parse(props.content, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml, {
    // 禁止表单元素，防止钓鱼表单
    FORBID_TAGS: ["form", "input", "button", "textarea", "select"],
  });
});
</script>

<template>
  <!-- 内容已由 DOMPurify 清洗 -->
  <div
    class="markdown-body break-words text-ink"
    :class="size === 'reading' ? 'markdown-reading' : 'markdown-compact'"
    v-html="safeHtml"
  />
</template>

<style scoped>
/* DESIGN.md 第 3 节：Markdown 阅读节奏 */
.markdown-compact {
  font-size: 0.875rem; /* 14px */
  line-height: 1.65;
}

.markdown-reading {
  font-size: 0.9375rem; /* 15px */
  line-height: 1.7;
}

.markdown-body :deep(> :first-child) {
  margin-top: 0;
}

.markdown-body :deep(> :last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(p) {
  margin: 0.75rem 0;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  color: var(--text-primary);
  font-weight: 600;
  line-height: 1.35;
  margin: 1.15em 0 0.45em;
}

.markdown-body :deep(h1) {
  font-size: 1.25em;
}

.markdown-body :deep(h2) {
  font-size: 1.125em;
}

.markdown-body :deep(h3) {
  font-size: 1.025em;
}

.markdown-body :deep(a) {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 3px;
  word-break: break-word;
}

.markdown-body :deep(code) {
  font-family: var(--font-mono);
  background: var(--bg-canvas-soft);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 0.12em 0.36em;
  font-size: 0.88em;
}

.markdown-body :deep(pre) {
  font-family: var(--font-mono);
  background: var(--bg-canvas-soft);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 0.85em 1em;
  margin: 0.75rem 0;
  overflow-x: auto;
  line-height: 1.55;
}

.markdown-body :deep(pre code) {
  background: transparent;
  border: none;
  padding: 0;
  font-size: 0.85em;
}

.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--border-strong);
  padding-left: 0.85em;
  color: var(--text-secondary);
  margin: 0.75rem 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.45em;
  margin: 0.75rem 0;
}

.markdown-body :deep(ul) {
  list-style-type: disc;
}

.markdown-body :deep(ol) {
  list-style-type: decimal;
}

.markdown-body :deep(li + li) {
  margin-top: 0.25rem;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-subtle);
  margin: 1rem 0;
}

.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.75rem 0;
  font-size: 0.875em;
  display: block;
  overflow-x: auto;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--border-subtle);
  padding: 0.45em 0.7em;
  text-align: left;
}

.markdown-body :deep(th) {
  background: var(--bg-canvas-soft);
  font-weight: 600;
}

.markdown-body :deep(img) {
  display: block;
  max-width: 100%;
  max-height: 520px;
  object-fit: contain;
  border-radius: 8px;
  margin: 0.65rem 0;
}
</style>
