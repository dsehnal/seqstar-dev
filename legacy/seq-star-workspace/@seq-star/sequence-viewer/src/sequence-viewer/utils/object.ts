export function findPredecessorIndex(xs: ArrayLike<number>, query: number) {
  return findPredecessorIndexInRange(xs, query, 0, xs.length)
}

/** Adapted from Mol*, MIT license, (c) 2017-2025 mol* contributors */
export function findPredecessorIndexInRange(
  xs: ArrayLike<number>,
  query: number,
  start: number,
  end: number,
): number {
  if (start === end) return start
  if (xs[start] >= query) return start
  if (xs[end - 1] < query) return end
  // Invariants: xs[i] < query for each i < min, xs[i] >= query for each i >= max
  let min = start
  let max = end
  while (max - min > 4) {
    const mid = (min + max) >> 1
    if (xs[mid] >= query) {
      max = mid
    } else {
      min = mid + 1
    }
  }
  // Linear search remaining elements:
  for (let i = min; i < max; i++) {
    if (xs[i] >= query) {
      return i
    }
  }
  return max
}

/** Adapted from Mol*, MIT license, (c) 2017-2025 mol* contributors */
/** Cache the latest result from calls to a function with any number of arguments */
export function memoizeLatest<Args extends any[], T>(
  f: (...args: Args) => T,
): (...args: Args) => T {
  let lastArgs: any[] | undefined = void 0
  let value: any = void 0
  return (...args) => {
    if (!lastArgs || lastArgs.length !== args.length) {
      lastArgs = args
      value = f.apply(void 0, args)
      return value
    }
    for (let i = 0, _i = args.length; i < _i; i++) {
      if (args[i] !== lastArgs[i]) {
        lastArgs = args
        value = f.apply(void 0, args)
        return value
      }
    }
    return value
  }
}

/** Adapted from Mol*, MIT license, (c) 2017-2025 mol* contributors */
export function shallowEqual<T extends Record<string, any>>(a: T, b: T): boolean {
  if (a === b) return true
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (a[key] !== b[key]) return false
  }
  return true
}

// biome-ignore lint/suspicious/noShadowRestrictedNames: ...
const hasOwnProperty = Object.prototype.hasOwnProperty

/** Adapted from Mol*, MIT license, (c) 2017-2025 mol* contributors */
export function deepEqual(a: any, b: any) {
  // from https://github.com/epoberezkin/fast-deep-equal MIT
  if (a === b) return true

  const arrA = Array.isArray(a)
  const arrB = Array.isArray(b)

  if (arrA && arrB) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }

  if (arrA !== arrB) return false

  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false

    const dateA = a instanceof Date
    const dateB = b instanceof Date
    if (dateA && dateB) return a.getTime() === b.getTime()
    if (dateA !== dateB) return false

    const regexpA = a instanceof RegExp
    const regexpB = b instanceof RegExp
    if (regexpA && regexpB) return a.toString() === b.toString()
    if (regexpA !== regexpB) return false

    for (let i = 0; i < keys.length; i++) {
      if (!hasOwnProperty.call(b, keys[i])) return false
    }

    for (let i = 0; i < keys.length; i++) {
      if (!deepEqual(a[keys[i]], b[keys[i]])) return false
    }

    return true
  }

  return false
}

const uuid22Chars: string[] = []
export function uuid22(): string {
  let d = Date.now()
  for (let i = 0; i < 16; i++) {
    uuid22Chars[i] = String.fromCharCode(((d + Math.random() * 0xff) % 0xff) | 0)
    d = Math.floor(d / 0xff)
  }
  return btoa(uuid22Chars.join("")).replace(/\+/g, "-").replace(/\//g, "_").substring(0, 22)
}
