/// <reference types="vite/client" />

// 单文件组件模块声明（vue-tsc 环境下兜底）
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
