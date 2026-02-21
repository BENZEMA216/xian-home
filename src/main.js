import { Scene }         from './scene.js'
import { GatewayClient }  from './gateway.js'
import { ChatUI }         from './chat.js'

// ─── Bootstrap ──────────────────────────────────────────────

const canvas     = document.getElementById('canvas')
const statusDot  = document.getElementById('statusDot')
const statusText = document.getElementById('statusText')
const settingsBtn   = document.getElementById('settingsBtn')
const settingsPanel = document.getElementById('settingsPanel')
const settingsClose = document.getElementById('settingsCloseBtn')
const connectBtn    = document.getElementById('connectBtn')
const demoBtn       = document.getElementById('demoBtn')
const hostInput     = document.getElementById('gatewayHost')
const portInput     = document.getElementById('gatewayPort')
const infoEl        = document.getElementById('settingsInfo')

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
  idle:     { text: '待机中...', icon: '◈' },
  chatting: { text: '在听', icon: '◎' },
  working:  { text: '处理中...', icon: '⊛' },
  reading:  { text: '检索...', icon: '⊕' },
  storage:  { text: '回溯记忆', icon: '⊗' },
  window:   { text: '感知外界', icon: '⊙' },
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
      setStatus('offline', '离线')
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

demoBtn.addEventListener('click', () => {
  gateway.enterDemoMode()
  settingsPanel.classList.add('hidden')
  // Welcome in demo mode
  setTimeout(() => {
    chat.appendMessage('演示模式已启动。\n\n接上 OpenClaw Gateway 可以接入真实 AI 能力。\n\n这里是弦的共振场——你好。', 'xian')
    chat.setThought('信号稳定', '◈')
  }, 500)
})

// ─── Auto-restore connection ──────────────────────────────

const savedHost = localStorage.getItem('xian_host')
const savedPort = parseInt(localStorage.getItem('xian_port')) || 18789

if (savedHost) {
  hostInput.value = savedHost
  portInput.value = String(savedPort)
  gateway.connect(savedHost, savedPort)
} else {
  // Enter demo on first visit
  gateway.enterDemoMode()
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

// ─── Animation loop ───────────────────────────────────────

let startTime = performance.now()

function loop(now) {
  requestAnimationFrame(loop)
  const t = (now - startTime) / 1000
  scene3d.render(t)
}

requestAnimationFrame(loop)
