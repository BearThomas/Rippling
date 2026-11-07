<!--
  展开 / 收起

  为什么要有它：以前"能折叠的东西"各写各的（`v-if` 直接切掉、或者 max-height 拍个数字），
  表现就是"啪"一下消失/出现，或者收起来以后还空着一段。

  这里用 grid-template-rows: 0fr → 1fr（CSS 在 main.css 的 .collapse 里）：
  不需要事先知道内容高度，也不会留空隙。老 Safari 不支持这个属性的动画，
  那边就是瞬间展开 —— 降级但不坏。
-->
<script setup lang="ts">
withDefaults(
  defineProps<{
    open: boolean;
  }>(),
  {}
);
</script>

<template>
  <div class="collapse" :class="{ 'is-open': open }">
    <div>
      <slot />
    </div>
  </div>
</template>
