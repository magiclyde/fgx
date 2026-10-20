import { Hono } from 'hono'
import { db } from '../db.js'

export const userRoutes = new Hono()

const toDto = (row) => ({
  id: row.id,
  username: row.username,
  isAdmin: !!row.is_admin,
  disabled: !!row.disabled,
  createdAt: row.created_at,
})

// 用户列表
userRoutes.get('/', (c) => {
  const rows = db.query('SELECT * FROM users ORDER BY id').all()
  return c.json(rows.map(toDto))
})

// 创建用户
userRoutes.post('/', async (c) => {
  const { username, password, isAdmin } = await c.req.json().catch(() => ({}))
  if (!username || typeof username !== 'string' || username.length > 64) {
    return c.json({ error: '用户名不能为空且不超过 64 字符' }, 400)
  }
  if (!password || password.length < 6) return c.json({ error: '密码至少 6 位' }, 400)

  const hash = await Bun.password.hash(password, { algorithm: 'bcrypt', cost: 10 })
  try {
    const res = db.run('INSERT INTO users (username, pass_hash, is_admin, disabled, created_at) VALUES (?, ?, ?, 0, ?)', [
      username.trim(),
      hash,
      isAdmin ? 1 : 0,
      Date.now(),
    ])
    const row = db.query('SELECT * FROM users WHERE id = ?').get(res.lastInsertRowid)
    return c.json(toDto(row), 201)
  } catch {
    return c.json({ error: '用户名已存在' }, 409)
  }
})

// 更新用户：禁用/启用、重置密码、调整管理员
userRoutes.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const me = c.get('user')
  const row = db.query('SELECT * FROM users WHERE id = ?').get(id)
  if (!row) return c.json({ error: '用户不存在' }, 404)

  const body = await c.req.json().catch(() => ({}))

  if (id === me.id && (body.disabled === true || body.isAdmin === false)) {
    return c.json({ error: '不能禁用自己或取消自己的管理员权限' }, 400)
  }

  if (typeof body.disabled === 'boolean') {
    db.run('UPDATE users SET disabled = ? WHERE id = ?', [body.disabled ? 1 : 0, id])
    if (body.disabled) db.run('DELETE FROM sessions WHERE user_id = ?', [id])
  }
  if (typeof body.isAdmin === 'boolean') {
    db.run('UPDATE users SET is_admin = ? WHERE id = ?', [body.isAdmin ? 1 : 0, id])
  }
  if (body.password !== undefined) {
    if (typeof body.password !== 'string' || body.password.length < 6) {
      return c.json({ error: '密码至少 6 位' }, 400)
    }
    const hash = await Bun.password.hash(body.password, { algorithm: 'bcrypt', cost: 10 })
    db.run('UPDATE users SET pass_hash = ? WHERE id = ?', [hash, id])
    db.run('DELETE FROM sessions WHERE user_id = ?', [id])
  }

  return c.json(toDto(db.query('SELECT * FROM users WHERE id = ?').get(id)))
})
