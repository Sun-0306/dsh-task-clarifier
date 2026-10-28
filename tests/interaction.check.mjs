/**
 * End-to-end interaction check for dsh-task-clarifier.
 *
 * Mounts the REAL page component (obtained from the plugin's own `main` slot
 * registration) into jsdom with the real React 18 runtime, then drives the
 * whole user flow with DOM events: type a sentence, answer questions, switch
 * modes, edit/skip, confirm, copy, hand off to the conversation, reopen from
 * history and switch the UI locale.
 *
 * This is the closest verification available without browser control. Run:
 *   node tests/interaction.check.mjs
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pluginDir = path.join(here, '..')
const marketRequire = createRequire('/Users/sunchujun/Desktop/deepseek/dsh-market/package.json')
const { JSDOM } = marketRequire('jsdom')

const dom = new JSDOM('<!doctype html><html lang="zh-CN"><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})
const { window } = dom
const { document } = window

// jsdom must be installed on globalThis BEFORE react-dom is required: react-dom
// captures window/document at module scope. React 18 also feature-detects
// `document.oninput`; jsdom does not define it, which would send React down its
// IE-only attachEvent polyfill, so declare the property present.
globalThis.window = window
globalThis.document = document
globalThis.localStorage = window.localStorage
globalThis.HTMLElement = window.HTMLElement
globalThis.Node = window.Node
globalThis.Event = window.Event
globalThis.MouseEvent = window.MouseEvent
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: window.navigator })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
if (!('oninput' in document)) {
  Object.defineProperty(document, 'oninput', { configurable: true, value: null })
}

const React = marketRequire('react')
const ReactDOMClient = marketRequire('react-dom/client')

const copied = []
Object.defineProperty(window.navigator, 'clipboard', {
  configurable: true,
  value: { writeText: async function writeText(text) { copied.push(String(text)) } },
})

const SESSION_KEY = 'dsh-task-clarifier.session.v1'
const HISTORY_KEY = 'dsh-task-clarifier.history.v1'
window.localStorage.clear()

let capturedDefinition = null
window.__ModuleLoader__ = {
  load(definition) {
    capturedDefinition = definition
  },
}

const source = readFileSync(path.join(pluginDir, 'client.js'), 'utf8')
// eslint-disable-next-line no-new-func
new Function('window', 'document', 'localStorage', 'navigator', source)(
  window,
  document,
  window.localStorage,
  window.navigator,
)
if (!capturedDefinition) throw new Error('the module loader did not capture the factory')

const module = capturedDefinition.factory(function requireStub(name) {
  if (name === 'react') return React
  return {}
})
const api = module.__test
const dictionaries = { zh: api.zh, en: api.en }

const calls = { startSession: [], selectPanel: [], started: [] }
const services = {
  uiWorkspace: {
    startSession(workspaceId, options) {
      calls.startSession.push({ workspaceId, options })
    },
  },
  layout: {
    selectPanel(panelId) {
      calls.selectPanel.push(panelId)
    },
  },
}

let activeLanguage = 'zh'
const localeSubscribers = new Set()
const fakeLocale = {
  register() { return function dispose() {} },
  bind() {
    return function translate(key) {
      const dict = dictionaries[activeLanguage] || dictionaries.zh
      return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key
    }
  },
  subscribe(fn) {
    localeSubscribers.add(fn)
    return function unsubscribe() { localeSubscribers.delete(fn) }
  },
}

const registrations = []
const fakeCtx = {
  effect(callback) { return callback() },
  locale: fakeLocale,
  slots: {
    inject(slot, callback) { return callback() },
    register(options, component) {
      registrations.push({ type: 'register', options, component })
      return function dispose() {}
    },
  },
  get(name) { return services[name] },
}
module.apply(fakeCtx)
const pageRegistration = registrations.find(
  entry => entry.type === 'register' && entry.options.name === 'main',
)
if (!pageRegistration) throw new Error('main page registration missing')
const Page = pageRegistration.component

// ── tiny DOM driver ──────────────────────────────────────────────────────
const results = []
function check(label, condition, detail) {
  results.push({ label, ok: Boolean(condition), detail: detail || '' })
  if (!condition) {
    console.log('FAIL  ' + label + (detail ? ' — ' + detail : ''))
  } else {
    console.log('PASS  ' + label)
  }
}

function all(selector) {
  return Array.prototype.slice.call(document.querySelectorAll(selector))
}
function textOf(element) {
  return (element && element.textContent ? element.textContent : '').replace(/\s+/g, ' ').trim()
}
function findButton(label) {
  return all('button').filter(button => textOf(button) === label)[0]
}
function findButtonContaining(fragment) {
  return all('button').filter(button => textOf(button).indexOf(fragment) >= 0)[0]
}
function fire(element, type) {
  element.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true }))
}
async function click(element) {
  if (!element) throw new Error('click target missing')
  await React.act(async function clickAct() {
    fire(element, 'click')
  })
}
async function type(element, value) {
  if (!element) throw new Error('input missing')
  await React.act(async function typeAct() {
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
    descriptor.set.call(element, value)
    element.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}
async function flush() {
  await React.act(async function flushAct() {
    await new Promise(function wait(resolve) { setTimeout(resolve, 0) })
  })
}
function currentQuestionTitle() {
  const title = document.querySelector('.dtc-q .dtc-q-title')
  return textOf(title)
}
function optionLabels() {
  return all('.dtc-option .dtc-option-label').map(textOf)
}
async function chooseOptions(indices) {
  const options = all('.dtc-option')
  for (const index of indices) {
    await click(options[index])
  }
}
async function nextStep() {
  const next = findButton('下一步') || findButton('对，生成任务书')
  await click(next)
}
function progressText() {
  return textOf(document.querySelector('.dtc-progress-text'))
}
function briefText() {
  return textOf(document.querySelector('.dtc-preview .dtc-brief'))
}
function landingTextarea() {
  return document.querySelector('.dtc-landing textarea')
}
function sessionStore() {
  const raw = window.localStorage.getItem(SESSION_KEY)
  return raw ? JSON.parse(raw) : null
}
function historyStore() {
  const raw = window.localStorage.getItem(HISTORY_KEY)
  return raw ? JSON.parse(raw) : null
}

const container = document.getElementById('root')
let root = null
async function mount() {
  root = ReactDOMClient.createRoot(container)
  await React.act(async function mountAct() {
    root.render(React.createElement(Page))
  })
  await flush()
}
async function unmount() {
  await React.act(async function unmountAct() {
    root.unmount()
  })
}

// ── 1. landing → first question ──────────────────────────────────────────
await mount()
check('landing headline is rendered', textOf(document.querySelector('.dtc-landing-title')).includes('你想让 DSH 做什么'))
check('session starts on the landing page', sessionStore() === null || sessionStore().stage === 'input')

const RAW = '帮我做一个带左侧栏入口的 DSH 插件，用来整理会议纪要'
await type(landingTextarea(), RAW)
check('typing persists the draft', (sessionStore() || {}).raw === RAW, JSON.stringify(sessionStore() && sessionStore().raw))
check('live preview appears while typing', briefText().length > 0)

await click(findButton('开始澄清'))
check('first question is the deliverable question', currentQuestionTitle().includes('最终拿到什么'), currentQuestionTitle())
check('progress shows the standard budget', progressText().includes('/ 5'), progressText())
check('detected tech stack is shown as an auto chip', textOf(document.querySelector('.dtc-auto')).includes('技术栈'))

// ── 2. answer the flow ───────────────────────────────────────────────────
await chooseOptions([0]) // 可直接使用的成品
await nextStep()
check('second question is about scope', currentQuestionTitle().includes('在哪里做'), currentQuestionTitle())

await chooseOptions([0]) // 当前工作目录新建
await nextStep()
check('third question is acceptance (multi)', currentQuestionTitle().includes('怎样算完成'))
check('multi question is marked', !!document.querySelector('.dtc-badge'))

await chooseOptions([0, 1]) // 能从零跑通 + 有示例
await nextStep()
check('fourth question is capabilities', currentQuestionTitle().includes('必须具备哪些能力'))
await chooseOptions([1]) // 界面或交互
await nextStep()
check('fifth question is the constraint text question', currentQuestionTitle().includes('硬性约束'))
await type(document.querySelector('.dtc-q textarea'), '不要引入第三方依赖')
await nextStep()

check('confirm card summarises the task', textOf(document.querySelector('.dtc-q-confirm .dtc-summary')).includes('我理解你要'))
check('brief already has all answered sections', briefText().includes('执行约定') && briefText().includes('不要引入第三方依赖'))

// ── 3. back/edit while in the confirm step ───────────────────────────────
const answeredCards = all('.dtc-answer')
check('answered questions are shown as cards', answeredCards.length === 5, String(answeredCards.length))
await click(findButtonContaining('修改'))
check('edit re-opens an answered question', !!document.querySelector('.dtc-q .dtc-q-title'))
await chooseOptions([0])
await nextStep()
check('answered question after edit keeps the flow going', !!document.querySelector('.dtc-q-confirm'))

// ── 4. skip works on a re-opened question ────────────────────────────────
await click(findButtonContaining('修改'))
check('a question can be re-opened for editing', !!document.querySelector('.dtc-q .dtc-q-title'))
await click(findButton('跳过，你决定'))
check('skip advances the flow', !!document.querySelector('.dtc-q-confirm') || !!document.querySelector('.dtc-q .dtc-q-title'))

// ── 5. confirm → ready ──────────────────────────────────────────────────
let guard = 0
while (!document.querySelector('.dtc-q-confirm') && guard < 10) {
  guard += 1
  if (!document.querySelector('.dtc-q')) break
  await chooseOptions([0])
  await nextStep()
}
await click(findButton('对，生成任务书'))
await flush()
check('ready card is rendered', !!document.querySelector('.dtc-ready'))
check('ready card offers both actions', !!findButton('复制任务书') && !!findButton('开始执行'))
check('brief has the standard sections', briefText().includes('交付物') && briefText().includes('验收标准') && briefText().includes('执行约定'))
check('history entry is saved on completion', (historyStore() || []).length === 1, JSON.stringify(historyStore() && historyStore().length))
check('history entry keeps both brief styles', (historyStore()[0].standard || '').includes('# 任务') && (historyStore()[0].compact || '').includes('约定：'))

// ── 6. copy ─────────────────────────────────────────────────────────────
await click(findButton('复制任务书'))
await flush()
check('copy writes the brief to the clipboard', copied.length === 1 && copied[0].includes('# 任务') && copied[0].includes('不要反问'))

// ── 7. start executing: draft hand-off ──────────────────────────────────
await click(findButton('开始执行'))
await flush()
check('startSession receives the brief as a prompt', calls.startSession.length === 1 && calls.startSession[0].options.prompt.includes('# 任务'))
check('startSession replaces any draft', calls.startSession[0].options.whenDraftExists === 'replace')
check('layout switches to the conversation', calls.selectPanel.indexOf('conversation') >= 0)
check('a success toast explains the next step', textOf(document.querySelector('.dtc-toast')).includes('按 Enter 发送'))

// ── 8. compact style switches the brief ─────────────────────────────────
const standardBriefLength = briefText().length
await click(findButton('极简'))
check('compact style changes the brief', briefText().includes('约定：') && !briefText().includes('执行约定'))
check('compact brief is shorter than the standard brief', briefText().length < standardBriefLength, briefText().length + ' vs ' + standardBriefLength)

// ── 9. mode switch on a fresh flow ──────────────────────────────────────
await click(findButton('新任务'))
check('new task returns to the landing page', !!document.querySelector('.dtc-landing'))
check('history lists the finished task', textOf(document.querySelector('.dtc-history')).includes(RAW))

await type(landingTextarea(), '帮我修复 main.py 的报错')
await click(findButton('开始澄清'))
check('fix task asks for the symptom', currentQuestionTitle().includes('什么现象'), currentQuestionTitle())
await click(findButtonContaining('快速'))
check('quick mode budgets three questions', progressText().includes('/ 3'), progressText())

// ── 10. auto chip re-opens a detected dimension ─────────────────────────
await click(findButton('新任务'))
await type(landingTextarea(), '用 Python 把 /tmp/sales.csv 做成 3 页报告')
await click(findButton('开始澄清'))
const autoChips = all('.dtc-auto-chip')
check('multiple detected dimensions are listed', autoChips.length >= 2, String(autoChips.length))
const editableChip = autoChips.filter(chip => textOf(chip).includes('篇幅'))[0]
if (editableChip) {
  await click(editableChip)
  check('clicking an editable auto chip re-opens its question', currentQuestionTitle().includes('篇幅'), currentQuestionTitle())
} else {
  check('clicking an editable auto chip re-opens its question', false, 'no length chip found')
}
const staticChips = all('.dtc-auto-chip-static')
check('detected dimensions without a question are static', staticChips.length >= 1, String(staticChips.length))

// ── 11. locale switch re-renders labels ─────────────────────────────────
await React.act(async function switchLocale() {
  activeLanguage = 'en'
  for (const subscriber of Array.from(localeSubscribers)) subscriber()
})
check('header follows the locale', textOf(document.querySelector('.dtc-title')).includes('Task Clarifier'))
check('buttons follow the locale', !!findButton('New task'))
await React.act(async function switchLocaleBack() {
  activeLanguage = 'zh'
  for (const subscriber of Array.from(localeSubscribers)) subscriber()
})
check('dashboard restores the Chinese locale', textOf(document.querySelector('.dtc-title')).includes('任务澄清器'))

// ── 12. session survives a remount ──────────────────────────────────────
const beforeRemount = sessionStore()
await unmount()
await mount()
check('session is restored after remount', (sessionStore() || {}).raw === (beforeRemount || {}).raw)
check('restored session keeps the flow UI', !!document.querySelector('.dtc-flow') || !!document.querySelector('.dtc-ready') || !!document.querySelector('.dtc-landing'))

// ── 13. history open restores a finished task ───────────────────────────
await click(findButton('新任务'))
const historyRow = document.querySelector('.dtc-history-main')
check('history row is clickable', !!historyRow)
if (historyRow) {
  await click(historyRow)
  check('opening history restores the saved brief', !!document.querySelector('.dtc-ready'))
}

// ── report ──────────────────────────────────────────────────────────────
await unmount()
const failed = results.filter(result => !result.ok).length
console.log('\n' + (results.length - failed) + '/' + results.length + ' interaction checks passed')
if (failed > 0) process.exitCode = 1
