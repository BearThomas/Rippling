<!--
  提问列表项

  展示问题内容、回答（如有）与回答时间；
  箱主视角额外显示「回答 / 重新回答」与删除按钮。
-->
<script setup lang="ts">
import AppSvgIcon from "../layout/AppSvgIcon.vue";
import { formatDateTime } from "../../utils/format";
import type { QuestionInfo } from "../../types";

defineProps<{
  question: QuestionInfo;
  /** 当前用户是否为箱主 */
  isOwner: boolean;
}>();

const emit = defineEmits<{
  /** 箱主点击回答（父组件展开内联输入） */
  answer: [];
  /** 箱主删除问题 */
  delete: [];
}>();
</script>

<template>
  <div class="card-base">
    <!-- 问题内容（提问者永远匿名，不展示提问人） -->
    <p class="text-sm font-medium leading-relaxed">
      <span class="mr-1 rounded bg-page px-1.5 py-0.5 text-xs text-ink-soft">问</span>
      {{ question.content }}
    </p>

    <!-- 回答内容（已回答时展示） -->
    <div
      v-if="question.answered && question.answer"
      class="mt-3 rounded-lg bg-page p-3"
    >
      <p class="text-sm leading-relaxed">{{ question.answer }}</p>
      <p v-if="question.answeredAt" class="mt-2 text-xs text-ink-soft">
        回答于 {{ formatDateTime(question.answeredAt) }}
      </p>
    </div>

    <!-- 箱主操作区 -->
    <div v-if="isOwner" class="mt-3 flex items-center justify-between border-t border-line pt-3">
      <span v-if="!question.answered" class="text-xs text-accent">待回答</span>
      <span v-else class="text-xs text-ink-soft">已回答</span>

      <div class="flex gap-3">
        <button
          type="button"
          class="flex items-center gap-1 text-sm text-primary transition-opacity active:opacity-70"
          @click="emit('answer')"
        >
          <AppSvgIcon name="edit" :size="14" />
          {{ question.answered ? "修改回答" : "回答" }}
        </button>
        <button
          type="button"
          class="flex items-center gap-1 text-sm text-red-500 transition-opacity active:opacity-70"
          @click="emit('delete')"
        >
          <AppSvgIcon name="trash" :size="14" />
          删除
        </button>
      </div>
    </div>
  </div>
</template>
