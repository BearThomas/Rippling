<!--
  应用页 — 功能入口列表

  展示站点各应用入口（图标 + 名称 + 备注），全部真实可跳转；
  友情链接暂未上线，置灰展示。
-->
<script setup lang="ts">
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";

/** 应用入口配置（to 为 null 表示暂未上线） */
const APPS = [
  {
    name: "大事记",
    icon: "calendar",
    to: "/timeline",
    note: "记录学校重要事件",
  },
  {
    name: "表白墙",
    icon: "heart",
    to: "/confession",
    note: "匿名表达心意",
  },
  {
    name: "投票",
    icon: "chart",
    to: "/vote",
    note: "参与或创建投票",
  },
  {
    name: "创建板块",
    icon: "plusSquare",
    to: "/ticket/create?type=block_create",
    note: "提交工单申请创建板块",
  },
  {
    name: "我的工单",
    icon: "file",
    to: "/tickets",
    note: "查看我提交的工单",
  },
  {
    name: "管理日志",
    icon: "shield",
    to: "/admin-log",
    note: "公开透明的管理操作记录",
  },
  {
    name: "友情链接",
    icon: "link",
    to: null,
    note: "即将上线",
  },
] as const;
</script>

<template>
  <div class="space-y-3 px-3 pt-3">
    <RouterLink
      v-for="app in APPS"
      :key="app.name"
      :to="app.to ?? ''"
      class="card-base flex items-start gap-3 transition-opacity active:opacity-80"
      :class="{ 'pointer-events-none opacity-60': !app.to }"
    >
      <span class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-primary"
        style="background: color-mix(in srgb, var(--c-primary) 12%, transparent)"
      >
        <AppSvgIcon :name="app.icon" :size="20" />
      </span>
      <span class="min-w-0">
        <span class="block font-medium">{{ app.name }}</span>
        <span class="mt-0.5 block text-xs leading-relaxed text-ink-soft">{{ app.note }}</span>
      </span>
    </RouterLink>
  </div>
</template>
