import * as THREE from 'three'

// ─── Hex Grid (signal field floor) ─────────────────────────
export class HexGrid {
  constructor() {
    this.group = new THREE.Group()
    this._hexes = []
    this._build()
  }

  _build() {
    const RADIUS = 6
    const SIZE   = 1.05
    const W      = SIZE * 2
    const H      = SIZE * Math.sqrt(3)

    const mat = new THREE.LineBasicMaterial({
      color: 0x00d4ff,
      transparent: true,
      opacity: 0.06,
    })

    for (let q = -RADIUS; q <= RADIUS; q++) {
      const rMin = Math.max(-RADIUS, -q - RADIUS)
      const rMax = Math.min( RADIUS, -q + RADIUS)
      for (let r = rMin; r <= rMax; r++) {
        const x = W * 0.75 * q
        const z = H * (r + q / 2)
        const hex = this._makeHex(SIZE, mat.clone())
        hex.position.set(x, 0, z)
        this.group.add(hex)
        this._hexes.push({ node: hex, dist: Math.sqrt(x * x + z * z) })
      }
    }
  }

  _makeHex(size, mat) {
    const pts = []
    for (let i = 0; i <= 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 6
      pts.push(new THREE.Vector3(
        Math.cos(a) * size * 0.97,
        0,
        Math.sin(a) * size * 0.97,
      ))
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    return new THREE.Line(geo, mat)
  }

  setActivePosition(pos) {
    this._activePos = pos  // THREE.Vector3 of current 弦 position
  }

  update(t) {
    const ap = this._activePos
    // Radar sweep — pulse expanding outward every 4s
    const sweepRadius = (t % 4.0) / 4.0 * 14   // 0..14 world units
    const sweepWidth  = 1.2

    for (const { node, dist } of this._hexes) {
      // Base ripple from center
      const ripple = Math.sin(t * 0.55 - dist * 0.25) * 0.5 + 0.5
      let alpha = 0.045 + ripple * 0.10

      // Reactive glow near 弦's current position
      if (ap) {
        const dx = node.position.x - ap.x
        const dz = node.position.z - ap.z
        const d  = Math.sqrt(dx * dx + dz * dz)
        const proximity = Math.max(0, 1 - d / 2.8)
        alpha += proximity * proximity * 0.50
      }

      // Radar sweep ring
      const sweepDiff = Math.abs(dist - sweepRadius)
      if (sweepDiff < sweepWidth) {
        const sweepIntensity = (1 - sweepDiff / sweepWidth) * 0.14
        alpha += sweepIntensity
      }

      node.material.opacity = Math.min(alpha, 0.65)
    }
  }
}
