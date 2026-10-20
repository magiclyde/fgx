// ag-psd → 规范化 design.json
import { readPsd } from 'ag-psd'

export const MAX_PSD_SIZE = 500 * 1024 * 1024 // 500MB

function toHex(color) {
  if (!color) return null
  let { r, g, b } = color
  if (r == null || g == null || b == null) return null
  if (r <= 1 && g <= 1 && b <= 1) {
    r *= 255
    g *= 255
    b *= 255
  }
  const h = (v) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function num(v) {
  if (v == null) return null
  if (typeof v === 'number') return v
  if (typeof v === 'object' && 'value' in v) return v.value
  return null
}

function extractText(text) {
  if (!text) return null
  const style = text.style || {}
  let font = style.font
  if (font && typeof font === 'object') font = font.name || font.postScriptName || null
  return {
    content: text.text ?? null,
    font: font || null,
    size: num(style.fontSize),
    color: toHex(style.fillColor),
    bold: style.fauxBold ?? null,
    italic: style.fauxItalic ?? null,
  }
}

function normalizeLayer(layer, path) {
  const isGroup = Array.isArray(layer.children)
  const left = layer.left ?? 0
  const top = layer.top ?? 0
  const node = {
    id: path,
    name: layer.name || '(未命名)',
    type: isGroup ? 'group' : layer.text ? 'text' : 'layer',
    visible: !layer.hidden,
    rect: {
      x: left,
      y: top,
      w: (layer.right ?? left) - left,
      h: (layer.bottom ?? top) - top,
    },
  }
  if (isGroup) {
    node.children = layer.children.map((c, i) => normalizeLayer(c, `${path}/${i}`))
  } else {
    node.text = extractText(layer.text)
    node.hasImage = !!layer.canvas
  }
  return node
}

// 解析 PSD：返回 { design, psd }。design 可序列化；psd 为 ag-psd 原始对象（含 canvas，用于切图/预览）
export function parsePsd(buffer, fileName) {
  let psd
  try {
    psd = readPsd(buffer, { skipThumbnail: true })
  } catch (err) {
    console.error('readPsd failed:', err)
    throw new Error('无法解析该文件：请确认是 RGB 模式的 .psd（不支持 PSB 大型文档格式）')
  }
  if (!psd || !Array.isArray(psd.children)) {
    throw new Error('解析结果异常：未读到图层')
  }
  const layers = psd.children.map((c, i) => normalizeLayer(c, String(i)))
  const design = {
    meta: {
      name: fileName,
      width: psd.width ?? null,
      height: psd.height ?? null,
      parsedAt: new Date().toISOString(),
      generator: 'ag-psd',
    },
    layers,
  }
  return { design, psd }
}

export function countLayers(layers) {
  let n = 0
  for (const l of layers || []) {
    n += 1
    if (l.children) n += countLayers(l.children)
  }
  return n
}

// 收集图层 id → canvas（仅含图像的非分组层），用于切图
export function collectCanvases(psd) {
  const map = new Map()
  const walk = (children, path) =>
    children.forEach((l, i) => {
      const id = path ? `${path}/${i}` : String(i)
      if (Array.isArray(l.children)) walk(l.children, id)
      else if (l.canvas) map.set(id, l.canvas)
    })
  walk(psd.children, '')
  return map
}
