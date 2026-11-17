// src/look.js — 翻盖手机的材质：珠光烤漆外壳、铬边、半透明按键、屏幕玻璃
// 珠光：清漆层 + 薄膜干涉（iridescence，转一下颜色会微微偏）+ 一层细闪（金属度 / 粗糙度贴图里撒亮点）
// 金属边、铰链：镜面铬；按键：半透明亚克力，屏幕亮的时候透一点光；屏幕前面一层玻璃
export const PEARL = {
  silver: { base: '#d9dce2', tint: '#f3f4f8', rim: '#eceef2', key: '#f4f5f7', ird: [180, 420], glow: '#f5f8ff' },
  cream: { base: '#f4ece0', tint: '#fffaf2', rim: '#efe7da', key: '#fffaf3', ird: [260, 520], glow: '#fff6e8' },
  sakura: { base: '#f3cdd6', tint: '#fff0f3', rim: '#f2dfe4', key: '#fdeef2', ird: [300, 560], glow: '#ffe8ee' },
  mint: { base: '#c7e6d8', tint: '#eefbf4', rim: '#e3efe9', key: '#eef9f3', ird: [220, 480], glow: '#e9fff4' },
  mist: { base: '#c6d4e8', tint: '#eef3fb', rim: '#e3e8f1', key: '#eef3fa', ird: [200, 460], glow: '#eaf2ff' },
  ink: { base: '#2c2d34', tint: '#55566a', rim: '#9a9ca6', key: '#3d3e47', ird: [360, 720], glow: '#cfd6ff' },
}
// 细闪：一张 256 的贴图，大部分是「不太金属、偏粗糙」，撒 2.5% 的小点「很金属、很光滑」→ 台灯一照有亮点
let flake = null
function flakeTex(THREE) {
  if (flake) return flake
  const N = 256, c = document.createElement('canvas'); c.width = N; c.height = N
  const g = c.getContext && c.getContext('2d'), im = g && g.createImageData && g.createImageData(N, N)
  if (!im || !im.data) return null // 画不了（测试里的假 canvas、怪 WebView）：不撒细闪，其余照常
  const d = im.data
  let s = 1234567
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let i = 0; i < N * N; i++) {
    const on = rnd() < 0.025
    d[i * 4] = 0
    d[i * 4 + 1] = on ? 40 : 150 + Math.floor(rnd() * 30) // G = 粗糙度
    d[i * 4 + 2] = on ? 255 : 40 + Math.floor(rnd() * 20) // B = 金属度
    d[i * 4 + 3] = 255
  }
  g.putImageData(im, 0, 0)
  flake = new THREE.CanvasTexture(c)
  flake.wrapS = flake.wrapT = THREE.RepeatWrapping; flake.repeat.set(6, 6)
  return flake
}
export function makeMats(THREE, { reduced } = {}) {
  const fl = flakeTex(THREE)
  const shell = new THREE.MeshPhysicalMaterial({
    color: '#d9dce2', metalness: fl ? 1 : 0.35, roughness: fl ? 1 : 0.3, metalnessMap: fl, roughnessMap: fl,
    clearcoat: 1, clearcoatRoughness: 0.06, iridescence: 0.55, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 420],
    sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffffff'),
  })
  const rim = new THREE.MeshPhysicalMaterial({ color: '#eceef2', metalness: 1, roughness: 0.14, clearcoat: 0.4 })
  const key = new THREE.MeshPhysicalMaterial({ color: '#f4f5f7', metalness: 0, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, opacity: 0.94, emissive: '#000000' })
  const glass = new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: 0.03, transparent: true, opacity: 0.12, clearcoat: 1, depthWrite: false })
  const bezel = new THREE.MeshPhysicalMaterial({ color: '#121418', metalness: 0.3, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 })
  const plate = new THREE.MeshPhysicalMaterial({ color: '#e6e7ea', metalness: 0.65, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.2 }) // 键盘底板：缎面金属
  return { shell, rim, key, glass, bezel, plate }
}
// 换颜色：珠光的底色、偏光的范围、按键背光一起换
export function paint(m, name, open = 0) {
  const p = PEARL[name] || PEARL.silver
  m.shell.color.set(p.base)
  m.shell.sheenColor.set(p.tint)
  m.shell.iridescenceThicknessRange = p.ird
  if (m.shell.metalnessMap) m.shell.metalness = name === 'ink' ? 0.9 : 0.75
  m.rim.color.set(p.rim)
  m.key.color.set(p.key)
  if (m.plate) m.plate.color.set(p.rim).lerp(new m.plate.color.constructor(p.base), 0.35)
  m.key.emissive.set(p.glow); m.key.emissiveIntensity = 0.06 + open * 0.16
  return p
}
// 环境反射：金属边、清漆要映出点东西才不像塑料
export function shine(THREE, renderer, Room, mats, k = 1) {
  if (!renderer || !Room) return null
  try {
    const pm = new THREE.PMREMGenerator(renderer), room = new Room()
    const rt = pm.fromScene(room, 0.04); pm.dispose(); if (room.dispose) room.dispose()
    for (const m of mats) { m.envMap = rt.texture; m.envMapIntensity = k; m.needsUpdate = true }
    return rt
  } catch { return null }
}