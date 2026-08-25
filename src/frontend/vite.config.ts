/**
 * Vite 配置
 *
 * - 构建输出到 ../../public（与 Cloudflare Pages 静态目录一致）
 * - emptyOutDir=false：保留 public/ 下已有的静态资源（如 site.json）
 * - dev 代理：/api 转发到本地 wrangler pages dev（默认 8788 端口）
 */

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [vue()],
  css: {
    // PostCSS 配置内联：避免 postcss-load-config 搜索到 postcss.config.ts
    // （加载 .ts 配置需额外安装 ts-node）
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    // 输出到项目根目录的 public/（Cloudflare Pages 静态资源目录）
    outDir: "../../public",
    // 保留 public/ 下的既有文件（site.json 等）
    emptyOutDir: false,
  },
  server: {
    proxy: {
      // 开发时后端由 wrangler pages dev 提供（默认 8788 端口）
      "/api": {
        target: "http://localhost:8788",
        changeOrigin: true,
      },
    },
  },
});
