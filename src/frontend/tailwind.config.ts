/**
 * Tailwind CSS 配置
 *
 * 主题颜色通过 CSS 变量映射（由 theme store 在运行时写入根元素），
 * 支持 light / dark / campus / warm 四套预设主题及管理面板自定义色。
 *
 * 注意：颜色使用 `var(--c-*)` 直接映射，不支持透明度修饰符（如 bg-primary/50）。
 */
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{vue,ts}"],
  theme: {
    extend: {
      colors: {
        // 主题色（由 CSS 变量驱动，见 styles/theme.css）
        primary: "var(--c-primary)",
        accent: "var(--c-accent)",
        page: "var(--c-bg)",
        surface: "var(--c-surface)",
        ink: "var(--c-text)",
        "ink-soft": "var(--c-text-soft)",
        line: "var(--c-border)",
      },
      maxWidth: {
        // 移动端优先：内容区最大宽度
        app: "480px",
      },
    },
  },
  plugins: [],
} satisfies Config;
