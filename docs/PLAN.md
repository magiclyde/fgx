# fgx — 设计稿交付与解析工作台 · 落地方案

> 本文档与代码实现保持一致，随代码变更同步更新。

## 需求背景（原始需求，2026-10-20）

用户是 go/php/nodejs 后端开发（前端被裁后兼职前端），用过 Vue3 + Vite + Bun + JavaScript。工作中美术出 PSD，过去由前端切图写 CSS；现在需要自己上。曾考虑用 Figma MCP 或逆向 Figma 做替代品（fork 了 morluto/rea），实际核心需求是：

> 一个轻量级设计稿交付与解析工作台——美术上传设计稿，无需授权，解析设计稿，最后（结合 Claude Code 等工具）编写出页面。

约束：Web 界面、需要用户认证（不允许任何人访问）、利用现有技术栈与本机工具。

## 方案选型（已定）

- **方案 A（已落地）**：PSD 直解析。美术上传 PSD → 浏览器端 ag-psd 解析 → design.json + 切图 → 生成 Claude Code 任务包。输出信息（绝对坐标 + 层级 + 文本样式）对「还原设计稿」足够。
- 方案 B（备选，未采用）：自托管 Penpot，需美术换工具。
- ~~逆向 Figma 做替代品~~：工程量和版权风险均不可行，放弃。

## 技术栈与关键决策

| 项 | 实现 | 说明 |
|---|---|---|
| 前端 | Vue3 + Element Plus + Vite + JavaScript | PC 端工作台；项目结构参考用户旧项目 webpay（axios services 层、router 守卫） |
| 后端 | Bun + Hono | multipart 上传用 Hono 自带 `parseBody`，无需 multer（Express 生态） |
| 数据库 | bun:sqlite（零依赖） | users / sessions / projects 三表 |
| 认证 | 会话 Cookie（HttpOnly，7 天） | 密码 bcrypt（`Bun.password`）；管理员手工建账，无公开注册；登录失败限流 5 次/5 分钟/IP |
| PSD 解析 | ag-psd，全部在浏览器完成 | 服务端只存文件；不支持 PSB/CMYK，限 500MB |
| 文件存储 | MinIO/S3（`S3_ENDPOINT` 配置时）→ 本地磁盘兜底 | Bun 内置 `S3Client`，零依赖；**任务包始终写本地磁盘**（给本机 Claude Code 读） |
| 项目 ID | `crypto.randomUUID()` | 服务端校验格式，防路径注入 |

## 架构

```
浏览器（解析全在客户端，server 只存文件 + 认证）
  选 PSD → ag-psd readPsd → 规范化 design.json + 合成图 canvas
    → multipart 上传（file=PSD, design=JSON 字符串, composite=PNG）
详情页：
  切图 zip：重新拉取 original.psd 在浏览器解析 → 勾选图层 canvas.toBlob → jszip 打包下载
  任务包：勾选切片 PNG 上传 → server 写 data/packages/<id>/{design.json, composite.png, assets/, PROMPT.md}
```

## 目录结构（实现）

```
package.json        # bun workspaces + 根脚本：dev / build / start / create-admin
scripts/dev.mjs     # bun run dev 入口：Bun.spawn 并行拉起 server(--watch) 与 vite，转发 Ctrl+C 统一退出
.env.example        # 配置示例（PORT / VITE_PORT / VITE_API_TARGET / S3_*），复制为 .env 生效
server/src/
  index.js          # Hono 入口；/api 路由 + 生产模式托管 web/dist（SPA 回退）
  db.js             # bun:sqlite 建表；data/ 目录
  storage.js        # 磁盘 / S3 存储抽象（put/get/removePrefix）
  auth.js           # 会话、登录/登出/me、requireAuth/requireAdmin、限流
  routes/users.js   # 管理员：建账/禁用/改密/列表
  routes/projects.js# 上传/列表/详情/删除/design.json/original/composite/任务包
  scripts/create-admin.js
web/src/
  router/index.js   # title 守卫 + 未登录跳 /login + admin 路由
  store/auth.js     # 响应式登录态
  services/         # axios 封装（api.js）+ authService/projectService/userService
  psd/parse.js      # ag-psd → design.json 规范化；collectCanvases（切图用）
  psd/slices.js     # canvas → PNG blob → jszip 打包下载
  views/            # Login / Projects / ProjectDetail（三栏工作台）/ AdminUsers
data/               # 运行期：fgx.db、files/（或 S3）、packages/
```

## design.json 规范

```json
{
  "meta": { "name": "首页.psd", "width": 750, "height": 1624, "parsedAt": "...", "generator": "ag-psd" },
  "layers": [{
    "id": "0/2/1", "name": "标题", "type": "text|group|layer",
    "visible": true, "rect": { "x": 0, "y": 0, "w": 750, "h": 120 },
    "children": [],
    "text": { "content": "...", "font": "...", "size": 32, "color": "#333", "bold": null, "italic": null },
    "hasImage": true
  }]
}
```

id 为路径序号，稳定可引用；文本样式从 ag-psd 尽力提取，缺字段为 null。

## 页面与功能

1. **登录**：会话 Cookie，未登录访问任意页跳 /login
2. **项目列表**（el-table）：上传 PSD（对话框内解析 → 合成预览 + 图层数 → 确认上传，带进度条）、打开、删除（仅上传者或管理员）
3. **详情工作台**（Penpot 式三栏）：左 el-tree 图层树（勾选框用于切图选择）/ 中画布缩放预览 + 选中层矩形高亮 / 右属性面板（坐标、尺寸、文本、字体、颜色）
   - 切图打包：勾选图层 → 重解析 original.psd → PNG zip 下载
   - 下载 design.json
   - 生成 Claude 任务包：选目标技术栈（vant 移动端 / element-plus PC，仅影响 PROMPT.md 模板）→ 服务端写包 → 复制提示词
4. **用户管理**（仅管理员）：建账、禁用/启用、重置密码

## 安全要点（内网级）

- 除 `/api/auth/login` 外全部需会话；`/api/users*` 需管理员；项目删除需本人或管理员
- 登录失败内存限流；bcrypt 密码哈希
- 项目 id 格式校验，文件路径全部服务端拼接

## 验证记录（2026-10-20 已通过）

- `bun install` → `bun run create-admin admin <密码>` → server 启动，`/api/health` 返回 storage 类型
- curl 全流程：登录 → 上传（ag-psd 生成的 sample.psd）→ 列表/design.json/original 下载（字节一致）→ 任务包（中文名切片落盘 + PROMPT.md）→ 普通用户访问 /api/users 返回 403
- `bun run build` 构建成功；生产模式 server 托管 dist，SPA 路由回退正常
