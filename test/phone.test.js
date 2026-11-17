// test/phone.test.js — 不开浏览器：用真的 three.js 搭整台手机（假 canvas、不渲染），核对几何、点击、贴纸、换页
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
// ---- 最小的假 DOM ----
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'measureText' ? s => ({ width: String(s).length * 12 }) : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : typeof k === 'string' ? (t[k] || (() => {})) : undefined), set: () => true })
const listeners = {}
const el = () => ({ width: 0, height: 0, style: {}, children: [], getContext: () => ctx2d, appendChild(c) { this.children.push(c); return c }, remove() {}, setAttribute() {}, addEventListener(n, f) { (listeners[n] = listeners[n] || []).push(f) }, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844, x: 0, y: 0 }) })
globalThis.document = { createElement: el, createElementNS: el }
globalThis.window = { devicePixelRatio: 1, getComputedStyle: () => ({ position: 'relative' }), matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} }
globalThis.performance = globalThis.performance || { now: () => 0 }
globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {}
globalThis.Image = class { set src(v) {} }
class FakeRenderer { setPixelRatio() {} setSize() {} setClearColor() {} render() {} dispose() {} }
const T = { ...THREE, WebGLRenderer: FakeRenderer, CanvasTexture: class extends THREE.Texture { constructor(c) { super(); this.image = c } } }
const { build, KEYS, FACES, faceXY, xyFace, D, W } = await import('../src/engine.js')
const { createFlipPhone, COLORS } = await import('../src/index.js')
const Wp = 390, Hp = 844
const mk = look => { const e = build(T, el(), { look, RoundedBoxGeometry }); e.setSize(Wp, Hp); return e }
const scan = (e, fn, step = 4) => { e.poseNow(); for (let y = 0; y < Hp; y += step) for (let x = 0; x < Wp; x += step) { const r = fn(x, y); if (r) return r } return null }

test('贴纸坐标在每个面上来回换算一致', () => {
  for (const f of FACES) for (const [u, v] of [[0.2, 0.3], [0.5, 0.5], [0.8, 0.9]]) {
    const p = faceXY(f, u, v), q = xyFace(f, p.x, p.y)
    assert.ok(Math.abs(q.u - u) < 1e-9 && Math.abs(q.v - v) < 1e-9, f)
  }
})
test('有厚度：合起来厚度约为宽的 0.4', () => { assert.ok(D / W > 0.2) })
test('翻开以后 21 个键都点得中', () => {
  const e = mk({ color: 'sakura' }); e.liftIn(null); e.S.lift = 1; e.S.open = 1
  // 扫一遍屏幕，记下点到过哪些键（一遍扫完，不是每个键扫一遍）
  const hit = new Set(); e.poseNow()
  for (let y = 0; y < Hp; y += 3) for (let x = 0; x < Wp; x += 3) { const h = e.pickKey(x, y); if (h && h.key) hit.add(h.key) }
  const miss = KEYS.filter(k => !hit.has(k.id)).map(k => k.id)
  assert.deepEqual(miss, [])
  e.dispose()
})
test('合着的时候按不到键', () => {
  const e = mk({}); e.liftIn(null); e.S.lift = 1; e.S.open = 0; e.S.openTo = 0
  assert.equal(scan(e, (x, y) => { const h = e.pickKey(x, y); return h && h.key }), null)
  e.dispose()
})
test('转到背面，正对镜头的是背面，能贴', () => {
  const e = mk({}); e.liftIn(null); e.S.lift = 1; e.S.open = 1; e.S.yaw = Math.PI; e.poseNow()
  assert.equal(e.frontFace(), 'back')
  // 翻开的手机从背后看：上半是翻盖外面（cover），下半是背面（back），两面都要点得到
  const faces = new Set(); e.poseNow()
  for (let y = 0; y < Hp; y += 8) for (let x = 0; x < Wp; x += 8) { const h = e.pickEdit(x, y, true); if (h) faces.add(h.face) }
  assert.deepEqual([...faces].sort(), ['back', 'cover'])
  e.dispose()
})
test('编辑时手指先碰到贴纸，不是下面的面', () => {
  const e = mk({ stickers: [{ id: 'a', img: 'x.png', face: 'body', u: 0.5, v: 0.45, s: 0.3, r: 0 }] })
  e.liftIn(null); e.S.lift = 1; e.S.open = 1
  assert.ok(scan(e, (x, y) => { const h = e.pickEdit(x, y); return h && h.sticker === 'a' }))
  e.dispose()
})
test('从页面上一个位置拿起来：起点就在那块', () => {
  const e = mk({}); e.liftIn({ x: 120, y: 360, w: 44, h: 66 }); e.S.lift = 0; e.S.open = 0
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9
  e.poseNow()
  for (let y = 300; y < 480; y += 2) for (let x = 60; x < 220; x += 2) if (e.pickKey(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  assert.ok(Math.abs((x0 + x1) / 2 - 142) < 8 && Math.abs((y0 + y1) / 2 - 393) < 8, [x0, x1, y0, y1].join(','))
  e.dispose()
})
test('createFlipPhone：上下键翻页、左右换箱、OK 把那条还回来、1~6 换颜色', () => {
  const box = el(), got = []
  const p = createFlipPhone(box, {
    THREE: T, RoundedBoxGeometry, open: true,
    inbox: [{ title: 'a', unread: true }, { title: 'b' }], outbox: [{ title: 'c' }],
    onOpenItem: (it, tab) => got.push(tab + ':' + it.title),
  })
  p.press('ok'); p.press('down'); p.press('ok'); p.press('down'); p.press('ok')
  p.press('right'); p.press('ok')
  assert.deepEqual(got, ['in:a', 'in:b', 'in:a', 'out:c'])
  p.press('d4'); assert.equal(p.color, COLORS[3])
  p.destroy()
})
test('createFlipPhone：加贴纸会告诉调用的人，撕掉也会', () => {
  const box = el(), seen = []
  const p = createFlipPhone(box, { THREE: T, RoundedBoxGeometry, open: true, onStickersChange: l => seen.push(l.length) })
  const s = p.addSticker('data:image/png;base64,AAAA')
  assert.equal(p.stickers.length, 1); assert.ok(FACES.includes(s.face))
  p.removeSticker(s.id)
  assert.deepEqual(seen, [1, 0])
  p.destroy()
})
test('少了 THREE 或 RoundedBoxGeometry 会直接说清楚', () => {
  assert.throws(() => createFlipPhone(el(), {}), /THREE/)
  assert.throws(() => createFlipPhone(el(), { THREE: T }), /RoundedBoxGeometry/)
})