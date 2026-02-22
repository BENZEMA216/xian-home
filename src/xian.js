import * as THREE from 'three'

// ─── Color palette ─────────────────────────────────────────
const C = {
  cyan:   0x00d4ff,
  purple: 0xb14eff,
  amber:  0xffbb00,
  green:  0x4aff88,
  white:  0xffffff,
}

// ─── 弦 Avatar v2 ─────────────────────────────────────────
// A vibrating string whose vibration plane rotates in 3D space.
// Dynamic antinodes light up at actual wave peaks.
// Trail particles shed from the string as it vibrates.
export class XianNode {
  constructor() {
    this.group = new THREE.Group()
    this.state  = 'idle'
    this._dynBeads = []
    this._trailParts = []

    this._buildString()
    this._buildDynBeads()
    this._buildCore()
    this._buildStatusRing()
    this._buildTrailParticles()
    this._buildPointLight()

    // Zero out amps so trail particles don't crash before first wave update
    this._waveAmps = new Array(this._waveN).fill(0)
  }

  // ── Construction ──────────────────────────────────────────

  _buildString() {
    const N = 80   // more segments → smoother 3D curves
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

    // Glow layer: medium cyan, BackSide → no z-fight
    this._glowTubeMat = new THREE.MeshBasicMaterial({
      color: C.cyan, transparent: true, opacity: 0.24,
      side: THREE.BackSide,
    })
    this.glowTube = new THREE.Mesh(
      new THREE.TubeGeometry(initCurve, N, 0.044, 8, false),
      this._glowTubeMat,
    )
    this.group.add(this.glowTube)

    // Haze layer: wide, very soft
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
    // Up to 5 bright spheres that live at actual wave amplitude peaks.
    // No fixed positions — they chase the antinodes each frame.
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
    this.groundGlow.scale.setScalar(2.2)
    this.groundGlow.material.opacity = 0.04
    this.groundGlow.position.y = -1.1
    this.group.add(this.groundGlow)
  }

  _buildTrailParticles() {
    // 20 tiny particles that spawn at the string and drift upward.
    // Only visible at high-amplitude segments — representing shed energy.
    const geo = new THREE.SphereGeometry(0.008, 4, 4)
    for (let i = 0; i < 20; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: C.cyan, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
      const mesh = new THREE.Mesh(geo, mat)
      const norm = Math.random()
      this.group.add(mesh)
      this._trailParts.push({
        mesh,
        norm,
        life: Math.random(),
        speed: 0.25 + Math.random() * 0.35,
        drift: new THREE.Vector3(
          (Math.random() - 0.5) * 0.25,
          0.18 + Math.random() * 0.38,
          (Math.random() - 0.5) * 0.25,
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
    // Core wire: near-white for cyan/green, warm white for amber, lavender for purple
    const coreCol = (col === C.cyan) ? 0xe8f8ff :
                    (col === C.green) ? 0xeeffee :
                    (col === C.amber) ? 0xfff4cc : 0xf0e8ff
    this._tubeMat.color.setHex(coreCol)

    this.group.remove(this.glowSprite)
    this.glowSprite.material.dispose()
    this.glowSprite = this._makeGlowSprite(col)
    this.glowSprite.scale.setScalar(0.28)
    this.group.add(this.glowSprite)

    // Update trail particle colors
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
    // ── The core idea: a 1D standing wave projected into 3D ──────────
    // Rather than computing yD and zD separately, we compute a single
    // scalar displacement d (how far the string point is from rest),
    // then project it into 3D via a slowly-rotating vibration plane:
    //   yD = d * cos(angle)
    //   zD = d * sin(angle)
    // where angle = t * vibRot rotates the plane around the X axis.
    //
    // Effect: the string's silhouette is always a standing wave, but
    // its orientation in 3D continuously changes — the string feels
    // alive and three-dimensional rather than flat.

    const configs = {
      idle: {
        harmonics: [[1, 1.00, 0], [2, 0.35, Math.PI / 2]],
        speed: 0.9,  amp: 0.50,  vibRot: 0.32,
      },
      chatting: {
        harmonics: [[2, 1.00, 0], [1, 0.30, Math.PI / 2]],
        speed: 2.2,  amp: 0.45,  vibRot: 0.68,
      },
      working: {
        harmonics: [[3, 1.00, 0], [2, 0.38, Math.PI / 2]],
        speed: 3.0,  amp: 0.36,  vibRot: 1.30,
      },
      thinking: {
        harmonics: [
          [1, 1.00, 0],
          [3, 0.52, Math.PI / 2],
          [5, 0.18, 0.8],
        ],
        speed: 1.2,  amp: 0.52,  vibRot: 0.48,
      },
    }
    const { harmonics, speed, amp, vibRot } = configs[this.state] ?? configs.idle

    // Vibration plane angle — rotates around X axis over time
    const angle = t * vibRot
    const cosA  = Math.cos(angle)
    const sinA  = Math.sin(angle)

    const N = this._waveN
    const L = this._waveL
    const amps = new Array(N)

    for (let i = 0; i < N; i++) {
      const norm     = i / (N - 1)
      const envelope = Math.sin(norm * Math.PI)  // fixed nodes at both ends
      let d = 0
      for (const [n, w, phOff] of harmonics) {
        d += w * Math.sin(n * Math.PI * norm) * Math.sin(t * speed + phOff) * amp * envelope
      }
      const yD = d * cosA
      const zD = d * sinA
      this._wavePoints[i].set(norm * L - L / 2, yD, zD)
      amps[i] = Math.abs(d)  // scalar amplitude (before plane rotation)
    }

    this._waveAmps = amps

    // Rebuild all 3 tube layers
    const curve = new THREE.CatmullRomCurve3(this._wavePoints)
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

    // Find local maxima (antinodes) — the true peaks of the standing wave
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
        const opacity = pulse * Math.min(peak.amp * 2.4, 1.0)
        mesh.scale.setScalar(r)
        mesh.material.opacity = Math.min(opacity, 1)
      } else {
        // No peak → gracefully fade out
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
          (Math.random() - 0.5) * 0.28,
          0.16 + Math.random() * 0.42,
          (Math.random() - 0.5) * 0.28,
        )
      }

      const idx     = Math.min(Math.round(p.norm * (N - 1)), N - 1)
      const basePos = this._wavePoints[idx]
      const age     = p.life
      const localAmp = this._waveAmps[idx] ?? 0

      p.mesh.position.set(
        basePos.x + p.drift.x * age,
        basePos.y + p.drift.y * age,
        basePos.z + p.drift.z * age,
      )

      // Only visible at high-amplitude points; fade in then out
      const lifeCurve = age < 0.25 ? (age / 0.25) : (1 - age) / 0.75
      p.mesh.material.opacity = Math.max(0, lifeCurve * localAmp * 1.6)
    }
  }

  _updateCore(t) {
    const s = 0.90 + Math.sin(t * 2.1) * 0.06
    this.coreInner.scale.setScalar(s)
    this.coreOuter.scale.setScalar(s)
    this.glowSprite.scale.setScalar(0.14 + Math.sin(t * 2.1) * 0.02)
    this.glowSprite.material.opacity = 0.06 + Math.sin(t * 1.8) * 0.02

    // Glow tube breathes
    this._glowTubeMat.opacity = 0.22 + Math.sin(t * 1.8) * 0.07
    this._hazeTubeMat.opacity = 0.07 + Math.sin(t * 1.2) * 0.025

    // Core wire pulses slightly
    this._tubeMat.opacity = 0.88 + Math.abs(Math.sin(t * 1.0)) * 0.10

    if (this._beamMat) {
      this._beamMat.opacity = 0.07 + Math.sin(t * 1.0) * 0.04
    }
    if (this.groundGlow) {
      this.groundGlow.material.opacity = 0.03 + Math.sin(t * 0.8) * 0.015
      this.groundGlow.scale.setScalar(2.0 + Math.sin(t * 0.6) * 0.25)
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
