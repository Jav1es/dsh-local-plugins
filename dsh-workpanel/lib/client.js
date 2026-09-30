/**
 * dsh-workpanel — client half (browser).
 *
 * Registers ONE native right-sidebar tab that splits vertically into two
 * always-visible panels:
 *   ┌─────────────────────┐
 *   │  思考过程 (reasoning) │  ← useTrajectory()
 *   ├──────── ────────────┤  ← draggable splitter
 *   │  待办清单 (todo)      │  ← useProjection('todos')
 *   └─────────────────────┘
 *
 * Implementation follows dsh-my-context's native pattern: ctx.sidebarRightTabs
 * declares the tab type; ctx.slots (keyed seats sidebar.right.pane.tab /
 * .title) render the body and title.
 */
window.__ModuleLoader__.load({
  id: 'dsh-workpanel',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const { createElement: h, useState, useRef, useMemo, useEffect } = require('react')

    const TAB_ID = 'dsh-workpanel'
    const TAB_KIND = 'dsh-workpanel:panel'
    const TAB_ORDER = 44

    // ── Styles ──────────────────────────────────────────────────────────────
    const CSS = `
.dsh-wp-root { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.dsh-wp-pane { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.dsh-wp-pane-head { flex: none; display: flex; align-items: center; gap: 8px; padding: 8px 14px 6px; font-weight: 600; font-size: 13px; color: var(--dsw-alias-label-primary,#222); }
.dsh-wp-pane-head .dsh-wp-count { margin-left: auto; font-weight: 400; font-size: 11px; color: var(--dsw-alias-label-tertiary,#8a8f98); font-variant-numeric: tabular-nums; }
.dsh-wp-pane-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 2px 14px 10px; scrollbar-width: thin; }
.dsh-wp-split { flex: none; height: 5px; cursor: row-resize; background: var(--dsw-alias-border-l2,rgba(200,200,210,.3)); position: relative; }
.dsh-wp-split:hover { background: var(--dsw-alias-border-l3,rgba(200,200,210,.5)); }
.dsh-wp-split::after { content:''; position:absolute; left:50%; top:1px; transform:translateX(-50%); width:32px; height:3px; border-radius:2px; background:var(--dsw-alias-label-tertiary,rgba(138,143,152,.5)); }
.dsh-wp-bar { flex:none; height:3px; background:var(--dsw-alias-border-l2,rgba(200,200,210,.35)); }
.dsh-wp-bar-fill { height:100%; background:var(--dsw-static-blue-500,#3b82f6); border-radius:0 2px 2px 0; transition:width .3s ease,background .3s ease; }
.dsh-wp-bar-fill.full { background:var(--dsw-alias-state-success-primary,#16a34a); }
.dsh-wp-item { display:flex; align-items:flex-start; gap:9px; padding:3px 0; }
.dsh-wp-glyph { flex:none; width:15px; height:15px; margin-top:2px; display:grid; place-items:center; font-size:11px; line-height:1; }
.dsh-wp-item[data-status="in_progress"] .dsh-wp-glyph { color:var(--dsw-static-blue-500,#3b82f6); }
.dsh-wp-item[data-status="completed"] .dsh-wp-glyph { color:var(--dsw-alias-state-success-primary,#16a34a); }
.dsh-wp-item[data-status="pending"] .dsh-wp-glyph { color:var(--dsw-alias-label-tertiary,#8a8f98); }
.dsh-wp-text { min-width:0; word-break:break-word; font-size:12px; line-height:1.5; }
.dsh-wp-item[data-status="in_progress"] .dsh-wp-text { font-weight:500; }
.dsh-wp-item[data-status="completed"] .dsh-wp-text { text-decoration:line-through; color:var(--dsw-alias-label-tertiary,#8a8f98); }
.dsh-wp-item[data-status="pending"] .dsh-wp-text { color:var(--dsw-alias-label-secondary,#61666b); }
.dsh-wp-section { margin-top:10px; padding-top:6px; border-top:1px solid var(--dsw-alias-border-l2,rgba(200,200,210,.3)); font-size:11px; font-weight:600; color:var(--dsw-alias-label-tertiary,#8a8f98); }
.dsh-wp-reason { margin-bottom:8px; padding:7px 10px; border-radius:8px; border-left:2px solid var(--dsw-alias-border-l2,rgba(200,200,210,.5)); background:var(--dsw-alias-bg-layer-2,rgba(200,200,210,.08)); color:var(--dsw-alias-label-secondary,#61666b); font-size:12px; line-height:1.55; white-space:pre-wrap; word-break:break-word; }
.dsh-wp-reason[data-live="1"] { border-left-color:var(--dsw-static-blue-500,#3b82f6); }
.dsh-wp-reason-head { display:flex; align-items:center; gap:6px; margin-bottom:2px; font-size:11px; color:var(--dsw-alias-label-tertiary,#8a8f98); }
.dsh-wp-empty { padding:24px 16px; text-align:center; color:var(--dsw-alias-label-tertiary,#8a8f98); font-size:12px; }
`
    function injectStyles() {
      if (document.querySelector('style[data-dsh-workpanel]')) return () => {}
      const el = document.createElement('style')
      el.setAttribute('data-dsh-workpanel', '')
      el.textContent = CSS
      document.head.appendChild(el)
      return () => { try { el.remove() } catch {} }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────
    function glyphFor(status) {
      if (status === 'completed') return '✓'
      if (status === 'in_progress') return '◐'
      return '○'
    }
    function todoRow(raw) {
      if (raw == null || typeof raw !== 'object') return null
      const content = typeof raw.content === 'string' ? raw.content : (typeof raw.text === 'string' ? raw.text : '')
      if (content.trim() === '') return null
      const map = { completed:'completed', done:'completed', in_progress:'in_progress', running:'in_progress', pending:'pending', todo:'pending' }
      return { content, status: map[raw.status] || 'pending' }
    }

    /** Defensive extraction of reasoning rows from whatever trajectory shape. */
    function extractReasoning(traj) {
      if (traj == null) return []
      let entries = null
      if (Array.isArray(traj)) entries = traj
      else if (Array.isArray(traj.entries)) entries = traj.entries
      else if (Array.isArray(traj.rows)) entries = traj.rows
      else if (Array.isArray(traj.items)) entries = traj.items
      else if (Array.isArray(traj.records)) entries = traj.records
      if (entries === null) return []
      const out = []
      for (const e of entries) {
        if (e == null || typeof e !== 'object') continue
        const kind = typeof e.kind === 'string' ? e.kind : (typeof e.type === 'string' ? e.type : '')
        if (kind !== 'reasoning' && kind !== 'thinking' && kind !== 'thought') continue
        const text = typeof e.text === 'string' ? e.text
          : (typeof e.content === 'string' ? e.content
            : (Array.isArray(e.content) ? e.content.map(c => (c && typeof c.text === 'string') ? c.text : '').join('') : ''))
        if (typeof text !== 'string' || text.trim() === '') continue
        out.push({ text, live: e.settled === false, seq: typeof e.seq === 'number' ? e.seq : out.length })
      }
      return out
    }

    // ── Reasoning pane ──────────────────────────────────────────────────────
    function ReasoningPane(props) {
      let traj = null
      try { if (typeof props.useTrajectory === 'function') traj = props.useTrajectory() } catch {}
      const rows = useMemo(() => extractReasoning(traj), [traj])
      return h('div', { className: 'dsh-wp-pane' },
        h('div', { className: 'dsh-wp-pane-head' }, '思考过程',
          h('span', { className: 'dsh-wp-count' }, rows.length > 0 ? rows.length + ' 段' : '')),
        h('div', { className: 'dsh-wp-pane-body' },
          rows.length === 0
            ? h('div', { className: 'dsh-wp-empty' }, '暂无思考记录')
            : rows.map((r, i) => h('div', { key:'r'+i, className:'dsh-wp-reason', 'data-live':r.live?'1':'0' },
                r.live ? h('div', { className: 'dsh-wp-reason-head' }, '✻ 思考中…') : null,
                r.text))))
    }

    // ── Todo pane ───────────────────────────────────────────────────────────
    function TodoPane(props) {
      let todos = null
      try { if (typeof props.useProjection === 'function') todos = props.useProjection('todos') } catch {}
      const rows = useMemo(() => (Array.isArray(todos) ? todos : []).map(todoRow).filter(Boolean), [todos])
      const total = rows.length
      const done = rows.filter(r => r.status === 'completed').length
      const active = rows.filter(r => r.status !== 'completed')
      const finished = rows.filter(r => r.status === 'completed')
      const pct = total === 0 ? 0 : Math.round(done / total * 100)

      return h('div', { className: 'dsh-wp-pane' },
        h('div', { className: 'dsh-wp-pane-head' }, '待办清单',
          h('span', { className: 'dsh-wp-count' }, total > 0 ? done + ' / ' + total : '')),
        total > 0 && h('div', { className: 'dsh-wp-bar' },
          h('div', { className: 'dsh-wp-bar-fill' + (pct >= 100 ? ' full' : ''), style: { width: pct + '%' } })),
        h('div', { className: 'dsh-wp-pane-body' },
          total === 0
            ? h('div', { className: 'dsh-wp-empty' }, '暂无待办步骤')
            : [
                active.map((r, i) => h('div', { key:'a'+i, className:'dsh-wp-item', 'data-status':r.status },
                  h('span', { className:'dsh-wp-glyph' }, glyphFor(r.status)),
                  h('span', { className:'dsh-wp-text' }, r.content))),
                finished.length > 0 && h('div', { key:'sec', className:'dsh-wp-section' }, '已完成 ' + finished.length + ' 项'),
                finished.map((r, i) => h('div', { key:'f'+i, className:'dsh-wp-item', 'data-status':r.status },
                  h('span', { className:'dsh-wp-glyph' }, glyphFor(r.status)),
                  h('span', { className:'dsh-wp-text' }, r.content)))
              ]))
    }

    // ── Split pane container (vertical, draggable splitter) ─────────────────
    function SplitPanels(props) {
      // Top pane flex-basis as percentage; persisted in localStorage.
      const [topPct, setTopPct] = useState(() => {
        try { const v = parseFloat(window.localStorage.getItem('dsh-wp-split')); return (v >= 10 && v <= 90) ? v : 55 } catch { return 55 }
      })
      const dragging = useRef(false)
      const rootRef = useRef(null)

      useEffect(() => {
        const onMove = (e) => {
          if (!dragging.current || !rootRef.current) return
          const rect = rootRef.current.getBoundingClientRect()
          const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top
          const pct = Math.max(10, Math.min(90, (y / rect.height) * 100))
          setTopPct(pct)
        }
        const onUp = () => {
          if (dragging.current) {
            dragging.current = false
            try { window.localStorage.setItem('dsh-wp-split', String(topPct)) } catch {}
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
          }
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        window.addEventListener('touchmove', onMove)
        window.addEventListener('touchend', onUp)
        return () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
          window.removeEventListener('touchmove', onMove)
          window.removeEventListener('touchend', onUp)
        }
      }, [topPct])

      const startDrag = (e) => {
        e.preventDefault()
        dragging.current = true
        document.body.style.cursor = 'row-resize'
        document.body.style.userSelect = 'none'
      }

      return h('div', { ref: rootRef, className: 'dsh-wp-root' },
        h('div', { className: 'dsh-wp-pane', style: { flex: '1 1 ' + (100 - topPct) + '%', minHeight: 0 } },
          h(ReasoningPane, props)),
        h('div', { className: 'dsh-wp-split', onMouseDown: startDrag, onTouchStart: startDrag }),
        h('div', { className: 'dsh-wp-pane', style: { flex: '1 1 ' + topPct + '%', minHeight: 0 } },
          h(TodoPane, props)))
    }

    // ── Tab body / title (native slot contract) ──────────────────────────────
    function PanelTabBody(props) {
      let info
      try { if (typeof props.useTabInfo === 'function') info = props.useTabInfo() } catch {}
      const visible = info && info.tab && info.tab.visible !== false
      if (!visible) return null
      return h(SplitPanels, props)
    }
    function PanelTabTitle() { return h('span', null, '工作台') }

    // ── Plugin body ─────────────────────────────────────────────────────────
    exports.inject = ['slots', 'sidebarRightTabs']

    exports.apply = function apply(ctx) {
      ctx.effect(() => injectStyles(), 'dsh-workpanel: styles')

      const tabs = ctx.sidebarRightTabs
      const slots = ctx.slots
      if (tabs == null || slots == null) return

      const diag = (what, err) => { try { console.error('[dsh-workpanel] ' + what + ' 注册失败:', err) } catch {} }

      ctx.effect(
        () => { try { return tabs.register({
          id: TAB_ID, kind: TAB_KIND,
          title: () => '工作台',
          guide: [{ id: TAB_ID, order: TAB_ORDER, title: () => '工作台', description: () => '思考过程 + 待办清单（上下分栏）' }],
        }) } catch (e) { diag('tab type', e); return () => {} } },
        'dsh-workpanel: tab type',
      )
      ctx.effect(
        () => { try { return slots.inject('sidebar.right.pane.tab', () =>
          slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, PanelTabBody)) } catch (e) { diag('tab body', e); return () => {} } },
        'dsh-workpanel: tab body',
      )
      ctx.effect(
        () => { try { return slots.inject('sidebar.right.pane.tab.title', () =>
          slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID }, PanelTabTitle)) } catch (e) { diag('tab title', e); return () => {} } },
        'dsh-workpanel: tab title',
      )
    }

    return module.exports
  },
})
