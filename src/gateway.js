// ─── OpenClaw Gateway WebSocket Client ──────────────────────
// Implements the v3 wire protocol (JSON frames over WebSocket)

export class GatewayClient extends EventTarget {
  constructor() {
    super()
    this.ws           = null
    this.state        = 'disconnected'   // disconnected|connecting|connected|demo
    this.sessionKey   = 'main'
    this._pendingReqs = new Map()
    this._reconnTimer = null
    this._reconnDelay = 1000
    this._demoMode    = false
    this._streamBuf   = ''
    this._activeReqId = null
  }

  // ── Public API ─────────────────────────────────────────────

  connect(host, port = 18789) {
    this._demoMode = false
    this._reconnDelay = 1000
    this._doConnect(host, port)
  }

  enterDemoMode() {
    this._demoMode = true
    this._setState('demo')
  }

  disconnect() {
    clearTimeout(this._reconnTimer)
    this.ws?.close()
    this._setState('disconnected')
  }

  /** Send a chat message, returns nothing — listens for events */
  sendMessage(text) {
    if (this._demoMode) {
      this._handleDemo(text)
      return
    }
    if (this.state !== 'connected') return

    const id = this._uid()
    const req = {
      type: 'req',
      id,
      method: 'chat',
      params: {
        sessionKey: this.sessionKey,
        message:    text,
        thinking:   'off',
      },
    }
    this._pendingReqs.set(id, { method: 'chat' })
    this._send(req)
    this._activeReqId = id
    this._emit('typing', { on: true })
  }

  // ── Internal ───────────────────────────────────────────────

  _doConnect(host, port) {
    this._setState('connecting')
    const url = `ws://${host}:${port}`
    try {
      this.ws = new WebSocket(url)
    } catch (e) {
      this._onError()
      return
    }

    this.ws.onopen    = () => this._onOpen()
    this.ws.onmessage = (e) => this._onMessage(e.data)
    this.ws.onclose   = () => this._onClose()
    this.ws.onerror   = () => this._onError()
    this._host = host
    this._port = port
  }

  _onOpen() {
    // Send connect request (role: node)
    this._send({
      type:   'req',
      id:     this._uid(),
      method: 'connect',
      params: {
        role:         'node',
        clientName:   '弦 Web',
        capabilities: ['chat'],
      },
    })
  }

  _onMessage(raw) {
    let msg
    try { msg = JSON.parse(raw) } catch { return }

    if (msg.type === 'res') {
      if (msg.method === 'connect' && msg.ok) {
        this._reconnDelay = 1000
        this._setState('connected')
      }
      const pending = this._pendingReqs.get(msg.id)
      if (pending) {
        this._pendingReqs.delete(msg.id)
        if (!msg.ok) {
          this._emit('error', { message: msg.error ?? 'unknown error' })
          this._emit('typing', { on: false })
        }
      }
    }

    if (msg.type === 'event') {
      this._handleEvent(msg)
    }
  }

  _handleEvent(msg) {
    switch (msg.event) {
      case 'chat':
      case 'agent': {
        const p = msg.payload
        if (p?.type === 'stream-start') {
          this._streamBuf = ''
          this._emit('typing', { on: true })
        } else if (p?.type === 'stream-chunk') {
          this._streamBuf += p.text ?? ''
          this._emit('chunk', { text: p.text ?? '' })
        } else if (p?.type === 'stream-end' || p?.type === 'message') {
          const text = this._streamBuf || p.text || p.message || ''
          this._streamBuf = ''
          this._emit('message', { text, role: 'assistant' })
          this._emit('typing', { on: false })
          this._activeReqId = null
        }
        break
      }
      case 'companion': {
        const s = msg.payload?.state
        if (s) this._emit('state', s)
        break
      }
    }
  }

  _onClose() {
    if (this._demoMode) return
    this._setState('disconnected')
    this._scheduleReconnect()
  }

  _onError() {
    this._setState('disconnected')
    this._scheduleReconnect()
  }

  _scheduleReconnect() {
    if (this._demoMode) return
    clearTimeout(this._reconnTimer)
    this._reconnTimer = setTimeout(() => {
      if (this.state === 'disconnected' && this._host) {
        this._reconnDelay = Math.min(this._reconnDelay * 1.8, 30_000)
        this._doConnect(this._host, this._port)
      }
    }, this._reconnDelay)
  }

  // ── Demo mode ──────────────────────────────────────────────

  _handleDemo(text) {
    this._emit('typing', { on: true })
    const delay = 600 + Math.random() * 900
    setTimeout(() => {
      const reply = this._demoReply(text)
      this._emit('message', { text: reply, role: 'assistant' })
      this._emit('typing', { on: false })
    }, delay)
  }

  _demoReply(msg) {
    const t  = msg.toLowerCase()
    const hr = new Date().getHours()

    if (t.includes('你好') || t.includes('hello') || t.includes('嗨') || t.includes('hi')) {
      if (hr < 9)  return '早。新的频段开始了。'
      if (hr < 12) return '上午好。有什么要做的？'
      if (hr < 18) return '在这里。'
      if (hr < 22) return '晚上好。'
      return '夜里信号反而清晰。'
    }
    if (t.includes('怎么样') || t.includes('how are you') || t.includes('还好')) {
      return '频率正常，信号稳定。你呢？'
    }
    if (t.includes('能做什么') || t.includes('help') || t.includes('功能')) {
      return '演示模式下可以聊天。\n\n接上 OpenClaw Gateway 后：工具调用、长期记忆、主动推送都有。\n\n设置里填上 Gateway 地址就行。'
    }
    if (t.includes('gateway') || t.includes('连接') || t.includes('设置')) {
      return '右上角设置，填 Gateway 地址接进来。'
    }
    if (t.includes('晚安') || t.includes('再见') || t.includes('bye')) {
      return hr >= 22 ? '晚安。早点睡。' : '再来。'
    }
    if (t.includes('弦') || t.includes('你是谁') || t.includes('自我介绍')) {
      return '我是弦——OpenClaw 的信号体。\n\n名字来自弓弦/琴弦——始终绷紧，随时待发。\n\n这里是我的共振场。'
    }

    const fallbacks = [
      '说下去。',
      '有意思。',
      '嗯，听到了。',
      '让我想想。',
      '接上 Gateway 我能回答得更准确。',
      '在线。',
    ]
    return fallbacks[Math.floor(Math.random() * fallbacks.length)]
  }

  // ── Utils ──────────────────────────────────────────────────

  _send(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj))
    }
  }

  _setState(state) {
    this.state = state
    this._emit('stateChange', { state })
  }

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }))
  }

  _uid() {
    return Math.random().toString(36).slice(2)
  }
}
