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
      opacity: 0.12,
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

  update(t) {
    for (const { node, dist } of this._hexes) {
      const wave = Math.sin(t * 0.6 - dist * 0.28) * 0.5 + 0.5
      const alpha = 0.06 + wave * 0.14
      node.material.opacity = alpha
    }
  }
}
