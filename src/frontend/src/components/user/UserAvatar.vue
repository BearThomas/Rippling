<!--
  头像（有图用图，没图用首字占位）

  这个组件存在的唯一理由：**默认头像的样子只能有一份**。
  以前每个页面各写一遍，于是同一件事有四种写法：

    - 帖子卡片 / 帖子详情：bg color-mix(var(--c-primary) 12%) + text-primary，有名字颜色时换成
      color + color-mix(nameColor 14%)；
    - 「我的」页那种大号：text-white + 纯 var(--c-primary)；
    - 评论区：什么都没写（背景是透明的，看着像缺了一块）；
    - 搜索页 / 关注列表：又在别处抄了一遍 12% 那份。

  用户看到的直接后果：同一个人在首页是小蓝圈，进帖子变实心蓝，
  进评论区变成没有底色。

  这里把「帖子页那套」定成标准，所有地方都走它。要改颜色就改这一处。

  尺寸用 size 名字而不是传 class：Tailwind 需要**字面量**才生成 CSS，
  传 "h-7 w-7" 这种动态字符串是扫不到的。
-->
<script setup lang="ts">
import { computed } from "vue";

/** 现成的尺寸档位（h-6 / h-7 / h-8 / h-9 / h-10 / h-14） */
export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

const props = withDefaults(
  defineProps<{
    /** 头像地址；为空则用首字占位 */
    src?: string | null;
    /** 用户名（取首字当占位符） */
    name: string;
    /** 用户自定义名字颜色（有则整块跟着它染） */
    nameColor?: string | null;
    /** 匿名内容：不透露是谁，用中性灰而不是主色 */
    anonymous?: boolean;
    size?: AvatarSize;
    /** 无障碍文本，默认用 name */
    alt?: string;
  }>(),
  { src: null, nameColor: null, anonymous: false, size: "md", alt: "" }
);

const SIZES: Record<AvatarSize, { box: string; text: string }> = {
  xs: { box: "h-6 w-6", text: "text-[10px]" },
  sm: { box: "h-7 w-7", text: "text-xs" },
  md: { box: "h-8 w-8", text: "text-xs" },
  lg: { box: "h-9 w-9", text: "text-sm" },
  xl: { box: "h-10 w-10", text: "text-sm" },
  "2xl": { box: "h-14 w-14", text: "text-xl" },
};

const dims = computed(() => SIZES[props.size] ?? SIZES.md);

const initial = computed(() => (props.name || "?").trim().slice(0, 1) || "?");

const altText = computed(() => props.alt || props.name);

/** 名字颜色优先；没有就按"匿名灰 / 主色淡底"分 */
const toneStyle = computed(() =>
  props.nameColor
    ? {
        color: props.nameColor,
        background: `color-mix(in srgb, ${props.nameColor} 14%, transparent)`,
      }
    : undefined
);

const toneClass = computed(() =>
  props.anonymous
    ? "bg-line text-ink-soft"
    : "bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] text-primary"
);
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :alt="altText"
    data-avatar="image"
    class="shrink-0 rounded-full object-cover"
    :class="dims.box"
  />
  <span
    v-else
    data-avatar="default"
    class="flex shrink-0 items-center justify-center rounded-full font-semibold"
    :class="[dims.box, dims.text, toneClass]"
    :style="toneStyle"
  >
    {{ initial }}
  </span>
</template>
