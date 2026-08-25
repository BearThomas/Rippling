/**
 * PostCSS 配置：Tailwind CSS + Autoprefixer
 *
 * 注：postcss-load-config 加载 .ts 需额外安装 ts-node，
 * 故此处使用 .js（ESM）格式。
 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
