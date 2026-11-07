<!--
  帖子配图条（列表里直接看图）

  规则：
    - 横向滑动，一张一张贴着排，高度统一（110px）
    - 正常比例：按比例缩放（宽度跟着自身比例走）
    - 过宽：最宽 240px，超出部分裁掉（object-cover）
    - 过长：最窄 90px，上下裁掉
    - 只有一张时也走同一套规则，避免单图撑满整屏
  交互：
    - 点图 → 交给父组件决定（列表里就是打开帖子详情）
    - 滑动不触发卡片跳转（容器 .stop）
-->
<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    /** 正文里抽出来的图片地址 */
    urls: string[];
    /** 缩略图高度（px） */
    height?: number;
  }>(),
  { height: 110 }
);

const emit = defineEmits<{ (e: "open", url: string, index: number): void }>();

const images = computed(() => props.urls.filter(Boolean));

/** 高度：移动端统一 110，桌面略高一点 */
const boxHeight = computed(() => `${props.height}px`);
</script>

<template>
  <div
    v-if="images.length > 0"
    class="scrollbar-none -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5"
    @click.stop
  >
    <button
      v-for="(url, index) in images"
      :key="url"
      type="button"
      class="relative shrink-0 overflow-hidden rounded-lg border border-line bg-page active:opacity-80"
      :style="{ height: boxHeight, minWidth: '90px', maxWidth: '240px' }"
      :aria-label="`查看第 ${index + 1} 张图片`"
      @click.stop="emit('open', url, index)"
    >
      <img
        :src="url"
        alt=""
        loading="lazy"
        decoding="async"
        class="h-full w-auto max-w-none object-cover"
        :style="{ minWidth: '90px', maxWidth: '240px' }"
        draggable="false"
      />
    </button>
  </div>
</template>
