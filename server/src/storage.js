// 文件存储抽象：优先 MinIO/S3（配置了 S3_ENDPOINT 时），否则本地磁盘兜底。
// 注意：Claude 任务包（package/）始终写本地磁盘，不参与本抽象——它是给本机 Claude Code 读的。
import { S3Client } from 'bun'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { DATA_DIR } from './db.js'

const DISK_ROOT = join(DATA_DIR, 'files')

function makeDiskStorage() {
  mkdirSync(DISK_ROOT, { recursive: true })
  const toPath = (key) => join(DISK_ROOT, key)
  return {
    kind: 'disk',
    async put(key, data) {
      const p = toPath(key)
      mkdirSync(dirname(p), { recursive: true })
      await Bun.write(p, data)
    },
    async get(key) {
      const f = Bun.file(toPath(key))
      if (!(await f.exists())) return null
      return f
    },
    async removePrefix(prefix) {
      rmSync(toPath(prefix), { recursive: true, force: true })
    },
  }
}

function makeS3Storage() {
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    bucket: process.env.S3_BUCKET || 'fgx',
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
  })
  return {
    kind: `s3(${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET || 'fgx'})`,
    async put(key, data) {
      await client.file(key).write(data)
    },
    async get(key) {
      const f = client.file(key)
      if (!(await f.exists())) return null
      return f
    },
    async removePrefix(prefix) {
      // Bun S3 暂无列举接口，逐个删除已知 key
      for (const name of ['original.psd', 'design.json', 'composite.png']) {
        try {
          await client.file(`${prefix}/${name}`).delete()
        } catch {
          // 对象不存在时忽略
        }
      }
    },
  }
}

export const storage = process.env.S3_ENDPOINT ? makeS3Storage() : makeDiskStorage()

export function projectKey(id, name) {
  return `projects/${id}/${name}`
}

export async function readStorageText(key) {
  const f = await storage.get(key)
  return f ? f.text() : null
}

export async function readStorageJson(key) {
  const t = await readStorageText(key)
  return t ? JSON.parse(t) : null
}
