// src/screens.js — 内屏 / 外屏（画在 canvas 上，再当贴图贴到 3D 上）
// 老手机那种：浅色底、像素感的顶栏、一次一条，下面两个软键提示
const W = 240, H = 320
const OW = 200, OH = 150
const FONT = '"PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif'
// 屏幕上的字都能换，传 labels 覆盖
export const LABELS = {
  inbox: '收件箱', outbox: '发件箱', emptyIn: '没有新消息', emptyOut: '发件箱是空的',
  open: '打开', close: '合上', latest: '最新',
}
export function hm(t) {
  if (!t) return ''
  const d = new Date(t), now = new Date()
  const p = n => String(n).padStart(2, '0')
  const same = d.toDateString() === now.toDateString()
  return (same ? '' : (d.getMonth() + 1) + '/' + d.getDate() + ' ') + p(d.getHours()) + ':' + p(d.getMinutes())
}
// 按宽度折行（中文一个字一个字量）
export function wrap(g, text, maxW, maxLines) {
  const out = []; let line = ''
  for (const ch of String(text || '')) {
    if (ch === '\n') { out.push(line); line = ''; continue }
    if (g.measureText(line + ch).width > maxW && line) { out.push(line); line = ch } else line += ch
    if (out.length >= maxLines) break
  }
  if (line && out.length < maxLines) out.push(line)
  if (out.length === maxLines && (out.join('').length < String(text || '').replace(/\n/g, '').length)) out[maxLines - 1] = out[maxLines - 1].slice(0, -1) + '…'
  return out
}
const PAL = {
  light: { bg: '#eef2e6', bar: '#cfd9c0', ink: '#2c3328', sub: '#66705e', acc: '#3d6b52', warn: '#9a5a3c', line: '#b8c4aa' },
  ink: { bg: '#1d2a2a', bar: '#2c3d3c', ink: '#d9f0e4', sub: '#8fb3a5', acc: '#8fe0b8', warn: '#f0b48f', line: '#3d5552' },
}
// 内屏：s = { tab: 'in'|'out', idx, items, unread, msg }
// 每条 item：{ title 正文, tag 左上小字（类别）, time 时间戳, unread 未读红点, status 下面一行状态, statusTone 'ok'|'warn', note 状态下面的引文 }
export function drawInner(cv, s, dark, labels) {
  const L = { ...LABELS, ...(labels || {}) }
  cv.width = W; cv.height = H
  const g = cv.getContext('2d'), c = dark ? PAL.ink : PAL.light
  g.fillStyle = c.bg; g.fillRect(0, 0, W, H)
  // 顶栏：信号、哪个箱、电池
  g.fillStyle = c.bar; g.fillRect(0, 0, W, 26)
  g.fillStyle = c.ink
  for (let i = 0; i < 4; i++) g.fillRect(8 + i * 5, 18 - i * 3, 3, 4 + i * 3)
  g.strokeStyle = c.ink; g.lineWidth = 1.5; g.strokeRect(W - 30, 8, 20, 10); g.fillRect(W - 10, 11, 2, 4); g.fillRect(W - 28, 10, 13, 6)
  g.font = '600 13px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'
  const items = s.items || [], n = items.length, i = Math.max(0, Math.min(n - 1, s.idx || 0))
  g.fillText((s.tab === 'out' ? L.outbox : L.inbox) + (n ? '  ' + (i + 1) + '/' + n : ''), W / 2, 13)
  // 两个箱的小标签
  g.font = '12px ' + FONT
  const tabs = [['in', L.inbox + (s.unread ? ' ' + s.unread : '')], ['out', L.outbox]]
  tabs.forEach(([k, t], j) => {
    const x = 8 + j * 116, on = s.tab === k
    g.fillStyle = on ? c.acc : 'transparent'; g.fillRect(x, 32, 108, 22)
    g.strokeStyle = c.line; g.lineWidth = 1; g.strokeRect(x + 0.5, 32.5, 107, 21)
    g.fillStyle = on ? c.bg : c.sub; g.fillText(t, x + 54, 43)
  })
  g.textAlign = 'left'; g.textBaseline = 'alphabetic'
  const it = items[i]
  if (!it) {
    g.fillStyle = c.sub; g.font = '14px ' + FONT; g.textAlign = 'center'
    g.fillText(s.tab === 'out' ? L.emptyOut : L.emptyIn, W / 2, 150)
  } else {
    // 信封 + 类别 + 时间
    const ey = 70
    g.strokeStyle = c.ink; g.lineWidth = 1.6
    g.strokeRect(10, ey, 22, 15); g.beginPath(); g.moveTo(10, ey); g.lineTo(21, ey + 8); g.lineTo(32, ey); g.stroke()
    if (it.unread) { g.fillStyle = c.warn; g.beginPath(); g.arc(33, ey, 4, 0, Math.PI * 2); g.fill() }
    g.fillStyle = c.sub; g.font = '12px ' + FONT
    g.fillText([it.tag, hm(it.time)].filter(Boolean).join('  '), 40, ey + 12)
    g.fillStyle = c.line; g.fillRect(10, 92, W - 20, 1)
    // 正文
    g.fillStyle = c.ink; g.font = '15px ' + FONT
    const lines = wrap(g, it.title, W - 24, it.status || it.note ? 4 : 7)
    lines.forEach((l, k) => g.fillText(l, 12, 116 + k * 22))
    // 状态 + 引文（比如「对方回了」+ 回的那句话）
    if (it.status || it.note) {
      const y0 = 116 + lines.length * 22 + 10
      g.fillStyle = c.line; g.fillRect(10, y0 - 12, W - 20, 1)
      g.font = '600 13px ' + FONT
      g.fillStyle = it.statusTone === 'ok' ? c.acc : it.statusTone === 'warn' ? c.warn : c.sub
      if (it.status) g.fillText(it.status, 12, y0 + 6)
      if (it.note) {
        g.fillStyle = c.ink; g.font = '14px ' + FONT
        wrap(g, '「' + it.note + '」', W - 24, 3).forEach((l, k) => g.fillText(l, 12, y0 + (it.status ? 28 : 6) + k * 20))
      }
    }
  }
  // 底栏：软键
  g.fillStyle = c.bar; g.fillRect(0, H - 26, W, 26)
  g.fillStyle = c.ink; g.font = '600 12px ' + FONT; g.textBaseline = 'middle'
  g.textAlign = 'left'; g.fillText(s.tab === 'out' ? L.inbox : L.outbox, 8, H - 13)
  g.textAlign = 'center'; g.fillText(it ? L.open : '', W / 2, H - 13)
  g.textAlign = 'right'; g.fillText(L.close, W - 8, H - 13)
  if (s.msg) {
    g.fillStyle = 'rgba(0,0,0,.72)'; g.fillRect(16, H - 70, W - 32, 34)
    g.fillStyle = '#fff'; g.font = '13px ' + FONT; g.textAlign = 'center'; g.fillText(s.msg, W / 2, H - 53)
  }
  return cv
}
// 外屏：照片铺满，左上小信封 + 几条没看，右下最新一条的时间
export function drawOuter(cv, s, img, labels) {
  const L = { ...LABELS, ...(labels || {}) }
  cv.width = OW; cv.height = OH
  const g = cv.getContext('2d')
  g.fillStyle = '#20262b'; g.fillRect(0, 0, OW, OH)
  if (img && img.width) {
    const k = Math.max(OW / img.width, OH / img.height), w = img.width * k, h = img.height * k
    g.drawImage(img, (OW - w) / 2, (OH - h) / 2, w, h)
  } else {
    const gr = g.createLinearGradient(0, 0, 0, OH); gr.addColorStop(0, '#3a4a58'); gr.addColorStop(1, '#1d242b'); g.fillStyle = gr; g.fillRect(0, 0, OW, OH)
  }
  // 上下压一点暗，字看得清
  const sh = g.createLinearGradient(0, 0, 0, OH); sh.addColorStop(0, 'rgba(0,0,0,.45)'); sh.addColorStop(0.35, 'rgba(0,0,0,0)'); sh.addColorStop(0.7, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.5)')
  g.fillStyle = sh; g.fillRect(0, 0, OW, OH)
  g.fillStyle = '#fff'; g.font = '600 15px ' + FONT; g.textBaseline = 'middle'
  const now = new Date(), p = x => String(x).padStart(2, '0')
  g.textAlign = 'right'; g.fillText(p(now.getHours()) + ':' + p(now.getMinutes()), OW - 8, 16)
  if (s.unread > 0) {
    g.strokeStyle = '#fff'; g.lineWidth = 2
    g.strokeRect(8, 7, 22, 16); g.beginPath(); g.moveTo(8, 7); g.lineTo(19, 16); g.lineTo(30, 7); g.stroke()
    g.fillStyle = '#ff8fa6'; g.beginPath(); g.arc(30, 7, 5, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(String(s.unread), 36, 16)
  }
  if (s.latest) { g.font = '12px ' + FONT; g.textAlign = 'right'; g.fillText(L.latest + ' ' + hm(s.latest), OW - 8, OH - 12) }
  return cv
}
export const SIZES = { W, H, OW, OH }