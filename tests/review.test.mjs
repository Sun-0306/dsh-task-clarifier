/**
 * Independent adversarial review tests for dsh-task-clarifier (browser half).
 *
 * Written by the independent verifier, separately from the author's own tests.
 * Unlike tests/engine.test.mjs (stub React), this file loads client.js exactly
 * as the Web loader does but drives it with the REAL React 18 runtime and jsdom
 * borrowed from the local dsh-market checkout (same technique as
 * tests/interaction.check.mjs). That lets the review exercise the real slot
 * component, real hooks/effects, real localStorage round-trips and the real
 * DOM, not just the pure engine.
 *
 * Coverage:
 *   · registration contract (sidebar.panellist row + keyed `main` page, effect
 *     scoping, locale thunk, package/cordis manifest)
 *   · i18n (every static t() key, interpolation params, dynamic key families,
 *     no raw key leaks in rendered DOM)
 *   · engine edge cases (empty/whitespace/punctuation, 50k-char input,
 *     null/number/object inputs, language/intent edges, all 10 intents × 3
 *     modes, deep→fast mode switching, auto-dims + overrides, `when` follow-ups,
 *     malformed answers, brief composition, metrics)
 *   · CSS token/scoping compliance (static)
 *   · render-time throw risk (corrupt localStorage, error boundary, odd props)
 *   · state machine through the DOM (skip/back/edit, mode switch, auto override,
 *     confirm→ready, history open/reuse/delete/clear, copy, conversation hand-off,
 *     missing optional services, locale switch, hook-order stability)
 *
 * Known defects are encoded as node:test `todo` cases: they run and document the
 * expected correct behaviour without turning the suite red. Everything else must
 * pass. Run:
 *   node --test tests/engine.test.mjs tests/review.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pluginDir = path.join(here, '..')
const clientPath = path.join(pluginDir, 'client.js')
const CLIENT_SOURCE = readFileSync(clientPath, 'utf8')

// ── real React + jsdom (installed before react-dom is required) ─────────────
const MARKET = '/Users/sunchujun/Desktop/deepseek/dsh-market/package.json'
const marketRequire = createRequire(MARKET)
const { JSDOM } = marketRequire('jsdom')
const dom = new JSDOM('<!doctype html><html lang="zh-CN"><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})
const { window } = dom
const { document } = window
globalThis.window = window
globalThis.document = document
globalThis.localStorage = window.localStorage
globalThis.HTMLElement = window.HTMLElement
globalThis.Node = window.Node
globalThis.Event = window.Event
globalThis.MouseEvent = window.MouseEvent
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: window.navigator })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
// React 18 feature-detects document.oninput; jsdom lacks it and React would take
// its legacy IE polyfill path.
if (!('oninput' in document)) Object.defineProperty(document, 'oninput', { configurable: true, value: null })

const React = marketRequire('react')
const ReactDOMClient = marketRequire('react-dom/client')

const copied = []
Object.defineProperty(window.navigator, 'clipboard', {
  configurable: true,
  value: { writeText: async function writeText(text) { copied.push(String(text)) } },
})

const SESSION_KEY = 'dsh-task-clarifier.session.v1'
const HISTORY_KEY = 'dsh-task-clarifier.history.v1'
const SETTINGS_KEY = 'dsh-task-clarifier.settings.v1'
const NS = 'dsh-task-clarifier'
const PANEL_ID = 'task-clarifier'

// ── load client.js through the real Web loader contract ─────────────────────
let captured = null
window.__ModuleLoader__ = { load(definition) { captured = definition } }
// eslint-disable-next-line no-new-func
new Function('window', 'document', 'localStorage', 'navigator', CLIENT_SOURCE)(
  window,
  document,
  window.localStorage,
  window.navigator,
)
assert.ok(captured, 'client.js must call window.__ModuleLoader__.load')
const pluginModule = captured.factory(function requireStub(name) {
  return name === 'react' ? React : {}
})
const api = pluginModule.__test
assert.ok(api, 'module exposes __test handles')
const DICTS = { zh: api.zh, en: api.en }

// ── fake client context / services ──────────────────────────────────────────
let activeLanguage = 'zh'
const localeSubscribers = new Set()
const fakeLocale = {
  register() { return function dispose() {} },
  bind() {
    return function translate(key) {
      const dict = DICTS[activeLanguage] || DICTS.zh
      return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key
    }
  },
  subscribe(fn) {
    localeSubscribers.add(fn)
    return function unsubscribe() { localeSubscribers.delete(fn) }
  },
}

const calls = { startSession: [], selectPanel: [] }
const defaultServices = {
  uiWorkspace: {
    startSession(workspaceId, options) { calls.startSession.push({ workspaceId, options }) },
  },
  layout: {
    selectPanel(panelId) { calls.selectPanel.push(panelId) },
  },
}

let registrations = []
let effects = []
function applyPlugin(options = {}) {
  registrations = []
  effects = []
  const ctx = {
    effect(callback, label) {
      const dispose = callback()
      effects.push({ label, dispose })
      return dispose
    },
    locale: fakeLocale,
    slots: {
      inject(slot, callback) {
        if (options.slotOwners === false) return function noop() {}
        return callback()
      },
      register(registerOptions, component) {
        registrations.push({ options: registerOptions, component })
        return function dispose() {}
      },
    },
    get(name) {
      if (options.throwingGet) throw new Error('no service registry')
      if (options.services === false) return undefined
      if (options.services) return options.services[name]
      return defaultServices[name]
    },
  }
  pluginModule.apply(ctx)
}
applyPlugin()

const sidebarRegistration = () => registrations.find(entry => entry.options.name === 'sidebar.panellist')
const mainRegistration = () => registrations.find(entry => entry.options.name === 'main')
const Page = mainRegistration().component
const SidebarIcon = sidebarRegistration().component

// ── tiny DOM driver ─────────────────────────────────────────────────────────
let root = null
let container = null
async function flush() {
  await React.act(async function flushAct() {
    await new Promise(function wait(resolve) { setTimeout(resolve, 0) })
  })
}
async function mount(element) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = ReactDOMClient.createRoot(container)
  const tree = element || React.createElement(Page)
  await React.act(async function mountAct() { root.render(tree) })
  await flush()
  return container
}
async function unmount() {
  const current = root
  root = null
  if (current) await React.act(async function unmountAct() { current.unmount() })
  if (container) { container.remove(); container = null }
  document.body.innerHTML = ''
}
async function mountPage() { return mount(React.createElement(Page)) }
async function beginReview(t) {
  await unmount()
  window.localStorage.clear()
  copied.length = 0
  calls.startSession.length = 0
  calls.selectPanel.length = 0
  activeLanguage = 'zh'
  applyPlugin()
  if (t) t.after(async function cleanup() { await unmount() })
}
function all(selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)) }
function textOf(element) {
  return (element && element.textContent ? element.textContent : '').replace(/\s+/g, ' ').trim()
}
function findButton(label) {
  return all('button').filter(button => textOf(button) === label)[0]
}
function findButtonContaining(fragment) {
  return all('button').filter(button => textOf(button).indexOf(fragment) >= 0)[0]
}
async function click(element) {
  assert.ok(element, 'click target must exist')
  await React.act(async function clickAct() {
    element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await flush()
}
async function typeInto(element, value) {
  assert.ok(element, 'input/textarea must exist')
  await React.act(async function typeAct() {
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
    descriptor.set.call(element, value)
    element.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  await flush()
}
async function setLanguage(language) {
  activeLanguage = language
  await React.act(async function localeAct() {
    for (const listener of Array.prototype.slice.call(Array.from(localeSubscribers))) listener()
  })
  await flush()
}
function landingTextarea() { return document.querySelector('.dtc-landing textarea') }
function currentQuestionTitle() { return textOf(document.querySelector('.dtc-q .dtc-q-title')) }
function answeredCards() { return all('.dtc-answer') }
function progressText() { return textOf(document.querySelector('.dtc-progress-text')) }
function briefText() { return textOf(document.querySelector('.dtc-preview .dtc-brief')) }
function toastText() { return textOf(document.querySelector('.dtc-toast')) }
function sessionStore() {
  const raw = window.localStorage.getItem(SESSION_KEY)
  return raw ? JSON.parse(raw) : null
}
function historyStore() {
  const raw = window.localStorage.getItem(HISTORY_KEY)
  return raw ? JSON.parse(raw) : null
}
function settingsStore() {
  const raw = window.localStorage.getItem(SETTINGS_KEY)
  return raw ? JSON.parse(raw) : null
}
function segmentIn(scopeSelector, label) {
  const scope = document.querySelector(scopeSelector)
  return scope
    ? Array.prototype.slice.call(scope.querySelectorAll('.dtc-seg-btn')).filter(button => textOf(button) === label)[0]
    : undefined
}
function seedSession(patch) {
  const base = {
    id: 'seed-task',
    stage: 'ready',
    raw: '帮我做一个插件',
    mode: 'standard',
    style: 'standard',
    assume: 'assume',
    answers: {
      build_deliverable: { values: ['ready'], text: '', skipped: false, at: 1 },
    },
    overrides: [],
    notes: [],
    saved: true,
    updatedAt: 1,
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(Object.assign({}, base, patch)))
}
async function startFlow(raw) {
  await typeInto(landingTextarea(), raw)
  await click(findButton('开始澄清'))
}
async function answerWithFirstOption() {
  const options = all('.dtc-option')
  if (options.length > 0) await click(options[0])
  else {
    const textarea = document.querySelector('.dtc-q textarea')
    if (textarea) await typeInto(textarea, '补充说明')
  }
  await click(findButton('下一步'))
}
async function driveToConfirm(note) {
  for (let guard = 0; guard < 20; guard += 1) {
    if (document.querySelector('.dtc-q-confirm')) {
      if (note) await typeInto(document.querySelector('.dtc-q-confirm textarea'), note)
      await click(findButton('对，生成任务书'))
      return
    }
    await answerWithFirstOption()
  }
  throw new Error('the flow never reached the confirm card')
}
function spyConsole() {
  const messages = []
  const original = console.error
  console.error = function capture() {
    messages.push(Array.prototype.map.call(arguments, value => String(value)).join(' '))
  }
  return {
    messages,
    restore() { console.error = original },
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Registration / lifecycle / manifest
// ════════════════════════════════════════════════════════════════════════════
test('registers the left-sidebar row and the keyed main page the shell expects', () => {
  applyPlugin()
  const sidebar = sidebarRegistration()
  const main = mainRegistration()
  assert.ok(sidebar, 'sidebar.panellist occupant registered')
  assert.ok(main, 'main occupant registered')
  assert.equal(sidebar.options.name, 'sidebar.panellist')
  assert.equal(sidebar.options.id, PANEL_ID)
  assert.equal(sidebar.options.order, 40, 'row order matches the delivered contract')
  assert.equal(sidebar.options.locale, NS)
  assert.equal(typeof sidebar.options.label, 'function', 'label must be a locale thunk, not a frozen string')
  assert.equal(typeof sidebar.component, 'function', 'row provides a glyph component')
  assert.equal(main.options.key, PANEL_ID, 'main key is the sidebar row id')
  assert.equal(main.options.locale, NS)
  assert.equal(typeof main.component, 'function')
  assert.equal(pluginModule.name, NS)
  assert.deepEqual(pluginModule.inject, ['slots', 'locale'])
  assert.equal(pluginModule.apply.length, 1)

  const pkg = JSON.parse(readFileSync(path.join(pluginDir, 'package.json'), 'utf8'))
  assert.equal(pkg.name, 'dsh-task-clarifier')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.dsh.client.immediately, true)
  for (const activation of [
    '@deepseek-ai/dsh-client-ui-layout',
    '@deepseek-ai/dsh-client-ui-sidebar',
    '@deepseek-ai/dsh-client-locale',
  ]) {
    assert.ok(pkg.dsh.client.inject.indexOf(activation) >= 0, 'activation order includes ' + activation)
  }
  const patch = readFileSync(path.join(pluginDir, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /- insert:/)
  assert.match(patch, /id: task-clarifier/)
  assert.match(patch, /name: dsh-task-clarifier/)
})

test('sidebar label re-resolves from the locale service on language change', () => {
  applyPlugin()
  const label = sidebarRegistration().options.label
  activeLanguage = 'zh'
  assert.equal(label(), '任务澄清')
  activeLanguage = 'en'
  assert.equal(label(), 'Task Clarifier')
  activeLanguage = 'zh'
  assert.equal(label(), '任务澄清')
})

test('apply keeps registrations in effects, survives re-activation and absent slot owners', () => {
  applyPlugin()
  assert.ok(effects.length >= 3, 'locale + two slot registrations are effect-scoped')
  for (const effect of effects) {
    assert.match(String(effect.label), /^dsh-task-clarifier: /, 'effect is labelled for teardown: ' + effect.label)
    assert.equal(typeof effect.dispose, 'function', 'effect returns a disposer: ' + effect.label)
  }
  for (const effect of effects) assert.doesNotThrow(() => effect.dispose(), 'disposer must not throw: ' + effect.label)
  assert.doesNotThrow(() => applyPlugin(), 'a second activation (HMR / profile patch) must not throw')

  applyPlugin({ slotOwners: false })
  assert.equal(registrations.length, 0, 'no registration is attempted while the owning slots are absent')
  assert.doesNotThrow(() => effects.forEach(effect => effect.dispose()))
  applyPlugin()
})

test('client source requires only react and imports no Harness Client package', () => {
  const requires = Array.from(CLIENT_SOURCE.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)).map(match => match[1])
  assert.deepEqual(Array.from(new Set(requires)), ['react'], 'the module table entry is the only runtime import')
  assert.doesNotMatch(CLIENT_SOURCE, /^\s*import\s/m, 'classic browser module: no ESM import statements')
  assert.doesNotMatch(CLIENT_SOURCE, /from\s+['"]@deepseek-ai\//, 'no Harness Client package imports')
  assert.doesNotMatch(CLIENT_SOURCE, /document\.body\.appendChild\(area\)\s*;?\s*$/m.source ? /x^/ : /x^/) // placeholder, checked below
  // `throwing` guard: the only document.body writes must be the transient clipboard fallback
  const bodyWrites = Array.from(CLIENT_SOURCE.matchAll(/document\.body\.(appendChild|removeChild)/g)).length
  assert.ok(bodyWrites <= 2, 'document.body is only touched by the transient legacy-clipboard textarea')
})

test('Page wraps the app in an error boundary that renders a recovery card', async (t) => {
  await beginReview(t)
  const pageElement = Page()
  assert.equal(typeof pageElement.type, 'function', 'Page renders an error boundary component')
  assert.equal(typeof pageElement.type.getDerivedStateFromError, 'function', 'boundary implements getDerivedStateFromError')
  assert.equal(typeof pageElement.props.children, 'object', 'boundary wraps the app element')
  assert.equal(pageElement.props.children.type.name, 'ClarifierApp')

  const spy = spyConsole()
  try {
    function Boom() { throw new Error('render crash injected by the review suite') }
    await mount(React.createElement(pageElement.type, null, React.createElement(Boom)))
  } finally {
    spy.restore()
  }
  const crash = document.querySelector('.dtc-crash')
  assert.ok(crash, 'a throwing child must show the crash card instead of blanking the slot')
  assert.match(textOf(crash), /任务澄清器出错了/)
  assert.ok(findButton('重试'), 'the crash card offers a retry action')
})

// ════════════════════════════════════════════════════════════════════════════
// i18n
// ════════════════════════════════════════════════════════════════════════════
function translateCallSites() {
  const sites = []
  const pattern = /\bt\('([^']+)'(\s*,\s*\{([^{}]*)\})?\)/g
  let match
  while ((match = pattern.exec(CLIENT_SOURCE)) !== null) {
    sites.push({
      key: match[1],
      params: match[3]
        ? match[3].split(',').map(part => part.trim().split(':')[0].trim()).filter(Boolean)
        : [],
    })
  }
  return sites
}
function placeholdersOf(value) {
  return Array.from(String(value).matchAll(/\{(\w+)\}/g)).map(match => match[1]).sort()
}

test('every t() key used in the source exists in BOTH locale dictionaries', () => {
  const sites = translateCallSites()
  assert.ok(sites.length > 80, 'the static scan finds the UI call sites')
  for (const site of sites) {
    assert.ok(Object.prototype.hasOwnProperty.call(api.zh, site.key), 'zh dictionary has ' + site.key)
    assert.ok(Object.prototype.hasOwnProperty.call(api.en, site.key), 'en dictionary has ' + site.key)
    assert.notEqual(api.zh[site.key], site.key, 'zh value is not a raw key: ' + site.key)
    assert.notEqual(api.en[site.key], site.key, 'en value is not a raw key: ' + site.key)
    assert.ok(String(api.zh[site.key]).trim() !== '', 'zh value filled: ' + site.key)
    assert.ok(String(api.en[site.key]).trim() !== '', 'en value filled: ' + site.key)
  }
})

test('interpolation placeholders match between dictionaries and call sites', () => {
  const sites = translateCallSites()
  for (const site of sites) {
    const zhPlaceholders = placeholdersOf(api.zh[site.key])
    const enPlaceholders = placeholdersOf(api.en[site.key])
    assert.deepEqual(zhPlaceholders, enPlaceholders, 'same placeholders in zh/en: ' + site.key)
    for (const placeholder of zhPlaceholders) {
      assert.ok(site.params.indexOf(placeholder) >= 0, site.key + ' is called with {' + placeholder + '}')
    }
    for (const param of site.params) {
      assert.ok(zhPlaceholders.indexOf(param) >= 0, site.key + ' passes {' + param + '} used by the dictionary')
    }
  }
})

test('dynamic locale key families (dim.*, mode.*) are complete in both languages', () => {
  const corpus = [
    '帮我做一个带左侧栏入口的 DSH 插件',
    '把当前目录的 CSV 用 Python 做成一份 3 页的图表报告',
    '写一封正式邮件给客户',
    '参考 https://example.com/spec 实现这个页面',
    '不要用 Docker 部署，用当前目录的脚本',
  ]
  const autoDims = new Set()
  for (const raw of corpus) {
    for (const dim of Object.keys(api.analyzeTask(raw).auto)) autoDims.add(dim)
  }
  assert.ok(autoDims.size >= 5, 'corpus exercises several auto-detected dimensions: ' + Array.from(autoDims))
  for (const dim of autoDims) {
    assert.ok(api.zh['dim.' + dim], 'zh has dim.' + dim)
    assert.ok(api.en['dim.' + dim], 'en has dim.' + dim)
  }
  for (const mode of api.MODE_IDS) {
    assert.ok(api.zh['mode.' + mode] && api.en['mode.' + mode], 'mode label: ' + mode)
    assert.ok(api.zh['mode.' + mode + 'Hint'] && api.en['mode.' + mode + 'Hint'], 'mode hint: ' + mode)
  }
})

test('rendered UI never leaks raw locale keys or placeholder tokens (zh and en)', async (t) => {
  await beginReview(t)
  await mountPage()
  await typeInto(landingTextarea(), '帮我做一个插件')
  await click(findButton('开始澄清'))
  await answerWithFirstOption()
  const keys = Object.keys(api.zh)
  for (const language of ['zh', 'en']) {
    await setLanguage(language)
    const text = textOf(document.body)
    for (const key of keys) assert.ok(text.indexOf(key) < 0, 'no raw key in UI: ' + key)
    assert.doesNotMatch(text, /\{(?:n|total|done)\}/, 'no un-interpolated placeholder in the UI')
  }
})

// ════════════════════════════════════════════════════════════════════════════
// Engine edge cases
// ════════════════════════════════════════════════════════════════════════════
function walkthrough(raw, mode, options = {}) {
  const analysis = api.analyzeTask(raw)
  let answers = {}
  const plan = () => api.buildPlan(analysis, mode, answers, options.overrides || [])
  for (let guard = 0; guard < 40; guard += 1) {
    const next = api.nextQuestion(plan(), answers)
    if (!next) break
    if (next.type === 'confirm') {
      answers = Object.assign({}, answers, {
        confirm: { values: ['yes'], text: options.confirmNote || '' },
      })
      continue
    }
    if (options.skipAll) {
      answers = Object.assign({}, answers, { [next.id]: { values: [], text: '', skipped: true } })
      continue
    }
    const option = next.options && next.options[0]
    answers = Object.assign({}, answers, {
      [next.id]: option
        ? { values: [option.value], text: '', skipped: false }
        : { values: [], text: '测试补充', skipped: false },
    })
  }
  const finalPlan = plan()
  const dims = api.resolveDims(finalPlan, answers, analysis, analysis.lang)
  const brief = api.composeBrief({
    raw, analysis, dims, notes: options.notes || [],
    lang: analysis.lang, style: 'standard', assume: options.assume || 'assume',
  })
  const compact = api.composeBrief({
    raw, analysis, dims, notes: options.notes || [],
    lang: analysis.lang, style: 'compact', assume: options.assume || 'assume',
  })
  return { analysis, answers, plan: finalPlan, dims, brief, compact }
}

test('empty / whitespace / punctuation-only input never throws', () => {
  const inputs = ['', '   ', '\n\t ', '？？？', '。。。', '!!!', '……', '  .  ']
  for (const raw of inputs) {
    const analysis = api.analyzeTask(raw)
    assert.equal(typeof analysis.lang, 'string')
    assert.equal(typeof analysis.intent, 'string')
    const plan = api.buildPlan(analysis, 'fast', {}, [])
    assert.equal(plan.questions[plan.questions.length - 1].id, 'confirm')
    assert.doesNotThrow(() => api.nextQuestion(plan, {}))
    const dims = api.resolveDims(plan, {}, analysis, analysis.lang)
    const brief = api.composeBrief({
      raw, analysis, dims, notes: [], lang: analysis.lang, style: 'standard', assume: 'assume',
    })
    assert.equal(typeof brief, 'string')
    assert.doesNotMatch(brief, /undefined|NaN|\[object Object\]/, 'no broken interpolation for ' + JSON.stringify(raw))
    assert.doesNotThrow(() => api.briefStats(brief, raw, dims))
    assert.doesNotThrow(() => api.confirmSummary(analysis, dims, analysis.lang))
  }
})

test('very long input stays fast and structurally valid', () => {
  const sentence = '做一个带左侧栏入口的插件，支持历史记录、复制和本地保存。'
  const raw = sentence.repeat(1200) // ≈ 45k chars
  const startedAt = Date.now()
  const analysis = api.analyzeTask(raw)
  const plan = api.buildPlan(analysis, 'deep', {}, [])
  const dims = api.resolveDims(plan, {}, analysis, analysis.lang)
  const brief = api.composeBrief({
    raw, analysis, dims, notes: [], lang: analysis.lang, style: 'compact', assume: 'assume',
  })
  const elapsed = Date.now() - startedAt
  assert.ok(elapsed < 1000, 'engine stays well under a second on a 45k-char sentence (took ' + elapsed + 'ms)')
  assert.equal(plan.questions[plan.questions.length - 1].id, 'confirm')
  assert.ok(brief.length > raw.length / 2, 'the task text survives into the brief')
  assert.ok(api.estimateTokens(brief) > 1000)
})

test('non-string inputs are tolerated by the engine', () => {
  for (const value of [null, undefined, 42, {}, [], true]) {
    assert.doesNotThrow(() => api.analyzeTask(value))
    assert.doesNotThrow(() => api.detectLanguage(value))
    assert.doesNotThrow(() => api.detectIntent(value))
    assert.doesNotThrow(() => api.detectFacts(value))
    const analysis = api.analyzeTask(value)
    assert.equal(typeof analysis.lang, 'string')
    assert.equal(typeof analysis.intent, 'string')
    assert.doesNotThrow(() => api.buildPlan(analysis, 'standard', {}, []))
  }
})

test('language and intent classification edge table', () => {
  assert.equal(api.detectLanguage(''), 'en')
  assert.equal(api.detectLanguage('Build me a DSH plugin'), 'en')
  assert.equal(api.detectLanguage('帮我做一个插件'), 'zh')
  assert.equal(api.detectLanguage('用 Python 写脚本'), 'zh', 'CJK dominates mixed tech input')
  assert.equal(api.detectLanguage('这是 test'), 'zh')
  assert.equal(api.detectLanguage('😀😀'), 'en')

  assert.equal(api.detectIntent(''), 'general')
  assert.equal(api.detectIntent('？？？'), 'general')
  assert.equal(api.detectIntent('今天天气不错'), 'general')
  assert.equal(api.detectIntent('bug'), 'fix')
  assert.equal(api.detectIntent('写一篇关于依赖注入的文章'), 'write')
  assert.equal(api.detectIntent('解释一下什么是依赖注入'), 'explain')
  assert.equal(api.detectIntent('调研三款笔记软件'), 'research')
  assert.equal(api.detectIntent('把这个 csv 分析一下'), 'analyze')
  assert.equal(api.detectIntent('做个 ppt'), 'artifact')
  assert.equal(api.detectIntent('帮我部署一下这个服务'), 'operate')
  assert.equal(api.detectIntent('设计一个技术方案'), 'plan')
})

test('every intent × mode yields a cap-bounded queue ending in confirm', () => {
  for (const intent of Object.keys(api.INTENTS)) {
    const analysis = { lang: 'zh', intent, domains: [], facts: {}, auto: {} }
    const available = api.INTENTS[intent].questions.length + 1 // + shared priority question
    for (const mode of api.MODE_IDS) {
      const plan = api.buildPlan(analysis, mode, {}, [])
      const substantive = plan.questions.filter(question => question.type !== 'confirm')
      assert.equal(
        substantive.length,
        Math.min(api.MODE_CAP[mode], available),
        intent + '/' + mode + ' asks exactly min(cap, available) substantive questions',
      )
      assert.equal(plan.questions[plan.questions.length - 1].id, 'confirm', 'confirm is always last')
      assert.equal(plan.substantiveTotal, substantive.length)
      assert.ok(substantive.every(question => question.type !== 'confirm'))
    }
  }
})

test('mode switching deep→fast never hides answered questions', () => {
  const raw = '帮我做一个插件'
  const analysis = api.analyzeTask(raw)
  const deepPlan = api.buildPlan(analysis, 'deep', {}, [])
  const pending = deepPlan.questions.filter(question => question.type !== 'confirm')
  assert.equal(pending.length, 8, 'deep mode fills the 8-question budget')
  let answers = {}
  for (const question of pending) {
    const option = question.options && question.options[0]
    answers = Object.assign({}, answers, {
      [question.id]: option ? { values: [option.value], text: '' } : { values: [], text: '补充' },
    })
  }
  const fastPlan = api.buildPlan(analysis, 'fast', answers, [])
  const visible = fastPlan.questions.filter(question => question.type !== 'confirm')
  assert.equal(visible.length, 8, 'all eight answered questions remain visible after switching to fast')
  assert.ok(visible.every(question => answers[question.id]), 'each visible question is answered')
  assert.equal(api.nextQuestion(fastPlan, answers).id, 'confirm', 'only the confirmation is left')
  const progress = api.progressOf(fastPlan, answers)
  assert.equal(progress.done, 8)
  assert.ok(progress.ratio <= 1, 'progress never exceeds 100%')
  const dims = api.resolveDims(fastPlan, answers, analysis, analysis.lang)
  const brief = api.composeBrief({
    raw, analysis, dims, notes: [], lang: 'zh', style: 'standard', assume: 'assume',
  })
  assert.ok(brief.includes('# 任务'))
})

test('auto-detected dimensions skip questions and overrides re-open + win', () => {
  const raw = '在当前目录用 Python 做一个 DSH 插件'
  const analysis = api.analyzeTask(raw)
  assert.ok(analysis.auto.scope, 'current-folder hint detected')
  assert.ok(analysis.auto.stack, 'Python detected')

  const plan = api.buildPlan(analysis, 'standard', {}, [])
  const ids = plan.questions.map(question => question.id)
  assert.equal(ids.indexOf('build_scope'), -1, 'scope question is skipped by the auto-detected value')
  assert.equal(ids.indexOf('build_stack'), -1, 'stack question is skipped by the auto-detected value')

  const overriddenPlan = api.buildPlan(analysis, 'standard', {}, ['scope'])
  assert.ok(overriddenPlan.questions.some(question => question.id === 'build_scope'), 'override re-opens scope')

  const answers = {
    build_scope: { values: ['path'], text: '/tmp/project', skipped: false },
  }
  const answeredPlan = api.buildPlan(analysis, 'standard', answers, ['scope'])
  const dims = api.resolveDims(answeredPlan, answers, analysis, analysis.lang)
  assert.ok(dims.scope, 'scope dimension present')
  assert.ok(dims.scope.parts.some(part => part.indexOf('/tmp/project') >= 0), 'answer text wins')
  assert.equal(dims.scope.parts.indexOf('当前目录'), -1, 'auto value is not mixed into the answered dimension')
})

test('artifact follow-up questions respect their `when` predicates', () => {
  const analysis = api.analyzeTask('做一份 Word 报告')
  const withAnswer = type => ({ artifact_type: { values: [type], text: '', skipped: false } })
  const lengthId = plan => plan.questions.map(question => question.id).indexOf('artifact_length')
  const structureId = plan => plan.questions.map(question => question.id).indexOf('artifact_structure')

  assert.ok(lengthId(api.buildPlan(analysis, 'deep', withAnswer('docx'), [])) >= 0, 'docx asks for length')
  assert.ok(structureId(api.buildPlan(analysis, 'deep', withAnswer('docx'), [])) >= 0, 'docx asks for structure')
  assert.ok(structureId(api.buildPlan(analysis, 'deep', withAnswer('pptx'), [])) >= 0, 'pptx asks for structure')
  assert.ok(structureId(api.buildPlan(analysis, 'deep', withAnswer('pdf'), [])) >= 0, 'pdf asks for structure')
  assert.equal(lengthId(api.buildPlan(analysis, 'deep', withAnswer('xlsx'), [])), -1, 'xlsx hides the page-count question')
  assert.equal(structureId(api.buildPlan(analysis, 'deep', withAnswer('xlsx'), [])), -1, 'xlsx hides the template question')
})

test('answer payload edge cases: skipped, text-only, duplicates and unknown values', () => {
  const analysis = api.analyzeTask('帮我做一个插件')
  const multiQuestion = api.QUESTIONS.build_acceptance
  assert.deepEqual(api.answerParts(multiQuestion, { values: [], text: '', skipped: true }), [])
  assert.deepEqual(api.answerParts(multiQuestion, null), [])
  assert.deepEqual(api.answerParts(multiQuestion, { values: 'not-an-array' }), [])
  assert.deepEqual(api.answerParts(multiQuestion, { values: ['unknown-value'] }), [])
  const textOnly = api.answerParts(multiQuestion, { values: [], text: '  手写验收标准  ' })
  assert.deepEqual(textOnly, ['手写验收标准'])
  const duplicateValues = api.answerParts(multiQuestion, { values: ['runs', 'runs', 'tests'] })
  assert.deepEqual(duplicateValues, ['能从零跑通', '有测试或自检'])
  // resolveDims must not add the same part twice when two answers repeat it.
  const plan = api.buildPlan(analysis, 'standard', {}, [])
  const answers = {
    build_acceptance: { values: ['runs', 'runs'], text: '能从零跑通', skipped: false },
  }
  const dims = api.resolveDims(plan, answers, analysis, 'zh')
  assert.equal(dims.acceptance.parts.length, 1, 'duplicate acceptance text is de-duplicated')

  // A skipped answer still counts as answered for the queue.
  const skipped = { build_deliverable: { values: [], text: '', skipped: true } }
  assert.notEqual(api.nextQuestion(plan, skipped).id, 'build_deliverable')
  assert.equal(api.progressOf(plan, skipped).done, 1)
})

test('malformed stored answers never crash dimension resolution', () => {
  const analysis = api.analyzeTask('帮我做一个插件')
  const plan = api.buildPlan(analysis, 'standard', {}, [])
  const malformed = {
    build_deliverable: 'a string is not an answer object',
    build_scope: { values: 42, text: { nested: true } },
    build_acceptance: { skipped: true },
    build_features: null,
  }
  assert.doesNotThrow(() => api.resolveDims(plan, malformed, analysis, 'zh'))
  assert.doesNotThrow(() => api.answerParts(api.QUESTIONS.build_scope, malformed.build_scope, 'zh'))
  assert.doesNotThrow(() => api.autoParts(null, 'zh'))
  assert.doesNotThrow(() => api.autoParts({ raw: '' }, 'zh'))
  assert.doesNotThrow(() => api.autoParts({ pair: null }, 'en'))
})

test('brief composition: zh/en structure, separators, notes and assume variants', () => {
  const raw = '帮我做一个带左侧栏入口的 DSH 插件'
  const zh = walkthrough(raw, 'standard', { notes: ['还要兼容 Windows'] })
  for (const heading of ['# 任务', '## 交付物', '## 范围与位置', '## 验收标准', '## 执行约定']) {
    assert.ok(zh.brief.includes(heading), 'standard zh brief has ' + heading)
  }
  assert.ok(zh.brief.includes('还要兼容 Windows'))
  assert.match(zh.brief, /：|；/, 'zh brief uses full-width separators')
  assert.ok(!/undefined|null|\[object Object\]/.test(zh.brief + zh.compact))

  const en = walkthrough('Build me a DSH plugin with a left-sidebar entry', 'standard')
  assert.ok(en.brief.includes('# Task'))
  assert.ok(en.brief.includes('## Deliverable'))
  assert.ok(en.brief.includes('## Working rules'))
  assert.doesNotMatch(en.brief, /[：；、]/, 'en brief uses ASCII separators only (regression from review round 1)')
  assert.doesNotMatch(en.compact, /[：；、]/)
  assert.ok(en.brief.includes('do not ask back'))
  assert.ok(en.brief.length > 80)
  assert.ok(en.compact.length < en.brief.length)

  const askMode = walkthrough(raw, 'standard', { assume: 'ask' })
  assert.notEqual(askMode.brief, zh.brief, 'assume mode changes the working rules')
  assert.ok(askMode.brief.includes('停下来问我'))

  const partial = api.composeBrief({
    raw, analysis: api.analyzeTask(raw), dims: {},
    notes: [], lang: 'zh', style: 'standard', assume: 'assume',
  })
  assert.ok(partial.includes('# 任务'), 'a brief with no dimensions is still structurally valid')
  assert.ok(!/undefined|NaN/.test(partial))
})

test('metrics and summary stay within bounds for degenerate inputs', () => {
  assert.equal(api.estimateTokens(''), 1)
  assert.ok(api.estimateTokens('hello') > 0)
  assert.ok(api.estimateTokens('中文') > 0)
  assert.ok(
    api.estimateTokens('中文中文中文') > api.estimateTokens('中文'),
    'token estimate grows with content',
  )
  const analysis = api.analyzeTask('帮我做一个插件')
  const emptyStats = api.briefStats('', '', {})
  assert.equal(emptyStats.chars, 0)
  assert.ok(emptyStats.tokens >= 1)
  assert.equal(emptyStats.score, 0)
  assert.ok(emptyStats.rounds >= 1 && emptyStats.rounds <= 5)
  const dims = { deliverable: { parts: ['x'] }, scope: { parts: ['y'] } }
  const stats = api.briefStats('abc', 'abc', dims)
  assert.ok(stats.score > 0 && stats.score <= 100, 'completeness is a percentage')
  assert.equal(stats.chars, 3)
  const summary = api.confirmSummary(analysis, dims, 'zh')
  assert.ok(summary.includes('我理解你要'))
  assert.ok(!/undefined|NaN/.test(summary))
  const enSummary = api.confirmSummary(analysis, dims, 'en')
  assert.ok(enSummary.startsWith('I understand you want to '))
  assert.ok(!/undefined|NaN/.test(enSummary))
})

test('progress and next-question arithmetic at the extremes', () => {
  const analysis = api.analyzeTask('帮我做一个插件')
  const plan = api.buildPlan(analysis, 'standard', {}, [])
  const zero = api.progressOf(plan, {})
  assert.equal(zero.done, 0)
  assert.ok(zero.total >= 1)
  assert.equal(zero.ratio, 0)
  const answeredAll = {}
  for (const question of plan.questions) answeredAll[question.id] = { values: [], text: '', skipped: true }
  const full = api.progressOf(plan, answeredAll)
  assert.equal(full.done, full.total)
  assert.equal(full.ratio, 1)
  assert.equal(api.nextQuestion(plan, answeredAll), null)
  // Invalid mode must fall back to "standard" instead of throwing.
  const fallback = api.buildPlan(analysis, 'nonsense', {}, [])
  assert.equal(
    fallback.questions.filter(question => question.type !== 'confirm').length,
    Math.min(api.MODE_CAP.standard, api.INTENTS.build.questions.length + 1),
  )
  // Explicit overrides may exceed the cap: they are user-requested and must not be dropped.
  const forced = api.buildPlan(analysis, 'fast', {}, ['scope', 'stack', 'deliverable'])
  const forcedIds = forced.questions.map(question => question.id)
  for (const id of ['build_scope', 'build_stack']) assert.ok(forcedIds.indexOf(id) >= 0, id + ' survives the cap')
  assert.ok(forced.substantiveTotal >= 3)
})

// ════════════════════════════════════════════════════════════════════════════
// CSS compliance (static)
// ════════════════════════════════════════════════════════════════════════════
function extractCss() {
  const start = CLIENT_SOURCE.indexOf('const CSS = [')
  assert.ok(start > 0, 'CSS constant found')
  const end = CLIENT_SOURCE.indexOf("].join('')", start)
  assert.ok(end > start, 'CSS array terminator found')
  const body = CLIENT_SOURCE.slice(CLIENT_SOURCE.indexOf('[', start) + 1, end)
  const literals = Array.from(body.matchAll(/'([^']*)'/g)).map(match => match[1])
  return literals.join('')
}
function cssRules(css) {
  const rules = []
  const pattern = /([^{}]+)\{([^{}]*)\}/g
  let match
  while ((match = pattern.exec(css)) !== null) {
    rules.push({ selector: match[1].trim(), declarations: match[2] })
  }
  return rules
}

test('CSS is scoped, token-only, balanced and free of unsupported constructs', () => {
  const css = extractCss()
  assert.ok(css.length > 3000, 'the page ships its stylesheet')
  const open = (css.match(/\{/g) || []).length
  const close = (css.match(/\}/g) || []).length
  assert.equal(open, close, 'balanced CSS blocks')

  const tokens = Array.from(new Set(Array.from(css.matchAll(/var\((--[a-z0-9-]+)\)/g)).map(match => match[1])))
  const expectedTokens = [
    '--dsw-alias-bg-base', '--dsw-alias-label-primary', '--dsw-alias-border-l1',
    '--dsw-alias-label-secondary', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-layer-1',
    '--dsw-alias-brand-primary', '--dsw-alias-border-l2', '--dsw-alias-state-success-primary',
    '--dsw-alias-bg-overlay', '--dsw-alias-state-warn-primary', '--dsw-alias-state-error-primary',
  ]
  // Cross-checked at review time against the 120 --dsw-alias-* tokens compiled into
  // the shipped app bundle: all twelve exist in the live theme.
  for (const token of tokens) {
    assert.match(token, /^--dsw-alias-/, 'only alias theme tokens are consumed: ' + token)
    assert.ok(expectedTokens.indexOf(token) >= 0, 'token is part of the reviewed set: ' + token)
  }
  assert.deepEqual(Array.from(tokens).sort(), expectedTokens.slice().sort(), 'the token surface did not drift')

  for (const rule of cssRules(css)) {
    for (const match of rule.selector.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)) {
      assert.match(match[1], /^dtc-/, 'class is scoped under the plugin prefix: .' + match[1] + ' in ' + rule.selector)
    }
  }

  // Artwork / inverse-ink / shadow exceptions, all documented:
  const allowedHexRules = ['dtc-brand', 'dtc-btn-primary', 'dtc-answer-check', 'dtc-option-mark', 'dtc-ready-icon']
  for (const rule of cssRules(css)) {
    const hexes = Array.from(rule.declarations.matchAll(/#([0-9a-fA-F]{3,8})\b/g)).map(match => match[1].toLowerCase())
    if (hexes.length === 0) continue
    const isBrandArtwork = rule.selector.indexOf('dtc-brand') >= 0
    const isInverseInk = allowedHexRules.some(name => rule.selector.indexOf(name) >= 0)
    assert.ok(isBrandArtwork || isInverseInk, 'no stray literal colors outside artwork/inverse ink: ' + rule.selector + ' → ' + hexes.join(','))
  }
  for (const rule of cssRules(css)) {
    const colorFns = Array.from(rule.declarations.matchAll(/rgba?\([^)]*\)/g)).map(match => match[0])
    if (colorFns.length === 0) continue
    assert.match(rule.declarations, /box-shadow/, 'rgba() is only used for depth shadows: ' + rule.selector)
  }
  assert.ok(css.includes('linear-gradient(135deg,#2f6fed,#7a5cff)'), 'the brand gradient is the one place with own colors')
  assert.doesNotMatch(css, /url\(|@import|expression\(|behavior:/, 'no external or unsupported CSS constructs')
  assert.ok(css.includes('@container') && css.includes('container-type:inline-size'), 'container queries are set up correctly')
  assert.ok(css.includes('prefers-reduced-motion'), 'motion respects the host accessibility preference')
})

// ════════════════════════════════════════════════════════════════════════════
// Real-DOM: landing, restore, corrupt storage
// ════════════════════════════════════════════════════════════════════════════
test('landing renders from empty storage with its stylesheet and no leaked keys', async (t) => {
  await beginReview(t)
  await mountPage()
  assert.ok(document.querySelector('.dtc-root'), 'page renders inside the slot')
  assert.ok(document.querySelector('style'), 'stylesheet element ships with the component')
  assert.match(textOf(document.querySelector('.dtc-landing-title')), /你想让 DSH 做什么/)
  assert.equal(all('.dtc-example').length, 5, 'five example sentences')
  assert.ok(landingTextarea(), 'the one-sentence input exists')
  assert.ok(document.querySelector('.dtc-history-empty'), 'empty history state shown')
  assert.ok(document.querySelector('.dtc-empty-title'), 'empty brief preview shown')
  assert.equal(document.querySelector('.dtc-crash'), null, 'no crash card')
  const start = findButton('开始澄清')
  assert.ok(start.disabled, 'start is disabled until a sentence is typed')
  assert.equal(findButton('跳过提问，直接整理').disabled, true)
})

test('session restore keeps flow answers, mode, style, assume and the next question', async (t) => {
  await beginReview(t)
  seedSession({
    stage: 'flow',
    raw: '把当前目录的 CSV 用 Python 做成一份 3 页的图表报告',
    mode: 'deep',
    style: 'compact',
    assume: 'assumptions',
    answers: {
      artifact_type: { values: ['docx'], text: '', skipped: false, at: 1 },
      artifact_length: { values: ['small'], text: '', skipped: false, at: 2 },
    },
  })
  await mountPage()
  assert.equal(document.querySelector('.dtc-landing'), null, 'flow UI is restored, not the landing')
  assert.equal(answeredCards().length, 2, 'both answered cards are restored')
  assert.ok(document.querySelector('.dtc-q'), 'the next question is offered after the restore')
  const modeButtons = all('.dtc-mode .dtc-seg-btn')
  const deepButton = modeButtons.filter(button => textOf(button) === '深度')[0]
  assert.equal(deepButton.getAttribute('aria-pressed'), 'true', 'deep mode is restored')
  const styleButtons = all('.dtc-side-head .dtc-seg-btn')
  const compactButton = styleButtons.filter(button => textOf(button) === '极简')[0]
  assert.equal(compactButton.getAttribute('aria-pressed'), 'true', 'compact brief style is restored')
  const assumeButtons = all('.dtc-assume .dtc-seg-btn')
  const assumptionsButton = assumeButtons.filter(button => textOf(button) === '先列假设')[0]
  assert.equal(assumptionsButton.getAttribute('aria-pressed'), 'true', 'assume mode is restored')
  assert.match(briefText(), /任务：|Task: /, 'compact style shows the compact brief')
  assert.ok(briefText().length > 40)
})

test('ready-state restore renders the completion card and usable actions', async (t) => {
  await beginReview(t)
  seedSession({ stage: 'ready', raw: '帮我做一个插件', notes: ['要能离线使用'] })
  await mountPage()
  assert.ok(document.querySelector('.dtc-ready'), 'ready card restored')
  assert.match(textOf(document.querySelector('.dtc-ready-title')), /澄清完成/)
  const copy = findButton('复制任务书')
  const start = findButton('开始执行')
  assert.equal(copy.disabled, false, 'copy is enabled with a brief')
  assert.equal(start.disabled, false, 'start is enabled with a brief')
  assert.ok(briefText().includes('要能离线使用'), 'restored notes are in the brief')
})

test('corrupt session and history storage can never blank the slot', async (t) => {
  await beginReview(t)
  const corruptSessions = [
    'not-json{',
    '[1,2,3]',
    JSON.stringify({ stage: 'flow', raw: '' }),
    JSON.stringify({}),
    JSON.stringify({ stage: 'flow', raw: '做一个插件', answers: 'oops', overrides: 'oops', notes: 42, mode: 'nope', style: 'weird', assume: 'weird' }),
    JSON.stringify({ stage: 'ready', raw: 42 }),
    JSON.stringify({ stage: 'weird', raw: 'x', answers: [], overrides: {}, notes: 'x' }),
    JSON.stringify({ stage: 'flow', raw: '做一个插件', answers: { build_deliverable: 'string', build_scope: { values: 'nope' } }, notes: ['ok', 5] }),
  ]
  for (const payload of corruptSessions) {
    window.localStorage.setItem(SESSION_KEY, payload)
    await mountPage()
    assert.ok(document.querySelector('.dtc-root'), 'page still renders for payload ' + JSON.stringify(payload))
    assert.equal(document.querySelector('.dtc-crash'), null, 'no crash card for payload ' + JSON.stringify(payload))
    await unmount()
  }
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify([
    null, 'garbage', { raw: 5, standard: 'x' }, { raw: 'ok', standard: 'brief' }, { raw: 'no standard' },
  ]))
  window.localStorage.removeItem(SESSION_KEY)
  await mountPage()
  assert.ok(document.querySelector('.dtc-root'))
  assert.equal(document.querySelector('.dtc-crash'), null)
  assert.equal(all('.dtc-history-row').length, 1, 'only structurally valid history entries render')
})

// ════════════════════════════════════════════════════════════════════════════
// Real-DOM: state machine
// ════════════════════════════════════════════════════════════════════════════
test('flow supports answer → skip → back → edit without losing state', async (t) => {
  await beginReview(t)
  await mountPage()
  await startFlow('帮我做一个插件')
  assert.equal(currentQuestionTitle(), api.QUESTIONS.build_deliverable.title.zh)
  assert.equal(progressText(), '已澄清 0 / 5 项')

  await answerWithFirstOption()
  assert.equal(answeredCards().length, 1)
  assert.equal(currentQuestionTitle(), api.QUESTIONS.build_scope.title.zh)

  await click(findButton('跳过，你决定'))
  assert.equal(answeredCards().length, 2)
  assert.ok(textOf(answeredCards()[1]).includes('跳过，你决定'), 'skipped answer is shown as skipped')
  assert.equal(currentQuestionTitle(), api.QUESTIONS.build_acceptance.title.zh)

  await click(findButton('上一个'))
  assert.equal(answeredCards().length, 1, 'back removes the last answer')
  assert.equal(currentQuestionTitle(), api.QUESTIONS.build_scope.title.zh, 'back returns to the skipped question')

  await answerWithFirstOption()
  const firstAnswerEdit = answeredCards()[0].querySelector('.dtc-link')
  await click(firstAnswerEdit)
  assert.equal(currentQuestionTitle(), api.QUESTIONS.build_deliverable.title.zh, 'edit re-opens the answered question')
  assert.equal(answeredCards().length, 1, 'the edited card is hidden while editing')
  await answerWithFirstOption()
  assert.equal(answeredCards().length, 2, 'submitting the edit restores progress')
  assert.equal(currentQuestionTitle(), api.QUESTIONS.build_acceptance.title.zh, 'the queue resumes where it was')
})

test('mode switching re-budgets the queue but keeps answered questions', async (t) => {
  await beginReview(t)
  await mountPage()
  await startFlow('帮我做一个插件')
  await answerWithFirstOption()
  await answerWithFirstOption()
  assert.equal(progressText(), '已澄清 2 / 5 项')

  await click(segmentIn('.dtc-mode', '快速'))
  assert.equal(progressText(), '已澄清 2 / 3 项', 'fast mode caps the total budget at three')
  assert.equal(answeredCards().length, 2)

  await click(segmentIn('.dtc-mode', '深度'))
  assert.equal(progressText(), '已澄清 2 / 8 项', 'deep mode re-budgets to eight')
  assert.equal(answeredCards().length, 2, 'answered questions are never hidden by a mode switch')
  assert.equal(document.querySelector('.dtc-crash'), null)
})

test('auto-detected dimensions render as chips; editable ones re-open their question', async (t) => {
  await beginReview(t)
  await mountPage()
  await startFlow('把当前目录的 CSV 用 Python 做成一份 3 页的图表报告')
  assert.equal(currentQuestionTitle(), api.QUESTIONS.artifact_type.title.zh)
  assert.equal(all('.dtc-auto-chip-static').length, 2, 'scope and stack are pure information for this intent')
  assert.equal(all('button.dtc-auto-chip').length, 1, 'only the length dimension is re-openable')

  await click(findButtonContaining('篇幅'))
  assert.equal(currentQuestionTitle(), api.QUESTIONS.artifact_length.title.zh, 'override re-opens the detected length question')
  const options = all('.dtc-option')
  await click(options[1])
  await click(findButton('下一步'))
  assert.match(briefText(), /篇幅：3–5 页/, 'the answered override replaces the auto-detected value in the brief')
  assert.equal(document.querySelector('.dtc-crash'), null)
})

test('a full walkthrough reaches confirm → ready, persists history and carries the correction', async (t) => {
  await beginReview(t)
  await mountPage()
  await startFlow('帮我做一个插件')
  await driveToConfirm('要能离线使用')
  assert.ok(document.querySelector('.dtc-ready'), 'ready card shown after confirmation')
  assert.equal(sessionStore().stage, 'ready', 'stage is persisted')
  assert.equal(findButton('复制任务书').disabled, false)
  const entry = historyStore()[0]
  assert.ok(entry && entry.id, 'a history entry is saved')
  assert.ok(entry.standard.includes('要能离线使用'), 'the confirmation note is written into the saved brief')
  assert.ok(briefText().includes('要能离线使用'), 'the live preview carries the confirmation note')
})

test('copying the brief writes it to the clipboard and remembers the task', async (t) => {
  await beginReview(t)
  seedSession({ stage: 'ready', raw: '帮我做一个插件' })
  await mountPage()
  assert.equal(copied.length, 0)
  await click(findButton('复制任务书'))
  await flush()
  assert.equal(copied.length, 1, 'clipboard received the brief')
  assert.ok(copied[0].includes('帮我做一个插件'))
  assert.match(copied[0], /# 任务/)
  assert.match(toastText(), /任务书已复制/)
  assert.equal(historyStore().length, 1, 'copying remembers the task')
})

test('hand-off fills a new conversation draft through uiWorkspace + layout', async (t) => {
  await beginReview(t)
  seedSession({ stage: 'ready', raw: '帮我做一个插件' })
  await mountPage()
  await click(findButton('开始执行'))
  await flush()
  assert.equal(calls.startSession.length, 1, 'startSession is invoked once')
  const call = calls.startSession[0]
  assert.equal(call.workspaceId, undefined)
  assert.equal(call.options.whenDraftExists, 'replace')
  assert.equal(call.options.clearPreviousDraft, true)
  assert.equal(typeof call.options.prompt, 'string')
  assert.ok(call.options.prompt.includes('帮我做一个插件'), 'the brief carries the original sentence')
  assert.match(call.options.prompt, /# 任务/)
  assert.deepEqual(calls.selectPanel, ['conversation'], 'the layout switches to the conversation')
  assert.match(toastText(), /已打开新对话并填入任务书/)
})

test('missing / broken uiWorkspace and layout fall back to the clipboard without throwing', async (t) => {
  await beginReview(t)
  seedSession({ stage: 'ready', raw: '帮我做一个插件' })

  const variants = [
    { label: 'services absent', options: { services: false } },
    { label: 'service registry throws', options: { throwingGet: true } },
    {
      label: 'startSession throws',
      options: {
        services: {
          uiWorkspace: { startSession() { throw new Error('workspace unavailable') } },
          layout: { selectPanel() { throw new Error('layout unavailable') } },
        },
      },
    },
  ]
  for (const variant of variants) {
    await unmount()
    window.localStorage.clear()
    seedSession({ stage: 'ready', raw: '帮我做一个插件' })
    copied.length = 0
    calls.startSession.length = 0
    applyPlugin(variant.options)
    await mountPage()
    await click(findButton('开始执行'))
    await flush()
    assert.equal(copied.length, 1, 'clipboard fallback fired (' + variant.label + ')')
    assert.ok(copied[0].includes('帮我做一个插件'))
    assert.match(toastText(), /任务书已复制/, 'a warned fallback toast is shown (' + variant.label + ')')
    assert.equal(document.querySelector('.dtc-crash'), null, 'no crash rendering the slot (' + variant.label + ')')
  }
  applyPlugin()
})

test('history rows open, reuse, delete and clear saved tasks', async (t) => {
  await beginReview(t)
  await mountPage()
  await typeInto(landingTextarea(), '帮我做一个插件')
  await click(findButton('跳过提问，直接整理'))
  assert.ok(document.querySelector('.dtc-ready'), 'direct path builds a brief without questions')
  assert.equal(historyStore().length, 1, 'direct path remembers the task')

  await click(findButton('新任务'))
  assert.equal(all('.dtc-history-row').length, 1, 'history is listed on the landing page')
  await click(document.querySelector('.dtc-history-main'))
  assert.ok(document.querySelector('.dtc-ready'), 'opening history restores the brief')
  assert.ok(briefText().includes('帮我做一个插件'))

  await click(findButton('新任务'))
  await click(document.querySelector('.dtc-history-act[title="重新澄清"]'))
  assert.ok(document.querySelector('.dtc-q'), 'reuse restarts the question flow')
  assert.equal(currentQuestionTitle(), api.QUESTIONS.build_deliverable.title.zh)

  await click(findButton('新任务'))
  await click(document.querySelector('.dtc-history-act[title="删除"]'))
  assert.equal(all('.dtc-history-row').length, 0, 'delete removes the row')
  assert.equal(historyStore().length, 0)

  await typeInto(landingTextarea(), '帮我做一个插件')
  await click(findButton('跳过提问，直接整理'))
  await click(findButton('新任务'))
  const originalConfirm = window.confirm
  window.confirm = function confirmAlways() { return true }
  try {
    await click(findButton('清空历史'))
  } finally {
    window.confirm = originalConfirm
  }
  assert.equal(historyStore().length, 0, 'clear-history wipes the local store')
  assert.equal(all('.dtc-history-row').length, 0)
})

test('locale switch re-renders the chrome while the brief keeps the input language', async (t) => {
  await beginReview(t)
  await mountPage()
  assert.match(textOf(document.querySelector('.dtc-title')), /任务澄清器/)
  await setLanguage('en')
  assert.match(textOf(document.querySelector('.dtc-title')), /Task Clarifier/)
  assert.match(textOf(document.querySelector('.dtc-landing-title')), /What do you want DSH to do/)
  assert.ok(document.querySelector('.dtc-history-empty'), 'history empty state still rendered after locale switch')

  await typeInto(landingTextarea(), '帮我做一个插件')
  await click(findButton('Start clarifying'))
  assert.match(textOf(document.querySelector('.dtc-title')), /Task Clarifier/, 'chrome follows the UI locale')
  assert.equal(
    currentQuestionTitle(),
    api.QUESTIONS.build_deliverable.title.zh,
    'question language follows the input language, not the UI locale',
  )
  await setLanguage('zh')
  assert.match(textOf(document.querySelector('.dtc-title')), /任务澄清器/)
})

test('hook order is stable across mode/style/stage transitions', async (t) => {
  await beginReview(t)
  const spy = spyConsole()
  try {
    await mountPage()
    await startFlow('帮我做一个插件')
    await answerWithFirstOption()
    await click(segmentIn('.dtc-mode', '快速'))
    await click(segmentIn('.dtc-mode', '深度'))
    await click(segmentIn('.dtc-side-head', '极简'))
    await click(findButton('上一个'))
    await click(findButton('新任务'))
  } finally {
    spy.restore()
  }
  const hookErrors = spy.messages.filter(message => /order of Hooks|Rendered more hooks|Rendered fewer hooks|change in the order/i.test(message))
  assert.deepEqual(hookErrors, [], 'React reported no hook-order violations')
  assert.ok(document.querySelector('.dtc-root'), 'the slot is still mounted and rendering')

  assert.ok(document.querySelector('.dtc-landing'), 'sanity: new task returns to the landing page')
})

test('new task resets progress but keeps the saved mode/style/assume preferences', async (t) => {
  await beginReview(t)
  await mountPage()
  await startFlow('帮我做一个插件')
  await answerWithFirstOption()
  await click(segmentIn('.dtc-mode', '深度'))
  await click(segmentIn('.dtc-side-head', '极简'))
  await click(segmentIn('.dtc-assume', '问我'))
  await click(findButton('新任务'))
  assert.ok(document.querySelector('.dtc-landing'), 'new task returns to the landing page')
  assert.equal(landingTextarea().value, '')
  assert.equal(sessionStore().raw, '')
  assert.equal(sessionStore().stage, 'input')
  assert.equal(sessionStore().mode, 'deep', 'mode preference survives the reset')
  assert.equal(sessionStore().style, 'compact', 'style preference survives the reset')
  assert.equal(sessionStore().assume, 'ask', 'assume preference survives the reset')
  assert.deepEqual(settingsStore(), { mode: 'deep', style: 'compact', assume: 'ask' })
})

test('sidebar glyph renders at the shell size, reflects active state and tolerates odd props', async (t) => {
  await beginReview(t)
  await mount(React.createElement(SidebarIcon, { size: 16, active: true }))
  let svg = document.querySelector('svg')
  assert.ok(svg, 'glyph renders an svg')
  assert.equal(svg.getAttribute('width'), '16')
  assert.equal(svg.getAttribute('height'), '16')
  assert.equal(svg.getAttribute('viewBox'), '0 0 16 16')
  assert.equal(svg.getAttribute('stroke'), 'currentColor')
  assert.equal(svg.querySelectorAll('path').length, 2)
  assert.equal(svg.getAttribute('stroke-width'), '1.6', 'active state thickens the stroke')
  assert.equal(svg.getAttribute('aria-hidden'), 'true')

  // Each mount() appends a fresh container; clear the previous one so
  // querySelector does not read the earlier glyph.
  await unmount()
  await mount(React.createElement(SidebarIcon, { size: NaN, active: 'yes' }))
  svg = document.querySelector('svg')
  assert.equal(svg.getAttribute('width'), '16', 'non-finite size falls back to 16')
  assert.equal(svg.getAttribute('stroke-width'), '1.35', 'non-true active stays inactive')

  await unmount()
  await mount(React.createElement(SidebarIcon, null))
  svg = document.querySelector('svg')
  assert.equal(svg.getAttribute('width'), '16')
  assert.equal(document.querySelector('.dtc-crash'), null)
})

// ════════════════════════════════════════════════════════════════════════════
// Regression tests for defects the independent review found. They were first
// written as `todo` markers against the frozen artifact; each one is fixed in
// the delivered client.js, so they are plain tests that keep the fixes honest.
// ════════════════════════════════════════════════════════════════════════════
test('negated technology must not be auto-detected as a positive stack', () => {
  const analysis = api.analyzeTask('不要用 Python，改用 Node 写脚本')
  const dims = api.resolveDims(api.buildPlan(analysis, 'standard', {}, []), {}, analysis, analysis.lang)
  const brief = api.composeBrief({
    raw: '不要用 Python，改用 Node 写脚本', analysis, dims, notes: [],
    lang: 'zh', style: 'standard', assume: 'assume',
  })
  assert.equal(analysis.facts.tech.indexOf('Python'), -1, 'Python appears only inside the negative clause')
  assert.doesNotMatch(brief, /技术栈：Python/)
})

test('negated style must not contradict the detected style', () => {
  const raw = '写一封邮件，不要正式'
  const analysis = api.analyzeTask(raw)
  const dims = api.resolveDims(api.buildPlan(analysis, 'standard', {}, []), {}, analysis, analysis.lang)
  const brief = api.composeBrief({ raw, analysis, dims, notes: [], lang: 'zh', style: 'standard', assume: 'assume' })
  assert.equal(analysis.facts.style.indexOf('正式'), -1, 'formal tone is negated, so it is not a positive style')
  assert.doesNotMatch(brief, /风格：正式/)
})

test('"either/or" and "TCP/IP" must not fabricate a path / auto scope', () => {
  for (const raw of ['either/or choice', 'TCP/IP config', 'and/or']) {
    const facts = api.detectFacts(raw)
    assert.deepEqual(facts.paths, [], 'no path in ' + JSON.stringify(raw))
    assert.equal(api.analyzeTask(raw).auto.scope, undefined, 'scope question stays available for ' + JSON.stringify(raw))
  }
})

test('audience capture must stop at the following verb', () => {
  const facts = api.detectFacts('给老板写一份周报')
  assert.equal(facts.audience, '老板', 'only the reader is captured, not "老板写一份周报"')
})

test('punctuation-only input must not produce a copyable empty-task brief', () => {
  const raw = '？？？'
  assert.equal(raw.trim() === '', false)
  const analysis = api.analyzeTask(raw)
  const brief = api.composeBrief({
    raw, analysis, dims: {}, notes: [], lang: analysis.lang, style: 'standard', assume: 'assume',
  })
  assert.notEqual(brief.replace(/^#.*$/gm, '').split('\n').map(line => line.trim()).filter(Boolean).join(' ').trim(), '')
})

test('English confirm summary must not use full-width CJK punctuation', () => {
  const analysis = api.analyzeTask('Build me a plugin')
  const dims = { deliverable: { parts: ['A ready-to-use result'] }, scope: { parts: ['Current folder'] } }
  const summary = api.confirmSummary(analysis, dims, 'en')
  assert.doesNotMatch(summary, /[：；、]/, 'the English confirm card uses ASCII punctuation')
})

test('"继续补充" after the direct path must open the note composer', async (t) => {
  await beginReview(t)
  await mountPage()
  await typeInto(landingTextarea(), '帮我做一个插件')
  await click(findButton('跳过提问，直接整理'))
  assert.ok(document.querySelector('.dtc-ready'))
  await click(findButton('继续补充'))
  assert.ok(document.querySelector('.dtc-q textarea'), 'a note composer should appear for post-direct additions')
})
