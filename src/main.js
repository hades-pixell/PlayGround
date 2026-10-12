// Minecraft 3D — main entry: scene, chunks, input, HUD, menus.
import * as THREE from 'three'
import { World, SX, SY, SZ, CHUNK, SEA, buildChunkGeometry, raycastVoxel } from './world.js'
import { buildAtlas, BLOCKS, HOTBAR, blockIcon } from './textures.js'
import { Player } from './player.js'

const $ = (id) => document.getElementById(id)
const canvas = $('game')
const hud = $('hud'), menu = $('menu'), pause = $('pause'), help = $('help')
const lockTip = $('lockTip'), toastEl = $('toast')

let toastTimer = 0
function toast(msg, ms = 2200) {
  toastEl.textContent = msg
  toastEl.style.opacity = 1
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toastEl.style.opacity = 0), ms)
}

// ---------- Audio (procedural, no assets) ----------
let AC = null
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)() } catch { return null } }
  if (AC && AC.state === 'suspended') AC.resume()
  return AC
}
function blip(freq = 440, dur = 0.08, type = 'square', vol = 0.08) {
  const ac = audio(); if (!ac) return
  const o = ac.createOscillator(), g = ac.createGain()
  o.type = type; o.frequency.value = freq
  g.gain.setValueAtTime(vol, ac.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur)
  o.connect(g).connect(ac.destination)
  o.start(); o.stop(ac.currentTime + dur)
}
const sfxBreak = () => { blip(140 + Math.random() * 60, 0.12, 'sawtooth', 0.07); blip(90, 0.1, 'triangle', 0.06) }
const sfxPlace = () => blip(320 + Math.random() * 40, 0.07, 'square', 0.06)

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x87ceeb)
scene.fog = new THREE.Fog(0x87ceeb, 40, 140)

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)

const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6b5b3e, 0.95)
scene.add(hemi)
const sun = new THREE.DirectionalLight(0xfff2d8, 1.6)
sun.position.set(60, 100, 30)
scene.add(sun)
scene.add(new THREE.AmbientLight(0xffffff, 0.15))

// ---------- World + materials ----------
let seed = parseInt(($('seedInput').value || '1337'), 10) || 1337
let world = new World(seed)
const atlas = buildAtlas()
blockIcon.atlas = atlas.canvas

const opaqueMat = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true })
const transpMat = new THREE.MeshLambertMaterial({
  map: atlas.texture, vertexColors: true, transparent: true, opacity: 0.85,
  side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.05,
})

const chunkGroup = new THREE.Group()
scene.add(chunkGroup)
const chunkMeshes = new Map() // "cx,cz" -> [meshOpaque, meshTransp]

function rebuildChunk(cx, cz) {
  const key = cx + ',' + cz
  const old = chunkMeshes.get(key)
  if (old) { for (const m of old) { chunkGroup.remove(m); m.geometry.dispose() } }
  const meshes = []
  for (const [transparent, mat] of [[false, opaqueMat], [true, transpMat]]) {
    const g = buildChunkGeometry(world, cx, cz, transparent)
    const m = new THREE.Mesh(g, mat)
    m.matrixAutoUpdate = false
    chunkGroup.add(m)
    meshes.push(m)
  }
  chunkMeshes.set(key, meshes)
}

function buildAllChunks() {
  for (const [, meshes] of chunkMeshes) for (const m of meshes) { chunkGroup.remove(m); m.geometry.dispose() }
  chunkMeshes.clear()
  for (let cx = 0; cx < SX / CHUNK; cx++) for (let cz = 0; cz < SZ / CHUNK; cz++) rebuildChunk(cx, cz)
}

function chunksAround(x, z, fn) {
  fn(Math.floor(x / CHUNK), Math.floor(z / CHUNK))
  // if on border, also rebuild neighbor
  const lx = x - Math.floor(x / CHUNK) * CHUNK, lz = z - Math.floor(z / CHUNK) * CHUNK
  if (lx === 0) fn(Math.floor(x / CHUNK) - 1, Math.floor(z / CHUNK))
  if (lx === CHUNK - 1) fn(Math.floor(x / CHUNK) + 1, Math.floor(z / CHUNK))
  if (lz === 0) fn(Math.floor(x / CHUNK), Math.floor(z / CHUNK) - 1)
  if (lz === CHUNK - 1) fn(Math.floor(x / CHUNK), Math.floor(z / CHUNK) + 1)
  void SZ
}
function refreshAt(x, z) {
  chunksAround(x, z, (cx, cz) => {
    if (cx >= 0 && cz >= 0 && cx < SX / CHUNK && cz < SZ / CHUNK) rebuildChunk(cx, cz)
  })
}

buildAllChunks()

// ---------- Selection highlight ----------
const hlGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002)
const hlEdge = new THREE.LineSegments(
  new THREE.EdgesGeometry(hlGeo),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 })
)
hlEdge.visible = false
scene.add(hlEdge)

// ---------- Clouds ----------
const cloudGroup = new THREE.Group()
{
  const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 })
  const r = (function* () { let s = seed; while (true) { s = (s * 16807) % 2147483647; yield s / 2147483647 } })()
  for (let i = 0; i < 26; i++) {
    const w = 6 + r.next().value * 14, d = 5 + r.next().value * 10
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), cm)
    m.position.set(r.next().value * SX, SY - 4 + r.next().value * 4, r.next().value * SZ)
    cloudGroup.add(m)
  }
}
scene.add(cloudGroup)

// ---------- Player ----------
const player = new Player(camera, world)
player.spawn()
player.updateCamera()

// ---------- Hotbar ----------
let selected = 0
const hotbarEl = $('hotbar')
function buildHotbar() {
  hotbarEl.innerHTML = ''
  HOTBAR.forEach((id, i) => {
    const d = document.createElement('div')
    d.className = 'slot' + (i === selected ? ' sel' : '')
    d.innerHTML = `<span class="key">${i + 1}</span><small>${BLOCKS[id].name}</small>`
    d.prepend(blockIcon(id))
    d.title = BLOCKS[id].name
    hotbarEl.appendChild(d)
  })
}
function selectSlot(i) {
  selected = (i + HOTBAR.length) % HOTBAR.length
  ;[...hotbarEl.children].forEach((el, j) => el.classList.toggle('sel', j === selected))
  blip(600 + selected * 40, 0.04, 'square', 0.03)
}
buildHotbar()

// ---------- Input ----------
let started = false
let locked = false

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas
  lockTip.classList.toggle('hidden', locked || !started)
  if (!locked && started && help.classList.contains('hidden')) {
    pause.classList.remove('hidden')
  } else {
    pause.classList.add('hidden')
  }
})

document.addEventListener('mousemove', (e) => {
  if (!locked) return
  player.yaw -= e.movementX * 0.0024
  player.pitch -= e.movementY * 0.0024
  player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch))
})

window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') e.preventDefault()
  player.keys[e.code] = true
  if (!started) return
  if (e.code.startsWith('Digit')) {
    const n = parseInt(e.code.slice(5), 10)
    if (n >= 1 && n <= HOTBAR.length) selectSlot(n - 1)
  }
  if (e.code === 'KeyF') {
    player.fly = !player.fly
    player.vel.set(0, 0, 0)
    toast(player.fly ? '🕊 Fly mode ON (Space up / Shift down)' : '🚶 Walk mode')
    $('mode').textContent = player.fly ? 'Fly · Creative-style build' : 'Walk · Survival-style build'
  }
  if (e.code === 'KeyH') { help.classList.toggle('hidden') }
  if (e.code === 'KeyT') { /* reserved */ }
})
window.addEventListener('keyup', (e) => { player.keys[e.code] = false })
window.addEventListener('blur', () => { player.keys = {} })
document.addEventListener('contextmenu', (e) => e.preventDefault())

window.addEventListener('wheel', (e) => {
  if (!started) return
  selectSlot(selected + (e.deltaY > 0 ? 1 : -1))
}, { passive: true })

function currentTarget() {
  const dir = new THREE.Vector3()
  camera.getWorldDirection(dir)
  return raycastVoxel(world, camera.position, dir, 8)
}

function doBreak() {
  const t = currentTarget()
  if (!t) return
  if (t.y === 0) { toast('⛏ Bedrock layer is unbreakable here — it is the floor'); return }
  world.set(t.x, t.y, t.z, 0)
  refreshAt(t.x, t.z)
  sfxBreak()
  autosave()
}
function doPlace() {
  const t = currentTarget()
  if (!t) return
  const px = t.x + t.nx, py = t.y + t.ny, pz = t.z + t.nz
  if (!world.inBounds(px, py, pz)) return
  const cur = world.get(px, py, pz)
  if (cur !== 0 && cur !== 10) return
  if (player.intersectsBlock(px, py, pz)) return
  world.set(px, py, pz, HOTBAR[selected])
  refreshAt(px, pz)
  sfxPlace()
  autosave()
}

let mouseDownL = false, breakTimer = 0
canvas.addEventListener('mousedown', (e) => {
  if (!started || !locked) return
  audio()
  if (e.button === 0) { doBreak(); mouseDownL = true; breakTimer = 0 }
  else if (e.button === 2) doPlace()
  else if (e.button === 1) {
    const t = currentTarget()
    if (t) {
      const i = HOTBAR.indexOf(t.block)
      if (i >= 0) selectSlot(i)
      else { HOTBAR[selected] = t.block; buildHotbar(); selectSlot(selected); toast(`Picked ${BLOCKS[t.block].name}`) }
    }
  }
})
window.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDownL = false })
lockTip.addEventListener('click', () => canvas.requestPointerLock())

// ---------- Menus ----------
function lock() { canvas.requestPointerLock() }

$('playBtn').addEventListener('click', () => {
  audio()
  seed = parseInt(($('seedInput').value || '1337'), 10) || 1337
  newWorld(seed)
  beginPlay()
})
$('continueBtn').addEventListener('click', () => {
  audio()
  if (pendingSaveRaw) {
    seed = parseInt(($('seedInput').value || '1337'), 10) || 1337
    newWorld(seed)
    world.applyDiff(pendingSaveRaw)
    buildAllChunks()
    pendingSaveRaw = null
  }
  beginPlay()
})
$('resumeBtn').addEventListener('click', () => { pause.classList.add('hidden'); lock() })
$('closeHelp').addEventListener('click', () => help.classList.add('hidden'))
$('randomSeed').addEventListener('click', () => { $('seedInput').value = Math.floor(Math.random() * 99999) })
$('saveBtn').addEventListener('click', () => { saveGame(); toast('💾 World saved') })
$('newBtn').addEventListener('click', () => {
  pause.classList.add('hidden')
  document.exitPointerLock?.()
  started = false
  menu.classList.remove('hidden')
  hud.classList.add('hidden')
})
$('resetBtn').addEventListener('click', () => {
  localStorage.removeItem('mc3d-save')
  newWorld(seed)
  pause.classList.add('hidden')
  lock()
  toast('♻ World regenerated')
})

function beginPlay() {
  menu.classList.add('hidden')
  pause.classList.add('hidden')
  hud.classList.remove('hidden')
  started = true
  lock()
  toast('⛏ Left-click to mine · Right-click to build', 3000)
}

function newWorld(s) {
  world = new World(s)
  player.world = world
  buildAllChunks()
  player.spawn()
  player.fly = false
  player.vel.set(0, 0, 0)
  $('mode').textContent = 'Walk · Survival-style build'
}

function saveGame() {
  try { localStorage.setItem('mc3d-save', world.serializeDiff()) } catch { /* quota */ }
}
let saveTick = 0
function autosave() {
  if (++saveTick % 5 === 0) saveGame()
}

// offer continue if save exists
let pendingSaveRaw = null
try {
  const raw = localStorage.getItem('mc3d-save')
  if (raw) {
    const o = JSON.parse(raw)
    if (o && typeof o.seed === 'number') {
      $('seedInput').value = o.seed
      $('continueBtn').classList.remove('hidden')
      pendingSaveRaw = raw
    }
  }
} catch { /* ignore */ }

// ---------- Resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// ---------- Loop ----------
const clock = new THREE.Clock()
let frames = 0, fpsT = 0
let orbit = 0

function animate() {
  requestAnimationFrame(animate)
  const dt = Math.min(clock.getDelta(), 0.1)

  if (!started) {
    // cinematic orbit behind the menu
    orbit += dt * 0.08
    const cx = SX / 2, cz = SZ / 2
    camera.position.set(cx + Math.cos(orbit) * 55, 38, cz + Math.sin(orbit) * 55)
    camera.lookAt(cx, SEA + 2, cz)
  } else if (locked) {
    player.update(dt)
    // hold-to-mine
    if (mouseDownL) {
      breakTimer += dt
      if (breakTimer > 0.28) { breakTimer = 0; doBreak() }
    }
  }

  // clouds drift
  cloudGroup.position.x += dt * 0.6
  if (cloudGroup.position.x > 30) cloudGroup.position.x = -30

  // selection highlight
  if (started && locked) {
    const t = currentTarget()
    if (t) {
      hlEdge.visible = true
      hlEdge.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5)
    } else hlEdge.visible = false
    const p = player.pos
    $('coords').textContent = `XYZ ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)} · Seed ${seed}`
  } else hlEdge.visible = false

  renderer.render(scene, camera)

  frames++; fpsT += dt
  if (fpsT >= 0.5) {
    $('fps').textContent = `${Math.round(frames / fpsT)} FPS`
    frames = 0; fpsT = 0
  }
}
animate()
