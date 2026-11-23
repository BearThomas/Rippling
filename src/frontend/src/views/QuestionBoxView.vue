<!--
  提问箱页 — Memos 问答轻白卡流

  设计要点（DESIGN.md 第 1、6 节）：
    - 画布由 AppLayout 自动切至 --bg-canvas-soft
    - 顶部简洁箱主头卡（带 UserAvatar 与状态胶囊）+ 内联匿名提问卡
    - 问答列表使用 QuestionItem 轻白卡（提问浅底、回答纯白主文），箱主内联回答无缝融入卡片
    - 删除二次确认替换为全局 ConfirmDialog
-->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import FeedSkeleton from "../components/common/FeedSkeleton.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import QuestionItem from "../components/question/QuestionItem.vue";
import UserAvatar from "../components/user/UserAvatar.vue";
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
import { confirmAction } from "../composables/useConfirm";
import type { QuestionBoxInfo, QuestionInfo, UserPublicProfile } from "../types";

const PAGE_SIZE = 20;
const CONTENT_MAX = 500;

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const ownerId = computed(() => route.params.userId as string);
const isOwner = computed(() => Boolean(auth.userId) && auth.userId === ownerId.value);

const loading = shallowRef(true);
const error = shallowRef(false);
const box = ref<QuestionBoxInfo | null>(null);
const owner = ref<UserPublicProfile | null>(null);
const questions = ref<QuestionInfo[]>([]);
const hasMore = shallowRef(false);
const listLoading = shallowRef(false);

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    const [boxData, ownerData] = await Promise.all([
      getQuestionBox(ownerId.value),
      getUserProfile(ownerId.value),
    ]);
    box.value = boxData;
    owner.value = ownerData;
    questions.value = [];
    await loadQuestions(true);
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

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

const questionDraft = shallowRef("");
const asking = shallowRef(false);

const needFollowToAsk = computed(
  () =>
    Boolean(box.value?.enabled) &&
    Boolean(box.value?.onlyFollowers) &&
    !isOwner.value &&
    !owner.value?.isFollowedByMe
);

const canAsk = computed(
  () => Boolean(auth.isLoggedIn) && !isOwner.value && Boolean(box.value?.enabled)
);

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
    // client.ts 已自动 Toast
  } finally {
    asking.value = false;
  }
}

function onAskBlocked(): void {
  if (!auth.isLoggedIn) {
    void router.push({ path: "/login", query: { redirect: route.fullPath } });
    return;
  }
  showToast("需要关注 TA 后才能提问", "error");
}

const activeAnswerId = shallowRef<string | null>(null);
const answerDraft = shallowRef("");
const answering = shallowRef(false);

function openAnswer(question: QuestionInfo): void {
  activeAnswerId.value = question.id;
  answerDraft.value = question.answer ?? "";
}

function closeAnswer(): void {
  activeAnswerId.value = null;
  answerDraft.value = "";
}

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

async function handleDelete(question: QuestionInfo): Promise<void> {
  const confirmed = await confirmAction({
    title: "确定删除这条提问吗？",
    description: "删除后将无法恢复展示。",
    confirmText: "删除",
    variant: "danger",
  });
  if (!confirmed) return;

  try {
    await deleteQuestion(question.id);
    showToast("已删除", "success");
    questions.value = questions.value.filter((q) => q.id !== question.id);
  } catch {
    // client.ts 已自动 Toast
  }
}

watch(ownerId, (next, prev) => {
  if (next && next !== prev) void load();
});

onMounted(load);
</script>

<template>
  <div class="px-3.5 pb-10 pt-4 sm:px-5 sm:pt-5">
    <FeedSkeleton v-if="loading" variant="memos" :count="3" />
    <ErrorState v-else-if="error" message="提问箱加载失败" @retry="load" />

    <template v-else-if="box && owner">
      <!-- 顶部箱主信息轻白卡 -->
      <header class="memo-card flex items-center gap-3">
        <RouterLink
          :to="{ name: 'user-profile', params: { id: ownerId } }"
          class="shrink-0"
        >
          <UserAvatar
            :src="owner.avatar"
            :name="owner.username"
            :name-color="owner.nameColor"
            size="lg"
          />
        </RouterLink>

        <div class="min-w-0 flex-1">
          <p
            class="truncate text-[15px] font-semibold leading-5 text-ink"
            :style="owner.nameColor ? { color: owner.nameColor } : undefined"
          >
            {{ owner.username }} 的提问箱
          </p>
          <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span :class="box.enabled ? 'tag-pill-accent' : 'tag-pill'">
              {{ box.enabled ? "已开启" : "未开启" }}
            </span>
            <span v-if="box.enabled && box.onlyFollowers" class="tag-pill">
              仅粉丝可提问
            </span>
          </div>
        </div>

        <RouterLink
          v-if="isOwner"
          to="/settings"
          class="btn-secondary shrink-0 !px-3 !py-1.5 text-xs"
        >
          设置
        </RouterLink>
        <RouterLink
          v-else
          :to="{ name: 'user-profile', params: { id: ownerId } }"
          class="inline-flex shrink-0 items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-accent-soft pressable"
        >
          TA 的主页
          <AppSvgIcon name="chevronRight" :size="14" />
        </RouterLink>
      </header>

      <!-- 未启用提示 -->
      <EmptyState
        v-if="!box.enabled"
        text="提问箱未开启"
        :description="isOwner ? '前往「设置 → 提问箱设置」即可开启接收匿名提问。' : '对方暂未开放匿名提问。'"
        icon="helpCircle"
      >
        <RouterLink v-if="isOwner" to="/settings" class="btn-primary !py-2 text-xs">
          前往设置开启
        </RouterLink>
      </EmptyState>

      <template v-else>
        <!-- Memos 内联匿名提问卡（登录且非本人） -->
        <section
          v-if="canAsk || needFollowToAsk"
          class="memo-card mt-3 transition-colors focus-within:border-primary"
        >
          <textarea
            v-model="questionDraft"
            rows="3"
            aria-label="匿名提问内容"
            class="w-full resize-none bg-transparent text-[15px] leading-[1.7] text-ink outline-none placeholder:text-ink-muted disabled:opacity-50"
            :maxlength="CONTENT_MAX"
            :disabled="needFollowToAsk || asking"
            placeholder="想问 TA 点什么？提问完全匿名，箱主回答后将公开展示…"
          />
          <div class="mt-2.5 flex items-center gap-2 border-t border-subtle pt-2.5">
            <span class="inline-flex items-center gap-1 text-xs text-ink-muted">
              <AppSvgIcon name="lock" :size="12" />
              完全匿名
            </span>
            <span class="ml-auto text-xs tabular-nums text-ink-muted">
              {{ questionDraft.length }}/{{ CONTENT_MAX }}
            </span>
            <button
              v-if="needFollowToAsk"
              type="button"
              class="btn-secondary !rounded-full !px-3.5 !py-1.5 text-xs"
              @click="onAskBlocked"
            >
              需关注后提问
            </button>
            <button
              v-else
              type="button"
              class="btn-primary !rounded-full !px-4 !py-1.5 text-xs"
              :disabled="!questionDraft.trim() || asking"
              @click="submitQuestion"
            >
              {{ asking ? "提交中…" : "匿名提问" }}
            </button>
          </div>
        </section>

        <!-- 游客登录引导 -->
        <div
          v-else-if="!isOwner && !auth.isLoggedIn"
          class="memo-card mt-3 flex items-center justify-between gap-3 text-sm text-ink-secondary"
        >
          <span>登录后即可向 TA 发起匿名提问</span>
          <RouterLink
            :to="{ path: '/login', query: { redirect: route.fullPath } }"
            class="btn-primary shrink-0 !rounded-full !px-4 !py-1.5 text-xs"
          >
            去登录
          </RouterLink>
        </div>

        <!-- 问答轻白卡流 -->
        <section class="mt-4 space-y-3">
          <QuestionItem
            v-for="question in questions"
            :key="question.id"
            :question="question"
            :is-owner="isOwner"
            :editing="isOwner && activeAnswerId === question.id"
            @answer="openAnswer(question)"
            @delete="handleDelete(question)"
          >
            <template #editor>
              <textarea
                v-model="answerDraft"
                rows="3"
                class="input-base resize-y leading-relaxed"
                :maxlength="CONTENT_MAX"
                placeholder="写下你的回答…提交后将与问题一起公开展示"
              />
              <div class="mt-2.5 flex items-center justify-between gap-2">
                <span class="text-xs tabular-nums text-ink-muted">
                  {{ answerDraft.length }}/{{ CONTENT_MAX }}
                </span>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="btn-secondary !px-3.5 !py-1.5 text-xs"
                    :disabled="answering"
                    @click="closeAnswer"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    class="btn-primary !px-3.5 !py-1.5 text-xs"
                    :disabled="!answerDraft.trim() || answering"
                    @click="submitAnswer(question.id)"
                  >
                    {{ answering ? "提交中…" : "公开回答" }}
                  </button>
                </div>
              </div>
            </template>
          </QuestionItem>

          <EmptyState
            v-if="questions.length === 0 && !listLoading"
            :text="isOwner ? '还没有收到提问' : '还没有已回答的问题'"
            :description="isOwner ? '把你的主页分享给同学，就能收到大家的匿名提问啦。' : '成为第一个向 TA 提问的人吧。'"
            icon="helpCircle"
          />

          <div v-if="hasMore" class="pt-2 text-center">
            <button
              type="button"
              class="btn-secondary !py-1.5 text-xs"
              :disabled="listLoading"
              @click="loadQuestions(false)"
            >
              {{ listLoading ? "加载中…" : "加载更多" }}
            </button>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>
