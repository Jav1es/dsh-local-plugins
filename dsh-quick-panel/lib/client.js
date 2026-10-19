/**
 * dsh-quick-panel — client half.
 *
 * 一个侧边栏图标 + 一个中列面板，把三件常用的「切换」收进一处：
 *
 *  ① 会话视图切换 — 列出 conversation.view 槽位里所有已注册视图（chat /
 *     trajectory / dsh-tiddlywiki-summary / …），点一下切过去。切换本身没有
 *     公开 API：视图选择存在**每条会话的 conversation store**（持久化键
 *     `dsh.conversation.<sessionId>`，见官方 ui-conversation 的
 *     createConversationStore / readConversationViewPreference）。这里走的是
 *     官方自己的恢复路径：先合并写该 localStorage 记录的 `view` 字段（保留
 *     draft 等其它字段），再「戳」一下 conversation.view 槽位（注册并立刻注销
 *     一个空视图），这会触达官方 `slots.subscribe('conversation.view',
 *     refreshViews)` → `restoreView(sessionId)`，于是官方按偏好把视图切过去。
 *
 *  ② 对话区显示选项 — 自动展开折叠行。机制与已装的
 *     `@yangzhe1991/dsh-web-enhance` 同源（也是它验证过的选择器）：
 *     `[data-disclosure-row][aria-expanded="false"]` 命中后 `row.click()`，
 *     用 WeakSet 去重（同一 tick 点两次会翻转回去），MutationObserver 覆盖流式
 *     新挂载的行。因为折叠时思维链全文并不挂载，纯 CSS 盖不住。
 *
 *  ③ 右侧栏 Tab — `ctx.sidebarRight.openTab(kind)`。kind 取自各官方包
 *     client.js 里的常量（files / terminal / browser / guide 是「页面型」，
 *     可按 kind 直接打开；text / plan / subagentchat / changes-review /
 *     scheduleTask 是「资源型」，需要 dsh-resource:// 地址，不在此列）。
 *
 * 接线只用官方 Slot / Service：sidebar.panellist（图标）、main（面板）。
 * 图标点击由官方 sidebar 自己调 `ctx.layout.selectPanel(id)`，本插件不接管。
 *
 * bundle 格式：DSH 客户端模块表（window.__ModuleLoader__.load），无需构建步骤。
 * React 经 `require('react')` 取得；不 require 任何 Harness Client 包。
 */
window.__ModuleLoader__.load({
  id: 'dsh-quick-panel',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var React = require('react')
    var h = React.createElement

    /* ------------------------------------------------------------------ */
    /* 身份与常量                                                          */
    /* ------------------------------------------------------------------ */

    /** 面板 id：同时是 sidebar.panellist 的 id 和 main 槽位的 key。 */
    var PANEL_ID = 'quick-panel'
    /** 注入样式表的元素 id（避免重复注入）。 */
    var CSS_ID = 'dsh-quick-panel/styles'
    /** ② 的偏好持久化键。 */
    var PREF_KEY = 'dsh-quick-panel.prefs'
    /** 官方 conversation store 的持久化键前缀（每条会话一个后缀）。 */
    var CONV_STORE_PREFIX = 'dsh.conversation.'
    /** 临时「戳」视图的 id（注册后立刻注销，只为触发官方的视图刷新）。 */
    var POKE_ID = 'dsh-quick-panel/view-poke'
    /** 会话视图槽位名。 */
    var VIEW_SLOT = 'conversation.view'

    /**
     * 可按 kind 直接打开的右侧栏 tab（「页面型」类型，没有 patterns）。
     * 资源型类型需要 dsh-resource:// 地址，不能凭空按 kind 打开。
     */
    var PAGE_TABS = [
      { kind: 'files', label: '文件' },
      { kind: 'terminal', label: '终端' },
      { kind: 'browser', label: '浏览器' },
      { kind: 'guide', label: '引导' },
    ]

    /** apply 时的客户端 ctx —— slot 注入万一不通时的兜底通道。 */
    var PLUGIN_CTX = null

    /* ------------------------------------------------------------------ */
    /* 样式（只用 --dsw-alias-* 主题 token；类名插件私有）                   */
    /* ------------------------------------------------------------------ */

    var css = '' +
      '.dqp-root{height:100%;overflow:auto;background:var(--dsw-alias-bg-base);' +
      'color:var(--dsw-alias-label-primary);font-size:13px;box-sizing:border-box}' +
      '.dqp-inner{max-width:760px;margin:0 auto;padding:20px 24px 56px}' +
      '.dqp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}' +
      '.dqp-title{margin:0 0 4px;font-size:16px;font-weight:600;line-height:1.3}' +
      '.dqp-sub{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;word-break:break-all}' +
      '.dqp-section{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);' +
      'border-radius:10px;padding:14px 16px;margin-bottom:14px}' +
      '.dqp-section h3{margin:0 0 10px;font-size:13px;font-weight:600;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}' +
      '.dqp-hint{color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:400}' +
      '.dqp-row{display:flex;flex-wrap:wrap;gap:8px}' +
      '.dqp-btn{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);' +
      'color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 12px;font-size:12px;line-height:1.4;' +
      'cursor:pointer;font-family:inherit}' +
      '.dqp-btn:hover{border-color:var(--dsw-alias-border-l2)}' +
      '.dqp-btn[data-on="1"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}' +
      '.dqp-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;' +
      'border-bottom:1px solid var(--dsw-alias-border-l1)}' +
      '.dqp-toggle:last-child{border-bottom:0}' +
      '.dqp-toggle p{margin:2px 0 0;font-size:11px;color:var(--dsw-alias-label-secondary);max-width:52ch}' +
      '.dqp-label{font-size:12px;color:var(--dsw-alias-label-primary)}' +
      '.dqp-msg{margin:10px 0 0;font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:1.6}' +
      '.dqp-msg[data-kind="error"]{color:var(--dsw-alias-state-error-primary)}' +
      '.dqp-msg[data-kind="ok"]{color:var(--dsw-alias-state-success-primary)}' +
      '.dqp-foot{margin-top:4px;font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:1.7}'

    /** 幂等注入样式表。 */
    function ensureStyles() {
      if (typeof document === 'undefined') return
      if (document.getElementById(CSS_ID)) return
      try {
        var el = document.createElement('style')
        el.id = CSS_ID
        el.textContent = css
        document.head.appendChild(el)
      } catch (e) { /* 样式缺失不影响功能 */ }
    }

    /* ------------------------------------------------------------------ */
    /* 小工具                                                             */
    /* ------------------------------------------------------------------ */

    /** 执行 fn，任何异常都落到 fallback。 */
    function safe(fn, fallback) {
      try { return fn() } catch (e) { return fallback }
    }

    /** 错误对象 → 可读文本。 */
    function errorText(error) {
      if (error === null || error === undefined) return '未知错误'
      if (typeof error === 'string') return error
      return String(error && error.message ? error.message : error)
    }

    /* ------------------------------------------------------------------ */
    /* ② 显示偏好                                                          */
    /* ------------------------------------------------------------------ */

    /** 读显示偏好（缺失/损坏 → 全关）。 */
    function readPrefs() {
      var out = { expandThink: false, expandAll: false }
      try {
        var raw = localStorage.getItem(PREF_KEY)
        if (raw) {
          var obj = JSON.parse(raw)
          if (obj && typeof obj === 'object') {
            if (obj.expandThink === true) out.expandThink = true
            if (obj.expandAll === true) out.expandAll = true
          }
        }
      } catch (e) { /* 用默认值 */ }
      return out
    }

    /** 写显示偏好。 */
    function writePrefs(prefs) {
      try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)) } catch (e) { /* 忽略 */ }
    }

    /**
     * 装上「自动展开折叠行」的观察器。与面板是否可见无关，apply 时就挂。
     * @param getPrefs - 每次扫描时读取当前偏好。
     * @returns 拆除函数。
     */
    /** 开关变化时用来立刻触发一次扫描（否则只能等 MutationObserver）。 */
    var NUDGE_AUTO_EXPAND = null

    /** 自动展开扫描的累计诊断（面板上显示，便于确认 ② 到底跑没跑、有没有命中）。 */
    var SCAN_RUNS = 0
    var SCAN_HITS = 0
    var DIAG = { think: 0, collapsible: 0, rows: 0, err: '', sample: '' }

    function installAutoExpand(getPrefs) {
      var seen = typeof WeakSet === 'function' ? new WeakSet() : null
      var timer = null
      var running = false

      /**
       * Disclosure 的 root 展开时带 `data-open`，折叠时该属性不存在；root 是 row 的
       * 直接父元素（见 ui-primitives 的 Disclosure 渲染）。**注意 `aria-expanded`
       * 只出现在内部 leading button 上，row 自己没有这个属性** —— 2026-10-16 从
       * `app.asar` 的 primitives/ui-chat 实测取证，早先按 `[data-disclosure-row]
       * [aria-expanded="false"]` 写的选择器永远匹配不到。
       */
      function isCollapsedRow(row) {
        var root = row.parentElement
        return !root || typeof root.hasAttribute !== 'function' || !root.hasAttribute('data-open')
      }

      /** 收集本轮要点的折叠行。 */
      function collectTargets(prefs) {
        var targets = []
        if (!prefs.expandThink && !prefs.expandAll) return targets

        // 思维链行：ReasoningRow 的根带 data-variant="think"，折叠时没有 data-expanded。
        var thinking = document.querySelectorAll('[data-variant="think"]:not([data-expanded])')
        for (var i = 0; i < thinking.length; i++) {
          var row = thinking[i].querySelector('[data-disclosure-row]')
          if (row) targets.push(row)
        }
        if (!prefs.expandAll) return targets

        // 「全部」再加两类：普通 Disclosure（父 root 没有 data-open），以及真正带
        // aria-expanded 的按钮（工具活动行、上下文压缩行用的是这个）。
        var rows = document.querySelectorAll('[data-disclosure-row]')
        for (var j = 0; j < rows.length; j++) {
          if (isCollapsedRow(rows[j])) targets.push(rows[j])
        }
        var buttons = document.querySelectorAll('button[aria-expanded="false"]')
        for (var k = 0; k < buttons.length; k++) targets.push(buttons[k])
        return targets
      }

      function pass() {
        if (running) return
        running = true
        try {
          var targets = collectTargets(getPrefs())
          SCAN_RUNS++
          SCAN_HITS += targets.length
          try {
            var nThink = document.querySelectorAll('[data-variant="think"]').length
            var nOpenable = document.querySelectorAll('[data-variant="think"]:not([data-expanded])').length
            var nRows = document.querySelectorAll('[data-disclosure-row]').length
            if (nThink > DIAG.think) DIAG.think = nThink
            if (nOpenable > DIAG.collapsible) DIAG.collapsible = nOpenable
            if (nRows > DIAG.rows) DIAG.rows = nRows
          } catch (e2) { DIAG.err = String((e2 && e2.message) || e2) }
          // 采一个 think 根元素的活体样本（只在命中时固化，避免面板打开时空扫覆盖）。
          if (DIAG.sample === '') {
            try {
              var probe = document.querySelector('[data-variant="think"]')
              if (probe) {
                DIAG.sample = 'x=' + (probe.hasAttribute('data-expanded') ? String(probe.getAttribute('data-expanded')) : 'none')
                  + '|h=' + Math.round(probe.getBoundingClientRect().height)
                  + '|open=' + probe.querySelectorAll('[data-open]').length
                  + '|ddr=' + probe.querySelectorAll('[data-disclosure-row]').length
              }
            } catch (e3) { DIAG.sample = 'err:' + String((e3 && e3.message) || e3) }
          }
          for (var i = 0; i < targets.length; i++) {
            var node = targets[i]
            if (seen && seen.has(node)) continue
            if (seen) seen.add(node)
            // 展开是一次点击；失败（元素已消失）不算错误。
            try { node.click() } catch (e) { /* 行已卸载 */ }
          }
        } catch (e) { /* 扫描失败不应影响宿主 */ } finally { running = false }
      }

      function schedule() {
        if (timer !== null) return
        timer = setTimeout(function () { timer = null; pass() }, 100)
      }

      var observer = null
      if (typeof MutationObserver === 'function' && typeof document !== 'undefined') {
        try {
          observer = new MutationObserver(schedule)
          observer.observe(document.documentElement, { childList: true, subtree: true })
        } catch (e) { observer = null }
      }
      NUDGE_AUTO_EXPAND = schedule
      pass()

      return function () {
        if (NUDGE_AUTO_EXPAND === schedule) NUDGE_AUTO_EXPAND = null
        if (observer) safe(function () { observer.disconnect() })
        if (timer !== null) { clearTimeout(timer); timer = null }
      }
    }

    /* ------------------------------------------------------------------ */
    /* ① 会话视图                                                          */
    /* ------------------------------------------------------------------ */

    /** 当前挂载的会话 id（无会话 → null）。 */
    function currentSessionId(ctx) {
      if (!ctx) return null
      return safe(function () {
        var sessions = ctx.get('sessions')
        var snap = sessions && sessions.list && sessions.list.getSnapshot()
        var current = snap && snap.current
        return typeof current === 'string' && current !== '' ? current : null
      }, null)
    }

    /** 已注册的会话视图（id / label / order），按 order 升序。 */
    function listViews(ctx) {
      return safe(function () {
        var out = []
        var entries = ctx.slots.entries(VIEW_SLOT)
        for (var i = 0; i < entries.length; i++) {
          var options = entries[i] && entries[i].options
          if (!options || typeof options.id !== 'string' || options.id === '') continue
          if (options.id === POKE_ID) continue
          var label = options.label
          if (typeof label === 'function') label = safe(label, options.id)
          out.push({
            id: options.id,
            label: typeof label === 'string' && label !== '' ? label : options.id,
            order: typeof options.order === 'number' ? options.order : 0,
          })
        }
        out.sort(function (a, b) { return a.order - b.order })
        return out
      }, [])
    }

    /** 读该会话持久化里的视图偏好（没有 → null，表示官方默认）。 */
    function readViewPreference(sessionId) {
      return safe(function () {
        if (!sessionId) return null
        var raw = localStorage.getItem(CONV_STORE_PREFIX + sessionId)
        if (!raw) return null
        var obj = JSON.parse(raw)
        var view = obj && obj.view
        return typeof view === 'string' && view !== '' ? view : null
      }, null)
    }

    /**
     * 合并写视图偏好：保留同一条记录里的其它字段（draft 等），别把草稿擦掉。
     * @returns 是否写入成功。
     */
    function writeViewPreference(sessionId, viewId) {
      try {
        if (!sessionId) return false
        var key = CONV_STORE_PREFIX + sessionId
        var record = {}
        var raw = localStorage.getItem(key)
        if (raw) {
          var parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object') record = parsed
        }
        record.view = viewId
        localStorage.setItem(key, JSON.stringify(record))
        return true
      } catch (e) { return false }
    }

    /**
     * 戳一下 conversation.view 槽位：注册并立刻注销一个空视图。
     * 官方的 `slots.subscribe('conversation.view', refreshViews)` 会因此触发
     * `restoreView(sessionId)`，从 localStorage 偏好把视图切过去。
     * @returns 是否成功触达槽位。
     */
    function pokeConversationViews(ctx, sessionId) {
      var target = null
      try {
        if (ctx.sessions && typeof ctx.sessions.scope === 'function') target = ctx.sessions.scope(sessionId)
      } catch (e) { target = null }
      if (!target || !target.slots) target = ctx
      var dispose = null
      try {
        dispose = target.slots.register({
          name: VIEW_SLOT,
          id: POKE_ID,
          label: function () { return '' },
        }, function () { return null })
      } catch (e) { return false }
      try { if (typeof dispose === 'function') dispose() } catch (e) { /* 已注销 */ }
      return true
    }

    /** 切换会话视图：写偏好 + 触发官方恢复路径。 */
    function switchConversationView(ctx, sessionId, viewId) {
      if (!sessionId) return { ok: false, message: '当前没有挂载的会话，无法切换视图。' }
      if (!writeViewPreference(sessionId, viewId)) {
        return { ok: false, message: '写入视图偏好失败（localStorage 不可用）。' }
      }
      var poked = pokeConversationViews(ctx, sessionId)
      if (poked) return { ok: true, message: '已切换到「' + viewId + '」。' }
      return {
        ok: true,
        message: '偏好已写入；会话 surface 尚未挂载，即时切换未触发 —— 切换会话或刷新页面后生效。',
      }
    }

    /* ------------------------------------------------------------------ */
    /* ③ 右侧栏                                                            */
    /* ------------------------------------------------------------------ */

    /**
     * 右侧栏是**会话绑定**的：全局面板顶替主列时没有挂载的 session surface，
     * `openTab` / `toggleExpanded` 会抛 “no session surface is mounted yet”
     * （2026-10-16 实测）。面板既然是「快捷入口」，这种情况下就先返回会话再重试。
     */
    function needsSessionSurface(error) {
      var text = errorText(error)
      // 实测文案是 “sidebarRight: no session surface is mounted yet”，但没有权威枚举，
      // 所以放宽到「提到 surface / session」——右侧栏的失败基本都源于 surface 未挂载。
      return /surface/i.test(text) || /no session/i.test(text)
    }

    /** 返回会话，并在 surface 挂载后重试 action（最多 12 × 150ms ≈ 1.8s）。 */
    function retryAfterReturningToSession(ctx, action) {
      try { ctx.layout.selectPanel(null) } catch (e) { /* 已经不在面板上 */ }
      var attempts = 0
      var timer = setInterval(function () {
        attempts++
        var error = null
        try { action() } catch (e) { error = e }
        if (error === null || attempts >= 12) clearInterval(timer)
      }, 150)
      if (timer && typeof timer.unref === 'function') timer.unref()
    }

    /** 按 kind 打开右侧栏 tab（面板会随之展开）。 */
    function openRightTab(ctx, kind) {
      var label = kind
      for (var i = 0; i < PAGE_TABS.length; i++) if (PAGE_TABS[i].kind === kind) label = PAGE_TABS[i].label
      var error = null
      try { ctx.sidebarRight.openTab(kind) } catch (e) { error = e }
      if (error === null) return { ok: true, message: '已打开右侧栏「' + label + '」。' }
      if (!needsSessionSurface(error)) {
        return { ok: false, message: '打开「' + label + '」失败：' + errorText(error) }
      }
      retryAfterReturningToSession(ctx, function () { ctx.sidebarRight.openTab(kind) })
      return { ok: true, message: '右侧栏是会话绑定的：已返回会话，正在打开「' + label + '」。' }
    }

    /** 右侧栏是否展开。 */
    function rightbarExpanded(ctx) {
      return safe(function () { return ctx.sidebarRight.isExpanded() === true }, false)
    }

    /** 收起 / 展开右侧栏。 */
    function toggleRightbar(ctx) {
      var before = rightbarExpanded(ctx)
      var error = null
      try { ctx.sidebarRight.toggleExpanded() } catch (e) { error = e }
      if (error === null) return { ok: true, message: before ? '右侧栏已收起。' : '右侧栏已展开。' }
      if (!needsSessionSurface(error)) {
        return { ok: false, message: '切换右侧栏失败：' + errorText(error) }
      }
      retryAfterReturningToSession(ctx, function () { ctx.sidebarRight.toggleExpanded() })
      return { ok: true, message: '右侧栏是会话绑定的：已返回会话并切换右侧栏。' }
    }

    /* ------------------------------------------------------------------ */
    /* 组件：侧边栏图标                                                     */
    /* ------------------------------------------------------------------ */

    /**
     * 侧边栏图标。官方 sidebar 以 `{ size, active }` 渲染本组件
     * （active = 对应面板当前被选中）。
     * @param props - { size, active }。
     */
    function QuickPanelIcon(props) {
      var size = props && typeof props.size === 'number' ? props.size : 16
      var active = !!(props && props.active)
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
        'aria-hidden': 'true', focusable: 'false',
        style: { display: 'block' },
      },
        h('rect', {
          x: 1.6, y: 2.4, width: 12.8, height: 11.2, rx: 2.2,
          stroke: 'currentColor', strokeWidth: active ? 1.7 : 1.3,
        }),
        h('path', {
          d: 'M4.2 6.1h7.6M4.2 8.9h4.8M4.2 11.6h6.2',
          stroke: 'currentColor', strokeWidth: active ? 1.6 : 1.2,
          strokeLinecap: 'round',
        })
      )
    }

    /* ------------------------------------------------------------------ */
    /* 组件：中列面板                                                       */
    /* ------------------------------------------------------------------ */

    /** 一行「标题 + 说明 + 开关按钮」。 */
    function toggleRow(title, description, on, onChange) {
      return h('div', { className: 'dqp-toggle' },
        h('div', null,
          h('div', { className: 'dqp-label' }, title),
          h('p', null, description)
        ),
        h('button', {
          type: 'button',
          className: 'dqp-btn',
          'data-on': on ? '1' : '0',
          'aria-pressed': on ? 'true' : 'false',
          onClick: function () { onChange(!on) },
        }, on ? '已开启' : '已关闭')
      )
    }

    /* ------------------------------------------------------------------ */
    /* 会话记忆                                                            */
    /* ------------------------------------------------------------------ */

    /**
     * 最后一次非空的「当前会话」。
     *
     * 官方语义：会话清单的 `current` 在 Conversation 占据主列时是该会话，一旦
     * 全局面板（本面板）顶替主列就变成 undefined。实测确认了这一点，所以面板
     * 必须自己记住进入面板前的值，否则①会永远拿不到会话。
     */
    var LAST_SESSION_ID = null

    /** 记住当前会话：订阅 + 轮询兜底（面板打开时 current 已经为 undefined）。 */
    function installSessionMemory(ctx) {
      function remember() {
        var id = currentSessionId(ctx)
        if (id !== null) LAST_SESSION_ID = id
      }
      remember()
      var unsub = null
      try {
        var sessions = ctx.get('sessions')
        if (sessions && sessions.list && typeof sessions.list.subscribe === 'function') {
          unsub = sessions.list.subscribe(remember)
        }
      } catch (e) { /* 会话服务不可用 */ }
      var timer = setInterval(remember, 1500)
      if (timer && typeof timer.unref === 'function') timer.unref()
      return function () {
        if (typeof unsub === 'function') safe(unsub)
        clearInterval(timer)
      }
    }

    /** 会话清单里的候选会话（拿不到 current 时的兜底，取第一个）。 */
    function candidateSessionId(ctx) {
      return safe(function () {
        var snapshot = ctx.get('sessions').list.getSnapshot()
        if (snapshot && typeof snapshot.current === 'string' && snapshot.current !== '') return snapshot.current
        var ids = null
        if (snapshot && Array.isArray(snapshot.ids)) ids = snapshot.ids
        else if (snapshot && snapshot.byId && typeof snapshot.byId === 'object') ids = Object.keys(snapshot.byId)
        if (ids && ids.length > 0) return ids[0]
        return null
      }, null)
    }

    /**
     * 面板要操作的目标会话：当前会话 → 记忆中的会话 → 清单里的第一个候选。
     * @returns {{ id: string|null, source: string|null }} source 为 current / remembered / candidate。
     */
    function effectiveSession(ctx) {
      var current = currentSessionId(ctx)
      if (current !== null) return { id: current, source: 'current' }
      if (LAST_SESSION_ID !== null) return { id: LAST_SESSION_ID, source: 'remembered' }
      var candidate = candidateSessionId(ctx)
      if (candidate !== null) return { id: candidate, source: 'candidate' }
      return { id: null, source: null }
    }

    /** 已打开的右侧栏 tab（容错：openTabs 的精确形状没有文档，按多种形状读）。 */
    function readOpenTabs(ctx) {
      return safe(function () {
        var source = ctx.sidebarRight.openTabs
        var list = null
        if (source && typeof source.getSnapshot === 'function') list = source.getSnapshot()
        else if (Array.isArray(source)) list = source
        if (!Array.isArray(list)) return []
        var out = []
        for (var i = 0; i < list.length; i++) {
          var item = list[i]
          if (typeof item === 'string') { out.push({ id: item, label: item }); continue }
          if (!item || typeof item !== 'object') continue
          var label = item.title !== undefined ? item.title
            : (item.label !== undefined ? item.label : (item.kind !== undefined ? item.kind : item.id))
          if (typeof label === 'function') label = safe(label, '')
          var id = item.id !== undefined ? item.id : (item.tabId !== undefined ? item.tabId : label)
          if (typeof id !== 'string' || id === '') continue
          var sid = null
          if (typeof item.sessionId === 'string') sid = item.sessionId
          else if (item.session && typeof item.session.id === 'string') sid = item.session.id
          out.push({
            id: id,
            label: typeof label === 'string' && label !== '' ? label : id,
            sessionId: sid,
          })
        }
        return out
      }, [])
    }

    /** 去重后的标签列表（tab 清单里同一个 kind 会因多会话/多 pane 重复出现）。 */
    function uniqueLabels(tabs, max) {
      var seen = {}
      var out = []
      for (var i = 0; i < tabs.length && out.length < max; i++) {
        var label = tabs[i] && tabs[i].label
        if (typeof label !== 'string' || label === '' || seen[label] === true) continue
        seen[label] = true
        out.push(label)
      }
      return out
    }

    /**
     * 面板主体。挂在 main 槽位的 key `quick-panel` 上。
     * @param props - 框架标准 props + 本插件 inject 的 { ctx }。
     */
    function QuickPanelBody(props) {
      var ctx = (props && props.ctx) || PLUGIN_CTX

      var tickState = React.useState(0)
      var bump = tickState[1]
      var messageState = React.useState(null)
      var message = messageState[0]
      var setMessage = messageState[1]
      var prefsState = React.useState(readPrefs)
      var prefs = prefsState[0]
      var setPrefs = prefsState[1]

      React.useEffect(function () { ensureStyles() }, [])

      // 视图列表与会话都可能变：订阅槽位与会话列表，变了就重渲染。
      React.useEffect(function () {
        if (!ctx) return undefined
        var unsubs = []
        try {
          unsubs.push(ctx.slots.subscribe(VIEW_SLOT, function () { bump(function (n) { return n + 1 }) }))
        } catch (e) { /* 槽位不存在 */ }
        try {
          var sessions = ctx.get('sessions')
          if (sessions && sessions.list && typeof sessions.list.subscribe === 'function') {
            unsubs.push(sessions.list.subscribe(function () { bump(function (n) { return n + 1 }) }))
          }
        } catch (e) { /* 会话服务不可用 */ }
        return function () {
          for (var i = 0; i < unsubs.length; i++) safe(unsubs[i])
        }
      }, [ctx])

      var target = effectiveSession(ctx)
      var sessionId = target.id
      var views = listViews(ctx)
      var preferred = readViewPreference(sessionId)
      var activeView = preferred !== null ? preferred : (views.length > 0 ? views[0].id : null)
      var rightbarOn = rightbarExpanded(ctx)
      var openedTabs = readOpenTabs(ctx)
      var mineTabs = sessionId !== null
        ? openedTabs.filter(function (tab) { return tab.sessionId === sessionId })
        : []
      var shownTabs = mineTabs.length > 0 ? mineTabs : openedTabs
      var tabLabels = uniqueLabels(shownTabs, 6)

      function applyPrefs(next) {
        writePrefs(next)
        setPrefs(next)
        // 改开关不会产生 DOM 变化，主动催一次扫描：否则已挂载的折叠行要等下一次
        // 新节点出现才展开（实测踩到过）。
        if (typeof NUDGE_AUTO_EXPAND === 'function') NUDGE_AUTO_EXPAND()
      }

      return h('div', { className: 'dqp-root' },
        h('div', { className: 'dqp-inner' },
          h('div', { className: 'dqp-head' },
            h('div', null,
              h('h2', { className: 'dqp-title' }, '快捷面板'),
              h('p', { className: 'dqp-sub' }, (sessionId
                ? (target.source === 'current'
                    ? '当前会话：' + sessionId
                    : '目标会话（' + (target.source === 'remembered' ? '记忆' : '候选') + '）：' + sessionId)
                : '还没有可用会话 —— 先在左侧选中一条会话，再回到本面板'))
            ),
            h('button', {
              type: 'button',
              className: 'dqp-btn',
              onClick: function () {
                var error = null
                try { ctx.layout.selectPanel(null) } catch (e) { error = e }
                setMessage(error ? { ok: false, message: '返回会话失败：' + errorText(error) } : { ok: true, message: '已返回会话视图。' })
              },
            }, '返回会话')
          ),

          // ① 会话视图
          h('section', { className: 'dqp-section' },
            h('h3', null, '① 会话视图',
              h('span', { className: 'dqp-hint' },
                activeView ? '当前：' + activeView : '未挂载会话')
            ),
            views.length === 0
              ? h('p', { className: 'dqp-msg' }, '暂时读不到视图列表 —— 会话挂载后这里会列出官方视图（对话 / 轨迹 / 知识库 …）。')
              : h('div', { className: 'dqp-row' },
                  views.map(function (view) {
                    return h('button', {
                      key: view.id,
                      type: 'button',
                      className: 'dqp-btn',
                      'data-on': view.id === activeView ? '1' : '0',
                      onClick: function () {
                        var result = switchConversationView(ctx, sessionId, view.id)
                        if (result.ok) {
                          // 会话视图只在会话里可见：写完偏好就回会话，交给官方 restoreView 生效。
                          try { ctx.layout.selectPanel(null) } catch (e) { /* 已经不在面板上 */ }
                          result = { ok: true, message: '已切到「' + view.label + '」并返回会话。' }
                        }
                        setMessage(result)
                      },
                    }, view.label)
                  })
                ),
            h('p', { className: 'dqp-msg' },
              '视图是「按会话」的偏好（保存在 dsh.conversation.<会话 id> 里）：全局面板打开时对话区已卸载，所以这里写入偏好，返回会话后生效。')
          ),

          // ② 对话区显示选项
          h('section', { className: 'dqp-section' },
            h('h3', null, '② 对话区显示选项'),
            toggleRow(
              '思维链默认展开',
              '自动点开折叠的思维链行。与 dsh-web-enhance 是同一套 DOM 机制，两个插件只开一个即可。',
              prefs.expandThink,
              function (on) { applyPrefs({ expandThink: on, expandAll: on ? false : prefs.expandAll }) }
            ),
            toggleRow(
              '所有折叠行默认展开',
              '含思维链、工具调用等一切折叠行；范围更大，长会话滚动量会明显增加。',
              prefs.expandAll,
              function (on) { applyPrefs({ expandAll: on, expandThink: on ? false : prefs.expandThink }) }
            )
          ),

          // ③ 右侧栏
          h('section', { className: 'dqp-section' },
            h('h3', null, '③ 右侧栏 Tab'),
            h('div', { className: 'dqp-row' },
              PAGE_TABS.map(function (tab) {
                return h('button', {
                  key: tab.kind,
                  type: 'button',
                  className: 'dqp-btn',
                  onClick: function () { setMessage(openRightTab(ctx, tab.kind)) },
                }, tab.label)
              }),
              h('button', {
                type: 'button',
                className: 'dqp-btn',
                onClick: function () { setMessage(toggleRightbar(ctx)) },
              }, '收起 / 展开右侧栏')
            ),
            h('p', { className: 'dqp-msg' },
              '右侧栏当前：' + (rightbarOn ? '已展开' : '已收起') +
              (openedTabs.length === 0
                ? '；没有已打开的 tab'
                : '；' + (mineTabs.length > 0 ? '本会话' : '其它会话') + '已打开 ' + shownTabs.length + ' 个 tab' +
                  (tabLabels.length > 0
                    ? '（' + tabLabels.join('、') + (shownTabs.length > tabLabels.length ? ' 等' : '') + '）'
                    : ''))
            )
          ),

          message
            ? h('p', { className: 'dqp-msg', 'data-kind': message.ok ? 'ok' : 'error' }, message.message)
            : null,

          h('p', { className: 'dqp-foot' },
            '右侧栏 kind 取自各官方包 client.js 的常量：files / terminal / browser / guide 是页面型，可直接按 kind 打开；',
            'text、plan、subagentchat、changes-review、scheduleTask 是资源型，需要 dsh-resource:// 地址，故不在按钮里。'
          )
        )
      )
    }

    /* ------------------------------------------------------------------ */
    /* cordis 客户端插件                                                    */
    /* ------------------------------------------------------------------ */

    /** 必需服务：槽位表、布局导航、会话清单、右侧栏导航与 tab 类型注册表。 */
    var inject = ['slots', 'layout', 'sessions', 'sidebarRight', 'sidebarRightTabs']

    /**
     * 注册两处接线（各自一个 effect，随插件存亡）：
     *  1. `sidebar.panellist` 图标 —— 官方 sidebar 收集条目并负责点击时
     *     `ctx.layout.selectPanel(id)`，本插件不接管点击；
     *  2. `main` 槽位 `key: quick-panel` —— 面板本体。
     * 另外挂上 ② 的自动展开观察器。
     */
    function apply(ctx) {
      PLUGIN_CTX = ctx
      ensureStyles()

      ctx.effect(function () {
        return ctx.slots.inject('sidebar.panellist', function () {
          return ctx.slots.register({
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 40,
            label: function () { return '快捷面板' },
          }, QuickPanelIcon)
        })
      }, 'dsh-quick-panel: sidebar icon')

      ctx.effect(function () {
        return ctx.slots.inject('main', function () {
          return ctx.slots.register({
            name: 'main',
            key: PANEL_ID,
            inject: function () { return { ctx: ctx } },
          }, QuickPanelBody)
        })
      }, 'dsh-quick-panel: main panel')

      ctx.effect(function () { return installAutoExpand(readPrefs) }, 'dsh-quick-panel: auto expand')

      ctx.effect(function () { return installSessionMemory(ctx) }, 'dsh-quick-panel: session memory')
    }

    exports.inject = inject
    exports.apply = apply
    exports.internals = {
      PANEL_ID,
      PAGE_TABS,
      CSS_ID,
      PREF_KEY,
      readPrefs,
      writePrefs,
      currentSessionId,
      effectiveSession,
      installSessionMemory,
      readOpenTabs,
      listViews,
      readViewPreference,
      writeViewPreference,
      pokeConversationViews,
      switchConversationView,
      openRightTab,
      rightbarExpanded,
      toggleRightbar,
      installAutoExpand,
    }
    return module.exports
  },
})
