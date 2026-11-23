<!--
  权限编辑弹窗（板块管理面板）

  已升级为 AppDialog（reka-ui Dialog）+ AppSwitch（reka-ui Switch）：
    - 移动端底部 Sheet / 桌面端居中 Modal，具备焦点陷阱、ESC 关闭与滚动锁定
    - 彻底消除旧版 transition-[left] 动效红线违例
    - 保持对外 props（visible/username/permissions/saving）与 emits（save/close）不变
-->
<script setup lang="ts">
import { reactive, watch } from "vue";
import AppDialog from "../common/AppDialog.vue";
import AppSwitch from "../common/AppSwitch.vue";
import { BLOCK_PERMISSION_BITS, hasPermission } from "../../utils/permission";

const props = defineProps<{
  visible: boolean;
  username: string;
  permissions: string;
  saving?: boolean;
}>();

const emit = defineEmits<{
  save: [permissions: string];
  close: [];
}>();

/** 各权限位开关状态（bit -> boolean） */
const switches = reactive<Record<number, boolean>>({});

watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    for (const { bit } of BLOCK_PERMISSION_BITS) {
      switches[bit] = hasPermission(props.permissions, bit);
    }
  },
  { immediate: true }
);

function setBit(bit: number, value: boolean): void {
  switches[bit] = value;
}

function handleSave(): void {
  let mask = 0n;
  for (const { bit } of BLOCK_PERMISSION_BITS) {
    if (switches[bit]) mask |= 1n << BigInt(bit);
  }
  emit("save", mask.toString());
}
</script>

<template>
  <AppDialog
    :open="visible"
    :title="`编辑权限 · ${username}`"
    description="勾选授予该成员的板块内操作权限"
    size="md"
    :dismissible="!saving"
    @close="emit('close')"
  >
    <div class="divide-y divide-subtle">
      <div
        v-for="item in BLOCK_PERMISSION_BITS"
        :key="item.bit"
        class="flex items-center justify-between gap-3 py-2.5"
      >
        <label
          :for="`block-perm-${item.bit}`"
          class="flex-1 cursor-pointer text-sm text-ink select-none"
        >
          {{ item.label }}
        </label>
        <AppSwitch
          :id="`block-perm-${item.bit}`"
          :model-value="Boolean(switches[item.bit])"
          :disabled="saving"
          :aria-label="item.label"
          @update:model-value="setBit(item.bit, $event)"
        />
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-end gap-2.5">
        <button
          type="button"
          class="btn-secondary flex-1 sm:flex-none"
          :disabled="saving"
          @click="emit('close')"
        >
          取消
        </button>
        <button
          type="button"
          class="btn-primary flex-1 sm:flex-none"
          :disabled="saving"
          @click="handleSave"
        >
          {{ saving ? "保存中…" : "保存权限" }}
        </button>
      </div>
    </template>
  </AppDialog>
</template>
