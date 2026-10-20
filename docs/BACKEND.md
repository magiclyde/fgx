# 后端速读（Go/Gin 视角）

> server/ 本质就是「一个 HTTP 框架 + 一个运行时」，与 Go 的 Gin 栈一一对应。
> 读完本文件即可把 `server/` 当 Gin 项目看懂。

## 概念对照表

| 本项目 | Go 栈 | 角色 |
|---|---|---|
| Bun | Go 运行时 | 执行 JS（`bun server/src/index.js` ≈ `go run main.go` / 跑编译产物） |
| Hono | Gin | HTTP 框架：路由、中间件、请求上下文 `c` |
| `bun run start` | `go build && ./app` | 启动服务进程（JS 无编译步骤，直接解释执行） |
| `bun --watch`（dev 脚本） | air / fresh | 改代码自动重启 |
| `app.route('/api/projects', ...)` | `r.Group("/api/projects")` | 路由分组 |
| `app.use('/api/projects', requireAuth)` | `group.Use(AuthMiddleware())` | 中间件 |
| `c.json(data, 200)` | `c.JSON(200, data)` | 返回 JSON |
| `serveStatic({ root: dist })` | `router.Static("/", "./dist")` | 托管静态文件 |
| `c.req.parseBody()` | `c.MultipartForm()` | 解析 multipart 上传 |
| `bun:sqlite` | `database/sql` + sqlite 驱动 | 数据库 |
| `Bun.password.hash` | `golang.org/x/crypto/bcrypt` | 密码哈希 |
| Bun 自动加载 `.env` | godotenv | 环境变量 |
| `Bun S3Client` | minio-go | S3 兼容存储 |

## server/ 目录 ↔ Gin 项目分层

```
server/src/index.js    → main.go：创建 app、注册中间件与路由、托管 dist、监听端口
server/src/routes/     → handler 层：users / projects 两组路由
server/src/auth.js     → middleware + session 逻辑（登录、requireAuth/requireAdmin、限流）
server/src/storage.js  → storage 接口的两个实现：disk（兜底）/ S3（配置 S3_ENDPOINT 时）
server/src/db.js       → model 层：bun:sqlite 建表（users / sessions / projects）
```

## 请求处理一览

```
GET /api/projects     → Hono 路由 → 查 SQLite → c.json 返回
GET /assets/xxx.js    → serveStatic 命中 web/dist → 原样返回静态文件
GET /projects/abc     → dist 无此文件 → SPA 回退返回 index.html（前端路由接管）
```

## 与 Go 栈的唯一差异

前端工具链（Vite dev server / `vite build`）没有 Go 对应物。最接近的 Go 方案是：
前端独立 build 出 dist，用 `go:embed` 嵌入二进制——本项目的生产模式本质相同，
只是「嵌入」换成「启动时检测 web/dist 目录并托管」。
