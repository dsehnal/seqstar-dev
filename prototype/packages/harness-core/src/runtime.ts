import type {
  CoordinateLocus,
  CoordinateSpace,
  CoordinateTranslator,
  MappingAssociation,
} from "@seq-star/seq-coords";
import { coordinateSpaceEquals, coordinateSpaceMatches } from "@seq-star/seq-coords";
import type { Diagnostic, JsonObject } from "@seq-star/seq-core";
import { diagnostic, isJsonSafeValue } from "@seq-star/seq-core";
import { Observable, Subject, Subscription } from "rxjs";
import { Type } from "typebox";
import {
  type ApplicationHarnessSpec,
  type Capability,
  type ComponentDescriptor,
  type ComponentFactory,
  type ComponentRegistryChange,
  type ComponentRegistryView,
  type Disposable,
  type EndpointRef,
  type EventFabric,
  type EventRoute,
  type EventRouteSpec,
  type HarnessComponent,
  type HarnessMessage,
  type HarnessPluginContext,
  type HarnessPolicies,
  InteractionClearCommandSchema,
  InteractionCommandSchema,
  type InteractionEvent,
  InteractionEventSchema,
  type InteractionSyncRule,
  isHarnessMessage,
  LifecycleResultSchema,
  type MessageFilter,
  type MessageProcessor,
  type MessageSchemaRegistry,
  type PayloadSchema,
  type PluginFactory,
  payloadSchema,
  type RoutePolicy,
  type TranslationPath,
  type TranslationRequest,
  type TranslationResult,
  type TranslatorRegistry,
  VisualizationRequestSchema,
} from "./index.js";

const version = "0.1.0" as const;
const maxTranslationExpansion = 256;
/** Prototype bound for one translator invocation; no public configuration is exposed yet. */
const translatorTimeoutMs = 10_000;
const disposable = (fn: () => void): Disposable => ({ dispose: fn });
const now = (): string => new Date().toISOString();
const newId = (): string => globalThis.crypto.randomUUID();
const sameEndpoint = (left: EndpointRef | undefined, right: EndpointRef | undefined): boolean =>
  left?.component === right?.component && left?.plugin === right?.plugin;

const runtimeDiagnostic = (code: string, message: string): Diagnostic =>
  diagnostic(code, message, "");
const invokeTranslator = async <Value>(
  invoke: (signal: AbortSignal) => Promise<Value>,
  parent: AbortSignal,
): Promise<Value> =>
  new Promise<Value>((resolve, reject) => {
    const controller = new AbortController();
    const onAbort = (): void => {
      controller.abort();
      settle(() => reject(new Error("aborted")));
    };
    const timer = setTimeout(() => {
      controller.abort();
      settle(() => reject(new Error("timeout")));
    }, translatorTimeoutMs);
    let settled = false;
    const settle = (action: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      parent.removeEventListener("abort", onAbort);
      action();
    };
    if (parent.aborted) onAbort();
    else parent.addEventListener("abort", onAbort, { once: true });
    void Promise.resolve()
      .then(() => invoke(controller.signal))
      .then(
        (value) => settle(() => resolve(value)),
        (error: unknown) => settle(() => reject(error)),
      );
  });

/** A per-instance, versioned schema registry.  Registrations never overwrite each other. */
export const createMessageSchemaRegistry = (): MessageSchemaRegistry => {
  const entries = new Map<string, PayloadSchema<unknown>>();
  return {
    register<Value>(type: string, schemaVersion: string, schema: PayloadSchema<Value>): Disposable {
      const key = `${type}\u0000${schemaVersion}`;
      if (entries.has(key))
        throw new Error(`Duplicate message schema '${type}' version '${schemaVersion}'.`);
      entries.set(key, schema as PayloadSchema<unknown>);
      return disposable(() => {
        if (entries.get(key) === schema) entries.delete(key);
      });
    },
    get(type: string, schemaVersion: string): PayloadSchema<unknown> | undefined {
      return entries.get(`${type}\u0000${schemaVersion}`);
    },
  };
};

export interface EventFabricOptions {
  readonly schemas?: MessageSchemaRegistry;
  readonly clock?: () => string;
  readonly id?: () => string;
}

/**
 * A small queue in front of RxJS is intentional: a publication made by a
 * subscriber is always delivered after messages already in flight.
 */
export const createEventFabric = (options: EventFabricOptions = {}): EventFabric & Disposable => {
  const schemas = options.schemas ?? createMessageSchemaRegistry();
  const listeners = new Map<(message: HarnessMessage) => void, () => void>();
  const queue: HarnessMessage[] = [];
  let pumping = false;
  let disposed = false;
  const id = options.id ?? newId;
  const clock = options.clock ?? now;
  const emitDiagnostic = (code: string, message: string, parent?: HarnessMessage): void => {
    const diagnosticId = id();
    const diagnosticMessage: HarnessMessage<
      "harness.diagnostic",
      { diagnostics: readonly Diagnostic[] }
    > = {
      id: diagnosticId,
      type: "harness.diagnostic",
      version,
      source: { plugin: "harness-core" },
      correlationId: parent?.correlationId ?? diagnosticId,
      ...(parent === undefined ? {} : { causationId: parent.id }),
      timestamp: clock(),
      payload: { diagnostics: [runtimeDiagnostic(code, message)] },
    };
    queue.push(diagnosticMessage as unknown as HarnessMessage);
  };
  const valid = (message: unknown): message is HarnessMessage => {
    if (!isHarnessMessage(message)) return false;
    const schema = schemas.get(message.type, message.version);
    return schema?.check(message.payload) ?? false;
  };
  const publish = <T extends HarnessMessage>(message: T): void => {
    if (disposed) return;
    if (!valid(message)) {
      emitDiagnostic("harness.message.invalid", "Rejected malformed message envelope or payload.");
    } else queue.push(message);
    if (pumping) return;
    pumping = true;
    while (queue.length > 0 && !disposed) {
      const next = queue.shift();
      if (next === undefined) continue;
      try {
        for (const listener of listeners.keys()) listener(next);
      } catch {
        emitDiagnostic("harness.consumer.failure", "A message consumer failed.", next);
      }
    }
    pumping = false;
  };
  const stream = <Value>(
    accept: (message: HarnessMessage) => Value | undefined,
  ): Observable<Value> => {
    const observable = new Observable<Value>();
    const subscribe = ((observerOrNext?: unknown, _error?: unknown, complete?: () => void) => {
      const observer =
        typeof observerOrNext === "function"
          ? { next: observerOrNext as (value: Value) => void, complete }
          : (observerOrNext as
              | { next?: (value: Value) => void; complete?: () => void }
              | undefined);
      const listener = (message: HarnessMessage): void => {
        const value = accept(message);
        if (value === undefined) return;
        try {
          observer?.next?.(value);
        } catch {
          listeners.delete(listener);
          emitDiagnostic("harness.consumer.failure", "A message consumer failed.", message);
        }
      };
      listeners.set(listener, () => {
        try {
          observer?.complete?.();
        } catch {
          // Completion must not turn disposal into a global observable error.
        }
      });
      return new Subscription(() => listeners.delete(listener));
    }) as unknown as Observable<Value>["subscribe"];
    Object.defineProperty(observable, "subscribe", { value: subscribe });
    return observable;
  };
  return {
    publish,
    messages<TPayload>(
      type: string,
      schema: PayloadSchema<TPayload>,
    ): Observable<HarnessMessage<string, TPayload>> {
      return stream((message) =>
        message.type === type && schema.check(message.payload)
          ? (message as HarnessMessage<string, TPayload>)
          : undefined,
      );
    },
    observe(filter?: MessageFilter): Observable<HarnessMessage> {
      return stream((message) => {
        const matches =
          (filter?.types === undefined || filter.types.includes(message.type)) &&
          (filter?.source === undefined || sameEndpoint(filter.source, message.source)) &&
          (filter?.targetComponent === undefined ||
            (message.target !== undefined &&
              "component" in message.target &&
              message.target.component === filter.targetComponent)) &&
          (filter?.correlationId === undefined || message.correlationId === filter.correlationId);
        return matches ? message : undefined;
      });
    },
    dispose(): void {
      if (!disposed) {
        disposed = true;
        queue.length = 0;
        for (const complete of listeners.values()) complete();
        listeners.clear();
      }
    },
  };
};

export const installCoreMessageSchemas = (schemas: MessageSchemaRegistry): Disposable[] => [
  schemas.register(
    "visualization.seqviewspec.request",
    version,
    payloadSchema(VisualizationRequestSchema),
  ),
  schemas.register("visualization.mvs.request", version, payloadSchema(VisualizationRequestSchema)),
  schemas.register("interaction.native", version, payloadSchema(InteractionEventSchema)),
  schemas.register("interaction.highlight.apply", version, payloadSchema(InteractionCommandSchema)),
  schemas.register(
    "interaction.highlight.clear",
    version,
    payloadSchema(InteractionClearCommandSchema),
  ),
  schemas.register("interaction.selection.apply", version, payloadSchema(InteractionCommandSchema)),
  schemas.register(
    "interaction.selection.clear",
    version,
    payloadSchema(InteractionClearCommandSchema),
  ),
  schemas.register("interaction.focus.apply", version, payloadSchema(InteractionCommandSchema)),
  schemas.register(
    "interaction.focus.clear",
    version,
    payloadSchema(InteractionClearCommandSchema),
  ),
  schemas.register("lifecycle.visualization", version, payloadSchema(LifecycleResultSchema)),
  schemas.register(
    "harness.diagnostic",
    version,
    payloadSchema(Type.Object({ diagnostics: Type.Array(Type.Any()) })),
  ),
];

const pathKey = (path: readonly CoordinateTranslator[]): string =>
  path.map((item) => item.id).join("\u0000");
const patternsConnect = (
  output: CoordinateTranslator["target"],
  input: CoordinateTranslator["source"],
): boolean =>
  (output.id === undefined || input.id === undefined || output.id === input.id) &&
  output.kind === input.kind &&
  (output.authority === undefined ||
    input.authority === undefined ||
    output.authority === input.authority) &&
  [...new Set([...Object.keys(output.context ?? {}), ...Object.keys(input.context ?? {})])].every(
    (key) => {
      const value = output.context?.[key];
      const next = input.context?.[key];
      return (
        value !== undefined &&
        next !== undefined &&
        (value === "*" || next === "*" || value === next)
      );
    },
  );
const comparePath =
  (preferred: readonly string[]) =>
  (left: readonly CoordinateTranslator[], right: readonly CoordinateTranslator[]): number => {
    const rank = (path: readonly CoordinateTranslator[]): number =>
      path.reduce((sum, item, index) => sum + (preferred[index] === item.id ? 0 : 1), 0);
    const cost = (path: readonly CoordinateTranslator[]): number =>
      path.reduce((sum, item) => sum + (item.cost ?? 1), 0);
    return (
      rank(left) - rank(right) ||
      cost(left) - cost(right) ||
      left.length - right.length ||
      pathKey(left).localeCompare(pathKey(right))
    );
  };

export const createTranslatorRegistry = (): TranslatorRegistry => {
  const translators = new Map<string, CoordinateTranslator>();
  const pathsFor = (
    source: CoordinateSpace,
    target: CoordinateSpace,
    maxSteps = 4,
  ): CoordinateTranslator[][] => {
    const all = [...translators.values()];
    const result: CoordinateTranslator[][] = [];
    const walk = (path: CoordinateTranslator[]): void => {
      if (path.length >= maxSteps) return;
      for (const candidate of all) {
        if (
          path.some((item) => item.id === candidate.id) ||
          (path.length === 0
            ? !coordinateSpaceMatches(candidate.source, source)
            : !patternsConnect(path[path.length - 1]?.target ?? candidate.target, candidate.source))
        )
          continue;
        const next = [...path, candidate];
        if (coordinateSpaceMatches(candidate.target, target)) result.push(next);
        else walk(next);
      }
    };
    walk([]);
    return result;
  };
  const mapOne = async (
    source: CoordinateLocus,
    target: CoordinateSpace,
    policy: TranslationRequest["policy"],
    signal: AbortSignal,
  ): Promise<{ associations: MappingAssociation[]; path: string[]; diagnostics: Diagnostic[] }> => {
    if (coordinateSpaceEquals(source.space, target))
      return {
        associations: [{ source, targets: [source], status: "exact" }],
        path: [],
        diagnostics: [],
      };
    const paths = pathsFor(source.space, target, policy?.maxSteps ?? 4).sort(
      comparePath(policy?.preferredTranslatorIds ?? []),
    );
    const selected = paths[0];
    if (selected === undefined)
      return {
        associations: [{ source, targets: [], status: "unmapped" }],
        path: [],
        diagnostics: [
          runtimeDiagnostic("harness.translation.unmapped", "No translation path exists."),
        ],
      };
    let current: CoordinateLocus[] = [source];
    let partial = false;
    const diagnostics: Diagnostic[] = [];
    for (const [step, translator] of selected.entries()) {
      if (signal.aborted)
        return {
          associations: [{ source, targets: [], status: "unmapped" }],
          path: selected.map((item) => item.id),
          diagnostics: [runtimeDiagnostic("harness.translation.aborted", "Translation aborted.")],
        };
      const next: CoordinateLocus[] = [];
      const immediateTarget = step === selected.length - 1 ? target : undefined;
      for (const locus of current) {
        try {
          const mapped = await invokeTranslator(
            (translatorSignal) =>
              translator.map(
                immediateTarget === undefined
                  ? { loci: [locus] }
                  : { loci: [locus], target: immediateTarget },
                translatorSignal,
              ),
            signal,
          );
          diagnostics.push(...mapped.diagnostics);
          const result = mapped.associations[0];
          if (result === undefined || result.status === "partial" || result.status === "unmapped")
            partial = true;
          const nextPattern = selected[step + 1]?.source;
          const validTargets = (result?.targets ?? []).filter(
            (output) =>
              nextPattern === undefined || coordinateSpaceMatches(nextPattern, output.space),
          );
          if (validTargets.length !== (result?.targets.length ?? 0)) {
            partial = true;
            diagnostics.push(
              runtimeDiagnostic(
                "harness.translation.intermediate",
                `Translator '${translator.id}' returned a space incompatible with the next hop.`,
              ),
            );
          }
          next.push(...validTargets);
        } catch (error) {
          partial = true;
          diagnostics.push(
            runtimeDiagnostic(
              error instanceof Error && error.message === "timeout"
                ? "harness.translation.timeout"
                : "harness.translation.failure",
              error instanceof Error && error.message === "timeout"
                ? `Translator '${translator.id}' timed out.`
                : `Translator '${translator.id}' failed.`,
            ),
          );
        }
      }
      if (next.length > maxTranslationExpansion) {
        partial = true;
        diagnostics.push(
          runtimeDiagnostic("harness.translation.cap", "Translation expansion was capped."),
        );
      }
      current = next.slice(0, maxTranslationExpansion);
    }
    const targets = current.slice(0, maxTranslationExpansion);
    if (current.length > maxTranslationExpansion)
      diagnostics.push(
        runtimeDiagnostic("harness.translation.cap", "Translation expansion was capped."),
      );
    return {
      associations: [
        {
          source,
          targets,
          status:
            targets.length === 0
              ? "unmapped"
              : partial
                ? "partial"
                : targets.length === 1
                  ? "exact"
                  : "ambiguous",
        },
      ],
      path: selected.map((item) => item.id),
      diagnostics,
    };
  };
  return {
    register(translator: CoordinateTranslator): Disposable {
      if (translators.has(translator.id))
        throw new Error(`Duplicate translator '${translator.id}'.`);
      translators.set(translator.id, translator);
      return disposable(() => {
        if (translators.get(translator.id) === translator) translators.delete(translator.id);
      });
    },
    findPaths(source: CoordinateSpace, target: CoordinateSpace): readonly TranslationPath[] {
      if (coordinateSpaceEquals(source, target)) return [{ translatorIds: [], cost: 0 }];
      return pathsFor(source, target)
        .sort(comparePath([]))
        .map((path) => ({
          translatorIds: path.map((item) => item.id),
          cost: path.reduce((sum, item) => sum + (item.cost ?? 1), 0),
        }));
    },
    async map(request: TranslationRequest, signal?: AbortSignal): Promise<TranslationResult> {
      const active = signal ?? new AbortController().signal;
      const outcomes = await Promise.all(
        request.loci.map((locus) => mapOne(locus, request.target, request.policy, active)),
      );
      return {
        translatorIds: [...new Set(outcomes.flatMap((item) => item.path))],
        associations: outcomes.flatMap((item) => item.associations),
        diagnostics: outcomes.flatMap((item) => item.diagnostics),
        paths: outcomes.map((item, sourceIndex) => ({ sourceIndex, translatorIds: item.path })),
      };
    },
  };
};

class Registry implements ComponentRegistryView {
  readonly changesSubject = new Subject<ComponentRegistryChange>();
  readonly changes = this.changesSubject.asObservable();
  readonly records = new Map<string, ComponentDescriptor>();
  get(id: string): Readonly<ComponentDescriptor> | undefined {
    return this.records.get(id);
  }
  findByCapability(capability: Capability): readonly Readonly<ComponentDescriptor>[] {
    return [...this.records.values()].filter(
      (item) => item.status === "ready" && item.capabilities.includes(capability),
    );
  }
  set(component: ComponentDescriptor, kind: ComponentRegistryChange["kind"]): void {
    this.records.set(component.id, component);
    this.changesSubject.next({ kind, component });
  }
  remove(id: string): void {
    const component = this.records.get(id);
    if (component !== undefined) {
      this.records.delete(id);
      this.changesSubject.next({
        kind: "removed",
        component: { ...component, status: "disposed" },
      });
    }
  }
  complete(): void {
    this.changesSubject.complete();
  }
}

export interface ApplicationHarness extends Disposable {
  readonly fabric: EventFabric;
  readonly translators: TranslatorRegistry;
  readonly components: ComponentRegistryView;
  readonly policies: Readonly<Required<HarnessPolicies>>;
  start(): Promise<void>;
  disposeAsync(): Promise<void>;
}
export interface ApplicationHarnessHost {
  readonly componentFactories: readonly ComponentFactory[];
  readonly pluginFactories?: readonly PluginFactory[];
  readonly frame?: (callback: () => void) => Disposable;
}

const serializableSpec = (spec: ApplicationHarnessSpec): boolean => isJsonSafeValue(spec);
const matchesFrom = (message: HarnessMessage, from: EventRouteSpec["from"]): boolean =>
  from === undefined || sameEndpoint(message.source, from);
const defaultPolicy = (message: HarnessMessage): RoutePolicy =>
  message.type.startsWith("visualization.")
    ? "latest"
    : message.type === "interaction.native"
      ? (message.payload as Partial<InteractionEvent>).interaction === "hover"
        ? "animation-frame-latest"
        : "ordered"
      : "all";
const commandFamily = (interaction: string): "highlight" | "selection" | "focus" =>
  interaction === "hover" ? "highlight" : interaction === "select" ? "selection" : "focus";
const coordinateSpaceKey = (space: CoordinateSpace): string =>
  JSON.stringify({
    id: space.id,
    kind: space.kind,
    ...(space.authority === undefined ? {} : { authority: space.authority }),
    ...(space.context === undefined
      ? {}
      : {
          context: Object.fromEntries(
            Object.entries(space.context).sort(([left], [right]) => left.localeCompare(right)),
          ),
        }),
  });

export const createApplicationHarness = (
  spec: ApplicationHarnessSpec,
  host: ApplicationHarnessHost,
): ApplicationHarness => {
  if (!serializableSpec(spec)) throw new Error("ApplicationHarnessSpec must be JSON-safe.");
  const schemas = createMessageSchemaRegistry();
  const coreSchemas = installCoreMessageSchemas(schemas);
  const fabric = createEventFabric({ schemas });
  const translators = createTranslatorRegistry();
  const registry = new Registry();
  const componentFactories = new Map(
    host.componentFactories.map((factory) => [factory.type, factory]),
  );
  const pluginFactories = new Map(
    (host.pluginFactories ?? []).map((factory) => [factory.plugin, factory]),
  );
  const components = new Map<string, { instance: HarnessComponent; abort: AbortController }>();
  const pendingVisualization = new Map<string, HarnessMessage>();
  const cleanups: Disposable[] = [];
  const processors = new Map<string, { processor: MessageProcessor; abort: AbortController }>();
  const synchronizationControllers = new Map<string, AbortController>();
  const hoverSynchronizationLeases = new Map<
    string,
    {
      readonly interactionId: string;
      readonly owner: { readonly correlationId: string; readonly sourceComponent: string };
    }
  >();
  const reflections = new Set<string>();
  const policies = {
    partialRendering: spec.policies?.partialRendering ?? "reject",
    unhandledMessage: spec.policies?.unhandledMessage ?? "diagnostic",
    processorFailure: spec.policies?.processorFailure ?? "diagnostic",
  };
  let started = false;
  let disposed = false;
  let disposePromise: Promise<void> | undefined;
  let synchronizationGeneration = 0;
  const context: HarnessPluginContext = {
    fabric,
    translators,
    components: registry,
    messageSchemas: schemas,
    addProcessor(processor) {
      if (processors.has(processor.id)) throw new Error(`Duplicate processor '${processor.id}'.`);
      const entry = { processor, abort: new AbortController() };
      processors.set(processor.id, entry);
      return disposable(() => {
        entry.abort.abort();
        processors.delete(processor.id);
      });
    },
    addRoute(route) {
      return addRoute(route);
    },
  };
  const diagnosis = (message: string, parent?: HarnessMessage<string, unknown>): void => {
    const diagnosticId = newId();
    fabric.publish({
      id: diagnosticId,
      type: "harness.diagnostic",
      version,
      source: { plugin: "harness-core" },
      correlationId: parent?.correlationId ?? diagnosticId,
      ...(parent === undefined ? {} : { causationId: parent.id }),
      timestamp: now(),
      payload: {
        diagnostics: [runtimeDiagnostic("harness.runtime", message)],
      } as unknown as JsonObject,
    });
  };
  const deliver = (message: HarnessMessage, target: EventRouteSpec["to"]): void => {
    const targets =
      "component" in target
        ? [registry.get(target.component)].filter(
            (value): value is ComponentDescriptor => value !== undefined,
          )
        : "capability" in target
          ? [...registry.records.values()].filter((item) =>
              item.capabilities.includes(target.capability),
            )
          : "broadcast" in target
            ? [...registry.records.values()].filter((item) => item.status === "ready")
            : [];
    if ("plugin" in target) {
      fabric.publish({ ...message, id: newId(), causationId: message.id, target });
      return;
    }
    for (const component of targets) {
      if (component.status !== "ready") {
        if (message.type.startsWith("visualization."))
          pendingVisualization.set(component.id, message);
        continue;
      }
      fabric.publish({
        ...message,
        id: newId(),
        causationId: message.id,
        target: { component: component.id },
      });
    }
  };
  const addRoute = (route: EventRoute): Disposable => {
    let pending: HarnessMessage | undefined;
    let frame: Disposable | undefined;
    const latest = new Map<string, HarnessMessage>();
    const subscription = fabric.observe().subscribe((message) => {
      if (
        message.type !== route.type ||
        message.target !== undefined ||
        !matchesFrom(message, route.from)
      )
        return;
      const policy = route.policy ?? defaultPolicy(message);
      if (policy === "animation-frame-latest") {
        pending = message;
        frame ??= (
          host.frame ??
          ((callback) => {
            const handle = setTimeout(callback, 0);
            return disposable(() => clearTimeout(handle));
          })
        )(() => {
          frame = undefined;
          const next = pending;
          pending = undefined;
          if (next !== undefined) deliver(next, route.to);
        });
      } else if (policy === "latest") {
        const key = JSON.stringify(route.to);
        latest.set(key, message);
        queueMicrotask(() => {
          const next = latest.get(key);
          if (next === message) {
            latest.delete(key);
            deliver(next, route.to);
          }
        });
      } else deliver(message, route.to);
    });
    return disposable(() => {
      subscription.unsubscribe();
      frame?.dispose();
    });
  };
  const scopedPluginContext = (owned: Disposable[]): HarnessPluginContext => ({
    ...context,
    translators: {
      register(translator) {
        const registration = translators.register(translator);
        owned.push(registration);
        return registration;
      },
      findPaths: translators.findPaths,
      map: translators.map,
    },
    messageSchemas: {
      register<Value>(
        type: string,
        schemaVersion: string,
        schema: PayloadSchema<Value>,
      ): Disposable {
        const registration = schemas.register(type, schemaVersion, schema);
        owned.push(registration);
        return registration;
      },
      get: schemas.get,
    },
    addProcessor(processor) {
      const registration = context.addProcessor(processor);
      owned.push(registration);
      return registration;
    },
    addRoute(route) {
      const registration = addRoute(route);
      owned.push(registration);
      return registration;
    },
  });
  const setupSync = (rule: InteractionSyncRule): Disposable => {
    const subscription = fabric
      .messages("interaction.native", payloadSchema<InteractionEvent>(InteractionEventSchema))
      .subscribe({
        next(message) {
          const event = message.payload;
          if (
            event.interaction !== rule.interaction ||
            !rule.between.includes(event.origin.componentId) ||
            (rule.direction === "forward" && event.origin.componentId !== rule.between[0])
          )
            return;
          const candidates =
            rule.direction === "forward"
              ? rule.between.slice(1)
              : rule.between.filter((id) => id !== event.origin.componentId);
          for (const destination of candidates) {
            // Correlation IDs intentionally remain stable for the lifetime of a native hover
            // lease. Individual moves still need to supersede one another, so reflection
            // retirement is scoped to the concrete native message rather than its correlation.
            const reflection = `${message.id}\u0000${rule.id}\u0000${destination}`;
            if (reflections.has(reflection)) continue;
            reflections.add(reflection);
            const component = registry.get(destination);
            if (component === undefined || component.status !== "ready") {
              reflections.delete(reflection);
              continue;
            }
            const incomingOwner = {
              correlationId: message.correlationId,
              sourceComponent: event.origin.componentId,
            };
            const key = `${rule.id}\u0000${event.origin.componentId}\u0000${destination}`;
            const existingHoverLease = hoverSynchronizationLeases.get(key);
            const hoverLease = existingHoverLease ?? {
              interactionId: event.interactionId,
              owner: incomingOwner,
            };
            const owner = event.interaction === "hover" ? hoverLease.owner : incomingOwner;
            const interactionId =
              event.interaction === "hover" ? hoverLease.interactionId : event.interactionId;
            // A hover's lease is one destination-wide union.  Its controller deliberately
            // covers every per-locus mapping group, so a replacement or clear cannot let a
            // slower group publish a stale fragment after a newer hover has been applied.
            const controllerKey =
              event.interaction === "hover" ? key : `${key}\u0000${++synchronizationGeneration}`;
            if (event.interaction === "hover") {
              synchronizationControllers.get(controllerKey)?.abort();
              if (event.phase === "set") {
                synchronizationControllers.set(controllerKey, new AbortController());
                hoverSynchronizationLeases.set(key, hoverLease);
              } else synchronizationControllers.delete(controllerKey);
            } else if (event.phase === "set")
              synchronizationControllers.set(controllerKey, new AbortController());
            const signal = synchronizationControllers.get(controllerKey)?.signal;
            if (event.phase === "clear") {
              if (event.interaction === "hover") hoverSynchronizationLeases.delete(key);
              fabric.publish({
                ...message,
                id: newId(),
                causationId: message.id,
                target: { component: destination },
                type: `interaction.${commandFamily(event.interaction)}.clear`,
                payload: { interactionId, owner },
              });
              reflections.delete(reflection);
              continue;
            }
            type MappingGroup = {
              readonly target: CoordinateSpace;
              readonly path: readonly string[];
              readonly entries: readonly {
                readonly sourceIndex: number;
                readonly locus: CoordinateLocus;
              }[];
            };
            const groups = new Map<string, MappingGroup>();
            for (const [sourceIndex, locus] of event.loci.entries()) {
              const candidates = component.coordinateSpaces
                .map((target) => ({
                  target,
                  paths: coordinateSpaceEquals(locus.space, target)
                    ? ([[]] as readonly (readonly string[])[])
                    : translators.findPaths(locus.space, target).map((path) => path.translatorIds),
                }))
                .filter((candidate) => candidate.paths.length > 0);
              if (candidates.length !== 1) {
                diagnosis(
                  candidates.length === 0
                    ? `Synchronization '${rule.id}' locus ${sourceIndex} is unmapped for '${destination}' (harness.translation.unmapped).`
                    : `Synchronization '${rule.id}' locus ${sourceIndex} has ambiguous destination spaces for '${destination}' (harness.translation.ambiguous).`,
                  message,
                );
                continue;
              }
              const candidate = candidates[0];
              if (candidate === undefined) continue;
              // Registry path ordering is deterministic.  Retain the selected path in the
              // group key and request policy so unlike routes cannot be conflated.
              const path = candidate.paths[0] ?? [];
              const groupKey = `${coordinateSpaceKey(candidate.target)}\u0000${path.join("\u0000")}`;
              const existing = groups.get(groupKey);
              groups.set(groupKey, {
                target: candidate.target,
                path,
                entries: [...(existing?.entries ?? []), { sourceIndex, locus }],
              });
            }
            const unmappedPolicy =
              rule.unmapped ?? (event.interaction === "hover" ? "clear" : "preserve");
            // There is no asynchronous group to retire the reflection key in this
            // case.  Do it before returning so an immediately retried selection
            // after a space-capability update is not mistaken for a feedback loop.
            if (groups.size === 0) {
              if (unmappedPolicy === "clear") {
                if (event.interaction === "hover") hoverSynchronizationLeases.delete(key);
                fabric.publish({
                  ...message,
                  id: newId(),
                  causationId: message.id,
                  target: { component: destination },
                  type: `interaction.${commandFamily(event.interaction)}.clear`,
                  payload: { interactionId, owner },
                });
              }
              synchronizationControllers.delete(controllerKey);
              reflections.delete(reflection);
              continue;
            }
            void Promise.all(
              [...groups.values()].map(async (group) => ({
                group,
                mapped: await translators.map(
                  {
                    loci: group.entries.map((entry) => entry.locus),
                    target: group.target,
                    policy: { preferredTranslatorIds: [...group.path] },
                  },
                  signal,
                ),
              })),
            )
              .then((results) => {
                if (signal?.aborted || disposed) return;
                const mapped = results.flatMap(({ mapped }) => mapped.associations);
                const paths = results.flatMap(({ mapped }) => mapped.paths);
                if (paths.length > 0)
                  diagnosis(
                    `Synchronization '${rule.id}' used ${paths.map((path) => path.translatorIds.join(" -> ") || "identity").join(", ")}.`,
                    message,
                  );
                for (const { group, mapped: result } of results) {
                  for (const entry of result.diagnostics)
                    diagnosis(
                      `Synchronization '${rule.id}': ${entry.code}: ${entry.message}`,
                      message,
                    );
                  for (const [associationIndex, association] of result.associations.entries())
                    if (association.status !== "exact")
                      diagnosis(
                        `Synchronization '${rule.id}' locus ${group.entries[associationIndex]?.sourceIndex ?? associationIndex} mapped as ${association.status} (harness.translation.${association.status}).`,
                        message,
                      );
                }
                const loci = mapped.flatMap((item) => item.targets);
                if (loci.length === 0 && unmappedPolicy === "clear") {
                  if (event.interaction === "hover") hoverSynchronizationLeases.delete(key);
                  fabric.publish({
                    ...message,
                    id: newId(),
                    causationId: message.id,
                    target: { component: destination },
                    type: `interaction.${commandFamily(event.interaction)}.clear`,
                    payload: { interactionId, owner },
                  });
                  return;
                }
                if (loci.length > 0)
                  fabric.publish({
                    ...message,
                    id: newId(),
                    causationId: message.id,
                    target: { component: destination },
                    type: `interaction.${commandFamily(event.interaction)}.apply`,
                    payload: {
                      interactionId,
                      owner,
                      mode: event.mode ?? "replace",
                      loci,
                      ...(event.semanticTarget === undefined
                        ? {}
                        : { semanticTarget: event.semanticTarget }),
                    } as unknown as JsonObject,
                  });
              })
              .catch(() => {
                if (signal?.aborted || disposed) return;
                diagnosis(`Synchronization '${rule.id}' failed.`, message);
                if (event.interaction === "hover" && unmappedPolicy === "clear") {
                  hoverSynchronizationLeases.delete(key);
                  fabric.publish({
                    ...message,
                    id: newId(),
                    causationId: message.id,
                    target: { component: destination },
                    type: "interaction.highlight.clear",
                    payload: { interactionId, owner },
                  });
                }
              })
              .finally(() => {
                if (synchronizationControllers.get(controllerKey)?.signal === signal)
                  synchronizationControllers.delete(controllerKey);
                reflections.delete(reflection);
              });
          }
        },
      });
    return disposable(() => subscription.unsubscribe());
  };
  const disposeAsync = (): Promise<void> => {
    if (disposePromise !== undefined) return disposePromise;
    disposed = true;
    disposePromise = (async () => {
      const failures: unknown[] = [];
      for (const entry of processors.values()) entry.abort.abort();
      for (const controller of synchronizationControllers.values()) controller.abort();
      hoverSynchronizationLeases.clear();
      for (const cleanup of cleanups.splice(0).reverse()) {
        try {
          cleanup.dispose();
        } catch (error) {
          failures.push(error);
        }
      }
      for (const component of [...components.values()].reverse()) {
        component.abort.abort();
        try {
          await component.instance.dispose();
        } catch (error) {
          failures.push(error);
        }
        registry.remove(component.instance.id);
      }
      components.clear();
      for (const registration of coreSchemas) registration.dispose();
      registry.complete();
      fabric.dispose();
      if (failures.length > 0) throw new AggregateError(failures, "Harness teardown failed.");
    })();
    return disposePromise;
  };
  const dispose = (): void => {
    void disposeAsync();
  };
  return {
    fabric,
    translators,
    components: registry,
    policies,
    async start(): Promise<void> {
      if (started) return;
      started = true;
      try {
        const componentIds = new Set(spec.components.map((item) => item.id));
        if (componentIds.size !== spec.components.length)
          throw new Error("Duplicate component instance ID.");
        const pluginIds = new Set((spec.plugins ?? []).map((item) => item.id));
        if (pluginIds.size !== (spec.plugins ?? []).length)
          throw new Error("Duplicate plugin instance ID.");
        for (const item of spec.components)
          if (!componentFactories.has(item.type))
            throw new Error(`Unknown component factory '${item.type}'.`);
        for (const route of spec.routes ?? []) {
          if ("component" in route.to && !componentIds.has(route.to.component))
            throw new Error(
              `Route '${route.id}' targets unknown component '${route.to.component}'.`,
            );
          if ("plugin" in route.to && !pluginIds.has(route.to.plugin))
            throw new Error(`Route '${route.id}' targets unknown plugin '${route.to.plugin}'.`);
        }
        for (const route of spec.routes ?? []) cleanups.push(addRoute(route));
        const seen = new Set<string>();
        for (const item of spec.components) {
          if (seen.has(item.id)) throw new Error(`Duplicate component instance '${item.id}'.`);
          seen.add(item.id);
          const factory = componentFactories.get(item.type);
          if (factory === undefined) throw new Error(`Unknown component factory '${item.type}'.`);
          const instance = factory.create({
            id: item.id,
            ...(item.config === undefined ? {} : { config: item.config }),
          });
          const abort = new AbortController();
          components.set(item.id, { instance, abort });
          let descriptor: ComponentDescriptor = {
            id: item.id,
            type: item.type,
            capabilities: [...instance.capabilities],
            coordinateSpaces: [],
            status: "registered",
          };
          registry.set(descriptor, "registered");
          descriptor = { ...descriptor, status: "starting" };
          registry.set(descriptor, "updated");
          await instance.start({
            fabric,
            translators,
            signal: abort.signal,
            reportCapabilities: (capabilities) => {
              descriptor = { ...descriptor, capabilities: [...capabilities] };
              registry.set(descriptor, "updated");
            },
            reportCoordinateSpaces: (coordinateSpaces) => {
              descriptor = { ...descriptor, coordinateSpaces: [...coordinateSpaces] };
              registry.set(descriptor, "updated");
            },
          });
          descriptor = { ...descriptor, status: "ready" };
          registry.set(descriptor, "ready");
          const pending = pendingVisualization.get(item.id);
          if (pending !== undefined) {
            pendingVisualization.delete(item.id);
            fabric.publish({
              ...pending,
              id: newId(),
              causationId: pending.id,
              target: { component: item.id },
            });
          }
        }
        for (const rule of spec.synchronization ?? []) cleanups.push(setupSync(rule));
        const processorSubscription = fabric.observe().subscribe((message) => {
          for (const entry of processors.values())
            if (entry.processor.types.includes(message.type))
              void Promise.resolve()
                .then(() => entry.processor.process(message, context, entry.abort.signal))
                .catch(() => {
                  diagnosis(`Processor '${entry.processor.id}' failed.`, message);
                  if (policies.processorFailure === "stop-harness") void disposeAsync();
                });
        });
        cleanups.push(disposable(() => processorSubscription.unsubscribe()));
        const pendingPlugins = (spec.plugins ?? []).map((item) => {
          const factory = pluginFactories.get(item.plugin);
          if (factory === undefined) throw new Error(`Unknown plugin factory '${item.plugin}'.`);
          return { item, plugin: factory.create(item.config ?? ({} as JsonObject)) };
        });
        const installedCapabilities = new Set(
          [...registry.records.values()].flatMap((component) => component.capabilities),
        );
        const installedIds = new Set<string>();
        while (pendingPlugins.length > 0) {
          const index = pendingPlugins.findIndex(
            ({ item, plugin }) =>
              !installedIds.has(item.id) &&
              (plugin.requires ?? []).every((capability) => installedCapabilities.has(capability)),
          );
          if (index < 0)
            throw new Error(
              `Plugin dependency cycle or missing capability: ${pendingPlugins.map(({ item }) => item.id).join(", ")}.`,
            );
          const candidate = pendingPlugins.splice(index, 1)[0];
          if (candidate === undefined) continue;
          if (installedIds.has(candidate.item.id))
            throw new Error(`Duplicate plugin instance '${candidate.item.id}'.`);
          const pluginCleanups: Disposable[] = [];
          try {
            const result = await candidate.plugin.setup(
              scopedPluginContext(pluginCleanups),
              candidate.item.config ?? ({} as JsonObject),
            );
            if (result !== undefined) pluginCleanups.push(result);
          } catch (error) {
            for (const cleanup of pluginCleanups.reverse()) cleanup.dispose();
            throw error;
          }
          cleanups.push(...pluginCleanups);
          installedIds.add(candidate.item.id);
          for (const capability of candidate.plugin.provides ?? [])
            installedCapabilities.add(capability);
        }
        for (const route of spec.routes ?? [])
          if ("capability" in route.to && !installedCapabilities.has(route.to.capability))
            throw new Error(
              `Route '${route.id}' targets unsupported capability '${route.to.capability}'.`,
            );
        if (policies.unhandledMessage === "diagnostic") {
          const handled = new Set([
            ...(spec.routes ?? []).map((route) => route.type),
            ...(spec.synchronization ?? []).map(() => "interaction.native"),
            ...[...processors.values()].flatMap((entry) => entry.processor.types),
            "harness.diagnostic",
            "lifecycle.visualization",
          ]);
          const unhandled = fabric.observe().subscribe((message) => {
            if (message.target === undefined && !handled.has(message.type))
              diagnosis(`Unhandled message '${message.type}'.`, message);
          });
          cleanups.push(disposable(() => unhandled.unsubscribe()));
        }
      } catch (error) {
        try {
          await disposeAsync();
        } catch (cleanupError) {
          if (error instanceof Error) Object.assign(error, { cleanupError });
        }
        throw error;
      }
    },
    dispose,
    disposeAsync,
  };
};
