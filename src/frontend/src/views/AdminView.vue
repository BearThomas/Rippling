<!--
  管理面板页

  - 进入时校验 access_admin_panel 权限，无权限 Toast 提示并跳回首页
  - 顶部 Tab：概览 / 用户管理 / 站点配置 / 数据库 / 归档查看
    （数据库与归档仅 view_database 权限者可见）
  - 各子面板独立加载数据，KeepAlive 缓存避免切 Tab 重复请求
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import AdminSummaryPanel from "../components/admin/AdminSummaryPanel.vue";
import AdminUserPanel from "../components/admin/AdminUserPanel.vue";
import AdminConfigPanel from "../components/admin/AdminConfigPanel.vue";
import AdminDatabasePanel from "../components/admin/AdminDatabasePanel.vue";
import AdminArchivePanel from "../components/admin/AdminArchivePanel.vue";
import { getMyPermissions } from "../utils/myPermissions";
import {
  hasPermission,
  PERM_ACCESS_ADMIN_PANEL,
  PERM_EDIT_OTHERS_PERMISSION,
  PERM_VIEW_DATABASE,
  PERM_EDIT_DATABASE,
} from "../utils/permission";
import { showToast } from "../utils/toast";

const router = useRouter();

/** 权限校验是否完成 */
const permReady = ref(false);
/** 是否具备面板访问权限 */
const allowed = ref(false);

/** 细分权限（控制子面板写操作与 Tab 显隐） */
const canManageUsers = ref(false);
const canViewDatabase = ref(false);
const canEditDatabase = ref(false);

/** Tab 定义（needViewDb 的 Tab 仅 view_database 权限者可见） */
const TABS = [
  { key: "summary", label: "概览", needViewDb: false },
  { key: "users", label: "用户管理", needViewDb: false },
  { key: "config", label: "站点配置", needViewDb: false },
  { key: "database", label: "数据库", needViewDb: true },
  { key: "archive", label: "归档查看", needViewDb: true },
] as const;

type TabKey = (typeof TABS)[number]["key"];
const activeTab = ref<TabKey>("summary");

/** 可见 Tab（数据库 / 归档按权限过滤） */
const visibleTabs = computed(() =>
  TABS.filter((tab) => !tab.needViewDb || canViewDatabase.value)
);

/** Tab key → 子面板组件映射 */
const PANELS: Record<TabKey, unknown> = {
  summary: AdminSummaryPanel,
  users: AdminUserPanel,
  config: AdminConfigPanel,
  database: AdminDatabasePanel,
  archive: AdminArchivePanel,
};

onMounted(async () => {
  const mask = await getMyPermissions();

  // 无 access_admin_panel：Toast 提示并跳回首页
  if (!hasPermission(mask, PERM_ACCESS_ADMIN_PANEL)) {
    showToast("无权访问管理面板", "error");
    router.replace("/");
    return;
  }

  allowed.value = true;
  canManageUsers.value = hasPermission(mask, PERM_EDIT_OTHERS_PERMISSION);
  canViewDatabase.value = hasPermission(mask, PERM_VIEW_DATABASE);
  canEditDatabase.value = hasPermission(mask, PERM_EDIT_DATABASE);
  permReady.value = true;
});
</script>

<template>
  <div class="px-3 pt-3">
    <LoadingSpinner v-if="!permReady || !allowed" />

    <template v-else>
      <!-- 顶部 Tab（横向滚动，移动端友好） -->
      <div class="-mx-3 mb-3 overflow-x-auto px-3">
        <div class="flex gap-2 whitespace-nowrap">
          <button
            v-for="tab in visibleTabs"
            :key="tab.key"
            type="button"
            class="rounded-full px-4 py-1.5 text-sm transition-colors"
            :class="activeTab === tab.key ? 'bg-primary text-white' : 'bg-surface text-ink-soft'"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <!-- 子面板（KeepAlive 缓存已加载数据） -->
      <KeepAlive>
        <component
          :is="PANELS[activeTab]"
          v-if="activeTab === 'users'"
          :can-manage="canManageUsers"
        />
        <component
          :is="PANELS[activeTab]"
          v-else-if="activeTab === 'config'"
          :can-edit="canEditDatabase"
        />
        <component
          :is="PANELS[activeTab]"
          v-else-if="activeTab === 'database'"
          :can-query="canEditDatabase"
        />
        <component :is="PANELS[activeTab]" v-else />
      </KeepAlive>
    </template>
  </div>
</template>
