import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export const DATA_DIR = join(import.meta.dir, '..', '..', 'data')
export const PACKAGES_DIR = join(DATA_DIR, 'packages')

mkdirSync(PACKAGES_DIR, { recursive: true })

export const db = new Database(join(DATA_DIR, 'fgx.db'), { create: true })

db.run('PRAGMA journal_mode = WAL')

db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`)

db.run(`CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
)`)

db.run(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  layer_count INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  has_package INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`)
