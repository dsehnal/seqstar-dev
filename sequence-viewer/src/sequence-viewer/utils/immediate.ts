/**
 * Adapted from Mol*, MIT license, (c) 2017-2025 mol* contributors
 *
 * setTimeout(fn, 0) usually has up to 4ms delay which is quite a lot when rendering
 * This code brings it down.
 */
/** biome-ignore-all lint/style/noNonNullAssertion: ... */
/** biome-ignore-all lint/suspicious/noExplicitAny: ... */

declare const WorkerGlobalScope: any
function createImmediateActions() {
  const thisGlobal: any = (() => {
    const _window = typeof window !== "undefined" && window
    const _self =
      typeof self !== "undefined" &&
      typeof WorkerGlobalScope !== "undefined" &&
      self instanceof WorkerGlobalScope &&
      self
    const _global = typeof global !== "undefined" && global
    return _window || _global || _self
  })()

  type Callback = (...args: any[]) => void
  type Task = { callback: Callback; args: any[] }

  const tasksByHandle: { [handle: number]: Task } = {}
  const doc = typeof document !== "undefined" ? document : void 0

  let nextHandle = 1 // Spec says greater than zero
  let registerImmediate: (handle: number) => void

  function setImmediate(callback: Callback, ...args: any[]) {
    let cb = callback
    // Callback can either be a function or a string
    if (typeof callback !== "function") {
      cb = new Function("" + callback) as Callback
    }
    // Store and register the task
    const task = { callback: cb, args: args }
    tasksByHandle[nextHandle] = task
    registerImmediate(nextHandle)
    return nextHandle++
  }

  function clearImmediate(handle: number) {
    delete tasksByHandle[handle]
  }

  function run(task: Task) {
    const callback = task.callback
    const args = task.args
    switch (args.length) {
      case 0:
        callback()
        break
      case 1:
        callback(args[0])
        break
      case 2:
        callback(args[0], args[1])
        break
      case 3:
        callback(args[0], args[1], args[2])
        break
      default:
        callback.apply(undefined, args)
        break
    }
  }

  function runIfPresent(handle: number) {
    const task = tasksByHandle[handle]
    clearImmediate(handle)
    run(task)
  }

  function installNextTickImplementation() {
    registerImmediate = (handle) => {
      process.nextTick(() => {
        runIfPresent(handle)
      })
    }
  }

  function canUsePostMessage() {
    if (thisGlobal && thisGlobal.postMessage && !thisGlobal.importScripts) {
      let postMessageIsAsynchronous = true
      const oldOnMessage = thisGlobal.onmessage
      thisGlobal.onmessage = () => {
        postMessageIsAsynchronous = false
      }
      thisGlobal.postMessage("", "*")
      thisGlobal.onmessage = oldOnMessage
      return postMessageIsAsynchronous
    }
  }

  function installPostMessageImplementation() {
    // Installs an event handler on `global` for the `message` event: see
    // * https://developer.mozilla.org/en/DOM/window.postMessage
    // * http://www.whatwg.org/specs/web-apps/current-work/multipage/comms.html#crossDocumentMessages

    const messagePrefix = "setImmediate$" + Math.random() + "$"
    const onGlobalMessage = (event: any) => {
      if (
        event.source === thisGlobal &&
        typeof event.data === "string" &&
        event.data.indexOf(messagePrefix) === 0
      ) {
        runIfPresent(+event.data.slice(messagePrefix.length))
      }
    }

    if (window.addEventListener) {
      window.addEventListener("message", onGlobalMessage, false)
    } else {
      ;(window as any).attachEvent("onmessage", onGlobalMessage)
    }

    registerImmediate = (handle) => {
      window.postMessage(messagePrefix + handle, "*")
    }
  }

  function installMessageChannelImplementation() {
    const channel = new MessageChannel()
    channel.port1.onmessage = (event) => {
      const handle = event.data
      runIfPresent(handle)
    }

    registerImmediate = (handle) => {
      channel.port2.postMessage(handle)
    }
  }

  function installReadyStateChangeImplementation() {
    const html = doc!.documentElement!
    registerImmediate = (handle) => {
      // Create a <script> element; its readystatechange event will be fired asynchronously once it is inserted
      // into the document. Do so, thus queuing up the task. Remember to clean up once it's been called.
      let script = doc!.createElement("script") as any
      script.onreadystatechange = () => {
        runIfPresent(handle)
        script.onreadystatechange = null
        html.removeChild(script)
        script = null
      }
      html.appendChild(script)
    }
  }

  function installSetTimeoutImplementation() {
    registerImmediate = (handle) => {
      setTimeout(runIfPresent, 0, handle)
    }
  }

  // Don't get fooled by e.g. browserify environments.
  if (typeof process !== "undefined" && {}.toString.call(process) === "[object process]") {
    // For Node.js before 0.9
    installNextTickImplementation()
  } else if (canUsePostMessage()) {
    // For non-IE10 modern browsers
    installPostMessageImplementation()
  } else if (typeof MessageChannel !== "undefined") {
    // For web workers, where supported
    installMessageChannelImplementation()
  } else if (doc && "onreadystatechange" in doc.createElement("script")) {
    // For IE 6–8
    installReadyStateChangeImplementation()
  } else {
    // For older browsers
    installSetTimeoutImplementation()
  }

  return {
    setImmediate,
    clearImmediate,
  }
}

const immediateActions = (() => {
  if (typeof setImmediate !== "undefined") {
    if (typeof window !== "undefined") {
      return {
        setImmediate: (handler: any, ...args: any[]) =>
          (window as any).setImmediate(handler, ...(args as any)) as number,
        clearImmediate: (handle: any) => (window as any).clearImmediate(handle),
      }
    }
    return { setImmediate, clearImmediate }
  }
  return createImmediateActions()
})()

function resolveImmediate(res: () => void) {
  immediateActions.setImmediate(res)
}

export function immediatePromise() {
  return new Promise<void>(resolveImmediate)
}
