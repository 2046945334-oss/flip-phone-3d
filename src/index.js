// src/index.js — 纯 JS 入口：createFlipPhone(container, options)
// 一台能翻开、能按键、能 360 转着看、能贴贴纸的翻盖手机。屏幕上显示什么、按了键做什么都交给你
import { build, KEYS, FACES } from './engine.js'
import { PEARL } from './look.js'
import { LABELS } from './screens.js'
export { cutout, shrink } from './cutout.js'
export { KEYS, FACES, LABELS }
export const COLORS = Object.keys(PEARL) // silver cream sakura mint mist ink
const SR_CSS = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;'
const sid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
/**
 * @param {HTMLElement} container  手机画在这个元素里，大小跟着它走（建议竖长，比如 100vw × 100vh 或 360 × 640）
 * @param {object} options
 *   THREE               必填，import * as THREE from 'three'
 *   RoundedBoxGeometry  必填，three/addons/geometries/RoundedBoxGeometry.js 的 RoundedBoxGeometry
 *   RoomEnvironment     选填，three/addons/environments/RoomEnvironment.js；传了外壳和铬边才有反光
 *   color               外壳颜色：'silver' | 'cream' | 'sakura' | 'mint' | 'mist' | 'ink'（默认 'sakura'）
 *   warm                灯光偏粉暖（默认 true）；false 是偏黄的台灯
 *   open                一开始就翻开（默认 false，点一下翻开）
 *   inbox / outbox      两个箱子里的消息，见 setInbox()
 *   cover               外屏照片网址
 *   stickers            贴纸列表 [{ id, img, face, u, v, s, r }]，见 README
 *   labels              屏幕上的字，比如 { inbox: '来信', emptyIn: '还没有信' }
 *   reducedMotion       关掉动画；不传时跟着系统的「减少动态效果」
 *   onOpenItem(item, tab)   在某一条上按了 OK / 点了屏幕
 *   onKey(id)           按了任何键（数字键是 'd1'…'d9'、'd0'、'd*'、'd#'）
 *   onClose()           按了挂断键、或者点到手机外面
 *   onColorChange(name) 用 1~6 键换了颜色
 *   onStickersChange(list)  贴纸被拖动、缩放、旋转、撕掉以后，新的整份列表；要存起来就在这里存
 *   onError(err)        浏览器不支持 WebGL、或 WebGL 中途挂掉
 */
export function createFlipPhone(container, options = {}) {
  const { THREE, RoundedBoxGeometry } = options
  if (!THREE) throw new Error('createFlipPhone 需要传入 THREE')
  if (!RoundedBoxGeometry) throw new Error('createFlipPhone 需要传入 RoundedBoxGeometry')
  if (!container) throw new Error('createFlipPhone 需要一个容器元素')
  const doc = container.ownerDocument || document, win = doc.defaultView || window
  if (win.getComputedStyle(container).position === 'static') container.style.position = 'relative'
  const cv = doc.createElement('canvas')
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;-webkit-tap-highlight-color:transparent;'
  container.appendChild(cv)
  const o = options
  let reduced = o.reducedMotion
  if (reduced == null) { try { reduced = win.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { reduced = false } }
  const st = { tab: 'in', idx: 0, inbox: o.inbox || [], outbox: o.outbox || [], stickers: (o.stickers || []).map(s => ({ ...s })), editing: false, color: o.color || 'sakura', dead: false }
  let e
  try {
    e = build(THREE, cv, { look: { color: st.color, stickers: st.stickers }, env: o.RoomEnvironment || null, RoundedBoxGeometry, reduced, fresh: o.warm !== false, labels: o.labels })
  } catch (err) { cv.remove(); if (o.onError) o.onError(err); throw err }
  cv.addEventListener('webglcontextlost', ev => { ev.preventDefault(); if (o.onError) o.onError(new Error('WebGL context lost')) })
  const items = () => (st.tab === 'in' ? st.inbox : st.outbox)
  const cur = () => items()[Math.min(st.idx, Math.max(0, items().length - 1))]
  const unread = () => st.inbox.filter(x => x.unread).length
  const latest = () => Math.max(0, ...st.inbox.map(x => x.time || 0))
  let msg = '', msgT = 0
  const redraw = () => {
    if (st.dead) return
    e.setOuter({ unread: unread(), latest: latest() })
    e.setInner({ tab: st.tab, idx: Math.min(st.idx, Math.max(0, items().length - 1)), items: items(), unread: unread(), msg })
    label()
  }
  const toast = t => { msg = t; redraw(); clearTimeout(msgT); msgT = setTimeout(() => { msg = ''; redraw() }, 1600) }
  const opened = () => e.S.open > 0.9
  // ---- 按键 ----
  function key(id) {
    e.press(id)
    const n = items().length
    if (id === 'up') st.idx = n ? (st.idx - 1 + n) % n : 0
    else if (id === 'down') st.idx = n ? (st.idx + 1) % n : 0
    else if (id === 'left' || id === 'right' || id === 'call' || id === 'softL') { st.tab = st.tab === 'in' ? 'out' : 'in'; st.idx = 0 }
    else if (id === 'ok') { const it = cur(); if (it && o.onOpenItem) o.onOpenItem(it, st.tab) }
    else if (id === 'end' || id === 'softR') { if (o.onClose) o.onClose(); else api.close() }
    else if (/^d[1-6]$/.test(id)) { const c = COLORS[Number(id[1]) - 1]; api.setColor(c); if (o.onColorChange) o.onColorChange(c) }
    redraw()
    if (o.onKey) o.onKey(id)
  }
  // ---- 手指：拖着转、两指缩放、双击回正、点；编辑贴纸时按住贴纸拖 ----
  const ptrs = new Map()
  let g = null, lastTap = 0, sel = null
  const pos = ev => { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top } }
  const emitStickers = () => { if (o.onStickersChange) o.onStickersChange(st.stickers.map(({ lift, ...s }) => ({ ...s }))) }
  function onDown(ev) {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return
    const p = pos(ev); ptrs.set(ev.pointerId, p)
    try { cv.setPointerCapture(ev.pointerId) } catch {}
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()]; g = g || {}
      g.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), s0: g.s ? g.s.s : 0, r0: g.s ? g.s.r : 0 }
      g.moved = true; clearTimeout(g.lp); return
    }
    e.stopSpin()
    g = { x: p.x, y: p.y, lx: p.x, ly: p.y, moved: false }
    if (st.editing) {
      const h = e.pickEdit(p.x, p.y)
      const s = h && h.sticker && st.stickers.find(x => x.id === h.sticker)
      if (s) { g.s = s; sel = s.id; e.select(s.id); const gg = g; g.lp = setTimeout(() => { if (!gg.moved) api.removeSticker(s.id) }, 650) }
    }
  }
  function onMove(ev) {
    if (!g || !ptrs.has(ev.pointerId)) return
    const p = pos(ev); ptrs.set(ev.pointerId, p)
    if (g.pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], dd = Math.hypot(a.x - b.x, a.y - b.y)
      if (g.s) {
        g.s.s = Math.max(0.08, Math.min(0.9, g.pinch.s0 * dd / Math.max(1, g.pinch.d)))
        g.s.r = g.pinch.r0 - (Math.atan2(b.y - a.y, b.x - a.x) - g.pinch.ang)
        e.moveSticker(g.s)
      } else { e.zoomBy(dd / Math.max(1, g.pinch.d)); g.pinch.d = dd }
      return
    }
    if (!g.moved && Math.hypot(p.x - g.x, p.y - g.y) > 7) { g.moved = true; clearTimeout(g.lp) }
    if (!g.moved) return
    if (g.s) { const h = e.pickEdit(p.x, p.y, true); if (h) { g.s.face = h.face; g.s.u = h.u; g.s.v = h.v; e.moveSticker(g.s) } }
    else e.rotateBy(p.x - g.lx, p.y - g.ly)
    g.lx = p.x; g.ly = p.y
  }
  function onUp(ev) {
    ptrs.delete(ev.pointerId)
    if (!g || ptrs.size) return
    const G = g; g = null; clearTimeout(G.lp)
    if (G.s && (G.moved || G.pinch)) { emitStickers(); return }
    if (G.moved || G.pinch) { e.release(); return }
    if (G.s) return
    const p = pos(ev), now = Date.now(), h = e.pickKey(p.x, p.y)
    if (now - lastTap < 300 && (!h || h.body || h.cover)) { lastTap = 0; e.resetView(); return }
    lastTap = now
    if (st.editing) { if (!h) { sel = null; e.select(null) } return }
    if (!h) { setTimeout(() => { if (lastTap === now && o.onClose) o.onClose() }, 300); return }
    if (!opened()) { e.setOpen(true); return }
    if (h.key) key(h.key)
    else if (h.inner) key('ok')
  }
  function onCancel(ev) { ptrs.delete(ev.pointerId); if (g) clearTimeout(g.lp); g = null }
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove)
  cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onCancel)
  // 读屏软件看不到 3D，放几个看不见的按钮
  const sr = doc.createElement('div'); sr.style.cssText = SR_CSS
  const mk = (txt, fn) => { const b = doc.createElement('button'); b.type = 'button'; b.textContent = txt; b.addEventListener('click', ev => { ev.stopPropagation(); fn() }); sr.appendChild(b); return b }
  mk('翻开 / 合上', () => e.setOpen(!(e.S.openTo > 0.5)))
  mk('上一条', () => key('up')); mk('下一条', () => key('down')); mk('换收件箱 / 发件箱', () => key('left')); mk('打开这一条', () => key('ok'))
  container.appendChild(sr)
  container.setAttribute('role', 'group')
  function label() { const L = { ...LABELS, ...(o.labels || {}) }, it = cur(); container.setAttribute('aria-label', '翻盖手机，' + (st.tab === 'in' ? L.inbox : L.outbox) + (it ? '：' + it.title : '：空') + '。拖动可以转着看') }
  const fit = () => { const r = container.getBoundingClientRect(); e.setSize(Math.max(1, r.width), Math.max(1, r.height)) }
  fit()
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null
  if (ro) ro.observe(container); else win.addEventListener('resize', fit)
  if (o.cover) e.setCover(o.cover)
  e.liftIn(null); e.S.openTo = o.open ? 1 : 0; e.S.autoOpen = false
  if (o.open || reduced) e.S.open = o.open ? 1 : 0
  redraw()
  const toLocal = r => { if (!r) return null; const b = container.getBoundingClientRect(); return { x: r.x - b.left, y: r.y - b.top, w: r.w || r.width, h: r.h || r.height, ry: r.ry || 0 } }
  const api = {
    /** 收件箱：[{ title, tag, time, unread, status, statusTone, note, ...你自己的字段 }]，onOpenItem 会把整条还给你 */
    setInbox(list) { st.inbox = list || []; redraw() },
    /** 发件箱，字段同 setInbox */
    setOutbox(list) { st.outbox = list || []; redraw() },
    /** 屏幕上弹一行小字，1.6 秒后消失 */
    toast,
    setColor(name) { if (!PEARL[name]) return; st.color = name; e.setColor(name) },
    get color() { return st.color },
    /** 外屏照片，传空字符串回到默认的渐变 */
    setCover(src) { e.setCover(src || '') },
    /** 翻开 / 合上（在原地） */
    open() { e.setOpen(true) },
    close() { e.setOpen(false) },
    /** 从页面上某个位置「拿起来」：rect 是 getBoundingClientRect() 那样的矩形，手机从那里飞到中间并自己翻开 */
    lift(rect) { e.liftIn(toLocal(rect)) },
    /** 合上并落回 rect 那个位置，动画结束后 resolve */
    putDown(rect) { return e.liftOut(toLocal(rect)) },
    /** 回到正面、原本的大小 */
    resetView() { e.resetView() },
    /** 打开 / 关掉贴纸编辑：开着时按住贴纸拖、两指缩放旋转、长按撕掉；拖空白处照样转手机 */
    setEditing(on) { st.editing = !!on; if (!on) { sel = null; e.select(null) } },
    get editing() { return st.editing },
    /** 加一张贴纸，贴在现在最朝着镜头的那一面；img 是网址或 data URL。返回这张贴纸 */
    addSticker(img, extra = {}) {
      const face = e.frontFace()
      const s = { id: sid(), img, face, u: 0.5, v: face === 'cover' ? 0.68 : face === 'inner' ? 0.5 : 0.45, s: 0.3, r: 0, ...extra }
      st.stickers.push(s); e.setStickers(st.stickers); sel = s.id; e.select(s.id); emitStickers(); return { ...s }
    },
    removeSticker(id) { st.stickers = st.stickers.filter(s => s.id !== id); e.setStickers(st.stickers); if (sel === id) sel = null; emitStickers() },
    setStickers(list) { st.stickers = (list || []).map(s => ({ ...s })); e.setStickers(st.stickers) },
    get stickers() { return st.stickers.map(({ lift, ...s }) => ({ ...s })) },
    get selectedSticker() { return sel },
    /** 模拟按一个键：'up' 'down' 'left' 'right' 'ok' 'call' 'end' 'softL' 'softR' 'd0'~'d9' 'd*' 'd#' */
    press: key,
    destroy() {
      if (st.dead) return; st.dead = true; clearTimeout(msgT)
      if (ro) ro.disconnect(); else win.removeEventListener('resize', fit)
      e.dispose(); cv.remove(); sr.remove()
    },
  }
  return api
}