<!--
  Markdown 渲染组件（marked + DOMPurify）

  安全策略：marked 解析后的 HTML 必须经过 DOMPurify 清洗再渲染，
  防止 XSS（脚本注入、事件属性等）。
-->
<script setup lang="ts">
import { computed } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";

const props = withDefaults(
  defineProps<{
    /** Markdown 原文 */
    content: string;
  }>(),
  { content: "" }
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
  <div class="markdown-body text-sm leading-relaxed" v-html="safeHtml" />
</template>

<style scoped>
/* Markdown 渲染基础排版 */
.markdown-body :deep(p) {
  margin: 0.5em 0;
}
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  font-weight: 600;
  margin: 0.8em 0 0.4em;
}
.markdown-body :deep(h1) {
  font-size: 1.25em;
}
.markdown-body :deep(h2) {
  font-size: 1.125em;
}
.markdown-body :deep(a) {
  color: var(--c-primary);
  text-decoration: underline;
}
.markdown-body :deep(code) {
  background: var(--c-border);
  border-radius: 4px;
  padding: 0.1em 0.35em;
  font-size: 0.9em;
}
.markdown-body :deep(pre) {
  background: var(--c-border);
  border-radius: 8px;
  padding: 0.75em;
  overflow-x: auto;
}
.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--c-border);
  padding-left: 0.75em;
  color: var(--c-text-soft);
  margin: 0.5em 0;
}
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.5em;
  margin: 0.5em 0;
}
.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: 8px;
}
</style>
