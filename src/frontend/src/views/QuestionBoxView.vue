<!--
  提问箱页

  按路由参数 :userId 查看对应用户的提问箱：
  - 未启用显示「提问箱未开启」；
  - 登录的非本人用户可匿名提问（仅粉丝可提问时未关注则禁用）；
  - 已回答的问题公开展示，未回答的仅箱主可见（后端过滤）；
  - 箱主可内联回答 / 修改回答、删除问题（软删除）。
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import QuestionItem from "../components/question/QuestionItem.vue";
import {
  getQuestionBox,
  listQuestions,
  createQuestion,
  answerQuestion,
  deleteQuestion,
} from "../api/question";
import { getUserProfile } from "../api/user";
import { useAuthStore } from "../stores/auth";
import { showToast } from "../utils/toast";
import type { QuestionBoxInfo, QuestionInfo, UserPublicProfile } from "../types";

/** 分页大小 */
const PAGE_SIZE = 20;
/** 提问 / 回答字数上限（与后端一致） */
const CONTENT_MAX = 500;

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

/** 箱主 ID（路由参数） */
const ownerId = computed(() => route.params.userId as string);

/** 当前用户是否为箱主 */
const isOwner = computed(() => !!auth.userId && auth.userId === ownerId.value);

// ------------------------------------------------------------
//  数据加载
// ------------------------------------------------------------

const loading = ref(true);
const error = ref(false);
const box = ref<QuestionBoxInfo | null>(null);
const owner = ref<UserPublicProfile | null>(null);
const questions = ref<QuestionInfo[]>([]);
const hasMore = ref(false);
const listLoading = ref(false);

/** 拉取提问箱设置 + 箱主资料 + 问题列表 */
async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    // 三个请求互不依赖，并行发出
    const [boxData, ownerData] = await Promise.all([
      getQuestionBox(ownerId.value),
      getUserProfile(ownerId.value),
    ]);
    box.value = boxData;
    owner.value = ownerData;
    questions.value = [];
    // 未启用时也拉一次列表（箱主可能想看历史问题）
    await loadQuestions(true);
  } catch {
    error.value = true; // client.ts 已自动 Toast
  } finally {
    loading.value = false;
  }
}

/** 加载问题列表（reset 时从第一页开始） */
async function loadQuestions(reset: boolean): Promise<void> {
  if (listLoading.value) return;
  listLoading.value = true;
  try {
    const offset = reset ? 0 : questions.value.length;
    const page = await listQuestions(ownerId.value, PAGE_SIZE, offset);
    questions.value = reset ? page : questions.value.concat(page);
    hasMore.value = page.length === PAGE_SIZE;
  } catch {
    // client.ts 已自动 Toast
  } finally {
    listLoading.value = false;
  }
}

// ------------------------------------------------------------
//  提问
// ------------------------------------------------------------

const questionDraft = ref("");
const asking = ref(false);

/** 仅粉丝可提问且未关注 → 禁用提问 */
const needFollowToAsk = computed(
  () =>
    !!box.value?.enabled &&
    !!box.value?.onlyFollowers &&
    !isOwner.value &&
    !owner.value?.isFollowedByMe
);

/** 是否可展示提问输入框（登录 + 非本人 + 已启用） */
const canAsk = computed(
  () => !!auth.isLoggedIn && !isOwner.value && !!box.value?.enabled
);

/** 提交提问（匿名，askerId 由后端保证不返回） */
async function submitQuestion(): Promise<void> {
  const content = questionDraft.value.trim();
  if (!content) {
    showToast("请输入问题内容", "error");
    return;
  }
  if (content.length > CONTENT_MAX) {
    showToast(`内容不能超过 ${CONTENT_MAX} 字`, "error");
    return;
  }

  asking.value = true;
  try {
    await createQuestion(ownerId.value, content);
    showToast("提问成功，回答后公开展示", "success");
    questionDraft.value = "";
  } catch {
    // client.ts 已自动 Toast（未启用 / 仅粉丝等）
  } finally {
    asking.value = false;
  }
}

/** 未关注时点击提问 → 引导关注 */
function onAskBlocked(): void {
  if (!auth.isLoggedIn) {
    router.push({ path: "/login", query: { redirect: route.fullPath } });
    return;
  }
  showToast("需要关注 TA 后才能提问", "error");
}

// ------------------------------------------------------------
//  箱主：回答 / 删除
// ------------------------------------------------------------

/** 正在回答的问题 ID（内联输入框展开标记） */
const activeAnswerId = ref<string | null>(null);
const answerDraft = ref("");
const answering = ref(false);

function openAnswer(question: QuestionInfo): void {
  activeAnswerId.value = question.id;
  answerDraft.value = question.answer ?? "";
}

function closeAnswer(): void {
  activeAnswerId.value = null;
  answerDraft.value = "";
}

/** 提交回答（≤500 字） */
async function submitAnswer(questionId: string): Promise<void> {
  const answer = answerDraft.value.trim();
  if (!answer) {
    showToast("请输入回答内容", "error");
    return;
  }
  if (answer.length > CONTENT_MAX) {
    showToast(`回答不能超过 ${CONTENT_MAX} 字`, "error");
    return;
  }

  answering.value = true;
  try {
    await answerQuestion(questionId, answer);
    showToast("回答成功", "success");
    closeAnswer();
    await loadQuestions(true);
  } catch {
    // client.ts 已自动 Toast
  } finally {
    answering.value = false;
  }
}

/** 删除问题（软删除，二次确认） */
async function handleDelete(question: QuestionInfo): Promise<void> {
  if (!window.confirm("确定删除这条提问吗？删除后不可恢复展示。")) return;
  try {
    await deleteQuestion(question.id);
    showToast("已删除", "success");
    questions.value = questions.value.filter((q) => q.id !== question.id);
  } catch {
    // client.ts 已自动 Toast
  }
}

// 切换箱主（同路由参数变化）时重新加载
watch(ownerId, (next, prev) => {
  if (next && next !== prev) load();
});

onMounted(load);
</script>

<template>
  <div class="px-3 pt-3 pb-8">
    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" message="提问箱加载失败" @retry="load" />

    <template v-else-if="box && owner">
      <!-- 顶部：所有者用户名 + 状态 -->
      <div class="card-base flex items-center justify-between">
        <div class="min-w-0">
          <p
            class="truncate font-semibold"
            :style="owner.nameColor ? `color: ${owner.nameColor}` : ''"
          >
            {{ owner.username }} 的提问箱
          </p>
          <p class="mt-1 text-xs text-ink-soft">
            {{ box.enabled
              ? (box.onlyFollowers ? "已开启 · 仅粉丝可提问" : "已开启")
              : "未开启" }}
          </p>
        </div>
        <RouterLink
          :to="{ name: 'user-profile', params: { id: ownerId } }"
          class="shrink-0 text-sm text-primary"
        >
          主页
        </RouterLink>
      </div>

      <!-- 未启用 -->
      <EmptyState v-if="!box.enabled" text="提问箱未开启" icon="inbox" />

      <template v-else>
        <!-- 提问输入框（登录用户，非本人） -->
        <div v-if="canAsk || needFollowToAsk" class="card-base mt-3">
          <p class="mb-2 text-xs text-ink-soft">
            提问完全匿名，回答后问题与回答将公开展示。
          </p>
          <textarea
            v-model="questionDraft"
            rows="3"
            class="input-base"
            :maxlength="CONTENT_MAX"
            :disabled="needFollowToAsk || asking"
            placeholder="想问点什么？"
          ></textarea>
          <div class="mt-2 flex items-center justify-between">
            <span class="text-xs text-ink-soft">
              {{ questionDraft.length }}/{{ CONTENT_MAX }}
            </span>
            <button
              v-if="needFollowToAsk"
              type="button"
              class="btn-secondary opacity-60"
              @click="onAskBlocked"
            >
              需关注后提问
            </button>
            <button
              v-else
              type="button"
              class="btn-primary"
              :disabled="asking"
              @click="submitQuestion"
            >
              {{ asking ? "提交中…" : "匿名提问" }}
            </button>
          </div>
        </div>
        <!-- 未登录引导 -->
        <div
          v-else-if="!isOwner && !auth.isLoggedIn"
          class="card-base mt-3 text-center text-sm text-ink-soft"
        >
          <RouterLink :to="{ path: '/login', query: { redirect: route.fullPath } }" class="text-primary">
            登录
          </RouterLink>
          后即可向 TA 提问
        </div>

        <!-- 问题列表 -->
        <div class="mt-3 space-y-3">
          <template v-for="question in questions" :key="question.id">
            <!-- 正在回答的问题：展开内联输入 -->
            <div v-if="isOwner && activeAnswerId === question.id" class="card-base">
              <p class="text-sm font-medium leading-relaxed">{{ question.content }}</p>
              <textarea
                v-model="answerDraft"
                rows="3"
                class="input-base mt-3"
                :maxlength="CONTENT_MAX"
                placeholder="写下你的回答…"
              ></textarea>
              <div class="mt-2 flex items-center justify-between">
                <span class="text-xs text-ink-soft">
                  {{ answerDraft.length }}/{{ CONTENT_MAX }}
                </span>
                <div class="flex gap-2">
                  <button type="button" class="btn-secondary" @click="closeAnswer">
                    取消
                  </button>
                  <button
                    type="button"
                    class="btn-primary"
                    :disabled="answering"
                    @click="submitAnswer(question.id)"
                  >
                    {{ answering ? "提交中…" : "提交回答" }}
                  </button>
                </div>
              </div>
            </div>

            <!-- 常规展示 -->
            <QuestionItem
              v-else
              :question="question"
              :is-owner="isOwner"
              @answer="openAnswer(question)"
              @delete="handleDelete(question)"
            />
          </template>

          <EmptyState
            v-if="questions.length === 0 && !listLoading"
            :text="isOwner ? '还没有收到提问' : '还没有已回答的问题'"
            icon="inbox"
          />

          <button
            v-if="hasMore"
            type="button"
            class="btn-secondary w-full"
            :disabled="listLoading"
            @click="loadQuestions(false)"
          >
            {{ listLoading ? "加载中…" : "加载更多" }}
          </button>
        </div>
      </template>
    </template>
  </div>
</template>
