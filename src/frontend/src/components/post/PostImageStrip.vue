<!--
  帖子配图条（信息流缩略图横滑）

  规则：
    - 横向滑动，统一高度（116px），无多余外边框噪音
    - 过宽最宽 240px、过长最窄 92px，均使用 object-cover 保持齐整
    - 容器 @click.stop 避免滑动或点图时误触发整行跳转
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
  { height: 116 }
);

const emit = defineEmits<{ (e: "open", url: string, index: number): void }>();

const images = computed(() => props.urls.filter(Boolean));
const boxHeight = computed(() => `${props.height}px`);
</script>

<template>
  <div
    v-if="images.length > 0"
    class="scrollbar-none -mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1 pb-0.5"
    @click.stop
  >
    <button
      v-for="(url, index) in images"
      :key="url"
      type="button"
      class="relative shrink-0 overflow-hidden rounded-lg bg-canvas-soft hover:opacity-95 pressable"
      :style="{ height: boxHeight, minWidth: '92px', maxWidth: '240px' }"
      :aria-label="`查看第 ${index + 1} 张图片`"
      @click.stop="emit('open', url, index)"
    >
      <img
        :src="url"
        alt=""
        loading="lazy"
        decoding="async"
        class="h-full w-auto max-w-none object-cover"
        :style="{ minWidth: '92px', maxWidth: '240px' }"
        draggable="false"
      />
    </button>
  </div>
</template>
