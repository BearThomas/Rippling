<!--
  关注按钮

  封装关注 / 取消关注的调用与状态切换；
  成功后通过 change 事件通知父组件（用于同步粉丝数等）。
-->
<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { followUser, unfollowUser } from "../../api/follow";
import { useAuthStore } from "../../stores/auth";

const props = defineProps<{
  /** 目标用户 ID */
  userId: string;
  /** 当前是否已关注 */
  following: boolean;
}>();

const emit = defineEmits<{
  /** 关注状态切换成功（next = 切换后的状态） */
  change: [next: boolean];
}>();

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

/** 请求中（防重复点击） */
const busy = ref(false);
/** 本地关注状态（点击即切换，无需刷新页面） */
const state = ref(props.following);

// 外部重新拉取资料后同步（如切换用户主页）
watch(
  () => props.following,
  (next) => {
    state.value = next;
  }
);

/** 切换关注状态 */
async function handleToggle(): Promise<void> {
  if (busy.value) return;

  // 未登录 → 引导登录
  if (!auth.isLoggedIn) {
    router.push({ path: "/login", query: { redirect: route.fullPath } });
    return;
  }

  busy.value = true;
  try {
    if (state.value) {
      await unfollowUser(props.userId);
    } else {
      await followUser(props.userId);
    }
    state.value = !state.value;
    emit("change", state.value);
  } catch {
    // client.ts 已自动 Toast（无权限 / 网络错误等）
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <button
    type="button"
    class="rounded-full px-4 py-1.5 text-sm font-medium transition-opacity active:opacity-70 disabled:opacity-50"
    :class="state ? 'border border-line bg-surface text-ink-soft' : 'text-white'"
    :style="state ? '' : 'background: var(--c-primary)'"
    :disabled="busy"
    @click.stop="handleToggle"
  >
    {{ state ? "已关注" : "关注" }}
  </button>
</template>
