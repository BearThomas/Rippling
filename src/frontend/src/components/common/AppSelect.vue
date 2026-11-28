<!--
  统一下拉选择器（基于 reka-ui Select）

  替换原生 <select>，全平台与深色模式样式一致，支持键盘上下键与 ESC。
  注：reka-ui SelectItem 不接受空字符串 value，空值态由 placeholder 承载。
-->
<script setup lang="ts">
import { computed } from "vue";
import {
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from "reka-ui";
import AppSvgIcon from "../layout/AppSvgIcon.vue";

export interface SelectOptionItem {
  value: string;
  label: string;
  disabled?: boolean;
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    options: readonly SelectOptionItem[];
    placeholder?: string;
    disabled?: boolean;
    ariaLabel?: string;
  }>(),
  {
    placeholder: "请选择",
    disabled: false,
    ariaLabel: undefined,
  }
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

/** 过滤空字符串项，避免 reka-ui SelectItem 报错 */
const validOptions = computed(() => props.options.filter((o) => o.value !== ""));

/** 空串映射为 undefined 以展示 placeholder */
const rootValue = computed(() => (props.modelValue ? props.modelValue : undefined));

function onUpdate(value: unknown): void {
  emit("update:modelValue", value == null ? "" : String(value));
}
</script>

<template>
  <SelectRoot
    :model-value="rootValue"
    :disabled="disabled"
    @update:model-value="onUpdate"
  >
    <SelectTrigger
      class="flex w-full items-center justify-between gap-2 rounded-lg border border-strong bg-surface px-3 py-2.5 text-left text-base text-ink transition-colors hover:border-primary focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm data-[placeholder]:text-ink-muted"
      :aria-label="ariaLabel"
    >
      <SelectValue :placeholder="placeholder" class="truncate" />
      <AppSvgIcon name="chevronDown" :size="16" class="shrink-0 text-ink-muted" />
    </SelectTrigger>

    <SelectPortal>
      <SelectContent
        position="popper"
        :side-offset="4"
        class="panel-pop z-[85] max-h-64 w-[var(--reka-select-trigger-width)] overflow-hidden rounded-xl border border-subtle bg-surface p-1 shadow-popover outline-none"
      >
        <SelectViewport class="max-h-60 overflow-y-auto">
          <SelectItem
            v-for="opt in validOptions"
            :key="opt.value"
            :value="opt.value"
            :disabled="opt.disabled"
            class="relative flex cursor-pointer select-none items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm text-ink outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-hover data-[state=checked]:font-medium data-[state=checked]:text-primary"
          >
            <SelectItemText class="truncate">{{ opt.label }}</SelectItemText>
            <SelectItemIndicator class="shrink-0 text-primary">
              <AppSvgIcon name="check" :size="15" />
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
