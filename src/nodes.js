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
    this._active  = 'idle'
    this._hovered = null
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

    ctx.clearRect(0, 0, 256, size)

    const r = (color >> 16) & 0xff
    const g = (color >>  8) & 0xff
    const b =  color        & 0xff

    // Dark pill background
    const pw = 110, ph = 42, px = 128 - pw/2, py = 60 - ph/2, pr = 21
    ctx.beginPath()
    ctx.moveTo(px + pr, py)
    ctx.lineTo(px + pw - pr, py)
    ctx.arcTo(px + pw, py, px + pw, py + pr, pr)
    ctx.lineTo(px + pw, py + ph - pr)
    ctx.arcTo(px + pw, py + ph, px + pw - pr, py + ph, pr)
    ctx.lineTo(px + pr, py + ph)
    ctx.arcTo(px, py + ph, px, py + ph - pr, pr)
    ctx.lineTo(px, py + pr)
    ctx.arcTo(px, py, px + pr, py, pr)
    ctx.closePath()
    ctx.fillStyle = 'rgba(4,6,18,0.72)'
    ctx.fill()
    ctx.strokeStyle = `rgba(${r},${g},${b},0.35)`
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Text
    ctx.font = '600 32px -apple-system, Helvetica Neue, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = `rgba(${r},${g},${b},0.9)`
    ctx.shadowBlur = 8
    ctx.fillStyle = `rgba(${r},${g},${b},1.0)`
    ctx.fillText(text, 128, 62)
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
  _hitTest(event, camera, canvas) {
    const rect = canvas.getBoundingClientRect()
    const cx   = event.clientX ?? event.touches?.[0]?.clientX
    const cy   = event.clientY ?? event.touches?.[0]?.clientY
    if (cx == null) return null

    this._mouse.set(
      ((cx - rect.left) / rect.width)  * 2 - 1,
      -((cy - rect.top) / rect.height) * 2 + 1,
    )
    this._raycaster.setFromCamera(this._mouse, camera)
    const meshes = this.nodes.flatMap(n => [n.ring, n.icon])
    const hits   = this._raycaster.intersectObjects(meshes)
    if (!hits.length) return null

    const hit = hits[0].object
    for (const node of this.nodes) {
      if (node.ring === hit || node.icon === hit) return node
    }
    return null
  }

  handleHover(event, camera, canvas) {
    const node = this._hitTest(event, camera, canvas)
    const hoveredId = node?.def?.id ?? null

    if (hoveredId !== this._hovered) {
      this._hovered = hoveredId
      canvas.style.cursor = hoveredId ? 'pointer' : 'default'

      // Boost hovered node ring
      for (const n of this.nodes) {
        const isHov = n.def.id === hoveredId
        const isActive = n.def.id === this._active
        if (!isActive) {
          n.ringMat.opacity = isHov ? 0.75 : 0.45
          n.sprite.material.opacity = isHov ? 0.8 : 0.35
        }
      }

      // Update tooltip
      this._updateTooltip(hoveredId ? node : null, camera, canvas)
    } else if (hoveredId) {
      // Keep updating position even if same node (camera might be moving)
      this._updateTooltip(node, camera, canvas)
    }
  }

  _updateTooltip(node, camera, canvas) {
    const el = document.getElementById('nodeTooltip')
    const nameEl = document.getElementById('tooltipName')
    const descEl = document.getElementById('tooltipDesc')
    if (!el) return

    if (!node) {
      el.classList.add('hidden')
      return
    }

    const descs = {
      idle:     '共振核心',
      chatting: '语言信号层',
      working:  '任务处理层',
      reading:  '语义检索层',
      storage:  '记忆存储层',
      window:   '外界感知层',
    }

    // Project 3D position to 2D screen
    const pos3 = node.group.position.clone()
    pos3.y += 0.9
    pos3.project(camera)
    const x = (pos3.x * 0.5 + 0.5) * window.innerWidth
    const y = (-pos3.y * 0.5 + 0.5) * window.innerHeight

    nameEl.textContent = node.def.label
    descEl.textContent = descs[node.def.id] ?? ''
    el.style.left = `${x}px`
    el.style.top  = `${y}px`
    el.classList.remove('hidden')
  }

  handlePointer(event, camera, canvas) {
    const node = this._hitTest(event, camera, canvas)
    if (!node) return
    this.onTap?.(node.def.id)
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
