<!--
  统一标签页导航栏（基于 reka-ui Tabs）

  支持两种风格：
    - underline：Elk 风格下划线指示器（个人主页 / 通知 / 管理面板 / 关注列表）
    - pills：轻量横向胶囊切换（搜索分类 / 发帖写作与预览）
  提供标准 role="tablist" 与键盘左右方向键导航。
-->
<script setup lang="ts">
import { TabsList, TabsRoot, TabsTrigger } from "reka-ui";

export interface TabOption {
  value: string;
  label: string;
  count?: number | string;
  disabled?: boolean;
}

withDefaults(
  defineProps<{
    modelValue: string;
    items: readonly TabOption[];
    variant?: "underline" | "pills";
    stretch?: boolean;
    ariaLabel?: string;
  }>(),
  {
    variant: "underline",
    stretch: false,
    ariaLabel: undefined,
  }
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

function onUpdate(val: string | number): void {
  emit("update:modelValue", String(val));
}
</script>

<template>
  <TabsRoot :model-value="modelValue" @update:model-value="onUpdate">
    <!-- Elk 下划线 Tab -->
    <TabsList
      v-if="variant === 'underline'"
      :aria-label="ariaLabel"
      class="scrollbar-none flex overflow-x-auto border-b border-subtle"
      :class="stretch ? 'w-full' : 'gap-1 px-2 sm:px-3'"
    >
      <TabsTrigger
        v-for="item in items"
        :key="item.value"
        :value="item.value"
        :disabled="item.disabled"
        class="relative shrink-0 whitespace-nowrap px-3 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink disabled:opacity-40 data-[state=active]:font-semibold data-[state=active]:text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity after:content-[''] data-[state=active]:after:opacity-100"
        :class="stretch ? 'flex-1 text-center' : ''"
      >
        <span>{{ item.label }}</span>
        <span
          v-if="item.count !== undefined && item.count !== ''"
          class="ml-1 text-xs tabular-nums text-ink-muted"
        >
          {{ item.count }}
        </span>
      </TabsTrigger>
    </TabsList>

    <!-- 轻量胶囊 Tab -->
    <TabsList
      v-else
      :aria-label="ariaLabel"
      class="scrollbar-none flex gap-1.5 overflow-x-auto"
      :class="stretch ? 'w-full' : ''"
    >
      <TabsTrigger
        v-for="item in items"
        :key="item.value"
        :value="item.value"
        :disabled="item.disabled"
        class="shrink-0 whitespace-nowrap rounded-full bg-hover px-3.5 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:text-ink disabled:opacity-40 data-[state=active]:bg-primary data-[state=active]:text-white"
        :class="stretch ? 'flex-1 text-center' : ''"
      >
        <span>{{ item.label }}</span>
        <span
          v-if="item.count !== undefined && item.count !== ''"
          class="ml-1 tabular-nums opacity-80"
        >
          {{ item.count }}
        </span>
      </TabsTrigger>
    </TabsList>

    <slot />
  </TabsRoot>
</template>
