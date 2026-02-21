import * as THREE from 'three'
import { XianNode }    from './xian.js'
import { HexGrid }     from './grid.js'
import { SignalNodes, NODE_DEFS } from './nodes.js'

// ─── Scene ──────────────────────────────────────────────────
export class Scene {
  constructor(canvas, onNodeTap) {
    this.canvas = canvas

    // Three.js core
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x0a0a0f, 1)
    this.renderer.setSize(window.innerWidth, window.innerHeight)

    this.scene  = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100)
    this.camera.position.set(0, 5, 8)
    this.camera.lookAt(0, 0.5, 0)

    // Fog for depth
    this.scene.fog = new THREE.FogExp2(0x0a0a0f, 0.055)

    // Ambient light
    const ambient = new THREE.AmbientLight(0x101828, 1.5)
    this.scene.add(ambient)

    // Layer objects
    this.grid  = new HexGrid()
    this.scene.add(this.grid.group)

    this.xian  = new XianNode()
    this.xian.group.position.set(0, 0.8, 0)
    this.scene.add(this.xian.group)

    this.signalNodes = new SignalNodes(this.scene, onNodeTap)

    // Camera orbit state
    this._orbitTarget   = new THREE.Vector3(0, 0.5, 0)
    this._orbitAngleH   = 0.4    // horizontal angle (radians)
    this._orbitAngleV   = 0.58   // vertical angle
    this._orbitRadius   = 9
    this._orbitGoalH    = this._orbitAngleH
    this._orbitGoalV    = this._orbitAngleV
    this._dragStart     = null
    this._autoOrbit     = true

    this._setupInput()
    this._onResize = this._handleResize.bind(this)
    window.addEventListener('resize', this._onResize)
  }

  // ── Input ─────────────────────────────────────────────────

  _setupInput() {
    const c = this.canvas
    // Touch
    c.addEventListener('touchstart', e => this._onDragStart(e.touches[0]), { passive: true })
    c.addEventListener('touchmove',  e => { e.preventDefault(); this._onDragMove(e.touches[0]) }, { passive: false })
    c.addEventListener('touchend',   e => { this._onDragEnd(e.changedTouches[0]) })
    // Mouse
    c.addEventListener('mousedown',  e => this._onDragStart(e))
    c.addEventListener('mousemove',  e => this._onDragMove(e))
    c.addEventListener('mouseup',    e => this._onDragEnd(e))
    // Tap / click for node selection
    c.addEventListener('click',      e => this._onTap(e))
    c.addEventListener('touchend',   e => this._onTap(e.changedTouches[0]), { passive: true })
  }

  _onDragStart(pt) {
    this._dragStart   = { x: pt.clientX, y: pt.clientY,
                          h: this._orbitAngleH, v: this._orbitAngleV }
    this._autoOrbit   = false
    this._dragMoved   = false
  }

  _onDragMove(pt) {
    if (!this._dragStart) return
    const dx = pt.clientX - this._dragStart.x
    const dy = pt.clientY - this._dragStart.y
    if (Math.abs(dx) + Math.abs(dy) > 4) this._dragMoved = true
    this._orbitGoalH = this._dragStart.h - dx * 0.006
    this._orbitGoalV = Math.max(0.15, Math.min(1.2,
                         this._dragStart.v + dy * 0.004))
  }

  _onDragEnd() {
    this._dragStart = null
    // Resume auto-orbit after 4 s
    setTimeout(() => { this._autoOrbit = true }, 4000)
  }

  _onTap(pt) {
    if (this._dragMoved) { this._dragMoved = false; return }
    this.signalNodes.handlePointer(pt, this.camera, this.canvas)
  }

  // ── Resize ────────────────────────────────────────────────

  _handleResize() {
    const w = window.innerWidth, h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  // ── Camera orbit ──────────────────────────────────────────

  _updateCamera(t) {
    if (this._autoOrbit) {
      this._orbitGoalH = 0.4 + Math.sin(t * 0.07) * 0.35
      this._orbitGoalV = 0.55 + Math.sin(t * 0.04) * 0.05
    }
    // Smooth lerp
    this._orbitAngleH += (this._orbitGoalH - this._orbitAngleH) * 0.04
    this._orbitAngleV += (this._orbitGoalV - this._orbitAngleV) * 0.04

    const r = this._orbitRadius
    this.camera.position.set(
      Math.cos(this._orbitAngleH) * r * Math.cos(this._orbitAngleV),
      r * Math.sin(this._orbitAngleV),
      Math.sin(this._orbitAngleH) * r * Math.cos(this._orbitAngleV),
    )
    this.camera.lookAt(this._orbitTarget)
  }

  // ── Move 弦 to a node position ────────────────────────────

  moveXianTo(nodeId, callback) {
    const def = NODE_DEFS.find(d => d.id === nodeId)
    if (!def) return
    const targetPos = def.pos.clone().add(new THREE.Vector3(0, 0.8, 0))
    this.xian.teleportTo(targetPos, callback)
    this.signalNodes.setActiveNode(nodeId)
  }

  // ── Main render loop ──────────────────────────────────────

  render(t) {
    this._updateCamera(t)
    this.grid.update(t)
    this.xian.update(t)
    this.signalNodes.update(t)
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    window.removeEventListener('resize', this._onResize)
    this.renderer.dispose()
  }
}
