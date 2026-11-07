# Rippling

> 可部署的校园社区论坛系统

**当前状态：开发中**

## 简介

Rippling 是一个面向校园的社区论坛系统，支持帖子、板块、表白墙、大事记、提问箱等功能。基于 Cloudflare Pages 部署，开箱即用。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3（后续加入） |
| 后端 | Hono |
| 认证 | Better Auth + better-auth-cloudflare |
| 数据库 | Cloudflare D1 |
| 部署 | Cloudflare Pages |

## 配置说明

项目采用 **配置文件分离** 设计：

| 文件 | 用途 | 是否提交到 Git |
|------|------|----------------|
| `src/config/site.config.json` | 站点公开配置（站名、主题、推荐权重等） | 是 |
| `.env` | 敏感配置（密钥、数据库 ID 等） | 否 |
| D1 表 `site_config` | **初始化后真正的站点配置**（站名 / 主题 / 权重 / 学号规则） | 数据库 |

> ⚠️ 站点跑完初始化向导后，配置就存在数据库里了；
> 此时再改 `src/config/site.config.json` **不会生效**（它只是兜底默认值），
> 要改请进管理面板 → 站点配置。细节见 `docs/deploy.md` 第十四章。

部署前请复制 `.env.example` 为 `.env` 并填写实际值：

```bash
cp .env.example .env
```

## 项目结构

```
├── src/
│   ├── config/
│   │   └── site.config.json   # 站点公开配置
│   ├── functions/
│   │   ├── api/[[route]].ts   # Hono 后端入口
│   │   └── auth/[[route]].ts  # Better Auth 入口
│   ├── frontend/              # Vue 3 前端
│   └── shared/
│       └── permissions.ts     # 权限位掩码定义
├── docs/                      # 部署指南 / 置顶机制等说明
├── migrations/                # D1 数据库迁移
├── archive/                   # 归档数据
├── public/                    # 静态资源 & 构建输出
├── wrangler.toml              # Cloudflare 配置
├── package.json
├── tsconfig.json
└── .env.example               # 敏感配置模板
```

## 开发

```bash
npm install
npm run dev        # 本地开发（wrangler pages dev public）
npm run typecheck  # 类型检查
npm run deploy     # 部署到 Cloudflare Pages

# 搜索 / 推荐流的不变量检查（需要本地站点已初始化并正在运行）
node scripts/test-search.mjs http://127.0.0.1:8788
node scripts/test-recommend.mjs http://127.0.0.1:8788
```

> 性能（跨境访问为什么慢、缓存怎么做的）：见 `docs/performance.md`。

## 协议

本项目基于 [MIT License](./LICENSE) 开源。
