import { Scene }         from './scene.js'
import { GatewayClient }  from './gateway.js'
import { ChatUI }         from './chat.js'
import { StateStream }    from './state-stream.js'

// ─── Bootstrap ──────────────────────────────────────────────

const canvas     = document.getElementById('canvas')
const statusDot  = document.getElementById('statusDot')
const statusText = document.getElementById('statusText')
const settingsBtn   = document.getElementById('settingsBtn')
const settingsPanel = document.getElementById('settingsPanel')
const settingsClose = document.getElementById('settingsCloseBtn')
const connectBtn      = document.getElementById('connectBtn')
const demoBtn         = document.getElementById('demoBtn')
const hostInput       = document.getElementById('gatewayHost')
const portInput       = document.getElementById('gatewayPort')
const infoEl          = document.getElementById('settingsInfo')
const stateConnectBtn = document.getElementById('stateConnectBtn')
const stateHostInput  = document.getElementById('stateHost')
const stateStatusEl   = document.getElementById('stateStatus')

// ─── State mapping: activity → signal node id ─────────────
const activityToNode = {
  idle:     'idle',
  chatting: 'chatting',
  working:  'working',
  reading:  'reading',
  resting:  'idle',
  helping:  'working',
}

// ─── Thought messages per node ────────────────────────────
const nodeThoughts = {
  idle:     { text: '共振场稳定', icon: '◈' },
  chatting: { text: '信号接入', icon: '◎' },
  working:  { text: '运算展开中', icon: '⊛' },
  reading:  { text: '检索语义空间', icon: '⊕' },
  storage:  { text: '记忆回溯', icon: '⊗' },
  window:   { text: '感知外界涌入', icon: '⊙' },
}

// ─── Init scene ───────────────────────────────────────────
let currentNodeId = 'idle'

const scene3d = new Scene(canvas, (nodeId) => {
  // User tapped a signal node → 弦 teleports there
  if (nodeId === currentNodeId) return
  currentNodeId = nodeId
  scene3d.moveXianTo(nodeId, () => {
    const t = nodeThoughts[nodeId]
    if (t) chat.setThought(t.text, t.icon)
  })
  // Map node to xian state
  const stateMap = {
    idle: 'idle', chatting: 'chatting', working: 'working',
    reading: 'thinking', storage: 'thinking', window: 'idle',
  }
  scene3d.xian.setState(stateMap[nodeId] ?? 'idle')
})

// ─── Init UI ─────────────────────────────────────────────
const chat    = new ChatUI()
const gateway = new GatewayClient()

// ─── Gateway events ───────────────────────────────────────

gateway.addEventListener('stateChange', ({ detail: { state } }) => {
  switch (state) {
    case 'connecting':
      setStatus('connecting', '连接中...')
      break
    case 'connected':
      setStatus('online', '在线')
      chat.setSubtitle('在线')
      settingsInfo('已连接')
      break
    case 'demo':
      setStatus('demo', '演示模式')
      chat.setSubtitle('演示模式')
      break
    case 'disconnected':
      setStatus('demo', '重连中...')
      chat.setSubtitle('重连中...')
      break
  }
})

gateway.addEventListener('message', ({ detail: { text } }) => {
  // Gateway sent a complete message
  if (gateway._streamBuf === '') {
    // No streaming in progress — direct message
    chat.appendMessage(text, 'xian')
  } else {
    chat.finalizeStream()
  }
  chat.setThought(text.slice(0, 36) + (text.length > 36 ? '...' : ''), '◎')
  // Return to idle after reply
  setTimeout(() => {
    currentNodeId = 'idle'
    scene3d.moveXianTo('idle')
    scene3d.xian.setState('idle')
    chat.setSubtitle(gateway.state === 'connected' ? '在线' : '演示模式')
  }, 800)
})

gateway.addEventListener('chunk', ({ detail: { text } }) => {
  chat.appendChunk(text)
})

gateway.addEventListener('typing', ({ detail: { on } }) => {
  chat.setTyping(on)
  if (on) {
    currentNodeId = 'chatting'
    scene3d.moveXianTo('chatting')
    scene3d.xian.setState('chatting')
    chat.setThought('思考中...', '◌')
  }
})

gateway.addEventListener('state', ({ detail }) => {
  // Companion state updates from server
  const nodeId = activityToNode[detail.activity] ?? 'idle'
  if (nodeId !== currentNodeId) {
    currentNodeId = nodeId
    scene3d.moveXianTo(nodeId)
    scene3d.xian.setState(nodeId === 'working' ? 'working' : nodeId === 'chatting' ? 'chatting' : 'idle')
  }
})

// ─── Chat send ────────────────────────────────────────────

chat.onSend((text) => {
  gateway.sendMessage(text)
  // 弦 moves to chat node
  currentNodeId = 'chatting'
  scene3d.moveXianTo('chatting')
  scene3d.xian.setState('chatting')
  chat.setThought('听到了', '◉')
})

// ─── Settings panel ───────────────────────────────────────

settingsBtn  .addEventListener('click', () => settingsPanel.classList.remove('hidden'))
settingsClose.addEventListener('click', () => settingsPanel.classList.add('hidden'))

connectBtn.addEventListener('click', () => {
  const host = hostInput.value.trim()
  const port = parseInt(portInput.value) || 18789
  if (!host) { settingsInfo('请输入 Gateway 地址'); return }
  settingsInfo('连接中...')
  localStorage.setItem('xian_host', host)
  localStorage.setItem('xian_port', String(port))
  gateway.connect(host, port)
  setTimeout(() => settingsPanel.classList.add('hidden'), 400)
})

stateConnectBtn.addEventListener('click', () => {
  const host = stateHostInput.value.trim()
  if (!host) { stateStatusEl.textContent = '请输入状态服务器地址'; return }
  const url = host.startsWith('http') ? host : `http://${host}`
  localStorage.setItem('xian_state_host', url)
  stateStream.connect(url)
  stateStatusEl.textContent = '连接中...'
  setTimeout(() => settingsPanel.classList.add('hidden'), 400)
})

demoBtn.addEventListener('click', () => {
  gateway.enterDemoMode()
  settingsPanel.classList.add('hidden')
  // Welcome in demo mode
  setTimeout(() => {
    chat.appendMessage('演示模式已启动。\n\n接上 OpenClaw Gateway 可以接入真实 AI 能力。\n\n这里是弦的共振场——你好。', 'xian')
    chat.setThought('信号稳定', '◈')
  }, 500)
})

// ─── State Stream (SSE from xian-state-server) ───────────

const stateStream = new StateStream()

stateStream.onStatus((type, msg) => {
  if (stateStatusEl) {
    stateStatusEl.textContent = msg
    stateStatusEl.style.color = type === 'connected' ? '#4aff88' : type === 'error' ? '#ff4757' : '#5a5d70'
  }
})

stateStream.onStateUpdate((s) => {
  // Drive 3D scene from live state
  const nodeId = activityToNode[s.activity] ?? 'idle'
  if (nodeId !== currentNodeId) {
    currentNodeId = nodeId
    scene3d.moveXianTo(nodeId)
  }
  const xianStateMap = {
    idle: 'idle', chatting: 'chatting', helping: 'chatting',
    working: 'working', coding: 'working',
    reading: 'thinking', resting: 'idle',
  }
  scene3d.xian.setState(xianStateMap[s.activity] ?? 'idle')

  if (s.thought) chat.setThought(s.thought, moodIcon(s.mood))

  // Update status dot to show which channel is active
  if (s.channel && s.channel !== 'web') {
    const channelLabel = { telegram: 'Telegram', feishu: '飞书', imessage: 'iMessage' }
    chat.setSubtitle(`活跃于 ${channelLabel[s.channel] ?? s.channel}`)
  }
})

// ─── Auto-restore connection ──────────────────────────────

const savedHost = localStorage.getItem('xian_host')
const savedPort = parseInt(localStorage.getItem('xian_port')) || 18789
const savedStateHost = localStorage.getItem('xian_state_host')

if (savedStateHost) {
  stateStream.connect(savedStateHost)
}

// Always start in demo mode visually; real connection upgrades it
gateway.enterDemoMode()

if (savedHost) {
  hostInput.value = savedHost
  portInput.value = String(savedPort)
  gateway.connect(savedHost, savedPort)
  setTimeout(() => {
    chat.appendMessage('尝试连接 Gateway...\n\n连接失败时自动进入演示模式。', 'xian')
    chat.setThought('信号搜寻中...', '◌')
  }, 800)
} else {
  // First visit — demo mode welcome
  setTimeout(() => {
    chat.appendMessage('信号就绪。\n\n我是弦。\n\n设置里接上 Gateway，或者就这样聊着也行。', 'xian')
    chat.setThought('共振场已激活', '◈')
  }, 1200)
}

// ─── Status helpers ───────────────────────────────────────

function setStatus(type, label) {
  statusDot.className  = 'xian-dot ' + (type === 'online' ? 'online' : type === 'demo' ? 'demo' : '')
  statusText.textContent = label
}

function settingsInfo(msg) {
  infoEl.textContent = msg
}

function moodIcon(mood) {
  const icons = {
    happy: '◉', thinking: '◌', sleepy: '◎',
    excited: '⊛', missing: '⊕', satisfied: '◈', neutral: '◈',
  }
  return icons[mood] ?? '◈'
}

// ─── Ambient input bar ────────────────────────────────────

const ambientText = document.getElementById('ambientText')
const ambientSend = document.getElementById('ambientSend')

function submitAmbient() {
  const msg = ambientText.value.trim()
  if (!msg) return
  ambientText.value = ''
  // Open chat panel and inject the message
  if (!chatPanel.classList.contains('open')) {
    chatPanel.classList.add('open')
    chatToggleBtn.classList.add('active')
  }
  // Trigger send via the chat input
  chatInput.value = msg
  chatInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
}

ambientSend.addEventListener('click', submitAmbient)
ambientText.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); submitAmbient() }
})

// ─── Animation loop ───────────────────────────────────────

let startTime = performance.now()

function loop(now) {
  requestAnimationFrame(loop)
  const t = (now - startTime) / 1000
  scene3d.render(t)
}

requestAnimationFrame(loop)
