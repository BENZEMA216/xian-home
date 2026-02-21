import * as THREE from 'three'

// ─── Signal Node definitions ────────────────────────────────
export const NODE_DEFS = [
  { id: 'idle',     label: '共振场', color: 0x00d4ff, pos: new THREE.Vector3( 0.0,  0, 0.0) },
  { id: 'chatting', label: '对话',   color: 0x4aff88, pos: new THREE.Vector3( 2.8,  0, 1.6) },
  { id: 'working',  label: '处理',   color: 0xffbb00, pos: new THREE.Vector3(-2.8,  0, 1.6) },
  { id: 'reading',  label: '检索',   color: 0xff7c35, pos: new THREE.Vector3( 2.8,  0,-2.2) },
  { id: 'storage',  label: '记忆',   color: 0xff2d7a, pos: new THREE.Vector3(-2.8,  0,-2.2) },
  { id: 'window',   label: '感知',   color: 0x9d7aff, pos: new THREE.Vector3( 0.0,  1.2,-3.2) },
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

    // Smooth circular platform (48 segments)
    const platGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.04, 48)
    const platMat = new THREE.MeshBasicMaterial({
      color: def.color, transparent: true, opacity: 0.20,
    })
    const platform = new THREE.Mesh(platGeo, platMat)
    group.add(platform)

    // Platform edge glow (torus outline)
    const ringGeo = new THREE.TorusGeometry(0.68, 0.028, 8, 64)
    const ringMat = new THREE.MeshBasicMaterial({
      color: def.color, transparent: true, opacity: 0.55,
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.02
    group.add(ring)

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
      group, platform, ring, pillar, icon, sprite,
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
    ctx.fillStyle = `rgba(${r},${g},${b},0.85)`
    ctx.fillText(text, 128, 60)

    const tex = new THREE.CanvasTexture(canvas)
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(0.9, 0.45, 1)
    return sprite
  }

  _setActive(id) {
    this._active = id
    for (const node of this.nodes) {
      const isActive = node.def.id === id
      node.platMat.opacity  = isActive ? 0.38 : 0.18
      node.ringMat.opacity  = isActive ? 0.90 : 0.45
      node.pillarMat.opacity = isActive ? 0.65 : 0.28
      node.iconMat.opacity  = isActive ? 1.00 : 0.70
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

      // Spin glow ring
      node.ring.rotation.z = t * (isActive ? 0.6 : 0.25)
    }
  }
}
