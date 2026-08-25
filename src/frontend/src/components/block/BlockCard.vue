<!--
  板块卡片（列表项）

  两种形态：
    - 我的板块（mode="mine"）：整卡可点击进入详情，显示锁定图标
    - 推荐板块（mode="recommend"）：右侧显示"申请加入 / 已申请"按钮

  emit：
    - join：点击申请加入按钮（推荐模式）
-->
<script setup lang="ts">
import { useRouter } from "vue-router";
import AppSvgIcon from "../layout/AppSvgIcon.vue";
import type { BlockInfo } from "../../types";

const props = withDefaults(
  defineProps<{
    block: BlockInfo;
    /** mine = 我的板块（整卡可点）；recommend = 推荐板块（带申请按钮） */
    mode?: "mine" | "recommend";
    /** 推荐模式下是否已提交申请（待审核） */
    applied?: boolean;
    /** 推荐模式下申请按钮是否进行中 */
    applying?: boolean;
  }>(),
  { mode: "mine", applied: false, applying: false }
);

const emit = defineEmits<{ join: [] }>();

const router = useRouter();

/** 进入板块详情 */
function openDetail(): void {
  router.push({ name: "block-detail", params: { id: props.block.id } });
}

/** 申请加入（阻止冒泡，避免触发卡片跳转） */
function handleJoin(event: MouseEvent): void {
  event.stopPropagation();
  if (props.applied || props.applying) return;
  emit("join");
}
</script>

<template>
  <div
    class="card-base cursor-pointer transition-opacity active:opacity-80"
    role="button"
    tabindex="0"
    @click="openDetail"
    @keydown.enter="openDetail"
  >
    <div class="flex items-center gap-2">
      <h3 class="min-w-0 flex-1 truncate font-semibold">{{ block.name }}</h3>
      <!-- 锁定标记 -->
      <span
        v-if="block.isLocked"
        class="flex shrink-0 items-center gap-0.5 rounded bg-[color-mix(in_srgb,var(--c-accent)_12%,transparent)] px-1 text-[10px] text-accent"
      >
        <AppSvgIcon name="lock" :size="10" />
        已锁定
      </span>
      <!-- 成员数（后端提供时展示） -->
      <span
        v-if="block.memberCount !== undefined"
        class="flex shrink-0 items-center gap-0.5 text-xs text-ink-soft"
      >
        <AppSvgIcon name="users" :size="12" />
        {{ block.memberCount }}
      </span>
    </div>

    <div class="mt-1 flex items-end gap-2">
      <p class="min-w-0 flex-1 text-sm leading-relaxed text-ink-soft line-clamp-2">
        {{ block.description || "暂无描述" }}
      </p>

      <!-- 推荐模式：申请按钮 -->
      <button
        v-if="mode === 'recommend'"
        type="button"
        class="btn-primary shrink-0 !px-3 !py-1.5 text-xs"
        :class="applied || applying ? 'opacity-50' : ''"
        :disabled="applied || applying"
        @click="handleJoin"
      >
        {{ applying ? "申请中…" : applied ? "已申请 / 审核中" : "申请加入" }}
      </button>
    </div>
  </div>
</template>
