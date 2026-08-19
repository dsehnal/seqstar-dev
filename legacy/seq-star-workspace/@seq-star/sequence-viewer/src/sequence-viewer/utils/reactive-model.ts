/** biome-ignore-all lint/suspicious/noExplicitAny: ... */
import type { Observable } from "rxjs"

export class ReactiveModel {
  private disposeActions: (() => void)[] = []

  subscribe<T>(obs: Observable<T>, action: (v: T) => any) {
    const sub = obs.subscribe(action)
    const dispose = () => sub.unsubscribe()
    this.disposeActions.push(dispose)
    return dispose
  }

  event<K extends keyof HTMLElementEventMap>(
    target: HTMLElement | Document | Window,
    type: K,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ) {
    target.addEventListener(type, listener as any, options)
    const dispose = () => target.removeEventListener(type, listener as any, options)
    this.disposeActions.push(dispose)
    return dispose
  }

  customDispose(action: () => void) {
    this.disposeActions.push(action)
  }

  mount(..._args: any[]) {}

  dispose() {
    for (const ev of this.disposeActions) ev()
    this.disposeActions = []
  }
}
