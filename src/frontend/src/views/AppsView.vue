<!--
  应用页 — Elk 轻量 2 列目录网格

  展示站点各应用入口（图标 + 名称 + 一句话简介）；
  移动端单列满宽（兼容 check-layout.mjs），平板/桌面自动呈 2 列简洁网格。
  保留 data-tour="apps-list"。
-->
<script setup lang="ts">
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";

const APPS = [
  {
    name: "大事记",
    icon: "calendar",
    to: "/timeline",
    note: "记录学校重要事件与历程",
    warm: false,
  },
  {
    name: "表白墙",
    icon: "heart",
    to: "/confession",
    note: "匿名温柔表达心意",
    warm: true,
  },
  {
    name: "投票",
    icon: "chart",
    to: "/vote",
    note: "参与或发起校园投票",
    warm: false,
  },
  {
    name: "创建板块",
    icon: "plusSquare",
    to: "/ticket/create?type=block_create",
    note: "提交工单申请创建新板块",
    warm: false,
  },
  {
    name: "我的工单",
    icon: "file",
    to: "/tickets",
    note: "查看我提交的反馈与申请进度",
    warm: false,
  },
  {
    name: "管理日志",
    icon: "shield",
    to: "/admin-log",
    note: "公开透明的管理操作记录",
    warm: false,
  },
  {
    name: "友情链接",
    icon: "link",
    to: null,
    note: "即将上线",
    warm: false,
  },
] as const;
</script>

<template>
  <div data-tour="apps-list" class="px-4 py-4 sm:px-5">
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <RouterLink
        v-for="app in APPS"
        :key="app.name"
        :to="app.to ?? ''"
        class="card-base flex w-full items-start gap-3.5 hover:border-strong hover:bg-hover pressable"
        :class="{ 'pointer-events-none opacity-55': !app.to }"
      >
        <span
          class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          :class="app.warm ? 'bg-accent-warm-soft text-accent-warm' : 'bg-accent-soft text-primary'"
        >
          <AppSvgIcon :name="app.icon" :size="19" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="flex items-center justify-between gap-2">
            <span class="truncate text-[15px] font-semibold leading-5 text-ink">
              {{ app.name }}
            </span>
            <AppSvgIcon
              v-if="app.to"
              name="chevronRight"
              :size="15"
              class="shrink-0 text-ink-muted"
            />
          </span>
          <span class="mt-1 block text-xs leading-relaxed text-ink-secondary">
            {{ app.note }}
          </span>
        </span>
      </RouterLink>
    </div>
  </div>
</template>
