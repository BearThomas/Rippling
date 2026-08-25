<!--
  成员列表项（板块管理面板）

  展示：用户名、角色标签（板块长 / 成员）、加入时间。
  操作：修改权限、移除成员、加入黑名单（owner 不显示操作按钮）。

  emit：edit-permissions / remove / blacklist
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import type { BlockMemberInfo } from "../../api/block";
import { formatDateTime } from "../../utils/format";

const props = defineProps<{ member: BlockMemberInfo }>();

const emit = defineEmits<{
  "edit-permissions": [];
  remove: [];
  blacklist: [];
}>();

/** 是否为板块长（owner 不可被操作） */
const isOwner = computed(() => props.member.role === "owner");

/** 操作菜单展开状态 */
const menuOpen = ref(false);

/** 切换操作菜单 */
function toggleMenu(): void {
  menuOpen.value = !menuOpen.value;
}

/** 触发操作并收起菜单 */
function fire(kind: "edit-permissions" | "remove" | "blacklist"): void {
  menuOpen.value = false;
  if (kind === "edit-permissions") emit("edit-permissions");
  else if (kind === "remove") emit("remove");
  else emit("blacklist");
}
</script>

<template>
  <div class="card-base relative !py-3">
    <div class="flex items-center gap-2">
      <!-- 头像占位（首字圆形） -->
      <span
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] text-sm font-semibold text-primary"
      >
        {{ (member.username || "?").slice(0, 1) }}
      </span>

      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <span class="truncate text-sm font-medium">{{ member.username || "未知用户" }}</span>
          <span
            class="shrink-0 rounded px-1 text-[10px]"
            :class="
              isOwner
                ? 'bg-[color-mix(in_srgb,var(--c-accent)_14%,transparent)] text-accent'
                : 'bg-line text-ink-soft'
            "
          >
            {{ isOwner ? "板块长" : "成员" }}
          </span>
        </div>
        <p class="mt-0.5 text-xs text-ink-soft">加入于 {{ formatDateTime(member.joinedAt) }}</p>
      </div>

      <!-- 操作入口（owner 不可操作） -->
      <button
        v-if="!isOwner"
        type="button"
        class="shrink-0 rounded-full px-2 py-1 text-xs text-primary transition-colors active:bg-line"
        @click="toggleMenu"
      >
        操作
      </button>
    </div>

    <!-- 操作菜单 -->
    <div v-if="menuOpen && !isOwner" class="mt-2 flex flex-wrap gap-2 border-t border-line pt-2">
      <button type="button" class="btn-primary !px-3 !py-1 text-xs" @click="fire('edit-permissions')">
        修改权限
      </button>
      <button type="button" class="btn-primary !px-3 !py-1 text-xs" @click="fire('remove')">
        移除成员
      </button>
      <button
        type="button"
        class="rounded-lg border border-red-300 px-3 py-1 text-xs text-red-500 dark:border-red-800 dark:text-red-400"
        @click="fire('blacklist')"
      >
        加入黑名单
      </button>
    </div>
  </div>
</template>
