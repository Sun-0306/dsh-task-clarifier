/**
 * dsh-task-clarifier — browser half (single classic-JS module for the DSH Web loader).
 *
 * One sentence in, a precise task brief out.
 *
 * The plugin contributes two seats of the shipped shell, exactly like the
 * built-in Plugins / Schedule pages:
 *   · a row in the left sidebar's global panel list (`sidebar.panellist`, id
 *     `task-clarifier`), whose glyph this file draws at the shell's size and
 *     active state, and
 *   · the page that row selects, registered in the layout's keyed `main` slot
 *     under the same id.
 *
 * Everything here runs locally in the browser: intent and fact detection, the
 * adaptive question queue, the brief composer, token estimates and the local
 * history. Clarifying therefore costs zero model tokens. The finished brief is
 * handed to the conversation through `ctx.get('uiWorkspace').startSession(...)`
 * (its `prompt` option pre-fills the new session's composer draft), and the
 * layout is switched to the conversation so the user reviews and sends.
 *
 * No build step: no TypeScript, no JSX, no module statements, no Host RPC.
 * React is the only module-table entry this file resolves.
 */
window.__ModuleLoader__.load({
  id: 'dsh-task-clarifier',
  factory(require) {
    'use strict'
    const React = require('react')
    const h = React.createElement
    const useState = React.useState
    const useEffect = React.useEffect
    const useMemo = React.useMemo
    const useRef = React.useRef
    const useCallback = React.useCallback

    // ── fixed identifiers ─────────────────────────────────────────────────
    /** Locale namespace for the dictionary and the shell's label resolution. */
    const NS = 'dsh-task-clarifier'
    /** Shared key: the sidebar row id and the keyed `main` occupant key. */
    const PANEL_ID = 'task-clarifier'
    /** Row order among the shell's global panel rows (Plugins 0, Schedule 10). */
    const PANEL_ORDER = 40

    const STORE_SESSION = 'dsh-task-clarifier.session.v1'
    const STORE_HISTORY = 'dsh-task-clarifier.history.v1'
    const STORE_SETTINGS = 'dsh-task-clarifier.settings.v1'
    const HISTORY_MAX = 24

    const MONO_FONT = 'ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace'

    // ── locale dictionaries ───────────────────────────────────────────────
    const zh = {
      'panel.label': '任务澄清',
      'panel.title': '任务澄清器',
      'panel.subtitle': '一句话说清楚 · 几个问题问完 · 一份精准任务书',
      'panel.newTask': '新任务',

      'mode.label': '澄清深度',
      'mode.fast': '快速',
      'mode.standard': '标准',
      'mode.deep': '深度',
      'mode.fastHint': '3 个关键问题，最快出发',
      'mode.standardHint': '5 个关键问题，推荐',
      'mode.deepHint': '8 个关键问题，尽量一次做对',

      'landing.eyebrow': '一句话开始',
      'landing.title': '你想让 DSH 做什么？',
      'landing.hint': '先用一句话描述。我会接着问几个关键问题，把模糊的地方补全，生成一份可以直接发送的任务书——省掉来回试探的 token。',
      'landing.placeholder': '例如：帮我做一个带左侧栏入口的 DSH 插件，用来整理会议纪要',
      'landing.start': '开始澄清',
      'landing.startHint': 'Enter 开始 · Shift+Enter 换行',
      'landing.direct': '跳过提问，直接整理',
      'landing.examples': '没想好？试试这些',
      'ex.1': '做一个带左侧栏入口的 DSH 插件',
      'ex.2': '把当前目录的 CSV 做成一份图表报告',
      'ex.3': '调研三款本地笔记软件并给建议',
      'ex.4': '把这份草稿改写成正式邮件',
      'ex.5': '解释一下 DSH 的插件机制',

      'flow.step': '第 {n} 题',
      'flow.of': '共 {total} 题',
      'flow.progress': '已澄清 {done} / {total} 项',
      'flow.autoTitle': '已自动识别',
      'flow.autoEdit': '修改',
      'flow.autoStatic': '已识别，会写进任务书',
      'flow.edit': '修改',
      'flow.skip': '跳过，你决定',
      'flow.back': '上一个',
      'flow.next': '下一步',
      'flow.finish': '直接生成任务书',
      'flow.optional': '可留空',
      'flow.textPlaceholder': '也可以自己写…',
      'flow.multiHint': '可多选',
      'flow.selected': '已选 {n} 项',
      'flow.assumeLabel': '信息不足时',
      'assume.assume': '按默认做',
      'assume.assumptions': '先列假设',
      'assume.ask': '问我',
      'assume.assumeHint': '缺信息时按最合理的默认直接执行，不反问（最省 token）',
      'assume.assumptionsHint': '缺信息时先列出假设再执行，不反问',
      'assume.askHint': '遇到关键不确定点时停下来问你，会多一轮往返',

      'flow.confirmTitle': '确认一下，我理解得对吗？',
      'flow.confirmYes': '对，生成任务书',
      'flow.confirmFix': '需要补充',
      'flow.confirmPlaceholder': '补充或纠正（会写进任务书）',
      'flow.continue': '继续补充',
      'flow.continueTitle': '还有什么要补充的？',
      'flow.continuePlaceholder': '例如：还要兼容 Windows；不要改现有接口',
      'flow.continueSubmit': '加进任务书',

      'ready.title': '澄清完成',
      'ready.desc': '任务书已经生成。可以直接开始，也可以再补充一句。',
      'ready.again': '重新开始',
      'ready.more': '继续补充',
      'ready.answerMore': '继续回答（还剩 {n} 题）',

      'preview.title': '任务书预览',
      'preview.style': '风格',
      'preview.standard': '标准',
      'preview.compact': '极简',
      'preview.tokens': '≈ {n} tokens',
      'preview.chars': '{n} 字',
      'preview.score': '信息完整度 {n}%',
      'preview.rounds': '预计少问 ≈ {n} 轮',
      'preview.local': '本页澄清 0 token',
      'preview.emptyTitle': '任务书会实时生成',
      'preview.emptyBody': '在左侧回答几个问题，这里会同步汇总。右上角可切换标准 / 极简两种长度。',
      'preview.bullet1': '标准版：结构清晰，适合第一次执行',
      'preview.bullet2': '极简版：更短更省 token，适合简单任务',
      'preview.copy': '复制任务书',
      'preview.start': '开始执行',
      'preview.starting': '正在填入对话…',
      'preview.footerNote': '澄清过程在本页完成，不消耗模型 token',
      'preview.locked': '完成或直接生成后即可复制',

      'history.title': '最近的任务',
      'history.empty': '还没有历史任务。任务书生成后会自动保存在本机浏览器。',
      'history.open': '查看任务书',
      'history.reuse': '重新澄清',
      'history.delete': '删除',
      'history.clear': '清空历史',
      'history.clearConfirm': '清空全部历史任务？',
      'history.time.justNow': '刚刚',
      'history.time.minutes': '{n} 分钟前',
      'history.time.hours': '{n} 小时前',
      'history.time.days': '{n} 天前',

      'toast.copied': '任务书已复制',
      'toast.copyFailed': '复制失败，请手动选中文本复制',
      'toast.started': '已打开新对话并填入任务书，按 Enter 发送',
      'toast.startCopyOnly': '当前环境无法自动打开对话，任务书已复制',
      'toast.startFailed': '打开新对话失败，任务书已复制',
      'toast.reset': '已开始新任务',
      'toast.deleted': '已删除',
      'toast.cleared': '历史已清空',
      'toast.nothingToCopy': '先输入一句话',
      'toast.restored': '已载入历史任务',

      'footer.privacy': '数据只保存在本机浏览器，不会上传',

      'error.crashed': '任务澄清器出错了',
      'error.crashedHint': '刷新页面即可恢复；你的澄清进度会保留在本机。',
      'error.detail': '详情',
      'error.retry': '重试',

      'section.task': '任务',
      'section.deliverable': '交付物',
      'section.scope': '范围与位置',
      'section.constraints': '约束',
      'section.acceptance': '验收标准',
      'section.context': '背景与参考',
      'section.rules': '执行约定',

      'dim.deliverable': '交付物',
      'dim.scope': '范围',
      'dim.features': '能力',
      'dim.stack': '技术栈',
      'dim.constraints': '约束',
      'dim.acceptance': '验收',
      'dim.reference': '参考',
      'dim.audience': '读者',
      'dim.depth': '深度',
      'dim.format': '格式',
      'dim.style': '风格',
      'dim.length': '篇幅',
      'dim.context': '背景',
      'dim.priority': '优先级',
      'dim.risk': '改动权限',
      'dim.evidence': '证据',
      'dim.env': '环境',
      'dim.symptom': '现象',
      'dim.expected': '期望',
      'dim.repro': '复现',
      'dim.goal': '目标',
      'dim.avoid': '避免',
      'dim.structure': '结构',
      'dim.interface': '界面',
    }

    const en = {
      'panel.label': 'Task Clarifier',
      'panel.title': 'Task Clarifier',
      'panel.subtitle': 'One sentence in · a few questions · one precise brief',
      'panel.newTask': 'New task',

      'mode.label': 'Depth',
      'mode.fast': 'Quick',
      'mode.standard': 'Standard',
      'mode.deep': 'Deep',
      'mode.fastHint': '3 key questions — fastest route',
      'mode.standardHint': '5 key questions — recommended',
      'mode.deepHint': '8 key questions — get it right first time',

      'landing.eyebrow': 'START WITH ONE SENTENCE',
      'landing.title': 'What do you want DSH to do?',
      'landing.hint': 'Describe it in one sentence. I will ask a few targeted questions, fill the gaps, and produce a send-ready task brief — so the conversation does not spend tokens guessing.',
      'landing.placeholder': 'e.g. Build me a DSH plugin with a left-sidebar entry that turns meeting notes into action items',
      'landing.start': 'Start clarifying',
      'landing.startHint': 'Enter to start · Shift+Enter for a new line',
      'landing.direct': 'Skip questions and tidy it up',
      'landing.examples': 'Not sure? Try one of these',
      'ex.1': 'Build a DSH plugin with a left-sidebar entry',
      'ex.2': 'Turn the CSVs in this folder into a chart report',
      'ex.3': 'Compare three local note apps and recommend one',
      'ex.4': 'Rewrite this draft as a formal email',
      'ex.5': 'Explain how DSH plugins work',

      'flow.step': 'Question {n}',
      'flow.of': 'of {total}',
      'flow.progress': '{done} of {total} clarified',
      'flow.autoTitle': 'Detected from your sentence',
      'flow.autoEdit': 'Edit',
      'flow.autoStatic': 'Detected — written into the brief',
      'flow.edit': 'Edit',
      'flow.skip': 'Skip — your call',
      'flow.back': 'Back',
      'flow.next': 'Next',
      'flow.finish': 'Generate the brief now',
      'flow.optional': 'Optional',
      'flow.textPlaceholder': 'Or type your own…',
      'flow.multiHint': 'Pick any',
      'flow.selected': '{n} selected',
      'flow.assumeLabel': 'When info is missing',
      'assume.assume': 'Assume defaults',
      'assume.assumptions': 'List assumptions',
      'assume.ask': 'Ask me',
      'assume.assumeHint': 'Proceed with the most reasonable defaults and never ask back (saves the most tokens)',
      'assume.assumptionsHint': 'State assumptions first, then proceed — never ask back',
      'assume.askHint': 'Pause and ask me at genuinely uncertain points (costs a round-trip)',

      'flow.confirmTitle': 'Let me check I understood you',
      'flow.confirmYes': 'Yes — build the brief',
      'flow.confirmFix': 'Needs a fix',
      'flow.confirmPlaceholder': 'Additions or corrections (written into the brief)',
      'flow.continue': 'Add more',
      'flow.continueTitle': 'Anything else to add?',
      'flow.continuePlaceholder': 'e.g. must also work on Windows; do not change the public API',
      'flow.continueSubmit': 'Add to the brief',

      'ready.title': 'Clarified',
      'ready.desc': 'Your task brief is ready. Start now, or add one more note.',
      'ready.again': 'Start over',
      'ready.more': 'Add more',
      'ready.answerMore': 'Answer {n} remaining',

      'preview.title': 'Task brief preview',
      'preview.style': 'Style',
      'preview.standard': 'Standard',
      'preview.compact': 'Compact',
      'preview.tokens': '≈ {n} tokens',
      'preview.chars': '{n} chars',
      'preview.score': '{n}% complete',
      'preview.rounds': '≈ {n} fewer follow-ups',
      'preview.local': '0 tokens to clarify',
      'preview.emptyTitle': 'Your brief builds up live',
      'preview.emptyBody': 'Answer a few questions on the left and the brief assembles here. Switch between Standard and Compact in the corner.',
      'preview.bullet1': 'Standard: clear structure, best for a first run',
      'preview.bullet2': 'Compact: shorter and cheaper in tokens, best for simple tasks',
      'preview.copy': 'Copy brief',
      'preview.start': 'Start executing',
      'preview.starting': 'Filling the conversation…',
      'preview.footerNote': 'Clarification happens in this page — no model tokens spent',
      'preview.locked': 'Finish or generate the brief to copy it',

      'history.title': 'Recent tasks',
      'history.empty': 'No recent tasks yet. A finished brief is saved in this browser automatically.',
      'history.open': 'Open brief',
      'history.reuse': 'Clarify again',
      'history.delete': 'Delete',
      'history.clear': 'Clear history',
      'history.clearConfirm': 'Clear all saved tasks?',
      'history.time.justNow': 'just now',
      'history.time.minutes': '{n} min ago',
      'history.time.hours': '{n} h ago',
      'history.time.days': '{n} d ago',

      'toast.copied': 'Brief copied',
      'toast.copyFailed': 'Copy failed — select and copy the text manually',
      'toast.started': 'Opened a new conversation with the brief — press Enter to send',
      'toast.startCopyOnly': 'This environment cannot open a conversation; the brief was copied instead',
      'toast.startFailed': 'Could not open a conversation; the brief was copied instead',
      'toast.reset': 'Started a new task',
      'toast.deleted': 'Deleted',
      'toast.cleared': 'History cleared',
      'toast.nothingToCopy': 'Describe your task first',
      'toast.restored': 'Loaded the saved task',

      'footer.privacy': 'Data stays in this browser — nothing is uploaded',

      'error.crashed': 'Task Clarifier hit an error',
      'error.crashedHint': 'Refresh the page to recover; your progress is kept locally.',
      'error.detail': 'Details',
      'error.retry': 'Retry',

      'section.task': 'Task',
      'section.deliverable': 'Deliverable',
      'section.scope': 'Scope & location',
      'section.constraints': 'Constraints',
      'section.acceptance': 'Acceptance',
      'section.context': 'Context & references',
      'section.rules': 'Working rules',

      'dim.deliverable': 'Deliverable',
      'dim.scope': 'Scope',
      'dim.features': 'Capabilities',
      'dim.stack': 'Stack',
      'dim.constraints': 'Constraints',
      'dim.acceptance': 'Acceptance',
      'dim.reference': 'References',
      'dim.audience': 'Audience',
      'dim.depth': 'Depth',
      'dim.format': 'Format',
      'dim.style': 'Style',
      'dim.length': 'Length',
      'dim.context': 'Context',
      'dim.priority': 'Priority',
      'dim.risk': 'Change rights',
      'dim.evidence': 'Evidence',
      'dim.env': 'Environment',
      'dim.symptom': 'Symptom',
      'dim.expected': 'Expected',
      'dim.repro': 'Repro',
      'dim.goal': 'Goal',
      'dim.avoid': 'Avoid',
      'dim.structure': 'Structure',
      'dim.interface': 'Interface',
    }

    // ── locale plumbing ──────────────────────────────────────────────────
    let localeService = null
    let boundTranslate = null

    function wireLocale(service, boundCandidate) {
      localeService = service || null
      let bound = typeof boundCandidate === 'function' ? boundCandidate : null
      if (bound === null && localeService && typeof localeService.bind === 'function') {
        try {
          bound = localeService.bind(NS)
        } catch (error) {
          bound = null
        }
      }
      boundTranslate = typeof bound === 'function' ? bound : null
    }

    function fallbackDictionary() {
      let language = ''
      try {
        if (typeof document !== 'undefined' && document.documentElement) {
          language = String(document.documentElement.lang || '')
        }
      } catch (error) {
        language = ''
      }
      return language.toLowerCase().indexOf('en') === 0 ? en : zh
    }

    function interpolate(text, params) {
      if (!params || typeof params !== 'object') return text
      return text.replace(/\{(\w+)\}/g, function replaceToken(match, name) {
        return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
      })
    }

    /** Translate a dictionary key, interpolating `{name}` placeholders. */
    function t(key, params) {
      let text = null
      if (boundTranslate !== null) {
        try {
          text = boundTranslate(key)
        } catch (error) {
          text = null
        }
      }
      if (typeof text !== 'string' || text === '') {
        const dictionary = fallbackDictionary()
        text = Object.prototype.hasOwnProperty.call(dictionary, key) ? dictionary[key] : key
      }
      return interpolate(text, params)
    }
    // ══════════════════════════════════════════════════════════════════════
    // Clarification engine — pure, deterministic, local.
    //
    // The engine turns one sentence into (a) a small adaptive question queue and
    // (b) a precise task brief. It is deliberately rule-based: clarifying here
    // costs no model tokens, and the same sentence always yields the same
    // questions, so the UI never looks random.
    // ══════════════════════════════════════════════════════════════════════

    // ── language helpers ──────────────────────────────────────────────────
    const CJK_TEST = /[\u2e80-\u9fff\uf900-\ufaff]/

    function countCjk(text) {
      const matches = String(text || '').match(/[\u2e80-\u9fff\uf900-\ufaff]/g)
      return matches ? matches.length : 0
    }

    function detectLanguage(text) {
      const raw = String(text || '')
      const cjk = countCjk(raw)
      if (cjk === 0) return 'en'
      const letters = raw.replace(/[^\p{L}]/gu, '').length || 0
      if (letters === 0) return 'zh'
      return cjk / letters >= 0.22 ? 'zh' : 'en'
    }

    function pickPair(pair, lang) {
      if (pair === null || pair === undefined) return ''
      if (typeof pair === 'string') return pair
      return pair[lang] || pair.zh || pair.en || ''
    }

    function trimSentence(text) {
      return String(text || '').trim().replace(/[。．.!！?？,，\s]+$/u, '').trim()
    }

    /** True when the text carries an actual task, not just punctuation/emoji. */
    function hasMeaningfulContent(text) {
      const raw = String(text || '')
      if (raw.trim() === '') return false
      return raw.replace(/[\s\p{P}\p{S}]/gu, '').length > 0
    }

    /** Task line for the brief; punctuation-only input still yields a line. */
    function briefTaskText(raw) {
      return trimSentence(raw) || String(raw || '').trim()
    }

    function uniquePush(list, value) {
      if (!value) return
      if (list.indexOf(value) < 0) list.push(value)
    }

    // ── intent detection ──────────────────────────────────────────────────
    // Scores are keyword weights: a strong verb (修复 / 分析 / 调研) outweighs a
    // bare object noun (插件 / 报告), so "修复插件报错" classifies as a fix even
    // though it mentions a plugin.
    const INTENT_RULES = [
      { id: 'fix', weight: 40, re: /(修复|修好|修一下|修理|报错|错误|bug|不工作|不生效|没反应|失败|崩溃|闪退|异常|卡住|冲突|修正|改正|fix|debug|broken|not work|doesn'?t work|error|crash|fails?)/gi },
      { id: 'analyze', weight: 30, re: /(分析|审查|审计|检查|评估|复盘|诊断|对比|比对|看看|梳理|review|audit|analy[sz]e|evaluate|assess|compare|examine)/gi },
      { id: 'research', weight: 34, re: /(调研|查一下|查一查|搜索|搜集|收集|整理资料|竞品|市场|文献|研究一下|research|survey|investigate|look up|find out)/gi },
      { id: 'explain', weight: 28, re: /(是什么|为什么|为啥|怎么|如何|原理|机制|区别|解释|入门|教我|讲讲|科普|explain|what is|why\b|how (?:do|does|to)|difference)/gi },
      { id: 'write', weight: 30, re: /(写一篇|写段|文案|文章|邮件|润色|改写|扩写|缩写|翻译|起名|标题|write|rewrite|polish|translate|email|copywriting)/gi },
      { id: 'artifact', weight: 28, re: /(文档|报告|ppt|幻灯片|演示文稿|表格|excel|word|pdf|简历|readme|report|slide|spreadsheet|document|resume)/gi },
      { id: 'operate', weight: 26, re: /(安装|部署|配置|启动|运行一下|升级|迁移|install|deploy|configure|setup|migrate|upgrade|launch)/gi },
      { id: 'plan', weight: 22, re: /(方案|规划|计划|路线图|技术选型|架构设计|设计一下|plan|roadmap|architecture|strategy)/gi },
      { id: 'build', weight: 25, re: /(开发|实现|搭建|做一个|做个|写一个|写个|创建|编写|插件|脚本|程序|工具|应用|网站|网页|组件|接口|函数|build|create|implement|develop|make a|plugin|script|tool|app|website|component|cli)/gi },
    ]
    const INTENT_PRIORITY = ['fix', 'analyze', 'research', 'explain', 'write', 'artifact', 'operate', 'plan', 'build']

    function detectIntent(text) {
      const source = String(text || '')
      let best = 'general'
      let bestScore = 0
      for (const rule of INTENT_RULES) {
        const matches = source.match(rule.re)
        const count = matches ? matches.length : 0
        if (count === 0) continue
        const score = rule.weight * Math.min(3, count)
        if (score > bestScore) {
          best = rule.id
          bestScore = score
        } else if (score === bestScore && INTENT_PRIORITY.indexOf(rule.id) < INTENT_PRIORITY.indexOf(best)) {
          best = rule.id
        }
      }
      if (bestScore < 20) return 'general'
      return best
    }

    // ── domain detection ──────────────────────────────────────────────────
    const DOMAIN_RULES = [
      ['code', /(代码|脚本|程序|插件|函数|api|接口|网页|网站|前端|后端|数据库|服务器|命令行|python|javascript|typescript|node|react|\.py\b|\.js\b|\.ts\b|shell|bash|cordis|dsh\b|code|script|plugin|website|component|endpoint)/i],
      ['data', /(数据|表格|csv|excel|统计|图表|可视化|sql|json|数据集|pandas|dataset|\bdata\b|chart|spreadsheet)/i],
      ['document', /(文档|报告|论文|ppt|幻灯片|pdf|word|简历|markdown|readme|document|report|slide|resume)/i],
      ['design', /(设计|界面|交互|\bui\b|\bux\b|logo|图标|海报|配色|视觉|版式|figma|design|interface|visual)/i],
      ['research', /(调研|竞品|市场|资料|文献|搜索|research|survey|competitor|market)/i],
      ['ops', /(安装|部署|配置|环境|服务器|docker|\bgit\b|ssh|nginx|迁移|deploy|install|configure|server|environment)/i],
      ['writing', /(文案|文章|邮件|翻译|润色|标题|公众号|推文|writing|article|email|translate)/i],
      ['learning', /(学习|入门|教程|原理|概念|怎么理解|learn|tutorial|concept)/i],
    ]

    function detectDomains(text) {
      const source = String(text || '')
      const found = []
      for (const pair of DOMAIN_RULES) {
        if (pair[1].test(source)) found.push(pair[0])
      }
      return found
    }

    // ── fact detection (what the sentence already tells us) ───────────────
    const TECH_RULES = [
      ['Python', /(?:python|pip|pandas|numpy|django|flask|pytest)\b|\.py\b/i],
      ['Node.js', /\bnode(?:\.?js)?\b|npm|pnpm|yarn/i],
      ['TypeScript', /\btypescript\b|\.ts\b/i],
      ['React', /\breact\b|next\.?js|jsx/i],
      ['JavaScript', /\bjavascript\b|\.js\b/i],
      ['R', /\bR语言\b|ggplot/i],
      ['SQL', /\bsql\b|sqlite|postgres|mysql/i],
      ['Excel', /\bexcel\b|xlsx|spreadsheet/i],
      ['Word', /\bword\b|docx/i],
      ['PPT', /\bppt\b|pptx|幻灯片|slides?\b/i],
      ['DSH', /\bdsh\b|deepseek harness|cordis/i],
      ['Docker', /\bdocker\b|容器/i],
      ['Shell', /\b(?:bash|zsh|shell)\b/i],
      ['Git', /\bgit\b|github|gitlab/i],
      ['macOS', /\bmacos\b|os x/i],
      ['Windows', /\bwindows\b|win10|win11/i],
      ['Linux', /\blinux\b|ubuntu|debian|centos/i],
    ]

    const STYLE_WORDS = ['简洁', '精简', '简短', '详细', '正式', '专业', '口语', '轻松', '幽默', '学术', '商务', '高级感', '朴实', 'concise', 'brief', 'detailed', 'formal', 'casual', 'professional', 'playful']

    function detectFacts(text) {
      const source = String(text || '')
      const facts = {
        paths: [],
        urls: [],
        tech: [],
        style: [],
        length: '',
        audience: '',
        negative: '',
        deadline: '',
        cwdHint: false,
        hasRef: false,
      }
      let match

      const urlRe = /https?:\/\/[^\s<>"'）)】\]，,。；;]+/gi
      while ((match = urlRe.exec(source)) !== null) {
        const url = match[0].replace(/[).,;]+$/, '')
        uniquePush(facts.urls, url)
      }

      const withoutUrls = source.replace(/https?:\/\/[^\s<>"'）)】\]，,。；;]+/gi, ' ')

      // Explicit negative spans never count as positive facts: "不要用 Python"
      // must not auto-fill the stack with Python, while it still lands in
      // facts.negative (and therefore in the brief's avoid line). The negated
      // clause is removed only for the positive detectors below.
      const positiveSource = source.replace(/(?:不要|别|避免|禁止|无需|不必|不需要|except|don't|avoid)\s*([^，。,.!；;\n]{0,48})/gi, ' ')

      const fileRe = /[A-Za-z0-9._@%+~-]+(?:\/[A-Za-z0-9._@%+~-]+)*\.(?:md|txt|js|mjs|cjs|ts|tsx|jsx|py|json|ya?ml|toml|csv|xlsx?|docx?|pptx?|pdf|html?|css|sh|rs|go|java|rb|sql|png|jpe?g|svg|webp|ipynb)\b/gi
      while ((match = fileRe.exec(withoutUrls)) !== null) {
        if (facts.paths.length >= 4) break
        uniquePush(facts.paths, match[0])
      }
      const absRe = /(?<![\w-])(?:~|\.{1,2})?\/[A-Za-z0-9._@%+~/-]{2,}/g
      while ((match = absRe.exec(withoutUrls)) !== null) {
        if (facts.paths.length >= 4) break
        const candidate = match[0].replace(/[).,;]+$/, '')
        if (candidate.length >= 3) uniquePush(facts.paths, candidate)
      }

      for (const rule of TECH_RULES) {
        if (rule[1].test(positiveSource)) uniquePush(facts.tech, rule[0])
      }

      const lower = positiveSource.toLowerCase()
      for (const word of STYLE_WORDS) {
        if (lower.indexOf(word.toLowerCase()) >= 0) uniquePush(facts.style, word)
      }

      const zhAudience = positiveSource.match(/(?:给|面向|读给|汇报给|发给)\s*([\u4e00-\u9fffA-Za-z/]{1,12}?)(?=[做写整看读用发讲汇报告知，。,.！!？?\s]|$)/)
      if (zhAudience) facts.audience = zhAudience[1]
      if (!facts.audience) {
        const enAudience = source.match(/\b(?:for|to)\s+(?:my\s+|the\s+)?(boss|team|client|customer|manager|leader|beginners?|experts?|public|investors?|kids)\b/i)
        if (enAudience) facts.audience = enAudience[1]
      }

      const zhNegative = source.match(/(?:不要|别|避免|禁止|无需|不必|不需要)\s*([^，。,.！!；;\n]{1,48})/)
      if (zhNegative) facts.negative = '不要' + zhNegative[1].trim()
      if (!facts.negative) {
        const enNegative = source.match(/\b(?:don'?t|avoid|except|without)\s+([^,.;\n]{2,48})/i)
        if (enNegative) facts.negative = 'avoid ' + enNegative[1].trim()
      }

      const lengthMatch = source.match(/(\d+|[一二两三四五六七八九十])\s*(页|张|字|词|行|分钟|小时|pages?|slides?|words?|lines?|minutes?)/i)
      if (lengthMatch) facts.length = lengthMatch[0].trim()

      const deadlineMatch = source.match(/(今天|明天|后天|本周|这周|下周|月底|尽快|越快越好|deadline|asap|by (?:today|tomorrow|friday|monday))/i)
      if (deadlineMatch) facts.deadline = deadlineMatch[0]

      facts.cwdHint = /(当前目录|这个目录|本目录|当前文件夹|这个文件夹|当前项目|这个项目|this folder|current director|this project)/i.test(source)
      facts.hasRef = facts.urls.length > 0 || /(参考|示例|样例|类似|模仿|refer|example|sample|like this)/i.test(source)

      return facts
    }

    /** Dimensions the sentence already answers; their question is skipped. */
    function buildAuto(facts) {
      const auto = {}
      if (facts.paths.length > 0) {
        auto.scope = { raw: facts.paths.slice(0, 3).join('、') }
      } else if (facts.cwdHint) {
        auto.scope = { pair: { zh: '当前目录', en: 'the current folder' } }
      }
      if (facts.tech.length > 0) auto.stack = { raw: facts.tech.join('、') }
      if (facts.length) auto.length = { raw: facts.length }
      if (facts.audience) auto.audience = { raw: facts.audience }
      if (facts.style.length > 0) auto.style = { raw: facts.style.join('、') }
      if (facts.negative) auto.avoid = { raw: facts.negative }
      if (facts.urls.length > 0) auto.reference = { raw: facts.urls.join(' ') }
      return auto
    }

    function analyzeTask(raw) {
      const text = String(raw || '').trim()
      const lang = detectLanguage(text)
      const intent = detectIntent(text)
      const domains = detectDomains(text)
      const facts = detectFacts(text)
      return {
        lang: lang,
        intent: intent,
        domains: domains,
        facts: facts,
        auto: buildAuto(facts),
      }
    }

    // ── question bank ─────────────────────────────────────────────────────
    function opt(value, zhLabel, enLabel, zhNote, enNote) {
      return {
        value: value,
        label: { zh: zhLabel, en: enLabel },
        note: zhNote || enNote ? { zh: zhNote || '', en: enNote || '' } : null,
      }
    }

    const QUESTIONS = {
      // ── build / implement ──
      build_deliverable: {
        id: 'build_deliverable', dim: 'deliverable', type: 'single', weight: 100,
        title: { zh: '你希望最终拿到什么？', en: 'What should the final result be?' },
        hint: { zh: '交付形态决定我做到哪一步——既不过度，也不欠。', en: 'The deliverable decides how far I go: no over-building, no under-building.' },
        options: [
          opt('ready', '可直接使用的成品', 'A ready-to-use result', '含运行方式与说明', 'with run instructions'),
          opt('prototype', '能跑通的原型', 'A working prototype', '先验证想法，细节后补', 'validate the idea first'),
          opt('plan', '方案 + 关键代码', 'A plan + key code', '我之后自己动手', 'I will build it myself'),
          opt('integrate', '在现有项目上改', 'Change an existing project', '新增或修改功能', 'add or modify functionality'),
        ],
      },
      build_scope: {
        id: 'build_scope', dim: 'scope', type: 'single', weight: 95,
        title: { zh: '在哪里做？范围多大？', en: 'Where should it live, and how wide is the scope?' },
        hint: { zh: '指定位置能让我直接开工，不用猜目录。', en: 'A concrete location lets me start without guessing paths.' },
        options: [
          opt('cwd', '当前工作目录新建', 'Create in the current workspace', null, null),
          opt('path', '指定目录或文件', 'A specific folder or file', '在下面填写', 'fill in below'),
          opt('integrate', '现有项目里集成', 'Integrate into an existing project', null, null),
          opt('decide', '你决定', 'Your call', null, null),
        ],
        allowText: true,
        textPlaceholder: { zh: '目录、文件或项目路径（可粘贴）', en: 'folder, file, or project path (paste is fine)' },
      },
      build_acceptance: {
        id: 'build_acceptance', dim: 'acceptance', type: 'multi', weight: 88,
        title: { zh: '怎样算完成？', en: 'What counts as done?' },
        hint: { zh: '验收标准越具体，我越不会做偏。', en: 'Concrete acceptance keeps me from drifting.' },
        options: [
          opt('runs', '能从零跑通', 'Runs from a clean start', null, null),
          opt('demo', '有示例或截图', 'Ships an example or screenshot', null, null),
          opt('tests', '有测试或自检', 'Has tests or self-checks', null, null),
          opt('manual', '我会手动验证', 'I will verify manually', null, null),
        ],
        allowText: true,
        textPlaceholder: { zh: '补充验收方式…', en: 'extra acceptance notes…' },
      },
      build_features: {
        id: 'build_features', dim: 'features', type: 'multi', weight: 80,
        title: { zh: '必须具备哪些能力？', en: 'Which capabilities are required?' },
        hint: { zh: '只选真正需要的，其余按最简实现。', en: 'Pick only what you need; the rest stays minimal.' },
        options: [
          opt('core', '核心功能可用', 'Core function works', null, null),
          opt('ui', '界面或交互', 'A UI or interaction', null, null),
          opt('persist', '数据保存', 'Data persistence', null, null),
          opt('api', '对外接口 / API', 'An external API', null, null),
          opt('docs', '使用说明', 'Usage docs', null, null),
        ],
        allowText: true,
        textPlaceholder: { zh: '还有哪些具体能力…', en: 'other specific capabilities…' },
      },
      build_stack: {
        id: 'build_stack', dim: 'stack', type: 'single', weight: 70,
        title: { zh: '技术栈或依赖有要求吗？', en: 'Any stack or dependency requirements?' },
        hint: { zh: '不说就按最省事、最不容易坏的内置方案做。', en: 'If unspecified I use the simplest built-in approach.' },
        options: [
          opt('auto', '不限，选最省事的', 'No preference — simplest', null, null),
          opt('stdlib', '零依赖，只用标准库', 'Zero dependencies, stdlib only', null, null),
          opt('follow', '跟随现有项目', 'Follow the existing project', null, null),
          opt('custom', '指定技术', 'A specific stack', '在下面填写', 'fill in below'),
        ],
        allowText: true,
        textPlaceholder: { zh: '例如：Python 3.11 / Node 22 / 不用 Docker', en: 'e.g. Python 3.11 / Node 22 / no Docker' },
      },
      build_constraints: {
        id: 'build_constraints', dim: 'constraints', type: 'text', weight: 62,
        title: { zh: '有什么硬性约束或不想要的东西？', en: 'Any hard constraints or things to avoid?' },
        hint: { zh: '例如：必须离线、不要改系统配置、别引入新依赖。', en: 'e.g. must work offline, do not touch system config, no new dependencies.' },
        textPlaceholder: { zh: '可留空', en: 'optional' },
      },
      build_reference: {
        id: 'build_reference', dim: 'reference', type: 'text', weight: 45,
        title: { zh: '有参考样例或链接吗？', en: 'Any reference samples or links?' },
        hint: { zh: '有样例时我会对齐样式和交互，少猜很多。', en: 'Samples let me match style and behavior instead of guessing.' },
        textPlaceholder: { zh: '粘贴链接、文件路径或一句话描述', en: 'paste a link, file path, or a short description' },
      },

      // ── fix ──
      fix_symptom: {
        id: 'fix_symptom', dim: 'symptom', type: 'single', weight: 100,
        title: { zh: '现在具体是什么现象？', en: 'What exactly goes wrong?' },
        hint: { zh: '现象 + 报错原文最有价值。', en: 'The symptom plus the exact error text is most useful.' },
        options: [
          opt('error', '有报错信息', 'There is an error message', null, null),
          opt('wrong', '行为不对', 'It behaves incorrectly', null, null),
          opt('slow', '很慢或卡住', 'Slow or hangs', null, null),
          opt('crash', '崩溃 / 闪退', 'Crashes', null, null),
        ],
        allowText: true,
        textPlaceholder: { zh: '报错原文或现象描述…', en: 'paste the error or describe the symptom…' },
      },
      fix_expected: {
        id: 'fix_expected', dim: 'expected', type: 'text', weight: 95,
        title: { zh: '期望的正确行为是什么？', en: 'What is the expected behavior?' },
        hint: { zh: '一句"应该……"就能把目标钉住。', en: 'One "it should…" sentence pins the target.' },
        textPlaceholder: { zh: '例如：点保存后应该写入文件，而不是报 500', en: 'e.g. saving should write the file instead of returning 500' },
      },
      fix_target: {
        id: 'fix_target', dim: 'scope', type: 'single', weight: 90,
        title: { zh: '涉及哪个文件或项目？', en: 'Which file or project is involved?' },
        hint: { zh: '知道位置能少翻一半文件。', en: 'Knowing the location halves the search.' },
        options: [
          opt('cwd', '当前目录 / 当前项目', 'The current folder / project', null, null),
          opt('path', '指定路径', 'A specific path', '在下面填写', 'fill in below'),
          opt('unknown', '不确定，先帮我定位', 'Not sure — help me locate it', null, null),
        ],
        allowText: true,
        textPlaceholder: { zh: '文件或目录路径（可粘贴）', en: 'file or folder path (paste is fine)' },
      },
      fix_acceptance: {
        id: 'fix_acceptance', dim: 'acceptance', type: 'single', weight: 82,
        title: { zh: '修好后怎么验证？', en: 'How should the fix be verified?' },
        hint: { zh: '决定我修完停在哪一步。', en: 'Decides where I stop after the fix.' },
        options: [
          opt('original', '原问题不再出现', 'The original problem is gone', null, null),
          opt('tests', '跑通原有测试', 'Existing tests pass', null, null),
          opt('manual', '我手动验证', 'I will verify manually', null, null),
        ],
        allowText: true,
        textPlaceholder: { zh: '补充验证要求…', en: 'extra verification notes…' },
      },
      fix_repro: {
        id: 'fix_repro', dim: 'repro', type: 'single', weight: 78,
        title: { zh: '能稳定复现吗？', en: 'Can it be reproduced reliably?' },
        hint: { zh: '有复现步骤时我会先复现再改。', en: 'With steps I reproduce first, then fix.' },
        options: [
          opt('yes', '有复现步骤', 'Yes, there are steps', '在下面补充', 'add them below'),
          opt('no', '没有，先帮我定位', 'No — locate it first', null, null),
        ],
        allowText: true,
        textPlaceholder: { zh: '复现步骤（可选）', en: 'repro steps (optional)' },
      },
      fix_scope: {
        id: 'fix_scope', dim: 'constraints', type: 'single', weight: 60,
        title: { zh: '允许的改动范围？', en: 'How much may change?' },
        hint: { zh: '越保守的改动越安全，但可能治标。', en: 'More conservative is safer but may only patch the symptom.' },
        options: [
          opt('minimal', '只改必要的最小代码', 'Only the minimal necessary code', null, null),
          opt('related', '可以动相关部分', 'Related parts may change', null, null),
          opt('free', '随意，只要修好', 'Whatever it takes', null, null),
        ],
      },
      fix_env: {
        id: 'fix_env', dim: 'env', type: 'text', weight: 50,
        title: { zh: '运行环境或版本约束？', en: 'Runtime or version constraints?' },
        hint: { zh: '例如 Python 3.11 / macOS / Node 22。', en: 'e.g. Python 3.11 / macOS / Node 22.' },
        textPlaceholder: { zh: '可留空', en: 'optional' },
      },

      // ── analyze ──
      analyze_format: {
        id: 'analyze_format', dim: 'format', type: 'single', weight: 100,
        title: { zh: '希望输出什么？', en: 'What should the analysis produce?' },
        hint: { zh: '先定输出形态，避免写成长篇大论。', en: 'Fixing the output shape avoids a wall of text.' },
        options: [
          opt('bullets', '结论 + 依据的要点', 'Key conclusions with evidence', null, null),
          opt('table', '对比表格', 'A comparison table', null, null),
          opt('report', '详细报告', 'A detailed report', null, null),
          opt('actions', '问题清单 + 改进建议', 'Issues + recommended actions', null, null),
        ],
      },
      analyze_scope: {
        id: 'analyze_scope', dim: 'scope', type: 'single', weight: 92,
        title: { zh: '分析范围？', en: 'What should be analyzed?' },
        hint: { zh: '范围越明确，结论越可用。', en: 'A clear scope makes the conclusions usable.' },
        options: [
          opt('cwd', '当前目录 / 项目全部', 'The whole current folder / project', null, null),
          opt('path', '指定文件或目录', 'Specific files or folders', '在下面填写', 'fill in below'),
          opt('source', '指定数据或来源', 'Specific data or sources', '在下面填写', 'fill in below'),
        ],
        allowText: true,
        textPlaceholder: { zh: '文件路径 / 数据 / 资料（可粘贴）', en: 'paths, data, or material (paste is fine)' },
      },
      analyze_depth: {
        id: 'analyze_depth', dim: 'depth', type: 'single', weight: 82,
        title: { zh: '分析多深？', en: 'How deep should it go?' },
        hint: { zh: '深度直接决定输出长度与 token 消耗。', en: 'Depth drives output length and token cost.' },
        options: [
          opt('quick', '速览：3–5 条关键结论', 'Quick: 3–5 key findings', null, null),
          opt('standard', '标准：逐项分析', 'Standard: item by item', null, null),
          opt('deep', '深入：含证据与边界情况', 'Deep: evidence and edge cases', null, null),
        ],
      },
      analyze_decision: {
        id: 'analyze_decision', dim: 'context', type: 'text', weight: 70,
        title: { zh: '这份分析要支持什么决定？', en: 'What decision should this support?' },
        hint: { zh: '知道目的，我会只保留有用的部分。', en: 'Knowing the purpose lets me keep only what matters.' },
        textPlaceholder: { zh: '例如：要不要上线 / 先修哪个 / 买哪一款', en: 'e.g. ship or not / which to fix first / which to buy' },
      },
      analyze_audience: {
        id: 'analyze_audience', dim: 'audience', type: 'single', weight: 55,
        title: { zh: '给谁看？', en: 'Who reads it?' },
        hint: { zh: '读者决定术语密度。', en: 'The reader decides how much jargon to use.' },
        options: [
          opt('self', '自己决策', 'Myself, for a decision', null, null),
          opt('team', '团队 / 同事', 'Team or colleagues', null, null),
          opt('client', '客户或非技术读者', 'Client or non-technical readers', null, null),
        ],
      },
      analyze_evidence: {
        id: 'analyze_evidence', dim: 'evidence', type: 'single', weight: 45,
        title: { zh: '需要标注证据或来源吗？', en: 'Should evidence or sources be cited?' },
        hint: { zh: '需要引用时我会逐条标注出处。', en: 'When required I cite each finding.' },
        options: [
          opt('yes', '要，逐条标出处', 'Yes, cite each item', null, null),
          opt('no', '不用，给结论即可', 'No, conclusions suffice', null, null),
        ],
      },

      // ── research ──
      research_questions: {
        id: 'research_questions', dim: 'goal', type: 'text', weight: 100,
        title: { zh: '具体想搞清楚哪些问题？', en: 'Which questions should this answer?' },
        hint: { zh: '1–3 个明确问题最好，例如：哪几款支持离线？', en: 'One to three concrete questions works best.' },
        textPlaceholder: { zh: '把问题写下来，一条一行也行', en: 'write the questions, one per line is fine' },
      },
      research_format: {
        id: 'research_format', dim: 'format', type: 'single', weight: 92,
        title: { zh: '输出形式？', en: 'Output format?' },
        hint: { zh: '调研结论适合先给要点，再展开。', en: 'Key findings first, then detail.' },
        options: [
          opt('bullets', '要点清单', 'A bullet list', null, null),
          opt('table', '对比表', 'A comparison table', null, null),
          opt('report', '调研报告', 'A research report', null, null),
          opt('recommend', '决策建议', 'A recommendation', null, null),
        ],
      },
      research_source: {
        id: 'research_source', dim: 'source', type: 'single', weight: 78,
        title: { zh: '来源要求？', en: 'Source requirements?' },
        hint: { zh: '限定来源能明显减少无关信息。', en: 'Restricting sources cuts noise.' },
        options: [
          opt('web', '联网搜公开资料', 'Search public sources online', null, null),
          opt('given', '只基于我提供的材料', 'Only my provided material', null, null),
          opt('official', '优先官方文档与一手来源', 'Official docs and primary sources first', null, null),
        ],
      },
      research_depth: {
        id: 'research_depth', dim: 'depth', type: 'single', weight: 68,
        title: { zh: '深度？', en: 'How deep?' },
        hint: { zh: '快速了解 vs 深入调研，token 差别很大。', en: 'A quick scan and deep research cost very different tokens.' },
        options: [
          opt('quick', '快速了解', 'A quick scan', null, null),
          opt('standard', '标准调研', 'Standard research', null, null),
          opt('deep', '深入调研', 'Deep research', null, null),
        ],
      },
      research_decision: {
        id: 'research_decision', dim: 'context', type: 'text', weight: 60,
        title: { zh: '用来支持什么决定？', en: 'What decision will it inform?' },
        hint: { zh: '有决策背景时结论会更聚焦。', en: 'A decision context keeps conclusions focused.' },
        textPlaceholder: { zh: '例如：要不要换工具 / 选哪一家', en: 'e.g. switch tools or not / which vendor' },
      },

      // ── explain ──
      explain_depth: {
        id: 'explain_depth', dim: 'depth', type: 'single', weight: 100,
        title: { zh: '想了解多深？', en: 'How deep should the explanation go?' },
        hint: { zh: '先定深度，能省掉一大段不需要的内容。', en: 'Fixing depth upfront removes a lot of unneeded text.' },
        options: [
          opt('one', '一句话结论', 'One-sentence answer', null, null),
          opt('brief', '简要解释 + 例子', 'A brief explanation with an example', null, null),
          opt('deep', '深入原理和细节', 'Deep dive into the mechanics', null, null),
        ],
      },
      explain_background: {
        id: 'explain_background', dim: 'context', type: 'single', weight: 82,
        title: { zh: '你的背景是？', en: 'What is your background?' },
        hint: { zh: '决定用不用类比、要不要解释术语。', en: 'Decides whether to use analogies and define terms.' },
        options: [
          opt('new', '完全新手', 'Complete beginner', null, null),
          opt('some', '有基础', 'Some basics', null, null),
          opt('expert', '熟悉，只讲关键差异', 'Familiar — key differences only', null, null),
        ],
      },
      explain_format: {
        id: 'explain_format', dim: 'format', type: 'single', weight: 72,
        title: { zh: '偏好什么形式？', en: 'Preferred form?' },
        hint: { zh: '形式选对，理解成本更低。', en: 'The right form lowers the cost of understanding.' },
        options: [
          opt('plain', '纯文字', 'Plain text', null, null),
          opt('analogy', '配类比', 'With an analogy', null, null),
          opt('code', '配代码示例', 'With a code example', null, null),
          opt('table', '对比表格', 'A comparison table', null, null),
        ],
      },
      explain_usage: {
        id: 'explain_usage', dim: 'goal', type: 'text', weight: 60,
        title: { zh: '之后要用它做什么？', en: 'What will you use it for?' },
        hint: { zh: '例如：写进方案 / 面试要讲 / 只是好奇。', en: 'e.g. put it in a proposal / explain in an interview / curiosity.' },
        textPlaceholder: { zh: '可留空', en: 'optional' },
      },

      // ── write ──
      write_form: {
        id: 'write_form', dim: 'deliverable', type: 'single', weight: 100,
        title: { zh: '成稿形式和篇幅？', en: 'Form and length?' },
        hint: { zh: '篇幅是最容易失控的变量，先钉住。', en: 'Length is the easiest thing to overshoot — pin it first.' },
        options: [
          opt('short', '短文案（≤200 字）', 'Short copy (≤200 words)', null, null),
          opt('medium', '中等文章（500–800 字）', 'Medium article (500–800 words)', null, null),
          opt('long', '长文（1500 字以上）', 'Long-form (1500+ words)', null, null),
          opt('custom', '自定义篇幅', 'Custom length', '在下面填写', 'fill in below'),
        ],
        allowText: true,
        textPlaceholder: { zh: '例如：正好 300 字 / 三小段', en: 'e.g. exactly 300 words / three paragraphs' },
      },
      write_audience: {
        id: 'write_audience', dim: 'audience', type: 'single', weight: 90,
        title: { zh: '写给谁看？', en: 'Who is it for?' },
        hint: { zh: '读者决定语气和取舍。', en: 'The reader decides tone and what to leave out.' },
        options: [
          opt('public', '公开读者', 'A public audience', null, null),
          opt('client', '客户或甲方', 'A client', null, null),
          opt('internal', '团队内部', 'Internal team', null, null),
          opt('leader', '汇报给上级', 'Reporting to a manager', null, null),
        ],
      },
      write_tone: {
        id: 'write_tone', dim: 'style', type: 'single', weight: 82,
        title: { zh: '语气风格？', en: 'Tone and style?' },
        hint: { zh: '风格不一致会显得不像你写的。', en: 'An inconsistent tone reads as not you.' },
        options: [
          opt('pro', '简洁专业', 'Concise and professional', null, null),
          opt('casual', '轻松口语', 'Casual and conversational', null, null),
          opt('formal', '正式商务', 'Formal and businesslike', null, null),
          opt('sample', '模仿我给的样子', 'Mimic the sample I provide', null, null),
        ],
      },
      write_material: {
        id: 'write_material', dim: 'reference', type: 'text', weight: 75,
        title: { zh: '有哪些素材或必须包含的点？', en: 'Any material or must-include points?' },
        hint: { zh: '贴原文、要点或文件路径都行。', en: 'Paste the source, key points, or a path.' },
        textPlaceholder: { zh: '素材、要点、文件路径…', en: 'source material, key points, or a file path…' },
      },
      write_avoid: {
        id: 'write_avoid', dim: 'avoid', type: 'text', weight: 55,
        title: { zh: '要避免什么？', en: 'Anything to avoid?' },
        hint: { zh: '例如：不要夸张、不要用术语、不要第一人称。', en: 'e.g. no hype, no jargon, no first person.' },
        textPlaceholder: { zh: '可留空', en: 'optional' },
      },
      write_acceptance: {
        id: 'write_acceptance', dim: 'acceptance', type: 'single', weight: 62,
        title: { zh: '怎么判断写得好？', en: 'What makes it good?' },
        hint: { zh: '能直接用，还是你会再改一轮。', en: 'Ready to send, or one more revision?' },
        options: [
          opt('ready', '能直接发出去', 'Ready to send', null, null),
          opt('revise', '我会再改一轮', 'I will revise once', null, null),
          opt('check', '要严格符合指定要求', 'Must match specified requirements', null, null),
        ],
      },

      // ── artifact (docx / pptx / xlsx / pdf) ──
      artifact_type: {
        id: 'artifact_type', dim: 'deliverable', type: 'single', weight: 100,
        title: { zh: '要做什么成品？', en: 'Which kind of artifact?' },
        hint: { zh: '先定格式，生成和校验方式都不同。', en: 'The format decides generation and validation.' },
        options: [
          opt('docx', 'Word 文档', 'Word document', null, null),
          opt('pptx', 'PPT 幻灯片', 'PowerPoint deck', null, null),
          opt('xlsx', 'Excel 表格', 'Excel workbook', null, null),
          opt('pdf', 'PDF', 'PDF', null, null),
          opt('md', 'Markdown', 'Markdown', null, null),
        ],
      },
      artifact_length: {
        id: 'artifact_length', dim: 'length', type: 'single', weight: 86,
        title: { zh: '篇幅或页数？', en: 'Length or page count?' },
        hint: { zh: '页数直接决定我投入的篇幅。', en: 'Page count sets how much I produce.' },
        options: [
          opt('tiny', '1 页以内', 'Within one page', null, null),
          opt('small', '3–5 页', '3–5 pages', null, null),
          opt('medium', '8–12 页', '8–12 pages', null, null),
          opt('custom', '自定义（填写）', 'Custom', '在下面填写', 'fill in below'),
        ],
        allowText: true,
        textPlaceholder: { zh: '例如：正好 6 页 / 20 行数据', en: 'e.g. exactly 6 pages / 20 data rows' },
        when: function whenArtifactLength(answers) {
          const answer = answers.artifact_type
          if (!answer || !answer.values) return true
          return answer.values.indexOf('xlsx') < 0
        },
      },
      artifact_audience: {
        id: 'artifact_audience', dim: 'audience', type: 'single', weight: 74,
        title: { zh: '给谁看？', en: 'Who is the audience?' },
        hint: { zh: '决定详略与专业度。', en: 'Decides detail level and formality.' },
        options: [
          opt('leader', '向上汇报', 'Reporting upward', null, null),
          opt('client', '客户', 'A client', null, null),
          opt('team', '团队内部', 'Internal team', null, null),
          opt('public', '公开分享', 'A public audience', null, null),
        ],
      },
      artifact_source: {
        id: 'artifact_source', dim: 'reference', type: 'text', weight: 68,
        title: { zh: '素材从哪里来？', en: 'Where does the material come from?' },
        hint: { zh: '给出文件路径或链接，或写"你帮我补全"。', en: 'Give a path or link, or say "fill it in yourself".' },
        textPlaceholder: { zh: '文件路径 / 链接 / 要点', en: 'paths, links, or key points' },
      },
      artifact_structure: {
        id: 'artifact_structure', dim: 'structure', type: 'single', weight: 55,
        title: { zh: '有指定结构或模板吗？', en: 'Any required structure or template?' },
        hint: { zh: '有模板时我按模板来，不自由发挥。', en: 'With a template I follow it instead of improvising.' },
        options: [
          opt('standard', '按常规结构', 'Use a standard structure', null, null),
          opt('template', '我有模板', 'I have a template', '在下面填写路径', 'give the path below'),
          opt('decide', '你决定', 'Your call', null, null),
        ],
        allowText: true,
        textPlaceholder: { zh: '模板路径或结构要求', en: 'template path or structure requirements' },
        when: function whenArtifactStructure(answers) {
          const answer = answers.artifact_type
          if (!answer || !answer.values) return true
          return answer.values.some(function isDoc(v) { return v === 'docx' || v === 'pptx' || v === 'pdf' })
        },
      },
      artifact_style: {
        id: 'artifact_style', dim: 'style', type: 'text', weight: 45,
        title: { zh: '风格与配色要求？', en: 'Style and color requirements?' },
        hint: { zh: '例如：深蓝商务 / 极简黑白。', en: 'e.g. deep blue corporate / minimal black and white.' },
        textPlaceholder: { zh: '可留空', en: 'optional' },
      },

      // ── plan ──
      plan_output: {
        id: 'plan_output', dim: 'deliverable', type: 'single', weight: 100,
        title: { zh: '要什么形式的方案？', en: 'What kind of plan?' },
        hint: { zh: '结论先行还是一步步执行，差别很大。', en: 'A one-pager and an execution plan are very different outputs.' },
        options: [
          opt('onepager', '一页纸结论', 'A one-page recommendation', null, null),
          opt('steps', '分步执行计划', 'A step-by-step execution plan', null, null),
          opt('architecture', '架构与技术选型', 'Architecture and technology choices', null, null),
          opt('risks', '风险与备选方案', 'Risks and fallback options', null, null),
        ],
      },
      plan_constraints: {
        id: 'plan_constraints', dim: 'constraints', type: 'text', weight: 88,
        title: { zh: '有哪些限制？', en: 'What constraints apply?' },
        hint: { zh: '时间、人力、预算、技术栈——写清楚我才不会给空的建议。', en: 'Time, people, budget, stack — otherwise the plan is generic.' },
        textPlaceholder: { zh: '例如：两周、两个人、不能停服', en: 'e.g. two weeks, two people, no downtime' },
      },
      plan_scope: {
        id: 'plan_scope', dim: 'scope', type: 'text', weight: 72,
        title: { zh: '方案覆盖的范围边界？', en: 'Scope boundaries?' },
        hint: { zh: '明确不做什么，同样重要。', en: 'Stating what is out of scope matters just as much.' },
        textPlaceholder: { zh: '例如：只覆盖桌面端，暂不含移动端', en: 'e.g. desktop only, mobile out of scope' },
      },
      plan_audience: {
        id: 'plan_audience', dim: 'audience', type: 'single', weight: 60,
        title: { zh: '给谁看？', en: 'Who reads the plan?' },
        hint: { zh: '给执行者看和给决策者看，写法不同。', en: 'Executors and decision-makers need different plans.' },
        options: [
          opt('self', '自己执行', 'Myself, to execute', null, null),
          opt('team', '团队执行', 'The team, to execute', null, null),
          opt('leader', '向上汇报', 'A manager, for approval', null, null),
          opt('client', '客户', 'A client', null, null),
        ],
      },
      plan_depth: {
        id: 'plan_depth', dim: 'depth', type: 'single', weight: 52,
        title: { zh: '深度？', en: 'How deep?' },
        hint: { zh: '概览适合先对齐，详细适合直接开工。', en: 'An overview aligns; detail enables execution.' },
        options: [
          opt('brief', '概览', 'Overview', null, null),
          opt('normal', '标准', 'Standard', null, null),
          opt('detailed', '详细', 'Detailed', null, null),
        ],
      },

      // ── operate ──
      op_target: {
        id: 'op_target', dim: 'scope', type: 'text', weight: 100,
        title: { zh: '要在什么环境或对象上操作？', en: 'Which environment or target?' },
        hint: { zh: '本机、远程服务器还是某个项目？', en: 'Local machine, remote server, or a project?' },
        textPlaceholder: { zh: '例如：当前目录 / 本机 Python 环境 / 远程服务器', en: 'e.g. current folder / local Python env / remote server' },
      },
      op_goal: {
        id: 'op_goal', dim: 'goal', type: 'single', weight: 92,
        title: { zh: '期望达到什么状态？', en: 'What end state do you want?' },
        hint: { zh: '装好、跑起来、还是改配置？', en: 'Installed, running, or reconfigured?' },
        options: [
          opt('install', '装好能用', 'Installed and usable', null, null),
          opt('run', '跑起来', 'Running', null, null),
          opt('config', '改好配置', 'Configured', null, null),
          opt('repair', '修好运行问题', 'Runtime problem fixed', null, null),
        ],
        allowText: true,
        textPlaceholder: { zh: '补充目标细节…', en: 'extra goal details…' },
      },
      op_risk: {
        id: 'op_risk', dim: 'risk', type: 'single', weight: 82,
        title: { zh: '可以直接改动环境吗？', en: 'May the environment be changed?' },
        hint: { zh: '决定我是否可以直接装依赖、改系统配置。', en: 'Decides whether I may install deps and edit system config.' },
        options: [
          opt('ok', '可以，必要时装依赖改配置', 'Yes — install deps and edit config if needed', null, null),
          opt('readonly', '只读排查，别改', 'Read-only investigation', null, null),
          opt('ask', '先告诉我改什么再动手', 'Tell me what you would change first', null, null),
        ],
      },
      op_acceptance: {
        id: 'op_acceptance', dim: 'acceptance', type: 'single', weight: 64,
        title: { zh: '怎么算成功？', en: 'What counts as success?' },
        hint: { zh: '一条可执行的验证命令最好。', en: 'One runnable verification command is ideal.' },
        options: [
          opt('command', '命令能跑通', 'A command runs successfully', null, null),
          opt('log', '拿到预期输出', 'The expected output appears', null, null),
          opt('verify', '我手动验证', 'I will verify manually', null, null),
        ],
      },

      // ── general fallback ──
      general_goal: {
        id: 'general_goal', dim: 'goal', type: 'text', weight: 100,
        title: { zh: '再具体一点：你希望最终拿到什么？', en: 'Be a bit more specific: what should you end up with?' },
        hint: { zh: '一句话说明最终产物或结果。', en: 'One sentence about the end result.' },
        textPlaceholder: { zh: '例如：一份能直接发的周报 / 一个能跑的脚本', en: 'e.g. a send-ready weekly report / a runnable script' },
      },
      general_output: {
        id: 'general_output', dim: 'format', type: 'single', weight: 82,
        title: { zh: '想要什么形式的结果？', en: 'What form should the result take?' },
        hint: { zh: '决定我是直接做，还是先给方案。', en: 'Decides whether I execute or plan first.' },
        options: [
          opt('result', '直接给结果', 'Just produce the result', null, null),
          opt('steps', '分步骤说明', 'Explain in steps', null, null),
          opt('plan', '先方案再执行', 'Plan first, then execute', null, null),
        ],
      },
      general_scope: {
        id: 'general_scope', dim: 'scope', type: 'text', weight: 72,
        title: { zh: '涉及哪些范围或位置？', en: 'What scope or location is involved?' },
        hint: { zh: '文件、目录、数据源，或"不限"。', en: 'Files, folders, data sources — or "no limits".' },
        textPlaceholder: { zh: '可留空', en: 'optional' },
      },
      general_acceptance: {
        id: 'general_acceptance', dim: 'acceptance', type: 'text', weight: 62,
        title: { zh: '怎么算完成？', en: 'How will we know it is done?' },
        hint: { zh: '一句可验证的标准即可。', en: 'One verifiable criterion is enough.' },
        textPlaceholder: { zh: '例如：能直接复制使用 / 测试通过', en: 'e.g. ready to paste and send / tests pass' },
      },

      // ── shared ──
      priority: {
        id: 'priority', dim: 'priority', type: 'single', weight: 40,
        title: { zh: '最看重哪一点？', en: 'What matters most?' },
        hint: { zh: '速度、质量还是最小改动——冲突时我按这个取舍。', en: 'Speed, quality, or minimal change — I will trade off accordingly.' },
        options: [
          opt('speed', '尽快出结果', 'Speed', null, null),
          opt('quality', '质量优先', 'Quality', null, null),
          opt('minimal', '改动越少越好', 'Minimal change', null, null),
        ],
      },
      confirm: {
        id: 'confirm', dim: 'confirm', type: 'confirm', weight: 999,
        title: { zh: '确认一下，我理解得对吗？', en: 'Let me check I understood you' },
      },
    }

    const INTENTS = {
      build: {
        label: { zh: '开发实现', en: 'build' },
        questions: ['build_deliverable', 'build_scope', 'build_acceptance', 'build_features', 'build_stack', 'build_constraints', 'build_reference'],
      },
      fix: {
        label: { zh: '修复问题', en: 'fix' },
        questions: ['fix_symptom', 'fix_expected', 'fix_target', 'fix_acceptance', 'fix_repro', 'fix_scope', 'fix_env'],
      },
      analyze: {
        label: { zh: '分析评估', en: 'analyze' },
        questions: ['analyze_format', 'analyze_scope', 'analyze_depth', 'analyze_decision', 'analyze_audience', 'analyze_evidence'],
      },
      research: {
        label: { zh: '调研', en: 'research' },
        questions: ['research_questions', 'research_format', 'research_source', 'research_depth', 'research_decision'],
      },
      explain: {
        label: { zh: '解释说明', en: 'explain' },
        questions: ['explain_depth', 'explain_background', 'explain_format', 'explain_usage'],
      },
      write: {
        label: { zh: '写作', en: 'write' },
        questions: ['write_form', 'write_audience', 'write_tone', 'write_material', 'write_avoid', 'write_acceptance'],
      },
      artifact: {
        label: { zh: '制作成品', en: 'produce an artifact' },
        questions: ['artifact_type', 'artifact_length', 'artifact_audience', 'artifact_source', 'artifact_structure', 'artifact_style'],
      },
      plan: {
        label: { zh: '做方案', en: 'plan' },
        questions: ['plan_output', 'plan_constraints', 'plan_scope', 'plan_audience', 'plan_depth'],
      },
      operate: {
        label: { zh: '环境操作', en: 'operate' },
        questions: ['op_target', 'op_goal', 'op_risk', 'op_acceptance'],
      },
      general: {
        label: { zh: '完成任务', en: 'complete the task' },
        questions: ['general_goal', 'general_output', 'general_scope', 'general_acceptance'],
      },
    }

    const MODE_CAP = { fast: 3, standard: 5, deep: 8 }
    const MODE_IDS = ['fast', 'standard', 'deep']

    // ── plan: which questions remain ──────────────────────────────────────
    function buildPlan(analysis, mode, answers, overrides) {
      const intent = INTENTS[analysis.intent] || INTENTS.general
      const cap = MODE_CAP[mode] || MODE_CAP.standard
      const auto = analysis.auto || {}
      const overrideSet = {}
      for (const dim of overrides || []) overrideSet[dim] = true

      const ordered = []
      const seen = {}
      const consider = function consider(qid) {
        if (seen[qid]) return
        const question = QUESTIONS[qid]
        if (!question) return
        seen[qid] = true
        const answered = Boolean(answers[question.id])
        if (!answered) {
          if (auto[question.dim] && overrideSet[question.dim] !== true) return
          if (typeof question.when === 'function' && !question.when(answers, analysis)) return
        }
        ordered.push(question)
      }
      for (const qid of intent.questions) consider(qid)
      consider('priority')

      const answeredQuestions = ordered.filter(function isAnswered(question) { return Boolean(answers[question.id]) })
      const pendingQuestions = ordered.filter(function isPending(question) { return !answers[question.id] })
      const explicit = pendingQuestions.filter(function isExplicit(question) { return overrideSet[question.dim] === true })
      const remaining = pendingQuestions.filter(function isRemaining(question) { return overrideSet[question.dim] !== true })

      const chosen = []
      // The mode cap is the total budget of substantive questions. Answered
      // questions are never hidden (a mode switch must not erase progress), and
      // an explicitly re-opened auto-detected dimension is always shown because
      // the user asked for it.
      for (const question of explicit) chosen.push(question)
      for (const question of remaining) {
        if (answeredQuestions.length + chosen.length >= cap) break
        chosen.push(question)
      }
      const questions = answeredQuestions.concat(chosen)
      questions.push(QUESTIONS.confirm)
      return {
        questions: questions,
        cap: cap,
        substantiveTotal: answeredQuestions.length + chosen.length,
        auto: auto,
      }
    }

    function nextQuestion(plan, answers) {
      for (const question of plan.questions) {
        if (question.type === 'confirm') {
          if (!answers[question.id]) return question
          continue
        }
        if (!answers[question.id]) return question
      }
      return null
    }

    function answeredQuestions(plan, answers) {
      return plan.questions.filter(function keep(question) {
        return question.type !== 'confirm' && Boolean(answers[question.id])
      })
    }

    function progressOf(plan, answers) {
      const done = answeredQuestions(plan, answers).length
      const total = Math.max(plan.substantiveTotal, done)
      return { done: done, total: total, ratio: total > 0 ? done / total : 0 }
    }

    // ── answers → dimensions ──────────────────────────────────────────────
    function answerParts(question, answer, lang) {
      if (!answer || answer.skipped) return []
      const parts = []
      const values = Array.isArray(answer.values) ? answer.values : []
      for (const value of values) {
        if (!question.options) continue
        const match = question.options.filter(function findOption(option) { return option.value === value })[0]
        if (!match) continue
        const label = pickPair(match.label, lang)
        if (label && parts.indexOf(label) < 0) parts.push(label)
      }
      const text = String(answer.text || '').trim()
      if (text && parts.indexOf(text) < 0) parts.push(text)
      return parts
    }

    function autoParts(entry, lang) {
      if (!entry) return []
      if (typeof entry.raw === 'string' && entry.raw !== '') return [entry.raw]
      if (entry.pair) return [pickPair(entry.pair, lang)]
      return []
    }

    function resolveDims(plan, answers, analysis, lang) {
      const dims = {}
      const answeredDims = {}
      const add = function add(dim, parts) {
        if (!dim || parts.length === 0) return
        if (!dims[dim]) dims[dim] = { parts: [] }
        for (const part of parts) {
          if (part && dims[dim].parts.indexOf(part) < 0) dims[dim].parts.push(part)
        }
      }
      for (const question of plan.questions) {
        const answer = answers[question.id]
        if (!answer) continue
        const parts = answerParts(question, answer, lang)
        if (parts.length === 0) continue
        answeredDims[question.dim] = true
        add(question.dim, parts)
      }
      for (const dim of Object.keys(analysis.auto || {})) {
        if (answeredDims[dim]) continue
        add(dim, autoParts(analysis.auto[dim], lang))
      }
      return dims
    }

    // ── brief composition ─────────────────────────────────────────────────
    const BRIEF_LABELS = {
      zh: {
        deliverable: '交付', features: '能力', length: '篇幅', format: '形式', scope: '范围', env: '环境',
        stack: '技术栈', constraints: '约束', avoid: '避免', style: '风格', risk: '改动权限',
        acceptance: '验收', expected: '期望', symptom: '现象', repro: '复现', goal: '目标',
        context: '背景', audience: '读者', reference: '参考', evidence: '证据', priority: '优先级',
        source: '来源', structure: '结构', interface: '界面',
      },
      en: {
        deliverable: 'Deliverable', features: 'Capabilities', length: 'Length', format: 'Format', scope: 'Scope', env: 'Environment',
        stack: 'Stack', constraints: 'Constraints', avoid: 'Avoid', style: 'Style', risk: 'Change rights',
        acceptance: 'Acceptance', expected: 'Expected', symptom: 'Symptom', repro: 'Repro', goal: 'Goal',
        context: 'Context', audience: 'Audience', reference: 'References', evidence: 'Evidence', priority: 'Priority',
        source: 'Sources', structure: 'Structure', interface: 'Interface',
      },
    }

    const SECTION_TITLES = {
      zh: { task: '任务', deliverable: '交付物', scope: '范围与位置', constraints: '约束', acceptance: '验收标准', context: '背景与参考', rules: '执行约定' },
      en: { task: 'Task', deliverable: 'Deliverable', scope: 'Scope & location', constraints: 'Constraints', acceptance: 'Acceptance', context: 'Context & references', rules: 'Working rules' },
    }

    const SECTION_DIMS = [
      { key: 'deliverable', dims: ['deliverable', 'interface', 'features', 'length', 'format'] },
      { key: 'scope', dims: ['scope', 'env'] },
      { key: 'constraints', dims: ['stack', 'constraints', 'avoid', 'style', 'risk', 'source'] },
      { key: 'acceptance', dims: ['acceptance', 'expected'] },
      { key: 'context', dims: ['symptom', 'repro', 'goal', 'context', 'audience', 'reference', 'evidence', 'structure', 'priority'] },
    ]

    function buildRules(analysis, assume, lang) {
      const zh = lang !== 'en'
      const rules = []
      if (assume === 'ask') {
        rules.push(zh
          ? '遇到关键的不确定点可以停下来问我；其余按最合理的默认处理。'
          : 'Ask me at genuinely uncertain points; decide everything else with sensible defaults.')
      } else if (assume === 'assumptions') {
        rules.push(zh
          ? '信息不足时先列出假设再执行，不要反问。'
          : 'State your assumptions first, then proceed — do not ask back.')
      } else {
        rules.push(zh
          ? '信息不足时按最合理的默认直接执行，不要反问。'
          : 'Proceed with the most reasonable defaults — do not ask back.')
      }
      const codeLike = analysis.intent === 'build' || analysis.intent === 'fix' || analysis.intent === 'operate' || analysis.intent === 'plan'
      if (codeLike && analysis.domains.indexOf('code') >= 0) {
        rules.push(zh ? '只改与本任务相关的文件，不做无关重构。' : 'Touch only the files this task needs; no unrelated refactoring.')
      }
      if (analysis.intent === 'research' || analysis.intent === 'analyze' || analysis.domains.indexOf('research') >= 0) {
        rules.push(zh ? '没有依据的内容直接说明，不要编造来源。' : 'Say so when evidence is missing; never invent sources.')
      }
      if (analysis.intent === 'artifact') {
        rules.push(zh ? '成品写入工作目录，并在回复中给出文件名。' : 'Write the deliverable into the working directory and name the file in your reply.')
      }
      rules.push(zh
        ? '回复先给结果，再给必要说明；不要复述本任务书。'
        : 'Lead with the result, then only the necessary explanation; do not restate this brief.')
      return rules
    }

    function compactRule(assume, lang) {
      const zh = lang !== 'en'
      if (assume === 'ask') {
        return zh ? '不确定点可来问我，其余按默认；先给结果，别复述本任务书。' : 'Ask at real uncertainty, default the rest; lead with the result, do not restate this brief.'
      }
      if (assume === 'assumptions') {
        return zh ? '缺信息先列假设再执行，勿反问；先给结果，别复述本任务书。' : 'List assumptions then proceed, never ask back; lead with the result, do not restate this brief.'
      }
      return zh ? '缺信息按默认假设执行，勿反问；先给结果，别复述本任务书。' : 'Assume sensible defaults, never ask back; lead with the result, do not restate this brief.'
    }

    function briefSeparators(lang) {
      return lang === 'en'
        ? { key: ': ', list: '; ', clause: ', ' }
        : { key: '：', list: '；', clause: '、' }
    }

    function dimLine(dim, dims, label, lang) {
      const entry = dims[dim]
      if (!entry || entry.parts.length === 0) return null
      const separators = briefSeparators(lang)
      return '- ' + label + separators.key + entry.parts.join(separators.list)
    }

    function composeCompact(input) {
      const lang = input.lang === 'en' ? 'en' : 'zh'
      const dims = input.dims || {}
      const separators = briefSeparators(lang)
      const lines = []
      const labelsShort = lang === 'en'
        ? { task: 'Task', deliverable: 'Deliverable', scope: 'Scope', constraints: 'Constraints', acceptance: 'Acceptance', context: 'Context', rules: 'Rules', note: 'Note' }
        : { task: '任务', deliverable: '交付', scope: '范围', constraints: '约束', acceptance: '验收', context: '背景', rules: '约定', note: '补充' }

      lines.push(labelsShort.task + separators.key + briefTaskText(input.raw))

      const collect = function collect(keys, innerSeparator) {
        const parts = []
        for (const key of keys) {
          const entry = dims[key]
          if (entry && entry.parts.length > 0) parts.push(entry.parts.join(innerSeparator))
        }
        return parts
      }

      const buildParts = []
      const deliverParts = collect(['deliverable', 'features', 'length', 'format'], separators.clause)
      if (deliverParts.length > 0) buildParts.push(labelsShort.deliverable + separators.key + deliverParts.join(separators.list))
      const scopeParts = collect(['scope'], separators.list)
      if (scopeParts.length > 0) buildParts.push(labelsShort.scope + separators.key + scopeParts.join(separators.list))
      const constraintParts = collect(['stack', 'constraints', 'avoid', 'style', 'risk', 'source'], separators.list)
      if (constraintParts.length > 0) buildParts.push(labelsShort.constraints + separators.key + constraintParts.join(separators.list))
      const acceptanceParts = collect(['acceptance', 'expected'], separators.list)
      if (acceptanceParts.length > 0) buildParts.push(labelsShort.acceptance + separators.key + acceptanceParts.join(separators.list))
      const contextParts = collect(['symptom', 'goal', 'context', 'audience', 'reference', 'evidence', 'structure', 'priority', 'env', 'repro'], separators.list)
      if (contextParts.length > 0) buildParts.push(labelsShort.context + separators.key + contextParts.join(separators.list))

      for (const part of buildParts) lines.push(part)
      if (input.notes && input.notes.length > 0) {
        lines.push(labelsShort.context + labelsShort.note + separators.key + input.notes.join(separators.list))
      }
      lines.push(labelsShort.rules + separators.key + compactRule(input.assume, lang))
      return lines.join('\n')
    }

    function composeStandard(input) {
      const lang = input.lang === 'en' ? 'en' : 'zh'
      const labels = BRIEF_LABELS[lang]
      const titles = SECTION_TITLES[lang]
      const dims = input.dims || {}
      const lines = []
      lines.push('# ' + titles.task)
      lines.push('')
      lines.push(briefTaskText(input.raw))
      lines.push('')
      for (const section of SECTION_DIMS) {
        const bullets = []
        for (const dim of section.dims) {
          const line = dimLine(dim, dims, labels[dim] || dim, lang)
          if (line) bullets.push(line)
        }
        if (bullets.length === 0) continue
        lines.push('## ' + titles[section.key])
        for (const bullet of bullets) lines.push(bullet)
        lines.push('')
      }
      if (input.notes && input.notes.length > 0) {
        lines.push('## ' + titles.context)
        for (const note of input.notes) lines.push('- ' + (lang === 'en' ? 'Extra note: ' : '补充：') + note)
        lines.push('')
      }
      lines.push('## ' + titles.rules)
      for (const rule of buildRules(input.analysis, input.assume, lang)) lines.push('- ' + rule)
      return lines.join('\n').trim() + '\n'
    }

    function composeBrief(input) {
      return input.style === 'compact' ? composeCompact(input) : composeStandard(input)
    }

    // ── measurement ───────────────────────────────────────────────────────
    function estimateTokens(text) {
      const raw = String(text || '')
      let cjk = 0
      let other = 0
      for (let i = 0; i < raw.length; i += 1) {
        if (raw.charCodeAt(i) >= 0x2e80) cjk += 1
        else other += 1
      }
      return Math.max(1, Math.round(cjk * 0.9 + other / 3.8))
    }

    const SCORE_WEIGHTS = { deliverable: 22, scope: 16, acceptance: 16, constraints: 12, stack: 8, features: 8, reference: 6, audience: 4, format: 4, context: 4 }

    function completeness(dims) {
      let got = 0
      let total = 0
      for (const key of Object.keys(SCORE_WEIGHTS)) {
        total += SCORE_WEIGHTS[key]
        if (dims[key] && dims[key].parts.length > 0) got += SCORE_WEIGHTS[key]
      }
      return Math.round((got / total) * 100)
    }

    function briefStats(brief, raw, dims) {
      const dimCount = Object.keys(dims).length
      return {
        chars: String(brief).length,
        tokens: estimateTokens(brief),
        rawTokens: estimateTokens(raw),
        score: completeness(dims),
        rounds: Math.max(1, Math.min(5, Math.round(dimCount * 0.6))),
        dimCount: dimCount,
      }
    }

    function confirmSummary(analysis, dims, lang) {
      const zh = lang !== 'en'
      const separators = briefSeparators(zh ? 'zh' : 'en')
      const intent = (INTENTS[analysis.intent] || INTENTS.general).label
      const parts = []
      const addDim = function addDim(key, label) {
        const entry = dims[key]
        if (!entry || entry.parts.length === 0) return
        parts.push(label + separators.key + entry.parts.join(separators.clause))
      }
      addDim('deliverable', zh ? '交付' : 'deliverable')
      addDim('features', zh ? '能力' : 'capabilities')
      addDim('scope', zh ? '范围' : 'scope')
      addDim('stack', zh ? '技术栈' : 'stack')
      addDim('constraints', zh ? '约束' : 'constraints')
      addDim('avoid', zh ? '避免' : 'avoid')
      addDim('acceptance', zh ? '验收' : 'acceptance')
      addDim('expected', zh ? '期望' : 'expected')
      addDim('format', zh ? '输出' : 'output')
      addDim('depth', zh ? '深度' : 'depth')
      addDim('audience', zh ? '读者' : 'audience')
      addDim('reference', zh ? '参考' : 'references')
      addDim('length', zh ? '篇幅' : 'length')
      addDim('risk', zh ? '改动权限' : 'change rights')
      addDim('goal', zh ? '目标' : 'goal')
      addDim('symptom', zh ? '现象' : 'symptom')
      const head = zh ? '我理解你要：' + pickPair(intent, 'zh') : 'I understand you want to ' + pickPair(intent, 'en')
      const end = zh ? '。' : '.'
      if (parts.length === 0) return head + end
      return head + end + '\n' + parts.join(separators.list) + end
    }
    // ══════════════════════════════════════════════════════════════════════
    // Local storage — the clarifier's only persistence: no Host, no upload.
    // ══════════════════════════════════════════════════════════════════════
    function readJson(key, fallback) {
      try {
        if (typeof localStorage === 'undefined' || !localStorage) return fallback
        const raw = localStorage.getItem(key)
        if (raw === null || raw === '') return fallback
        const value = JSON.parse(raw)
        return value === null || value === undefined ? fallback : value
      } catch (error) {
        return fallback
      }
    }

    function writeJson(key, value) {
      try {
        if (typeof localStorage === 'undefined' || !localStorage) return
        localStorage.setItem(key, JSON.stringify(value))
      } catch (error) {
        // A full or disabled localStorage must never break the page.
      }
    }

    function newId() {
      return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
    }

    const EMPTY_SESSION = {
      id: '',
      stage: 'input',
      raw: '',
      mode: 'standard',
      style: 'standard',
      assume: 'assume',
      answers: {},
      overrides: [],
      notes: [],
      saved: false,
      updatedAt: 0,
    }

    function loadSettings() {
      const stored = readJson(STORE_SETTINGS, null)
      const settings = { mode: 'standard', style: 'standard', assume: 'assume' }
      if (stored && typeof stored === 'object') {
        if (MODE_IDS.indexOf(stored.mode) >= 0) settings.mode = stored.mode
        if (stored.style === 'compact' || stored.style === 'standard') settings.style = stored.style
        if (stored.assume === 'assume' || stored.assume === 'assumptions' || stored.assume === 'ask') settings.assume = stored.assume
      }
      return settings
    }

    function saveSettings(settings) {
      writeJson(STORE_SETTINGS, { mode: settings.mode, style: settings.style, assume: settings.assume })
    }

    function loadSession() {
      const stored = readJson(STORE_SESSION, null)
      if (!stored || typeof stored !== 'object') return Object.assign({}, EMPTY_SESSION, loadSettings())
      const session = Object.assign({}, EMPTY_SESSION, loadSettings())
      if (typeof stored.raw === 'string') session.raw = stored.raw
      if (stored.stage === 'flow' || stored.stage === 'ready' || stored.stage === 'input') session.stage = stored.stage
      if (MODE_IDS.indexOf(stored.mode) >= 0) session.mode = stored.mode
      if (stored.style === 'compact' || stored.style === 'standard') session.style = stored.style
      if (stored.assume === 'assume' || stored.assume === 'assumptions' || stored.assume === 'ask') session.assume = stored.assume
      if (stored.answers && typeof stored.answers === 'object' && !Array.isArray(stored.answers)) session.answers = stored.answers
      if (Array.isArray(stored.overrides)) session.overrides = stored.overrides.filter(function isString(value) { return typeof value === 'string' })
      if (Array.isArray(stored.notes)) session.notes = stored.notes.filter(function isString(value) { return typeof value === 'string' })
      if (typeof stored.id === 'string') session.id = stored.id
      if (typeof stored.updatedAt === 'number') session.updatedAt = stored.updatedAt
      if (session.stage !== 'input' && session.raw.trim() === '') session.stage = 'input'
      return session
    }

    function loadHistory() {
      const stored = readJson(STORE_HISTORY, null)
      if (!Array.isArray(stored)) return []
      return stored.filter(function isEntry(entry) {
        return entry && typeof entry === 'object' && typeof entry.raw === 'string' && typeof entry.standard === 'string'
      }).map(function normalize(entry) {
        const copy = Object.assign({}, entry)
        if (typeof copy.id !== 'string' || copy.id === '') copy.id = newId()
        return copy
      }).slice(0, HISTORY_MAX)
    }

    function HistoryList(props) {
      const { history, onOpen, onReuse, onDelete, onClear, notify } = props
      if (history.length === 0) {
        return h('p', { className: 'dtc-muted dtc-history-empty' }, t('history.empty'))
      }
      return h('div', { className: 'dtc-history' },
        h('div', { className: 'dtc-history-head' },
          h('span', { className: 'dtc-label' }, t('history.title')),
          h('div', { className: 'dtc-spacer' }),
          h('button', {
            type: 'button',
            className: 'dtc-link',
            onClick: function clearAll() {
              if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(t('history.clearConfirm'))) return
              onClear()
              notify(t('toast.cleared'))
            },
          }, t('history.clear')),
        ),
        h('div', { className: 'dtc-history-rows' }, history.map(function renderRow(entry) {
          return h('div', { key: entry.id, className: 'dtc-history-row' },
            h('button', {
              type: 'button',
              className: 'dtc-history-main',
              title: entry.raw,
              onClick: function openEntry() { onOpen(entry) },
            },
              h('span', { className: 'dtc-history-text' }, entry.raw),
              h('span', { className: 'dtc-history-meta' },
                h('span', null, relativeTime(entry.createdAt)),
                h('span', { className: 'dtc-dot' }, '·'),
                h('span', null, t('preview.tokens', { n: estimateTokens(entry.standard) }))
              ),
            ),
            h('button', {
              type: 'button',
              className: 'dtc-history-act',
              title: t('history.reuse'),
              onClick: function reuseEntry() { onReuse(entry) },
            }, h(Glyph, { name: 'refresh', size: 12 })),
            h('button', {
              type: 'button',
              className: 'dtc-history-act',
              title: t('history.delete'),
              onClick: function deleteEntry() { onDelete(entry); notify(t('toast.deleted')) },
            }, h(Glyph, { name: 'trash', size: 12 })),
          )
        })),
      )
    }

    function relativeTime(timestamp) {
      const value = typeof timestamp === 'number' ? timestamp : 0
      const delta = Math.max(0, Date.now() - value)
      const minute = 60 * 1000
      const hour = 60 * minute
      const day = 24 * hour
      if (delta < minute) return t('history.time.justNow')
      if (delta < hour) return t('history.time.minutes', { n: Math.floor(delta / minute) })
      if (delta < day) return t('history.time.hours', { n: Math.floor(delta / hour) })
      return t('history.time.days', { n: Math.floor(delta / day) })
    }

    // ══════════════════════════════════════════════════════════════════════
    // Glyphs — drawn inline so the panel needs no icon font or asset loader.
    // ══════════════════════════════════════════════════════════════════════
    const GLYPHS = {
      funnel: [['path', 'M3 4.5h18l-7.2 8v6.2l-3.6 2.3v-8.5L3 4.5z']],
      sparkle: [['path', 'M12 3.5l1.7 4.6 4.6 1.7-4.6 1.7L12 16.1l-1.7-4.6L5.7 9.8l4.6-1.7L12 3.5z']],
      check: [['path', 'M4.8 12.6l4.4 4.4L19.2 6.8']],
      copy: [['path', 'M9 9h10v10H9z'], ['path', 'M15 9V5H5v10h4']],
      send: [['path', 'M4 12.5L20 5l-6 15-3.2-6.2L4 12.5z']],
      edit: [['path', 'M4.5 19.5l4.2-1.1L19 8.1l-3.1-3.1L5.6 15.3l-1.1 4.2z']],
      plus: [['path', 'M12 5v14'], ['path', 'M5 12h14']],
      x: [['path', 'M6 6l12 12'], ['path', 'M18 6L6 18']],
      trash: [['path', 'M4.5 6.5h15'], ['path', 'M9 6.5V4.5h6v2'], ['path', 'M6.5 6.5l1 13h9l1-13']],
      refresh: [['path', 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3'], ['path', 'M19.8 4.2v4.5h-4.5']],
      'chevron-right': [['path', 'M9.5 5.5L16 12l-6.5 6.5']],
      'chevron-left': [['path', 'M14.5 5.5L8 12l6.5 6.5']],
      wand: [['path', 'M4 20l9-9'], ['path', 'M14.5 3.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z']],
      target: [['circle', 12, 12, 8], ['circle', 12, 12, 2.4]],
      alert: [['path', 'M12 4l9 16H3l9-16z'], ['path', 'M12 10v4'], ['path', 'M12 17h.01']],
      clock: [['circle', 12, 12, 8], ['path', 'M12 7.5V12l3 2']],
      layers: [['path', 'M12 3.5l8.5 4.5L12 12.5 3.5 8 12 3.5z'], ['path', 'M4.5 12.5L12 16.5l7.5-4'], ['path', 'M4.5 16.5L12 20.5l7.5-4']],
    }

    function Glyph(props) {
      const size = props.size || 14
      const definition = GLYPHS[props.name] || GLYPHS.sparkle
      const children = definition.map(function renderShape(shape, index) {
        if (shape[0] === 'circle') {
          return h('circle', { key: index, cx: shape[1], cy: shape[2], r: shape[3], fill: 'none' })
        }
        return h('path', { key: index, d: shape[1], fill: 'none' })
      })
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: props.strokeWidth || 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
        className: props.className || undefined,
      }, children)
    }

    /** The left-sidebar row glyph: the shell owns the button, we draw the mark. */
    function SidebarIcon(ownerProps) {
      const props = ownerProps || {}
      const size = typeof props.size === 'number' && isFinite(props.size) && props.size > 0 ? props.size : 16
      const active = props.active === true
      return h('svg', {
        viewBox: '0 0 16 16',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: active ? 1.6 : 1.35,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      }, [
        h('path', { key: 'funnel', d: 'M2.4 3.4h11.2L9.1 8v3.4l-2.2 1.3V8L2.4 3.4z' }),
        h('path', { key: 'check', d: 'M10.9 11.1l1.3 1.3 2.2-2.5' }),
      ])
    }

    // ══════════════════════════════════════════════════════════════════════
    // Form atoms
    // ══════════════════════════════════════════════════════════════════════
    function Btn(props) {
      const variant = props.variant || 'default'
      const className = 'dtc-btn' + (variant === 'primary' ? ' dtc-btn-primary' : variant === 'ghost' ? ' dtc-btn-ghost' : '')
      return h('button', {
        type: 'button',
        className: className,
        onClick: props.disabled ? undefined : props.onClick,
        disabled: props.disabled === true,
        title: props.title || undefined,
        'aria-label': props.ariaLabel || undefined,
      },
        props.icon ? h(Glyph, { name: props.icon, size: props.iconSize || 13 }) : null,
        props.children !== null && props.children !== undefined ? h('span', { className: 'dtc-btn-label' }, props.children) : null,
      )
    }

    function Segmented(props) {
      return h('div', { className: 'dtc-seg', role: 'group', 'aria-label': props.label || '' },
        props.options.map(function renderOption(option) {
          const on = option.value === props.value
          return h('button', {
            key: option.value,
            type: 'button',
            className: 'dtc-seg-btn',
            'data-on': on ? '1' : '0',
            'aria-pressed': on,
            title: option.hint || '',
            onClick: function selectOption() { props.onChange(option.value) },
          }, option.label)
        }),
      )
    }

    function BrandMark(props) {
      return h('span', { className: 'dtc-brand', 'aria-hidden': 'true' },
        h(Glyph, { name: 'funnel', size: props.size || 15, strokeWidth: 2 }),
      )
    }

    // ══════════════════════════════════════════════════════════════════════
    // Landing
    // ══════════════════════════════════════════════════════════════════════
    function Landing(props) {
      const session = props.session
      const textareaRef = useRef(null)
      useEffect(function focusTextarea() {
        if (textareaRef.current && typeof textareaRef.current.focus === 'function') {
          try { textareaRef.current.focus() } catch (error) { /* ignore */ }
        }
      }, [])
      const examples = [t('ex.1'), t('ex.2'), t('ex.3'), t('ex.4'), t('ex.5')]
      return h('div', { className: 'dtc-landing' },
        h('div', { className: 'dtc-landing-head' },
          h('span', { className: 'dtc-eyebrow' },
            h(Glyph, { name: 'sparkle', size: 12 }),
            t('landing.eyebrow'),
          ),
          h('h1', { className: 'dtc-landing-title' }, t('landing.title')),
          h('p', { className: 'dtc-landing-hint' }, t('landing.hint')),
        ),
        h('div', { className: 'dtc-input-card' },
          h('textarea', {
            ref: textareaRef,
            className: 'dtc-input dtc-input-lg',
            rows: 3,
            value: session.raw,
            placeholder: t('landing.placeholder'),
            'aria-label': t('landing.title'),
            onChange: function change(event) { props.setRaw(event.target.value) },
            onKeyDown: function keydown(event) {
              if (event.key !== 'Enter') return
              if (event.nativeEvent && event.nativeEvent.isComposing) return
              if (event.shiftKey) return
              event.preventDefault()
              props.onStart()
            },
          }),
          h('div', { className: 'dtc-input-foot' },
            h('span', { className: 'dtc-kbd dtc-hint' }, t('landing.startHint')),
            h('div', { className: 'dtc-row' },
              h(Btn, {
                variant: 'ghost',
                icon: 'wand',
                onClick: props.onDirect,
                disabled: !hasMeaningfulContent(session.raw),
                title: t('landing.direct'),
              }, t('landing.direct')),
              h(Btn, {
                variant: 'primary',
                icon: 'chevron-right',
                iconSize: 14,
                onClick: props.onStart,
                disabled: !hasMeaningfulContent(session.raw),
              }, t('landing.start')),
            ),
          ),
        ),
        h('div', { className: 'dtc-examples' },
          h('span', { className: 'dtc-label' }, t('landing.examples')),
          examples.map(function renderExample(text) {
            return h('button', {
              key: text,
              type: 'button',
              className: 'dtc-example',
              onClick: function useExample() { props.onExample(text) },
            }, text)
          }),
        ),
        h(HistoryList, {
          history: props.history,
          onOpen: props.onOpenHistory,
          onReuse: props.onReuseHistory,
          onDelete: props.onDeleteHistory,
          onClear: props.onClearHistory,
          notify: props.notify,
        }),
        h('p', { className: 'dtc-footnote' }, t('footer.privacy')),
      )
    }

    // ══════════════════════════════════════════════════════════════════════
    // Question flow
    // ══════════════════════════════════════════════════════════════════════
    function AutoBar(props) {
      const analysis = props.analysis
      const lang = props.lang
      const dims = Object.keys(analysis.auto || {})
      if (dims.length === 0) return null
      const editableDims = props.editableDims || []
      return h('div', { className: 'dtc-auto' },
        h('span', { className: 'dtc-auto-title' }, h(Glyph, { name: 'wand', size: 11 }), t('flow.autoTitle')),
        dims.map(function renderChip(dim) {
          const parts = autoParts(analysis.auto[dim], lang)
          const overridden = props.overrides.indexOf(dim) >= 0
          // Only dimensions the current intent actually asks about can be
          // re-opened; the rest are pure information already flowing into the
          // brief, so they render as static chips instead of dead buttons.
          if (editableDims.indexOf(dim) < 0) {
            return h('span', {
              key: dim,
              className: 'dtc-auto-chip dtc-auto-chip-static',
              title: t('flow.autoStatic'),
            },
              h('span', { className: 'dtc-auto-dim' }, t('dim.' + dim)),
              h('span', { className: 'dtc-auto-val' }, parts.join('、')),
            )
          }
          return h('button', {
            key: dim,
            type: 'button',
            className: 'dtc-auto-chip',
            'data-on': overridden ? '1' : '0',
            title: t('flow.autoEdit'),
            onClick: function editDetected() { props.onOverride(dim) },
          },
            h('span', { className: 'dtc-auto-dim' }, t('dim.' + dim)),
            h('span', { className: 'dtc-auto-val' }, parts.join('、')),
            h(Glyph, { name: 'edit', size: 10 }),
          )
        }),
      )
    }

    function AnswerCard(props) {
      const question = props.question
      const answer = props.answer
      const lang = props.lang
      const parts = answerParts(question, answer, lang)
      const skipped = parts.length === 0
      return h('div', { className: 'dtc-answer' },
        h('div', { className: 'dtc-answer-head' },
          h('span', { className: 'dtc-answer-check' }, h(Glyph, { name: 'check', size: 11 })),
          h('span', { className: 'dtc-answer-q' }, pickPair(question.title, lang)),
          h('button', {
            type: 'button',
            className: 'dtc-link',
            onClick: function editAnswer() { props.onEdit(question.id) },
          }, t('flow.edit')),
        ),
        h('div', { className: 'dtc-answer-a' + (skipped ? ' dtc-answer-skipped' : '') },
          skipped ? t('flow.skip') : parts.join('；')),
      )
    }

    function QuestionCard(props) {
      const question = props.question
      const lang = props.lang
      const multi = question.type === 'multi'
      const [values, setValues] = useState([])
      const [text, setText] = useState('')
      const textRef = useRef(null)
      const hasOptions = Array.isArray(question.options) && question.options.length > 0
      const allowText = hasOptions ? question.allowText === true : true
      const textPlaceholder = pickPair(question.textPlaceholder, lang) || t('flow.textPlaceholder')

      const toggle = useCallback(function toggleValue(value) {
        if (multi) {
          setValues(function toggleMulti(previous) {
            if (previous.indexOf(value) >= 0) return previous.filter(function notValue(item) { return item !== value })
            return previous.concat([value])
          })
        } else {
          setValues(function toggleSingle(previous) {
            return previous[0] === value ? [] : [value]
          })
        }
      }, [multi])

      useEffect(function numberKeys() {
        function onKeyDown(event) {
          if (event.metaKey || event.ctrlKey || event.altKey) return
          const target = event.target
          const tag = target && target.tagName ? String(target.tagName).toLowerCase() : ''
          if (tag === 'textarea' || tag === 'input') return
          const index = parseInt(event.key, 10)
          if (!isFinite(index) || index < 1 || index > 9) return
          if (!hasOptions || index > question.options.length) return
          event.preventDefault()
          toggle(question.options[index - 1].value)
        }
        window.addEventListener('keydown', onKeyDown)
        return function removeListener() { window.removeEventListener('keydown', onKeyDown) }
      }, [toggle, hasOptions, question.id, question.options])

      const submit = function submitAnswer() {
        const trimmed = text.trim()
        if (values.length === 0 && trimmed === '') return
        props.onAnswer({ values: values, text: trimmed })
      }

      const canSubmit = values.length > 0 || text.trim() !== ''

      return h('div', { className: 'dtc-q' },
        h('div', { className: 'dtc-q-head' },
          h('span', { className: 'dtc-step' }, t('flow.step', { n: props.index })),
          h('span', { className: 'dtc-step-total' }, t('flow.of', { total: props.total })),
          multi ? h('span', { className: 'dtc-badge' }, t('flow.multiHint')) : null,
        ),
        h('h2', { className: 'dtc-q-title' }, pickPair(question.title, lang)),
        question.hint ? h('p', { className: 'dtc-q-hint' }, pickPair(question.hint, lang)) : null,
        hasOptions ? h('div', { className: 'dtc-options', role: multi ? 'group' : 'radiogroup' },
          question.options.map(function renderOption(option, index) {
            const on = values.indexOf(option.value) >= 0
            const note = option.note ? pickPair(option.note, lang) : ''
            return h('button', {
              key: option.value,
              type: 'button',
              className: 'dtc-option',
              'data-on': on ? '1' : '0',
              role: multi ? 'checkbox' : 'radio',
              'aria-checked': on,
              onClick: function chooseOption() { toggle(option.value) },
            },
              h('span', { className: 'dtc-option-mark' }, on ? h(Glyph, { name: 'check', size: 10, strokeWidth: 2.4 }) : null),
              h('span', { className: 'dtc-option-text' },
                h('span', { className: 'dtc-option-label' }, pickPair(option.label, lang)),
                note ? h('span', { className: 'dtc-option-note' }, note) : null,
              ),
              h('span', { className: 'dtc-option-key' }, String(index + 1)),
            )
          }),
        ) : null,
        allowText ? h('textarea', {
          ref: textRef,
          className: 'dtc-input',
          rows: hasOptions ? 2 : 3,
          value: text,
          placeholder: textPlaceholder,
          'aria-label': textPlaceholder,
          onChange: function change(event) { setText(event.target.value) },
          onKeyDown: function keydown(event) {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              submit()
            }
          },
        }) : null,
        h('div', { className: 'dtc-q-foot' },
          h(Btn, {
            variant: 'ghost',
            icon: 'x',
            onClick: function skipQuestion() { props.onSkip() },
            title: t('flow.skip'),
          }, t('flow.skip')),
          props.canBack ? h(Btn, {
            variant: 'ghost',
            icon: 'chevron-left',
            onClick: function goBack() { props.onBack() },
          }, t('flow.back')) : null,
          h('div', { className: 'dtc-spacer' }),
          h(Btn, {
            variant: 'primary',
            icon: 'chevron-right',
            iconSize: 14,
            onClick: submit,
            disabled: !canSubmit,
          }, t('flow.next')),
        ),
      )
    }

    function ConfirmCard(props) {
      const summary = props.summary
      const [text, setText] = useState('')
      const textRef = useRef(null)
      const submit = function submitConfirm() {
        props.onAnswer({ values: ['yes'], text: text.trim() })
      }
      return h('div', { className: 'dtc-q dtc-q-confirm' },
        h('div', { className: 'dtc-q-head' },
          h('span', { className: 'dtc-step' }, h(Glyph, { name: 'target', size: 11 }), t('flow.confirmTitle')),
        ),
        h('div', { className: 'dtc-summary' }, summary.split('\n').map(function renderLine(line, index) {
          return h('p', { key: index, className: 'dtc-summary-line' }, line)
        })),
        h('textarea', {
          ref: textRef,
          className: 'dtc-input',
          rows: 2,
          value: text,
          placeholder: t('flow.confirmPlaceholder'),
          onChange: function change(event) { setText(event.target.value) },
          onKeyDown: function keydown(event) {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              submit()
            }
          },
        }),
        h('div', { className: 'dtc-q-foot' },
          h(Btn, {
            variant: 'ghost',
            icon: 'edit',
            onClick: function focusText() {
              if (textRef.current && typeof textRef.current.focus === 'function') textRef.current.focus()
            },
          }, t('flow.confirmFix')),
          h('div', { className: 'dtc-spacer' }),
          h(Btn, { variant: 'primary', icon: 'check', iconSize: 14, onClick: submit }, t('flow.confirmYes')),
        ),
      )
    }

    function NoteCard(props) {
      const [text, setText] = useState('')
      const submitNote = function submitNote() {
        const trimmed = text.trim()
        if (trimmed === '') return
        props.onSubmit(trimmed)
      }
      return h('div', { className: 'dtc-q' },
        h('div', { className: 'dtc-q-head' }, h('span', { className: 'dtc-step' }, h(Glyph, { name: 'edit', size: 11 }), t('flow.continueTitle'))),
        h('textarea', {
          className: 'dtc-input',
          rows: 3,
          value: text,
          placeholder: t('flow.continuePlaceholder'),
          onChange: function change(event) { setText(event.target.value) },
          onKeyDown: function keydown(event) {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              submitNote()
            }
          },
        }),
        h('div', { className: 'dtc-q-foot' },
          h(Btn, { variant: 'ghost', onClick: props.onCancel }, t('flow.back')),
          h('div', { className: 'dtc-spacer' }),
          h(Btn, { variant: 'primary', icon: 'plus', onClick: submitNote, disabled: text.trim() === '' }, t('flow.continueSubmit')),
        ),
      )
    }

    function ReadyCard(props) {
      return h('div', { className: 'dtc-ready' },
        h('span', { className: 'dtc-ready-icon' }, h(Glyph, { name: 'check', size: 17, strokeWidth: 2.2 })),
        h('div', { className: 'dtc-ready-text' },
          h('h2', { className: 'dtc-ready-title' }, t('ready.title')),
          h('p', { className: 'dtc-ready-desc' }, t('ready.desc')),
        ),
        h('div', { className: 'dtc-row dtc-ready-actions' },
          props.pendingCount > 0 ? h(Btn, {
            variant: 'ghost',
            icon: 'chevron-right',
            onClick: props.onAnswerMore,
          }, t('ready.answerMore', { n: props.pendingCount })) : null,
          h(Btn, { variant: 'ghost', icon: 'plus', onClick: props.onAddNote }, t('ready.more')),
          h(Btn, { variant: 'ghost', icon: 'refresh', onClick: props.onAgain }, t('ready.again')),
        ),
      )
    }
    // ══════════════════════════════════════════════════════════════════════
    // Right pane: live brief preview + actions
    // ══════════════════════════════════════════════════════════════════════
    function BriefView(props) {
      const lines = String(props.text || '').split('\n')
      return h('div', { className: 'dtc-brief' }, lines.map(function renderLine(line, index) {
        if (line.indexOf('# ') === 0) return h('h3', { key: index, className: 'dtc-brief-h1' }, line.slice(2))
        if (line.indexOf('## ') === 0) return h('h4', { key: index, className: 'dtc-brief-h2' }, line.slice(3))
        if (line.indexOf('- ') === 0) return h('div', { key: index, className: 'dtc-brief-bullet' }, line.slice(2))
        if (line.trim() === '') return h('div', { key: index, className: 'dtc-brief-gap' })
        return h('p', { key: index, className: 'dtc-brief-p' }, line)
      }))
    }

    function EmptyPreview() {
      return h('div', { className: 'dtc-empty' },
        h('span', { className: 'dtc-empty-icon' }, h(Glyph, { name: 'layers', size: 22 })),
        h('h3', { className: 'dtc-empty-title' }, t('preview.emptyTitle')),
        h('p', { className: 'dtc-empty-body' }, t('preview.emptyBody')),
        h('ul', { className: 'dtc-empty-list' },
          h('li', null, t('preview.bullet1')),
          h('li', null, t('preview.bullet2')),
        ),
      )
    }

    function PreviewPane(props) {
      const stats = props.stats
      return h('aside', { className: 'dtc-side' },
        h('div', { className: 'dtc-side-head' },
          h('span', { className: 'dtc-side-title' }, h(Glyph, { name: 'target', size: 13 }), t('preview.title')),
          h('div', { className: 'dtc-spacer' }),
          h(Segmented, {
            label: t('preview.style'),
            value: props.style,
            options: [
              { value: 'standard', label: t('preview.standard') },
              { value: 'compact', label: t('preview.compact') },
            ],
            onChange: props.onStyle,
          }),
        ),
        h('div', { className: 'dtc-preview' },
          props.hasBrief ? h(BriefView, { text: props.brief }) : h(EmptyPreview, null),
        ),
        h('div', { className: 'dtc-side-foot' },
          h('div', { className: 'dtc-assume' },
            h('span', { className: 'dtc-label' }, t('flow.assumeLabel')),
            h(Segmented, {
              label: t('flow.assumeLabel'),
              value: props.assume,
              options: [
                { value: 'assume', label: t('assume.assume'), hint: t('assume.assumeHint') },
                { value: 'assumptions', label: t('assume.assumptions'), hint: t('assume.assumptionsHint') },
                { value: 'ask', label: t('assume.ask'), hint: t('assume.askHint') },
              ],
              onChange: props.onAssume,
            }),
          ),
          props.hasBrief ? h('div', { className: 'dtc-metrics' },
            h('span', { className: 'dtc-metric', title: t('preview.footerNote') }, t('preview.tokens', { n: stats.tokens })),
            h('span', { className: 'dtc-metric' }, t('preview.chars', { n: stats.chars })),
            h('span', { className: 'dtc-metric dtc-metric-good' }, t('preview.local')),
            h('span', { className: 'dtc-metric' }, t('preview.score', { n: stats.score })),
          ) : null,
          h('div', { className: 'dtc-side-actions' },
            h(Btn, {
              icon: 'copy',
              onClick: props.onCopy,
              disabled: !props.canUse,
              title: props.canUse ? t('preview.copy') : t('preview.locked'),
            }, t('preview.copy')),
            h(Btn, {
              variant: 'primary',
              icon: 'send',
              iconSize: 14,
              onClick: props.onStart,
              disabled: !props.canUse || props.starting,
            }, props.starting ? t('preview.starting') : t('preview.start')),
          ),
          h('div', { className: 'dtc-side-meta' },
            h('span', { className: 'dtc-metric' }, t('preview.rounds', { n: stats.rounds })),
            h('span', { className: 'dtc-footnote' }, t('footer.privacy')),
          ),
        ),
      )
    }

    // ══════════════════════════════════════════════════════════════════════
    // Header
    // ══════════════════════════════════════════════════════════════════════
    function Header(props) {
      return h('header', { className: 'dtc-header' },
        h(BrandMark, null),
        h('div', { className: 'dtc-head-text' },
          h('h1', { className: 'dtc-title' }, t('panel.title')),
          h('p', { className: 'dtc-sub' }, t('panel.subtitle')),
        ),
        h('div', { className: 'dtc-spacer' }),
        h('div', { className: 'dtc-mode' },
          h('span', { className: 'dtc-label' }, t('mode.label')),
          h(Segmented, {
            label: t('mode.label'),
            value: props.mode,
            options: MODE_IDS.map(function toOption(id) {
              return { value: id, label: t('mode.' + id), hint: t('mode.' + id + 'Hint') }
            }),
            onChange: props.onMode,
          }),
        ),
        props.showNew ? h(Btn, {
          variant: 'ghost',
          icon: 'plus',
          onClick: props.onNewTask,
          title: t('panel.newTask'),
        }, t('panel.newTask')) : null,
      )
    }

    // ══════════════════════════════════════════════════════════════════════
    // App
    // ══════════════════════════════════════════════════════════════════════
    function ClarifierApp() {
      useLocaleTick()
      const [session, setSession] = useState(loadSession)
      const [history, setHistory] = useState(loadHistory)
      const [toast, setToast] = useState(null)
      const [editingId, setEditingId] = useState(null)
      const [composingNote, setComposingNote] = useState(false)
      const [starting, setStarting] = useState(false)
      const toastTimer = useRef(null)

      useEffect(function persistSession() {
        writeJson(STORE_SESSION, session)
      }, [session])

      useEffect(function persistSettings() {
        saveSettings({ mode: session.mode, style: session.style, assume: session.assume })
      }, [session.mode, session.style, session.assume])

      useEffect(function toastLifecycle() {
        if (!toast) return function noop() {}
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(function hideToast() { setToast(null) }, 2800)
        return function cleanup() {
          if (toastTimer.current) clearTimeout(toastTimer.current)
        }
      }, [toast])

      const analysis = useMemo(function analyze() { return analyzeTask(session.raw) }, [session.raw])
      const lang = analysis.lang
      const plan = useMemo(function planQuestions() {
        return buildPlan(analysis, session.mode, session.answers, session.overrides)
      }, [analysis, session.mode, session.answers, session.overrides])
      const dims = useMemo(function dimensions() {
        return resolveDims(plan, session.answers, analysis, lang)
      }, [plan, session.answers, analysis, lang])
      const editableDims = useMemo(function editableDimensionList() {
        const intent = INTENTS[analysis.intent] || INTENTS.general
        const list = []
        for (const questionId of intent.questions) {
          const question = QUESTIONS[questionId]
          if (question && list.indexOf(question.dim) < 0) list.push(question.dim)
        }
        if (list.indexOf('priority') < 0) list.push('priority')
        return list
      }, [analysis.intent])
      const brief = useMemo(function buildBrief() {
        if (session.raw.trim() === '') return ''
        return composeBrief({
          raw: session.raw,
          analysis: analysis,
          dims: dims,
          notes: session.notes,
          lang: lang,
          style: session.style,
          assume: session.assume,
        })
      }, [session.raw, analysis, dims, session.notes, lang, session.style, session.assume])
      const stats = useMemo(function measure() {
        return briefStats(brief, session.raw, dims)
      }, [brief, session.raw, dims])
      const answered = useMemo(function answeredList() {
        return answeredQuestions(plan, session.answers)
      }, [plan, session.answers])
      const progress = useMemo(function progressState() {
        return progressOf(plan, session.answers)
      }, [plan, session.answers])
      const pending = useMemo(function pendingQuestion() {
        return nextQuestion(plan, session.answers)
      }, [plan, session.answers])
      // A ready session always shows the completion card — even when the user
      // finished early and questions remain, which are then listed there.
      const current = session.stage === 'input' || session.stage === 'ready'
        ? null
        : (editingId && QUESTIONS[editingId] ? QUESTIONS[editingId] : pending)
      const pendingCount = useMemo(function pendingCountState() {
        return plan.questions.filter(function unanswered(question) {
          return question.type !== 'confirm' && !session.answers[question.id]
        }).length
      }, [plan, session.answers])
      const canUse = hasMeaningfulContent(session.raw) && brief !== ''

      const notify = useCallback(function notifyUser(message, tone) {
        setToast({ id: Date.now(), message: message, tone: tone || 'ok' })
      }, [])

      const applySession = useCallback(function apply(next) {
        const stamped = Object.assign({}, next, { updatedAt: Date.now() })
        setSession(stamped)
        return stamped
      }, [])

      const freshSession = function freshSession(overrides) {
        return Object.assign({}, EMPTY_SESSION, loadSettings(), overrides)
      }

      const remember = useCallback(function rememberTask(nextSession, style) {
        if (!nextSession || !nextSession.raw || nextSession.raw.trim() === '') return
        const nextAnalysis = analyzeTask(nextSession.raw)
        const nextPlan = buildPlan(nextAnalysis, nextSession.mode, nextSession.answers, nextSession.overrides)
        const nextDims = resolveDims(nextPlan, nextSession.answers, nextAnalysis, nextAnalysis.lang)
        const base = {
          raw: nextSession.raw,
          analysis: nextAnalysis,
          dims: nextDims,
          notes: nextSession.notes,
          lang: nextAnalysis.lang,
          assume: nextSession.assume,
        }
        const standard = composeBrief(Object.assign({}, base, { style: 'standard' }))
        const compact = composeBrief(Object.assign({}, base, { style: 'compact' }))
        const id = nextSession.id || newId()
        const entry = {
          id: id,
          raw: nextSession.raw,
          intent: nextAnalysis.intent,
          createdAt: Date.now(),
          standard: standard,
          compact: compact,
          mode: nextSession.mode,
          style: style,
          assume: nextSession.assume,
          answers: nextSession.answers,
          overrides: nextSession.overrides,
          notes: nextSession.notes,
          score: briefStats(standard, nextSession.raw, nextDims).score,
        }
        setHistory(function updateHistory(previous) {
          const filtered = previous.filter(function notSame(item) { return item.id !== id })
          const next = [entry].concat(filtered).slice(0, HISTORY_MAX)
          writeJson(STORE_HISTORY, next)
          return next
        })
      }, [])

      const setRaw = function setRaw(value) {
        applySession(Object.assign({}, session, { raw: value }))
      }

      const start = function startClarifying() {
        if (!hasMeaningfulContent(session.raw)) {
          notify(t('toast.nothingToCopy'))
          return
        }
        setEditingId(null)
        setComposingNote(false)
        applySession(Object.assign({}, session, {
          stage: 'flow',
          answers: {},
          overrides: [],
          notes: [],
          saved: false,
          id: newId(),
        }))
      }

      const direct = function directBrief() {
        if (!hasMeaningfulContent(session.raw)) {
          notify(t('toast.nothingToCopy'))
          return
        }
        const next = applySession(Object.assign({}, session, {
          stage: 'ready',
          saved: false,
          id: session.id || newId(),
        }))
        remember(next, next.style)
        notify(t('ready.title'))
      }

      const submitAnswer = function submitAnswer(question, payload) {
        const trimmed = String((payload && payload.text) || '').trim()
        const answers = Object.assign({}, session.answers)
        answers[question.id] = {
          values: (payload && payload.values) || [],
          text: trimmed,
          skipped: false,
          at: Date.now(),
        }
        const notes = question.type === 'confirm' && trimmed !== ''
          ? session.notes.concat([trimmed])
          : session.notes
        const stage = question.type === 'confirm' ? 'ready' : 'flow'
        const next = applySession(Object.assign({}, session, {
          answers: answers,
          notes: notes,
          stage: stage,
          saved: false,
          id: session.id || newId(),
        }))
        setEditingId(null)
        if (stage === 'ready') remember(next, next.style)
      }

      const skipQuestion = function skipQuestion(question) {
        const answers = Object.assign({}, session.answers)
        answers[question.id] = { values: [], text: '', skipped: true, at: Date.now() }
        applySession(Object.assign({}, session, {
          answers: answers,
          stage: 'flow',
          saved: false,
          id: session.id || newId(),
        }))
        setEditingId(null)
      }

      const goBack = function goBack() {
        if (editingId) {
          setEditingId(null)
          return
        }
        if (answered.length === 0) {
          applySession(Object.assign({}, session, { stage: 'input' }))
          return
        }
        const last = answered[answered.length - 1]
        const answers = Object.assign({}, session.answers)
        delete answers[last.id]
        applySession(Object.assign({}, session, { answers: answers, stage: 'flow', saved: false }))
      }

      const editAnswer = function editAnswer(questionId) {
        if (!QUESTIONS[questionId]) return
        setComposingNote(false)
        setEditingId(questionId)
      }

      const finish = function finishNow() {
        const next = applySession(Object.assign({}, session, {
          stage: 'ready',
          saved: false,
          id: session.id || newId(),
        }))
        remember(next, next.style)
      }

      const answerRemaining = function answerRemaining() {
        applySession(Object.assign({}, session, { stage: 'flow' }))
      }

      const openNoteComposer = function openNoteComposer() {
        setComposingNote(true)
      }

      const addNote = function addNote(text) {
        const next = applySession(Object.assign({}, session, {
          notes: session.notes.concat([text]),
          stage: 'ready',
          saved: false,
          id: session.id || newId(),
        }))
        setComposingNote(false)
        remember(next, next.style)
      }

      const newTask = function newTask() {
        setEditingId(null)
        setComposingNote(false)
        applySession(freshSession({ raw: '' }))
        notify(t('toast.reset'))
      }

      const setMode = function setMode(nextMode) {
        if (MODE_IDS.indexOf(nextMode) < 0 || nextMode === session.mode) return
        applySession(Object.assign({}, session, {
          mode: nextMode,
          stage: session.stage === 'input' ? 'input' : 'flow',
        }))
      }

      const setStyle = function setStyle(nextStyle) {
        if (nextStyle !== 'standard' && nextStyle !== 'compact') return
        applySession(Object.assign({}, session, { style: nextStyle }))
      }

      const setAssume = function setAssume(nextAssume) {
        if (nextAssume !== 'assume' && nextAssume !== 'assumptions' && nextAssume !== 'ask') return
        applySession(Object.assign({}, session, { assume: nextAssume }))
      }

      const overrideDim = function overrideDim(dim) {
        const answeredMatch = answered.filter(function byDim(question) { return question.dim === dim })[0]
        if (answeredMatch) {
          const answers = Object.assign({}, session.answers)
          delete answers[answeredMatch.id]
          applySession(Object.assign({}, session, {
            answers: answers,
            stage: 'flow',
            overrides: session.overrides.indexOf(dim) >= 0 ? session.overrides : session.overrides.concat([dim]),
            saved: false,
          }))
          setEditingId(answeredMatch.id)
          return
        }
        const has = session.overrides.indexOf(dim) >= 0
        applySession(Object.assign({}, session, {
          overrides: has
            ? session.overrides.filter(function notDim(item) { return item !== dim })
            : session.overrides.concat([dim]),
          stage: 'flow',
        }))
      }

      const copy = function copyBrief() {
        if (!canUse) {
          notify(t('toast.nothingToCopy'))
          return
        }
        copyText(brief).then(function copied() {
          remember(session, session.style)
          notify(t('toast.copied'))
        }).catch(function copyFailed() {
          notify(t('toast.copyFailed'), 'warn')
        })
      }

      const startInChat = function startInChat() {
        if (!canUse) {
          notify(t('toast.nothingToCopy'))
          return
        }
        setStarting(true)
        const opened = openInConversation(brief)
        if (opened) {
          remember(session, session.style)
          notify(t('toast.started'))
          setStarting(false)
          return
        }
        copyText(brief).then(function copied() {
          remember(session, session.style)
          notify(t('toast.startCopyOnly'), 'warn')
        }).catch(function copyFailed() {
          notify(t('toast.startFailed'), 'warn')
        }).then(function done() {
          setStarting(false)
        })
      }

      const openHistory = function openHistory(entry) {
        setEditingId(null)
        setComposingNote(false)
        applySession(freshSession({
          id: entry.id || newId(),
          stage: 'ready',
          raw: entry.raw,
          mode: MODE_IDS.indexOf(entry.mode) >= 0 ? entry.mode : 'standard',
          style: entry.style === 'compact' ? 'compact' : 'standard',
          assume: entry.assume === 'assumptions' || entry.assume === 'ask' ? entry.assume : 'assume',
          answers: entry.answers && typeof entry.answers === 'object' ? entry.answers : {},
          overrides: Array.isArray(entry.overrides) ? entry.overrides : [],
          notes: Array.isArray(entry.notes) ? entry.notes : [],
          saved: true,
        }))
        notify(t('toast.restored'))
      }

      const reuseHistory = function reuseHistory(entry) {
        setEditingId(null)
        setComposingNote(false)
        applySession(freshSession({
          stage: 'flow',
          raw: entry.raw,
          mode: MODE_IDS.indexOf(entry.mode) >= 0 ? entry.mode : 'standard',
          style: entry.style === 'compact' ? 'compact' : 'standard',
          assume: entry.assume === 'assumptions' || entry.assume === 'ask' ? entry.assume : 'assume',
        }))
        notify(t('toast.reset'))
      }

      const deleteHistory = function deleteHistory(entry) {
        setHistory(function update(previous) {
          const next = previous.filter(function notSame(item) { return item.id !== entry.id })
          writeJson(STORE_HISTORY, next)
          return next
        })
      }

      const clearHistory = function clearAllHistory() {
        setHistory([])
        writeJson(STORE_HISTORY, [])
      }

      const questionIndex = current
        ? (editingId ? Math.max(1, answered.map(function idOf(question) { return question.id }).indexOf(editingId) + 1) : answered.length + 1)
        : answered.length
      const totalQuestions = Math.max(plan.substantiveTotal, 1)
      const percent = Math.round(progress.ratio * 100)
      const inFlow = session.stage !== 'input'

      return h('div', { className: 'dtc-root' },
        h('style', null, CSS),
        h(Header, {
          mode: session.mode,
          onMode: setMode,
          onNewTask: newTask,
          showNew: inFlow || session.raw.trim() !== '',
        }),
        h('div', { className: 'dtc-body' },
          h('main', { className: 'dtc-main' },
            session.stage === 'input'
              ? h(Landing, {
                session: session,
                setRaw: setRaw,
                onStart: start,
                onDirect: direct,
                onExample: function useExample(text) {
                  applySession(Object.assign({}, session, { raw: text }))
                },
                history: history,
                onOpenHistory: openHistory,
                onReuseHistory: reuseHistory,
                onDeleteHistory: deleteHistory,
                onClearHistory: clearHistory,
                notify: notify,
              })
              : h('div', { className: 'dtc-flow' },
                h('div', { className: 'dtc-flow-top' },
                  h('div', { className: 'dtc-progress' },
                    h('div', { className: 'dtc-progress-bar' },
                      h('div', { className: 'dtc-progress-fill', style: { width: percent + '%' } }),
                    ),
                    h('span', { className: 'dtc-progress-text' },
                      t('flow.progress', { done: progress.done, total: progress.total }),
                    ),
                  ),
                  h('div', { className: 'dtc-spacer' }),
                  h(Btn, {
                    variant: 'ghost',
                    icon: 'check',
                    onClick: finish,
                    disabled: answered.length === 0,
                    title: t('flow.finish'),
                  }, t('flow.finish')),
                ),
                h(AutoBar, {
                  analysis: analysis,
                  lang: lang,
                  overrides: session.overrides,
                  editableDims: editableDims,
                  onOverride: overrideDim,
                }),
                answered.filter(function notEditing(question) {
                  return question.id !== editingId
                }).map(function renderAnswered(question) {
                  return h(AnswerCard, {
                    key: question.id,
                    question: question,
                    answer: session.answers[question.id],
                    lang: lang,
                    onEdit: editAnswer,
                  })
                }),
                composingNote
                  ? h(NoteCard, {
                    onSubmit: addNote,
                    onCancel: function cancelNote() { setComposingNote(false) },
                  })
                  : current
                    ? (current.type === 'confirm'
                      ? h(ConfirmCard, {
                        key: 'confirm',
                        summary: confirmSummary(analysis, dims, lang),
                        onAnswer: function answerConfirm(payload) { submitAnswer(current, payload) },
                      })
                      : h(QuestionCard, {
                        key: current.id,
                        question: current,
                        lang: lang,
                        index: questionIndex,
                        total: totalQuestions,
                        canBack: answered.length > 0 || editingId !== null,
                        onAnswer: function answerQuestion(payload) { submitAnswer(current, payload) },
                        onSkip: function skipCurrent() { skipQuestion(current) },
                        onBack: goBack,
                      }))
                    : h(ReadyCard, {
                      pendingCount: pendingCount,
                      onAnswerMore: answerRemaining,
                      onAddNote: openNoteComposer,
                      onAgain: newTask,
                    }),
              ),
          ),
          h(PreviewPane, {
            brief: brief,
            stats: stats,
            style: session.style,
            onStyle: setStyle,
            assume: session.assume,
            onAssume: setAssume,
            canUse: canUse,
            onCopy: copy,
            onStart: startInChat,
            starting: starting,
            hasBrief: canUse,
          }),
        ),
        toast ? h('div', { className: 'dtc-toast', 'data-tone': toast.tone || 'ok', role: 'status' }, toast.message) : null,
      )
    }

    function useLocaleTick() {
      const [tick, setTick] = useState(0)
      useEffect(function subscribeLocale() {
        if (!localeService || typeof localeService.subscribe !== 'function') return function noop() {}
        return localeService.subscribe(function onLocaleChange() {
          setTick(function bump(value) { return value + 1 })
        })
      }, [])
      return tick
    }

    // ══════════════════════════════════════════════════════════════════════
    // Browser glue: clipboard, conversation hand-off, crash boundary
    // ══════════════════════════════════════════════════════════════════════
    let rootContext = null

    function copyText(text) {
      const value = String(text || '')
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          return navigator.clipboard.writeText(value)
        }
      } catch (error) {
        // fall through to the legacy path
      }
      return new Promise(function legacyCopy(resolve, reject) {
        try {
          const area = document.createElement('textarea')
          area.value = value
          area.setAttribute('readonly', '')
          area.style.position = 'fixed'
          area.style.top = '-1000px'
          area.style.opacity = '0'
          document.body.appendChild(area)
          area.select()
          const ok = document.execCommand && document.execCommand('copy')
          document.body.removeChild(area)
          if (ok) resolve()
          else reject(new Error('copy unavailable'))
        } catch (error) {
          reject(error)
        }
      })
    }

    /**
     * Hand the brief to the conversation. `uiWorkspace.startSession` opens the
     * Workspace's blank session and its `prompt` option fills that session's
     * composer draft, so the user reviews the brief and presses Enter — the send
     * itself stays a user action. Returns false when the optional services are
     * absent so the caller can fall back to the clipboard.
     */
    function openInConversation(text) {
      if (!text) return false
      let workspaceService = null
      let layoutService = null
      try {
        if (rootContext && typeof rootContext.get === 'function') {
          workspaceService = rootContext.get('uiWorkspace')
          layoutService = rootContext.get('layout')
        }
      } catch (error) {
        return false
      }
      if (!workspaceService || typeof workspaceService.startSession !== 'function') return false
      try {
        workspaceService.startSession(undefined, {
          prompt: text,
          whenDraftExists: 'replace',
          clearPreviousDraft: true,
        })
      } catch (error) {
        return false
      }
      try {
        if (layoutService && typeof layoutService.selectPanel === 'function') {
          layoutService.selectPanel('conversation')
        }
      } catch (error) {
        // The panel switch is cosmetic; the draft is already filled.
      }
      return true
    }

    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error: error }
      }

      render() {
        if (this.state.error) {
          return h('div', { className: 'dtc-root dtc-crash' },
            h('style', null, CSS),
            h('div', { className: 'dtc-crash-card' },
              h('h2', { className: 'dtc-crash-title' }, t('error.crashed')),
              h('p', { className: 'dtc-crash-hint' }, t('error.crashedHint')),
              h('pre', { className: 'dtc-crash-detail' },
                String((this.state.error && this.state.error.message) || this.state.error)),
              h(Btn, {
                onClick: function reload() {
                  try { window.location.reload() } catch (error) { /* ignore */ }
                },
              }, t('error.retry')),
            ),
          )
        }
        return this.props.children
      }
    }

    function Page() {
      return h(ErrorBoundary, null, h(ClarifierApp, null))
    }

    // ══════════════════════════════════════════════════════════════════════
    // Styles — theme tokens only (--dsw-alias-*), scoped under .dtc-root.
    // ══════════════════════════════════════════════════════════════════════
    const CSS = [
      '.dtc-root{display:flex;flex-direction:column;height:100%;min-height:0;width:100%;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:1.5;container-type:inline-size;overflow:hidden;}',
      '.dtc-root *{box-sizing:border-box;}',
      '.dtc-header{display:flex;align-items:center;gap:10px;flex:none;padding:12px 20px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);}',
      '.dtc-brand{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;flex:none;border-radius:9px;color:#fff;background:linear-gradient(135deg,#2f6fed,#7a5cff);box-shadow:0 1px 2px rgba(0,0,0,.18);}',
      '.dtc-head-text{min-width:0;}',
      '.dtc-title{margin:0;font-size:15px;font-weight:700;letter-spacing:-.01em;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.dtc-sub{margin:1px 0 0;font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.dtc-spacer{flex:1 1 auto;min-width:0;}',
      '.dtc-row{display:flex;align-items:center;gap:8px;}',
      '.dtc-label{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;}',
      '.dtc-mode{display:flex;align-items:center;gap:8px;flex:none;}',
      '.dtc-seg{display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);}',
      '.dtc-seg-btn{height:24px;padding:0 9px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:11.5px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background .12s ease,color .12s ease;}',
      '.dtc-seg-btn:hover{color:var(--dsw-alias-label-primary);}',
      '.dtc-seg-btn[data-on="1"]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08);}',
      '.dtc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12.5px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background .12s ease,border-color .12s ease,opacity .12s ease;}',
      '.dtc-btn:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.dtc-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}',
      '.dtc-btn:disabled{opacity:.42;cursor:default;}',
      '.dtc-btn-primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff;}',
      '.dtc-btn-primary:hover{background:var(--dsw-alias-brand-primary);filter:brightness(1.07);}',
      '.dtc-btn-ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary);}',
      '.dtc-btn-ghost:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.dtc-btn-label{display:inline-block;}',
      '.dtc-body{display:flex;flex:1 1 auto;min-height:0;overflow:hidden;}',
      '.dtc-main{flex:1 1 58%;min-width:0;min-height:0;overflow:auto;padding:18px 20px 26px;}',
      '.dtc-landing{display:flex;flex-direction:column;gap:14px;max-width:760px;margin:0 auto;}',
      '.dtc-landing-head{display:flex;flex-direction:column;gap:6px;margin:2px 0 2px;}',
      '.dtc-eyebrow{display:inline-flex;align-items:center;gap:5px;align-self:flex-start;padding:2px 8px 2px 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:10.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;}',
      '.dtc-landing-title{margin:0;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-.02em;}',
      '.dtc-landing-hint{margin:0;max-width:620px;font-size:13px;line-height:1.65;color:var(--dsw-alias-label-secondary);}',
      '.dtc-input-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:10px;display:flex;flex-direction:column;gap:8px;}',
      '.dtc-input{width:100%;resize:vertical;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);padding:8px 10px;font-family:inherit;font-size:13px;line-height:1.6;outline:none;transition:border-color .12s ease;}',
      '.dtc-input:focus{border-color:var(--dsw-alias-brand-primary);}',
      '.dtc-input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.85;}',
      '.dtc-input-lg{min-height:74px;font-size:14px;}',
      '.dtc-input-foot{display:flex;align-items:center;gap:10px;justify-content:space-between;flex-wrap:wrap;}',
      '.dtc-kbd.dtc-hint{font-size:10.5px;color:var(--dsw-alias-label-secondary);}',
      '.dtc-examples{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
      '.dtc-example{border:1px dashed var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:999px;padding:4px 10px;font-family:inherit;font-size:11.5px;cursor:pointer;transition:color .12s ease,border-color .12s ease;}',
      '.dtc-example:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2);}',
      '.dtc-footnote{margin:0;font-size:10.5px;line-height:1.5;color:var(--dsw-alias-label-secondary);}',
      '.dtc-muted{color:var(--dsw-alias-label-secondary);font-size:12px;}',
      '.dtc-history{display:flex;flex-direction:column;gap:6px;margin-top:2px;}',
      '.dtc-history-head{display:flex;align-items:center;gap:8px;}',
      '.dtc-history-rows{display:flex;flex-direction:column;gap:4px;}',
      '.dtc-history-row{display:flex;align-items:center;gap:2px;border-radius:9px;border:1px solid transparent;transition:background .12s ease,border-color .12s ease;}',
      '.dtc-history-row:hover{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l1);}',
      '.dtc-history-main{flex:1 1 auto;min-width:0;display:flex;align-items:baseline;gap:10px;border:0;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12.5px;text-align:left;padding:7px 8px;cursor:pointer;}',
      '.dtc-history-text{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtc-history-meta{flex:none;display:inline-flex;gap:5px;align-items:center;font-size:10.5px;color:var(--dsw-alias-label-secondary);}',
      '.dtc-dot{opacity:.6;}',
      '.dtc-history-act{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0;transition:opacity .12s ease,background .12s ease;}',
      '.dtc-history-row:hover .dtc-history-act{opacity:1;}',
      '.dtc-history-act:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.dtc-history-empty{margin:4px 0 0;}',
      '.dtc-flow{display:flex;flex-direction:column;gap:10px;max-width:760px;margin:0 auto;}',
      '.dtc-flow-top{display:flex;align-items:center;gap:10px;margin-bottom:2px;}',
      '.dtc-progress{display:flex;align-items:center;gap:8px;flex:1 1 auto;min-width:0;}',
      '.dtc-progress-bar{flex:1 1 auto;height:4px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden;max-width:260px;}',
      '.dtc-progress-fill{height:100%;border-radius:999px;background:var(--dsw-alias-brand-primary);transition:width .25s ease;}',
      '.dtc-progress-text{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;}',
      '.dtc-auto{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:7px 10px;border-radius:10px;border:1px dashed var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);}',
      '.dtc-auto-title{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:600;color:var(--dsw-alias-label-secondary);letter-spacing:.02em;}',
      '.dtc-auto-chip{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:999px;padding:2px 8px 2px 7px;font-family:inherit;font-size:11px;cursor:pointer;transition:border-color .12s ease;}',
      '.dtc-auto-chip:hover{border-color:var(--dsw-alias-border-l2);}',
      '.dtc-auto-chip[data-on="1"]{border-color:var(--dsw-alias-brand-primary);}',
      '.dtc-auto-chip-static{cursor:default;border-style:dashed;background:transparent;}',
      '.dtc-auto-dim{color:var(--dsw-alias-label-secondary);}',
      '.dtc-auto-val{font-weight:600;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtc-answer{display:flex;flex-direction:column;gap:2px;padding:8px 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);}',
      '.dtc-answer-head{display:flex;align-items:center;gap:7px;}',
      '.dtc-answer-check{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:none;border-radius:50%;background:var(--dsw-alias-state-success-primary);color:#fff;}',
      '.dtc-answer-q{flex:1 1 auto;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtc-answer-a{padding-left:23px;font-size:12.5px;line-height:1.55;overflow-wrap:anywhere;}',
      '.dtc-answer-a.dtc-answer-skipped{color:var(--dsw-alias-label-secondary);font-style:italic;}',
      '.dtc-link{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:11px;cursor:pointer;padding:2px 4px;border-radius:5px;}',
      '.dtc-link:hover{color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);}',
      '.dtc-q{position:relative;display:flex;flex-direction:column;gap:10px;padding:14px 16px 12px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 2px rgba(0,0,0,.04);}',
      '.dtc-q::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:3px;border-radius:0 3px 3px 0;background:var(--dsw-alias-brand-primary);}',
      '.dtc-q-confirm::before{background:var(--dsw-alias-state-success-primary);}',
      '.dtc-q-head{display:flex;align-items:center;gap:8px;padding-left:2px;}',
      '.dtc-step{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;letter-spacing:.02em;color:var(--dsw-alias-brand-primary);}',
      '.dtc-step-total{font-size:11px;color:var(--dsw-alias-label-secondary);}',
      '.dtc-badge{margin-left:auto;padding:1px 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:10px;font-weight:600;}',
      '.dtc-q-title{margin:0;font-size:16.5px;line-height:1.4;font-weight:700;letter-spacing:-.01em;}',
      '.dtc-q-hint{margin:-4px 0 0;font-size:11.5px;line-height:1.55;color:var(--dsw-alias-label-secondary);}',
      '.dtc-options{display:flex;flex-direction:column;gap:5px;margin:2px 0 0;}',
      '.dtc-option{display:flex;align-items:flex-start;gap:9px;width:100%;padding:8px 10px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12.5px;line-height:1.5;text-align:left;cursor:pointer;transition:border-color .12s ease,background .12s ease;}',
      '.dtc-option:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.dtc-option[data-on="1"]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);}',
      '.dtc-option-mark{display:inline-flex;align-items:center;justify-content:center;flex:none;width:16px;height:16px;margin-top:1px;border-radius:5px;border:1.5px solid var(--dsw-alias-border-l2);color:#fff;}',
      '.dtc-option[data-on="1"] .dtc-option-mark{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);}',
      '.dtc-option-text{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px;}',
      '.dtc-option-label{font-weight:500;}',
      '.dtc-option-note{font-size:10.5px;color:var(--dsw-alias-label-secondary);}',
      '.dtc-option-key{flex:none;font-size:10px;color:var(--dsw-alias-label-secondary);opacity:.7;font-family:' + MONO_FONT + ';}',
      '.dtc-q-foot{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
      '.dtc-summary{border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);padding:9px 11px;display:flex;flex-direction:column;gap:3px;}',
      '.dtc-summary-line{margin:0;font-size:12.5px;line-height:1.6;overflow-wrap:anywhere;}',
      '.dtc-ready{display:flex;align-items:flex-start;gap:11px;flex-wrap:wrap;padding:13px 15px;border-radius:12px;border:1px solid var(--dsw-alias-state-success-primary);background:var(--dsw-alias-bg-layer-1);}',
      '.dtc-ready-icon{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;flex:none;border-radius:50%;background:var(--dsw-alias-state-success-primary);color:#fff;}',
      '.dtc-ready-text{flex:1 1 220px;min-width:0;}',
      '.dtc-ready-title{margin:0;font-size:14px;font-weight:700;}',
      '.dtc-ready-desc{margin:2px 0 0;font-size:11.5px;color:var(--dsw-alias-label-secondary);}',
      '.dtc-ready-actions{flex-wrap:wrap;justify-content:flex-end;}',
      '.dtc-side{display:flex;flex-direction:column;flex:0 0 42%;min-width:320px;max-width:560px;min-height:0;border-left:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);}',
      '.dtc-side-head{display:flex;align-items:center;gap:8px;flex:none;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);}',
      '.dtc-side-title{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;letter-spacing:.01em;}',
      '.dtc-preview{flex:1 1 auto;min-height:0;overflow:auto;padding:14px 16px;}',
      '.dtc-brief{display:flex;flex-direction:column;gap:2px;font-size:12.5px;line-height:1.62;overflow-wrap:anywhere;}',
      '.dtc-brief-h1{margin:0 0 3px;font-size:14.5px;font-weight:700;}',
      '.dtc-brief-h2{margin:11px 0 3px;font-size:12px;font-weight:700;color:var(--dsw-alias-label-primary);}',
      '.dtc-brief-bullet{padding-left:12px;position:relative;}',
      '.dtc-brief-bullet::before{content:"·";position:absolute;left:3px;color:var(--dsw-alias-brand-primary);font-weight:700;}',
      '.dtc-brief-p{margin:0;}',
      '.dtc-brief-gap{height:4px;}',
      '.dtc-empty{display:flex;flex-direction:column;align-items:flex-start;gap:8px;color:var(--dsw-alias-label-secondary);}',
      '.dtc-empty-icon{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:12px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);}',
      '.dtc-empty-title{margin:2px 0 0;font-size:13.5px;font-weight:700;color:var(--dsw-alias-label-primary);}',
      '.dtc-empty-body{margin:0;font-size:12px;line-height:1.6;}',
      '.dtc-empty-list{margin:0;padding-left:16px;font-size:11.5px;line-height:1.7;}',
      '.dtc-side-foot{flex:none;border-top:1px solid var(--dsw-alias-border-l1);padding:10px 14px 12px;display:flex;flex-direction:column;gap:9px;}',
      '.dtc-assume{display:flex;align-items:center;gap:8px;justify-content:space-between;flex-wrap:wrap;}',
      '.dtc-metrics{display:flex;align-items:center;gap:5px;flex-wrap:wrap;}',
      '.dtc-metric{padding:1px 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:10.5px;white-space:nowrap;}',
      '.dtc-metric.dtc-metric-good{color:var(--dsw-alias-state-success-primary);font-weight:600;}',
      '.dtc-side-actions{display:flex;align-items:center;gap:8px;}',
      '.dtc-side-actions .dtc-btn{flex:1 1 auto;}',
      '.dtc-side-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;}',
      '.dtc-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:60;padding:8px 14px;border-radius:10px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font-size:12px;box-shadow:0 6px 20px rgba(0,0,0,.18);max-width:80vw;}',
      '.dtc-toast[data-tone="warn"]{border-color:var(--dsw-alias-state-warn-primary);}',
      '.dtc-crash{align-items:center;justify-content:center;padding:24px;}',
      '.dtc-crash-card{max-width:520px;display:flex;flex-direction:column;gap:10px;padding:18px 20px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);}',
      '.dtc-crash-title{margin:0;font-size:15px;}',
      '.dtc-crash-hint{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary);}',
      '.dtc-crash-detail{margin:0;max-height:160px;overflow:auto;padding:8px;border-radius:8px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);font-family:' + MONO_FONT + ';font-size:11px;color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;overflow-wrap:anywhere;}',
      '@container (max-width: 880px){.dtc-body{flex-direction:column;}.dtc-side{flex:1 1 auto;max-width:none;min-width:0;border-left:0;border-top:1px solid var(--dsw-alias-border-l1);max-height:46%;}.dtc-main{flex:1 1 auto;}.dtc-sub{display:none;}}',
      '@container (max-width: 620px){.dtc-header{flex-wrap:wrap;}.dtc-mode{margin-left:40px;}.dtc-side{max-height:none;}.dtc-q-title{font-size:15px;}}',
      '@media (prefers-reduced-motion: reduce){.dtc-root *{transition:none !important;}}',
      '@media (max-width: 720px){.dtc-side{max-height:none;}.dtc-mode{margin-left:0;}.dtc-head-text{display:none;}}',
    ].join('')

    // ══════════════════════════════════════════════════════════════════════
    // Registration — sidebar row + keyed main page
    // ══════════════════════════════════════════════════════════════════════
    function apply(ctx) {
      rootContext = ctx

      ctx.effect(function registerLocale() {
        return ctx.locale.register(NS, { zh: zh, en: en })
      }, 'dsh-task-clarifier: locale')

      let bound = null
      try {
        bound = ctx.locale.bind(NS)
      } catch (error) {
        bound = null
      }
      wireLocale(ctx.locale, bound)

      // The left-sidebar row. The shell owns the button, label, tooltip, rail
      // geometry and the panel switch; this component draws only the glyph.
      ctx.effect(function registerSidebarRow() {
        return ctx.slots.inject('sidebar.panellist', function mountSidebarRow() {
          return ctx.slots.register({
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: PANEL_ORDER,
            label: function panelLabel() { return t('panel.label') },
            locale: NS,
          }, SidebarIcon)
        })
      }, 'dsh-task-clarifier: sidebar row')

      // The page that row selects. The layout mounts it only while this panel
      // is selected, so the conversation keeps the center column otherwise.
      ctx.effect(function registerMainPage() {
        return ctx.slots.inject('main', function mountMainPage() {
          return ctx.slots.register({
            name: 'main',
            key: PANEL_ID,
            locale: NS,
          }, Page)
        })
      }, 'dsh-task-clarifier: page')
    }

    return {
      name: NS,
      inject: ['slots', 'locale'],
      apply: apply,
      // Internal handles for the Node unit tests (tests/engine.test.mjs). The
      // Web loader only consumes `name`, `inject` and `apply`; extra fields are
      // inert at runtime and let the engine be exercised without a browser.
      __test: {
        NS: NS,
        PANEL_ID: PANEL_ID,
        MODE_IDS: MODE_IDS,
        MODE_CAP: MODE_CAP,
        QUESTIONS: QUESTIONS,
        INTENTS: INTENTS,
        zh: zh,
        en: en,
        detectLanguage: detectLanguage,
        detectIntent: detectIntent,
        detectFacts: detectFacts,
        buildAuto: buildAuto,
        analyzeTask: analyzeTask,
        buildPlan: buildPlan,
        nextQuestion: nextQuestion,
        answeredQuestions: answeredQuestions,
        progressOf: progressOf,
        resolveDims: resolveDims,
        composeBrief: composeBrief,
        briefStats: briefStats,
        estimateTokens: estimateTokens,
        confirmSummary: confirmSummary,
        answerParts: answerParts,
        autoParts: autoParts,
      },
    }
  },
})
