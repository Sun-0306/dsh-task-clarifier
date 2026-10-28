/**
 * Server-render smoke check for dsh-task-clarifier.
 *
 * This is not a browser test: it runs the REAL React runtime (borrowed from the
 * dsh-market checkout's node_modules) against the page component that the
 * plugin actually registers in the `main` slot, after loading client.js through
 * the same `window.__ModuleLoader__` contract the Web app uses. It catches
 * render-time throws, invalid props/hook usage, missing locale keys and broken
 * state reconstruction from localStorage — the failure modes that would blank
 * the slot in the live GUI.
 *
 * Run: node tests/ssr-render.check.mjs
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pluginDir = path.join(here, '..')
const marketRequire = createRequire('/Users/sunchujun/Desktop/deepseek/dsh-market/package.json')
const React = marketRequire('react')
const ReactDOMServer = marketRequire('react-dom/server')

const SESSION_KEY = 'dsh-task-clarifier.session.v1'
const HISTORY_KEY = 'dsh-task-clarifier.history.v1'
const store = new Map()

globalThis.window = { __ModuleLoader__: { load(definition) { globalThis.__captured = definition } } }
globalThis.document = {
  documentElement: { lang: 'zh-CN' },
  body: { appendChild() {}, removeChild() {} },
  createElement() { return {} },
}
globalThis.localStorage = {
  getItem(key) { return store.has(key) ? store.get(key) : null },
  setItem(key, value) { store.set(key, String(value)) },
  removeItem(key) { store.delete(key) },
}
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { clipboard: { writeText: async function write() {} } },
})

const source = readFileSync(path.join(pluginDir, 'client.js'), 'utf8')
// eslint-disable-next-line no-new-func
new Function('window', 'document', 'localStorage', 'navigator', source)(
  globalThis.window,
  globalThis.document,
  globalThis.localStorage,
  globalThis.navigator,
)
const captured = globalThis.__captured
if (!captured) throw new Error('client.js did not call window.__ModuleLoader__.load')

const module = captured.factory(function requireStub(name) {
  if (name === 'react') return React
  return {}
})
const api = module.__test
const dictionaries = { zh: api.zh, en: api.en }

const registrations = []
const fakeCtx = {
  effect(callback) { return callback() },
  locale: {
    register(namespace, dicts) { registrations.push({ type: 'locale', namespace, dicts }); return function dispose() {} },
    bind() {
      return function translate(key) {
        return Object.prototype.hasOwnProperty.call(dictionaries.zh, key) ? dictionaries.zh[key] : key
      }
    },
  },
  slots: {
    inject(slot, callback) { return callback() },
    register(options, component) { registrations.push({ type: 'register', options, component }); return function dispose() {} },
  },
  get() { return undefined },
}
module.apply(fakeCtx)

const pageRegistration = registrations.find(
  entry => entry.type === 'register' && entry.options.name === 'main',
)
const sidebarRegistration = registrations.find(
  entry => entry.type === 'register' && entry.options.name === 'sidebar.panellist',
)
if (!pageRegistration || !sidebarRegistration) throw new Error('slot registrations missing')
const Page = pageRegistration.component

function render(label, element) {
  const logged = []
  const originalError = console.error
  const originalWarn = console.warn
  console.error = function captureError(...args) { logged.push('error: ' + args.map(String).join(' ')) }
  console.warn = function captureWarn(...args) { logged.push('warn: ' + args.map(String).join(' ')) }
  let html = ''
  let failure = null
  try {
    html = ReactDOMServer.renderToString(element)
  } catch (error) {
    failure = error
  } finally {
    console.error = originalError
    console.warn = originalWarn
  }
  return { label, html, failure, logged }
}

const results = []
function check(label, condition, detail) {
  results.push({ label, ok: Boolean(condition), detail: detail || '' })
}

function seedSession(patch) {
  store.delete(SESSION_KEY)
  store.set(SESSION_KEY, JSON.stringify(Object.assign({
    id: 'test-session',
    stage: 'input',
    raw: '',
    mode: 'standard',
    style: 'standard',
    assume: 'assume',
    answers: {},
    overrides: [],
    notes: [],
    saved: false,
    updatedAt: Date.now(),
  }, patch)))
}

function seedHistory() {
  store.set(HISTORY_KEY, JSON.stringify([{
    id: 'hist-1',
    raw: '把上一季度的销售数据整理成对比表格',
    intent: 'analyze',
    createdAt: Date.now() - 3600 * 1000,
    standard: '# 任务\n\n把上一季度的销售数据整理成对比表格\n',
    compact: '任务：把上一季度的销售数据整理成对比表格\n',
    mode: 'standard',
    style: 'standard',
    assume: 'assume',
    answers: {},
    overrides: [],
    notes: [],
    score: 60,
  }]))
}

const KEY_LEAK = /\b(?:panel|landing|flow|preview|history|toast|ready|assume|mode|dim|section|error)\.[a-zA-Z]/g

// ── 1. landing on a clean browser ────────────────────────────────────────
seedSession({})
store.delete(HISTORY_KEY)
const landing = render('landing', React.createElement(Page))
check('landing renders without throwing', !landing.failure, landing.failure && String(landing.failure))
check('landing shows the headline', landing.html.includes('你想让 DSH 做什么'), '')
check('landing shows the empty preview', landing.html.includes('任务书会实时生成'), '')
check('landing ships the stylesheet', landing.html.includes('<style>') && landing.html.includes('.dtc-root'), '')
check('landing has no react warnings', landing.logged.filter(line => line.startsWith('error:')).length === 0, landing.logged.join(' | '))
check('landing has no locale key leak', !KEY_LEAK.test(landing.html), '')
check('landing renders privacy footnote', landing.html.includes('数据只保存在本机浏览器'), '')

// ── 2. sidebar glyph with the shell's props ──────────────────────────────
const iconInactive = render('icon-inactive', React.createElement(sidebarRegistration.component, { size: 16, active: false }))
const iconActive = render('icon-active', React.createElement(sidebarRegistration.component, { size: 16, active: true }))
check('sidebar glyph renders an svg', iconInactive.html.includes('<svg') && iconInactive.html.includes('viewBox="0 0 16 16"'), '')
check('sidebar glyph reflects active state', iconActive.html.includes('stroke-width="1.6"') && iconInactive.html.includes('stroke-width="1.35"'), '')

// ── 3. mid-flow state restored from localStorage ─────────────────────────
seedSession({
  stage: 'flow',
  raw: '帮我做一个带左侧栏入口的 DSH 插件，用来整理会议纪要',
  answers: {
    build_deliverable: { values: ['ready'], text: '', skipped: false },
    build_scope: { values: ['cwd'], text: '', skipped: false },
  },
})
const flow = render('flow', React.createElement(Page))
check('flow renders a question card', flow.html.includes('怎样算完成'), '')
check('flow shows progress', flow.html.includes('已澄清'), '')
check('flow shows answered cards', flow.html.includes('可直接使用的成品'), '')
check('flow shows detected auto chip', flow.html.includes('自动识别') && flow.html.includes('DSH'), '')
check('flow preview contains a task heading', flow.html.includes('任务') && flow.html.includes('执行约定'), '')
check('flow has no react warnings', flow.logged.filter(line => line.startsWith('error:')).length === 0, flow.logged.join(' | '))
check('flow has no locale key leak', !KEY_LEAK.test(flow.html), '')

// ── 4. ready state with a full answer set ────────────────────────────────
const readyAnswers = {
  build_deliverable: { values: ['ready'], text: '', skipped: false },
  build_scope: { values: ['cwd'], text: '新建在 dsh-meeting-notes/', skipped: false },
  build_acceptance: { values: ['runs', 'demo'], text: '', skipped: false },
  build_features: { values: ['ui', 'persist'], text: '', skipped: false },
  build_constraints: { values: [], text: '不要引入第三方依赖', skipped: false },
  confirm: { values: ['yes'], text: '', skipped: false },
}
seedSession({
  stage: 'ready',
  raw: '帮我做一个带左侧栏入口的 DSH 插件，用来整理会议纪要',
  answers: readyAnswers,
})
const ready = render('ready', React.createElement(Page))
check('ready renders the completion card', ready.html.includes('澄清完成'), '')
check('ready renders copy + start actions', ready.html.includes('复制任务书') && ready.html.includes('开始执行'), '')
check('ready renders token metrics', ready.html.includes('tokens') && ready.html.includes('信息完整度'), '')
check('ready renders the standard brief sections', ready.html.includes('交付物') && ready.html.includes('验收标准') && ready.html.includes('执行约定'), '')
check('ready keeps the no-re-ask rule', ready.html.includes('不要反问'), '')
check('ready has no react warnings', ready.logged.filter(line => line.startsWith('error:')).length === 0, ready.logged.join(' | '))

// ── 5. compact style + english input ─────────────────────────────────────
seedSession({
  stage: 'ready',
  style: 'compact',
  raw: 'Build me a DSH plugin with a left-sidebar entry that turns meeting notes into action items',
  answers: {
    build_deliverable: { values: ['ready'], text: '', skipped: false },
    build_acceptance: { values: ['runs'], text: '', skipped: false },
    build_constraints: { values: [], text: 'no third-party dependencies', skipped: false },
    confirm: { values: ['yes'], text: '', skipped: false },
  },
})
const compactEnglish = render('compact-en', React.createElement(Page))
check('english input yields an english brief', compactEnglish.html.includes('Task: ') && compactEnglish.html.includes('Deliverable: '), '')
check('compact brief carries the rules line', compactEnglish.html.includes('Rules: '), '')
check('english brief uses english separators', !compactEnglish.html.includes('Task：') && !compactEnglish.html.includes('Deliverable：'), '')
check('compact has no locale key leak', !KEY_LEAK.test(compactEnglish.html), '')

// ── 6. history list on the landing page ──────────────────────────────────
seedSession({})
seedHistory()
const withHistory = render('history', React.createElement(Page))
check('history renders recent tasks', withHistory.html.includes('最近的任务') && withHistory.html.includes('上一季度的销售数据'), '')
check('history renders an open action', withHistory.html.includes('重新澄清'), '')

// ── 7. corrupt storage must not break the page ───────────────────────────
store.set(SESSION_KEY, '{not json')
store.set(HISTORY_KEY, '[]garbage')
const corrupt = render('corrupt', React.createElement(Page))
check('corrupt localStorage still renders', !corrupt.failure && corrupt.html.includes('你想让 DSH 做什么'), corrupt.failure && String(corrupt.failure))

// ── report ───────────────────────────────────────────────────────────────
let failed = 0
for (const result of results) {
  if (!result.ok) failed += 1
  console.log((result.ok ? 'PASS  ' : 'FAIL  ') + result.label + (result.ok || !result.detail ? '' : ' — ' + result.detail))
}
console.log('\n' + (results.length - failed) + '/' + results.length + ' render checks passed')
if (failed > 0) process.exitCode = 1
