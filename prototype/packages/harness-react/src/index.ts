import type {
  ApplicationHarness,
  ComponentRegistryChange,
  HarnessMessage,
} from "@seq-star/harness-core";
import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export type HarnessStatus = "starting" | "ready" | "failed" | "disposing" | "disposed";

export interface HarnessHostRegistration {
  readonly id: string;
  readonly element: HTMLElement;
}

export interface HarnessHostRegistry {
  readonly size: number;
  get(id: string): HTMLElement | undefined;
  require(id: string): HTMLElement;
  register(registration: HarnessHostRegistration): () => void;
  entries(): readonly HarnessHostRegistration[];
}

export const createHarnessHostRegistry = (): HarnessHostRegistry => {
  const elements = new Map<string, HTMLElement>();
  return {
    get size() {
      return elements.size;
    },
    get: (id) => elements.get(id),
    require(id) {
      const element = elements.get(id);
      if (element === undefined) throw new Error(`Harness host '${id}' is not registered.`);
      return element;
    },
    register(registration) {
      const previous = elements.get(registration.id);
      if (previous !== undefined && previous !== registration.element)
        throw new Error(`Harness host '${registration.id}' is already registered.`);
      elements.set(registration.id, registration.element);
      return () => {
        if (elements.get(registration.id) === registration.element)
          elements.delete(registration.id);
      };
    },
    entries: () =>
      [...elements].map(([id, element]) => ({ id, element }) satisfies HarnessHostRegistration),
  };
};

export interface HarnessContextValue {
  readonly harness: ApplicationHarness;
  readonly status: HarnessStatus;
  readonly error?: Error;
  readonly hosts: HarnessHostRegistry;
}

const HarnessContext = createContext<HarnessContextValue | undefined>(undefined);

/**
 * Creates one harness for each React effect lifetime. StrictMode's rehearsal
 * instance is disposed immediately and its replacement starts only after the
 * mounted children have registered their host elements.
 */
export function HarnessProvider({
  children,
  createHarness,
  failureFallback,
  fallback = null,
  onDisposeStart,
  onError,
}: {
  readonly children: ReactNode;
  readonly createHarness: (options: { readonly hosts: HarnessHostRegistry }) => ApplicationHarness;
  readonly failureFallback?: (options: { readonly error: Error; retry(): void }) => ReactNode;
  readonly fallback?: ReactNode;
  readonly onDisposeStart?: (options: {
    readonly harness: ApplicationHarness;
    readonly hosts: HarnessHostRegistry;
  }) => void;
  readonly onError?: (error: Error) => void;
}) {
  const [hosts] = useState(createHarnessHostRegistry);
  const [session, setSession] = useState<
    | {
        readonly harness: ApplicationHarness;
        readonly status: HarnessStatus;
        readonly error?: Error;
      }
    | undefined
  >(undefined);
  const [startupFailure, setStartupFailure] = useState<Error | undefined>(undefined);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const retry = useCallback(() => setRetryGeneration((value) => value + 1), []);

  useLayoutEffect(() => {
    let harness: ApplicationHarness;
    try {
      harness = createHarness({ hosts });
    } catch (reason) {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      setSession(undefined);
      setStartupFailure(error);
      onError?.(error);
      return;
    }
    let active = true;
    setStartupFailure(undefined);
    setSession({ harness, status: "starting" });
    // State set from a layout effect mounts children (and attaches their refs)
    // before this microtask starts components that consume the host registry.
    queueMicrotask(() => {
      if (!active) return;
      void harness.start().then(
        () => {
          if (active) setSession({ harness, status: "ready" });
        },
        (reason: unknown) => {
          if (!active) return;
          const error = reason instanceof Error ? reason : new Error(String(reason));
          setStartupFailure(error);
          onError?.(error);
        },
      );
    });
    return () => {
      active = false;
      // Invocation is deliberately synchronous during layout cleanup. The core
      // aborts routes/subscriptions before its first awaited component disposal.
      onDisposeStart?.({ harness, hosts });
      void harness.disposeAsync().catch((reason: unknown) => {
        onError?.(reason instanceof Error ? reason : new Error(String(reason)));
      });
    };
  }, [createHarness, hosts, onDisposeStart, onError, retryGeneration]);

  if (startupFailure !== undefined)
    return (
      failureFallback?.({ error: startupFailure, retry }) ??
      createElement(
        "section",
        { role: "alert" },
        createElement("h2", null, "Harness startup failed"),
        createElement("p", null, startupFailure.message),
        createElement("button", { onClick: retry, type: "button" }, "Retry harness startup"),
      )
    );
  if (session === undefined) return fallback;
  const value: HarnessContextValue = { ...session, hosts };
  return createElement(HarnessContext.Provider, { value }, children);
}

export function useHarness(): HarnessContextValue {
  const value = useContext(HarnessContext);
  if (value === undefined) throw new Error("Harness hooks must be used inside HarnessProvider.");
  return value;
}

/** Registers a visualizer host while its DOM element is connected. */
export function useHarnessHost(id: string): (element: HTMLElement | null) => void {
  const { hosts } = useHarness();
  const cleanup = useRef<(() => void) | undefined>(undefined);
  return useCallback(
    (element: HTMLElement | null) => {
      cleanup.current?.();
      cleanup.current = undefined;
      if (element !== null) cleanup.current = hosts.register({ id, element });
    },
    [hosts, id],
  );
}

/** Read-only observation of fabric messages. The adapter never exposes a subject. */
export function useHarnessMessages(
  onMessage: (message: HarnessMessage) => void,
  enabled = true,
): void {
  const { harness } = useHarness();
  useLayoutEffect(() => {
    if (!enabled) return;
    const subscription = harness.fabric.observe().subscribe(onMessage);
    return () => subscription.unsubscribe();
  }, [enabled, harness, onMessage]);
}

/** Observes the read-only component registry without introducing another store. */
export function useHarnessComponentChanges(
  onChange: (change: ComponentRegistryChange) => void,
  enabled = true,
): void {
  const { harness } = useHarness();
  useLayoutEffect(() => {
    if (!enabled) return;
    const subscription = harness.components.changes.subscribe(onChange);
    return () => subscription.unsubscribe();
  }, [enabled, harness, onChange]);
}
