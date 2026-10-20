import { Hono } from 'hono'
import { mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { db, PACKAGES_DIR } from '../db.js'
import { storage, projectKey, readStorageJson } from '../storage.js'

export const projectRoutes = new Hono()

const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

const ID_RE = /^[a-f0-9-]{36}$/

function validId(id) {
  return ID_RE.test(id)
}

function countLayers(layers) {
  let n = 0
  for (const l of layers || []) {
    n += 1
    if (l.children) n += countLayers(l.children)
  }
  return n
}

function sanitizeName(name) {
  return String(name || 'layer')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .slice(0, 80)
}

const toDto = (row) => ({
  id: row.id,
  name: row.name,
  width: row.width,
  height: row.height,
  layerCount: row.layer_count,
  sizeBytes: row.size_bytes,
  hasPackage: !!row.has_package,
  owner: row.owner_name,
  createdAt: row.created_at,
})

// 项目列表（团队共享，所有登录用户可见）
projectRoutes.get('/', (c) => {
  const rows = db
    .query(
      `SELECT p.*, u.username AS owner_name FROM projects p
       JOIN users u ON u.id = p.owner_id ORDER BY p.created_at DESC`
    )
    .all()
  return c.json(rows.map(toDto))
})

// 上传：multipart（file=PSD, design=JSON 字符串, composite=PNG blob, name=显示名）
projectRoutes.post('/upload', async (c) => {
  const user = c.get('user')
  const body = await c.req.parseBody()

  const file = body.file
  if (!(file instanceof File)) return c.json({ error: '缺少 PSD 文件' }, 400)
  if (file.size > MAX_FILE_SIZE) return c.json({ error: '文件超过 500MB 限制' }, 400)

  let design
  try {
    design = JSON.parse(String(body.design || ''))
  } catch {
    return c.json({ error: 'design.json 格式错误' }, 400)
  }
  if (!design?.meta || !Array.isArray(design.layers)) {
    return c.json({ error: 'design.json 缺少 meta/layers' }, 400)
  }

  const id = crypto.randomUUID()
  const name = String(body.name || design.meta.name || file.name || '未命名').slice(0, 200)

  await storage.put(projectKey(id, 'original.psd'), file)
  await storage.put(projectKey(id, 'design.json'), JSON.stringify(design))
  if (body.composite instanceof File) {
    await storage.put(projectKey(id, 'composite.png'), body.composite)
  }

  db.run(
    `INSERT INTO projects (id, owner_id, name, width, height, layer_count, size_bytes, has_package, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [id, user.id, name, design.meta.width ?? null, design.meta.height ?? null, countLayers(design.layers), file.size, Date.now()]
  )

  const row = db
    .query('SELECT p.*, u.username AS owner_name FROM projects p JOIN users u ON u.id = p.owner_id WHERE p.id = ?')
    .get(id)
  return c.json(toDto(row), 201)
})

// 项目详情
projectRoutes.get('/:id', (c) => {
  const id = c.req.param('id')
  if (!validId(id)) return c.json({ error: 'id 非法' }, 400)
  const row = db
    .query('SELECT p.*, u.username AS owner_name FROM projects p JOIN users u ON u.id = p.owner_id WHERE p.id = ?')
    .get(id)
  if (!row) return c.json({ error: '项目不存在' }, 404)
  return c.json(toDto(row))
})

async function serveStored(c, key, contentType, downloadName) {
  const f = await storage.get(key)
  if (!f) return c.json({ error: '文件不存在' }, 404)
  const headers = { 'Content-Type': contentType }
  if (downloadName) headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`
  return new Response(f.stream(), { headers })
}

projectRoutes.get('/:id/design.json', (c) => {
  const id = c.req.param('id')
  if (!validId(id)) return c.json({ error: 'id 非法' }, 400)
  return serveStored(c, projectKey(id, 'design.json'), 'application/json; charset=utf-8')
})

projectRoutes.get('/:id/original', (c) => {
  const id = c.req.param('id')
  if (!validId(id)) return c.json({ error: 'id 非法' }, 400)
  return serveStored(c, projectKey(id, 'original.psd'), 'application/octet-stream')
})

projectRoutes.get('/:id/composite', (c) => {
  const id = c.req.param('id')
  if (!validId(id)) return c.json({ error: 'id 非法' }, 400)
  return serveStored(c, projectKey(id, 'composite.png'), 'image/png')
})

// 删除（仅上传者或管理员）
projectRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  if (!validId(id)) return c.json({ error: 'id 非法' }, 400)
  const user = c.get('user')
  const row = db.query('SELECT * FROM projects WHERE id = ?').get(id)
  if (!row) return c.json({ error: '项目不存在' }, 404)
  if (row.owner_id !== user.id && !user.isAdmin) return c.json({ error: '只能删除自己的项目' }, 403)

  await storage.removePrefix(`projects/${id}`)
  rmSync(join(PACKAGES_DIR, id), { recursive: true, force: true })
  db.run('DELETE FROM projects WHERE id = ?', [id])
  return c.json({ ok: true })
})

// ---- Claude 任务包 ----

const STACK_LABELS = {
  vant: 'Vue3 + Vant（移动端 H5）',
  element: 'Vue3 + Element Plus（PC 端）',
}

function buildPromptMd({ name, target, width, height, assetNames }) {
  const stack = STACK_LABELS[target] || STACK_LABELS.vant
  const assetList = assetNames.length ? assetNames.map((n) => `- assets/${n}`).join('\n') : '- （本次未包含切图）'
  return `# 设计稿还原任务：${name}

## 目标

把本目录中的设计稿还原成一个 **${stack}** 页面，最终视觉效果与 composite.png 一致。

## 文件说明

- \`design.json\`：设计稿结构化描述
  - \`meta.width / meta.height\`：画布尺寸 ${width}×${height}（px）
  - \`layers[]\`：图层树，每层字段：
    - \`id\`：路径序号（如 "0/2/1"），稳定可引用
    - \`name\`：图层名（美术命名，常含语义，如 "banner/标题/按钮"）
    - \`type\`：\`group\`（分组）/ \`text\`（文本层）/ \`layer\`（图像层）
    - \`visible\`：是否可见（隐藏的层不需要还原）
    - \`rect\`：\`{ x, y, w, h }\`，相对画布左上角的绝对像素坐标
    - \`text\`：文本层专有，\`{ content, font, size, color }\`，字段可能为 null（未提取到）
- \`composite.png\`：整稿合成预览图，先看它建立整体印象
- \`assets/\`：切图 PNG（本次勾选的图层）：
${assetList}

## 要求

1. 先通读 design.json 并查看 composite.png，理解页面结构（从上到下分哪些区块）
2. 不可见（visible=false）的图层直接忽略
3. 图层 rect 是绝对坐标，不要照搬绝对定位；按语义还原为正常文档流 + flex 布局，用 rect 计算各元素的比例/间距关系
4. 文本层的 content / size / color / font 尽量精确还原
5. 图像层优先使用 assets/ 里对应的切图；缺切图的简单图形（纯色块、圆角、渐变）直接用 CSS 实现
6. 移动端页面以 meta.width 为设计稿宽度，使用 rem/vw 做等比适配
7. 输出完整可运行的页面代码（单文件组件即可）
`
}

// 生成任务包：multipart（target=vant|element, slices=多个 PNG 文件）
projectRoutes.post('/:id/package', async (c) => {
  const id = c.req.param('id')
  if (!validId(id)) return c.json({ error: 'id 非法' }, 400)
  const row = db.query('SELECT * FROM projects WHERE id = ?').get(id)
  if (!row) return c.json({ error: '项目不存在' }, 404)

  const body = await c.req.parseBody({ all: true })
  const target = body.target === 'element' ? 'element' : 'vant'

  const design = await readStorageJson(projectKey(id, 'design.json'))
  if (!design) return c.json({ error: 'design.json 缺失' }, 500)

  const dir = join(PACKAGES_DIR, id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'assets'), { recursive: true })

  // design.json 与 composite.png 从存储拷入包内
  await Bun.write(join(dir, 'design.json'), JSON.stringify(design, null, 2))
  const composite = await storage.get(projectKey(id, 'composite.png'))
  if (composite) await Bun.write(join(dir, 'composite.png'), composite)

  // 切片落盘
  const assetNames = []
  const sliceFiles = []
  for (const key of Object.keys(body)) {
    const v = body[key]
    if (v instanceof File) sliceFiles.push(v)
    else if (Array.isArray(v)) sliceFiles.push(...v.filter((x) => x instanceof File))
  }
  const used = new Set()
  for (const f of sliceFiles) {
    let base = sanitizeName(f.name.replace(/\.png$/i, ''))
    let fname = `${base}.png`
    let n = 1
    while (used.has(fname)) fname = `${base}_${n++}.png`
    used.add(fname)
    await Bun.write(join(dir, 'assets', fname), f)
    assetNames.push(fname)
  }

  const promptMd = buildPromptMd({
    name: row.name,
    target,
    width: design.meta.width,
    height: design.meta.height,
    assetNames,
  })
  await Bun.write(join(dir, 'PROMPT.md'), promptMd)

  db.run('UPDATE projects SET has_package = 1 WHERE id = ?', [id])

  const prompt = `请阅读 ${join(dir, 'PROMPT.md')} 并按照其中的要求还原设计稿。`
  return c.json({ path: dir, prompt })
})

// 任务包 zip 下载（跨机器场景：在跑 Claude Code 的机器上解压即用，包内均为相对路径）
projectRoutes.get('/:id/package.zip', (c) => {
  const id = c.req.param('id')
  if (!validId(id)) return c.json({ error: 'id 非法' }, 400)
  const row = db.query('SELECT * FROM projects WHERE id = ?').get(id)
  if (!row) return c.json({ error: '项目不存在' }, 404)
  const dir = join(PACKAGES_DIR, id)
  if (!existsSync(join(dir, 'PROMPT.md'))) return c.json({ error: '任务包不存在，请先生成' }, 404)

  const proc = Bun.spawn(['zip', '-r', '-q', '-', '.'], { cwd: dir, stdout: 'pipe' })
  const filename = `${row.name.replace(/[\\/:*?"<>|\s]+/g, '_')}-package.zip`
  return new Response(proc.stdout, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
})

// 任务包信息
projectRoutes.get('/:id/package', (c) => {
  const id = c.req.param('id')
  if (!validId(id)) return c.json({ error: 'id 非法' }, 400)
  const dir = join(PACKAGES_DIR, id)
  if (!existsSync(join(dir, 'PROMPT.md'))) return c.json({ exists: false })
  const assets = existsSync(join(dir, 'assets')) ? readdirSync(join(dir, 'assets')) : []
  return c.json({
    exists: true,
    path: dir,
    assets,
    prompt: `请阅读 ${join(dir, 'PROMPT.md')} 并按照其中的要求还原设计稿。`,
  })
})
