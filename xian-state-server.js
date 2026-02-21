#!/usr/bin/env node
// ─── 弦 State Broadcast Server ──────────────────────────────
// POST /state  → 更新状态，广播给所有 SSE 订阅者
// GET  /stream → SSE 流（web app 订阅）
// GET  /state  → 当前状态 JSON
// 运行: node xian-state-server.js

import http from 'http'

const PORT = 7432

let clients = []
let state = {
  activity: 'idle',
  mood:     'neutral',
  thought:  null,
  channel:  null,   // 当前活跃频道 telegram|feishu|web|imessage
  ts:       Date.now(),
}

// ── CORS helper ────────────────────────────────────────────

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

// ── Broadcast to all SSE clients ───────────────────────────

function broadcast(payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`
  clients = clients.filter(c => {
    try { c.write(msg); return true }
    catch { return false }
  })
  console.log(`[broadcast] ${payload.activity} · ${payload.mood} → ${clients.length} clients`)
}

// ── HTTP server ────────────────────────────────────────────

const server = http.createServer((req, res) => {
  cors(res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return
  }

  // ── GET /stream — SSE ────────────────────────────────────
  if (req.method === 'GET' && req.url === '/stream') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    // 立刻推送当前状态
    res.write(`data: ${JSON.stringify(state)}\n\n`)
    clients.push(res)

    req.on('close', () => {
      clients = clients.filter(c => c !== res)
      console.log(`[disconnect] ${clients.length} clients remaining`)
    })
    return
  }

  // ── GET /state — 当前状态 JSON ───────────────────────────
  if (req.method === 'GET' && req.url === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(state))
    return
  }

  // ── POST /state — 更新状态 ───────────────────────────────
  if (req.method === 'POST' && req.url === '/state') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const update = JSON.parse(body)
        state = { ...state, ...update, ts: Date.now() }
        broadcast(state)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, state }))
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }

  res.writeHead(404); res.end()
})

// ── Keepalive ping every 25s (防止 SSE 断开) ─────────────

setInterval(() => {
  clients = clients.filter(c => {
    try { c.write(': ping\n\n'); return true }
    catch { return false }
  })
}, 25_000)

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎵 弦状态服务器启动 → http://0.0.0.0:${PORT}`)
  console.log(`   POST /state  — 推送状态`)
  console.log(`   GET  /stream — SSE 订阅`)
  console.log(`   GET  /state  — 当前快照`)
})
