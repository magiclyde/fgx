# 前端基础入门（以本项目为教材）

> 面向后端开发的 Vue3 速成。按「读代码的顺序」组织，概念都拿后端类比。

## 1. 心智模型：SPA（单页应用）

```
传统（如 PHP）：  浏览器请求 /users → 服务器拼好完整 HTML 返回 → 点链接 → 整页刷新重新请求
SPA（本项目）：   浏览器只加载一次 index.html + 一大坨 JS → 之后所有「页面切换」都是 JS 在浏览器里
                 局部重绘，数据靠 fetch 调 /api 接口拿 JSON
```

后端（Hono）对前端来说就是纯 JSON API。**"路由"在前端也发生了**：`/projects/xxx` 不再由服务器决定返回什么页面，而是 `web/src/router/index.js` 里映射到某个 Vue 组件。

## 2. 工具链：代码不是直接跑的

浏览器不认识 `.vue` 文件，也不认识 `import xxx from 'vue'`（裸模块名）。中间有一层构建工具 **Vite**，类比 `go build`：

| 命令 | 类比 | 作用 |
|---|---|---|
| `bun install` | `go mod download` | 按 package.json 装依赖到 node_modules |
| `bun run dev` | 带热重载的开发服务器 | Vite 边请求边编译 .vue，改代码浏览器秒更新 |
| `bun run build` | `go build` | 编译成静态产物 web/dist/（浏览器最终吃到的东西） |

`package.json` ≈ `go.mod`（依赖清单）+ Makefile（scripts 快捷命令）。

## 3. Vue 单文件组件（SFC）—— 一切的基本单元

一个 `.vue` 文件三段式（参考 `web/src/views/LoginView.vue`）：

```vue
<template>          <!-- 1. HTML 结构：声明式，{{ }} 和 v-if/@click 是模板语法 -->
  <el-input v-model="form.username" />
  <el-button :loading="loading" @click="onSubmit">登录</el-button>
</template>

<script setup>      // 2. JS 逻辑：变量是"响应式"的——改了数据，template 自动重绘
import { reactive, ref } from 'vue'
const form = reactive({ username: '', password: '' })  // 对象用 reactive
const loading = ref(false)                             // 单值用 ref（JS 里要 .value 访问）

async function onSubmit() { ... }   // 和普通 JS 函数没区别
</script>

<style scoped>      /* 3. CSS，scoped = 只作用于本组件，不污染全局 */
```

和后端最大的思维差异：**不手动操作 DOM**（没有 jQuery 式的 `$("#x").text(...)`），改数据，框架同步视图。关键指令：

- `v-model="form.x"` — 输入框和变量双向绑定
- `@click="fn"` — 事件绑定
- `:loading="loading"` — 属性绑定（冒号 = 后面是 JS 表达式）
- `v-if` / `v-for="{ row } in users"` — 条件/循环渲染

## 4. 主链路：从入口到页面

读代码顺序（对应后端 main → 路由注册 → handler）：

```
web/index.html          唯一 HTML，只有一个 <div id="app">
  └─ src/main.js        入口：createApp(App)，挂载 ElementPlus 组件库和 router
       └─ App.vue       根组件：全站壳子（顶部导航栏）+ <router-view/>
            └─ router/index.js   路由表：路径 → 组件
                 ├─ /login        → views/LoginView.vue
                 ├─ /             → views/ProjectsView.vue
                 ├─ /projects/:id → views/ProjectDetailView.vue
                 └─ /admin/users  → views/AdminUsersView.vue
```

`<router-view/>` 是"当前路由对应组件渲染在这"的占位符，类似模板引擎的 `{{block "content"}}`。

路由文件里的**导航守卫**，等价于后端 middleware：

```js
router.beforeEach(async (to) => {
  const user = await loadUser()
  if (!user) return { path: '/login' }   // 未登录 → 重定向，和服务端 302 一个意思
  ...
})
```

## 5. 数据层：services/ = API client 封装

调接口统一收口在 `web/src/services/`，和 Go 里把 HTTP client 封装成 package 一个思路：

```
services/api.js            axios 实例：baseURL=/api，响应拦截器（统一解包 data、401 跳登录、错误转 Error）
services/authService.js    login/logout/me
services/projectService.js list/upload/createPackage...
services/userService.js    用户 CRUD
```

组件里永远不直接写 `axios.get(...)`，而是：

```js
import { projectService } from '@/services/projectService'   // @ = src/ 别名（vite.config.js 配置）
projects.value = await projectService.list()
```

好处：接口路径、鉴权、错误处理只写一遍。axios 拦截器（`api.js`）≈ 后端中间件的客户端版。

## 6. 组件库 Element Plus

`<el-button>`、`<el-table>`、`<el-tree>` 不是 HTML 标签，是 Element Plus 的现成组件。`main.js` 里 `app.use(ElementPlus)` 全局注册后随处可用。加功能基本是"查文档 → 抄组件 → 绑数据"：

- 表格数据 → `el-table` 的 `:data`
- 表单 → `el-form` + `el-input`
- 弹窗 → `el-dialog`（`v-model="visible"` 控制显隐）
- 轻提示 → `ElMessage.success(...)`（函数式调用，不用写标签）

## 7. 状态管理：本项目故意从简

跨组件共享的数据只有"当前登录用户"。没有用 Vuex/Pinia（前端界的"全局状态框架"），就是 `store/auth.js` 里一个 `reactive` 对象：

```js
export const authState = reactive({ user: null })
// 任何组件 import 后读写 authState.user，改动全局响应式生效
```

项目小这么搞最划算；状态多了再考虑 Pinia。

## 8. 一次完整请求的生命周期（以"项目列表"为例）

1. 浏览器打开 `/` → 拿到 index.html + JS → Vue 启动
2. 路由守卫跑 `loadUser()` → `GET /api/auth/me` → 已登录，放行
3. `ProjectsView.vue` 挂载，`onMounted(loadList)`（页面初始化钩子）
4. `loadList()` → `projectService.list()` → `GET /api/projects`
5. axios 拦截器解包 JSON → 赋值 `projects.value = ...`
6. Vue 检测到 `projects` 变了 → 自动重绘 `el-table`

## 9. 动手任务速查

| 我想... | 动哪里 |
|---|---|
| 加一个新页面 | 新建 `views/XxxView.vue` → `router/index.js` 加路由 → App.vue 导航加链接 |
| 调一个新后端接口 | 对应 service 文件里加一个方法 |
| 后端加接口 | `server/src/routes/` 加路由，`index.js` 里 `app.route()` 注册 |
| 改全局样式/导航 | `App.vue` |
| 表格加一列 | 对应 view 里的 `el-table`，加一个 `el-table-column` |

## 10. 上手路径建议

1. 先通读 `LoginView.vue`（最小完整页面：表单 + 调接口 + 跳转）
2. 再读 `ProjectsView.vue`（列表 + 对话框 + 文件上传）
3. 最后啃 `ProjectDetailView.vue`（最复杂：三栏布局 + el-tree + canvas 缩放高亮）
4. 改个小东西练手：比如给项目列表加一列，跑 `bun run dev` 看热更新效果
