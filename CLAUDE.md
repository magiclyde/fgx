# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

fgx 是内网使用的「设计稿交付与解析工作台」：美术上传 PSD → 浏览器端 ag-psd 解析 → design.json + 切图 → 生成 Claude Code 任务包，打通「设计稿 → AI 生成页面」流程。

## 常用命令

```bash
bun install                     # 安装依赖（bun workspaces：server/ + web/）
bun run dev                     # 开发：并行启动 server(:3100, --watch) + vite(:5173, 代理 /api)
bun run build                   # 构建前端 → web/dist
bun run start                   # 生产：server 单进程 :3100，托管 API + web/dist
bun run create-admin <名> <密码> # 创建/重置管理员（无公开注册）
```

配置：根目录 `.env`（参照 `.env.example`），Bun 自动加载。`PORT` / `VITE_PORT` / `VITE_API_TARGET` / `S3_*`。

无测试、无 lint 配置。

## 架构要点（跨文件才能看懂的部分）

**解析在浏览器，服务端只存文件。** PSD 解析（ag-psd）全部发生在 `web/src/psd/parse.js`，产出规范化 design.json（路径序号 id、rect 绝对坐标、文本样式）；服务端只接收 multipart（file + design + composite）落盘/写库。详情页的切图功能是**重新下载 original.psd 再解析一次**拿各层 canvas（`collectCanvases`），服务端从不解析 PSD。

**存储抽象两个后端。** `server/src/storage.js`：配置 `S3_ENDPOINT` 走 Bun 内置 S3Client（MinIO），否则本地磁盘 `data/files/`。**例外：Claude 任务包始终写本地磁盘** `data/packages/<id>/`，因为它是给本机 Claude Code 读的。任务包是覆盖式单包（每次生成先删旧包，决策记录在 docs/PLAN.md）。

**认证 = 会话 Cookie。** `server/src/auth.js`：bcrypt（`Bun.password`）+ sqlite sessions 表 + HttpOnly cookie；`requireAuth`/`requireAdmin` 中间件；登录失败内存限流。前端 `services/api.js` 的 axios 拦截器统一处理 401 跳登录；路由守卫在 `web/src/router/index.js`。

**生产模式的 SPA 托管**：`server/src/index.js` 启动时检测 `web/dist` 存在才挂静态中间件 + index.html 回退。所以删掉 dist 后 :3100 只剩 API。

## 已知的坑

- `bun --watch` 对 EADDRINUSE 是软失败：打印错误但进程不退出。`bun run dev` 报不了端口冲突，判断 server 是否真起来要 curl `/api/health` 或看启动日志。
- ag-psd 不支持 PSB/CMYK，PSD 需 RGB + 「最大兼容性」（否则无合成预览图）。
- 前端 el-tree 勾选只取叶子节点且跳过 group 类型（切图/任务包的图层选择逻辑）。

## 协作约定（用户要求）

- **文档与代码必须一致**：改实现时同步更新 `docs/PLAN.md`；重要技术抉择（含理由和放弃的方案）记入 PLAN.md 的决策表。
- **commit 规范**：Conventional Commits（feat/fix/docs/refactor/chore），精简，**不加任何署名行**（如 Co-Authored-By）。
- UI 文案、文档、注释使用中文。
- 目录约定：运行期数据（SQLite、文件、任务包）都在 `data/`，不入库。
