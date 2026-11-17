// src/engine.js — 翻盖手机的 3D 部分：机身、翻盖、按键、贴纸、拿起来 / 放回去、转着看
// 层级：scene → holder（拿起来的位置 / 大小 / 转的角度）→ phone（原点在下半底边，往下挪半个机身让转轴在中间）→ pivot（翻盖）
// 贴纸四个面：cover（翻盖外面）/ body（键盘面）/ inner（内屏那面）/ back（下半背面），u、v 0~1，从左上算
import { drawInner, drawOuter } from './screens.js'
import { makeMats, paint, shine } from './look.js'
export const W = 0.56, H = 1.0, D = 0.13, TD = 0.1 // 合起来厚度约为宽的 0.4，照老款翻盖机
const OPEN_A = -(Math.PI - 0.22) // 掀开以后上半往后仰一点
export const FACES = ['cover', 'body', 'inner', 'back']
// 按键：id、在键盘面上的位置、大小、上面写什么
export const KEYS = (() => {
  const k = []
  k.push({ id: 'softL', x: -0.19, y: 0.875, w: 0.12, h: 0.06, label: '—' })
  k.push({ id: 'softR', x: 0.19, y: 0.875, w: 0.12, h: 0.06, label: '—' })
  k.push({ id: 'call', x: -0.19, y: 0.775, w: 0.12, h: 0.07, label: 'call' })
  k.push({ id: 'end', x: 0.19, y: 0.775, w: 0.12, h: 0.07, label: 'end' })
  k.push({ id: 'up', x: 0, y: 0.905, w: 0.1, h: 0.05, label: '▲' })
  k.push({ id: 'down', x: 0, y: 0.745, w: 0.1, h: 0.05, label: '▼' })
  k.push({ id: 'left', x: -0.082, y: 0.825, w: 0.05, h: 0.1, label: '◀' })
  k.push({ id: 'right', x: 0.082, y: 0.825, w: 0.05, h: 0.1, label: '▶' })
  k.push({ id: 'ok', x: 0, y: 0.825, w: 0.088, h: 0.088, label: 'OK', round: true })
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']
  digits.forEach((d, i) => k.push({ id: 'd' + d, x: (i % 3 - 1) * 0.165, y: 0.62 - Math.floor(i / 3) * 0.135, w: 0.14, h: 0.095, label: d }))
  return k
})()
// 贴纸在一个面上的位置 ↔ 那个面所在组的本地坐标（back 从背后看，左右反过来）
export function faceXY(face, u, v) {
  const x = (u - 0.5) * W
  if (face === 'body') return { x, y: H * (1 - v) }
  if (face === 'back') return { x: -x, y: H * (1 - v) }
  if (face === 'cover') return { x, y: -v * H }
  return { x, y: -(1 - v) * H } // inner：转了 π，掀开以后 v=0 在最上面
}
export function xyFace(face, x, y) {
  const u = (face === 'back' ? -x : x) / W + 0.5
  const v = face === 'body' || face === 'back' ? 1 - y / H : face === 'cover' ? -y / H : 1 + y / H
  return { u: Math.max(0, Math.min(1, u)), v: Math.max(0, Math.min(1, v)) }
}
// 镜头：按掀开的整台（高约 2）定距离；屏幕下面一截留给按钮
export function frame(aspect, fov = 32) {
  const t = Math.tan(fov / 2 * Math.PI / 180)
  const byH = 1.98 / 0.8 / 2 / t, byW = W * 1.2 / 0.86 / 2 / t / Math.max(0.3, aspect)
  return { dist: Math.max(byH, byW), t }
}
// 翻开了多少 → 机身中心在 phone 本地的高度（转的时候绕着中间转）
export const centerY = e => 0.5 + 0.47 * e
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const lerp = (a, b, t) => a + (b - a) * t
export function build(THREE, canvas, { look, env, RoundedBoxGeometry, reduced, fresh, labels: L = {} } = {}) {
  if (!RoundedBoxGeometry) throw new Error('需要传入 RoundedBoxGeometry（three/addons/geometries/RoundedBoxGeometry.js）')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = fresh ? 1.12 : 1.02
  renderer.setClearColor(0x000000, 0)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 40)
  const keep = []
  const own = x => { keep.push(x); return x }
  // 灯：跟桌上一样偏暖的台灯从右上打下来，左边一点冷的补光，后面一道轮廓光把铬边勾出来
  scene.add(new THREE.HemisphereLight(fresh ? 0xfff6f2 : 0xfff1e0, fresh ? 0xe9d6dc : 0x5a463a, fresh ? 0.55 : 0.4))
  const lamp = new THREE.DirectionalLight(fresh ? 0xfff3ea : 0xffe2bd, fresh ? 1.6 : 1.9); lamp.position.set(1.6, 2.4, 2.6); scene.add(lamp)
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.35); fill.position.set(-2.2, 0.6, 1.8); scene.add(fill)
  const back = new THREE.DirectionalLight(0xffffff, 0.9); back.position.set(-0.6, 1.4, -2.4); scene.add(back)
  // ---- 材质 ----
  const M = makeMats(THREE, { reduced })
  for (const k of ['shell', 'rim', 'key', 'glass', 'bezel', 'plate']) own(M[k])
  const envRT = env ? shine(THREE, renderer, env, [M.shell, M.rim, M.key, M.glass, M.bezel, M.plate], 1) : null
  const holder = new THREE.Group(); scene.add(holder)
  const phone = new THREE.Group(); holder.add(phone)
  const solid = []
  const add = (parent, geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(own(geo), mat); m.position.set(x, y, z); m.rotation.x = rx; parent.add(m); return m }
  // ---- 下半：机身 + 一圈铬边 + 键盘 ----
  const bodyM = add(phone, new RoundedBoxGeometry(W, H, D, 8, 0.06), M.shell, 0, H / 2, 0); solid.push(bodyM)
  add(phone, new RoundedBoxGeometry(W + 0.01, H + 0.01, 0.016, 8, 0.064), M.rim, 0, H / 2, D * 0.18)
  add(phone, new RoundedBoxGeometry(W - 0.05, H - 0.07, 0.003, 4, 0.03), M.plate, 0, H / 2 - 0.012, D / 2 + 0.0005)
  add(phone, new THREE.TorusGeometry(0.128, 0.0055, 10, 48), M.rim, 0, 0.825, D / 2 + 0.006) // 方向键外面一圈铬
  // 铰链：三段铬筒
  for (const [x, w] of [[-0.19, 0.11], [0, 0.2], [0.19, 0.11]]) { const c = add(phone, new THREE.CylinderGeometry(0.05, 0.05, w, 32), M.rim, x, H, D / 2); c.rotation.z = Math.PI / 2 }
  const keyMeshes = [], keyById = {}, labels = []
  const labelTex = (k, dark) => {
    const c = document.createElement('canvas'); c.width = 128; c.height = Math.round(128 * k.h / k.w)
    const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height)
    if (k.id === 'call' || k.id === 'end') {
      g.strokeStyle = k.id === 'call' ? '#3f9a62' : '#d0485c'; g.lineWidth = 9; g.lineCap = 'round'
      g.beginPath(); g.arc(c.width / 2, c.height / 2 + (k.id === 'end' ? -6 : 8), 26, Math.PI * 1.15, Math.PI * 1.85, k.id === 'end'); g.stroke()
    } else if (k.label !== '—') {
      g.fillStyle = dark ? '#eceef4' : '#3b3d44'; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.font = '600 ' + Math.round(c.height * (k.label.length > 1 ? 0.42 : 0.6)) + 'px "PingFang SC","Noto Sans SC",sans-serif'
      g.fillText(k.label, c.width / 2, c.height / 2 + 2)
    } else { g.fillStyle = dark ? '#d8d8de' : '#55575e'; g.fillRect(c.width * 0.3, c.height / 2 - 4, c.width * 0.4, 8) }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
  }
  for (const k of KEYS) {
    const m = add(phone, k.round ? new THREE.CylinderGeometry(k.w / 2, k.w / 2, 0.016, 36) : new RoundedBoxGeometry(k.w, k.h, 0.016, 4, Math.min(k.w, k.h) * 0.32), M.key, k.x, k.y, D / 2 + 0.008, k.round ? Math.PI / 2 : 0)
    m.userData.key = k.id; keyMeshes.push(m); keyById[k.id] = { m, z0: m.position.z, t: 0 }
    const lm = own(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }))
    const lp = add(phone, new THREE.PlaneGeometry(k.w * 0.9, k.h * 0.9), lm, k.x, k.y, D / 2 + 0.0171)
    lp.userData.key = k.id; labels.push({ k, lm, lp })
  }
  // 背面：电池盖一圈铬缝
  add(phone, new RoundedBoxGeometry(W - 0.08, H * 0.5, 0.002, 3, 0.03), M.rim, 0, H * 0.32, -D / 2 - 0.0006)
  // ---- 上半：翻盖（转轴在铰链上，合着时往下垂盖住键盘） ----
  const pivot = new THREE.Group(); pivot.position.set(0, H, D / 2); phone.add(pivot)
  const topM = add(pivot, new RoundedBoxGeometry(W, H, TD, 8, 0.05), M.shell, 0, -H / 2, TD / 2); solid.push(topM)
  add(pivot, new RoundedBoxGeometry(W + 0.01, H + 0.01, 0.014, 8, 0.054), M.rim, 0, -H / 2, TD * 0.4)
  // 外屏：外面靠上，黑边框 + 屏 + 玻璃
  const outerCv = document.createElement('canvas')
  const outerTex = own(new THREE.CanvasTexture(drawOuter(outerCv, {}, null, L))); outerTex.colorSpace = THREE.SRGBColorSpace
  add(pivot, new RoundedBoxGeometry(0.34, 0.27, 0.004, 3, 0.022), M.bezel, 0, -0.3, TD + 0.001)
  const outer = add(pivot, new THREE.PlaneGeometry(0.3, 0.225), own(new THREE.MeshBasicMaterial({ map: outerTex, toneMapped: false })), 0, -0.3, TD + 0.0034)
  add(pivot, new THREE.PlaneGeometry(0.32, 0.25), M.glass, 0, -0.3, TD + 0.0046)
  add(pivot, new RoundedBoxGeometry(0.12, 0.012, 0.002, 2, 0.005), M.rim, 0, -0.5, TD + 0.0008) // 外屏下面一道铬条
  for (let i = 0; i < 5; i++) add(pivot, new THREE.CircleGeometry(0.006, 14), M.bezel, (i - 2) * 0.026, -0.86, TD + 0.0006)
  // 内屏：里面，绕 x 转 π，掀开以后朝着镜头、字是正的
  const innerCv = document.createElement('canvas')
  const innerTex = own(new THREE.CanvasTexture(drawInner(innerCv, { tab: 'in', items: [] }, false, L))); innerTex.colorSpace = THREE.SRGBColorSpace
  add(pivot, new RoundedBoxGeometry(0.47, 0.63, 0.004, 3, 0.025), M.bezel, 0, -0.53, -0.001, Math.PI)
  const inner = add(pivot, new THREE.PlaneGeometry(0.42, 0.56), own(new THREE.MeshBasicMaterial({ map: innerTex, toneMapped: false })), 0, -0.53, -0.0035, Math.PI)
  add(pivot, new THREE.PlaneGeometry(0.45, 0.6), M.glass, 0, -0.53, -0.0048, Math.PI)
  add(pivot, new RoundedBoxGeometry(0.1, 0.014, 0.003, 2, 0.006), M.rim, 0, -0.12, -0.001, Math.PI) // 听筒
  // ---- 贴纸：每个面一块看不见的板接手指 ----
  const faceGroup = { body: phone, back: phone, cover: pivot, inner: pivot }
  const proxyMat = own(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }))
  const proxies = {}
  const faceZ = { body: D / 2 + 0.0185, back: -D / 2 - 0.0035, cover: TD + 0.0058, inner: -0.0058 }
  for (const f of FACES) {
    const p = new THREE.Mesh(own(new THREE.PlaneGeometry(W, H)), proxyMat)
    p.position.set(0, f === 'body' || f === 'back' ? H / 2 : -H / 2, faceZ[f] + (f === 'back' || f === 'inner' ? 0.0008 : -0.0008)) // 在贴纸下面一点，手指先碰到贴纸
    if (f === 'inner') p.rotation.x = Math.PI
    if (f === 'back') p.rotation.y = Math.PI
    p.userData.face = f; faceGroup[f].add(p); proxies[f] = p
  }
  const texCache = {}
  const loadTex = url => texCache[url] || (texCache[url] = new Promise(res => {
    new THREE.TextureLoader().load(url, t => { t.colorSpace = THREE.SRGBColorSpace; own(t); res(t) }, undefined, () => res(null))
  }))
  let stickerMeshes = [], selId = null
  const unitPlane = own(new THREE.PlaneGeometry(1, 1))
  function placeSticker(m, s) {
    const { x, y } = faceXY(s.face, s.u, s.v)
    m.position.set(x, y, faceZ[s.face] + (s.face === 'back' || s.face === 'inner' ? -1 : 1) * (s.lift || 0))
    if (s.face === 'inner') m.rotation.set(Math.PI, 0, -s.r)
    else if (s.face === 'back') m.rotation.set(0, Math.PI, s.r)
    else m.rotation.set(0, 0, s.r)
    const w = s.s * W, a = m.userData.aspect || 1
    m.scale.set(w, w * a, 1)
  }
  function setStickers(list) {
    for (const m of stickerMeshes) { m.parent && m.parent.remove(m); m.material.dispose() }
    stickerMeshes = []
    let i = 0
    for (const s of list || []) {
      // 贴纸上一层薄清漆：跟着台灯有一点反光，不像浮在上面的图片
      const mat = new THREE.MeshPhysicalMaterial({ transparent: true, alphaTest: 0.04, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, envMap: envRT ? envRT.texture : null, envMapIntensity: 0.4 })
      const m = new THREE.Mesh(unitPlane, mat); m.userData.sticker = s.id; m.renderOrder = 3 + i
      s.lift = 0.0004 * (i++)
      faceGroup[s.face].add(m); stickerMeshes.push(m); placeSticker(m, s)
      loadTex(s.img).then(t => { if (!t || disposed) return; mat.map = t; mat.needsUpdate = true; m.userData.aspect = t.image && t.image.width ? t.image.height / t.image.width : 1; placeSticker(m, s); kick() })
    }
    kick()
  }
  function moveSticker(s) { const m = stickerMeshes.find(x => x.userData.sticker === s.id); if (m) { if (m.parent !== faceGroup[s.face]) { m.parent.remove(m); faceGroup[s.face].add(m) } placeSticker(m, s); kick() } }
  function select(id) { selId = id; for (const m of stickerMeshes) m.material.emissive.set(m.userData.sticker === id ? 0x2a1d22 : 0x000000); kick() }
  // ---- 拿起来 / 翻开 / 转着看 ----
  const S = { open: 0, openTo: 0, lift: 0, liftTo: 0, aspect: 1, yaw: 0, pitch: 0, vy: 0, vp: 0, zoom: 1, zoomTo: 1, sway: 0, from: null, onDown: null }
  // ---- 颜色 ----
  let colorName = 'silver'
  function setColor(name) {
    colorName = name
    paint(M, name, S.open)
    const dark = name === 'ink'
    for (const l of labels) { if (l.lm.map) l.lm.map.dispose(); l.lm.map = labelTex(l.k, dark); l.lm.needsUpdate = true }
    kick()
  }
  // ---- 屏幕 ----
  function setInner(s) { drawInner(innerCv, s, false, L); innerTex.needsUpdate = true; kick() }
  let coverImg = null, outerState = {}
  function setOuter(s) { outerState = s || {}; drawOuter(outerCv, outerState, coverImg, L); outerTex.needsUpdate = true; kick() }
  function setCover(url) {
    coverImg = null; setOuter(outerState)
    if (!url) return
    const im = new Image(); im.crossOrigin = 'anonymous'
    im.onload = () => { if (disposed) return; coverImg = im; setOuter(outerState) }
    im.src = url
  }
  let W0 = 1, H0 = 1
  function setSize(w, h) { W0 = w; H0 = h; renderer.setSize(w, h, false); camera.aspect = w / h; S.aspect = w / h; camera.updateProjectionMatrix(); kick() }
  // 屏幕像素 → z=0 那一层的世界坐标
  function worldAt(px, py, dist, t) {
    const wh = 2 * dist * t, ww = wh * S.aspect
    return { x: (px / W0 - 0.5) * ww, y: -(py / H0 - 0.5) * wh, perPx: wh / H0 }
  }
  function place() {
    const f = frame(S.aspect), dist = f.dist * S.zoom
    camera.position.set(0, 0, dist); camera.lookAt(0, 0, 0)
    const e = ease(S.open), L = ease(S.lift)
    pivot.rotation.x = OPEN_A * e
    phone.position.y = -centerY(e)
    phone.rotation.set(-0.05, -0.12, 0)
    // 停在哪：屏幕中间偏上一点（下面留给按钮）
    const wh = 2 * dist * f.t
    const tx = 0, ty = wh * 0.035
    let x = tx, y = ty, s = 1, roll = 0, flick = 0
    if (S.from && L < 1) {
      const a = worldAt(S.from.x + S.from.w / 2, S.from.y + S.from.h / 2, dist, f.t)
      const s0 = Math.max(S.from.w, S.from.h) * a.perPx
      x = lerp(a.x, tx, L); y = lerp(a.y, ty, L); s = lerp(s0, 1, L)
      roll = (S.from.ry || 0) * (1 - L)
      flick = Math.sin(L * Math.PI) * 0.45 // 拿起来的时候往自己这边翘一下
    }
    holder.position.set(x, y, 0)
    holder.scale.setScalar(Math.max(0.01, s))
    const sway = reduced ? 0 : Math.sin(S.sway) * 0.025
    holder.rotation.set(S.pitch - flick, S.yaw + sway, roll)
    M.key.emissiveIntensity = 0.06 + e * 0.16
  }
  function press(id) { const k = keyById[id]; if (k) { k.t = 1; kick() } }
  function rotateBy(dx, dy) { S.resetting = false; S.yaw += dx * 0.008; S.pitch = Math.max(-1.25, Math.min(1.25, S.pitch + dy * 0.008)); S.vy = dx * 0.008; S.vp = dy * 0.008; idle = 0; kick() }
  function release() { idle = 0; kick() }
  function stopSpin() { S.vy = 0; S.vp = 0 }
  function zoomBy(k) { S.zoomTo = Math.max(0.55, Math.min(1.7, S.zoomTo / k)); idle = 0; kick() }
  function resetView() { S.vy = 0; S.vp = 0; S.yaw = ((S.yaw % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI; S.resetting = true; S.zoomTo = 1; idle = 0; kick() }
  // 拿起来 / 放回去
  function liftIn(rect) {
    S.from = rect || null
    if (reduced || !rect) { S.lift = S.liftTo = 1; S.openTo = 1; if (reduced) S.open = 1 } else { S.lift = 0; S.liftTo = 1; S.openTo = 0 }
    S.autoOpen = true; idle = 0; kick()
  }
  function liftOut(rect) {
    if (rect) S.from = rect
    S.autoOpen = false; S.resetting = true; S.zoomTo = 1; S.vy = S.vp = 0
    return new Promise(res => {
      if (reduced || !S.from) { S.open = S.openTo = 0; S.lift = S.liftTo = 0; res(); return }
      S.openTo = 0; S.closing = true; S.onDown = res; idle = 0; kick()
    })
  }
  function setOpen(on) { S.openTo = on ? 1 : 0; idle = 0; kick() }
  // ---- 手指点到了什么 ----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
  const toNdc = (x, y) => { ndc.set(x / W0 * 2 - 1, -(y / H0) * 2 + 1); ray.setFromCamera(ndc, camera) }
  function pickKey(x, y) {
    toNdc(x, y)
    const hit = ray.intersectObjects([...stickerMeshes, ...keyMeshes, ...labels.map(l => l.lp), ...solid, inner, outer], false)[0]
    if (!hit) return null
    const o = hit.object
    if (o.userData.sticker) return { sticker: o.userData.sticker }
    if (o.userData.key && S.open > 0.9) return { key: o.userData.key }
    if (o === inner) return { inner: true }
    if (o === outer) return { cover: true }
    return { body: true }
  }
  // 编辑贴纸：点到了哪张；或者（拖的时候 drag=true）手指下面是哪个面的什么位置，被机身挡住的面不算
  function pickEdit(x, y, drag) {
    toNdc(x, y)
    const hits = ray.intersectObjects([...(drag ? [] : stickerMeshes), ...Object.values(proxies), ...solid], false)
    for (const h of hits) {
      const o = h.object
      if (o.userData.sticker) return { sticker: o.userData.sticker }
      if (o.userData.face) {
        if ((o.userData.face === 'inner' || o.userData.face === 'body') && S.open < 0.5) continue
        const lp = o.parent.worldToLocal(h.point.clone())
        return { face: o.userData.face, ...xyFace(o.userData.face, lp.x, lp.y) }
      }
      return null
    }
    return null
  }
  // 现在最朝着镜头的是哪一面（新贴纸贴这面）
  function frontFace() {
    scene.updateMatrixWorld(true)
    let best = S.open < 0.5 ? 'cover' : 'body', bd = -2
    const n = new THREE.Vector3(), p = new THREE.Vector3()
    for (const f of FACES) {
      if ((f === 'inner' || f === 'body') && S.open < 0.5) continue
      const o = proxies[f]; o.getWorldPosition(p)
      n.set(0, 0, 1).transformDirection(o.matrixWorld)
      const dd = n.dot(camera.position.clone().sub(p).normalize())
      const bias = f === 'body' ? 0.25 : 0 // 翻开时键盘面和内屏差不多朝着镜头，新贴纸先往键盘面贴
      if (dd + bias > bd) { bd = dd + bias; best = f }
    }
    return best
  }
  // ---- 画 ----
  let raf = 0, last = 0, disposed = false, idle = 0
  function kick() { if (!raf && !disposed) { last = performance.now(); raf = requestAnimationFrame(loop) } }
  function step(dt) {
    let busy = false
    const dL = S.liftTo - S.lift
    if (Math.abs(dL) > 1e-3) { S.lift += Math.sign(dL) * Math.min(Math.abs(dL), dt / 0.42); busy = true } else S.lift = S.liftTo
    if (S.autoOpen && S.lift > 0.97 && S.openTo === 0) S.openTo = 1
    const dO = S.openTo - S.open
    if (Math.abs(dO) > 1e-3) { S.open += Math.sign(dO) * Math.min(Math.abs(dO), dt / 0.5); busy = true } else S.open = S.openTo
    if (S.closing && S.open < 0.02) S.liftTo = 0
    if (S.closing && S.lift < 0.002 && S.liftTo === 0) { S.closing = false; const r = S.onDown; S.onDown = null; if (r) r() }
    // 松手以后还转一会儿，慢慢停
    if (Math.abs(S.vy) > 1e-4 || Math.abs(S.vp) > 1e-4) {
      S.yaw += S.vy; S.pitch = Math.max(-1.25, Math.min(1.25, S.pitch + S.vp))
      const k = Math.pow(0.04, dt); S.vy *= k; S.vp *= k; busy = true
    }
    if (S.resetting) {
      const k = 1 - Math.pow(0.001, dt)
      S.yaw += (0 - S.yaw) * k; S.pitch += (0 - S.pitch) * k
      if (Math.abs(S.yaw) < 1e-3 && Math.abs(S.pitch) < 1e-3) { S.yaw = 0; S.pitch = 0; S.resetting = false }
      busy = true
    }
    const dz = S.zoomTo - S.zoom
    if (Math.abs(dz) > 1e-3) { S.zoom += dz * (1 - Math.pow(0.002, dt)); busy = true } else S.zoom = S.zoomTo
    for (const id in keyById) { const k = keyById[id]; if (k.t > 0) { k.t = Math.max(0, k.t - dt / 0.14); k.m.position.z = k.z0 - 0.006 * Math.sin(k.t * Math.PI); busy = true } }
    if (!reduced) { S.sway += dt * 0.5; idle += dt }
    return busy
  }
  function loop(t) {
    raf = 0; if (disposed) return
    const dt = Math.min(0.05, (t - last) / 1000); last = t
    const busy = step(dt)
    place()
    renderer.render(scene, camera)
    if (busy || (!reduced && idle < 300)) raf = requestAnimationFrame(loop)
  }
  // 测试用：不渲染，只摆好姿势
  function poseNow() { place(); scene.updateMatrixWorld(true); camera.updateMatrixWorld() }
  function dispose() {
    disposed = true; if (raf) cancelAnimationFrame(raf)
    for (const m of stickerMeshes) m.material.dispose()
    for (const x of keep) { try { x.dispose() } catch {} }
    for (const l of labels) if (l.lm.map) l.lm.map.dispose()
    if (envRT) envRT.dispose()
    renderer.dispose()
  }
  setColor((look && look.color) || 'silver'); setStickers(look && look.stickers)
  return { S, poseNow, step, setSize, setOpen, setColor, setStickers, moveSticker, select, setInner, setOuter, setCover, press, pickKey, pickEdit, frontFace, rotateBy, release, stopSpin, zoomBy, resetView, liftIn, liftOut, kick, dispose, get selected() { return selId }, get color() { return colorName } }
}