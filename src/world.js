// Voxel world: storage, terrain generation, chunk meshing.
import * as THREE from 'three'
import { fbm2, mulberry32 } from './noise.js'
import { BLOCKS, tileUV } from './textures.js'

export const SX = 96, SY = 48, SZ = 96
export const CHUNK = 16
export const SEA = 15

export class World {
  constructor(seed = 1337) {
    this.seed = seed
    this.data = new Uint8Array(SX * SY * SZ)
    this.dirty = new Map() // index -> block (edits for save)
    this.generate()
  }

  idx(x, y, z) { return (y * SZ + z) * SX + x }
  inBounds(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ }
  get(x, y, z) {
    if (y < 0) return 3 // floor = stone
    if (!this.inBounds(x, y, z)) return 0
    return this.data[this.idx(x, y, z)]
  }
  set(x, y, z, v, record = true) {
    if (!this.inBounds(x, y, z)) return
    this.data[this.idx(x, y, z)] = v
    if (record) this.dirty.set(this.idx(x, y, z), v)
  }

  isOpaque(x, y, z) {
    const b = this.get(x, y, z)
    if (b === 0) return false
    const def = BLOCKS[b]
    return def && !def.transparent
  }

  heightAt(x, z) { return this.heights[z * SX + x] }

  generate() {
    const { seed } = this
    this.heights = new Int16Array(SX * SZ)
    const rand = mulberry32(seed)
    // precompute tree spots (deterministic, sparse)
    const treeMap = new Uint8Array(SX * SZ)
    for (let x = 2; x < SX - 2; x++) for (let z = 2; z < SZ - 2; z++) {
      const n = fbm2(x * 0.06 + 40, z * 0.06 - 17, seed + 777, 2)
      if (n > 0.72 && rand() < 0.06) treeMap[z * SX + x] = 1
    }
    for (let x = 0; x < SX; x++) for (let z = 0; z < SZ; z++) {
      const continent = fbm2(x * 0.018, z * 0.018, seed, 4)          // 0..1
      const hills = fbm2(x * 0.07 + 9.2, z * 0.07 + 3.1, seed + 55, 3)
      const mountains = Math.pow(fbm2(x * 0.03 + 100, z * 0.03 + 50, seed + 999, 3), 2)
      let h = Math.floor(8 + continent * 10 + hills * 5 + mountains * 16)
      h = Math.max(2, Math.min(SY - 12, h))
      // snowy peaks
      this.heights[z * SX + x] = h
      const beach = h <= SEA + 1
      for (let y = 0; y <= h; y++) {
        let b
        if (y === h) {
          if (h <= SEA + 1) b = 6 // sand beach / seabed
          else if (h >= 30) b = 12 // snow caps
          else b = 1 // grass
        } else if (y >= h - 3) {
          b = beach ? 6 : 2 // dirt / sand
        } else {
          b = (y % 7 === 0 && (x + z + y) % 9 === 0) ? 11 : 3 // stone w/ cobble veins
        }
        this.data[this.idx(x, y, z)] = b
      }
      // water fill
      for (let y = h + 1; y <= SEA; y++) this.data[this.idx(x, y, z)] = 10
      void rand
    }
    // trees (after terrain so trunks sit on surface)
    const tr = mulberry32(seed * 31 + 7)
    for (let x = 2; x < SX - 2; x++) for (let z = 2; z < SZ - 2; z++) {
      if (!treeMap[z * SX + x]) continue
      const h = this.heights[z * SX + x]
      if (h <= SEA + 1 || h >= 29) continue
      if (this.get(x, h, z) !== 1) continue
      const th = 4 + Math.floor(tr() * 2)
      for (let y = h + 1; y <= h + th; y++) this.set(x, y, z, 4, false)
      for (let dy = th - 2; dy <= th + 1; dy++) {
        const r = dy >= th ? 1 : 2
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (dx === 0 && dz === 0 && dy <= th) continue
          if (Math.abs(dx) === r && Math.abs(dz) === r && tr() < 0.6) continue
          const px = x + dx, py = h + dy, pz = z + dz
          if (this.inBounds(px, py, pz) && this.get(px, py, pz) === 0) this.set(px, py, pz, 5, false)
        }
      }
    }
  }

  // ---- save / load (diffs only) ----
  serializeDiff() {
    return JSON.stringify({ seed: this.seed, diff: [...this.dirty.entries()] })
  }
  applyDiff(json) {
    try {
      const o = JSON.parse(json)
      if (o.seed !== this.seed) return false
      for (const [i, v] of o.diff) this.data[i] = v
      this.dirty = new Map(o.diff)
      return true
    } catch { return false }
  }

  surfaceY(x, z) {
    for (let y = SY - 1; y > 0; y--) {
      const b = this.get(x, y, z)
      if (b !== 0 && b !== 10) return y + 1
    }
    return SEA + 1
  }
}

// ---------- Meshing ----------

const FACES = [
  { dir: [1, 0, 0], shade: 0.8, corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], tile: 1 },  // +x side
  { dir: [-1, 0, 0], shade: 0.8, corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], tile: 1 }, // -x
  { dir: [0, 1, 0], shade: 1.0, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], tile: 0 },  // top
  { dir: [0, -1, 0], shade: 0.55, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], tile: 2 }, // bottom
  { dir: [0, 0, 1], shade: 0.68, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], tile: 1 },  // +z
  { dir: [0, 0, -1], shade: 0.68, corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], tile: 1 }, // -z
]

export function buildChunkGeometry(world, cx, cz, transparent) {
  const pos = [], norm = [], uv = [], col = [], idx = []
  const x0 = cx * CHUNK, z0 = cz * CHUNK
  for (let x = x0; x < x0 + CHUNK; x++) for (let z = z0; z < z0 + CHUNK; z++) for (let y = 0; y < SY; y++) {
    const b = world.get(x, y, z)
    if (b === 0) continue
    const def = BLOCKS[b]
    if (!def) continue
    const isT = !!def.transparent
    if (isT !== transparent) continue
    const [top, side, bottom] = def.tiles
    for (const f of FACES) {
      const nx = x + f.dir[0], ny = y + f.dir[1], nz = z + f.dir[2]
      const nb = world.get(nx, ny, nz)
      const ndef = BLOCKS[nb]
      // culling
      if (transparent) {
        if (b === 10) { // water: hide faces adjacent to water; hide bottom under water-adjacent solid? keep top visible
          if (nb === 10) continue
          if (f.dir[1] === -1 && ndef && !ndef.transparent && nb !== 0) continue
        } else if (b === 8) { // glass: hide face if neighbor is glass
          if (nb === 8) continue
          if (ndef && !ndef.transparent) continue
        }
      } else {
        if (ndef && !ndef.transparent) continue
        // don't draw faces against glass? draw (glass is see-through) — yes draw
      }
      const tile = f.tile === 0 ? top : f.tile === 2 ? bottom : side
      const [u0, v0, u1, v1] = tileUV(tile)
      // water top slightly lower
      const yOff = (b === 10 && f.dir[1] === 1) ? -0.12 : 0
      const base = pos.length / 3
      const quadUV = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
      for (let i = 0; i < 4; i++) {
        const c = f.corners[i]
        pos.push(x + c[0], y + c[1] + (f.dir[1] === 1 || (b === 10 && c[1] === 1) ? yOff : 0), z + c[2])
        norm.push(...f.dir)
        uv.push(quadUV[i][0], quadUV[i][1])
        const s = f.shade
        col.push(s, s, s)
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  if (pos.length === 0) {
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, -100, 0], 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0], 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0], 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1], 3))
    g.setIndex([])
  }
  g.computeBoundingSphere()
  return g
}

// Voxel raycast (Amanatides & Woo DDA). Skips water. Returns {x,y,z,nx,ny,nz,block} or null.
export function raycastVoxel(world, origin, dir, maxDist = 8) {
  let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z)
  const stepX = dir.x > 0 ? 1 : -1, stepY = dir.y > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1
  const tDeltaX = Math.abs(1 / (dir.x || 1e-10))
  const tDeltaY = Math.abs(1 / (dir.y || 1e-10))
  const tDeltaZ = Math.abs(1 / (dir.z || 1e-10))
  let tMaxX = (dir.x !== 0) ? ((stepX > 0 ? x + 1 - origin.x : origin.x - x) * tDeltaX) : Infinity
  let tMaxY = (dir.y !== 0) ? ((stepY > 0 ? y + 1 - origin.y : origin.y - y) * tDeltaY) : Infinity
  let tMaxZ = (dir.z !== 0) ? ((stepZ > 0 ? z + 1 - origin.z : origin.z - z) * tDeltaZ) : Infinity
  let nx = 0, ny = 0, nz = 0, t = 0
  for (let i = 0; i < 256; i++) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0 }
    else if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0 }
    else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ }
    if (t > maxDist) return null
    if (!world.inBounds(x, y, z)) continue
    const b = world.get(x, y, z)
    if (b !== 0 && b !== 10) return { x, y, z, nx, ny, nz, block: b }
  }
  return null
}
