<!--
  轻量下拉操作菜单（基于 reka-ui DropdownMenu）

  适用于帖子/板块更多操作、成员行操作等，自动处理碰撞避让、ESC、外部点击与键盘上下键。
-->
<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "reka-ui";
import AppSvgIcon from "../layout/AppSvgIcon.vue";

export interface DropdownItem {
  key: string;
  label: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

withDefaults(
  defineProps<{
    /** 菜单项列表 */
    items: readonly DropdownItem[];
    /** 对齐方式 */
    align?: "start" | "center" | "end";
    /** 展开方向 */
    side?: "top" | "bottom";
    /** 触发器与菜单间距（px） */
    sideOffset?: number;
    /** 默认触发按钮无障碍文案 */
    triggerLabel?: string;
  }>(),
  {
    align: "end",
    side: "bottom",
    sideOffset: 6,
    triggerLabel: "更多操作",
  }
);

const emit = defineEmits<{
  select: [key: string];
}>();
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <slot name="trigger">
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-hover hover:text-ink pressable"
          :aria-label="triggerLabel"
          @click.stop
        >
          <AppSvgIcon name="moreHorizontal" :size="18" />
        </button>
      </slot>
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
        :align="align"
        :side="side"
        :side-offset="sideOffset"
        class="panel-pop z-[80] min-w-[152px] rounded-xl border border-subtle bg-surface p-1 shadow-popover outline-none"
        @click.stop
      >
        <template v-for="item in items" :key="item.key">
          <DropdownMenuSeparator
            v-if="item.separatorBefore"
            class="my-1 h-px bg-subtle"
          />
          <DropdownMenuItem
            :disabled="item.disabled"
            class="flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
            :class="
              item.danger
                ? 'text-danger data-[highlighted]:bg-danger-soft'
                : 'text-ink data-[highlighted]:bg-hover'
            "
            @select="emit('select', item.key)"
          >
            <AppSvgIcon
              v-if="item.icon"
              :name="item.icon"
              :size="15"
              class="shrink-0 opacity-85"
            />
            <span class="flex-1 truncate">{{ item.label }}</span>
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
