import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { db } from './db.js'

export const SESSION_COOKIE = 'fgx_sid'
const SESSION_TTL = 7 * 24 * 3600 * 1000

function createSession(userId) {
  const id = crypto.randomUUID()
  const now = Date.now()
  db.run('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)', [
    id,
    userId,
    now + SESSION_TTL,
    now,
  ])
  return id
}

function getSessionUser(sid) {
  if (!sid) return null
  const row = db
    .query(
      `SELECT u.id, u.username, u.is_admin, u.disabled, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`
    )
    .get(sid)
  if (!row || row.disabled || row.expires_at < Date.now()) return null
  return { id: row.id, username: row.username, isAdmin: !!row.is_admin }
}

// 登录失败限流：同一 IP 5 次 / 5 分钟
const attempts = new Map()

function clientIp(c) {
  return c.req.header('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
}

function throttled(ip) {
  const rec = attempts.get(ip)
  return !!rec && rec.resetAt > Date.now() && rec.count >= 5
}

function recordFail(ip) {
  const now = Date.now()
  const rec = attempts.get(ip)
  if (!rec || rec.resetAt <= now) attempts.set(ip, { count: 1, resetAt: now + 5 * 60 * 1000 })
  else rec.count++
}

export async function requireAuth(c, next) {
  const user = getSessionUser(getCookie(c)[SESSION_COOKIE])
  if (!user) return c.json({ error: '未登录或会话已过期' }, 401)
  c.set('user', user)
  await next()
}

export async function requireAdmin(c, next) {
  if (!c.get('user')?.isAdmin) return c.json({ error: '需要管理员权限' }, 403)
  await next()
}

export const authRoutes = new Hono()

authRoutes.post('/login', async (c) => {
  const ip = clientIp(c)
  if (throttled(ip)) return c.json({ error: '失败次数过多，请 5 分钟后再试' }, 429)

  const { username, password } = await c.req.json().catch(() => ({}))
  if (!username || !password) return c.json({ error: '用户名和密码不能为空' }, 400)

  const row = db.query('SELECT * FROM users WHERE username = ?').get(username)
  const ok = row && !row.disabled && (await Bun.password.verify(password, row.pass_hash))
  if (!ok) {
    recordFail(ip)
    return c.json({ error: '用户名或密码错误' }, 401)
  }

  const sid = createSession(row.id)
  setCookie(c, SESSION_COOKIE, sid, {
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: SESSION_TTL / 1000,
    path: '/',
  })
  return c.json({ id: row.id, username: row.username, isAdmin: !!row.is_admin })
})

authRoutes.post('/logout', (c) => {
  const sid = getCookie(c)[SESSION_COOKIE]
  if (sid) db.run('DELETE FROM sessions WHERE id = ?', [sid])
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

authRoutes.get('/me', requireAuth, (c) => c.json(c.get('user')))
