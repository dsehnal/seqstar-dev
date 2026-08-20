import type {
  ApplicationHarness,
  ComponentInstanceSpec,
  ComponentRegistryChange,
  HarnessMessage,
} from "@seq-star/harness-core";

export type { ComponentInstanceSpec } from "@seq-star/harness-core";

import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
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
      if (!element.isConnected)
        throw new Error(`Harness host '${id}' is not connected to the document.`);
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
    // Read-only DOM telemetry makes an app-host lifecycle auditable without
    // adding a second state store or exposing a mutable harness handle.
    const telemetryRoot = document.documentElement;
    telemetryRoot.dataset.seqstarHarnessTelemetrySubscriptions = String(
      Number(telemetryRoot.dataset.seqstarHarnessTelemetrySubscriptions ?? "0") + 1,
    );
    telemetryRoot.dataset.seqstarHarnessMessageCount = "0";
    const telemetry = harness.fabric.observe().subscribe((message) => {
      telemetryRoot.dataset.seqstarHarnessMessageCount = String(
        Number(telemetryRoot.dataset.seqstarHarnessMessageCount ?? "0") + 1,
      );
      telemetryRoot.dataset.seqstarHarnessLastMessage = [
        message.type,
        message.source.component ?? message.source.plugin ?? "harness-core",
        message.target && "component" in message.target ? message.target.component : "broadcast",
      ].join(":");
    });
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
      telemetry.unsubscribe();
      telemetryRoot.dataset.seqstarHarnessTelemetrySubscriptions = String(
        Math.max(0, Number(telemetryRoot.dataset.seqstarHarnessTelemetrySubscriptions ?? "1") - 1),
      );
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

export type RendererMode = "reference" | "nightingale" | "compare";

/** JSON-safe, route-owned configuration for a renderer chooser. */
export interface RendererChooserDescriptor {
  readonly caseId: string;
  readonly modes: readonly RendererMode[];
  readonly initialMode: RendererMode;
}

export type RendererChooserState = "pending" | "ready" | "failed";

export interface RendererChooserRenderState {
  readonly mode: RendererMode;
  readonly requestedMode: RendererMode;
  /** Hosts for these component ids must remain connected during the current transaction. */
  readonly mountedComponentIds: readonly string[];
  readonly state: RendererChooserState;
  readonly error?: Error;
  selectMode(mode: RendererMode): void;
}

const isJsonTree = (value: unknown, seen = new Set<object>()): boolean => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return false;
  seen.add(value);
  let valid = true;
  for (const key of Reflect.ownKeys(value)) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== "string" ||
      property === undefined ||
      !("value" in property) ||
      !isJsonTree(property.value, seen)
    ) {
      valid = false;
      break;
    }
  }
  seen.delete(value);
  return valid;
};
const exactKeys = (value: object, keys: readonly string[]): boolean => {
  const actual = Reflect.ownKeys(value);
  return (
    actual.length === keys.length &&
    actual.every((key) => typeof key === "string" && keys.includes(key))
  );
};
const isRendererMode = (value: unknown): value is RendererMode =>
  value === "reference" || value === "nightingale" || value === "compare";
const isChooserDescriptor = (value: unknown): value is RendererChooserDescriptor => {
  if (
    !isJsonTree(value) ||
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !exactKeys(value, ["caseId", "modes", "initialMode"])
  )
    return false;
  const candidate = value as unknown as RendererChooserDescriptor;
  return (
    typeof candidate.caseId === "string" &&
    candidate.caseId.trim().length > 0 &&
    Array.isArray(candidate.modes) &&
    candidate.modes.length > 0 &&
    candidate.modes.every(isRendererMode) &&
    new Set(candidate.modes).size === candidate.modes.length &&
    isRendererMode(candidate.initialMode) &&
    candidate.modes.includes(candidate.initialMode) &&
    (!candidate.modes.includes("compare") || candidate.caseId === "renderer-portability")
  );
};
const isComponentSpec = (value: unknown): value is ComponentInstanceSpec => {
  if (
    !isJsonTree(value) ||
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![2, 3].includes(Reflect.ownKeys(value).length) ||
    !Reflect.ownKeys(value).every(
      (key) => typeof key === "string" && ["id", "type", "config"].includes(key),
    )
  )
    return false;
  const candidate = value as unknown as ComponentInstanceSpec;
  return (
    typeof candidate.id === "string" &&
    candidate.id.trim().length > 0 &&
    typeof candidate.type === "string" &&
    candidate.type.trim().length > 0 &&
    (candidate.config === undefined ||
      (candidate.config !== null &&
        !Array.isArray(candidate.config) &&
        Object.getPrototypeOf(candidate.config) === Object.prototype))
  );
};
const validModeComponents = (
  descriptor: RendererChooserDescriptor,
  components: Readonly<Partial<Record<RendererMode, readonly ComponentInstanceSpec[]>>>,
): boolean => {
  if (!isJsonTree(components) || Object.getPrototypeOf(components) !== Object.prototype)
    return false;
  const keys = Reflect.ownKeys(components).sort();
  const modes = [...descriptor.modes].sort();
  if (
    keys.length !== modes.length ||
    keys.some((key, index) => typeof key !== "string" || key !== modes[index])
  )
    return false;
  return descriptor.modes.every((mode) => {
    const entries = components[mode];
    if (entries === undefined || entries.length === 0) return false;
    const ids = new Set<string>();
    return entries.every(
      (item) => isComponentSpec(item) && !ids.has(item.id) && !!ids.add(item.id),
    );
  });
};

/** Throws before React owns any lifecycle state when chooser configuration is not plain JSON. */
export const validateRendererChooserConfiguration = (
  descriptor: unknown,
  components: unknown,
): void => {
  if (!isChooserDescriptor(descriptor))
    throw new Error("Renderer chooser descriptor must be exact, complete, and JSON-safe.");
  if (
    !validModeComponents(
      descriptor,
      components as Readonly<Partial<Record<RendererMode, readonly ComponentInstanceSpec[]>>>,
    )
  )
    throw new Error("Renderer chooser component modes must be exact, complete, and JSON-safe.");
};

const cloneImmutable = <Value>(value: Value): Value => {
  const copy = structuredClone(value);
  const freeze = (entry: unknown): void => {
    if (entry === null || typeof entry !== "object" || Object.isFrozen(entry)) return;
    for (const child of Object.values(entry)) freeze(child);
    Object.freeze(entry);
  };
  freeze(copy);
  return copy;
};

type CachedVisualizationRequest = {
  readonly message: HarnessMessage;
  readonly targetComponent: string;
  readonly requestId: string;
};

const visualizationRequest = (message: HarnessMessage): CachedVisualizationRequest | undefined => {
  if (
    message.type !== "visualization.seqviewspec.request" ||
    message.target === undefined ||
    !("component" in message.target)
  )
    return undefined;
  const payload = message.payload as { readonly requestId?: unknown };
  if (typeof payload.requestId !== "string") return undefined;
  return {
    message: cloneImmutable(message),
    targetComponent: message.target.component,
    requestId: payload.requestId,
  };
};

const lifecycle = (
  message: HarnessMessage,
):
  | {
      readonly componentId: string;
      readonly requestId: string;
      readonly status: "accepted" | "rendered" | "degraded" | "failed" | "superseded";
      readonly generation: number;
      readonly visibleRequestId?: string;
      readonly sourceComponent: string;
      readonly correlationId: string;
      readonly causationId?: string;
    }
  | undefined => {
  if (message.type !== "lifecycle.visualization") return undefined;
  const payload = message.payload as {
    readonly componentId?: unknown;
    readonly requestId?: unknown;
    readonly status?: unknown;
    readonly generation?: unknown;
    readonly visibleRequestId?: unknown;
  };
  if (
    typeof payload.componentId !== "string" ||
    typeof payload.requestId !== "string" ||
    !["accepted", "rendered", "degraded", "failed", "superseded"].includes(
      payload.status as string,
    ) ||
    typeof payload.generation !== "number" ||
    !Number.isSafeInteger(payload.generation) ||
    payload.generation < 1 ||
    (payload.visibleRequestId !== undefined && typeof payload.visibleRequestId !== "string") ||
    message.source.component === undefined
  )
    return undefined;
  return {
    componentId: payload.componentId,
    requestId: payload.requestId,
    status: payload.status as "accepted" | "rendered" | "degraded" | "failed" | "superseded",
    generation: payload.generation,
    ...(payload.visibleRequestId === undefined
      ? {}
      : { visibleRequestId: payload.visibleRequestId }),
    sourceComponent: message.source.component,
    correlationId: message.correlationId,
    ...(message.causationId === undefined ? {} : { causationId: message.causationId }),
  };
};

type VisibleRequest = {
  readonly messageId: string;
  readonly requestId: string;
  readonly generation: number;
};
type ActiveTransition = {
  readonly id: string;
  readonly from: RendererMode;
  readonly to: RendererMode;
  readonly expected: Map<string, string>;
};

/**
 * Keeps one harness (and its plugins) alive while replacing only renderer
 * components. It observes the plugin's successful request and replays that
 * detached immutable payload after the replacement is ready; React never
 * creates documents or native interaction events.
 */
export function RendererChooserHost({
  descriptor,
  modeComponents,
  children,
}: {
  readonly descriptor: RendererChooserDescriptor;
  readonly modeComponents: Readonly<
    Partial<Record<RendererMode, readonly ComponentInstanceSpec[]>>
  >;
  readonly children: (state: RendererChooserRenderState) => ReactNode;
}) {
  const { harness, status: harnessStatus } = useHarness();
  validateRendererChooserConfiguration(descriptor, modeComponents);
  const [mode, setMode] = useState<RendererMode>();
  const [requestedMode, setRequestedMode] = useState<RendererMode>(descriptor.initialMode);
  const [state, setState] = useState<RendererChooserState>("pending");
  const [error, setError] = useState<Error>();
  const pendingRequests = useRef(new Map<string, CachedVisualizationRequest>());
  const replayableVisible = useRef(new Map<string, CachedVisualizationRequest>());
  const accepted = useRef(new Map<string, VisibleRequest>());
  const visible = useRef(new Map<string, VisibleRequest>());
  const transition = useRef<ActiveTransition | undefined>(undefined);
  const [registryRevision, setRegistryRevision] = useState(0);
  const modes = useMemo(() => new Set(descriptor.modes), [descriptor.modes]);
  const componentIds = (candidate: RendererMode): readonly string[] =>
    (modeComponents[candidate] ?? []).map((item) => item.id);
  const isVisible = (candidate: RendererMode): boolean =>
    componentIds(candidate).every((id) => {
      const request = replayableVisible.current.get(id);
      const shown = visible.current.get(id);
      return request !== undefined && shown?.messageId === request.message.id;
    });

  useHarnessComponentChanges(useCallback(() => setRegistryRevision((value) => value + 1), []));

  useHarnessMessages(
    useCallback(
      (message) => {
        const request = visualizationRequest(message);
        if (request !== undefined) pendingRequests.current.set(request.targetComponent, request);
        const result = lifecycle(message);
        if (result === undefined) return;
        const pending = pendingRequests.current.get(result.componentId);
        if (
          pending === undefined ||
          result.sourceComponent !== result.componentId ||
          result.requestId !== pending.requestId ||
          result.correlationId !== pending.message.correlationId ||
          result.causationId !== pending.message.id
        )
          return;
        if (result.status === "accepted") {
          accepted.current.set(result.componentId, {
            messageId: pending.message.id,
            requestId: pending.requestId,
            generation: result.generation,
          });
          return;
        }
        const attribution = accepted.current.get(result.componentId);
        if (
          attribution?.messageId !== pending.message.id ||
          attribution.requestId !== result.requestId ||
          attribution.generation !== result.generation
        )
          return;
        const active = transition.current;
        const belongsToTransition = active?.expected.get(result.componentId) === pending.message.id;
        if (result.status === "rendered" || result.status === "degraded") {
          if (result.visibleRequestId !== result.requestId) return;
          const shown = {
            messageId: pending.message.id,
            requestId: result.requestId,
            generation: result.generation,
          };
          visible.current.set(result.componentId, shown);
          replayableVisible.current.set(result.componentId, pending);
          if (
            belongsToTransition &&
            active !== undefined &&
            [...active.expected].every(
              ([componentId, messageId]) =>
                visible.current.get(componentId)?.messageId === messageId,
            )
          ) {
            transition.current = undefined;
            setMode(active.to);
            setError(undefined);
            setState("ready");
          } else if (active === undefined && mode !== undefined && isVisible(mode)) {
            setState("ready");
          }
          return;
        }
        if (belongsToTransition && active !== undefined) {
          transition.current = undefined;
          setMode(active.to);
          setError(new Error(`Renderer request ${result.status}.`));
          setState("failed");
        } else if (
          active === undefined &&
          mode !== undefined &&
          componentIds(mode).includes(result.componentId)
        ) {
          setError(new Error(`Renderer request ${result.status}.`));
          setState("failed");
        }
      },
      [mode],
    ),
  );

  useEffect(() => {
    if (modes.has(descriptor.initialMode) && descriptor.initialMode !== requestedMode) {
      setRequestedMode(descriptor.initialMode);
      setState("pending");
    }
  }, [descriptor.initialMode, modes, requestedMode]);

  useEffect(() => {
    if (harnessStatus !== "ready" || mode !== undefined) return;
    const knownIds = new Set(descriptor.modes.flatMap((candidate) => componentIds(candidate)));
    const actual = [...knownIds]
      .map((id) => harness.components.get(id))
      .filter((item) => item !== undefined);
    const detected = descriptor.modes.find((candidate) => {
      const expected = modeComponents[candidate] ?? [];
      return (
        expected.length === actual.length &&
        expected.every((item) =>
          actual.some((record) => record.id === item.id && record.type === item.type),
        )
      );
    });
    if (detected === undefined) {
      setError(new Error("The mounted renderer components do not match a declared mode."));
      setState("failed");
      return;
    }
    setMode(detected);
    if (detected === requestedMode && isVisible(detected)) setState("ready");
  }, [harness, harnessStatus, mode, modeComponents, registryRevision, requestedMode]);

  useEffect(() => {
    if (
      harnessStatus === "ready" &&
      mode !== undefined &&
      requestedMode === mode &&
      transition.current === undefined &&
      isVisible(mode)
    )
      setState("ready");
  }, [harnessStatus, mode, requestedMode, registryRevision]);

  useEffect(() => {
    if (
      harnessStatus !== "ready" ||
      mode === undefined ||
      requestedMode === mode ||
      !isVisible(mode) ||
      transition.current !== undefined
    )
      return;
    const incoming = modeComponents[requestedMode] ?? [];
    const outgoingIds = componentIds(mode).filter((id) => !incoming.some((item) => item.id === id));
    const active: ActiveTransition = {
      id: crypto.randomUUID(),
      from: mode,
      to: requestedMode,
      expected: new Map(),
    };
    transition.current = active;
    setState("pending");
    setError(undefined);
    const run = async () => {
      // Let the render that requested the new mode attach every incoming host
      // ref before its fresh wrapper calls hosts.require during start().
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      await harness.replaceComponents(incoming, outgoingIds);
      if (transition.current !== active) return;
      const replay = incoming.map((item) => replayableVisible.current.get(item.id));
      if (replay.some((item) => item === undefined))
        throw new Error(
          `Renderer '${requestedMode}' has no captured SeqViewSpec request to replay.`,
        );
      for (const entry of replay) {
        if (entry === undefined) continue;
        visible.current.delete(entry.targetComponent);
        accepted.current.delete(entry.targetComponent);
        const envelope = {
          ...cloneImmutable(entry.message),
          id: crypto.randomUUID(),
          causationId: entry.message.id,
          target: { component: entry.targetComponent },
          timestamp: new Date().toISOString(),
        };
        pendingRequests.current.set(entry.targetComponent, {
          message: cloneImmutable(envelope),
          targetComponent: entry.targetComponent,
          requestId: entry.requestId,
        });
        active.expected.set(entry.targetComponent, envelope.id);
        harness.fabric.publish(envelope);
      }
    };
    void run().catch((reason: unknown) => {
      if (transition.current === active) {
        transition.current = undefined;
        const failure = reason instanceof Error ? reason : new Error(String(reason));
        setMode(active.to);
        setError(failure);
        setState("failed");
      }
    });
  }, [harness, harnessStatus, mode, requestedMode, modeComponents]);

  const selectMode = useCallback(
    (next: RendererMode) => {
      if (state === "pending" || !modes.has(next) || next === requestedMode) return;
      setRequestedMode(next);
      setState("pending");
    },
    [modes, requestedMode, state],
  );
  return children({
    mode: mode ?? requestedMode,
    requestedMode,
    mountedComponentIds: [
      ...new Set([
        ...(mode === undefined
          ? descriptor.modes.flatMap((candidate) => componentIds(candidate))
          : componentIds(mode)),
        ...(state === "pending" ? componentIds(requestedMode) : []),
      ]),
    ],
    state,
    ...(error === undefined ? {} : { error }),
    selectMode,
  });
}
