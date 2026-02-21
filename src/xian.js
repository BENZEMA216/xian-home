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
    const N = 60
    const L = 2.6   // horizontal span along X axis

    for (let i = 0; i < N; i++) {
      const t = i / (N - 1)
      const baseX = t * L - L / 2   // ← string runs LEFT–RIGHT (X axis)
      const envelope = Math.sin(t * Math.PI)
      const r = 0.045 + envelope * 0.085   // large enough to form a visible rope
      const alpha = 0.55 + envelope * 0.45   // all beads bright; center near opaque

      // Color gradient: cyan at center, purple at endpoints
      const cR = Math.round(0x00 + (0xb1 - 0x00) * (1 - envelope))
      const cG = Math.round(0xd4 + (0x4e - 0xd4) * (1 - envelope))
      const cB = 0xff
      const beadColor = (cR << 16) | (cG << 8) | cB

      const mat = new THREE.MeshBasicMaterial({
        color: beadColor, transparent: true, opacity: alpha,
      })
      const mesh = new THREE.Mesh(this._beadGeo, mat)
      mesh.scale.setScalar(r)
      mesh.position.x = baseX   // rest position on X axis
      this.group.add(mesh)
      this.beads.push({ mesh, t, envelope, baseX })  // store baseX
    }

    // Bright anchor endpoints — at left & right tips
    const anchorMat = new THREE.MeshBasicMaterial({ color: C.cyan })
    for (const x of [-L / 2, L / 2]) {
      const m = new THREE.Mesh(this._beadGeo, anchorMat)
      m.scale.setScalar(0.055)
      m.position.x = x
      this.group.add(m)
    }

    // Spine line — connects all beads, makes the wave readable as a continuous string
    const spinePositions = new Float32Array(N * 3)
    const spineGeo = new THREE.BufferGeometry()
    spineGeo.setAttribute('position', new THREE.BufferAttribute(spinePositions, 3))
    const spineMat = new THREE.LineBasicMaterial({
      color: C.cyan, transparent: true, opacity: 0.90,
    })
    this.spineLine = new THREE.Line(spineGeo, spineMat)
    this._spinePositions = spinePositions
    this._spineN = N
    this.group.add(this.spineLine)
  }

  _buildCore() {
    // Inner nucleus — bright cyan-white (not pure white to reduce bloom overload)
    const innerMat = new THREE.MeshBasicMaterial({ color: 0xccf0ff })
    this.coreInner = new THREE.Mesh(new THREE.SphereGeometry(0.10, 16, 16), innerMat)

    // Outer halo (cyan, transparent)
    const outerMat = new THREE.MeshBasicMaterial({
      color: C.cyan,
      transparent: true,
      opacity: 0.18,
    })
    this.coreOuter = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 16), outerMat)

    // Glow sprite (billboard radial gradient — cheap bloom substitute)
    this.glowSprite = this._makeGlowSprite(C.cyan)
    this.glowSprite.scale.setScalar(2.0)

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
    grad.addColorStop(0.00, `rgba(255,255,255,0.90)`)
    grad.addColorStop(0.10, `rgba(${r},${g},${b},0.75)`)
    grad.addColorStop(0.35, `rgba(${r},${g},${b},0.25)`)
    grad.addColorStop(0.70, `rgba(${r},${g},${b},0.06)`)
    grad.addColorStop(1.00, `rgba(${r},${g},${b},0.00)`)

    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)

    const tex = new THREE.CanvasTexture(canvas)
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    return new THREE.Sprite(mat)
  }

  _buildRings() {
    // Ring 1 — horizontal, cyan
    const r1m = new THREE.MeshBasicMaterial({
      color: C.cyan, transparent: true, opacity: 0.60,
    })
    this.ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.022, 8, 80), r1m)
    this.group.add(this.ring1)

    // Ring 2 — tilted, purple
    const r2m = new THREE.MeshBasicMaterial({
      color: C.purple, transparent: true, opacity: 0.45,
    })
    this.ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.016, 8, 80), r2m)
    this.ring2.rotation.set(Math.PI / 3, 0, Math.PI / 6)
    this.group.add(this.ring2)

    // Ring 3 — perpendicular, white accent (smaller)
    const r3m = new THREE.MeshBasicMaterial({
      color: 0xaaddff, transparent: true, opacity: 0.40,
    })
    this.ring3 = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.015, 8, 80), r3m)
    this.ring3.rotation.set(Math.PI / 2, Math.PI / 4, 0)
    this.group.add(this.ring3)
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
    // Rebuild glow sprite with new color
    this.group.remove(this.glowSprite)
    this.glowSprite.material.dispose()
    this.glowSprite = this._makeGlowSprite(col)
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

  /** Standing wave: displacement(y,t) = Σ Aₙ·sin(n·π·norm)·sin(ωₙ·t) */
  _updateWave(t) {
    const configs = {
      idle:     { harmonics: [[1, 1.00]],           speed: 1.0, amp: 0.55 },
      chatting: { harmonics: [[2, 1.00]],           speed: 2.4, amp: 0.44 },
      working:  { harmonics: [[3, 1.00]],           speed: 3.2, amp: 0.34 },
      thinking: { harmonics: [[1, 1.00],[3, 0.35]], speed: 1.3, amp: 0.50 },
    }
    const { harmonics, speed, amp } = configs[this.state]

    let i = 0
    for (const { mesh, t: norm, envelope, baseX } of this.beads) {
      // Horizontal string: bead rests on X axis, wave displaces in Y (vertical) and Z (depth)
      let yD = 0, zD = 0
      for (const [n, w] of harmonics) {
        const spatial = Math.sin(n * Math.PI * norm)   // standing wave mode
        const phase = t * speed * (n === 1 ? 1.0 : 1.6)
        yD += w * spatial * Math.sin(phase)        * amp * envelope
        zD += w * spatial * Math.sin(phase + 1.57) * amp * 0.40 * envelope
      }
      mesh.position.set(baseX, yD, zD)
      // Update spine
      this._spinePositions[i * 3 + 0] = baseX
      this._spinePositions[i * 3 + 1] = yD
      this._spinePositions[i * 3 + 2] = zD
      i++
    }
    this.spineLine.geometry.attributes.position.needsUpdate = true
  }

  _updateRings(t) {
    this.ring1.rotation.y =  t * 0.45
    this.ring2.rotation.y = -t * 0.62
    this.ring2.rotation.x = Math.PI / 3 + Math.sin(t * 0.17) * 0.12
    this.ring3.rotation.z =  t * 0.31
    this.ring3.rotation.x = Math.PI / 2 + Math.sin(t * 0.13) * 0.08
  }

  _updateCore(t) {
    const s = 0.88 + Math.sin(t * 2.1) * 0.08 + Math.sin(t * 0.65) * 0.04
    this.coreInner.scale.setScalar(s)
    this.coreOuter.scale.setScalar(s * 1.1)
    // Glow sprite breathes with core — larger so it bleeds past the string
    const gs = 1.8 + Math.sin(t * 2.1) * 0.25
    this.glowSprite.scale.setScalar(gs)
    this.glowSprite.material.opacity = 0.60 + Math.sin(t * 1.8) * 0.10
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
    const duration   = 520   // ms — slightly longer for drama
    const start      = performance.now()

    const animate = (now) => {
      const elapsed = now - start
      const pct = Math.min(elapsed / duration, 1)

      if (pct < 0.40) {
        // Phase 1: compress to a bright point
        const t = pct / 0.40
        const ease = 1 - Math.pow(1 - t, 2)
        const s = startScale * (1 - ease * 0.98)
        this.group.scale.setScalar(Math.max(s, 0.01))
        // Glow pulses bright during collapse
        if (this.glowSprite) {
          this.glowSprite.material.opacity = 0.85 + ease * 0.5
        }
      } else if (pct < 0.46) {
        // Phase 2: snap to destination
        this.group.scale.setScalar(0.01)
        this.group.position.set(targetPos.x, targetPos.y, targetPos.z)
        if (this.glowSprite) this.glowSprite.material.opacity = 1.2
      } else {
        // Phase 3: spring expand with bounce overshoot
        const t = (pct - 0.46) / 0.54
        // Spring: overshoot then settle
        const spring = 1 + Math.exp(-t * 8) * Math.cos(t * 14) * 0.35
        this.group.scale.setScalar(Math.max(0, spring) * startScale)
        if (this.glowSprite) {
          this.glowSprite.material.opacity = 0.82 + Math.sin(t * Math.PI) * 0.18
        }
      }

      if (pct < 1) {
        requestAnimationFrame(animate)
      } else {
        this.group.scale.setScalar(startScale)
        onComplete?.()
      }
    }
    requestAnimationFrame(animate)
  }
}
