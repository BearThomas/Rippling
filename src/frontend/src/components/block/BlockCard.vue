<!--
  板块目录卡片（适配 Elk 2 列轻量目录网格）

  无高饱和度彩虹徽章；极淡中性图标容器 + 板块名 + 一句话简介 + 成员数 + 申请入口。
-->
<script setup lang="ts">
import { useRouter } from "vue-router";
import AppSvgIcon from "../layout/AppSvgIcon.vue";
import type { BlockInfo } from "../../types";

const props = withDefaults(
  defineProps<{
    block: BlockInfo;
    mode?: "mine" | "recommend";
    applied?: boolean;
    applying?: boolean;
  }>(),
  { mode: "mine", applied: false, applying: false }
);

const emit = defineEmits<{ join: [] }>();
const router = useRouter();

function openDetail(): void {
  void router.push({ name: "block-detail", params: { id: props.block.id } });
}

function handleJoin(event: MouseEvent): void {
  event.stopPropagation();
  if (props.applied || props.applying) return;
  emit("join");
}
</script>

<template>
  <article
    class="flex h-full w-full cursor-pointer flex-col justify-between rounded-xl border border-subtle bg-surface p-4 hover:border-strong hover:bg-hover pressable"
    role="button"
    tabindex="0"
    @click="openDetail"
    @keydown.enter="openDetail"
  >
    <div>
      <div class="flex items-start gap-3">
        <span
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-canvas-soft text-primary"
        >
          <AppSvgIcon name="blocks" :size="18" />
        </span>

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <h3 class="truncate text-[15px] font-semibold leading-5 text-ink">
              {{ block.name }}
            </h3>
            <span
              v-if="block.isLocked"
              class="tag-pill !px-1.5 !py-0 text-[11px]"
              title="已锁定"
            >
              <AppSvgIcon name="lock" :size="10" />
              锁定
            </span>
          </div>
          <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-secondary">
            {{ block.description || "暂无板块简介" }}
          </p>
        </div>
      </div>
    </div>

    <div class="mt-3 flex items-center justify-between gap-2 border-t border-subtle pt-2.5">
      <span
        v-if="block.memberCount !== undefined"
        class="inline-flex items-center gap-1 text-xs tabular-nums text-ink-muted"
      >
        <AppSvgIcon name="users" :size="13" />
        {{ block.memberCount }} 成员
      </span>
      <span v-else class="text-xs text-ink-muted">点击进入</span>

      <button
        v-if="mode === 'recommend'"
        type="button"
        class="shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium pressable disabled:opacity-50"
        :class="
          applied
            ? 'border border-subtle bg-canvas-soft text-ink-muted'
            : 'bg-primary text-white hover:opacity-90'
        "
        :disabled="applied || applying"
        @click="handleJoin"
      >
        {{ applying ? "申请中…" : applied ? "审核中" : "申请加入" }}
      </button>

      <AppSvgIcon
        v-else
        name="chevronRight"
        :size="15"
        class="shrink-0 text-ink-muted"
      />
    </div>
  </article>
</template>
