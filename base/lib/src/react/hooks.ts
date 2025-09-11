import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import {
  type BehaviorSubject,
  distinctUntilChanged,
  map,
  type OperatorFunction,
  type Subject,
  skip,
} from "rxjs"
import { Context } from "../context"
import type { Data } from "../data"
import type { Spec } from "../data/specification"
import type { ReactiveModel } from "../utils/reactive-model"

export const ReactContext = createContext<Context>(undefined as any)

export function useCreateSequenceContext(defaultSpec: Spec, data?: Data) {
  const _ctx = useRef<Context>(null)
  if (!_ctx.current) {
    _ctx.current = new Context(defaultSpec)
  }
  useEffect(() => {
    if (!data) return
    _ctx.current?.setData(data)
  }, [data])

  useEffect(() => {
    _ctx.current?.mount()
    return () => {
      _ctx.current?.dispose()
    }
  }, [])

  return _ctx.current
}

export function useSequenceContext() {
  return useContext(ReactContext)
}

export function useBehavior<T>(s: BehaviorSubject<T>): T
export function useBehavior<T>(s: BehaviorSubject<T> | undefined): T | undefined
export function useBehavior<T>(s: BehaviorSubject<T> | undefined): T | undefined {
  return useSyncExternalStore(
    useCallback(
      (callback: () => void) => {
        if (!s) {
          return () => {}
        }
        const sub = s.pipe(skip(1)).subscribe(callback)
        return () => sub?.unsubscribe()
      },
      [s],
    ),
    useCallback(() => s?.value, [s]),
  )
}

export function useBehaviorProp<T, V>(
  s: BehaviorSubject<T>,
  p: (v: T) => V,
  operators?: OperatorFunction<V, V>[],
  cmp?: (a: V, b: V) => boolean,
): V
export function useBehaviorProp<T, V>(
  s: BehaviorSubject<T> | undefined,
  p: (v: T) => V,
  operators?: OperatorFunction<V, V>[],
  cmp?: (a: V, b: V) => boolean,
): T | undefined
export function useBehaviorProp<T, V>(
  s: BehaviorSubject<T> | undefined,
  p: (v: T) => V,
  operators?: OperatorFunction<V, V>[],
  cmp?: (a: V, b: V) => boolean,
): T | undefined {
  const fns = useRef<{
    p: (v: T) => V
    cmp?: (a: V, b: V) => boolean
    operators?: OperatorFunction<V, V>[]
  }>({
    p,
    operators,
    cmp,
  })
  fns.current.p = p
  fns.current.operators = operators
  fns.current.cmp = cmp

  return useSyncExternalStore(
    useCallback(
      (callback: () => void) => {
        if (!s) {
          return () => {}
        }
        const sub = s
          .pipe(
            skip(1),
            map(fns.current.p),
            distinctUntilChanged(fns.current.cmp),
            ...((operators || []) as []),
          )
          .subscribe(callback)

        return () => sub?.unsubscribe()
      },
      [s, operators],
    ),
    useCallback(() => {
      if (!s) {
        return undefined as any
      }
      return fns.current.p(s.value)
    }, [s]),
  )
}

export function useEvent<T>(s: Subject<T> | undefined): T | undefined {
  const value = useRef<T | undefined>(undefined)
  return useSyncExternalStore(
    useCallback(
      (callback: () => void) => {
        if (!s) {
          return () => {}
        }
        const sub = s.subscribe((v) => {
          value.current = v
          callback()
        })
        return () => sub?.unsubscribe()
      },
      [s],
    ),
    useCallback(() => value.current, [s]),
  )
}

export function useReactiveModel<T extends ReactiveModel>(model: T | undefined): T | undefined {
  useEffect(() => {
    model?.mount()
    return () => model?.dispose()
  }, [model])
  return model
}

export function useIsTrackHighlighted(context: Context, trackId: string) {
  const [isHighlighted, setIsHighlighted] = useState(
    context.state.highlight.value.trackId === trackId,
  )
  useEffect(() => {
    let isHighlighted = context.state.highlight.value.trackId === trackId
    const sub = context.state.highlight.subscribe((h) => {
      const nextIsHighlighted = h.trackId === trackId
      if (isHighlighted !== nextIsHighlighted) {
        isHighlighted = nextIsHighlighted
        setIsHighlighted(isHighlighted)
      }
    })
    return () => sub.unsubscribe()
  }, [context, trackId])
  return isHighlighted
}
