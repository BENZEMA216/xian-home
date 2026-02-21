// ─── StateStream — SSE client for xian-state-server ────────
// 订阅 弦 的实时状态，驱动 3D 场景变化

export class StateStream {
  constructor() {
    this._es          = null
    this._url         = null
    this._onUpdate    = null
    this._onStatus    = null
    this._reconnTimer = null
  }

  // ── Public API ─────────────────────────────────────────────

  connect(baseUrl) {
    // Normalize URL
    const url = baseUrl.replace(/\/$/, '')
    this._url = url
    this._doConnect(url)
  }

  onStateUpdate(fn) { this._onUpdate = fn }
  onStatus(fn)      { this._onStatus = fn }

  disconnect() {
    clearTimeout(this._reconnTimer)
    this._es?.close()
    this._es = null
  }

  // ── Push state TO the server (from web sessions) ──────────

  async pushState(state) {
    if (!this._url) return
    try {
      await fetch(`${this._url}/state`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(state),
      })
    } catch { /* ignore */ }
  }

  // ── Internal ───────────────────────────────────────────────

  _doConnect(url) {
    this._es?.close()

    const streamUrl = `${url}/stream`
    this._setStatus('connecting', `连接中 ${streamUrl}`)

    const es = new EventSource(streamUrl)
    this._es  = es

    es.onopen = () => {
      this._setStatus('connected', `已连接 · ${url}`)
    }

    es.onmessage = (e) => {
      try {
        const state = JSON.parse(e.data)
        this._onUpdate?.(state)
      } catch { /* ignore malformed */ }
    }

    es.onerror = () => {
      this._setStatus('error', '连接断开，重试中...')
      es.close()
      this._scheduleReconnect()
    }
  }

  _scheduleReconnect() {
    clearTimeout(this._reconnTimer)
    this._reconnTimer = setTimeout(() => {
      if (this._url) this._doConnect(this._url)
    }, 5000)
  }

  _setStatus(type, msg) {
    this._onStatus?.(type, msg)
    console.log(`[StateStream] ${type}: ${msg}`)
  }
}
