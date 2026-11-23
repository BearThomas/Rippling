<!--
  成员列表项（板块管理面板）

  采用 Elk 紧凑分割行，右侧操作收口为 AppDropdown（reka-ui DropdownMenu），
  替代旧版行内展开按钮条，避免触发布局跳动。
-->
<script setup lang="ts">
import { computed } from "vue";
import AppDropdown, { type DropdownItem } from "../common/AppDropdown.vue";
import UserAvatar from "../user/UserAvatar.vue";
import type { BlockMemberInfo } from "../../api/block";
import { formatDateTime } from "../../utils/format";

const props = defineProps<{ member: BlockMemberInfo }>();

const emit = defineEmits<{
  "edit-permissions": [];
  remove: [];
  blacklist: [];
}>();

const isOwner = computed(() => props.member.role === "owner");

const menuItems: readonly DropdownItem[] = [
  { key: "edit-permissions", label: "修改权限", icon: "sliders" },
  { key: "remove", label: "移除成员", icon: "logout", separatorBefore: true },
  { key: "blacklist", label: "加入黑名单", icon: "shield", danger: true },
];

function onSelectAction(key: string): void {
  if (key === "edit-permissions") emit("edit-permissions");
  else if (key === "remove") emit("remove");
  else if (key === "blacklist") emit("blacklist");
}
</script>

<template>
  <div class="flex items-center gap-3 border-b border-subtle px-4 py-3 sm:px-5">
    <UserAvatar :name="member.username || '?'" size="md" />

    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-1.5">
        <span class="truncate text-sm font-medium text-ink">
          {{ member.username || "未知用户" }}
        </span>
        <span
          :class="isOwner ? 'tag-pill-accent' : 'tag-pill'"
          class="!px-2 !py-0 text-[11px]"
        >
          {{ isOwner ? "板块长" : "成员" }}
        </span>
      </div>
      <p class="mt-0.5 text-xs tabular-nums text-ink-muted">
        加入于 {{ formatDateTime(member.joinedAt) }}
      </p>
    </div>

    <!-- 操作菜单（板块长不可操作） -->
    <AppDropdown
      v-if="!isOwner"
      :items="menuItems"
      trigger-label="成员操作"
      @select="onSelectAction"
    />
  </div>
</template>
