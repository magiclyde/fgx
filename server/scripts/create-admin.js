import { db } from '../src/db.js'

const [username, password] = process.argv.slice(2)

if (!username || !password) {
  console.error('用法: bun run create-admin <用户名> <密码>')
  process.exit(1)
}
if (password.length < 6) {
  console.error('密码至少 6 位')
  process.exit(1)
}

const hash = await Bun.password.hash(password, { algorithm: 'bcrypt', cost: 10 })

const existing = db.query('SELECT id FROM users WHERE username = ?').get(username)
if (existing) {
  db.run('UPDATE users SET pass_hash = ?, is_admin = 1, disabled = 0 WHERE id = ?', [hash, existing.id])
  console.log(`用户 ${username} 已存在，已重置密码并设为管理员`)
} else {
  db.run('INSERT INTO users (username, pass_hash, is_admin, disabled, created_at) VALUES (?, ?, 1, 0, ?)', [
    username,
    hash,
    Date.now(),
  ])
  console.log(`管理员 ${username} 创建成功`)
}
