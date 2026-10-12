// Procedural pixel-art texture atlas. No external assets.
import * as THREE from 'three'
import { mulberry32 } from './noise.js'

export const TILE = 16          // px per tile
export const ATLAS_COLS = 8
export const ATLAS_ROWS = 8

// tile indices
export const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3,
  LOG_SIDE: 4, LOG_TOP: 5, LEAVES: 6, SAND: 7,
  PLANKS: 8, GLASS: 9, BRICK: 10, WATER: 11,
  COBBLE: 12, SNOW: 13, BEDROCK: 14, FLOWER: 15,
}

function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1) }

function noisyFill(ctx, ox, oy, base, vary, rand, n = TILE * TILE) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rand() * TILE), y = Math.floor(rand() * TILE)
    px(ctx, ox + x, oy + y, vary[Math.floor(rand() * vary.length)])
  }
  void base
}

function tileOrigin(i) {
  return [(i % ATLAS_COLS) * TILE, Math.floor(i / ATLAS_COLS) * TILE]
}

function paintTile(ctx, idx, painter) {
  const [ox, oy] = tileOrigin(idx)
  painter(ox, oy)
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, Math.max(0, (n >> 16) + amt))
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amt))
  const b = Math.min(255, Math.max(0, (n & 255) + amt))
  return `rgb(${r},${g},${b})`
}

export function buildAtlas() {
  const size = ATLAS_COLS * TILE
  const cv = document.createElement('canvas')
  cv.width = size; cv.height = size
  const ctx = cv.getContext('2d')
  ctx.imageSmoothingEnabled = false
  // transparent bg
  ctx.clearRect(0, 0, size, size)
  const R = mulberry32(9241)

  const fill = (ox, oy, c) => { ctx.fillStyle = c; ctx.fillRect(ox, oy, TILE, TILE) }

  // GRASS TOP — greens
  paintTile(ctx, T.GRASS_TOP, (ox, oy) => {
    fill(ox, oy, '#5fae3f')
    noisyFill(ctx, ox, oy, null, ['#54a237', '#6cbf4a', '#4c962f', '#79c955'], R)
  })
  // DIRT
  const dirt = (ox, oy) => {
    fill(ox, oy, '#8a5a32')
    noisyFill(ctx, ox, oy, null, ['#7a4e2a', '#9a6a3e', '#6e4526', '#a37648'], R)
  }
  paintTile(ctx, T.DIRT, dirt)
  // GRASS SIDE — dirt + green cap
  paintTile(ctx, T.GRASS_SIDE, (ox, oy) => {
    dirt(ox, oy)
    ctx.fillStyle = '#5fae3f'; ctx.fillRect(ox, oy, TILE, 3)
    ctx.fillStyle = '#54a237'
    for (let x = 0; x < TILE; x++) ctx.fillRect(ox + x, oy + 3 + (x * 7 % 3), 1, 1 + (x * 5 % 2))
    noisyFill(ctx, ox, oy, null, ['#6cbf4a', '#4c962f'], R, 30)
  })
  // STONE
  paintTile(ctx, T.STONE, (ox, oy) => {
    fill(ox, oy, '#8d8d8d')
    noisyFill(ctx, ox, oy, null, ['#7f7f7f', '#9a9a9a', '#747474', '#a5a5a5'], R)
  })
  // LOG SIDE — bark stripes
  paintTile(ctx, T.LOG_SIDE, (ox, oy) => {
    fill(ox, oy, '#6b4a2a')
    for (let x = 0; x < TILE; x += 2) {
      ctx.fillStyle = x % 4 === 0 ? '#5a3c22' : '#7a5633'
      ctx.fillRect(ox + x, oy, 1, TILE)
    }
    noisyFill(ctx, ox, oy, null, ['#4e3319', '#86603a'], R, 60)
  })
  // LOG TOP — rings
  paintTile(ctx, T.LOG_TOP, (ox, oy) => {
    fill(ox, oy, '#6b4a2a')
    ctx.fillStyle = '#c8a86a'; ctx.fillRect(ox + 1, oy + 1, TILE - 2, TILE - 2)
    ctx.fillStyle = '#a37f4b'
    for (let r = 6; r > 0; r -= 2) ctx.strokeStyle = '#a37f4b', ctx.strokeRect(ox + 8 - r, oy + 8 - r, r * 2, r * 2)
  })
  // LEAVES
  paintTile(ctx, T.LEAVES, (ox, oy) => {
    fill(ox, oy, '#2f7a26')
    noisyFill(ctx, ox, oy, null, ['#256b1e', '#3a9130', '#1e5c18', '#46a53a'], R, 220)
  })
  // SAND
  paintTile(ctx, T.SAND, (ox, oy) => {
    fill(ox, oy, '#e3d9a3')
    noisyFill(ctx, ox, oy, null, ['#d6c98f', '#efe5b5', '#c9bd82'], R)
  })
  // PLANKS
  paintTile(ctx, T.PLANKS, (ox, oy) => {
    fill(ox, oy, '#b08a4f')
    ctx.fillStyle = '#8a683a'
    for (let y = 3; y < TILE; y += 4) ctx.fillRect(ox, oy + y, TILE, 1)
    for (let y = 0; y < TILE; y += 4) ctx.fillRect(ox + ((y * 5 + 3) % TILE), oy + y, 1, 4)
    noisyFill(ctx, ox, oy, null, ['#a37f47', '#bd9558'], R, 50)
  })
  // GLASS — mostly transparent, frame + shine
  paintTile(ctx, T.GLASS, (ox, oy) => {
    ctx.clearRect(ox, oy, TILE, TILE)
    ctx.fillStyle = 'rgba(220,240,255,0.28)'; ctx.fillRect(ox, oy, TILE, TILE)
    ctx.fillStyle = '#e8f4ff'
    ctx.fillRect(ox, oy, TILE, 1); ctx.fillRect(ox, oy + TILE - 1, TILE, 1)
    ctx.fillRect(ox, oy, 1, TILE); ctx.fillRect(ox + TILE - 1, oy, 1, TILE)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    for (let i = 0; i < 5; i++) px(ctx, ox + 3 + i, oy + 10 - i, 'rgba(255,255,255,0.85)')
  })
  // BRICK
  paintTile(ctx, T.BRICK, (ox, oy) => {
    fill(ox, oy, '#9d4b3c')
    ctx.fillStyle = '#c9c0b4'
    for (let y = 3; y < TILE; y += 4) ctx.fillRect(ox, oy + y, TILE, 1)
    for (let row = 0; row < 4; row++) {
      const off = row % 2 === 0 ? 4 : 0
      for (let x = off; x < TILE; x += 8) ctx.fillRect(ox + x, oy + row * 4, 1, 4)
    }
    noisyFill(ctx, ox, oy, null, ['#8d4234', '#ad5746'], R, 50)
  })
  // WATER
  paintTile(ctx, T.WATER, (ox, oy) => {
    fill(ox, oy, '#3b6fd4')
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    for (let i = 0; i < 3; i++) ctx.fillRect(ox + (i * 5 + 1), oy + 2 + i * 4, 8, 1)
    noisyFill(ctx, ox, oy, null, ['#3565c2', '#447ce0'], R, 60)
  })
  // COBBLE
  paintTile(ctx, T.COBBLE, (ox, oy) => {
    fill(ox, oy, '#777')
    ctx.fillStyle = '#555'
    ctx.fillRect(ox, oy + 5, TILE, 1); ctx.fillRect(ox, oy + 11, TILE, 1)
    ctx.fillRect(ox + 5, oy, 1, 6); ctx.fillRect(ox + 10, oy + 6, 1, 5); ctx.fillRect(ox + 3, oy + 11, 1, 5)
    noisyFill(ctx, ox, oy, null, ['#6a6a6a', '#858585'], R, 60)
  })
  // SNOW
  paintTile(ctx, T.SNOW, (ox, oy) => {
    fill(ox, oy, '#f2f7f7')
    noisyFill(ctx, ox, oy, null, ['#e2ecec', '#ffffff', '#d3e0e0'], R)
  })
  // BEDROCK
  paintTile(ctx, T.BEDROCK, (ox, oy) => {
    fill(ox, oy, '#3a3a3a')
    noisyFill(ctx, ox, oy, null, ['#222', '#555', '#111'], R, 200)
  })
  void shade

  const tex = new THREE.CanvasTexture(cv)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestMipmapLinearFilter
  tex.colorSpace = THREE.SRGBColorSpace
  tex.generateMipmaps = true
  return { canvas: cv, texture: tex }
}

// block id -> { name, tiles: [top, side, bottom] or all, transparent?, opaque? }
export const BLOCKS = {
  0: null,
  1: { name: 'Grass', tiles: [T.GRASS_TOP, T.GRASS_SIDE, T.DIRT] },
  2: { name: 'Dirt', tiles: [T.DIRT, T.DIRT, T.DIRT] },
  3: { name: 'Stone', tiles: [T.STONE, T.STONE, T.STONE] },
  4: { name: 'Wood', tiles: [T.LOG_TOP, T.LOG_SIDE, T.LOG_TOP] },
  5: { name: 'Leaves', tiles: [T.LEAVES, T.LEAVES, T.LEAVES] },
  6: { name: 'Sand', tiles: [T.SAND, T.SAND, T.SAND] },
  7: { name: 'Planks', tiles: [T.PLANKS, T.PLANKS, T.PLANKS] },
  8: { name: 'Glass', tiles: [T.GLASS, T.GLASS, T.GLASS], transparent: true },
  9: { name: 'Brick', tiles: [T.BRICK, T.BRICK, T.BRICK] },
  10: { name: 'Water', tiles: [T.WATER, T.WATER, T.WATER], transparent: true, liquid: true },
  11: { name: 'Cobble', tiles: [T.COBBLE, T.COBBLE, T.COBBLE] },
  12: { name: 'Snow', tiles: [T.SNOW, T.SNOW, T.SNOW] },
}

export const HOTBAR = [1, 2, 3, 4, 5, 6, 7, 8, 9]

export function tileUV(tile) {
  const c = tile % ATLAS_COLS, r = Math.floor(tile / ATLAS_COLS)
  const s = 1 / ATLAS_COLS
  // small inset to avoid bleeding
  const pad = 0.5 / (ATLAS_COLS * TILE)
  return [c * s + pad, 1 - (r + 1) * s + pad, (c + 1) * s - pad, 1 - r * s - pad]
}

// Render a 2D block icon for hotbar
export function blockIcon(blockId, size = 48) {
  const b = BLOCKS[blockId]
  const cv = document.createElement('canvas')
  cv.width = size; cv.height = size
  if (!b) return cv
  const ctx = cv.getContext('2d')
  ctx.imageSmoothingEnabled = false
  const atlas = blockIcon.atlas
  const drawTile = (tile, dx, dy, dw, dh) => {
    const [ox, oy] = tileOrigin(tile)
    ctx.drawImage(atlas, ox, oy, TILE, TILE, dx, dy, dw, dh)
  }
  // isometric-ish: top face + two sides
  const s = size
  ctx.clearRect(0, 0, s, s)
  ctx.save()
  // top (diamond)
  ctx.beginPath()
  ctx.moveTo(s / 2, s * 0.06); ctx.lineTo(s * 0.94, s * 0.30); ctx.lineTo(s / 2, s * 0.54); ctx.lineTo(s * 0.06, s * 0.30)
  ctx.closePath(); ctx.clip()
  const [tox, toy] = tileOrigin(b.tiles[0])
  ctx.drawImage(atlas, tox, toy, TILE, TILE, 0, 0, s, s * 0.6)
  ctx.restore()
  // left
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(s * 0.06, s * 0.30); ctx.lineTo(s / 2, s * 0.54); ctx.lineTo(s / 2, s * 0.96); ctx.lineTo(s * 0.06, s * 0.72)
  ctx.closePath(); ctx.clip()
  const [lox, loy] = tileOrigin(b.tiles[1])
  ctx.drawImage(atlas, lox, loy, TILE, TILE, 0, s * 0.28, s, s * 0.72)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, s, s)
  ctx.restore()
  // right
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(s * 0.94, s * 0.30); ctx.lineTo(s / 2, s * 0.54); ctx.lineTo(s / 2, s * 0.96); ctx.lineTo(s * 0.94, s * 0.72)
  ctx.closePath(); ctx.clip()
  const [rox, roy] = tileOrigin(b.tiles[1])
  ctx.drawImage(atlas, rox, roy, TILE, TILE, 0, s * 0.28, s, s * 0.72)
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, 0, s, s)
  ctx.restore()
  void drawTile
  return cv
}
