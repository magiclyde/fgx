import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/bun'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import './db.js'
import { storage } from './storage.js'
import { authRoutes, requireAuth, requireAdmin } from './auth.js'
import { userRoutes } from './routes/users.js'
import { projectRoutes } from './routes/projects.js'

const app = new Hono()

app.onError((err, c) => {
  console.error(err)
  if (err?.message?.includes('Body exceeds')) return c.json({ error: '请求体过大' }, 413)
  return c.json({ error: '服务器内部错误' }, 500)
})

app.use('/api/*', logger())

app.get('/api/health', (c) => c.json({ ok: true, storage: storage.kind }))

app.route('/api/auth', authRoutes)

app.use('/api/projects', requireAuth)
app.use('/api/projects/*', requireAuth)
app.route('/api/projects', projectRoutes)

app.use('/api/users', requireAuth, requireAdmin)
app.use('/api/users/*', requireAuth, requireAdmin)
app.route('/api/users', userRoutes)

// 生产模式：托管 web/dist（SPA 回退到 index.html）
const dist = join(import.meta.dir, '..', '..', 'web', 'dist')
if (existsSync(dist)) {
  app.use('/*', async (c, next) => {
    if (c.req.path.startsWith('/api/')) return next()
    return serveStatic({ root: dist })(c, next)
  })
  app.get('*', (c) => {
    if (c.req.path.startsWith('/api/')) return c.json({ error: '接口不存在' }, 404)
    return new Response(Bun.file(join(dist, 'index.html')), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  })
}

const port = Number(process.env.PORT || 3100)
console.log(`fgx server listening on http://localhost:${port} (storage: ${storage.kind})`)

export default {
  port,
  maxRequestBodySize: 600 * 1024 * 1024,
  fetch: app.fetch,
}
