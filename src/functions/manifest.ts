/**
 * 动态 PWA manifest
 *
 * PWA 安装时直接读取此接口，因此名称和图标可以跟随后台站点配置。
 * Pages 用 onRequest 暴露，Worker 入口（src/worker.ts）直接调 handleManifest。
 */

import type { CloudflareEnv } from "../auth";
import { getSiteConfig } from "../db";
import siteConfig from "../config/site.config.json";

export async function handleManifest(
  _request: Request,
  env: CloudflareEnv
): Promise<Response> {
  const config = (await getSiteConfig(env.DB)) ?? siteConfig;
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
}

/** Pages 入口（Worker 入口直接用 handleManifest） */
export const onRequest: PagesFunction<CloudflareEnv> = (context) =>
  handleManifest(context.request, context.env);
