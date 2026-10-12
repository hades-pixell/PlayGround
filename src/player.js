// First-person player controller with AABB voxel collision.
import * as THREE from 'three'
import { SX, SZ } from './world.js'

const P_W = 0.3, P_H = 1.8, EYE = 1.62

export class Player {
  constructor(camera, world) {
    this.camera = camera
    this.world = world
    this.pos = new THREE.Vector3(48.5, 30, 48.5) // feet
    this.vel = new THREE.Vector3()
    this.yaw = Math.PI * 0.25
    this.pitch = -0.1
    this.onGround = false
    this.fly = false
    this.keys = {}
    this.sprint = false
  }

  spawn() {
    const cx = Math.floor(SX / 2), cz = Math.floor(SZ / 2)
    const y = this.world.surfaceY(cx, cz) + 1
    this.pos.set(cx + 0.5, y, cz + 0.5)
    this.vel.set(0, 0, 0)
  }

  get eye() { return new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z) }

  updateCamera() {
    this.camera.position.copy(this.eye)
    this.camera.rotation.set(0, 0, 0)
    this.camera.rotation.order = 'YXZ'
    this.camera.rotation.y = this.yaw
    this.camera.rotation.x = this.pitch
  }

  collides(px, py, pz) {
    const w = this.world
    const x0 = Math.floor(px - P_W), x1 = Math.floor(px + P_W)
    const y0 = Math.floor(py), y1 = Math.floor(py + P_H - 0.01)
    const z0 = Math.floor(pz - P_W), z1 = Math.floor(pz + P_W)
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const b = w.get(x, y, z)
      if (b !== 0 && b !== 10) return true
    }
    return false
  }

  moveAxis(axis, amount) {
    if (amount === 0) return
    const p = this.pos
    if (axis === 0) p.x += amount
    else if (axis === 1) p.y += amount
    else p.z += amount
    if (this.collides(p.x, p.y, p.z)) {
      if (axis === 0) {
        p.x = amount > 0 ? Math.floor(p.x + P_W) - P_W - 0.001 : Math.floor(p.x - P_W) + 1 + P_W + 0.001
      } else if (axis === 1) {
        if (amount < 0) { p.y = Math.floor(p.y) + 1 + 0.001; this.onGround = true }
        else { p.y = Math.floor(p.y + P_H) - P_H - 0.001 }
        this.vel.y = 0
      } else {
        p.z = amount > 0 ? Math.floor(p.z + P_W) - P_W - 0.001 : Math.floor(p.z - P_W) + 1 + P_W + 0.001
      }
    }
  }

  update(dt) {
    dt = Math.min(dt, 0.05)
    const k = this.keys
    this.sprint = !!k['ShiftLeft'] || !!k['ShiftRight']
    const speed = this.fly ? 12 : this.sprint ? 7.5 : 5.2

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw)
    let fwd = 0, str = 0
    if (k['KeyW'] || k['ArrowUp']) fwd += 1
    if (k['KeyS'] || k['ArrowDown']) fwd -= 1
    if (k['KeyA'] || k['ArrowLeft']) str -= 1
    if (k['KeyD'] || k['ArrowRight']) str += 1
    const len = Math.hypot(fwd, str) || 1
    fwd /= len; str /= len
    const moveX = (-sin * fwd + cos * str) * speed * dt
    const moveZ = (-cos * fwd - sin * str) * speed * dt

    this.onGround = false
    if (this.fly) {
      let my = 0
      if (k['Space']) my += 1
      if (k['ShiftLeft'] || k['ShiftRight'] || k['KeyC'] || k['ControlLeft']) my -= 1
      this.moveAxis(0, moveX)
      this.moveAxis(2, moveZ)
      this.moveAxis(1, my * speed * dt)
      this.vel.set(0, 0, 0)
    } else {
      this.moveAxis(0, moveX)
      this.moveAxis(2, moveZ)
      // gravity + jump
      this.vel.y -= 28 * dt
      if (this.vel.y < -40) this.vel.y = -40
      if (k['Space'] && this.onGroundTest()) this.vel.y = 9.2
      // water buoyancy
      if (this.inWater()) { this.vel.y -= -28 * dt; this.vel.y += 34 * dt * 0.9; if (k['Space']) this.vel.y = 4.5; this.vel.y *= (1 - 1.8 * dt) }
      this.moveAxis(1, this.vel.y * dt)
      // fell out of world safety
      if (this.pos.y < -10) this.spawn()
    }
    this.updateCamera()
  }

  onGroundTest() {
    const p = this.pos
    return this.collides(p.x, p.y - 0.05, p.z)
  }

  inWater() {
    const w = this.world
    const b = w.get(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.5), Math.floor(this.pos.z))
    const b2 = w.get(Math.floor(this.pos.x), Math.floor(this.pos.y + EYE), Math.floor(this.pos.z))
    return b === 10 || b2 === 10
  }

  intersectsBlock(bx, by, bz) {
    const p = this.pos
    return bx + 1 > p.x - P_W && bx < p.x + P_W && by + 1 > p.y && by < p.y + P_H && bz + 1 > p.z - P_W && bz < p.z + P_W
  }
}
