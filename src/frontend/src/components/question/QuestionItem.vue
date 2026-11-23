<!--
  提问箱问答卡片（Memos 风格轻白卡）

  修正主次层次（DESIGN.md 第 6 节）：
    - 提问区：--bg-canvas-soft 浅底色柔和块，克制展示匿名提问
    - 回答区：纯白主文（15px / 1.7 行高），突出箱主回应的主角地位
    - 支持 #editor 插槽让箱主内联回答无缝融入同一张卡片
-->
<script setup lang="ts">
import AppSvgIcon from "../layout/AppSvgIcon.vue";
import { formatDateTime } from "../../utils/format";
import type { QuestionInfo } from "../../types";

withDefaults(
  defineProps<{
    question: QuestionInfo;
    /** 当前用户是否为箱主 */
    isOwner: boolean;
    /** 是否处于内联编辑回答态 */
    editing?: boolean;
  }>(),
  { editing: false }
);

const emit = defineEmits<{
  answer: [];
  delete: [];
}>();
</script>

<template>
  <article class="memo-card">
    <!-- 提问区：浅底色柔和块 -->
    <div class="rounded-lg bg-canvas-soft px-3.5 py-3">
      <div class="mb-1.5 flex items-center justify-between gap-2">
        <span class="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted">
          <AppSvgIcon name="helpCircle" :size="13" />
          匿名提问
        </span>
        <span
          v-if="isOwner && !question.answered"
          class="tag-pill-warm !px-2 !py-0 text-[11px]"
        >
          待回答
        </span>
      </div>
      <p class="whitespace-pre-line break-words text-sm leading-6 text-ink-secondary">
        {{ question.content }}
      </p>
    </div>

    <!-- 内联编辑回答插槽（箱主点击回答时无缝展开） -->
    <div v-if="editing" class="mt-3.5">
      <slot name="editor" />
    </div>

    <!-- 回答区：纯白主文（突出回答主角） -->
    <template v-else>
      <div v-if="question.answered && question.answer" class="mt-3.5 px-0.5">
        <p class="whitespace-pre-line break-words text-[15px] leading-[1.7] text-ink">
          {{ question.answer }}
        </p>
        <time
          v-if="question.answeredAt"
          class="mt-2 block text-xs tabular-nums text-ink-muted"
          :datetime="question.answeredAt"
        >
          回答于 {{ formatDateTime(question.answeredAt) }}
        </time>
      </div>

      <!-- 箱主操作栏 -->
      <div
        v-if="isOwner"
        class="mt-3.5 flex items-center justify-between border-t border-subtle pt-3 text-xs"
      >
        <span class="text-ink-muted">
          {{ question.answered ? "已公开展示" : "仅你可见，回答后公开" }}
        </span>

        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-medium text-primary hover:bg-accent-soft pressable"
            @click="emit('answer')"
          >
            <AppSvgIcon name="edit" :size="13" />
            {{ question.answered ? "修改回答" : "写回答" }}
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-ink-muted hover:bg-danger-soft hover:text-danger pressable"
            @click="emit('delete')"
          >
            <AppSvgIcon name="trash" :size="13" />
            删除
          </button>
        </div>
      </div>
    </template>
  </article>
</template>
