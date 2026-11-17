// src/cutout.js — 贴纸自动抠图：从四条边往里灌，把和四个角颜色接近的底色抠成透明，再垫一圈白边
// 适合纯色底（白底、灰底、绿幕）的图；底色太杂抠不掉多少时会抛错，交给调用的人决定要不要用原图
export async function cutout(src, { tol = 46, border = 7, max = 640 } = {}) {
  const im = await new Promise((ok, no) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => no(new Error('图打不开')); i.src = src })
  const s = Math.min(1, max / Math.max(im.width, im.height)), w = Math.round(im.width * s), h = Math.round(im.height * s)
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d'); g.drawImage(im, 0, 0, w, h)
  const d = g.getImageData(0, 0, w, h), px = d.data
  const at = (x, y) => (y * w + x) * 4
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(([x, y]) => px.slice(at(x, y), at(x, y) + 3))
  const bg = [0, 1, 2].map(i => corners.reduce((a, c2) => a + c2[i], 0) / 4)
  const near = i => Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) < tol * 3 * 0.75
  const seen = new Uint8Array(w * h), q = []
  for (let x = 0; x < w; x++) q.push(x, 0, x, h - 1)
  for (let y = 0; y < h; y++) q.push(0, y, w - 1, y)
  let gone = 0
  while (q.length) {
    const y = q.pop(), x = q.pop(), k = y * w + x
    if (x < 0 || y < 0 || x >= w || y >= h || seen[k]) continue
    seen[k] = 1
    if (!near(k * 4)) continue
    px[k * 4 + 3] = 0; gone++
    q.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1)
  }
  if (gone < w * h * 0.04) throw new Error('这张图的底色不够干净，抠不出来（换一张纯色底的试试）')
  g.putImageData(d, 0, 0)
  // 白边：把抠好的形状往一圈方向错开画成白色，垫在底下
  const pad = border + 2, o = document.createElement('canvas'); o.width = w + pad * 2; o.height = h + pad * 2
  const og = o.getContext('2d'), sil = document.createElement('canvas'); sil.width = w; sil.height = h
  const sg = sil.getContext('2d'); sg.drawImage(c, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#ffffff'; sg.fillRect(0, 0, w, h)
  for (let a = 0; a < 16; a++) og.drawImage(sil, pad + Math.cos(a / 16 * Math.PI * 2) * border, pad + Math.sin(a / 16 * Math.PI * 2) * border)
  og.drawImage(c, pad, pad)
  return o.toDataURL('image/png')
}
// 把选的文件缩小成 data URL（贴纸用 png 保留透明）
export function shrink(file, max = 640, type = 'image/png') {
  return new Promise((res, rej) => {
    const im = new Image(), url = URL.createObjectURL(file)
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k))
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url)
      res(c.toDataURL(type, 0.88))
    }
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('这张图打不开')) }
    im.src = url
  })
}