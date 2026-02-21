import * as THREE from 'three'

// ─── Color palette ─────────────────────────────────────────
const C = {
  cyan:   0x00d4ff,
  purple: 0xb14eff,
  amber:  0xffbb00,
  green:  0x4aff88,
  white:  0xffffff,
}

// ─── 弦 Avatar ─────────────────────────────────────────────
// A vibrating string in signal space.
// States map to harmonics of a standing wave.
export class XianNode {
  constructor() {
    this.group = new THREE.Group()
    this.state = 'idle'
    this.beads = []
    this._beadGeo = new THREE.SphereGeometry(1, 8, 8)

    this._buildString()
    this._buildCore()
    this._buildRings()
    this._buildStatusRing()
    this._buildPointLight()
  }

  // ── Construction ──────────────────────────────────────────

  _buildString() {
    const N = 60
    const L = 4.0
    this._waveN = N
    this._waveL = L

    // Pre-allocate 60 Vector3 for the wave shape
    this._wavePoints = []
    for (let i = 0; i < N; i++) {
      this._wavePoints.push(new THREE.Vector3((i / (N - 1)) * L - L / 2, 0, 0))
    }

    // ── Layered spine: bright core + soft glow tube ─────────
    // Core: thin bright white wire
    this._tubeMat = new THREE.MeshBasicMaterial({
      color: C.white, transparent: true, opacity: 0.95,
    })
    const initCurve = new THREE.CatmullRomCurve3(this._wavePoints.map(v => v.clone()))
    this.spineTube = new THREE.Mesh(
      new THREE.TubeGeometry(initCurve, N, 0.009, 6, false),
      this._tubeMat,
    )
    this.group.add(this.spineTube)

    // Glow tube: wider, cyan, semi-transparent — creates neon falloff without bloom
    this._glowTubeMat = new THREE.MeshBasicMaterial({
      color: C.cyan, transparent: true, opacity: 0.18,
      side: THREE.BackSide,   // render inside → no z-fighting with core
    })
    this.glowTube = new THREE.Mesh(
      new THREE.TubeGeometry(initCurve, N, 0.035, 8, false),
      this._glowTubeMat,
    )
    this.group.add(this.glowTube)

    // Outer haze: even wider, very soft
    this._hazeTubeMat = new THREE.MeshBasicMaterial({
      color: C.cyan, transparent: true, opacity: 0.08,
      side: THREE.BackSide,
    })
    this.hazeTube = new THREE.Mesh(
      new THREE.TubeGeometry(initCurve, N, 0.160, 8, false),
      this._hazeTubeMat,
    )
    this.group.add(this.hazeTube)

    // ── 9 marker beads at evenly spaced positions ─────────────
    // Bright white, size proportional to envelope (center = largest)
    // Gaps between beads guarantee individual visibility
    const MARKERS = 9
    for (let k = 0; k < MARKERS; k++) {
      const norm = k / (MARKERS - 1)
      const envelope = Math.sin(norm * Math.PI)
      const r = 0.018 + envelope * 0.018   // endpoints 0.055, center 0.11 — always visible
      const mat = new THREE.MeshBasicMaterial({
        color: C.white, transparent: true, opacity: 0.95,
      })
      const mesh = new THREE.Mesh(this._beadGeo, mat)
      mesh.scale.setScalar(r)
      mesh.position.x = norm * L - L / 2
      this.group.add(mesh)
      this.beads.push({ mesh, norm })
    }
  }

  _buildCore() {
    // Tiny origin dot — just marks the string's anchor, no visual competition
    const innerMat = new THREE.MeshBasicMaterial({ color: 0xaaeeff })
    this.coreInner = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), innerMat)

    // No outer halo (removing visual noise)
    const outerMat = new THREE.MeshBasicMaterial({
      color: C.cyan, transparent: true, opacity: 0.08,
    })
    this.coreOuter = new THREE.Mesh(new THREE.SphereGeometry(0.10, 12, 12), outerMat)

    // Micro glow — barely visible accent
    this.glowSprite = this._makeGlowSprite(C.cyan)
    this.glowSprite.scale.setScalar(0.14)

    this.group.add(this.coreInner, this.coreOuter, this.glowSprite)
  }

  _makeGlowSprite(color) {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    const r = (color >> 16) & 0xff
    const g = (color >>  8) & 0xff
    const b =  color        & 0xff
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2)
    grad.addColorStop(0.00, `rgba(255,255,255,0.85)`)
    grad.addColorStop(0.15, `rgba(${r},${g},${b},0.60)`)
    grad.addColorStop(0.45, `rgba(${r},${g},${b},0.18)`)
    grad.addColorStop(0.80, `rgba(${r},${g},${b},0.04)`)
    grad.addColorStop(1.00, `rgba(${r},${g},${b},0.00)`)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
    const tex = new THREE.CanvasTexture(canvas)
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    return new THREE.Sprite(mat)
  }

  _buildRings() {
    // Rings removed — wave tube IS 弦; no competing atomic structure
    this.ring1 = new THREE.Object3D()   // stub for update refs
    this.ring2 = new THREE.Object3D()
    this.ring3 = new THREE.Object3D()
  }

  _buildStatusRing() {
    const mat = new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.40 })
    this.statusRing = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.015, 8, 64), mat)
    this.statusRing.rotation.x = Math.PI / 2
    this.statusRing.position.y = -1.1
    this.group.add(this.statusRing)
  }

  _buildPointLight() {
    this.light = new THREE.PointLight(C.cyan, 1.4, 8)
    this.group.add(this.light)
  }

  // ── State ─────────────────────────────────────────────────

  setState(state) {
    this.state = state
    const colors = { idle: C.cyan, chatting: C.green, working: C.amber, thinking: C.purple }
    const col = colors[state] ?? C.cyan
    this.statusRing.material.color.setHex(col)
    this.light.color.setHex(col)
    this._glowTubeMat.color.setHex(col)
    this._hazeTubeMat.color.setHex(col)
    this.group.remove(this.glowSprite)
    this.glowSprite.material.dispose()
    this.glowSprite = this._makeGlowSprite(col)
    this.glowSprite.scale.setScalar(0.28)
    this.group.add(this.glowSprite)
  }

  // ── Animation ─────────────────────────────────────────────

  update(t) {
    this._updateWave(t)
    this._updateRings(t)
    this._updateCore(t)
    this._updateStatusRing(t)
    this._updateLight(t)
  }

  _updateWave(t) {
    // [n, weight, phaseOffset]
    // Quadrature trick: when harmonic-1 is near zero (sin≈0), harmonic-2 at π/2 offset is near peak
    // → string is NEVER fully flat
    const configs = {
      idle:     { harmonics: [[1, 1.00, 0], [2, 0.40, 1.5708]], speed: 1.0, amp: 0.46 },
      chatting: { harmonics: [[2, 1.00, 0], [1, 0.25, 1.5708]], speed: 2.2, amp: 0.42 },
      working:  { harmonics: [[3, 1.00, 0], [2, 0.30, 1.5708]], speed: 3.0, amp: 0.32 },
      thinking: { harmonics: [[1, 1.00, 0], [3, 0.45, 1.5708]], speed: 1.2, amp: 0.48 },
    }
    const { harmonics, speed, amp } = configs[this.state]
    const N = this._waveN, L = this._waveL

    for (let i = 0; i < N; i++) {
      const norm = i / (N - 1)
      const envelope = Math.sin(norm * Math.PI)
      let yD = 0, zD = 0
      for (const [n, w, phOff] of harmonics) {
        const phase = t * speed + phOff
        yD += w * Math.sin(n * Math.PI * norm) * Math.sin(phase) * amp * envelope
        zD += w * Math.sin(n * Math.PI * norm) * Math.cos(phase) * amp * 0.32 * envelope
      }
      this._wavePoints[i].set(norm * L - L / 2, yD, zD)
    }

    // Rebuild all 3 tube layers from the same curve
    const curve = new THREE.CatmullRomCurve3(this._wavePoints)
    // Core (thin bright white)
    const coreGeo = new THREE.TubeGeometry(curve, N, 0.009, 6, false)
    this.spineTube.geometry.dispose(); this.spineTube.geometry = coreGeo
    // Glow layer (medium cyan)
    const glowGeo = new THREE.TubeGeometry(curve, N, 0.035, 8, false)
    this.glowTube.geometry.dispose(); this.glowTube.geometry = glowGeo
    // Haze layer (wide, very soft)
    const hazeGeo = new THREE.TubeGeometry(curve, N, 0.160, 8, false)
    this.hazeTube.geometry.dispose(); this.hazeTube.geometry = hazeGeo

    // Snap beads to wave positions
    for (const { mesh, norm } of this.beads) {
      mesh.position.copy(this._wavePoints[Math.round(norm * (N - 1))])
    }
  }

  _updateRings(t) {
    this.ring1.rotation.y =  t * 0.45
    this.ring2.rotation.y = -t * 0.62
    this.ring2.rotation.x = Math.PI / 3 + Math.sin(t * 0.17) * 0.12
    this.ring3.rotation.z =  t * 0.31
    this.ring3.rotation.x = Math.PI / 2 + Math.sin(t * 0.13) * 0.08
  }

  _updateCore(t) {
    const s = 0.90 + Math.sin(t * 2.1) * 0.06
    this.coreInner.scale.setScalar(s)
    this.coreOuter.scale.setScalar(s)
    const gs = 0.14 + Math.sin(t * 2.1) * 0.02
    this.glowSprite.scale.setScalar(gs)
    this.glowSprite.material.opacity = 0.06 + Math.sin(t * 1.8) * 0.02

    // Traveling pulse: glow tube breathes like energy flowing through the string
    const pulse = 0.18 + Math.sin(t * 1.8) * 0.06
    this._glowTubeMat.opacity = pulse
    this._hazeTubeMat.opacity = 0.06 + Math.sin(t * 1.2) * 0.025

    // Core wire pulses brighter at wave peaks
    const wavePeak = Math.abs(Math.sin(t * 1.0))  // 0..1 following wave
    this._tubeMat.opacity = 0.88 + wavePeak * 0.10
  }

  _updateStatusRing(t) {
    this.statusRing.rotation.z = t * 0.30
    const p = 1.0 + Math.sin(t * 1.8) * 0.07
    this.statusRing.scale.set(p, p, 1)
  }

  _updateLight(t) {
    this.light.intensity = 1.2 + Math.sin(t * 2.2) * 0.22
  }

  // ── Teleport ───────────────────────────────────────────────

  teleportTo(targetPos, onComplete) {
    const startScale = this.group.scale.x
    const duration   = 520
    const start      = performance.now()
    const animate = (now) => {
      const pct = Math.min((now - start) / duration, 1)
      if (pct < 0.40) {
        const ease = 1 - Math.pow(1 - pct / 0.40, 2)
        this.group.scale.setScalar(Math.max(startScale * (1 - ease * 0.98), 0.01))
        this.glowSprite.material.opacity = 0.12 + ease * 0.10
      } else if (pct < 0.46) {
        this.group.scale.setScalar(0.01)
        this.group.position.set(targetPos.x, targetPos.y, targetPos.z)
        this.glowSprite.material.opacity = 0.22
      } else {
        const tp = (pct - 0.46) / 0.54
        const spring = 1 + Math.exp(-tp * 8) * Math.cos(tp * 14) * 0.35
        this.group.scale.setScalar(Math.max(0, spring) * startScale)
        this.glowSprite.material.opacity = 0.09 + Math.sin(tp * Math.PI) * 0.12
      }
      if (pct < 1) requestAnimationFrame(animate)
      else { this.group.scale.setScalar(startScale); onComplete?.() }
    }
    requestAnimationFrame(animate)
  }
}
