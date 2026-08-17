<!--
  用户信息卡片

  展示头像（无则首字占位）、用户名 + 名字颜色 + 牌子、
  关注数 / 粉丝数；他人主页显示关注按钮，本人主页由父组件插槽替换。
-->
<script setup lang="ts">
import { computed } from "vue";
import FollowButton from "./FollowButton.vue";
import type { UserPublicProfile } from "../../types";

const props = defineProps<{
  /** 用户公开资料 */
  profile: UserPublicProfile;
  /** 是否查看自己 */
  isSelf: boolean;
}>();

const emit = defineEmits<{
  /** 关注状态切换成功（用于同步粉丝数） */
  "follow-change": [next: boolean];
}>();

/** 头像占位：用户名首字 */
const avatarChar = computed(() => props.profile.username.slice(0, 1) || "?");
</script>

<template>
  <div class="card-base">
    <div class="flex items-start gap-3">
      <!-- 头像（无头像时首字占位） -->
      <template v-if="profile.avatar">
        <img
          :src="profile.avatar"
          :alt="profile.username"
          class="h-14 w-14 shrink-0 rounded-full object-cover"
        />
      </template>
      <span
        v-else
        class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-semibold text-white"
        style="background: var(--c-primary)"
      >
        {{ avatarChar }}
      </span>

      <!-- 用户名 + 牌子 + 关注按钮 -->
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <p
            class="truncate text-lg font-semibold"
            :style="profile.nameColor ? `color: ${profile.nameColor}` : ''"
          >
            {{ profile.username }}
          </p>
          <!-- 名字牌子（认证 / 头衔标识） -->
          <span
            v-if="profile.badge"
            class="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-soft"
          >
            {{ profile.badge }}
          </span>
        </div>

        <!-- 关注数 / 粉丝数 -->
        <div class="mt-2 flex gap-5 text-sm">
          <span>
            <b class="font-semibold">{{ profile.followingCount }}</b>
            <span class="ml-1 text-ink-soft">关注</span>
          </span>
          <span>
            <b class="font-semibold">{{ profile.followerCount }}</b>
            <span class="ml-1 text-ink-soft">粉丝</span>
          </span>
        </div>
      </div>

      <!-- 他人主页：关注按钮 -->
      <FollowButton
        v-if="!isSelf"
        :user-id="profile.userId"
        :following="profile.isFollowedByMe"
        @change="emit('follow-change', $event)"
      />
    </div>
  </div>
</template>
