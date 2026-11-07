# Rippling 部署指南

> 本文档面向**没有开发经验的用户**，带你从零把 Rippling 部署到 Cloudflare。
> 全程在浏览器中操作为主，只需在少数步骤使用命令行。
> 预计耗时：30 ~ 60 分钟（不含注册账号的审核等待时间）。

**部署后的效果**：你会获得一个 `https://你的项目名.pages.dev` 网址的校园论坛，
数据存储在 Cloudflare D1 数据库中，图片（可选）存储在 Backblaze B2。

> 说明：本文档只覆盖**全新部署**。旧数据迁移是单独文档，不包含在内。

---

## 一、准备工作

开始前请准备好以下账号和工具：

| 项目 | 说明 | 注册地址 |
| --- | --- | --- |
| Cloudflare 账号 | 提供网站托管、数据库（免费额度足够个人使用） | https://dash.cloudflare.com/sign-up |
| GitHub 账号 | 存放代码，Cloudflare 从这里自动拉取部署 | https://github.com/signup |
| Backblaze B2 账号 | 图床，用于上传图片（可选但推荐） | https://www.backblaze.com/cloud-storage |
| 一台能上网的电脑 | Windows / Mac 均可 | — |

另外请提前想好两样东西：

1. **超级管理员学号**：用于管理员登录（可以自创一个虚拟学号）。
2. **超级管理员密码**：一串至少 8 位的密码，请记在安全的地方。

---

## 二、创建 Cloudflare D1 数据库

D1 是 Cloudflare 提供的免费数据库，用来存放论坛的所有数据。

1. 登录 **Cloudflare Dashboard**（https://dash.cloudflare.com）
2. 在左侧菜单找到并点击 **Workers & Pages** → 子菜单中的 **D1 SQL Database**
   （旧版界面可能直接显示为左侧的 **D1**）
3. 点击蓝色按钮 **Create database**
4. **Database name** 填写：`rippling`
5. 点击 **Create**，位置（Location）保持默认 **Automatic** 即可
6. 创建完成后，页面会显示数据库详情。找到 **Database ID**，
   它形如 `1a2b3c4d-5e6f-7890-abcd-ef1234567890`。
   **请把它复制保存到记事本**，后面两个步骤都要用。

> 📝 截图位置说明：数据库详情页顶部有一个"Database ID"字段，旁边带复制按钮。

---

## 三、创建 Backblaze B2 存储桶

论坛里用户上传的图片会存到 B2（免费额度：10 GB 存储 + 每天 1 GB 下载）。
如果你暂时不想用图床，可以跳过本章，图片上传功能将不可用，其余功能不受影响。

1. 登录 **Backblaze B2**（https://secure.backblaze.com）
2. 左侧菜单点击 **Buckets** → 点击 **Create a Bucket**
3. **Bucket Name** 填写：`rippling-images`（全局唯一，重名时换一个）
4. **Files in Bucket** 选择 **Public**（公开可读，图片才能被论坛显示）
5. 其余保持默认，点击 **Create**
6. 左侧菜单点击 **App Keys** → 点击 **Add a New Application Key**
7. 填写：
   - **Name of Key**：`rippling`
   - **Allow access to Bucket(s)**：只勾选刚才创建的 `rippling-images`
   - **Type of Access**：Read and Write
8. 点击 **Create a Key**，页面会显示两个值，**只会显示这一次**，请立刻保存：
   - **keyID**（一串短字符）→ 对应后面的 `B2_ACCESS_KEY_ID`
   - **applicationKey**（一串长字符）→ 对应后面的 `B2_SECRET_ACCESS_KEY`
9. 记录 **S3 Compatible Endpoint**，形如 `s3.us-west-000.backblazeb2.com`
   （在 Bucket 详情页可以看到）→ 对应后面的 `B2_ENDPOINT`
10. Endpoint 中 `s3.` 和 `.backblazeb2.com` 之间的部分就是 region，
    例如 `us-west-000`（本项目暂不单独使用，记录备用）

---

## 四、Fork 或创建 GitHub 仓库

Cloudflare 需要能访问到 Rippling 的源码。

**方式一：Fork（推荐）**

1. 打开 Rippling 的 GitHub 仓库页面
2. 点击右上角 **Fork** 按钮 → **Create fork**
3. 等待完成后，你的 GitHub 账号下会多一份完整的代码副本

**方式二：自建仓库**

如果你拿到的是本地代码包：

1. 登录 GitHub → 右上角 **+** → **New repository** → 创建私有或公开仓库
2. 将代码推送到该仓库（需要 Git 基础，略）

**检查清单**：打开你的仓库页面，确认能看到以下目录和文件（缺一不可）：

```
├── .github/workflows/archive.yml   # 每日归档自动化
├── migrations/                     # 数据库建表脚本
├── src/                            # 全部源码（前端 + 后端 + 站点初始配置）
├── public/                         # 静态资源目录
├── package.json
└── wrangler.toml
```

---

## 五、创建 Cloudflare Pages 项目

1. 回到 **Cloudflare Dashboard**，左侧菜单点击 **Workers & Pages**
2. 点击蓝色按钮 **Create application** → 选择 **Pages** 标签页
3. 点击 **Connect to Git**
4. 选择 **GitHub**（首次使用需要授权 Cloudflare 访问你的仓库），
   然后选中你在第四章准备好的 Rippling 仓库
5. 进入构建配置页，按以下内容填写：

   | 配置项 | 填写内容 |
   | --- | --- |
   | Project name | `rippling`（会成为域名的一部分） |
   | Production branch | `main` |
   | Framework preset | 选择 **None** |
   | Build command | `npm run build` |
   | Build output directory | `public` |
   | Root directory (advanced) | 留空 |

   > 解释：仓库根目录的 `package.json` 里已经定义好 `build` 脚本：
   > 先把后端入口复制到 Cloudflare 能识别的 `functions/` 目录，
   > 再把后端依赖的模块（auth、db、routes 等）复制到仓库根目录供其引用，
   > 最后安装前端依赖并构建。所以你只需要填 `npm run build` 即可。

6. 点击 **Save and Deploy**，等待构建完成（首次约 2~5 分钟）
7. 部署成功后，页面会显示你的网址，形如 `https://rippling.pages.dev`。
   **请把这个网址记下来**，后面配置环境变量要用。

> 此时打开网址可能只能看到页面外壳、功能报错，这是正常的——
> 数据库还没绑定，环境变量还没配置。继续往下做。

---

## 六、配置环境变量

环境变量相当于告诉网站"你的数据库在哪、密码是什么"。

1. 进入你的 Pages 项目页面 → 顶部标签 **Settings** → 左侧 **Environment variables**
2. 点击 **Add variable**（生产环境 Production 一栏），逐个添加下表变量。
   每个变量点击 **Encrypt**（加密）按钮保护敏感值，然后点击 **Save**。

| 变量名 | 填什么 | 从哪里拿 |
| --- | --- | --- |
| `DATABASE_ID` | D1 数据库 ID | 第二章记录的 database_id |
| `ENCRYPTION_KEY` | 64 位十六进制随机字符串 | 见下方生成方法 |
| `B2_BUCKET_NAME` | `rippling-images` | 第三章的 Bucket 名 |
| `B2_ACCESS_KEY_ID` | B2 的 keyID | 第三章第 8 步 |
| `B2_SECRET_ACCESS_KEY` | B2 的 applicationKey | 第三章第 8 步 |
| `B2_ENDPOINT` | 如 `https://s3.us-west-000.backblazeb2.com` | 第三章第 9 步 |
| `REGISTER_QUESTIONS` | 注册验证问题 JSON | 见下方格式示例 |
| `TRUSTED_ORIGINS` | 你的 Pages 网址 | 如 `https://rippling.pages.dev` |
| `MAIL_PROVIDER_API_KEY` | 留空 | 邮件服务预留，暂不使用 |

**生成 ENCRYPTION_KEY**（用于归档数据加密，必须恰好 64 个十六进制字符）：

- Windows PowerShell 中运行：

  ```powershell
  -join (1..32 | ForEach-Object { "{0:x2}" -f (Get-Random 256) })
  ```

- 或者 Mac / Linux 终端运行：

  ```bash
  openssl rand -hex 32
  ```

**REGISTER_QUESTIONS 格式示例**（一行 JSON，至少 2 个问题）：

```json
[{"question":"你的学校简称是什么？","answer":"某某"},{"question":"本校位于哪个城市？","answer":"某市"}]
```

> ⚠️ 注意：JSON 中的引号必须是英文双引号；答案区分大小写，注册时需一字不差。

**前端公开变量**：无需配置。站点名称、主题等配置从后端接口读取，
部署完成后在管理面板中修改（见第十三章）。

3. 变量全部添加后，进入 **Deployments** 标签页，点击最新一次部署右侧的
   **⋯** → **Retry deployment**，让新变量生效。

---

## 七、绑定 D1 数据库到 Pages 项目

1. 进入 Pages 项目 → **Settings** → 左侧 **Bindings**（旧版界面为 **Functions**）
2. 点击 **Add** → 选择 **D1 database**
3. 填写：
   - **Variable name**：`DB`（必须是大写 DB，代码里按这个名字找数据库）
   - **D1 database**：下拉选择第二章创建的 `rippling`
4. 点击 **Save**
5. 与上一步相同，回到 **Deployments** 重新部署一次使绑定生效。

---

## 八、运行数据库迁移

迁移 = 在空数据库里创建所有需要的表。有两种方式，**推荐方式 A**。

### 方式 A：本地 Wrangler CLI（推荐）

1. 安装 **Node.js**（20 或更高版本）：访问 https://nodejs.org 下载 LTS 版，一路下一步安装
2. 将你的 GitHub 仓库克隆到本地：
   - 安装 [GitHub Desktop](https://desktop.github.com) 后克隆（图形界面，适合新手）；
   - 或在终端执行 `git clone 你的仓库地址`
3. 用文本编辑器（如记事本、VS Code）打开仓库根目录的 `wrangler.toml`，
   找到 `database_id = "待填写"`，把引号里的内容替换为第二章记录的 database_id，保存：

   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "rippling"
   database_id = "1a2b3c4d-5e6f-7890-abcd-ef1234567890"
   ```

   > 建议把这行修改提交回 GitHub，方便以后本地调试（database_id 不是机密）。

4. 在仓库根目录打开终端（PowerShell），依次运行：

   ```powershell
   npm install -g wrangler
   wrangler login
   ```

   `wrangler login` 会自动打开浏览器让你登录 Cloudflare 并授权，授权后回到终端。

5. 执行迁移：

   ```powershell
   wrangler d1 migrations apply rippling --remote
   ```

   看到类似 `Applied 001_initial_schema.sql`、`Applied 002_indexes.sql`
   的输出，说明两张迁移脚本都执行成功。

### 方式 B：Cloudflare Dashboard Console（无需安装任何软件）

1. Cloudflare Dashboard → **Workers & Pages** → **D1 SQL Database** → 点击 `rippling`
2. 进入 **探索数据**，点击上方标签栏的 new，是一个大的输入框
3. 打开仓库中的 `migrations/001_initial_schema.sql` 文件，
   复制**全部内容**粘贴到 Console，点击右边的向下的箭头，选择第2/3个 **Run**，等待提示成功
4. 再用同样方式执行 `migrations/002_indexes.sql` 和 `003_question_box_owner_index.sql` 的全部内容

> ⚠️ 方式 B 注意：两个文件必须**按顺序**执行（先 001 后 002），
> 每次只粘贴一个文件的内容。

---

## 九、运行初始化向导

完成数据库迁移后，首次访问网站会自动跳转到初始化向导页面（`/setup`）。

1. 打开你的网站网址（如 `https://rippling.pages.dev`），会自动跳转到 `/setup`
2. 填写初始化表单：

   | 配置项 | 说明 |
   | --- | --- |
   | 站点名称 | 显示在页面标题的站名 |
   | 学号格式正则 / 提示 | 控制注册时允许的学号格式（默认：20 开头 6 位数字） |
   | 超级管理员学号 | 你的管理员登录学号（无需匹配学号正则） |
   | 超级管理员密码 | 至少 8 位，强度会实时显示 |
   | 主题预设 | 明亮 / 深色 / 校园 / 温暖 |

3. 点击底部的 **开始初始化** 按钮提交
4. 成功后页面提示“初始化成功”，并自动跳转到登录页
5. 使用你设置的学号和密码登录
6. 进入 **我的** → **管理面板**，能正常打开即表示初始化成功

> 💡 提示：向导会通过认证系统创建超级管理员账号（拥有全部 38 项权限，
> 昵称“站长”，金色名字 + 站长徽章），并把站点配置写入数据库。
> 初始化只能执行一次，之后 `/setup` 页面会自动跳转首页。
> 后续可在管理面板修改站点名称、主题等配置，无需手动操作数据库。

---

## 十、配置 GitHub Actions Secrets

Rippling 内置每日自动归档：超过保留期限的内容会加密后存入仓库的 `archive/` 目录。
如果不需要归档功能，可跳过本章。

1. 打开你的 GitHub 仓库 → **Settings** → 左侧 **Secrets and variables** → **Actions**
2. 点击 **New repository secret**，逐个添加：

| Secret 名 | 填什么 |
| --- | --- |
| `ENCRYPTION_KEY` | 与第六章 Cloudflare 中填的完全一致 |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（见下方获取方法） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |
| `D1_DATABASE_ID` | 第二章记录的 database_id |

**获取 CLOUDFLARE_ACCOUNT_ID**：
Cloudflare Dashboard 首页右侧边栏即显示 **Account ID**，直接复制。

**获取 CLOUDFLARE_API_TOKEN**：

1. Cloudflare Dashboard → 右上角头像 → **My Profile** → 左侧 **API Tokens**
2. 点击 **Create Token** → 使用模板 **Custom token**（点击 Use template）
3. 权限设置：
   - 第一行：**Account** — **D1** — **Edit**
4. **Account Resources** 选择你的账户，点击 **Continue to summary** → **Create Token**
5. 复制生成的 Token（只显示一次）

配置完成后无需手动运行：归档 workflow 每日 UTC 00:00 自动执行，
也可以在仓库 **Actions** 标签页手动点击 **Daily Archive** → **Run workflow** 测试。

---

## 十一、重新部署

日常更新网站非常简单：

1. 修改代码后，推送到 GitHub 仓库的 `main` 分支
2. Cloudflare Pages 自动检测到变更并开始构建
3. 在 Pages 项目 → **Deployments** 页面可以查看构建进度
4. 构建完成后（约 2~5 分钟），刷新你的网址即可看到更新

> 提示：修改了 `src/functions/` 下的后端代码后，构建命令会自动重新复制，
> 无需额外操作。

---

## 十二、常见问题

**1. 登录失败 / 页面提示"网络错误"**

- 检查第七章的 D1 绑定：Variable name 必须恰好是 `DB`
- 检查第六章 `DATABASE_ID` 是否与第二章记录的一致
- 确认已完成第八章的数据库迁移（表不存在时所有功能都会报错）

**2. 图片上传失败**

- 确认 B2 Bucket 是 **Public**（公开可读）
- 逐项核对 `B2_BUCKET_NAME` / `B2_ACCESS_KEY_ID` / `B2_SECRET_ACCESS_KEY` / `B2_ENDPOINT`
  四个变量没有多余空格
- `B2_ENDPOINT` 必须带 `https://` 前缀

**3. 注册验证问题不生效 / 注册时报"参数无效"**

- 检查 `REGISTER_QUESTIONS` 是否为合法 JSON：英文双引号、问题之间用逗号分隔、
  整体被 `[` `]` 包裹
- 至少配置 2 个问题；少于 2 个时系统跳过验证（这是预期行为）

**4. 归档文件无法在归档查看器中读取**

- 确认归档 workflow 已成功运行（仓库 Actions 页面无红叉）
- 确认 `archive/` 目录已随仓库推送，并作为静态资源部署
- 确认 Pages 与 GitHub Actions 的 `ENCRYPTION_KEY` 完全一致（不一致会解密失败）

**5. 注册时提示学号格式错误**

- 默认学号格式为 `20 开头 + 6 位数字`（见 `src/config/site.config.json`）
- 用超级管理员账号登录 → 管理面板 → 站点配置，修改"学号格式正则"和提示文案
- 若暂时没有管理员账号，可修改 `src/config/site.config.json` 中的
  `studentIdPattern` 后重新推送部署

**6. 修改环境变量 / 绑定后网站没变化**

- 环境变量和绑定的修改**必须重新部署才生效**：
  Deployments → 最新部署 → **⋯** → **Retry deployment**

---

## 十三、更新站点配置

部署完成后，站点的个性化设置**不需要改代码**，在网页上即可完成：

1. 使用超级管理员账号登录
2. 进入 **我的** → **管理面板** → **站点配置** 标签页
3. 可修改的项目：

| 配置项 | 说明 |
| --- | --- |
| 站点名称 | 显示在页面标题的站名 |
| 学号格式正则 / 提示 | 控制注册时允许的学号格式 |
| 归档天数 | 超过该天数的内容会被每日归档 |
| 推荐流权重 | 点赞 / 评论 / 关注等对首页推荐分的影响系数 |
| 主题配色 | 预设主题（light / dark / campus / warm）与自定义颜色 |
| 默认权限 | 新用户注册时获得的权限（见管理面板用户管理） |

4. 修改后点击页面底部的 **保存配置** 即时生效，无需重新部署。

---

## 十四、更新代码会不会影响已有站点？

**不会动数据，但有三件事要知道。**

### 1. 站点配置存在数据库里

初始化向导跑完之后，整份配置（站名、主题、推荐权重、学号规则、自动分板块……）
以一行 JSON 存在 D1 的 `site_config` 表里。

`src/config/site.config.json` 只是**数据库里没有那一行时的兜底默认值**。
所以：

- 初始化之后再改 `site.config.json`，**网站不会变**（数据库里那一行优先）；
- 想改配置请用管理面板（我的 → 管理面板 → 站点配置）；
- 想让 json 重新生效，得先删掉数据库里的 `site_config` 那一行（等于重置配置，
  管理面板里没做这个按钮，一般不这么干）。

### 2. 推代码更新：数据、密钥、绑定都不受影响

| 东西 | 存在哪 | 推代码会不会动它 |
| --- | --- | --- |
| 帖子 / 用户 / 配置 | D1 数据库 | 不会 |
| 环境变量（加密密钥等） | Cloudflare 项目设置 | 不会（也不在仓库里） |
| D1 绑定 | Cloudflare 项目设置 | 不会 |
| 图片 | Backblaze B2 | 不会 |

### 3. 唯一要小心的是数据库结构变更

`migrations/` 下的 .sql **不会**在部署时自动执行。如果某次更新新增了迁移文件，
必须先在本地执行一次，否则新代码查一个不存在的列会全线 500：

```bash
wrangler d1 migrations apply rippling --remote
```

（把 `rippling` 换成你的数据库名。）当前仓库里的置顶修复**没有新增迁移**，
直接推送即可。

### 关于"预览部署"

推送到 `main` 以外的分支时，Pages 会生成一个预览地址（Preview 部署）：

- **Preview 环境的环境变量和 D1 绑定要单独配置**，只配了 Production 的话，
  预览站点会因为读不到数据库而满屏报错；
- 如果给 Preview 也绑了同一个 D1，**预览站点写的就是线上数据**，
  所以别在预览站点上删东西；
- 预览站点平时用来"看界面对不对"，改完验证没问题再合并到 `main`。

### 本地开发的一个坑

`wrangler.toml` 用的是 `[pages] pages_build_output_dir`，**wrangler 3 不认这个字段**。
所以 `npm run dev` 已经改成 `wrangler pages dev public`（显式指定静态目录），
wrangler 3 和 4 都能跑。如果本地起不来，先确认是不是用了旧命令。

另外 `wrangler.toml` 里的 `database_id` 是**上游作者自己的测试库**：

- 走 GitHub 集成的构建不看它（用的是 Cloudflare 后台绑定的那个库）；
- 只有手动 `npm run deploy` / `wrangler pages deploy` 才看它 ——
  用这条路之前记得把 `wrangler.toml` 里的 id 换成自己的。

---

## 附录：环境变量速查表

| 变量 | 位置 | 用途 |
| --- | --- | --- |
| `DATABASE_ID` | Cloudflare Pages | D1 数据库 ID（归档工具预留） |
| `ENCRYPTION_KEY` | Cloudflare Pages + GitHub | 归档加密密钥（两处必须一致） |
| `B2_BUCKET_NAME` | Cloudflare Pages | B2 存储桶名 |
| `B2_ACCESS_KEY_ID` | Cloudflare Pages | B2 keyID |
| `B2_SECRET_ACCESS_KEY` | Cloudflare Pages | B2 applicationKey |
| `B2_ENDPOINT` | Cloudflare Pages | B2 S3 兼容端点 |
| `REGISTER_QUESTIONS` | Cloudflare Pages | 注册验证问题（JSON） |
| `TRUSTED_ORIGINS` | Cloudflare Pages | 你的站点域名 |
| `MAIL_PROVIDER_API_KEY` | Cloudflare Pages | 邮件服务（预留，留空） |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions | 归档脚本读写 D1 |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions | Cloudflare 账户 ID |
| `D1_DATABASE_ID` | GitHub Actions | D1 数据库 ID |

---

## 附录二：线上实际拓扑（2026-11-07 起）

主站已经是 **Worker**，不再是 Pages Functions。`.pages.dev` 那几个地址现在只发"搬家公告"。

| 地址 | 谁来服务 | 说明 |
| --- | --- | --- |
| `lg.618271.xyz` | Worker `longgaobei-final` | 主地址（短，公告里指向它） |
| `longgaobei.618271.xyz` | 同一个 Worker | 第二个 Custom Domain，同一份代码 |
| `rippling.618271.xyz` | 静态 Worker `lg-moved` | 老学生收藏的地址，发公告 |
| `618271.xyz` / `www.618271.xyz` | 同一个 `lg-moved` | 普通 Route（见下） |
| `longgao.pages.dev` / `rippling-test.pages.dev` | Pages | Git 集成的构建产物 = `announce/` |
| `lg-announce.pages.dev` | Pages | 手动上传 `announce/` |
| `longgaobei.pages.dev` | Pages | **连着另一个仓库 `LG-Site`，别动** |

部署命令：

```bash
npm run build                                            # 前端 + 把 src/* 复制到根目录
npx wrangler deploy --config wrangler.worker.jsonc       # 主站
npx wrangler deploy --config wrangler.announce.jsonc     # 老地址的公告（纯静态）
```

### 三个坑

1. **Pages 集成会把你推上来的代码重新 build 成"老站"**。`longgao` 一开始
   `build_command=npm run build` + `destination_dir=public`，于是**每次 push 都把公告覆盖回应用**。
   现在改成 `build_command=exit 0` + `destination_dir=announce`：推代码 → 发公告。
2. **根域绑 Custom Domain 会被拒（code 100117）**：`618271.xyz` 上有一条"外部托管"的
   A 记录（指向 `192.0.2.1`，所以以前一直是 522）。Custom Domain 要求先删记录，
   而 wrangler 的 OAuth token **没有 DNS 写权限**。改用普通 Route 就行 ——
   Route 不动 DNS，而且优先于回源。
3. **`npx wrangler pages deploy <dir>` 在仓库根跑会被根目录那份 `functions/` 污染**
   （`npm run build` 从 `src/` 拷过来的副本），直接 BuildFailure "Could not resolve ../db"。
   要发静态页就从只放那个文件的干净目录发。

### 环境变量搬到 Worker 上了

`ADMIN_STUDENT_ID` / `ADMIN_PASSWORD` / `B2_*` / `ENCRYPTION_KEY` / `REGISTER_QUESTIONS`
现在都是 Worker `longgaobei-final` 的 secret；Pages 项目上的同名变量已经清空
（只留 `MAIL_PROVIDER_API_KEY`，它是唯一没在 Worker 上的）。
注意：这个 token 下 `wrangler secret list` 会返回**空数组**，别据此判断"没配密钥"——
发一次真实请求验证（比如 `/api/image` 能返回 JPEG 就说明 B2 密钥在）。
