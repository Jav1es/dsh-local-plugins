/**
 * 离线冒烟测试：在 Node 里用假 window/React/ctx 跑一遍 lib/client.js。
 *
 * 只验证接线形状（模块表结构、apply 注册的参数、面板能渲染成元素树），
 * 不验证浏览器行为。用法：
 *   node tests/smoke-client.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')

const failures = []
function check(label, condition, extra) {
  if (condition) {
    console.log('  ok   ' + label)
  } else {
    failures.push(label)
    console.log('  FAIL ' + label + (extra === undefined ? '' : '  ' + JSON.stringify(extra)))
  }
}

/* ---------------- 假宿主环境 ---------------- */

let loaded = null
globalThis.window = { __ModuleLoader__: { load: (definition) => { loaded = definition } } }

const fakeReact = {
  createElement: function (type, props) {
    return { type, props, children: Array.prototype.slice.call(arguments, 2) }
  },
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
}

const storage = new Map()
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
}

const styleNodes = []
globalThis.document = {
  getElementById: (id) => styleNodes.find((n) => n.id === id) || null,
  createElement: () => ({ id: '', textContent: '' }),
  head: { appendChild: (node) => styleNodes.push(node) },
  documentElement: {},
  querySelectorAll: () => [],
}

class FakeMutationObserver {
  observe() {}
  disconnect() {}
}
globalThis.MutationObserver = FakeMutationObserver

/* ---------------- 装载模块 ---------------- */

new Function(source)()

check('模块表 load 被调用', loaded !== null)
check('模块 id 正确', loaded && loaded.id === 'dsh-quick-panel', loaded && loaded.id)

const mod = loaded.factory((id) => {
  if (id === 'react') return fakeReact
  throw new Error('意外的 require: ' + id)
})

check('导出 inject 是数组', Array.isArray(mod.inject), mod.inject)
check('导出 apply 是函数', typeof mod.apply === 'function')
check('inject 含 sidebarRight / sidebarRightTabs', mod.inject.includes('sidebarRight') && mod.inject.includes('sidebarRightTabs'))

/* ---------------- 假 ctx ---------------- */

const registered = []
const effects = []
const scopes = []

function makeCtx() {
  return {
    effect: (fn, description) => {
      effects.push(description)
      const disposer = fn()
      return typeof disposer === 'function' ? disposer : () => {}
    },
    slots: {
      inject: (name, callback) => {
        const disposer = callback()
        return typeof disposer === 'function' ? disposer : () => {}
      },
      register: (options, component) => {
        registered.push({ options, component })
        return () => {}
      },
      entries: () => [
        { options: { id: 'chat', label: '对话', order: 0 } },
        { options: { id: 'trajectory', label: () => '轨迹', order: 10 } },
      ],
      subscribe: () => () => {},
    },
    get: () => ({
      list: {
        getSnapshot: () => ({ current: 'session-abc' }),
        subscribe: () => () => {},
      },
    }),
    layout: { selectPanel: () => {} },
    sidebarRight: { openTab: () => {}, isExpanded: () => true, toggleExpanded: () => {} },
    sessions: { scope: (id) => { scopes.push(id); return null } },
  }
}

const ctx = makeCtx()
let applyError = null
try {
  mod.apply(ctx)
} catch (error) {
  applyError = error
}

check('apply 不抛错', applyError === null, applyError && String(applyError))
check('注册了两个槽位条目', registered.length === 2, registered.map((r) => r.options.name))

const iconEntry = registered.find((r) => r.options.name === 'sidebar.panellist')
const panelEntry = registered.find((r) => r.options.name === 'main')

check('侧边栏条目 id = quick-panel', iconEntry && iconEntry.options.id === 'quick-panel', iconEntry && iconEntry.options.id)
check('侧边栏条目有数字 order', iconEntry && typeof iconEntry.options.order === 'number')
check('面板条目 key = quick-panel', panelEntry && panelEntry.options.key === 'quick-panel', panelEntry && panelEntry.options.key)
check('面板条目带 ctx 注入', panelEntry && typeof panelEntry.options.inject === 'function')
check('四个 effect 已挂', effects.length === 4, effects)

/* ---------------- 组件渲染 ---------------- */

const icon = iconEntry.component({ size: 18, active: true })
check('图标渲染成 svg', icon && icon.type === 'svg', icon && icon.type)

const injected = panelEntry.options.inject()
check('inject 返回 ctx', injected && injected.ctx === ctx)

const panel = panelEntry.component({ ctx })
check('面板渲染成 div', panel && panel.type === 'div', panel && panel.type)

// 面板树里应能看到三个功能区的标题与视图按钮。
const flat = JSON.stringify(panel)
check('面板含 ① 会话视图', flat.includes('① 会话视图'))
check('面板含 ② 对话区显示选项', flat.includes('② 对话区显示选项'))
check('面板含 ③ 右侧栏', flat.includes('③ 右侧栏'))
check('面板列出官方视图「对话」', flat.includes('对话'))
check('面板列出官方视图「轨迹」(label 函数已解析)', flat.includes('轨迹'))
check('面板带右侧栏 kind 按钮 files', flat.includes('files'))

/* ---------------- 行为函数 ---------------- */

const internals = mod.internals
check('internals 暴露 switchConversationView', typeof internals.switchConversationView === 'function')

// ①：写偏好 + 戳槽位（scope 返回 null → 回落到 ctx）
storage.set('dsh.conversation.session-abc', JSON.stringify({ draft: '草稿不能丢', view: 'chat' }))
const switched = internals.switchConversationView(ctx, 'session-abc', 'trajectory')
const record = JSON.parse(storage.get('dsh.conversation.session-abc'))
check('切换视图返回 ok', switched.ok === true, switched)
check('视图偏好已写入 trajectory', record.view === 'trajectory', record.view)
check('同一条记录里的 draft 被保留', record.draft === '草稿不能丢', record.draft)
check('戳槽位时用过 sessions.scope', scopes.includes('session-abc'), scopes)

// ②：偏好读写
internals.writePrefs({ expandThink: true, expandAll: false })
check('偏好写后可读', internals.readPrefs().expandThink === true, internals.readPrefs())

// ③：右侧栏
check('右侧栏状态可读', internals.rightbarExpanded(ctx) === true)
check('打开 tab 返回 ok', internals.openRightTab(ctx, 'files').ok === true)

// ①：会话记忆 —— 全局面板打开时 current 为 undefined，必须回落到记忆/候选
const remembered = internals.effectiveSession(ctx)
check('effectiveSession 能定位会话', remembered && typeof remembered.id === 'string' && remembered.source !== null, remembered)
check('installSessionMemory 可挂可拆', typeof internals.installSessionMemory === 'function')
check('readOpenTabs 容错返回数组', Array.isArray(internals.readOpenTabs(ctx)))

/* ---------------- 结果 ---------------- */

console.log('')
if (failures.length === 0) {
  console.log('冒烟测试通过：' + (registered.length + effects.length + 3) + ' 项接线检查全绿。')
  process.exit(0)
} else {
  console.log('失败 ' + failures.length + ' 项：' + failures.join(' | '))
  process.exit(1)
}
