<!--
  管理面板 — 站点配置子面板（克制工具页：无二级边框套娃、AppSwitch 开关、无裸 emoji）
-->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import FeedSkeleton from "../common/FeedSkeleton.vue";
import ErrorState from "../common/ErrorState.vue";
import AppSwitch from "../common/AppSwitch.vue";
import AppSvgIcon from "../layout/AppSvgIcon.vue";
import { getAdminSiteConfig, updateAdminSiteConfig } from "../../api/admin";
import { uploadImage, MAX_IMAGE_SIZE } from "../../api/upload";
import { PRESET_LABELS, PRESET_ORDER } from "../../utils/themePresets";
import { showToast } from "../../utils/toast";
import type { SiteConfig } from "../../types";

const props = defineProps<{ canEdit: boolean }>();

const loading = shallowRef(true);
const error = shallowRef(false);
const saving = shallowRef(false);
const iconUploading = shallowRef(false);
const iconInput = ref<HTMLInputElement | null>(null);
const form = ref<SiteConfig | null>(null);

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

const previewStudentId = shallowRef("20240101");

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

const LOGIN_WALL_OPTIONS = [
  {
    value: "none" as const,
    label: "无墙",
    desc: "不登录也可浏览推荐流、搜索与公开板块",
  },
  {
    value: "soft" as const,
    label: "软墙",
    desc: "列表需登录，单条帖子详情对外公开（便于群内转发链接）",
  },
  {
    value: "hard" as const,
    label: "硬墙",
    desc: "除登录 / 注册 / 初始化外全部需登录访问",
  },
];

const WEIGHT_FIELDS = [
  { key: "like", label: "点赞权重" },
  { key: "comment", label: "评论权重" },
  { key: "follow", label: "关注权重" },
  { key: "block", label: "板块权重" },
  { key: "time", label: "时间权重" },
  { key: "random", label: "随机权重" },
] as const;

const TYPE_BONUS_FIELDS = [
  { key: "post", label: "帖子基础分" },
  { key: "confession", label: "表白墙基础分" },
  { key: "timeline", label: "大事记基础分" },
  { key: "vote", label: "投票基础分" },
] as const;

const DEFAULT_TYPE_BONUS = {
  post: 0,
  confession: 5,
  timeline: 8,
  vote: 6,
};

const THEME_FIELDS = [
  { key: "primaryColor", label: "主色" },
  { key: "backgroundColor", label: "背景色" },
  { key: "textColor", label: "文字色" },
  { key: "accentColor", label: "强调色" },
] as const;

const LEVEL_FIELDS = [
  { key: "normal", label: "普通用户" },
  { key: "active", label: "活跃用户" },
  { key: "verified", label: "认证用户" },
  { key: "admin", label: "管理员" },
  { key: "owner", label: "板块长" },
  { key: "superadmin", label: "站长 / 超管" },
] as const;

const DEFAULT_NAME_COLORS = {
  normal: "#64748B",
  active: "#10B981",
  verified: "#3B82F6",
  admin: "#F59E0B",
  owner: "#8B5CF6",
  superadmin: "#EF4444",
} as const;

const ICON_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

async function onIconChange(event: Event): Promise<void> {
  if (!form.value) return;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
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
    // uploadImage 已 Toast
  } finally {
    iconUploading.value = false;
  }
}

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
    form.value = JSON.parse(JSON.stringify(config)) as SiteConfig;
    if (!form.value.nameColors) {
      form.value.nameColors = { ...DEFAULT_NAME_COLORS };
    }
    if (!form.value.autoBlock) {
      form.value.autoBlock = { ...DEFAULT_AUTO_BLOCK };
    }
    if (!form.value.recommendTypeBonus) {
      form.value.recommendTypeBonus = { ...DEFAULT_TYPE_BONUS };
    }
    if (!form.value.loginWall) {
      form.value.loginWall = "hard";
    }
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  if (!form.value || saving.value) return;
  if (form.value.archiveDays < 0) {
    showToast("归档天数不能为负数", "error");
    return;
  }

  saving.value = true;
  try {
    await updateAdminSiteConfig(form.value);
    showToast("配置已保存", "success");
  } catch {
    // client.ts 已自动 Toast
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div>
    <FeedSkeleton v-if="loading" variant="elk" :count="5" />
    <div v-else-if="error" class="px-4 py-6">
      <ErrorState @retry="load" />
    </div>

    <template v-else-if="form">
      <p
        v-if="!props.canEdit"
        class="border-b border-subtle bg-canvas-soft px-4 py-2.5 text-xs text-ink-muted sm:px-5"
      >
        当前账号无 edit_database 权限，仅可只读查看配置。
      </p>

      <fieldset :disabled="!props.canEdit" class="divide-y divide-[var(--border-subtle)]">
        <!-- 基础配置 -->
        <section class="space-y-4 px-4 py-5 sm:px-5">
          <h2 class="text-sm font-semibold text-ink">基础配置</h2>

          <div>
            <label for="cfg-site-name" class="mb-1.5 block text-xs font-medium text-ink-secondary">
              站点名称
            </label>
            <input id="cfg-site-name" v-model="form.siteName" type="text" class="input-base" />
          </div>

          <!-- 站点图标（无裸 emoji） -->
          <div>
            <span class="mb-1.5 block text-xs font-medium text-ink-secondary">站点图标</span>
            <div class="flex items-start gap-4">
              <div
                class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-subtle bg-canvas-soft text-ink-muted"
              >
                <img
                  v-if="form.siteIcon"
                  :src="form.siteIcon"
                  alt="站点图标"
                  width="56"
                  height="56"
                  class="h-full w-full object-cover"
                />
                <AppSvgIcon v-else name="building" :size="24" />
              </div>

              <div class="min-w-0 flex-1 space-y-2">
                <input
                  ref="iconInput"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  class="hidden"
                  @change="onIconChange"
                />
                <div class="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    class="btn-secondary !py-1.5 text-xs"
                    :disabled="iconUploading"
                    @click="iconInput?.click()"
                  >
                    {{ iconUploading ? "上传中…" : form.siteIcon ? "更换图标" : "上传图标" }}
                  </button>
                  <button
                    v-if="form.siteIcon"
                    type="button"
                    class="rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger-soft pressable"
                    @click="removeIcon"
                  >
                    移除图标
                  </button>
                </div>
                <p class="text-xs leading-relaxed text-ink-muted">
                  支持 JPEG / PNG / WebP / GIF（≤ 2&nbsp;MB），保存后用于标签页图标与站内 Logo。
                </p>
              </div>
            </div>
          </div>

          <div>
            <label for="cfg-sid-pattern" class="mb-1.5 block text-xs font-medium text-ink-secondary">
              学号格式正则
            </label>
            <input
              id="cfg-sid-pattern"
              v-model="form.studentIdPattern"
              type="text"
              spellcheck="false"
              class="input-base font-mono text-xs"
            />
          </div>

          <div>
            <label for="cfg-sid-hint" class="mb-1.5 block text-xs font-medium text-ink-secondary">
              学号格式提示
            </label>
            <input id="cfg-sid-hint" v-model="form.studentIdHint" type="text" class="input-base" />
          </div>

          <div>
            <label for="cfg-archive-days" class="mb-1.5 block text-xs font-medium text-ink-secondary">
              自动归档天数
            </label>
            <input
              id="cfg-archive-days"
              v-model.number="form.archiveDays"
              type="number"
              min="0"
              class="input-base tabular-nums"
            />
          </div>
        </section>

        <!-- 学号自动分板块与年级解析（去二级边框套娃，使用 bg-canvas-soft 浅底分组） -->
        <section v-if="form.autoBlock" class="space-y-4 px-4 py-5 sm:px-5">
          <div>
            <h2 class="text-sm font-semibold text-ink">学号自动分板块与年级解析</h2>
            <p class="mt-1 text-xs leading-relaxed text-ink-muted">
              注册成功后可按学号切片自动创建并加入年级 / 班级板块，并在主页展示年级标识。
            </p>
          </div>

          <!-- 年级板块 -->
          <div class="space-y-3 rounded-xl bg-canvas-soft p-3.5">
            <div class="flex items-center justify-between gap-3">
              <label for="cfg-grade-enabled" class="cursor-pointer text-xs font-semibold text-ink">
                年级板块与主页标识
              </label>
              <AppSwitch
                id="cfg-grade-enabled"
                v-model="form.autoBlock.gradeEnabled"
                :disabled="!props.canEdit"
                aria-label="启用年级板块与主页标识"
              />
            </div>
            <div v-if="form.autoBlock.gradeEnabled" class="grid grid-cols-2 gap-3 pt-1">
              <label class="block">
                <span class="mb-1 block text-xs text-ink-muted">起始位（从第 N 位起）</span>
                <input
                  v-model.number="form.autoBlock.gradeStart"
                  type="number"
                  min="1"
                  class="input-base text-xs tabular-nums"
                />
              </label>
              <label class="block">
                <span class="mb-1 block text-xs text-ink-muted">长度（占 N 位）</span>
                <input
                  v-model.number="form.autoBlock.gradeLength"
                  type="number"
                  min="1"
                  class="input-base text-xs tabular-nums"
                />
              </label>
              <label class="col-span-2 block">
                <span class="mb-1 block text-xs text-ink-muted">名称模板（{grade} 为占位符）</span>
                <input
                  v-model="form.autoBlock.gradeNameFormat"
                  type="text"
                  placeholder="{grade}级年级板"
                  class="input-base font-mono text-xs"
                />
              </label>
            </div>
          </div>

          <!-- 班级板块 -->
          <div class="space-y-3 rounded-xl bg-canvas-soft p-3.5">
            <div class="flex items-center justify-between gap-3">
              <label for="cfg-class-enabled" class="cursor-pointer text-xs font-semibold text-ink">
                班级板块设置
              </label>
              <AppSwitch
                id="cfg-class-enabled"
                v-model="form.autoBlock.classEnabled"
                :disabled="!props.canEdit"
                aria-label="启用班级板块"
              />
            </div>
            <div v-if="form.autoBlock.classEnabled" class="grid grid-cols-2 gap-3 pt-1">
              <label class="block">
                <span class="mb-1 block text-xs text-ink-muted">起始位（从第 N 位起）</span>
                <input
                  v-model.number="form.autoBlock.classStart"
                  type="number"
                  min="1"
                  class="input-base text-xs tabular-nums"
                />
              </label>
              <label class="block">
                <span class="mb-1 block text-xs text-ink-muted">长度（占 N 位）</span>
                <input
                  v-model.number="form.autoBlock.classLength"
                  type="number"
                  min="1"
                  class="input-base text-xs tabular-nums"
                />
              </label>
              <label class="col-span-2 block">
                <span class="mb-1 block text-xs text-ink-muted">名称模板（{grade} 与 {class} 为占位符）</span>
                <input
                  v-model="form.autoBlock.classNameFormat"
                  type="text"
                  placeholder="{grade}年级{class}班板块"
                  class="input-base font-mono text-xs"
                />
              </label>
            </div>
          </div>

          <!-- 规则实时演示（无裸 emoji） -->
          <div class="space-y-2 rounded-xl bg-canvas-soft p-3.5 text-xs">
            <div class="flex items-center justify-between gap-2">
              <label for="cfg-preview-sid" class="font-medium text-ink-secondary">
                规则测试学号
              </label>
              <input
                id="cfg-preview-sid"
                v-model="previewStudentId"
                type="text"
                spellcheck="false"
                placeholder="输入示例学号…"
                class="input-base !w-36 !px-2.5 !py-1 font-mono text-xs"
              />
            </div>
            <dl class="space-y-1 text-xs text-ink-muted">
              <div class="flex items-center gap-2">
                <AppSvgIcon name="blocks" :size="13" class="shrink-0 text-primary" />
                <dt class="shrink-0">年级板块：</dt>
                <dd class="font-medium text-ink">{{ previewGradeBlock }}</dd>
              </div>
              <div class="flex items-center gap-2">
                <AppSvgIcon name="users" :size="13" class="shrink-0 text-primary" />
                <dt class="shrink-0">班级板块：</dt>
                <dd class="font-medium text-ink">{{ previewClassBlock }}</dd>
              </div>
            </dl>
          </div>
        </section>

        <!-- 访问控制（登录墙） -->
        <section class="space-y-3 px-4 py-5 sm:px-5">
          <div>
            <h2 class="text-sm font-semibold text-ink">访问控制（登录墙）</h2>
            <p class="mt-1 text-xs text-ink-muted">控制未登录游客的可见范围。</p>
          </div>

          <div class="space-y-2">
            <label
              v-for="opt in LOGIN_WALL_OPTIONS"
              :key="opt.value"
              class="flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors"
              :class="
                (form.loginWall ?? 'hard') === opt.value
                  ? 'border-primary bg-accent-soft'
                  : 'border-subtle bg-surface hover:border-strong'
              "
            >
              <input
                v-model="form.loginWall"
                type="radio"
                name="loginWall"
                :value="opt.value"
                class="mt-0.5 h-4 w-4 accent-[var(--c-primary)]"
              />
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-medium text-ink">{{ opt.label }}</span>
                <span class="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                  {{ opt.desc }}
                </span>
              </span>
            </label>
          </div>

          <p class="text-xs text-ink-muted">
            保存后最多 10 秒生效（服务端短缓存），同时作用于页面路由与后端接口。
          </p>
        </section>

        <!-- 推荐流权重 -->
        <section class="space-y-3 px-4 py-5 sm:px-5">
          <h2 class="text-sm font-semibold text-ink">推荐流权重</h2>
          <div class="grid grid-cols-2 gap-3">
            <label v-for="field in WEIGHT_FIELDS" :key="field.key" class="block">
              <span class="mb-1 block text-xs text-ink-secondary">{{ field.label }}</span>
              <input
                v-model.number="form.recommendWeights[field.key]"
                type="number"
                min="0"
                step="0.1"
                class="input-base tabular-nums"
              />
            </label>
          </div>
        </section>

        <!-- 推荐流类型基础分 -->
        <section class="space-y-3 px-4 py-5 sm:px-5">
          <div>
            <h2 class="text-sm font-semibold text-ink">推荐流 · 类型基础分</h2>
            <p class="mt-1 text-xs leading-relaxed text-ink-muted">
              在综合权重得分后叠加到对应内容类型上；调高对应分值可提升曝光优先级。
            </p>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label v-for="field in TYPE_BONUS_FIELDS" :key="field.key" class="block">
              <span class="mb-1 block text-xs text-ink-secondary">{{ field.label }}</span>
              <input
                v-if="form.recommendTypeBonus"
                v-model.number="form.recommendTypeBonus[field.key]"
                type="number"
                min="0"
                step="0.5"
                class="input-base tabular-nums"
              />
            </label>
          </div>
        </section>

        <!-- 全站默认主题 -->
        <section class="space-y-3.5 px-4 py-5 sm:px-5">
          <h2 class="text-sm font-semibold text-ink">全站默认主题</h2>
          <div>
            <span class="mb-1.5 block text-xs text-ink-secondary">默认预设</span>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="preset in PRESET_ORDER"
                :key="preset"
                type="button"
                class="rounded-full px-3.5 py-1.5 text-xs font-medium pressable"
                :class="
                  form.theme.preset === preset
                    ? 'bg-primary text-white'
                    : 'bg-hover text-ink-secondary hover:text-ink'
                "
                @click="form.theme.preset = preset"
              >
                {{ PRESET_LABELS[preset] }}
              </button>
            </div>
          </div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label v-for="field in THEME_FIELDS" :key="field.key" class="block">
              <span class="mb-1 block text-xs text-ink-secondary">{{ field.label }}</span>
              <div class="flex items-center gap-2">
                <input
                  v-model="form.theme[field.key]"
                  type="color"
                  :aria-label="`${field.label}色块`"
                  class="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-strong bg-surface p-0.5"
                />
                <input
                  v-model="form.theme[field.key]"
                  type="text"
                  spellcheck="false"
                  class="input-base font-mono text-xs"
                />
              </div>
            </label>
          </div>
        </section>

        <!-- 用户等级颜色 -->
        <section class="space-y-3.5 px-4 py-5 sm:px-5">
          <div>
            <h2 class="text-sm font-semibold text-ink">用户等级颜色</h2>
            <p class="mt-1 text-xs text-ink-muted">
              用户名展示色按用户等级动态计算，可在此统一调整各等级配色。
            </p>
          </div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label v-for="field in LEVEL_FIELDS" :key="field.key" class="block">
              <span class="mb-1 flex items-center gap-1.5 text-xs text-ink-secondary">
                <span
                  class="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-subtle"
                  :style="{ backgroundColor: form.nameColors[field.key] }"
                  aria-hidden="true"
                />
                {{ field.label }}
              </span>
              <div class="flex items-center gap-2">
                <input
                  v-model="form.nameColors[field.key]"
                  type="color"
                  :aria-label="`${field.label}颜色`"
                  class="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-strong bg-surface p-0.5"
                />
                <input
                  v-model="form.nameColors[field.key]"
                  type="text"
                  spellcheck="false"
                  class="input-base font-mono text-xs"
                />
              </div>
            </label>
          </div>
        </section>
      </fieldset>

      <!-- 保存按钮 -->
      <div v-if="props.canEdit" class="border-t border-subtle px-4 py-4 sm:px-5">
        <button
          type="button"
          class="btn-primary w-full !py-2.5"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? "保存中…" : "保存配置" }}
        </button>
      </div>
    </template>
  </div>
</template>
