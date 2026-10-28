/**
 * Engine + registration tests for dsh-task-clarifier.
 *
 * Run with: node --test tests/
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { api, applyWithFakeContext, module } from './harness.mjs'

const ZH_PLUGIN = '帮我做一个带左侧栏入口的 DSH 插件，用来整理会议纪要'
const EN_PLUGIN = 'Build me a DSH plugin with a left-sidebar entry that turns meeting notes into action items'
const ZH_FIX = '修复脚本报错：运行 main.py 时提示 ModuleNotFoundError'
const ZH_REPORT = '把当前目录的 CSV 数据用 Python 做成一份 3 页的图表报告'

function walkthrough(raw, mode) {
  const analysis = api.analyzeTask(raw)
  let answers = {}
  const plan = () => api.buildPlan(analysis, mode, answers, [])
  for (let guard = 0; guard < 40; guard += 1) {
    const next = api.nextQuestion(plan(), answers)
    if (!next) break
    if (next.type === 'confirm') {
      answers = Object.assign({}, answers, { confirm: { values: ['yes'], text: '' } })
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
    raw,
    analysis,
    dims,
    notes: [],
    lang: analysis.lang,
    style: 'standard',
    assume: 'assume',
  })
  const compact = api.composeBrief({
    raw,
    analysis,
    dims,
    notes: [],
    lang: analysis.lang,
    style: 'compact',
    assume: 'assume',
  })
  return { analysis, answers, plan: finalPlan, dims, brief, compact }
}

test('registers locale + left-sidebar row + keyed main page', () => {
  const { registrations } = applyWithFakeContext()
  const locale = registrations.find(entry => entry.type === 'locale')
  assert.ok(locale, 'locale dictionary is registered')
  assert.equal(locale.namespace, 'dsh-task-clarifier')
  assert.ok(locale.dicts.zh && locale.dicts.en, 'both locales shipped')

  const sidebar = registrations.find(
    entry => entry.type === 'register' && entry.options.name === 'sidebar.panellist',
  )
  assert.ok(sidebar, 'sidebar.panellist row is registered')
  assert.equal(sidebar.options.id, 'task-clarifier')
  assert.equal(sidebar.options.order, 40)
  assert.equal(typeof sidebar.component, 'function', 'row glyph component is provided')
  assert.equal(typeof sidebar.options.label, 'function', 'label is a thunk for locale re-resolution')

  const page = registrations.find(
    entry => entry.type === 'register' && entry.options.name === 'main',
  )
  assert.ok(page, 'main page is registered')
  assert.equal(page.options.key, 'task-clarifier', 'page key equals the sidebar row id')
  assert.equal(typeof page.component, 'function')
  assert.deepEqual(module.inject, ['slots', 'locale'])
  assert.equal(module.name, 'dsh-task-clarifier')
})

test('locale dictionaries have identical, non-empty key sets', () => {
  const zhKeys = Object.keys(api.zh).sort()
  const enKeys = Object.keys(api.en).sort()
  assert.deepEqual(zhKeys, enKeys, 'zh and en must expose the same keys')
  for (const key of zhKeys) {
    assert.ok(String(api.zh[key]).trim() !== '', 'zh key filled: ' + key)
    assert.ok(String(api.en[key]).trim() !== '', 'en key filled: ' + key)
  }
})

test('language detection follows the input', () => {
  assert.equal(api.detectLanguage(ZH_PLUGIN), 'zh')
  assert.equal(api.detectLanguage(EN_PLUGIN), 'en')
  assert.equal(api.detectLanguage(''), 'en')
})

test('intent classification separates build / fix / write / explain', () => {
  assert.equal(api.detectIntent(ZH_PLUGIN), 'build')
  assert.equal(api.detectIntent(ZH_FIX), 'fix')
  assert.equal(api.detectIntent('写一篇关于远程办公的文章'), 'write')
  assert.equal(api.detectIntent('解释一下什么是依赖注入'), 'explain')
  assert.equal(api.detectIntent('调研三款笔记软件'), 'research')
  assert.equal(api.detectIntent('今天天气不错'), 'general')
})

test('facts are extracted from the sentence', () => {
  const facts = api.detectFacts(ZH_REPORT)
  assert.equal(facts.cwdHint, true, 'current-folder hint detected')
  assert.ok(facts.tech.includes('Python'), 'tech detected')
  assert.equal(facts.length, '3 页')

  const pathFacts = api.detectFacts('把 /tmp/sales.csv 整理成表格')
  assert.ok(pathFacts.paths.includes('/tmp/sales.csv'), 'absolute path detected')

  const fixFacts = api.detectFacts(ZH_FIX)
  assert.ok(fixFacts.paths.includes('main.py'), 'file name detected')
})

test('auto dimensions skip already-answered questions', () => {
  const analysis = api.analyzeTask(ZH_REPORT)
  const plan = api.buildPlan(analysis, 'standard', {}, [])
  const ids = plan.questions.map(question => question.id)
  assert.equal(ids.includes('artifact_length'), false, 'length question is skipped (3 页 detected)')
  assert.equal(ids.includes('artifact_type'), true, 'artifact type is still asked')
  assert.equal(ids[ids.length - 1], 'confirm', 'confirm is always last')

  const overridden = api.buildPlan(analysis, 'standard', {}, ['length'])
  assert.ok(overridden.questions.some(question => question.dim === 'length'), 'override re-opens the skipped question')
})

test('mode caps the number of new questions', () => {
  const analysis = api.analyzeTask('帮我做一个插件')
  for (const mode of ['fast', 'standard', 'deep']) {
    const plan = api.buildPlan(analysis, mode, {}, [])
    const substantive = plan.questions.filter(question => question.type !== 'confirm')
    assert.equal(
      substantive.length,
      api.MODE_CAP[mode],
      mode + ' asks exactly ' + api.MODE_CAP[mode] + ' substantive questions',
    )
  }
})

test('every question definition is well formed', () => {
  const ids = new Set()
  for (const id of Object.keys(api.QUESTIONS)) {
    const question = api.QUESTIONS[id]
    assert.equal(question.id, id, 'id matches its key: ' + id)
    assert.ok(!ids.has(id), 'unique question id')
    ids.add(id)
    assert.ok(question.title && question.title.zh && question.title.en, 'bilingual title: ' + id)
    assert.ok(['single', 'multi', 'text', 'confirm'].includes(question.type), 'valid type: ' + id)
    if (question.type === 'single' || question.type === 'multi') {
      assert.ok(Array.isArray(question.options) && question.options.length > 0, 'options present: ' + id)
      for (const option of question.options) {
        assert.ok(typeof option.value === 'string' && option.value !== '', 'option value: ' + id)
        assert.ok(option.label && option.label.zh && option.label.en, 'option label: ' + id + '/' + option.value)
      }
    }
  }
  for (const intent of Object.keys(api.INTENTS)) {
    for (const questionId of api.INTENTS[intent].questions) {
      assert.ok(api.QUESTIONS[questionId], intent + ' references a real question: ' + questionId)
    }
  }
})

test('a full walkthrough produces a standard brief with every expected section', () => {
  const result = walkthrough(ZH_PLUGIN, 'standard')
  for (const heading of ['# 任务', '## 交付物', '## 范围与位置', '## 验收标准', '## 执行约定']) {
    assert.ok(result.brief.includes(heading), 'brief includes ' + heading)
  }
  assert.ok(result.brief.includes('DSH 插件'), 'brief keeps the original task')
  assert.ok(result.brief.includes('不要反问'), 'brief carries the no-re-ask rule')
  assert.ok(!/undefined|null|\[object Object\]/.test(result.brief), 'no broken interpolation')
  assert.ok(result.brief.length > 80)
})

test('compact brief is shorter, still carries rules and the task', () => {
  const { brief, compact } = walkthrough(ZH_PLUGIN, 'standard')
  assert.ok(compact.length < brief.length, 'compact is shorter')
  assert.ok(compact.includes('任务：'), 'compact has a task line')
  assert.ok(compact.includes('约定：'), 'compact has a rules line')
  assert.ok(!/undefined|null|\[object Object\]/.test(compact))
})

test('english input yields an english brief and english labels', () => {
  const result = walkthrough(EN_PLUGIN, 'standard')
  assert.ok(result.brief.includes('# Task'), 'english task heading')
  assert.ok(result.brief.includes('## Deliverable'), 'english deliverable heading')
  assert.ok(result.brief.includes('do not ask back'), 'english no-re-ask rule')
})

test('fix intent keeps the symptom and expected behaviour in the brief', () => {
  const result = walkthrough(ZH_FIX, 'deep')
  assert.ok(result.brief.includes('ModuleNotFoundError') || result.brief.includes('main.py'), 'symptom context kept')
  assert.ok(result.brief.includes('## 验收标准'), 'acceptance section present')
})

test('auto-detected dimensions appear in the brief without a question', () => {
  const analysis = api.analyzeTask(ZH_REPORT)
  let answers = {}
  // Answer only what is asked; scope/length/tech should come from the sentence.
  for (let guard = 0; guard < 20; guard += 1) {
    const plan = api.buildPlan(analysis, 'fast', answers, [])
    const next = api.nextQuestion(plan, answers)
    if (!next) break
    const option = next.options && next.options[0]
    answers = Object.assign({}, answers, {
      [next.id]: next.type === 'confirm'
        ? { values: ['yes'], text: '' }
        : option
          ? { values: [option.value], text: '' }
          : { values: [], text: '补充' },
    })
  }
  const plan = api.buildPlan(analysis, 'fast', answers, [])
  const dims = api.resolveDims(plan, answers, analysis, analysis.lang)
  assert.ok(dims.stack, 'detected tech stack propagated')
  assert.ok(dims.length, 'detected length propagated')
  assert.ok(dims.scope, 'detected current folder propagated')
})

test('skipped questions still produce a usable brief', () => {
  const analysis = api.analyzeTask(ZH_PLUGIN)
  let answers = {}
  for (let guard = 0; guard < 20; guard += 1) {
    const plan = api.buildPlan(analysis, 'fast', answers, [])
    const next = api.nextQuestion(plan, answers)
    if (!next) break
    answers = Object.assign({}, answers, {
      [next.id]: next.type === 'confirm'
        ? { values: ['yes'], text: '' }
        : { values: [], text: '', skipped: true },
    })
  }
  const plan = api.buildPlan(analysis, 'fast', answers, [])
  const dims = api.resolveDims(plan, answers, analysis, analysis.lang)
  const brief = api.composeBrief({ raw: ZH_PLUGIN, analysis, dims, notes: [], lang: 'zh', style: 'standard', assume: 'assume' })
  assert.ok(brief.includes('# 任务'))
  assert.ok(brief.includes('不要反问'))
})

test('assume modes change the working rules', () => {
  const analysis = api.analyzeTask(ZH_PLUGIN)
  const dims = {}
  const base = { raw: ZH_PLUGIN, analysis, dims, notes: [], lang: 'zh', style: 'standard' }
  const assumeDefault = api.composeBrief(Object.assign({}, base, { assume: 'assume' }))
  const askMode = api.composeBrief(Object.assign({}, base, { assume: 'ask' }))
  assert.ok(assumeDefault.includes('不要反问'))
  assert.ok(askMode.includes('停下来问我'))
})

test('notes are appended to the brief', () => {
  const analysis = api.analyzeTask(ZH_PLUGIN)
  const dims = {}
  const brief = api.composeBrief({
    raw: ZH_PLUGIN,
    analysis,
    dims,
    notes: ['还要兼容 Windows'],
    lang: 'zh',
    style: 'standard',
    assume: 'assume',
  })
  assert.ok(brief.includes('还要兼容 Windows'))
})

test('token estimate is monotonic and prefers cjk counts', () => {
  const short = api.estimateTokens('做一个插件')
  const long = api.estimateTokens('做一个插件，带左侧栏入口，并且支持历史记录和复制的功能')
  assert.ok(short > 0)
  assert.ok(long > short)
  assert.ok(api.estimateTokens('hello world') > 0)
})

test('stats report score, tokens and rounds', () => {
  const result = walkthrough(ZH_PLUGIN, 'standard')
  const stats = api.briefStats(result.brief, ZH_PLUGIN, result.dims)
  assert.ok(stats.tokens > 0)
  assert.ok(stats.score >= 0 && stats.score <= 100)
  assert.ok(stats.rounds >= 1)
  assert.ok(stats.chars === result.brief.length)
})

test('confirm summary mentions the task dimensions', () => {
  const result = walkthrough(ZH_PLUGIN, 'standard')
  const summary = api.confirmSummary(result.analysis, result.dims, 'zh')
  assert.ok(summary.includes('我理解你要'))
  assert.ok(summary.includes('交付'), 'summary lists the deliverable')
  assert.ok(summary.length > 20)
})

test('answered questions stay visible after switching to a shallower mode', () => {
  const analysis = api.analyzeTask('帮我做一个插件')
  const deepPlan = api.buildPlan(analysis, 'deep', {}, [])
  const deepPending = deepPlan.questions.filter(question => question.type !== 'confirm')
  assert.equal(deepPending.length, 8)
  let answers = {}
  for (const question of deepPending.slice(0, 4)) {
    const option = question.options && question.options[0]
    answers = Object.assign({}, answers, {
      [question.id]: option ? { values: [option.value], text: '' } : { values: [], text: '补充' },
    })
  }
  const fastPlan = api.buildPlan(analysis, 'fast', answers, [])
  const visible = fastPlan.questions.filter(
    question => question.type !== 'confirm' && answers[question.id],
  )
  assert.equal(visible.length, 4, 'answered questions are never hidden by the mode cap')
  assert.equal(
    fastPlan.questions.filter(question => question.type !== 'confirm').length,
    4,
    'the fast cap is a total budget: four answered questions fill it, so no new question is added',
  )
})
