<!--
  应用页 — 功能入口列表

  展示站点各应用入口，带备注说明。
-->
<script setup lang="ts">
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";

/** 应用入口配置 */
const APPS = [
  {
    name: "大事记",
    icon: "calendar",
    to: "/timeline",
    note: "校园大事记时间线，提交需审核",
  },
  {
    name: "表白墙",
    icon: "heart",
    to: "/confession",
    note: "匿名表白与心情分享",
  },
  {
    name: "投票",
    icon: "chart",
    to: "/vote",
    note: "发起或参与校园投票",
  },
  {
    name: "创建板块",
    icon: "plusSquare",
    to: "/tickets",
    note: "提交建板申请工单，管理员审核后自动创建",
  },
  {
    name: "我的工单",
    icon: "file",
    to: "/tickets",
    note: "权限申请 / 举报 / 申诉等工单进度",
  },
  {
    name: "友情链接",
    icon: "link",
    to: null,
    note: "校园合作站点链接（待开放）",
  },
  {
    name: "管理日志",
    icon: "shield",
    to: "/admin",
    note: "管理操作记录完全公开可查",
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
