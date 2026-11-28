<!--
  管理面板页（克制工具页：下划线 AppTabs + KeepAlive 子面板）

  - 进入时校验 access_admin_panel 权限，无权限 Toast 提示并跳回首页
  - 保留 data-tour="admin-tabs" 与 KeepAlive 子面板缓存
-->
<script setup lang="ts">
import { computed, onMounted, shallowRef } from "vue";
import { useRouter } from "vue-router";
import FeedSkeleton from "../components/common/FeedSkeleton.vue";
import AppTabs, { type TabOption } from "../components/common/AppTabs.vue";
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

const permReady = shallowRef(false);
const allowed = shallowRef(false);

const canManageUsers = shallowRef(false);
const canViewDatabase = shallowRef(false);
const canEditDatabase = shallowRef(false);

const TABS = [
  { key: "summary", label: "概览", needViewDb: false },
  { key: "users", label: "用户管理", needViewDb: false },
  { key: "config", label: "站点配置", needViewDb: false },
  { key: "database", label: "数据库", needViewDb: true },
  { key: "archive", label: "归档查看", needViewDb: true },
] as const;

type TabKey = (typeof TABS)[number]["key"];
const activeTab = shallowRef<TabKey>("summary");

const tabOptions = computed<TabOption[]>(() =>
  TABS.filter((tab) => !tab.needViewDb || canViewDatabase.value).map((tab) => ({
    value: tab.key,
    label: tab.label,
  }))
);

function onTabChange(val: string): void {
  if (TABS.some((t) => t.key === val)) {
    activeTab.value = val as TabKey;
  }
}

const PANELS: Record<TabKey, unknown> = {
  summary: AdminSummaryPanel,
  users: AdminUserPanel,
  config: AdminConfigPanel,
  database: AdminDatabasePanel,
  archive: AdminArchivePanel,
};

onMounted(async () => {
  const mask = await getMyPermissions();

  if (!hasPermission(mask, PERM_ACCESS_ADMIN_PANEL)) {
    showToast("无权访问管理面板", "error");
    void router.replace("/");
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
  <div>
    <FeedSkeleton v-if="!permReady || !allowed" variant="elk" :count="5" />

    <template v-else>
      <!-- 顶部下划线 Tab（保留 data-tour="admin-tabs"） -->
      <div data-tour="admin-tabs" class="bg-canvas">
        <AppTabs
          :model-value="activeTab"
          :items="tabOptions"
          variant="underline"
          aria-label="管理面板栏目"
          @update:model-value="onTabChange"
        />
      </div>

      <!-- 子面板（KeepAlive 缓存已加载数据） -->
      <div class="pb-10">
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
      </div>
    </template>
  </div>
</template>
