#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const notesDirectory = path.join(projectRoot, ".rippling");
const notesPath = path.join(notesDirectory, "setup-notes.md");

function printHeader(text) {
  console.log(`\n=== ${text} ===`);
}

function commandVersion(command, args = ["--version"]) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function validUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function validDatabaseId(value) {
  return value === "" || /^[0-9a-f-]{20,}$/i.test(value);
}

async function askChoice(rl, question, choices, fallback) {
  console.log(`\n${question}`);
  choices.forEach((choice, index) => console.log(`  ${index + 1}. ${choice.label} — ${choice.description}`));
  while (true) {
    const answer = (await rl.question(`请选择 [${fallback}]: `)).trim() || String(fallback);
    const choice = choices[Number(answer) - 1];
    if (choice) return choice.value;
    console.log("请输入列表中的数字。\n");
  }
}

function buildNotes({ deploymentPath, siteUrl, databaseId, imageHosting, archive }) {
  const databaseLine = databaseId ? `- D1 Database ID：\`${databaseId}\`` : "- D1 Database ID：尚未填写（创建 D1 后补充）";
  const originLine = siteUrl ? `- 站点地址：\`${siteUrl}\`` : "- 站点地址：部署成功后补充，并填入 `TRUSTED_ORIGINS`";
  const imageLine = imageHosting === "b2" ? "- 图片：配置 Backblaze B2" : "- 图片：暂不配置 B2，文字功能仍可使用";
  const archiveLine = archive === "yes" ? "- 自动归档：启用，需配置 GitHub Actions Secrets" : "- 自动归档：暂不启用";

  return `# Rippling 部署准备笔记

> 这是向导生成的本地文件，不包含密码、API Token 或 B2 密钥，已被 Git 忽略。

## 你的选择

- 部署方式：${deploymentPath === "pages" ? "Cloudflare Pages + GitHub（推荐）" : "Cloudflare Worker CLI"}
${originLine}
${databaseLine}
${imageLine}
${archiveLine}

## Cloudflare 环境变量清单

在 Cloudflare 项目的 **Settings → Environment variables** 中填写。只复制变量名，密钥值不要写进 Git 仓库：

| 变量 | 是否需要 | 说明 |
| --- | --- | --- |
| \`DATABASE_ID\` | 推荐 | D1 数据库 ID |
| \`TRUSTED_ORIGINS\` | 必须 | 站点完整 HTTPS 地址 |
| \`ENCRYPTION_KEY\` | 推荐 | 归档加密密钥，使用 \`openssl rand -hex 32\` 生成 |
| \`B2_BUCKET_NAME\` | 可选 | B2 存储桶名称 |
| \`B2_ACCESS_KEY_ID\` | 可选 | B2 keyID |
| \`B2_SECRET_ACCESS_KEY\` | 可选 | B2 applicationKey |
| \`B2_ENDPOINT\` | 可选 | 例如 \`https://s3.us-west-000.backblazeb2.com\` |
| \`REGISTER_QUESTIONS\` | 推荐 | 至少两个注册验证问题的 JSON |

## 下一步

1. 打开 \`docs/beginner-deployment.md\`，从第 1 步开始执行。
2. 创建 D1 后运行数据库迁移，不能跳过。
3. 首次访问网站时打开 \`/setup\`，创建站点和超级管理员。
4. 部署完成后删除或妥善保存本文件；它不含密钥，但记录了你的部署信息。
`;
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log("Rippling 零基础部署准备向导\n\n用法：npm run setup:wizard\n\n向导会检查本机环境、询问部署选项，并生成 .rippling/setup-notes.md。它不会自动创建 Cloudflare 资源，也不会保存密码或 Token。\n");
    return;
  }

  printHeader("Rippling 零基础部署准备向导");
  console.log("这个向导不会修改数据库、部署网站或保存密钥。它会帮你确认准备工作，并生成下一步清单。\n");

  printHeader("1/4 检查本机环境");
  const nodeVersion = commandVersion("node");
  const gitVersion = commandVersion("git");
  console.log(`Node.js：${nodeVersion ?? "未找到"}`);
  console.log(`Git：${gitVersion ?? "未找到"}`);
  if (!nodeVersion) {
    console.log("请先安装 Node.js 20 或更高版本：https://nodejs.org/\n");
  }
  if (!gitVersion) {
    console.log("请先安装 Git：https://git-scm.com/downloads\n");
  }

  const rl = readline.createInterface({ input, output });
  try {
    printHeader("2/4 选择部署方式");
    const deploymentPath = await askChoice(
      rl,
      "第一次部署建议选择 Cloudflare Pages，它可以通过 GitHub 自动更新。",
      [
        { value: "pages", label: "Cloudflare Pages", description: "最适合零基础用户，网页操作为主" },
        { value: "worker", label: "Cloudflare Worker", description: "适合熟悉 Wrangler 和命令行的用户" },
      ],
      1
    );

    printHeader("3/4 填写已知信息");
    let siteUrl = "";
    while (true) {
      siteUrl = await rl.question("如果已经有站点地址，请输入 HTTPS 地址（没有就直接回车）: ");
      siteUrl = siteUrl.trim();
      if (!siteUrl || validUrl(siteUrl)) break;
      console.log("地址必须以 https:// 开头，例如 https://rippling.example.com。\n");
    }

    let databaseId = "";
    while (true) {
      databaseId = (await rl.question("如果已经创建 D1，请输入 Database ID（没有就直接回车）: ")).trim();
      if (validDatabaseId(databaseId)) break;
      console.log("Database ID 看起来不正确，请复制 Cloudflare 页面上的完整 ID。\n");
    }

    const imageHosting = await askChoice(
      rl,
      "论坛图片是否使用 Backblaze B2？",
      [
        { value: "b2", label: "使用 B2", description: "可以上传头像、帖子图片和站点图标" },
        { value: "none", label: "暂不使用", description: "先部署文字功能，之后可在 Cloudflare 中补配置" },
      ],
      1
    );
    const archive = await askChoice(
      rl,
      "是否启用 GitHub Actions 自动归档？",
      [
        { value: "yes", label: "启用", description: "需要额外配置 Cloudflare API Token 等 Secrets" },
        { value: "no", label: "暂不启用", description: "部署完成后仍可补配置" },
      ],
      2
    );

    printHeader("4/4 生成准备笔记");
    fs.mkdirSync(notesDirectory, { recursive: true });
    fs.writeFileSync(notesPath, buildNotes({ deploymentPath, siteUrl, databaseId, imageHosting, archive }), "utf8");
    console.log(`已生成：${notesPath}`);
    console.log("\n接下来请打开 docs/beginner-deployment.md，按章节逐项完成。遇到“检查点”时不要跳过。\n");
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error("向导运行失败：", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
