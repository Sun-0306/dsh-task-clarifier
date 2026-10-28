/**
 * Loads the browser half of dsh-task-clarifier in Node.
 *
 * The Web loader hands the module a plain factory; this harness reproduces that
 * contract (window.__ModuleLoader__.load + a React stub) so the deterministic
 * engine and the slot registrations can be exercised without a browser.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
export const clientPath = path.join(here, '..', 'client.js')
const source = readFileSync(clientPath, 'utf8')

let captured = null

class Component {
  constructor(props) {
    this.props = props || {}
    this.state = {}
  }
}

const ReactStub = {
  Component,
  createElement() {
    return { type: 'stub' }
  },
  useState() {
    return [undefined, function noop() {}]
  },
  useEffect() {},
  useMemo(fn) {
    return fn()
  },
  useRef() {
    return { current: null }
  },
  useCallback(fn) {
    return fn
  },
}

const store = new Map()
globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      captured = definition
    },
  },
}
globalThis.document = {
  documentElement: { lang: 'zh-CN' },
  body: { appendChild() {}, removeChild() {} },
}
globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null
  },
  setItem(key, value) {
    store.set(key, String(value))
  },
  removeItem(key) {
    store.delete(key)
  },
}
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { clipboard: { writeText: async function write() {} } },
})

// eslint-disable-next-line no-new-func
new Function('window', 'document', 'localStorage', 'navigator', source)(
  globalThis.window,
  globalThis.document,
  globalThis.localStorage,
  globalThis.navigator,
)

if (!captured) throw new Error('the module never called window.__ModuleLoader__.load')

const loaded = captured.factory(function requireStub(name) {
  if (name === 'react') return ReactStub
  return {}
})

export const api = loaded.__test
export const module = loaded

if (!api) throw new Error('module did not expose __test handles')

/**
 * Runs apply() against a recording fake context and returns what the plugin
 * registered. Mirrors the real Client contract: locale.register/bind,
 * slots.inject/register and ctx.effect.
 */
export function applyWithFakeContext() {
  const registrations = []
  const effects = []
  const dictionary = { zh: api.zh, en: api.en }
  const ctx = {
    effect(callback, label) {
      const disposer = callback()
      effects.push({ label, disposer })
      return disposer
    },
    locale: {
      register(namespace, dicts) {
        registrations.push({ type: 'locale', namespace, dicts })
        return function dispose() {}
      },
      bind(namespace) {
        return function translate(key) {
          const dict = dictionary.zh || {}
          return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key
        }
      },
    },
    slots: {
      inject(slot, callback) {
        registrations.push({ type: 'inject', slot })
        return callback()
      },
      register(options, component) {
        registrations.push({ type: 'register', options, component })
        return function dispose() {}
      },
    },
    get() {
      return undefined
    },
  }
  loaded.apply(ctx)
  return { registrations, effects, ctx }
}

// The Client half must only be evaluated through the harness globals above.
export const testState = { store }
