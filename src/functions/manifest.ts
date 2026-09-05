/**
 * 动态 PWA manifest
 *
 * PWA 安装时直接读取此接口，因此名称和图标可以跟随后台站点配置。
 */

import type { CloudflareEnv } from "../auth";
import { getSiteConfig } from "../db";
import siteConfig from "../config/site.config.json";

export const onRequest: PagesFunction<CloudflareEnv> = async (context) => {
  const config = (await getSiteConfig(context.env.DB)) ?? siteConfig;
  const icon = config.siteIcon || "/icon-512.png";

  return new Response(
    JSON.stringify({
      name: config.siteName,
      short_name: config.siteName,
      description: "校园社区论坛",
      lang: "zh-CN",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#FFFFFF",
      theme_color: config.theme?.primaryColor || "#3B82F6",
      icons: [
        {
          src: config.siteIcon || "/icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: icon,
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/manifest+json; charset=UTF-8",
        "Cache-Control": "no-store",
      },
    }
  );
};
