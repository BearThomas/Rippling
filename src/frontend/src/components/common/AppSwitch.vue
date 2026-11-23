<!--
  统一开关组件（基于 reka-ui Switch）

  仅过渡 background-color 与 transform（translate-x），严格遵循 docs/motion.md 红线，
  彻底替代原生 checkbox 与旧版 transition-[left] 开关。
-->
<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from "reka-ui";

withDefaults(
  defineProps<{
    modelValue: boolean;
    disabled?: boolean;
    ariaLabel?: string;
    id?: string;
  }>(),
  {
    disabled: false,
    ariaLabel: undefined,
    id: undefined,
  }
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

function onUpdate(next: unknown): void {
  emit("update:modelValue", Boolean(next));
}
</script>

<template>
  <SwitchRoot
    :id="id"
    :model-value="modelValue"
    :disabled="disabled"
    :aria-label="ariaLabel"
    class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-strong transition-colors duration-[var(--dur-fast)] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary"
    @update:model-value="onUpdate"
  >
    <SwitchThumb
      class="pointer-events-none block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform duration-[var(--dur-fast)] data-[state=checked]:translate-x-[18px]"
    />
  </SwitchRoot>
</template>
