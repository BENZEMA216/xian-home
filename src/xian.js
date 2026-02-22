import * as THREE from 'three'

// ─── Color palette ─────────────────────────────────────────
const C = {
  cyan:   0x00d4ff,
  purple: 0xb14eff,
  amber:  0xffbb00,
  green:  0x4aff88,
  white:  0xffffff,
}

// ─── 弦 Avatar v3 ─────────────────────────────────────────
//
// Core physics: elliptical polarization.
//
// Each harmonic contributes two orthogonal components (Y and Z)
// with a 90° temporal phase offset:
//
//   dY += spatial(norm) * sin(ωt + φ)
//   dZ += spatial(norm) * cos(ωt + φ) * zScale
//
// Because sin² + cos² = 1, the displacement vector at any cross-
// section has CONSTANT magnitude — the string can NEVER go flat.
// With zScale < 1 the path is an ellipse (not a circle), giving
// a gentler 3D presence without looking like a spinning tube.
//
// Multiple harmonics at different φ offsets create cross-sections
// where the ellipses have different orientations → complex
// Lissajous-like 3D shapes that are always alive.
//
export class XianNode {
  constructor() {
    this.group = new THREE.Group()
    this.state   = 'idle'
    this._dynBeads   = []
    this._trailParts = []
    this._waveAmps   = []

    this._buildString()
    this._buildDynBeads()
    this._buildCore()
    this._buildStatusRing()
    this._buildTrailParticles()
    this._buildPointLight()

    this._waveAmps = new Array(this._waveN).fill(0)
  }

  // ── Construction ──────────────────────────────────────────

  _buildString() {
    const N = 80
    const L = 4.0
    this._waveN = N
    this._waveL = L
    this._wavePoints = Array.from({ length: N }, (_, i) =>
      new THREE.Vector3((i / (N - 1)) * L - L / 2, 0, 0)
    )
    const initCurve = new THREE.CatmullRomCurve3(
      this._wavePoints.map(v => v.clone())
    )

    // Core: bright near-white wire
    this._tubeMat = new THREE.MeshBasicMaterial({
      color: 0xe8f8ff, transparent: true, opacity: 0.95,
    })
    this.spineTube = new THREE.Mesh(
      new THREE.TubeGeometry(initCurve, N, 0.010, 6, false),
      this._tubeMat,
    )
    this.group.add(this.spineTube)

    // Glow (medium, BackSide → no z-fight)
    this._glowTubeMat = new THREE.MeshBasicMaterial({
      color: C.cyan, transparent: true, opacity: 0.24,
      side: THREE.BackSide,
    })
    this.glowTube = new THREE.Mesh(
      new THREE.TubeGeometry(initCurve, N, 0.044, 8, false),
      this._glowTubeMat,
    )
    this.group.add(this.glowTube)

    // Haze (wide, very soft)
    this._hazeTubeMat = new THREE.MeshBasicMaterial({
      color: C.cyan, transparent: true, opacity: 0.07,
      side: THREE.BackSide,
    })
    this.hazeTube = new THREE.Mesh(
      new THREE.TubeGeometry(initCurve, N, 0.19, 8, false),
      this._hazeTubeMat,
    )
    this.group.add(this.hazeTube)
  }

  _buildDynBeads() {
    // Dynamic antinodes: bright spheres that chase the actual wave peaks.
    const geo = new THREE.SphereGeometry(1, 10, 10)
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: C.white, transparent: true, opacity: 0,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.scale.setScalar(0.022)
      this.group.add(mesh)
      this._dynBeads.push({ mesh })
    }
  }

  _buildCore() {
    this.coreInner = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xaaeeff }),
    )
    this.coreOuter = new THREE.Mesh(
      new THREE.SphereGeometry(0.10, 12, 12),
      new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.08 }),
    )
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
    const g = (color >> 8)  & 0xff
    const b =  color        & 0xff
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2)
    grad.addColorStop(0.00, `rgba(255,255,255,0.90)`)
    grad.addColorStop(0.15, `rgba(${r},${g},${b},0.65)`)
    grad.addColorStop(0.45, `rgba(${r},${g},${b},0.20)`)
    grad.addColorStop(0.80, `rgba(${r},${g},${b},0.05)`)
    grad.addColorStop(1.00, `rgba(${r},${g},${b},0.00)`)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
    const mat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    return new THREE.Sprite(mat)
  }

  _buildStatusRing() {
    this.statusRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.010, 8, 64),
      new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.18 }),
    )
    this.statusRing.rotation.x = Math.PI / 2
    this.statusRing.position.y = -1.1
    this.group.add(this.statusRing)

    this._beamMat = new THREE.MeshBasicMaterial({
      color: C.cyan, transparent: true, opacity: 0.10,
    })
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.008, 1.1, 5, 1),
      this._beamMat,
    )
    beam.position.y = -0.55
    this.group.add(beam)

    this.groundGlow = this._makeGlowSprite(C.cyan)
    this.groundGlow.scale.setScalar(2.4)
    this.groundGlow.material.opacity = 0.05
    this.groundGlow.position.y = -1.1
    this.group.add(this.groundGlow)
  }

  _buildTrailParticles() {
    // 28 particles: spawn at high-amplitude segments, drift outward and fade.
    // Larger size + higher opacity so they're actually visible.
    const geo = new THREE.SphereGeometry(0.014, 6, 6)
    for (let i = 0; i < 28; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: C.cyan, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
      const mesh = new THREE.Mesh(geo, mat)
      this.group.add(mesh)
      this._trailParts.push({
        mesh,
        norm:  Math.random(),
        life:  Math.random(),
        speed: 0.18 + Math.random() * 0.28,
        drift: new THREE.Vector3(
          (Math.random() - 0.5) * 0.32,
          0.20 + Math.random() * 0.50,
          (Math.random() - 0.5) * 0.32,
        ),
      })
    }
  }

  _buildPointLight() {
    this.light = new THREE.PointLight(C.cyan, 1.8, 10)
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
    const coreCol = col === C.cyan   ? 0xe8f8ff
                  : col === C.green  ? 0xeeffee
                  : col === C.amber  ? 0xfff4cc
                  :                   0xf0e8ff
    this._tubeMat.color.setHex(coreCol)

    this.group.remove(this.glowSprite)
    this.glowSprite.material.dispose()
    this.glowSprite = this._makeGlowSprite(col)
    this.glowSprite.scale.setScalar(0.28)
    this.group.add(this.glowSprite)

    for (const { mesh } of this._trailParts) {
      mesh.material.color.setHex(col)
    }
  }

  // ── Animation ─────────────────────────────────────────────

  update(t) {
    this._updateWave(t)
    this._updateDynBeads(t)
    this._updateTrailParticles(t)
    this._updateCore(t)
    this._updateStatusRing(t)
    this._updateLight(t)
  }

  _updateWave(t) {
    // ── Elliptical polarization ─────────────────────────────
    //
    // Each harmonic: [spatial_n, weight, temporal_phaseOffset, zScale]
    //
    //   dY += w * sin(n*π*norm) * env * amp * sin(ω*t + φ)
    //   dZ += w * sin(n*π*norm) * env * amp * cos(ω*t + φ) * zScale
    //
    // At each cross-section the (dY, dZ) vector traces an ellipse.
    // amplitude² = sin²(ωt+φ) + zScale²·cos²(ωt+φ) ≥ min(1, zScale²)
    // → NEVER zero when zScale > 0, so the string is ALWAYS 3D.
    //
    // ── Detuned harmonics — the key to a living, never-flat string ──
    //
    // Each harmonic: [n, weight, phaseOffset, zScale, speedMult]
    //
    //   dY += spatial * sin(baseSpeed * speedMult * t + phOff)
    //   dZ += spatial * cos(baseSpeed * speedMult * t + phOff) * zScale
    //
    // Harmonics run at slightly DIFFERENT speeds (speedMult ≠ 1.0).
    // Their phase relationship drifts continuously → the wave shape
    // slowly morphs over a ~35s cycle. When one harmonic's Y component
    // is near zero, the other is at a different phase and keeps the
    // string visible. The string is NEVER flat.
    //
    // zScale gives 3D depth without spinning-tube look.

    const configs = {
      idle: {
        // H1 + H3 + H5 + H7 — rich multi-modal standing wave, serene
        harmonics: [
          // [n,  w,    phOff,          zScale, speedMult]
          [1, 1.00,  0,               0.80,   1.000],
          [3, 0.65,  Math.PI / 2,     0.72,   0.783],
          [5, 0.32,  Math.PI / 4,     0.60,   1.174],
          [7, 0.14,  Math.PI * 0.9,   0.48,   0.891],
        ],
        baseSpeed: 0.80, amp: 0.46,
      },
      chatting: {
        // H2 + H1 + H4 + H6 — lively, quick, two-loop interference
        harmonics: [
          [2, 1.00,  0,               0.78,   1.000],
          [1, 0.35,  Math.PI / 3,     0.70,   1.336],
          [4, 0.28,  Math.PI * 0.8,   0.55,   0.912],
          [6, 0.14,  Math.PI * 1.5,   0.44,   1.220],
        ],
        baseSpeed: 2.0, amp: 0.40,
      },
      working: {
        // H3 + H2 + H5 + H7 — tight fast weave, focused
        harmonics: [
          [3, 1.00,  0,               0.72,   1.000],
          [2, 0.38,  Math.PI / 2,     0.64,   0.823],
          [5, 0.26,  Math.PI * 1.3,   0.52,   1.172],
          [7, 0.14,  Math.PI * 0.6,   0.40,   0.950],
        ],
        baseSpeed: 2.8, amp: 0.33,
      },
      thinking: {
        // H1 + H3 + H5 + H7 + H2 at five tempos → deep Lissajous evolution
        harmonics: [
          [1, 1.00,  0,               0.88,   1.000],
          [3, 0.60,  Math.PI / 2,     0.76,   0.802],
          [5, 0.32,  Math.PI / 4,     0.60,   1.175],
          [7, 0.16,  Math.PI * 0.9,   0.50,   0.891],
          [2, 0.20,  Math.PI * 1.7,   0.44,   1.431],
        ],
        baseSpeed: 1.0, amp: 0.50,
      },
    }

    const { harmonics, baseSpeed, amp } = configs[this.state] ?? configs.idle
    const N = this._waveN
    const L = this._waveL
    const amps = new Array(N)

    for (let i = 0; i < N; i++) {
      const norm     = i / (N - 1)
      const envelope = Math.sin(norm * Math.PI)
      let dY = 0
      let dZ = 0

      for (const [n, w, phOff, zScale, speedMult] of harmonics) {
        const spatial = w * Math.sin(n * Math.PI * norm) * amp * envelope
        const phase   = t * baseSpeed * speedMult + phOff
        dY += spatial * Math.sin(phase)
        dZ += spatial * Math.cos(phase) * zScale
      }

      this._wavePoints[i].set(norm * L - L / 2, dY, dZ)
      amps[i] = Math.sqrt(dY * dY + dZ * dZ)
    }

    this._waveAmps = amps

    const curve   = new THREE.CatmullRomCurve3(this._wavePoints)
    const rebuild = (tube, r, segs) => {
      const geo = new THREE.TubeGeometry(curve, N, r, segs, false)
      tube.geometry.dispose()
      tube.geometry = geo
    }
    rebuild(this.spineTube, 0.010, 6)
    rebuild(this.glowTube,  0.044, 8)
    rebuild(this.hazeTube,  0.190, 8)
  }

  _updateDynBeads(t) {
    const amps = this._waveAmps
    const N    = this._waveN
    if (!amps || !amps.length) return

    // Find local amplitude maxima (antinodes)
    const peaks = []
    for (let i = 2; i < N - 2; i++) {
      if (
        amps[i] > amps[i - 1] && amps[i] > amps[i + 1] &&
        amps[i] > amps[i - 2] && amps[i] > amps[i + 2] &&
        amps[i] > 0.06
      ) {
        peaks.push({ idx: i, amp: amps[i] })
      }
    }
    peaks.sort((a, b) => b.amp - a.amp)

    for (let k = 0; k < this._dynBeads.length; k++) {
      const { mesh } = this._dynBeads[k]
      const peak = peaks[k]

      if (peak) {
        mesh.position.copy(this._wavePoints[peak.idx])
        const r       = 0.018 + peak.amp * 0.050
        const pulse   = 0.72 + Math.sin(t * 4.8 + k * 1.7) * 0.28
        mesh.scale.setScalar(r)
        mesh.material.opacity = Math.min(pulse * Math.min(peak.amp * 2.4, 1.0), 1)
      } else {
        mesh.material.opacity = Math.max(0, mesh.material.opacity - 0.04)
      }
    }
  }

  _updateTrailParticles(t) {
    const N = this._waveN
    for (const p of this._trailParts) {
      p.life += p.speed * 0.016
      if (p.life > 1.0) {
        p.life = 0
        p.norm = Math.random()
        p.drift.set(
          (Math.random() - 0.5) * 0.26,
          0.14 + Math.random() * 0.40,
          (Math.random() - 0.5) * 0.26,
        )
      }
      const idx      = Math.min(Math.round(p.norm * (N - 1)), N - 1)
      const basePos  = this._wavePoints[idx]
      const age      = p.life
      const localAmp = this._waveAmps[idx] ?? 0

      p.mesh.position.set(
        basePos.x + p.drift.x * age,
        basePos.y + p.drift.y * age,
        basePos.z + p.drift.z * age,
      )
      // Particles only visible at genuinely high-amplitude sections
      const minAmp = 0.18
      const lifeCurve = age < 0.2 ? age / 0.2 : (1 - age) / 0.8
      const visible = localAmp > minAmp ? (localAmp - minAmp) / (0.5 - minAmp) : 0
      p.mesh.material.opacity = Math.max(0, Math.min(1, lifeCurve * visible * 3.8))
    }
  }

  _updateCore(t) {
    const s = 0.90 + Math.sin(t * 2.1) * 0.06
    this.coreInner.scale.setScalar(s)
    this.coreOuter.scale.setScalar(s)
    this.glowSprite.scale.setScalar(0.14 + Math.sin(t * 2.1) * 0.02)
    this.glowSprite.material.opacity = 0.06 + Math.sin(t * 1.8) * 0.02

    this._glowTubeMat.opacity = 0.22 + Math.sin(t * 1.8) * 0.07
    this._hazeTubeMat.opacity = 0.07 + Math.sin(t * 1.2) * 0.025
    this._tubeMat.opacity     = 0.88 + Math.abs(Math.sin(t * 1.0)) * 0.10

    if (this._beamMat) {
      this._beamMat.opacity = 0.07 + Math.sin(t * 1.0) * 0.04
    }
    if (this.groundGlow) {
      this.groundGlow.material.opacity = 0.035 + Math.sin(t * 0.8) * 0.015
      this.groundGlow.scale.setScalar(2.2 + Math.sin(t * 0.6) * 0.28)
    }
  }

  _updateStatusRing(t) {
    this.statusRing.rotation.z = t * 0.30
    const p = 1.0 + Math.sin(t * 1.8) * 0.07
    this.statusRing.scale.set(p, p, 1)
    this.statusRing.material.opacity = 0.10 + Math.sin(t * 1.4) * 0.06
  }

  _updateLight(t) {
    this.light.intensity = 1.5 + Math.sin(t * 2.2) * 0.30
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
        const tp     = (pct - 0.46) / 0.54
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
