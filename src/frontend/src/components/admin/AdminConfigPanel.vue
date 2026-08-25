<!--
  管理面板 — 站点配置子面板

  - GET /api/admin/config 拉取当前配置（无 D1 配置时后端回退静态文件）
  - 可编辑：站点名称、学号格式正则 / 提示、归档天数、推荐流权重、主题预设与颜色变量、用户等级颜色
  - 保存（edit_database 权限）：PUT /api/admin/config 提交完整结构
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import LoadingSpinner from "../common/LoadingSpinner.vue";
import ErrorState from "../common/ErrorState.vue";
import { getAdminSiteConfig, updateAdminSiteConfig } from "../../api/admin";
import { uploadImage, MAX_IMAGE_SIZE } from "../../api/upload";
import { showToast } from "../../utils/toast";
import type { SiteConfig } from "../../types";

/** 是否具备 edit_database（决定能否保存） */
const props = defineProps<{ canEdit: boolean }>();

const loading = ref(true);
const error = ref(false);
const saving = ref(false);
/** 图标上传状态 */
const iconUploading = ref(false);
const iconInput = ref<HTMLInputElement | null>(null);
/** 表单状态（加载后深拷贝，避免直接引用响应数据） */
const form = ref<SiteConfig | null>(null);

/** 自动分板块默认配置 */
const DEFAULT_AUTO_BLOCK = {
  gradeEnabled: true,
  gradeStart: 1,
  gradeLength: 4,
  gradeNameFormat: "{grade}级年级板",
  classEnabled: true,
  classStart: 5,
  classLength: 2,
  classNameFormat: "{grade}年级{class}班板块",
};

/** 规则测试学号 */
const previewStudentId = ref("20240101");

const previewGradeBlock = computed(() => {
  if (!form.value?.autoBlock?.gradeEnabled) return "（已关闭）";
  const sid = previewStudentId.value.trim();
  const start = (form.value.autoBlock.gradeStart || 1) - 1;
  const len = form.value.autoBlock.gradeLength || 4;
  if (sid.length < start + len) return "（学号位数不足）";
  const grade = sid.slice(start, start + len);
  const fmt = form.value.autoBlock.gradeNameFormat || "{grade}级年级板";
  return fmt.replace(/\{grade\}/g, grade);
});

const previewClassBlock = computed(() => {
  if (!form.value?.autoBlock?.classEnabled) return "（已关闭）";
  const sid = previewStudentId.value.trim();
  const gStart = (form.value.autoBlock.gradeStart || 1) - 1;
  const gLen = form.value.autoBlock.gradeLength || 4;
  const cStart = (form.value.autoBlock.classStart || 5) - 1;
  const cLen = form.value.autoBlock.classLength || 2;
  if (sid.length < Math.max(gStart + gLen, cStart + cLen)) return "（学号位数不足）";
  const grade = sid.slice(gStart, gStart + gLen);
  const cls = sid.slice(cStart, cStart + cLen);
  const fmt = form.value.autoBlock.classNameFormat || "{grade}年级{class}班板块";
  return fmt.replace(/\{grade\}/g, grade).replace(/\{class\}/g, cls);
});

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

/** 图标 MIME 白名单（与后端一致） */
const ICON_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** 选择图标 → 前端校验 → 上传（/api/upload/image）→ 预览 */
async function onIconChange(event: Event): Promise<void> {
  if (!form.value) return;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // 清空 input 以便重复选择同一文件
  input.value = "";
  if (!file) return;

  if (!ICON_TYPES.includes(file.type)) {
    showToast("仅支持 JPEG / PNG / WebP / GIF 图片", "error");
    return;
  }
  if (file.size > MAX_IMAGE_SIZE) {
    showToast("图片超过 2MB，请压缩后再上传", "error");
    return;
  }

  iconUploading.value = true;
  try {
    const { url } = await uploadImage(file);
    form.value.siteIcon = url;
    showToast("图标上传成功，保存后生效", "success");
  } catch {
    // uploadTo 已自动 Toast（含“图床未配置，暂无法上传图片”）
  } finally {
    iconUploading.value = false;
  }
}

/** 移除图标（保存后生效） */
function removeIcon(): void {
  if (!form.value) return;
  form.value.siteIcon = "";
  showToast("已移除图标，保存后生效", "info");
}

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
    // 兼容旧配置：缺 autoBlock 时初始化
    if (!form.value.autoBlock) {
      form.value.autoBlock = { ...DEFAULT_AUTO_BLOCK };
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

          <!-- 站点图标 -->
          <div>
            <span class="mb-1 block text-xs text-ink-soft">站点图标</span>
            <div class="flex items-center gap-4">
              <!-- 当前图标预览 -->
              <div
                class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-page"
              >
                <img
                  v-if="form.siteIcon"
                  :src="form.siteIcon"
                  alt="站点图标"
                  class="h-full w-full object-cover"
                />
                <span v-else class="text-xl text-ink-soft">🏫</span>
              </div>

              <div class="flex-1 space-y-1.5">
                <input
                  ref="iconInput"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  class="hidden"
                  @change="onIconChange"
                />
                <button
                  type="button"
                  class="btn-secondary w-full text-sm"
                  :disabled="iconUploading"
                  @click="iconInput?.click()"
                >
                  {{ iconUploading ? "上传中…" : form.siteIcon ? "更换图标" : "上传图标" }}
                </button>
                <button
                  v-if="form.siteIcon"
                  type="button"
                  class="w-full text-left text-xs text-red-500 hover:underline"
                  @click="removeIcon"
                >
                  移除图标
                </button>
                <p class="text-xs text-ink-soft">
                  支持 JPEG / PNG / WebP / GIF，≤2MB；保存后作为标签页 favicon 与站内 Logo
                </p>
              </div>
            </div>
          </div>

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

        <!-- 学号自动分板块与年级解析 -->
        <div v-if="form.autoBlock" class="card-base space-y-3">
          <h3 class="text-sm font-semibold text-ink-soft">学号自动分板块与年级解析</h3>
          <p class="text-xs text-ink-soft">
            注册成功后，系统可根据学号规则自动创建并加入对应的年级板块与班级板块，并在个人主页展示年级标识。
          </p>

          <!-- 年级板块设置 -->
          <div class="rounded-lg border border-line p-3 space-y-3 bg-page/50">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold">年级板块与主页标识</span>
              <label class="relative inline-flex cursor-pointer items-center">
                <input
                  v-model="form.autoBlock.gradeEnabled"
                  type="checkbox"
                  class="peer sr-only"
                />
                <div class="peer h-5 w-9 rounded-full bg-line transition-colors peer-checked:bg-primary after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full"></div>
              </label>
            </div>
            <div v-if="form.autoBlock.gradeEnabled" class="grid grid-cols-2 gap-3 pt-1">
              <label class="block">
                <span class="mb-1 block text-xs text-ink-soft">年级起始位 (第N位开始)</span>
                <input
                  v-model.number="form.autoBlock.gradeStart"
                  type="number"
                  min="1"
                  class="input-base w-full text-xs"
                />
              </label>
              <label class="block">
                <span class="mb-1 block text-xs text-ink-soft">年级长度 (占N位)</span>
                <input
                  v-model.number="form.autoBlock.gradeLength"
                  type="number"
                  min="1"
                  class="input-base w-full text-xs"
                />
              </label>
              <label class="col-span-2 block">
                <span class="mb-1 block text-xs text-ink-soft">年级板块名称模板 ({grade} 为占位符)</span>
                <input
                  v-model="form.autoBlock.gradeNameFormat"
                  type="text"
                  placeholder="{grade}级年级板"
                  class="input-base w-full font-mono text-xs"
                />
              </label>
            </div>
          </div>

          <!-- 班级板块设置 -->
          <div class="rounded-lg border border-line p-3 space-y-3 bg-page/50">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold">班级板块设置</span>
              <label class="relative inline-flex cursor-pointer items-center">
                <input
                  v-model="form.autoBlock.classEnabled"
                  type="checkbox"
                  class="peer sr-only"
                />
                <div class="peer h-5 w-9 rounded-full bg-line transition-colors peer-checked:bg-primary after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full"></div>
              </label>
            </div>
            <div v-if="form.autoBlock.classEnabled" class="grid grid-cols-2 gap-3 pt-1">
              <label class="block">
                <span class="mb-1 block text-xs text-ink-soft">班级起始位 (第N位开始)</span>
                <input
                  v-model.number="form.autoBlock.classStart"
                  type="number"
                  min="1"
                  class="input-base w-full text-xs"
                />
              </label>
              <label class="block">
                <span class="mb-1 block text-xs text-ink-soft">班级长度 (占N位)</span>
                <input
                  v-model.number="form.autoBlock.classLength"
                  type="number"
                  min="1"
                  class="input-base w-full text-xs"
                />
              </label>
              <label class="col-span-2 block">
                <span class="mb-1 block text-xs text-ink-soft">班级板块名称模板 ({grade} 与 {class} 为占位符)</span>
                <input
                  v-model="form.autoBlock.classNameFormat"
                  type="text"
                  placeholder="{grade}年级{class}班板块"
                  class="input-base w-full font-mono text-xs"
                />
              </label>
            </div>
          </div>

          <!-- 规则实时演示 -->
          <div class="rounded-lg bg-page p-3 text-xs space-y-2">
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium text-ink-soft">规则测试预览：</span>
              <input
                v-model="previewStudentId"
                type="text"
                placeholder="输入示例学号"
                class="input-base w-32 font-mono text-xs py-1 px-2"
              />
            </div>
            <div class="text-[11px] text-ink-soft space-y-1">
              <div>🎯 对应年级板块：<span class="font-medium text-ink">{{ previewGradeBlock }}</span></div>
              <div>🎯 对应班级板块：<span class="font-medium text-ink">{{ previewClassBlock }}</span></div>
            </div>
          </div>
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
