# Rippling 零基础部署向导

这份文档适合第一次部署网站的人。你不需要会写代码，只需要准备一个 GitHub 账号和一个 Cloudflare 账号，按顺序完成网页操作即可。

推荐路线是：**GitHub 保存代码 → Cloudflare Pages 自动构建 → Cloudflare D1 保存数据**。图片上传和每日归档属于可选功能，可以先不配置。

## 0. 先运行本地向导

如果你已经把项目下载到电脑，在项目目录打开终端：

```bash
npm run setup:wizard
```

它会检查 Node.js / Git，询问你的部署选择，并生成本地准备笔记。向导不会上传代码、创建云资源，也不会保存密码或 Token。

## 1. 准备账号和软件

需要：

1. GitHub 账号：用于保存项目源码。
2. Cloudflare 账号：用于网站和 D1 数据库。
3. Node.js 20 或更高版本：从 [nodejs.org](https://nodejs.org/) 安装 LTS 版本。
4. Git：从 [git-scm.com](https://git-scm.com/downloads) 安装。

Backblaze B2 不是必需的。如果暂时不需要上传头像和图片，可以跳过它。

## 2. 把项目放到自己的 GitHub 仓库

最简单的方法是打开原项目页面，点击 **Fork**，把项目复制到自己的 GitHub 账号下。

然后在电脑上克隆你自己的仓库：

```bash
git clone https://github.com/你的账号/rippling.git
cd rippling
```

不要把 `.env`、密码、Cloudflare API Token 或 B2 密钥提交到 GitHub。项目已经通过 `.gitignore` 忽略 `.env`。

## 3. 创建 Cloudflare D1 数据库

1. 登录 Cloudflare Dashboard。
2. 打开 **Workers & Pages → D1 SQL Database**。
3. 点击 **Create database**。
4. 数据库名称建议填写 `rippling`。
5. 创建完成后复制 **Database ID**，先保存到记事本。

检查点：你应该已经拥有一个数据库名称和一串 Database ID。Database ID 不是密码，但不要填错。

## 4. 创建 Cloudflare Pages 项目

1. 打开 **Workers & Pages → Create application → Pages → Connect to Git**。
2. 授权 Cloudflare 访问 GitHub。
3. 选择你自己的 `rippling` 仓库。
4. 构建配置填写：

| 项目 | 填写内容 |
| --- | --- |
| Project name | `rippling` 或你喜欢的名称 |
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `npm run build` |
| Build output directory | `public` |
| Root directory | 留空 |

先点击部署。第一次部署可能暂时打不开，这是正常的，因为数据库还没有绑定和初始化。

## 5. 绑定 D1 数据库

进入 Pages 项目的 **Settings → Bindings**：

1. 点击 **Add**。
2. 选择 **D1 database**。
3. Variable name 必须填写 `DB`，注意是大写。
4. 选择刚才创建的 `rippling` 数据库。
5. 保存后进入 **Deployments**，对最新部署点击 **Retry deployment**。

检查点：绑定名不是数据库名，代码只认 `DB`。填成 `DATABASE` 会导致网站无法读取数据库。

## 6. 配置环境变量

进入 Pages 项目的 **Settings → Environment variables → Production**，逐项添加：

| 变量 | 必需 | 填写说明 |
| --- | --- | --- |
| `TRUSTED_ORIGINS` | 是 | 部署后的网站完整地址，例如 `https://rippling.pages.dev` |
| `DATABASE_ID` | 推荐 | 第 3 步复制的 Database ID |
| `ENCRYPTION_KEY` | 推荐 | 终端执行 `openssl rand -hex 32` 生成 |
| `B2_BUCKET_NAME` | 否 | B2 存储桶名称 |
| `B2_ACCESS_KEY_ID` | 否 | B2 keyID |
| `B2_SECRET_ACCESS_KEY` | 否 | B2 applicationKey |
| `B2_ENDPOINT` | 否 | 例如 `https://s3.us-west-000.backblazeb2.com` |
| `REGISTER_QUESTIONS` | 推荐 | 注册验证问题 JSON，至少两个问题 |

如果还没有 B2，只填写前三项即可。所有密码和 Token 都应使用 Cloudflare 的 **Encrypt** 选项保存。

注册问题示例：

```json
[{"question":"你的学校简称是什么？","answer":"某某"},{"question":"本校位于哪个城市？","answer":"某市"}]
```

保存环境变量后再次 **Retry deployment**。

## 7. 执行数据库迁移

在项目根目录安装依赖：

```bash
npm install
npx wrangler login
```

浏览器会打开 Cloudflare 授权页面。授权完成后执行：

```bash
npx wrangler d1 migrations apply rippling --remote
```

如果你的数据库不叫 `rippling`，把命令最后的名称换成你的数据库名称。

看到 `Applied 001_initial_schema.sql`、`Applied 002_indexes.sql` 和 `003_question_box_owner_index.sql` 之类的成功提示，才算完成。

如果不想安装 Wrangler，也可以在 D1 的 SQL Console 中按顺序执行 `migrations/001_initial_schema.sql`、`migrations/002_indexes.sql`、`migrations/003_question_box_owner_index.sql`。

## 8. 完成第一次站点初始化

打开网站地址。首次访问会进入 `/setup`：

1. 填写站点名称。
2. 设置学号格式；不确定时可以先使用默认值。
3. 设置超级管理员学号和密码。
4. 选择主题。
5. 点击初始化。

初始化成功后，用管理员账号登录，进入 **我的 → 管理面板**。能打开管理面板，说明数据库、认证和权限已经基本正常。

## 9. 可选：配置图片和自动归档

### 图片上传

创建 Backblaze B2 Bucket 和 Application Key，然后把 `B2_BUCKET_NAME`、`B2_ACCESS_KEY_ID`、`B2_SECRET_ACCESS_KEY`、`B2_ENDPOINT` 四项填入 Cloudflare。四项必须同时正确，图片功能才会工作。

### 自动归档

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加：

- `ENCRYPTION_KEY`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `D1_DATABASE_ID`

其中 `ENCRYPTION_KEY` 必须和 Cloudflare Pages 中的值完全一致。API Token 只授予所需 Cloudflare 账户的 D1 编辑权限，不要使用全权限 Token。

## 10. 部署完成后的日常更新

以后修改代码只需要：

```bash
git add .
git commit -m "更新网站"
git push origin main
```

Cloudflare Pages 会自动重新构建。若新增了数据库迁移，必须先执行：

```bash
npx wrangler d1 migrations apply rippling --remote
```

数据库迁移不会因为网站重新部署而自动执行。

## 常见问题

### 页面能打开，但登录或注册失败

先检查 D1 是否绑定为 `DB`，再确认迁移是否执行成功。

### 页面提示站点未初始化

打开网站的 `/setup`，并确认数据库迁移已经执行。

### 图片上传失败

检查 B2 四个变量是否齐全，`B2_ENDPOINT` 是否包含 `https://`，Bucket 是否允许应用正常读写。

### 修改变量后没有效果

环境变量和绑定修改后必须在 Cloudflare 的 **Deployments** 中点击 **Retry deployment**。

### 想使用 Worker CLI 部署

这是进阶路线，需要先修改 `wrangler.worker.jsonc` 中的 Worker 名称、D1 database ID 和域名，然后执行：

```bash
npm run build
npx wrangler deploy --config wrangler.worker.jsonc
```

第一次部署建议先使用 Cloudflare Pages 路线，成功后再迁移到 Worker。
