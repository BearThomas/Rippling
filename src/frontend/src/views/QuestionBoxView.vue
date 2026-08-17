<!--
  提问箱页（骨架实现）

  按路由参数 :userId 查看对应用户的提问箱；
  提问 / 回答交互后续任务完善。
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { getQuestionBox, listQuestions } from "../api/question";
import type { QuestionBoxInfo, QuestionInfo } from "../types";

const route = useRoute();
const ownerId = route.params.userId as string;

const loading = ref(true);
const error = ref(false);
const box = ref<QuestionBoxInfo | null>(null);
const questions = ref<QuestionInfo[]>([]);

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    box.value = await getQuestionBox(ownerId);
    questions.value = await listQuestions(ownerId);
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="px-3 pt-3">
    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" message="提问箱不存在或无权访问" @retry="load" />

    <template v-else-if="box">
      <!-- 未开启 -->
      <EmptyState v-if="!box.enabled" text="TA 还没有开启提问箱" icon="message" />

      <template v-else>
        <!-- 已回答的问题 -->
        <div v-if="questions.length > 0" class="space-y-3">
          <div v-for="q in questions" :key="q.id" class="card-base">
            <p class="text-sm font-medium">问：{{ q.content }}</p>
            <p v-if="q.answer" class="mt-2 text-sm text-ink-soft">答：{{ q.answer }}</p>
          </div>
        </div>
        <EmptyState v-else text="还没有问题，来提第一个吧" icon="message" />
      </template>
    </template>
  </div>
</template>
