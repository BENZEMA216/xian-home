import * as THREE from 'three'

// ─── Signal Node definitions ────────────────────────────────
export const NODE_DEFS = [
  { id: 'idle',     label: '共振场', color: 0x00d4ff, pos: new THREE.Vector3( 0.0,  0,  0.0) },
  { id: 'chatting', label: '对话',   color: 0x4aff88, pos: new THREE.Vector3( 3.4,  0,  0.6) },
  { id: 'working',  label: '处理',   color: 0xffbb00, pos: new THREE.Vector3(-3.6,  0,  1.8) },
  { id: 'reading',  label: '检索',   color: 0xff7c35, pos: new THREE.Vector3( 3.6,  0, -2.8) },
  { id: 'storage',  label: '记忆',   color: 0xff2d7a, pos: new THREE.Vector3(-3.6,  0, -2.8) },
  { id: 'window',   label: '感知',   color: 0x9d7aff, pos: new THREE.Vector3( 0.0,  1.2, -4.0) },
]

// ─── Signal Nodes scene layer ───────────────────────────────
export class SignalNodes {
  constructor(scene, onTap) {
    this.scene  = scene
    this.onTap  = onTap
    this.nodes  = []
    this._active = 'idle'
    this._raycaster = new THREE.Raycaster()
    this._mouse     = new THREE.Vector2()

    this._build()
  }

  _build() {
    for (const def of NODE_DEFS) {
      const node = this._makeNode(def)
      this.scene.add(node.group)
      this.nodes.push(node)
    }
    this._setActive('idle')
  }

  _makeNode(def) {
    const group = new THREE.Group()
    group.position.copy(def.pos)

    // ── Platform: semi-transparent disc + crisp torus ring ─
    // Disc — subtle fill to ground the node visually
    const platGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.01, 48)
    const platMat = new THREE.MeshBasicMaterial({
      color: def.color, transparent: true, opacity: 0.06,
    })
    const platform = new THREE.Mesh(platGeo, platMat)
    group.add(platform)

    // Torus ring — the crisp defining edge
    // Torus ring — clearly subordinate satellites around the core
    const ringGeo = new THREE.TorusGeometry(0.44, 0.085, 12, 64)
    const ringMat = new THREE.MeshBasicMaterial({
      color: def.color, transparent: true, opacity: 0.88,
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.01
    group.add(ring)

    // Minimal floor glow — tiny sprite ONLY under icon sphere
    const hc = document.createElement('canvas'); hc.width = hc.height = 64
    const hctx = hc.getContext('2d')
    const r = (def.color >> 16) & 0xff, g = (def.color >> 8) & 0xff, b = def.color & 0xff
    const hg = hctx.createRadialGradient(32,32,0,32,32,32)
    hg.addColorStop(0, `rgba(${r},${g},${b},0.50)`)
    hg.addColorStop(1, `rgba(${r},${g},${b},0)`)
    hctx.fillStyle = hg; hctx.fillRect(0,0,64,64)
    const haloMat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(hc), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6,
    })
    const halo = new THREE.Sprite(haloMat)
    halo.scale.setScalar(0.5)
    halo.position.y = 0.02
    group.add(halo)

    // Vertical line from ground up (signal pillar)
    const pillarPts = [new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0, 0.5, 0)]
    const pillarGeo = new THREE.BufferGeometry().setFromPoints(pillarPts)
    const pillarMat = new THREE.LineBasicMaterial({
      color: def.color, transparent: true, opacity: 0.25,
    })
    const pillar = new THREE.Line(pillarGeo, pillarMat)
    group.add(pillar)

    // Icon sphere floating above
    const iconGeo = new THREE.SphereGeometry(0.09, 12, 12)
    const iconMat = new THREE.MeshBasicMaterial({
      color: def.color, transparent: true, opacity: 0.85,
    })
    const icon = new THREE.Mesh(iconGeo, iconMat)
    icon.position.y = 0.55
    group.add(icon)

    // Text label (sprite-based, cheap & cross-platform)
    const sprite = this._makeLabel(def.label, def.color)
    sprite.position.y = 0.85
    group.add(sprite)

    return {
      group, platform, ring, pillar, icon, sprite, halo, haloMat,
      platMat, ringMat, pillarMat, iconMat,
      def,
      baseIconY: 0.55,
    }
  }

  _makeLabel(text, color) {
    const size    = 128
    const canvas  = document.createElement('canvas')
    canvas.width  = 256
    canvas.height = size
    const ctx     = canvas.getContext('2d')

    // Transparent background
    ctx.clearRect(0, 0, 256, size)

    // Text
    ctx.font = '600 36px -apple-system, Helvetica Neue, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const r = (color >> 16) & 0xff
    const g = (color >>  8) & 0xff
    const b =  color        & 0xff
    // Text glow
    ctx.shadowColor = `rgba(${r},${g},${b},0.9)`
    ctx.shadowBlur = 12
    ctx.fillStyle = `rgba(${r},${g},${b},0.95)`
    ctx.fillText(text, 128, 60)
    // Second pass for stronger glow core
    ctx.shadowBlur = 4
    ctx.fillStyle = `rgba(255,255,255,0.6)`
    ctx.fillText(text, 128, 60)
    ctx.shadowBlur = 0

    const tex = new THREE.CanvasTexture(canvas)
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(1.05, 0.52, 1)
    return sprite
  }

  _setActive(id) {
    this._active = id
    for (const node of this.nodes) {
      const isActive = node.def.id === id
      node.platMat.opacity  = isActive ? 0.12 : 0.03
      node.ringMat.opacity  = isActive ? 1.00 : 0.45
      node.pillarMat.opacity = isActive ? 0.65 : 0.12
      node.iconMat.opacity  = isActive ? 1.00 : 0.40
      node.haloMat.opacity  = isActive ? 0.80 : 0.20
      node.halo.scale.setScalar(isActive ? 0.7 : 0.35)
      node.sprite.material.opacity = isActive ? 1.0 : 0.35
    }
  }

  setActiveNode(id) {
    this._setActive(id)
  }

  // Hit-test on click/tap
  handlePointer(event, camera, canvas) {
    const rect = canvas.getBoundingClientRect()
    const cx   = event.clientX ?? event.touches?.[0]?.clientX
    const cy   = event.clientY ?? event.touches?.[0]?.clientY
    if (cx == null) return

    this._mouse.set(
      ((cx - rect.left) / rect.width)  * 2 - 1,
      -((cy - rect.top) / rect.height) * 2 + 1,
    )
    this._raycaster.setFromCamera(this._mouse, camera)

    const meshes = this.nodes.flatMap(n => [n.platform, n.icon])
    const hits   = this._raycaster.intersectObjects(meshes)
    if (!hits.length) return

    const hit = hits[0].object
    for (const node of this.nodes) {
      if (node.platform === hit || node.icon === hit) {
        this.onTap?.(node.def.id)
        break
      }
    }
  }

  update(t) {
    for (const node of this.nodes) {
      const isActive = node.def.id === this._active
      const speed    = isActive ? 1.4 : 0.7
      const bob      = isActive ? 0.08 : 0.04
      node.icon.position.y = node.baseIconY + Math.sin(t * speed) * bob

      // Spin torus ring
      node.ring.rotation.z = t * (isActive ? 0.6 : 0.25)

      // Breathe halo — pulse scale and opacity
      const pulse = Math.sin(t * (isActive ? 1.8 : 0.9) + node.def.pos.x) * 0.12
      const baseScale = isActive ? 0.7 : 0.5
      node.halo.scale.setScalar(baseScale + pulse)
      node.haloMat.opacity = (isActive ? 0.9 : 0.55) + pulse * 0.3
    }
  }
}
