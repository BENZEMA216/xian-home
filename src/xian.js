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
    // ── Architecture: spine tube + billboard sprite glow ───────────────────
    //
    // Key insight: tube geometry ALWAYS shows geometric cylinder faces.
    // Instead, we use:
    //   1. spine tube  r=0.011  opaque  → actual wave shape, drives bloom
    //   2. N billboard sprites along the spine → glow halo that ALWAYS faces camera
    //
    // Sprites use a radial gradient texture and additive blending, so the glow
    // is a smooth, camera-aligned circle at each point — no geometry artifacts.

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

    // Color gradient
    this._spineBaseColor = new THREE.Color(0.60, 0.92, 1.0)   // cool cyan-white
    this._spinePeakColor = new THREE.Color(1.0,  0.95, 0.75)  // warm golden-white

    // ── Spine tube (opaque, thin, drives bloom) ─────────────────────────────
    this._tubeMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, vertexColors: true,
    })
    this.spineTube = new THREE.Mesh(
      new THREE.TubeGeometry(initCurve, N, 0.011, 7, false),
      this._tubeMat,
    )
    this.group.add(this.spineTube)

    // ── Continuous glow tube (very thin, fills gaps between sprites) ─────────
    // At r=0.024 (group space) → 0.046 world → ~9px wide: geometric faces
    // are subpixel and invisible. Provides a smooth continuous halo baseline.
    this._glowContMat = new THREE.MeshBasicMaterial({
      color: 0x00d4ff,   // constant cyan — fills gaps between sprites
      transparent: true, opacity: 0.28,
      side: THREE.FrontSide, depthWrite: false,
    })
    this._glowContTube = new THREE.Mesh(
      new THREE.TubeGeometry(initCurve, N, 0.024, 6, false),
      this._glowContMat,
    )
    this.group.add(this._glowContTube)

    // ── Glow sprite texture: white centre → cyan fade ──────────────────────
    const sz = 128
    const gc = document.createElement('canvas')
    gc.width = gc.height = sz
    const gctx = gc.getContext('2d')
    const gg = gctx.createRadialGradient(sz/2, sz/2, 0, sz/2, sz/2, sz/2)
    gg.addColorStop(0.00, 'rgba(255,255,255,1.00)')
    gg.addColorStop(0.08, 'rgba(230,248,255,0.92)')
    gg.addColorStop(0.25, 'rgba(0,212,255,0.55)')
    gg.addColorStop(0.55, 'rgba(0,150,220,0.18)')
    gg.addColorStop(1.00, 'rgba(0,80,180,0.00)')
    gctx.fillStyle = gg
    gctx.fillRect(0, 0, sz, sz)
    const glowTex = new THREE.CanvasTexture(gc)

    // ── Glow sprites: 28 billboard halos distributed along the string ────
    this._glowSprites = []
    const spriteMat = new THREE.SpriteMaterial({
      map: glowTex,
      blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false,
      opacity: 0.65,
    })
    const SPRITE_COUNT = 48
    for (let i = 0; i < SPRITE_COUNT; i++) {
      const sp = new THREE.Sprite(spriteMat.clone())
      sp.scale.setScalar(0.36)  // slightly smaller per-sprite, more of them
      this.group.add(sp)
      this._glowSprites.push(sp)
    }

    // ── Endpoint cap sprites: soft circular "candle-flame" tips ─────────────
    // These sit exactly at both wave endpoints and provide a round, glowing cap
    // that visually finishes the string without a sharp geometric cutoff.
    this._endCaps = []
    const capMat = new THREE.SpriteMaterial({
      map: glowTex,
      blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false,
      opacity: 0.14,
    })
    for (let i = 0; i < 2; i++) {
      const cap = new THREE.Sprite(capMat.clone())
      cap.scale.setScalar(0.14)
      this.group.add(cap)
      this._endCaps.push(cap)
    }

    // Compatibility aliases — prevent _updateIdleAnim from crashing
    this._glowBaseColor = new THREE.Color(C.cyan)
    this._glowPeakColor = new THREE.Color(1.0, 0.82, 0.50)
    this._hazeBaseColor = new THREE.Color(C.cyan)
    this._hazePeakColor = new THREE.Color(0.55, 0.44, 0.90)
    this._glowTubeMat   = this._tubeMat  // alias (opacity writes go here but do nothing harmful)
    this._hazeTubeMat   = this._tubeMat  // alias
    this.glowTube       = this.spineTube
    this.hazeTube       = this.spineTube
    this.midTube        = this.spineTube
  }

  _buildDynBeads() {
    // Dynamic antinodes: bright spheres + glow halos at wave peaks.
    const geo = new THREE.SphereGeometry(1, 10, 10)

    // Shared glow texture for bead halos
    const gc = document.createElement('canvas')
    gc.width = gc.height = 64
    const gctx = gc.getContext('2d')
    const gg = gctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    gg.addColorStop(0, 'rgba(255,255,255,1)')
    gg.addColorStop(0.25, 'rgba(200,240,255,0.7)')
    gg.addColorStop(0.6, 'rgba(0,212,255,0.18)')
    gg.addColorStop(1, 'rgba(0,212,255,0)')
    gctx.fillStyle = gg
    gctx.fillRect(0, 0, 64, 64)
    const glowTex = new THREE.CanvasTexture(gc)

    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: C.white, transparent: true, opacity: 0,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.scale.setScalar(0.022)

      // Glow halo sprite (child of bead → inherits position, scaled relative)
      const glowMat = new THREE.SpriteMaterial({
        map: glowTex, transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false, opacity: 0,
      })
      const glow = new THREE.Sprite(glowMat)
      glow.scale.setScalar(7) // 7x bead radius → soft halo
      mesh.add(glow)

      this.group.add(mesh)
      this._dynBeads.push({ mesh, glow })
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
    // 50 glow particles: spawn at high-amplitude segments, drift outward and fade.
    // Use additive-blended sprites for visible glow halos.
    const geo = new THREE.SphereGeometry(0.020, 8, 8)
    for (let i = 0; i < 50; i++) {
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
        speed: 0.14 + Math.random() * 0.22,
        drift: new THREE.Vector3(
          (Math.random() - 0.5) * 0.38,
          0.18 + Math.random() * 0.55,
          (Math.random() - 0.5) * 0.38,
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
    this._glowBaseColor.setHex(col)    // vertex colors drive glow tube color
    this._hazeBaseColor.setHex(col)   // vertex colors drive haze tube color
    // Spine base color shifts with state (vertex colors handle the rest)
    const coreCol = col === C.cyan   ? 0xd4eeff
                  : col === C.green  ? 0xd4ffdd
                  : col === C.amber  ? 0xffe8aa
                  :                   0xe4d8ff
    this._spineBaseColor.setHex(coreCol)

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

    // zScale kept low (0.38-0.42) so the Y component always dominates visually.
    // The camera looks mostly along Z, so large zScale would make the string
    // appear flat when displacement is in the Z direction.
    // Z is purely for depth-cue / ribbon thickness — not for waveform shape.
    const configs = {
      idle: {
        harmonics: [
          // [n,  w,    phOff,          zScale, speedMult]
          [1, 1.00,  0,               0.40,   1.000],
          [3, 0.65,  Math.PI / 2,     0.38,   0.783],
          [5, 0.42,  Math.PI / 4,     0.35,   1.174],
          [7, 0.24,  Math.PI * 0.9,   0.32,   0.891],
        ],
        baseSpeed: 0.80, amp: 0.50,
      },
      chatting: {
        harmonics: [
          [2, 1.00,  0,               0.40,   1.000],
          [1, 0.35,  Math.PI / 3,     0.38,   1.336],
          [4, 0.28,  Math.PI * 0.8,   0.35,   0.912],
          [6, 0.14,  Math.PI * 1.5,   0.30,   1.220],
        ],
        baseSpeed: 2.0, amp: 0.44,
      },
      working: {
        harmonics: [
          [3, 1.00,  0,               0.40,   1.000],
          [2, 0.38,  Math.PI / 2,     0.38,   0.823],
          [5, 0.26,  Math.PI * 1.3,   0.35,   1.172],
          [7, 0.14,  Math.PI * 0.6,   0.30,   0.950],
        ],
        baseSpeed: 2.8, amp: 0.36,
      },
      thinking: {
        harmonics: [
          [1, 1.00,  0,               0.42,   1.000],
          [3, 0.60,  Math.PI / 2,     0.40,   0.802],
          [5, 0.32,  Math.PI / 4,     0.36,   1.175],
          [7, 0.16,  Math.PI * 0.9,   0.32,   0.891],
          [2, 0.20,  Math.PI * 1.7,   0.28,   1.431],
        ],
        baseSpeed: 1.0, amp: 0.53,
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

    // ── Minimum Y visibility guarantee ─────────────────────────
    // Guarantee the string always shows a visible wave in Y.
    // 28% of amp = well-visible even at minimum — no more dead/flat frames.
    const maxAbsDY = Math.max(...this._wavePoints.map(p => Math.abs(p.y)), 0.001)
    const minY = amp * 0.28
    if (maxAbsDY < minY) {
      const boost = minY / maxAbsDY
      for (const pt of this._wavePoints) pt.y *= boost
      for (let i = 0; i < N; i++) amps[i] = Math.sqrt(
        this._wavePoints[i].y ** 2 + this._wavePoints[i].z ** 2
      )
    }

    this._waveAmps = amps

    // No ghost anchors — use wave points directly.
    // CatmullRom computes tangents from p[0]→p[1] and p[N-2]→p[N-1].
    // Combined with the taper (vertex scale → 0 at both ends), the tube
    // vanishes naturally without creating a needle-tip artifact.
    const curve = new THREE.CatmullRomCurve3(this._wavePoints)
    const tubeSegs = N + 6

    // Helper: build tube geometry with vertex colors + radial taper near ends.
    const buildColoredTube = (tube, r, radSegs, baseCol, peakCol) => {
      const geo = new THREE.TubeGeometry(curve, tubeSegs, r, radSegs, false)

      // ── Radial taper: pinch first+last 8% of tube to zero radius ──────────
      const pos = geo.attributes.position
      const vpr = radSegs + 1
      for (let s = 0; s <= tubeSegs; s++) {
        const t = s / tubeSegs
        // taper = 0 at endpoints, 1 beyond 18% from each end
        const taper = Math.min(t / 0.18, 1.0, (1 - t) / 0.18)
        if (taper >= 1.0) continue

        // Compute ring centre (axis point = average of vertices)
        let cx = 0, cy = 0, cz = 0
        for (let v = 0; v < radSegs; v++) {
          cx += pos.getX(s * vpr + v)
          cy += pos.getY(s * vpr + v)
          cz += pos.getZ(s * vpr + v)
        }
        cx /= radSegs; cy /= radSegs; cz /= radSegs

        for (let v = 0; v < vpr; v++) {
          const vi = s * vpr + v
          pos.setXYZ(vi,
            cx + (pos.getX(vi) - cx) * taper,
            cy + (pos.getY(vi) - cy) * taper,
            cz + (pos.getZ(vi) - cz) * taper,
          )
        }
      }
      pos.needsUpdate = true

      // ── Vertex colours keyed to wave amplitude + endpoint fade ────────────
      const vCount = geo.attributes.position.count
      const colors = new Float32Array(vCount * 3)
      for (let s = 0; s <= tubeSegs; s++) {
        // Direct mapping: tube segments map 1:1 to wave array positions
        const waveT  = s / tubeSegs
        const ampIdx = Math.min(Math.round(waveT * (N - 1)), N - 1)
        const ampNorm = Math.min(amps[ampIdx] / 0.38, 1.0)
        // Pure amplitude-driven: indigo-black near zero → bright golden-white at peak.
        // Endpoints naturally vanish (amps[0] = 0) — no spike artifacts.
        // Dark nodes shift to deep indigo, making standing-wave nodes visible.
        const darkR = 0.03, darkG = 0.08, darkB = 0.35   // deep indigo near-black
        let cr = darkR + (peakCol.r - darkR) * ampNorm
        let cg = darkG + (peakCol.g - darkG) * ampNorm
        let cb = darkB + (peakCol.b - darkB) * ampNorm
        // Dim vertices where the tube is nearly tapered to zero (taper < 0.30).
        // This prevents bloom from brightening the needle-tip even when amplitude is low.
        const sFrac  = s / tubeSegs
        const tapVal = Math.min(sFrac / 0.18, 1.0, (1 - sFrac) / 0.18)
        // Aggressive tip darkening: fade vertex colour to near-black when taper < 0.70.
        // At tapVal=0 (the very tip) → colour is 0. Prevents bloom from lighting up the spike.
        if (tapVal < 0.70) { const d = tapVal / 0.70; cr *= d; cg *= d; cb *= d }
        for (let v = 0; v < vpr; v++) {
          const idx = (s * vpr + v) * 3
          colors[idx]     = cr
          colors[idx + 1] = cg
          colors[idx + 2] = cb
        }
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

      tube.geometry.dispose()
      tube.geometry = geo
    }

    // ── Rebuild spine tube with vertex colors ─────────────────────────────
    buildColoredTube(this.spineTube, 0.011, 7,
      this._spineBaseColor, this._spinePeakColor)

    // ── Rebuild continuous glow tube (uses same taper logic) ──────────────
    if (this._glowContTube) {
      const glowGeo = new THREE.TubeGeometry(curve, tubeSegs, 0.024, 6, false)
      // Apply same radial taper
      const gPos = glowGeo.attributes.position
      const gVpr = 6 + 1
      for (let s = 0; s <= tubeSegs; s++) {
        const taper = Math.min(s / tubeSegs / 0.18, 1.0, (1 - s / tubeSegs) / 0.18)
        if (taper >= 1) continue
        let cx = 0, cy = 0, cz = 0
        for (let v = 0; v < 6; v++) { cx += gPos.getX(s*gVpr+v); cy += gPos.getY(s*gVpr+v); cz += gPos.getZ(s*gVpr+v) }
        cx /= 6; cy /= 6; cz /= 6
        for (let v = 0; v < gVpr; v++) {
          const vi = s * gVpr + v
          gPos.setXYZ(vi, cx+(gPos.getX(vi)-cx)*taper, cy+(gPos.getY(vi)-cy)*taper, cz+(gPos.getZ(vi)-cz)*taper)
        }
      }
      gPos.needsUpdate = true
      this._glowContTube.geometry.dispose()
      this._glowContTube.geometry = glowGeo
    }

    // ── Update endpoint cap sprites ───────────────────────────────────────
    if (this._endCaps?.length === 2) {
      this._endCaps[0].position.copy(this._wavePoints[0])
      this._endCaps[1].position.copy(this._wavePoints[N - 1])
      // Soft pulse — draws the eye gently to the tips
      const capPulse = 0.18 + 0.06 * Math.sin(t * 1.8)
      this._endCaps[0].scale.setScalar(capPulse)
      this._endCaps[1].scale.setScalar(capPulse)
      this._endCaps[0].material.opacity = 0.22 + 0.08 * Math.sin(t * 1.8)
      this._endCaps[1].material.opacity = 0.22 + 0.08 * Math.sin(t * 1.8 + 0.5)
    }

    // ── Update glow sprites along the wave ────────────────────────────────
    if (this._glowSprites?.length) {
      const SC = this._glowSprites.length
      for (let k = 0; k < SC; k++) {
        const normK  = k / (SC - 1)
        const wIdx   = Math.min(Math.round(normK * (N - 1)), N - 1)
        const sp     = this._glowSprites[k]
        sp.position.copy(this._wavePoints[wIdx])

        const localAmp = amps[wIdx] ?? 0

        // Endpoint envelope: sin² for a steeper/faster fade near tips
        const sinE = Math.sin(normK * Math.PI)
        const envFade = sinE * sinE

        // Breathing pulse — phase-staggered
        const pulse = 1.0 + 0.30 * Math.sin(t * 1.3 + k * 0.72)
        // Primary halos every 4th sprite
        const primary = (k % 4 === 0) ? (1.28 + 0.16 * Math.sin(t * 1.9 + k * 1.1)) : 1.0

        // CLAMP max sprite size — prevents "dumbbell" breakup at antinodes
        const baseSize = 0.24
        const ampBoost = Math.min(localAmp * 0.70, 0.30)   // cap: never > 0.54 total
        sp.scale.setScalar((baseSize + ampBoost) * pulse * primary)

        // Color temperature: cool blue at nodes → warm amber-gold at antinodes
        // AdditiveBlending: material.color multiplies the texture
        // At low amp → cool blue (0.35, 0.72, 1.0)
        // At high amp → warm gold (1.0, 0.92, 0.55)
        const warmth = Math.min(localAmp * 2.5, 1.0)
        sp.material.color.setRGB(
          0.35 + warmth * 0.65,
          0.72 + warmth * 0.20,
          1.00 - warmth * 0.45,
        )

        // Opacity — endpoint fade + mild amplitude boost
        sp.material.opacity = envFade * (0.32 + Math.min(localAmp * 1.2, 0.36))
      }
    }
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
      const { mesh, glow } = this._dynBeads[k]
      const peak = peaks[k]

      if (peak) {
        mesh.position.copy(this._wavePoints[peak.idx])
        const r       = 0.024 + peak.amp * 0.070
        const pulse   = 0.75 + Math.sin(t * 4.8 + k * 1.7) * 0.25
        mesh.scale.setScalar(r)
        mesh.material.opacity = Math.min(pulse * Math.min(peak.amp * 3.0, 1.0), 1)
        // Glow halo scales and fades with amplitude
        if (glow) {
          glow.material.opacity = Math.min(pulse * peak.amp * 2.6, 0.90)
          glow.scale.setScalar(6 + peak.amp * 8)
        }
      } else {
        mesh.material.opacity = Math.max(0, mesh.material.opacity - 0.04)
        if (glow) glow.material.opacity = Math.max(0, glow.material.opacity - 0.04)
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
      // Lower threshold so particles appear more readily; smooth fade in/out
      const minAmp = 0.06
      const lifeCurve = age < 0.15 ? age / 0.15 : Math.pow(1 - age, 1.5)
      const visible = localAmp > minAmp ? Math.min((localAmp - minAmp) / 0.25, 1.0) : 0
      p.mesh.material.opacity = Math.max(0, Math.min(0.45, lifeCurve * visible * 2.8))
    }
  }

  _updateCore(t) {
    const s = 0.90 + Math.sin(t * 2.1) * 0.06
    this.coreInner.scale.setScalar(s)
    this.coreOuter.scale.setScalar(s)
    this.glowSprite.scale.setScalar(0.14 + Math.sin(t * 2.1) * 0.02)
    this.glowSprite.material.opacity = 0.06 + Math.sin(t * 1.8) * 0.02

    this._glowTubeMat.opacity = 0.32 + Math.sin(t * 1.8) * 0.08
    this._hazeTubeMat.opacity = 0.09 + Math.sin(t * 1.2) * 0.03
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
    // Pulse ring with wave energy: bigger/brighter when string amplitude is high
    const maxAmp = this._waveAmps.length ? Math.max(...this._waveAmps) : 0
    const energy = Math.min(maxAmp / 0.35, 1.0)
    const p = 1.0 + Math.sin(t * 1.8) * 0.07 + energy * 0.08
    this.statusRing.scale.set(p, p, 1)
    this.statusRing.material.opacity = 0.10 + Math.sin(t * 1.4) * 0.06 + energy * 0.08
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
