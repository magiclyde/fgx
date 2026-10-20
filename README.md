# fgx — 轻量级设计稿交付与解析工作台

美术上传 PSD → 浏览器端解析 → 结构化 design.json + 切图 → 一键生成 Claude Code 任务包，打通「设计稿 → AI 生成页面」的交付流程。

- 前端：Vue3 + Element Plus + Vite（PC 端工作台）
- 后端：Bun + Hono，SQLite（bun:sqlite），会话 Cookie 认证
- 解析：ag-psd（全部在浏览器完成，服务端只存文件）
- 存储：默认本地磁盘 `data/files/`；配置 S3 环境变量后走 MinIO/S3

详细设计见 [docs/PLAN.md](docs/PLAN.md)；前端新手入门（面向后端开发的 Vue3 速成）见 [docs/FRONTEND.md](docs/FRONTEND.md)。

## 快速开始

```bash
bun install
bun run create-admin admin <密码>   # 创建首个管理员
bun run dev                          # server :3100 + vite :5173（代理 /api）
```

端口配置：后端用 `PORT` 环境变量（默认 3100）；前端 dev 用 `VITE_PORT`（默认 5173），代理目标用 `VITE_API_TARGET`（默认 `http://localhost:3100`，后端端口改了要同步）。

打开 http://localhost:5173 ，用 admin 登录；在「用户管理」里给美术建账号。

## 生产模式

```bash
bun run build     # 构建 web → web/dist
bun run start     # server 单进程 :3100，同时托管前端
```

## MinIO / S3 存储（可选）

设置以下环境变量后，上传的 PSD / design.json / composite.png 存入 S3 兼容存储（如本地 MinIO）；不设置则用本地磁盘兜底：

```bash
export S3_ENDPOINT=http://localhost:9000
export S3_BUCKET=fgx
export S3_ACCESS_KEY=minioadmin
export S3_SECRET_KEY=minioadmin
bun run start
```

注意：**Claude 任务包始终写本地磁盘** `data/packages/<id>/`，因为那是给本机 Claude Code 读取的。

## 使用流程

1. 「上传 PSD」：选择文件后浏览器自动解析，确认合成预览与图层数后上传（仅支持 RGB 模式 .psd，不支持 PSB，≤500MB）
2. 详情页三栏：左侧图层树（可勾选）/ 中间画布缩放预览 + 图层高亮 / 右侧属性（坐标、尺寸、文本、字体、颜色）
3. 「切图打包」：勾选图层 → 打包 PNG 切片 zip 下载
4. 「下载 design.json」：结构化图层数据
5. 「生成 Claude 任务包」：选择目标技术栈（vant 移动端 / element PC），服务端在 `data/packages/<id>/` 生成 `design.json + composite.png + assets/*.png + PROMPT.md`，复制提示词粘贴给 Claude Code 即可开工

## 目录结构

```
scripts/dev.mjs  # bun run dev 入口：并行启动 server 与 vite，Ctrl+C 统一退出
server/          # Bun + Hono 后端
  src/index.js   # 入口（API + 生产模式托管 web/dist）
  src/auth.js    # 登录/会话/限流
  src/storage.js # 磁盘 / S3 存储抽象
  src/routes/    # users / projects 路由
web/             # Vue3 + Element Plus 前端
  src/psd/       # ag-psd 解析规范化、切图打包
  src/views/     # 登录 / 项目列表 / 详情工作台 / 用户管理
data/            # 运行期数据（SQLite、文件、任务包），勿提交
```

## 常见问题

- **没有 multer？** 后端跑在 Bun + Hono 上，Hono 自带 `parseBody` 处理 multipart 上传，就是现成轮子，multer 属于 Express 生态。
- **PSD 解析失败？** 让美术另存为 RGB 模式、8 位/通道的 .psd（不支持 CMYK / PSB 大型文档格式）。
- **没有合成预览图？** PSD 保存时需勾选「最大兼容性」，不影响图层解析与切图。
