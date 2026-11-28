<!--
  用户主页头部信息区（Elk 风格简洁顶条 + 头像 + 清晰统计数字）

  展示纯色微底顶条、头像（UserAvatar 唯一实现）、用户名 + 名字颜色 + 年级/牌子、
  关注数 / 粉丝数；他人主页右侧显示关注按钮，本人主页可通过 #actions 插槽渲染操作。
-->
<script setup lang="ts">
import FollowButton from "./FollowButton.vue";
import UserAvatar from "./UserAvatar.vue";
import type { UserPublicProfile } from "../../types";

defineProps<{
  /** 用户公开资料 */
  profile: UserPublicProfile;
  /** 是否查看自己 */
  isSelf: boolean;
}>();

const emit = defineEmits<{
  /** 关注状态切换成功（用于同步粉丝数） */
  "follow-change": [next: boolean];
}>();
</script>

<template>
  <header class="border-b border-subtle bg-canvas">
    <!-- 简洁纯色顶条（极淡主色调和，克制无渐变花哨） -->
    <div
      class="h-20 border-b border-subtle"
      style="background-color: color-mix(in srgb, var(--c-primary) 7%, var(--bg-canvas-soft))"
      aria-hidden="true"
    />

    <div class="px-4 pb-4 sm:px-5">
      <!-- 头像与右侧主操作同行 -->
      <div class="flex items-end justify-between gap-3">
        <div class="-mt-8 shrink-0 rounded-full ring-4 ring-[var(--bg-canvas)]">
          <UserAvatar
            :src="profile.avatar"
            :name="profile.username"
            :name-color="profile.nameColor"
            size="2xl"
          />
        </div>

        <div class="flex items-center gap-2 pt-2.5">
          <slot name="actions">
            <FollowButton
              v-if="!isSelf"
              :user-id="profile.userId"
              :following="profile.isFollowedByMe"
              @change="emit('follow-change', $event)"
            />
          </slot>
        </div>
      </div>

      <!-- 用户名 + 年级 / 牌子 -->
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <h1
          class="min-w-0 truncate text-xl font-bold leading-7 text-ink"
          :style="profile.nameColor ? { color: profile.nameColor } : undefined"
        >
          {{ profile.username }}
        </h1>
        <span v-if="profile.grade" class="tag-pill-accent">
          {{ profile.grade }}
        </span>
        <span v-if="profile.badge" class="tag-pill">
          {{ profile.badge }}
        </span>
      </div>

      <!-- 统计数字（tabular-nums 对齐） -->
      <div class="mt-3 flex items-center gap-5 text-sm">
        <RouterLink
          :to="{ name: 'user-following', params: { id: profile.userId } }"
          class="group inline-flex items-baseline gap-1 hover:underline underline-offset-4"
        >
          <span class="font-semibold tabular-nums text-ink">
            {{ profile.followingCount }}
          </span>
          <span class="text-ink-muted group-hover:text-ink-secondary">关注</span>
        </RouterLink>
        <RouterLink
          :to="{ name: 'user-followers', params: { id: profile.userId } }"
          class="group inline-flex items-baseline gap-1 hover:underline underline-offset-4"
        >
          <span class="font-semibold tabular-nums text-ink">
            {{ profile.followerCount }}
          </span>
          <span class="text-ink-muted group-hover:text-ink-secondary">粉丝</span>
        </RouterLink>
      </div>

      <!-- 可选底部补充区域（如本人的快捷按钮行） -->
      <slot name="footer" />
    </div>
  </header>
</template>
