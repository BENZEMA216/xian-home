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
    this.state = 'idle'   // idle | chatting | working | thinking
    this.beads = []
    this._beadGeo = new THREE.SphereGeometry(1, 7, 7)

    this._buildString()
    this._buildCore()
    this._buildRings()
    this._buildStatusRing()
    this._buildPointLight()
  }

  // ── Construction ──────────────────────────────────────────

  _buildString() {
    const N = 42
    const L = 1.9   // total string length; beads from -L/2 to +L/2

    for (let i = 0; i < N; i++) {
      const t = i / (N - 1)
      const baseY = t * L - L / 2
      const envelope = Math.sin(t * Math.PI)           // tapers at endpoints
      const r = 0.013 + envelope * 0.024
      const alpha = 0.32 + envelope * 0.68

      const mat = new THREE.MeshBasicMaterial({
        color: C.cyan,
        transparent: true,
        opacity: alpha,
      })
      const mesh = new THREE.Mesh(this._beadGeo, mat)
      mesh.scale.setScalar(r)
      mesh.position.y = baseY
      this.group.add(mesh)
      this.beads.push({ mesh, t, envelope, baseY })
    }

    // Bright anchor endpoints
    const anchorMat = new THREE.MeshBasicMaterial({ color: C.cyan })
    for (const y of [-L / 2, L / 2]) {
      const m = new THREE.Mesh(this._beadGeo, anchorMat)
      m.scale.setScalar(0.045)
      m.position.y = y
      this.group.add(m)
    }
  }

  _buildCore() {
    // Inner nucleus (white, bright)
    const innerMat = new THREE.MeshBasicMaterial({ color: C.white })
    this.coreInner = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), innerMat)

    // Outer halo (cyan, transparent)
    const outerMat = new THREE.MeshBasicMaterial({
      color: C.cyan,
      transparent: true,
      opacity: 0.12,
    })
    this.coreOuter = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), outerMat)

    this.group.add(this.coreInner, this.coreOuter)
  }

  _buildRings() {
    // Ring 1 — horizontal, cyan
    const r1m = new THREE.MeshBasicMaterial({
      color: C.cyan, transparent: true, opacity: 0.40,
    })
    this.ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.013, 8, 80), r1m)
    this.group.add(this.ring1)

    // Ring 2 — tilted, purple
    const r2m = new THREE.MeshBasicMaterial({
      color: C.purple, transparent: true, opacity: 0.28,
    })
    this.ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.009, 8, 80), r2m)
    this.ring2.rotation.set(Math.PI / 3, 0, Math.PI / 6)
    this.group.add(this.ring2)
  }

  _buildStatusRing() {
    const mat = new THREE.MeshBasicMaterial({
      color: C.cyan, transparent: true, opacity: 0.42,
    })
    this.statusRing = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.015, 8, 64), mat)
    this.statusRing.rotation.x = Math.PI / 2
    this.statusRing.position.y = -1.1
    this.group.add(this.statusRing)
  }

  _buildPointLight() {
    // Emissive point light so 弦 illuminates the environment
    this.light = new THREE.PointLight(C.cyan, 1.5, 8)
    this.light.position.y = 0
    this.group.add(this.light)
  }

  // ── State ─────────────────────────────────────────────────

  setState(state) {
    this.state = state
    const stateColors = {
      idle:     C.cyan,
      chatting: C.green,
      working:  C.amber,
      thinking: C.purple,
    }
    const col = stateColors[state] ?? C.cyan
    this.statusRing.material.color.setHex(col)
    this.light.color.setHex(col)
  }

  // ── Animation ─────────────────────────────────────────────

  update(t) {
    this._updateWave(t)
    this._updateRings(t)
    this._updateCore(t)
    this._updateStatusRing(t)
    this._updateLight(t)
  }

  /** Standing wave: displacement(y,t) = Σ Aₙ·sin(n·π·norm)·sin(ωₙ·t) */
  _updateWave(t) {
    const configs = {
      idle:     { harmonics: [[1, 1.00]],           speed: 1.0, amp: 0.28 },
      chatting: { harmonics: [[2, 1.00]],           speed: 2.4, amp: 0.22 },
      working:  { harmonics: [[3, 1.00]],           speed: 3.2, amp: 0.16 },
      thinking: { harmonics: [[1, 1.00],[3, 0.35]], speed: 1.3, amp: 0.24 },
    }
    const { harmonics, speed, amp } = configs[this.state]

    for (const { mesh, t: norm, envelope, baseY } of this.beads) {
      let xD = 0, zD = 0
      for (const [n, w] of harmonics) {
        const spatial = Math.sin(n * Math.PI * norm)
        const px = t * speed * (n === 1 ? 1.0 : 1.6)
        const pz = px + Math.PI / 2
        xD += w * spatial * Math.sin(px) * amp * envelope
        zD += w * spatial * Math.sin(pz) * amp * 0.30 * envelope
      }
      mesh.position.set(xD, baseY, zD)
    }
  }

  _updateRings(t) {
    this.ring1.rotation.y =  t * 0.45
    this.ring2.rotation.y = -t * 0.62
    this.ring2.rotation.x = Math.PI / 3 + Math.sin(t * 0.17) * 0.12
  }

  _updateCore(t) {
    const s = 0.88 + Math.sin(t * 2.1) * 0.08 + Math.sin(t * 0.65) * 0.04
    this.coreInner.scale.setScalar(s)
    this.coreOuter.scale.setScalar(s * 1.1)
  }

  _updateStatusRing(t) {
    this.statusRing.rotation.z =  t * 0.30
    const p = 1.0 + Math.sin(t * 1.8) * 0.07
    this.statusRing.scale.set(p, p, 1)
  }

  _updateLight(t) {
    this.light.intensity = 1.3 + Math.sin(t * 2.2) * 0.25
  }

  // ── Teleport transition ───────────────────────────────────

  teleportTo(targetPos, onComplete) {
    const startScale = this.group.scale.x
    const duration   = 420   // ms
    const start      = performance.now()

    const animate = (now) => {
      const elapsed = now - start
      const pct = Math.min(elapsed / duration, 1)

      if (pct < 0.45) {
        // Phase 1: contract (0 → 0.45)
        const ease = 1 - Math.pow(1 - pct / 0.45, 2)
        const s = startScale * (1 - ease)
        this.group.scale.setScalar(Math.max(s, 0.01))
      } else if (pct < 0.50) {
        // Phase 2: teleport at mid-point
        this.group.scale.setScalar(0.01)
        this.group.position.set(targetPos.x, targetPos.y, targetPos.z)
      } else {
        // Phase 3: expand (0.50 → 1.0)
        const ease = Math.pow((pct - 0.5) / 0.5, 0.4)
        this.group.scale.setScalar(ease)
      }

      if (pct < 1) {
        requestAnimationFrame(animate)
      } else {
        this.group.scale.setScalar(1)
        onComplete?.()
      }
    }
    requestAnimationFrame(animate)
  }
}
