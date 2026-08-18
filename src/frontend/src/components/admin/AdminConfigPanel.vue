<!--
  管理面板 — 站点配置子面板

  - GET /api/admin/config 拉取当前配置（无 D1 配置时后端回退静态文件）
  - 可编辑：站点名称、学号格式正则 / 提示、归档天数、推荐流权重、主题预设与颜色变量、用户等级颜色
  - 保存（edit_database 权限）：PUT /api/admin/config 提交完整结构
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import LoadingSpinner from "../common/LoadingSpinner.vue";
import ErrorState from "../common/ErrorState.vue";
import { getAdminSiteConfig, updateAdminSiteConfig } from "../../api/admin";
import { showToast } from "../../utils/toast";
import type { SiteConfig } from "../../types";

/** 是否具备 edit_database（决定能否保存） */
const props = defineProps<{ canEdit: boolean }>();

const loading = ref(true);
const error = ref(false);
const saving = ref(false);
/** 表单状态（加载后深拷贝，避免直接引用响应数据） */
const form = ref<SiteConfig | null>(null);

/** 主题预设选项 */
const PRESETS = ["light", "dark", "campus", "warm"] as const;

/** 推荐权重字段（与后端 SiteConfigRecommendWeights 一致） */
const WEIGHT_FIELDS = [
  { key: "like", label: "点赞权重" },
  { key: "comment", label: "评论权重" },
  { key: "follow", label: "关注权重" },
  { key: "block", label: "板块权重" },
  { key: "time", label: "时间权重" },
  { key: "random", label: "随机权重" },
] as const;

/** 主题颜色字段 */
const THEME_FIELDS = [
  { key: "primaryColor", label: "主色" },
  { key: "backgroundColor", label: "背景色" },
  { key: "textColor", label: "文字色" },
  { key: "accentColor", label: "强调色" },
] as const;

/** 用户等级颜色字段（与后端 SiteConfigNameColors 一致） */
const LEVEL_FIELDS = [
  { key: "normal", label: "普通用户" },
  { key: "active", label: "活跃用户" },
  { key: "verified", label: "认证用户" },
  { key: "admin", label: "管理员" },
  { key: "owner", label: "板块长" },
  { key: "superadmin", label: "站长/超级管理员" },
] as const;

/** 等级颜色内置默认值（旧配置缺 nameColors 时初始化用，与后端 DEFAULT_NAME_COLORS 一致） */
const DEFAULT_NAME_COLORS = {
  normal: "#64748B",
  active: "#10B981",
  verified: "#3B82F6",
  admin: "#F59E0B",
  owner: "#8B5CF6",
  superadmin: "#EF4444",
} as const;

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    const config = await getAdminSiteConfig();
    // JSON 深拷贝隔离表单与响应数据
    form.value = JSON.parse(JSON.stringify(config)) as SiteConfig;
    // 兼容旧配置：缺 nameColors 时用默认色初始化，保证编辑区可渲染
    if (!form.value.nameColors) {
      form.value.nameColors = { ...DEFAULT_NAME_COLORS };
    }
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

/** 保存配置（提交完整结构，DAL 层做结构校验） */
async function save(): Promise<void> {
  if (!form.value || saving.value) return;

  // 基础前端校验：数值字段非负
  if (form.value.archiveDays < 0) {
    showToast("归档天数不能为负数", "error");
    return;
  }

  saving.value = true;
  try {
    await updateAdminSiteConfig(form.value);
    showToast("配置已保存", "success");
  } catch {
    // Toast 由 client 层统一处理
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" @retry="load" />

    <template v-else-if="form">
      <p v-if="!props.canEdit" class="mb-3 rounded-lg bg-page px-3 py-2 text-xs text-ink-soft">
        当前账号无 edit_database 权限，仅可查看配置
      </p>

      <fieldset :disabled="!props.canEdit" class="space-y-4">
        <!-- 基础配置 -->
        <div class="card-base space-y-3">
          <h3 class="text-sm font-semibold text-ink-soft">基础配置</h3>
          <label class="block">
            <span class="mb-1 block text-xs text-ink-soft">站点名称</span>
            <input v-model="form.siteName" type="text" class="input-base w-full" />
          </label>
          <label class="block">
            <span class="mb-1 block text-xs text-ink-soft">学号格式正则</span>
            <input v-model="form.studentIdPattern" type="text" class="input-base w-full font-mono text-xs" />
          </label>
          <label class="block">
            <span class="mb-1 block text-xs text-ink-soft">学号格式提示</span>
            <input v-model="form.studentIdHint" type="text" class="input-base w-full" />
          </label>
          <label class="block">
            <span class="mb-1 block text-xs text-ink-soft">归档天数</span>
            <input v-model.number="form.archiveDays" type="number" min="0" class="input-base w-full" />
          </label>
        </div>

        <!-- 推荐流权重 -->
        <div class="card-base space-y-3">
          <h3 class="text-sm font-semibold text-ink-soft">推荐流权重</h3>
          <div class="grid grid-cols-2 gap-3">
            <label v-for="field in WEIGHT_FIELDS" :key="field.key" class="block">
              <span class="mb-1 block text-xs text-ink-soft">{{ field.label }}</span>
              <input
                v-model.number="form.recommendWeights[field.key]"
                type="number"
                min="0"
                step="0.1"
                class="input-base w-full"
              />
            </label>
          </div>
        </div>

        <!-- 主题 -->
        <div class="card-base space-y-3">
          <h3 class="text-sm font-semibold text-ink-soft">主题</h3>
          <div>
            <span class="mb-1 block text-xs text-ink-soft">预设</span>
            <div class="flex gap-2">
              <button
                v-for="preset in PRESETS"
                :key="preset"
                type="button"
                class="rounded-full px-4 py-1.5 text-sm transition-colors"
                :class="form.theme.preset === preset ? 'bg-primary text-white' : 'bg-page text-ink-soft'"
                @click="form.theme.preset = preset"
              >
                {{ preset }}
              </button>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label v-for="field in THEME_FIELDS" :key="field.key" class="block">
              <span class="mb-1 block text-xs text-ink-soft">{{ field.label }}</span>
              <div class="flex items-center gap-2">
                <input
                  v-model="form.theme[field.key]"
                  type="color"
                  class="h-9 w-9 shrink-0 cursor-pointer rounded border border-line bg-surface"
                />
                <input
                  v-model="form.theme[field.key]"
                  type="text"
                  class="input-base w-full font-mono text-xs"
                />
              </div>
            </label>
          </div>
        </div>

        <!-- 用户等级颜色 -->
        <div class="card-base space-y-3">
          <h3 class="text-sm font-semibold text-ink-soft">用户等级颜色</h3>
          <p class="text-xs text-ink-soft">
            用户名颜色按用户等级动态计算，此处配置各等级的展示颜色
          </p>
          <div class="grid grid-cols-2 gap-3">
            <label v-for="field in LEVEL_FIELDS" :key="field.key" class="block">
              <span class="mb-1 flex items-center gap-1.5 text-xs text-ink-soft">
                <!-- 颜色预览：实时展示当前配置色 -->
                <span
                  class="inline-block h-3 w-3 shrink-0 rounded-full border border-line"
                  :style="{ backgroundColor: form.nameColors[field.key] }"
                />
                {{ field.label }}
              </span>
              <div class="flex items-center gap-2">
                <input
                  v-model="form.nameColors[field.key]"
                  type="color"
                  class="h-9 w-9 shrink-0 cursor-pointer rounded border border-line bg-surface"
                />
                <input
                  v-model="form.nameColors[field.key]"
                  type="text"
                  class="input-base w-full font-mono text-xs"
                />
              </div>
            </label>
          </div>
        </div>
      </fieldset>

      <!-- 保存按钮 -->
      <button
        v-if="props.canEdit"
        type="button"
        class="btn-primary mt-4 w-full"
        :disabled="saving"
        @click="save"
      >
        {{ saving ? "保存中…" : "保存配置" }}
      </button>
    </template>
  </div>
</template>
