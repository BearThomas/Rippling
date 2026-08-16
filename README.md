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
| `config/site.config.json` | 站点公开配置（站名、主题、推荐权重等） | 是 |
| `.env` | 敏感配置（密钥、数据库 ID 等） | 否 |

部署前请复制 `.env.example` 为 `.env` 并填写实际值：

```bash
cp .env.example .env
```

## 项目结构

```
├── config/
│   └── site.config.json      # 站点公开配置
├── src/
│   ├── functions/
│   │   ├── api/[[route]].ts   # Hono 后端入口
│   │   └── auth/[[route]].ts  # Better Auth 入口
│   └── shared/
│       └── permissions.ts     # 权限位掩码定义
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
npm run dev        # 本地开发
npm run typecheck  # 类型检查
npm run deploy     # 部署到 Cloudflare Pages
```

## 协议

本项目基于 [MIT License](./LICENSE) 开源。
