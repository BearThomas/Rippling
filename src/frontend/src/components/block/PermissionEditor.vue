<!--
  权限编辑弹窗（板块管理面板）

  以开关列表展示 15 个板块权限位（BLOCK_PERMISSION_BITS），
  保存时将开关状态还原为十进制权限掩码字符串。

  props：
    - visible：是否显示
    - username：编辑对象的用户名（标题展示）
    - permissions：当前权限掩码（十进制字符串）
    - saving：保存进行中

  emit：
    - save(permissions: string)：点击保存
    - close：关闭弹窗
-->
<script setup lang="ts">
import { reactive, watch } from "vue";
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

/** 各权限位开关状态（bit → boolean） */
const switches = reactive<Record<number, boolean>>({});

/** 弹窗打开时，根据传入权限掩码初始化开关 */
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

/** 切换某个权限位 */
function toggle(bit: number): void {
  switches[bit] = !switches[bit];
}

/** 将开关状态还原为十进制掩码字符串并触发保存 */
function handleSave(): void {
  let mask = 0n;
  for (const { bit } of BLOCK_PERMISSION_BITS) {
    if (switches[bit]) mask |= 1n << BigInt(bit);
  }
  emit("save", mask.toString());
}
</script>

<template>
  <!-- 遮罩层 -->
  <div
    v-if="visible"
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
    @click.self="emit('close')"
  >
    <!-- 底部弹出面板（移动端友好） -->
    <div class="w-full max-w-app rounded-t-2xl bg-surface p-4 pb-6">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-base font-semibold">编辑权限 — {{ username }}</h3>
        <button
          type="button"
          class="rounded-full px-2 py-1 text-sm text-ink-soft active:bg-line"
          @click="emit('close')"
        >
          关闭
        </button>
      </div>

      <!-- 权限开关列表 -->
      <div class="max-h-[50vh] space-y-1 overflow-y-auto">
        <button
          v-for="item in BLOCK_PERMISSION_BITS"
          :key="item.bit"
          type="button"
          class="flex w-full items-center justify-between rounded-lg px-2 py-2.5 transition-colors active:bg-line"
          @click="toggle(item.bit)"
        >
          <span class="text-sm">{{ item.label }}</span>
          <!-- 开关样式 -->
          <span
            class="relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors"
            :class="switches[item.bit] ? 'bg-primary' : 'bg-line'"
          >
            <span
              class="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
              :class="switches[item.bit] ? 'left-[18px]' : 'left-0.5'"
            />
          </span>
        </button>
      </div>

      <!-- 保存按钮 -->
      <button
        type="button"
        class="btn-primary mt-4 w-full"
        :disabled="saving"
        @click="handleSave"
      >
        {{ saving ? "保存中…" : "保存" }}
      </button>
    </div>
  </div>
</template>
