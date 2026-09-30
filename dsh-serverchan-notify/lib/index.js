/**
 * dsh-serverchan-notify — host plugin (bidirectional).
 *
 * OUTBOUND: subscribes to the harness `session/event` firehose; on every
 * `assistant/message` (a completed model reply) it POSTs a notification to
 * Server酱 (`https://sctapi.ftqq.com/{SendKey}.send`) so it lands in WeChat,
 * and remembers that session as the "latest active session".
 *
 * INBOUND: long-polls the Telegram Bot API (`getUpdates`) for replies from
 * a single whitelisted user. When that user replies, the text is steered into
 * the latest active DSH session via `agent.steer(...)` — so you can answer DSH
 * from your phone without remote-desktop round-trips.
 *
 * Configuration lives in `$DSH_HOME/serverchan-notify.json` (created on first
 * run). State (latest session) lives in `$DSH_HOME/serverchan-notify-state.json`.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

const CONFIG_FILENAME = 'serverchan-notify.json'
const STATE_FILENAME = 'serverchan-notify-state.json'
const SERVERCHAN_ENDPOINT = 'https://sctapi.ftqq.com/{key}.send'
const TELEGRAM_API = 'https://api.telegram.org'

/** Default config (written on first run). */
const DEFAULT_CONFIG = {
  // Server酱 SendKey（形如 SCT...）。空 = 禁用出站推送。
  sendKey: '',
  // Telegram Bot Token（形如 123456:ABC...）。空 = 禁用入站回复。
  telegramBotToken: '',
  // 只接受这个 Telegram 用户 ID 的回复（防他人乱注入）。
  telegramUserId: 0,
  // 触发粒度：
  //   'all'          — 每条回复都推
  //   'confirm-only' — 只推「需要你确认/拍板」的回复
  //   'both'         — 回复推一条简短的，待确认再推一条醒目的（默认）
  mode: 'both',
  // 推送标题前缀（会加会话标题）。
  titlePrefix: 'DSH',
  // 回复正文截断长度（字符）。0 = 不截断。
  maxBodyLength: 400,
  // 是否附带 token 用量。
  includeUsage: true,
  // 出站去重：同一会话连续推送最小间隔（秒）。0 = 不去重。
  minIntervalSec: 5,
  // Telegram 长轮询超时（秒），Telegram 上限 50。
  telegramPollTimeout: 30,
  // Telegram API 代理地址（国内直连 api.telegram.org 不通，需走本机 Clash 混入端口）。
  // 空字符串 = 直连。默认走 Clash Verge 的 mixed port 7897。
  telegramProxyUrl: 'http://127.0.0.1:7897',
  // 待确认关键词。
  confirmKeywords: [
    '需要你确认', '需要你拍板', '请你确认', '请你决定', '请确认',
    '确认一下', '拍板', '要不要', '你决定', '二选一', '选一个',
    '授权', '批准', '需要你回复', '需要你选择', '需要你决定'
  ]
}

function dshHomePath() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/** Load config from disk, merging over defaults. */
function loadConfig() {
  const cfgPath = join(dshHomePath(), CONFIG_FILENAME)
  if (!existsSync(cfgPath)) {
    try {
      mkdirSync(dirname(cfgPath), { recursive: true })
      writeFileSync(cfgPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8')
    } catch {}
    return { ...DEFAULT_CONFIG, cfgPath }
  }
  let user = {}
  try {
    user = JSON.parse(readFileSync(cfgPath, 'utf8'))
  } catch {}
  return { ...DEFAULT_CONFIG, ...user, cfgPath }
}

/** Load the latest-active-session state. */
function loadState() {
  const statePath = join(dshHomePath(), STATE_FILENAME)
  if (!existsSync(statePath)) return null
  try {
    const s = JSON.parse(readFileSync(statePath, 'utf8'))
    if (s && typeof s === 'object' && typeof s.sessionId === 'string') return s
  } catch {}
  return null
}

/** Persist the latest-active-session state. */
function saveState(state) {
  const statePath = join(dshHomePath(), STATE_FILENAME)
  try {
    writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8')
  } catch {}
}

/** Extract the plain-text body from an assistant message content array. */
function extractText(data) {
  const content = data?.message?.content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (part && typeof part === 'object' && typeof part.text === 'string') return part.text
      if (typeof part === 'string') return part
      return ''
    })
    .join('')
    .trim()
}

/** Detect whether a reply is asking the user to confirm / decide. */
function looksLikeConfirmation(text) {
  if (!text) return false
  const cfg = loadConfig()
  const kws = Array.isArray(cfg.confirmKeywords) && cfg.confirmKeywords.length ? cfg.confirmKeywords : DEFAULT_CONFIG.confirmKeywords
  return kws.some((kw) => text.includes(kw))
}

/** Truncate to maxLen chars. */
function truncate(text, maxLen) {
  if (!maxLen || maxLen <= 0 || text.length <= maxLen) return text
  return text.slice(0, maxLen) + ' …（已截断）'
}

/** POST a notification to Server酱. Never throws. */
async function sendToServerChan(sendKey, title, desp) {
  const url = SERVERCHAN_ENDPOINT.replace('{key}', encodeURIComponent(sendKey))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, desp }),
      signal: controller.signal
    })
    if (!res.ok) {
      console.warn(`[dsh-serverchan-notify] Server酱 返回 HTTP ${res.status}`)
      return
    }
    const json = await res.json().catch(() => null)
    if (json && json.code !== 0) {
      console.warn(`[dsh-serverchan-notify] Server酱 code=${json.code} message=${json.message || ''}`)
    }
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.warn(`[dsh-serverchan-notify] 推送失败: ${error?.message || error}`)
    }
  } finally {
    clearTimeout(timer)
  }
}

/** POST a plain-text message to a Telegram chat. Never throws. */
async function sendToTelegram(botToken, chatId, text) {
  const url = `${TELEGRAM_API}/bot${botToken}/sendMessage`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await telegramFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: controller.signal
    })
    if (!res.ok) {
      console.warn(`[dsh-serverchan-notify] Telegram sendMessage HTTP ${res.status}`)
    }
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.warn(`[dsh-serverchan-notify] Telegram 发送失败: ${error?.message || error}`)
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch helper for Telegram API calls: routes through the configured proxy
 * (Clash mixed port) when `telegramProxyUrl` is set, else direct. The proxy
 * agent is created lazily and cached; a broken proxy degrades to a failed
 * request (caught by callers) rather than crashing the plugin.
 */
let _proxyAgentCache = { url: null, agent: null }
async function telegramFetch(url, init) {
  const cfg = loadConfig()
  const proxyUrl = (cfg.telegramProxyUrl || '').trim()
  if (!proxyUrl) return fetch(url, init)
  try {
    const { ProxyAgent } = await import('undici')
    if (_proxyAgentCache.url !== proxyUrl || _proxyAgentCache.agent === null) {
      _proxyAgentCache = { url: proxyUrl, agent: new ProxyAgent(proxyUrl) }
    }
    return fetch(url, { ...init, dispatcher: _proxyAgentCache.agent })
  } catch (error) {
    // undici unavailable or proxy broken — fall back to direct (will likely
    // fail in CN but never crash the plugin).
    return fetch(url, init)
  }
}

/**
 * Long-poll the Telegram Bot API for new messages from the whitelisted user.
 * Returns a disposer that cancels the poll loop.
 */
function startTelegramPoll(ctx, cfg, getAgents) {
  if (!cfg.telegramBotToken) return () => {}
  if (!Number.isSafeInteger(cfg.telegramUserId) || cfg.telegramUserId <= 0) {
    console.warn('[dsh-serverchan-notify] telegramUserId 未配置，入站回复已停用。')
    return () => {}
  }

  let offset = 0
  let disposed = false
  let pollTimer = null

  const pollOnce = async () => {
    if (disposed) return
    const timeout = Math.max(1, Math.min(50, cfg.telegramPollTimeout || 30))
    const url = `${TELEGRAM_API}/bot${cfg.telegramBotToken}/getUpdates?timeout=${timeout}&offset=${offset}`
    const controller = new AbortController()
    // The long-poll itself blocks up to `timeout`; add a small headroom for the
    // network round-trip so we don't abort a legitimate in-flight poll.
    const abortTimer = setTimeout(() => controller.abort(), (timeout + 10) * 1000)
    try {
      const res = await telegramFetch(url, { signal: controller.signal })
      if (!res.ok) {
        // e.g. 409 conflict (another poller) or 401 bad token — back off briefly.
        schedule(5_000)
        return
      }
      const json = await res.json().catch(() => null)
      if (!json || !Array.isArray(json.result)) { schedule(2_000); return }
      for (const upd of json.result) {
        offset = Math.max(offset, (upd.update_id || 0) + 1)
        handleUpdate(upd)
      }
      schedule(200)
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.warn(`[dsh-serverchan-notify] Telegram 轮询错误: ${error?.message || error}`)
      }
      schedule(3_000)
    } finally {
      clearTimeout(abortTimer)
    }
  }

  function schedule(ms) {
    if (disposed) return
    clearTimeout(pollTimer)
    pollTimer = setTimeout(() => { void pollOnce() }, ms)
    pollTimer.unref?.()
  }

  function handleUpdate(upd) {
    try {
      const msg = upd?.message
      if (!msg) return
      // Only accept private text messages from the whitelisted user.
      if (msg.from?.id !== cfg.telegramUserId) return
      if (msg.chat?.type !== 'private') return
      const text = (msg.text || '').trim()
      if (!text) return

      // Route into the latest active DSH session.
      const state = loadState()
      if (!state?.sessionId) {
        void sendToTelegram(cfg.telegramBotToken, cfg.telegramUserId, '⚠️ 还没找到活跃的 DSH 会话。请先在 DSH 里让它回复你一次，再回来回复。')
        return
      }
      const agents = getAgents()
      if (!agents) {
        void sendToTelegram(cfg.telegramBotToken, cfg.telegramUserId, '⚠️ DSH agents 服务不可用。')
        return
      }
      const agent = agents.get(state.sessionId)
      if (!agent || typeof agent.steer !== 'function') {
        void sendToTelegram(cfg.telegramBotToken, cfg.telegramUserId, '⚠️ 目标会话已不在线（可能已关闭）。请回到 DSH 重新打开一个会话。')
        return
      }

      agent.steer({
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text }],
        source: { kind: 'telegram' }
      })
      // Acknowledge to Telegram so the user knows it landed.
      void sendToTelegram(cfg.telegramBotToken, cfg.telegramUserId, `✅ 已发送给 DSH（会话「${state.title || state.sessionId}」）`)
    } catch (error) {
      console.warn(`[dsh-serverchan-notify] Telegram 消息处理失败: ${error?.message || error}`)
    }
  }

  // Kick off the first poll.
  schedule(500)
  console.log(`[dsh-serverchan-notify] Telegram 入站已启用，轮询 Bot，仅接受 user_id=${cfg.telegramUserId}`)

  return () => {
    disposed = true
    clearTimeout(pollTimer)
  }
}

export const inject = []

export function apply(ctx) {
  if (typeof ctx.on !== 'function') return

  const lastSend = new Map()

  // ---- OUTBOUND: remember latest session + push to Server酱 ----------------
  ctx.on('session/event', (session, event) => {
    try {
      if (event?.type !== 'assistant/message') return
      const cfg = loadConfig()

      const text = extractText(event.data)
      if (!text) return

      const sessionId = session?.id || 'unknown'
      const sessionTitle = (session?.header?.title || '').trim()

      // 过滤子 agent / 子智能体会话：只推主 Agent 的回复与待确认。
      // 子 agent 会话的 header 带 origin:'subagent' 与 parentSession 指向父会话。
      const header = session?.header
      const isSubagent = header != null && (header.origin === 'subagent' || typeof header.parentSession === 'string')
      if (isSubagent) return

      // Always remember this as the latest active session (drives inbound).
      saveState({ sessionId, title: sessionTitle, updatedAt: Date.now() })

      if (!cfg.sendKey) return // outbound disabled
      const now = Date.now()
      const minMs = (cfg.minIntervalSec || 0) * 1000
      if (minMs > 0) {
        const last = lastSend.get(sessionId)
        if (last !== undefined && now - last < minMs) return
      }

      const isConfirm = looksLikeConfirmation(text)
      const mode = cfg.mode || 'both'
      const shouldSend = mode === 'all' || (mode === 'confirm-only' ? isConfirm : true)
      if (!shouldSend) return

      let title = `${cfg.titlePrefix || 'DSH'} · ${sessionTitle || '回复完成'}`
      if (isConfirm && mode === 'both') title = '⚠️ 需要确认 · ' + title

      const body = truncate(text, cfg.maxBodyLength || 400)
      let desp = body
      if (cfg.includeUsage && event.data?.usage) {
        const u = event.data.usage
        const parts = []
        if (u.inputTokens != null) parts.push(`输入 ${u.inputTokens}`)
        if (u.outputTokens != null) parts.push(`输出 ${u.outputTokens}`)
        if (u.cacheReadTokens != null) parts.push(`缓存读 ${u.cacheReadTokens}`)
        desp += `\n\n---\n${parts.join(' · ')}`
      }

      lastSend.set(sessionId, now)
      if (lastSend.size > 200) {
        const oldest = lastSend.keys().next()
        if (!oldest.done) lastSend.delete(oldest.value)
      }

      void sendToServerChan(cfg.sendKey, title, desp)
    } catch (error) {
      console.warn(`[dsh-serverchan-notify] 事件处理失败: ${error?.message || error}`)
    }
  })

  // ---- INBOUND: Telegram replies -------------------------------------------
  const getAgents = () => ctx.get('agents')
  let disposePoll = () => {}

  try {
    const cfg = loadConfig()
    disposePoll = startTelegramPoll(ctx, cfg, getAgents)
  } catch (error) {
    console.warn(`[dsh-serverchan-notify] Telegram 轮询启动失败: ${error?.message || error}`)
  }

  // Announce startup state.
  try {
    const cfg = loadConfig()
    if (!cfg.sendKey) {
      console.warn(`[dsh-serverchan-notify] 未配置 sendKey，出站推送停用。配置文件：${cfg.cfgPath}`)
    } else {
      console.log(`[dsh-serverchan-notify] 出站已启用 mode=${cfg.mode}，SendKey=${cfg.sendKey.slice(0, 6)}…`)
    }
    if (!cfg.telegramBotToken) {
      console.warn(`[dsh-serverchan-notify] 未配置 telegramBotToken，入站回复停用。配置文件：${cfg.cfgPath}`)
    }
  } catch {}

  // Cleanup on dispose.
  return () => { disposePoll() }
}
