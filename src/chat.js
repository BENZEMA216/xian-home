// ─── Chat UI ─────────────────────────────────────────────────

export class ChatUI {
  constructor() {
    this.panel     = document.getElementById('chatPanel')
    this.messages  = document.getElementById('chatMessages')
    this.input     = document.getElementById('chatInput')
    this.sendBtn   = document.getElementById('sendBtn')
    this.toggleBtn = document.getElementById('chatToggleBtn')
    this.closeBtn  = document.getElementById('chatCloseBtn')
    this.unread    = document.getElementById('unreadBadge')
    this.typing    = document.getElementById('typingIndicator')
    this.subtitle  = document.getElementById('chatSubtitle')
    this.thought   = document.getElementById('thoughtBubble')
    this.thoughtTx = document.getElementById('thoughtText')
    this.thoughtIc = document.getElementById('thoughtIcon')

    this._isOpen     = false
    this._unreadCnt  = 0
    this._onSend     = null
    this._streamEl   = null   // current streaming bubble
    this._streamText = ''

    this._setupEvents()
  }

  // ── Public ────────────────────────────────────────────────

  onSend(fn) { this._onSend = fn }

  open()  { this._setOpen(true)  }
  close() { this._setOpen(false) }
  toggle(){ this._setOpen(!this._isOpen) }

  appendMessage(text, role = 'xian') {
    const el = this._makeBubble(text, role)
    this.messages.appendChild(el)
    this._scrollBottom()

    if (role === 'xian' && !this._isOpen) {
      this._unreadCnt++
      this.unread.textContent = this._unreadCnt
      this.unread.classList.remove('hidden')
    }
    return el
  }

  /** Begin a streaming reply (returns the bubble element) */
  startStream() {
    this._streamText = ''
    this._streamEl   = this._makeBubble('', 'xian')
    this._streamEl.querySelector('.msg-bubble').textContent = '▌'
    this.messages.appendChild(this._streamEl)
    this._scrollBottom()
    return this._streamEl
  }

  /** Append a chunk to the current streaming bubble */
  appendChunk(text) {
    if (!this._streamEl) this.startStream()
    this._streamText += text
    this._streamEl.querySelector('.msg-bubble').textContent = this._streamText + '▌'
    this._scrollBottom()
  }

  /** Finalize the stream */
  finalizeStream() {
    if (!this._streamEl) return
    this._streamEl.querySelector('.msg-bubble').textContent = this._streamText
    this._streamText = ''
    this._streamEl   = null
    if (!this._isOpen) {
      this._unreadCnt++
      this.unread.textContent = this._unreadCnt
      this.unread.classList.remove('hidden')
    }
  }

  setTyping(on) {
    if (on) {
      this.typing.classList.remove('hidden')
      // Position typing indicator above chat panel when open
      this.typing.style.bottom = this._isOpen
        ? 'calc(72vh + 8px)'
        : 'calc(90px + env(safe-area-inset-bottom))'
    } else {
      this.typing.classList.add('hidden')
    }
  }

  setThought(text, icon = '◈') {
    if (!text) {
      this.thought.classList.add('hidden')
      return
    }
    this.thoughtTx.textContent = text
    this.thoughtIc.textContent = icon
    this.thought.classList.remove('hidden')

    // Auto-hide after 4s
    clearTimeout(this._thoughtTimer)
    this._thoughtTimer = setTimeout(() => {
      this.thought.classList.add('hidden')
    }, 4000)
  }

  setSubtitle(text) {
    this.subtitle.textContent = text
  }

  // ── Private ───────────────────────────────────────────────

  _setupEvents() {
    this.toggleBtn.addEventListener('click',   () => this.toggle())
    this.closeBtn .addEventListener('click',   () => this.close())
    this.sendBtn  .addEventListener('click',   () => this._send())

    this.input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        this._send()
      }
    })

    // Auto-resize textarea
    this.input.addEventListener('input', () => {
      this.input.style.height = 'auto'
      this.input.style.height = Math.min(this.input.scrollHeight, 120) + 'px'
    })
  }

  _setOpen(open) {
    this._isOpen = open
    if (open) {
      this.panel.classList.remove('hidden')
      requestAnimationFrame(() => {
        this.panel.style.transform = ''
        this._scrollBottom()
      })
      this._unreadCnt = 0
      this.unread.classList.add('hidden')
      setTimeout(() => this.input.focus(), 380)
    } else {
      this.panel.classList.add('hidden')
    }
  }

  _send() {
    const text = this.input.value.trim()
    if (!text) return
    this.appendMessage(text, 'user')
    this.input.value = ''
    this.input.style.height = 'auto'
    this._onSend?.(text)
  }

  _makeBubble(text, role) {
    const wrap = document.createElement('div')
    wrap.className = `msg ${role}`

    const bubble = document.createElement('div')
    bubble.className = 'msg-bubble'
    bubble.textContent = text

    const meta = document.createElement('div')
    meta.className = 'msg-meta'
    meta.textContent = role === 'user' ? '你' : '弦'

    wrap.appendChild(bubble)
    wrap.appendChild(meta)
    return wrap
  }

  _scrollBottom() {
    requestAnimationFrame(() => {
      this.messages.scrollTop = this.messages.scrollHeight
    })
  }
}
