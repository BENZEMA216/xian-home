import * as THREE from 'three'
import { EffectComposer }  from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass }      from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { XianNode }    from './xian.js'
import { HexGrid }     from './grid.js'
import { SignalNodes, NODE_DEFS } from './nodes.js'

// ─── Scene ──────────────────────────────────────────────────
export class Scene {
  constructor(canvas, onNodeTap) {
    this.canvas = canvas

    // Three.js core — opaque for correct UnrealBloom
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x060410, 1)
    this.renderer.setSize(window.innerWidth, window.innerHeight)

    this.scene  = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100)
    this.camera.position.set(0, 5, 8)
    this.camera.lookAt(0, 0.5, 0)

    // Fog for depth
    this.scene.fog = new THREE.FogExp2(0x060410, 0.038)

    // Ambient light
    const ambient = new THREE.AmbientLight(0x101828, 1.5)
    this.scene.add(ambient)

    // Layer objects
    this.grid  = new HexGrid()
    this.grid.setActivePosition(new THREE.Vector3(0, 0, 0))
    this.scene.add(this.grid.group)

    this.xian  = new XianNode()
    this.xian.group.position.set(0, 1.6, 0)
    this.xian.group.scale.setScalar(1.9)
    this.scene.add(this.xian.group)

    this.signalNodes = new SignalNodes(this.scene, onNodeTap)

    this._buildNebula()
    this._buildParticles()
    this._buildNetworkLines()

    // ── Post-processing: UnrealBloom ──────────────────────────
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      /*strength*/  1.72,
      /*radius*/    0.40,
      /*threshold*/ 0.13,
    )
    this.composer.addPass(this.bloomPass)

    // Camera orbit state
    this._orbitTarget   = new THREE.Vector3(0, 1.7, 0)
    this._orbitAngleH   = 1.5708    // horizontal angle (radians)
    this._orbitAngleV   = 0.52   // ~30° elevation — shows 3D depth
    this._orbitRadius   = 8.5
    this._orbitGoalH    = 1.5708
    this._orbitGoalV    = this._orbitAngleV
    this._dragStart     = null
    this._autoOrbit     = true

    this._setupInput()
    this._onResize = this._handleResize.bind(this)
    window.addEventListener('resize', this._onResize)
    // Apply mobile settings immediately on init
    this._handleResize()
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
    // Hover for cursor + ring highlight
    c.addEventListener('mousemove',  e => this.signalNodes?.handleHover(e, this.camera, c))
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

    // Portrait mobile: narrower viewport — scale wave to fit
    // Landscape mobile (w > h, small h): treat like desktop — wave already fits horizontally
    const isPortraitMobile = w < 600 && h > w
    this.camera.fov = isPortraitMobile ? 80 : 55
    this._orbitRadius = isPortraitMobile ? 7.0 : 8.5
    const isLandscapeMobile = h < 520 && w > h

    if (isPortraitMobile) {
      // Portrait phone: narrow wave to fit ~37° horizontal FOV
      const narrowScale = 0.54
      this.xian?.group.scale.set(narrowScale, 1.0, narrowScale)
      this.xian?.group.position.setY(1.6)
      this._orbitRadius = 5.0
      this._orbitTarget.set(0, 2.35, 0)
      this._orbitGoalV = 0.22
      this._orbitGoalH = Math.PI / 2
      this._orbitAngleH = Math.PI / 2
    } else if (isLandscapeMobile) {
      // Landscape phone: full wave scale, pull camera close so wave fills frame
      this.xian?.group.scale.set(1.0, 1.0, 1.0)
      this.xian?.group.position.setY(1.6)
      this._orbitRadius = 3.0    // close → wave fills ~80% of wide viewport
      this._orbitTarget.set(0, 2.1, 0)
      this._orbitGoalV = 0.28
    } else { // desktop
      this.xian?.group.scale.set(1.0, 1.0, 1.0)
      this.xian?.group.position.setY(1.6)
      this._orbitRadius = 8.5
      this._orbitTarget.set(0, 1.7, 0)
      this._orbitGoalV = 0.52
    }

    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
    this.bloomPass.resolution.set(w, h)
  }

  // ── Camera orbit ──────────────────────────────────────────

  _updateCamera(t) {
    const isMobile = window.innerWidth < 600 && window.innerHeight > window.innerWidth
    if (this._autoOrbit && !isMobile) {
      // Desktop: wider azimuth drift to reveal Z-depth of 3D string
      // Figure-8-ish path: slow vertical + faster azimuth
      this._orbitGoalH = 1.5708 + Math.sin(t * 0.11) * 0.68
      this._orbitGoalV = 0.52 + Math.sin(t * 0.035) * 0.16
    } else if (this._autoOrbit && isMobile) {
      // Mobile: lock to perpendicular — prevents wave from clipping screen edges
      this._orbitGoalH = Math.PI / 2
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

  // ── Background nebula ────────────────────────────────────
  // Soft glow sprites far behind the scene — add atmospheric depth
  // without competing with the main wave.

  _buildNebula() {
    const clouds = [
      // [x, y, z,  scale,  r,   g,  b,  peakAlpha, rotation]
      [ -7,  3, -14, 11.0,  55,  10, 140, 0.30,  0.4  ],  // deep purple, left
      [  6,  1, -11,  9.0,   0,  80, 110, 0.22,  -0.6 ],  // teal, right
      [  0,  6, -18, 14.0,  30,   5,  80, 0.20,   0.0 ],  // indigo, top-center
      [ -3, -1,  -9,  6.5,   0, 100, 160, 0.16,   1.0 ],  // cyan accent, lower-left
      [  4,  4, -16,  8.0,  70,  20, 120, 0.14,  -0.3 ],  // violet, upper-right
    ]

    for (const [x, y, z, scale, r, g, b, peak, rot] of clouds) {
      const size = 256
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const ctx = canvas.getContext('2d')

      ctx.save()
      ctx.translate(size / 2, size / 2)
      ctx.rotate(rot)
      ctx.scale(1, 0.55)   // squash to ellipse

      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size / 2)
      grad.addColorStop(0.00, `rgba(${r},${g},${b},${peak})`)
      grad.addColorStop(0.30, `rgba(${r},${g},${b},${(peak * 0.55).toFixed(3)})`)
      grad.addColorStop(0.65, `rgba(${r},${g},${b},${(peak * 0.18).toFixed(3)})`)
      grad.addColorStop(1.00, `rgba(${r},${g},${b},0)`)
      ctx.fillStyle = grad
      ctx.fillRect(-size / 2, -size / 2, size, size)
      ctx.restore()

      const mat = new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const sprite = new THREE.Sprite(mat)
      sprite.position.set(x, y, z)
      sprite.scale.setScalar(scale)
      this.scene.add(sprite)
    }
  }

  // ── Ambient particles ─────────────────────────────────────

  _buildParticles() {
    const COUNT = 280
    const positions = new Float32Array(COUNT * 3)
    this._particleData = []

    for (let i = 0; i < COUNT; i++) {
      const x = (Math.random() - 0.5) * 22
      const y = Math.random() * 7 - 1.0
      const z = (Math.random() - 0.5) * 22
      positions[i * 3 + 0] = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z
      this._particleData.push({ x, baseY: y, z, speed: 0.08 + Math.random() * 0.14, phase: Math.random() * Math.PI * 2 })
    }

    // Circular sprite texture so particles render as dots, not squares
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 32
    const ctx = canvas.getContext('2d')
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.4, 'rgba(0,212,255,0.8)')
    grad.addColorStop(1, 'rgba(0,212,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 32, 32)
    const tex = new THREE.CanvasTexture(canvas)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.PointsMaterial({
      map: tex, size: 0.10, transparent: true, opacity: 0.28,
      sizeAttenuation: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this._particles = new THREE.Points(geo, mat)
    this._particlePositions = positions
    this.scene.add(this._particles)
  }

  _updateParticles(t) {
    for (let i = 0; i < this._particleData.length; i++) {
      const p = this._particleData[i]
      // Drift upward, wrap around
      let y = p.baseY + (t * p.speed) % 5.5
      if (y > 5) y -= 5.5
      this._particlePositions[i * 3 + 1] = y + Math.sin(t * 0.5 + p.phase) * 0.12
      this._particlePositions[i * 3 + 0] = p.x + Math.sin(t * 0.3 + p.phase) * 0.08
    }
    this._particles.geometry.attributes.position.needsUpdate = true
  }

  // ── Network connection lines + signal packets ────────────

  _buildNetworkLines() {
    // Sparse center connections + peripheral ring connections
    const pairs = [
      ['idle', 'chatting'],   // center → dialog
      ['idle', 'working'],    // center → processing
      ['idle', 'window'],     // center → perception (far, elevated)
      ['chatting', 'reading'],  // dialog ↔ retrieval (right arc)
      ['working', 'storage'],   // processing ↔ memory (left arc)
      ['chatting', 'working'],  // dialog ↔ processing (front arc)
      ['reading', 'storage'],   // retrieval ↔ memory (back arc)
    ]

    this._curves = []  // store for signal packet animation

    for (const [a, b] of pairs) {
      const nodeA = NODE_DEFS.find(d => d.id === a)
      const nodeB = NODE_DEFS.find(d => d.id === b)
      if (!nodeA || !nodeB) continue

      const pa = nodeA.pos, pb = nodeB.pos
      // Arc height proportional to distance — longer connections arc higher
      const dist = pa.distanceTo(pb)
      const mid = pa.clone().add(pb).multiplyScalar(0.5)
      mid.y += 0.5 + dist * 0.22

      const curve = new THREE.CatmullRomCurve3([
        pa.clone().add(new THREE.Vector3(0, 0.1, 0)),
        mid,
        pb.clone().add(new THREE.Vector3(0, 0.1, 0)),
      ])

      // Store curve with color for signal packets
      const color = nodeA.id === 'idle' ? nodeB.color : nodeA.color
      this._curves.push({ curve, color })

      // Tube geometry — colored by the non-idle endpoint
      const tubeGeo = new THREE.TubeGeometry(curve, 30, 0.016, 5, false)
      const tubeMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.0,
      })
      this.scene.add(new THREE.Mesh(tubeGeo, tubeMat))
    }

    this._buildSignalPackets()
  }

  _buildSignalPackets() {
    // Build glow sprite texture (reused)
    const sc = document.createElement('canvas')
    sc.width = sc.height = 64
    const sctx = sc.getContext('2d')
    const sg = sctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    sg.addColorStop(0,    'rgba(255,255,255,1)')
    sg.addColorStop(0.25, 'rgba(255,255,255,0.8)')
    sg.addColorStop(0.6,  'rgba(255,255,255,0.2)')
    sg.addColorStop(1,    'rgba(255,255,255,0)')
    sctx.fillStyle = sg
    sctx.fillRect(0, 0, 64, 64)
    const glowTex = new THREE.CanvasTexture(sc)

    // 14 signal packets traveling along connections
    const packetGeo = new THREE.SphereGeometry(0.11, 8, 8)
    this._packets = []

    for (let i = 0; i < 14; i++) {
      const curveIdx = i % this._curves.length
      const { color } = this._curves[curveIdx]

      // Core sphere
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true })
      const mesh = new THREE.Mesh(packetGeo, mat)

      // Glow halo sprite (color-tinted)
      const r = (color >> 16) & 0xff
      const g = (color >>  8) & 0xff
      const b =  color        & 0xff
      const glowMat = new THREE.SpriteMaterial({
        map: glowTex,
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.95,
      })
      const glow = new THREE.Sprite(glowMat)
      glow.scale.setScalar(1.1)
      mesh.add(glow)

      this.scene.add(mesh)
      this._packets.push({
        mesh,
        curveIdx,
        progress: i / 14,
        speed: 0.28 + Math.random() * 0.18,
      })
    }
  }

  _updateSignalPackets(t) {
    for (const pkt of this._packets) {
      pkt.progress += pkt.speed * 0.016  // ~60fps delta
      if (pkt.progress > 1) {
        // Pick a new random curve
        pkt.progress = 0
        pkt.curveIdx = Math.floor(Math.random() * this._curves.length)
        const { color } = this._curves[pkt.curveIdx]
        pkt.mesh.material.color.setHex(color)
      }

      const pos = this._curves[pkt.curveIdx].curve.getPoint(pkt.progress)
      pkt.mesh.position.copy(pos)

      // Pulse opacity
      pkt.mesh.material.opacity = 0.0
      pkt.mesh.children[0].material.opacity = 0.0   // kill glow sprite too
    }
  }

  // ── Move 弦 to a node position ────────────────────────────

  moveXianTo(nodeId, callback) {
    const def = NODE_DEFS.find(d => d.id === nodeId)
    if (!def) return
    const targetPos = def.pos.clone().add(new THREE.Vector3(0, 0.8, 0))
    this.xian.teleportTo(targetPos, callback)
    this.signalNodes.setActiveNode(nodeId)
    this.grid.setActivePosition(def.pos)  // light up hex grid near 弦
  }

  // ── Main render loop ──────────────────────────────────────

  render(t) {
    this._updateCamera(t)
    this.grid.update(t)
    this.xian.update(t)
    this.signalNodes.update(t)
    this._updateParticles(t)
    this._updateSignalPackets(t)
    this.composer.render()
  }

  dispose() {
    window.removeEventListener('resize', this._onResize)
    this.renderer.dispose()
  }
}
