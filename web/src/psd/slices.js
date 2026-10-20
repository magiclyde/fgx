import JSZip from 'jszip'

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob 失败'))), 'image/png')
  )
}

export function sanitizeName(name) {
  return String(name || 'layer')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .slice(0, 80)
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// selected: [{ id, name, canvas }]
export async function buildSlicesZip(selected) {
  const zip = new JSZip()
  const used = new Set()
  for (const s of selected) {
    const base = sanitizeName(s.name)
    let fname = `${base}.png`
    let n = 1
    while (used.has(fname)) fname = `${base}_${n++}.png`
    used.add(fname)
    zip.file(fname, await canvasToBlob(s.canvas))
  }
  return zip.generateAsync({ type: 'blob' })
}
