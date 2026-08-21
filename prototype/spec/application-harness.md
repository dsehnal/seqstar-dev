# Application Harness Specification

Status: prototype specification draft

The application harness is the event-driven composition layer above Seq*,
SeqViewSpec, and individual visualizers. It installs plugins and wrappers,
routes typed messages, registers coordinate translators, and synchronizes
interactions. It does not own visualizer-native state.

## 1. Responsibilities

The harness MUST provide:

- composable plugin and component registration;
- a typed, observable, serializable message fabric;
- targeted and capability-addressed routing;
- visualization-request replacement policies;
- a coordinate-translator registry and path resolution;
- bidirectional highlight and selection synchronization;
- correlation, causation, and feedback-loop prevention;
- component/plugin lifecycle and deterministic disposal;
- diagnostics suitable for the prototype event inspector.

The harness MUST NOT parse biological formats, render a view, contain
UniProt-specific rules, generate MolViewSpec without a plugin, or expose one
component's private state to another.

## 2. Message envelope

All fabric messages use one versioned envelope:

```typescript
interface HarnessMessage<TType extends string, TPayload> {
  id: string
  type: TType
  version: "0.1.0"
  source: EndpointRef
  target?: MessageTarget
  correlationId: string
  causationId?: string
  timestamp: string
  payload: TPayload
}

interface EndpointRef {
  component?: string
  plugin?: string
}

type MessageTarget =
  | { component: string }
  | { plugin: string }
  | { capability: string }
  | { broadcast: true }
```

IDs are UUIDs produced with `crypto.randomUUID()`. `timestamp` is an ISO-8601
UTC instant. A root message uses its own ID as `correlationId`; derived messages
retain that correlation and set `causationId` to the immediate cause.

Messages contain only JSON-safe values: objects, arrays, strings, finite
numbers, booleans, and null. DOM events, viewer objects, functions, class
instances, `undefined`, typed arrays, and RxJS instances are forbidden.

## 3. Core message families

### 3.1 Visualization requests

```typescript
interface VisualizationRequest<TFormat extends string, TDocument> {
  format: TFormat
  requestId: string
  mode: "replace"
  document: TDocument
  viewId?: string
}
```

Core topics:

- `visualization.seqviewspec.request` with a SeqViewSpec document;
- `visualization.mvs.request` with a MolViewSpec document or canonical MVS JSON.

Requests are latest-wins per target component. Accepting a newer request aborts
or supersedes in-flight work for an older one. A superseded request receives a
lifecycle result and MUST NOT later become the visible view.

### 3.2 Native interaction events

```typescript
interface InteractionEvent {
  interactionId: string
  interaction: "hover" | "select" | "focus" | "track-activate" | "viewport"
  phase: "set" | "clear"
  mode?: "replace" | "add" | "remove" | "toggle"
  origin: InteractionOrigin
  semanticTarget?: SemanticTarget
  loci: CoordinateLocus[]
}
```

`origin` contains stable component, document, view, and applicable visual
object IDs. `semanticTarget` preserves an annotation item, relationship, track,
or structure object identity independently from its loci.

Wrappers publish `interaction.native`. Only actual native/user interaction
uses this topic; applying a synchronized command does not republish it.

### 3.3 Interaction commands

The harness sends normalized commands to wrappers:

- `interaction.highlight.apply`;
- `interaction.highlight.clear`;
- `interaction.selection.apply`;
- `interaction.selection.clear`;
- `interaction.focus.apply`.

Apply payloads contain translated loci, original semantic target when useful,
and the originating component. Commands are always targeted to one component.

```typescript
interface InteractionCommand {
  interactionId: string
  owner: { correlationId: string; sourceComponent: string }
  mode: "replace" | "add" | "remove" | "toggle"
  loci: CoordinateLocus[]
  semanticTarget?: SemanticTarget
}

interface InteractionClearCommand {
  interactionId?: string
  owner: { correlationId: string; sourceComponent: string }
}
```

Highlights and selections are owner-scoped leases. A clear removes only the
named interaction or interactions owned by the supplied owner; it MUST NOT
erase unrelated native or externally applied state. Hover normally uses one
replaceable interaction per source/destination pair. Selection mode is applied
within the owner's selection set.

### 3.4 Domain intents

`intent.annotation.show-in-structure` contains document, view, track, layer,
and annotation IDs plus an optional target structure component. It describes
the user's intent, not how to implement it.

Other domain intents use namespaced topics and TypeBox schemas contributed by
plugins. A visualizer wrapper MUST NOT depend on a domain-specific intent.

### 3.5 Lifecycle and diagnostics

```typescript
interface LifecycleResult {
  requestId: string
  generation: number
  componentId: string
  status: "accepted" | "rendered" | "degraded" | "superseded" | "failed"
  visibleRequestId?: string
  previousView?: "retained" | "cleared"
  capabilities?: string[]
  diagnostics: Diagnostic[]
}
```

Core topics are `lifecycle.visualization` and `harness.diagnostic`. Failures are
messages, not uncaught observable errors that terminate the fabric.

Legal request transitions are `accepted -> rendered|degraded|superseded|failed`.
Each component assigns a monotonically increasing generation when accepting a
request. Completion from an older generation is recorded as superseded and
cannot change visible state, even when a native cancellation arrives late.

## 4. Event fabric API

```typescript
interface EventFabric {
  publish<T extends HarnessMessage<string, unknown>>(message: T): void
  messages<TPayload>(
    type: string,
    schema: PayloadSchema<TPayload>,
  ): Observable<HarnessMessage<string, TPayload>>
  observe(filter?: MessageFilter): Observable<HarnessMessage<string, unknown>>
}

interface MessageFilter {
  types?: string[]
  source?: EndpointRef
  targetComponent?: string
  correlationId?: string
}

interface PayloadSchema<T> {
  check(value: unknown): value is T
}
```

The harness owns writable RxJS subjects. Consumers receive read-only
observables. Publications enter a FIFO queue. Derived publication during
delivery is appended to that queue rather than recursively dispatched. Route
processors may schedule asynchronous work. A slow consumer MUST NOT block
pointer input; hover routes are coalesced to an animation frame. When both set
and clear occur in one frame, the last event wins.

An invalid envelope or payload is rejected with a diagnostic and is not routed.
One consumer failure is isolated and does not terminate other subscriptions.

## 5. Application composition

The serializable application composition references factories registered by
the host runtime:

```typescript
interface ApplicationHarnessSpec {
  id: string
  components: ComponentInstanceSpec[]
  plugins?: PluginInstanceSpec[]
  routes?: EventRouteSpec[]
  synchronization?: InteractionSyncRule[]
  policies?: HarnessPolicies
  extensions?: Record<string, unknown>
}

interface ComponentInstanceSpec {
  id: string
  type: string
  config?: Record<string, unknown>
}

interface PluginInstanceSpec {
  id: string
  plugin: string
  config?: Record<string, unknown>
}
```

The composition spec contains no functions. `type` and `plugin` resolve through
host registries. Duplicate instance IDs, unresolved required factories, plugin
dependency cycles, and incompatible capabilities are startup errors.

## 6. Plugin composition

Code plugins use an explicit setup/disposal contract:

```typescript
interface HarnessPluginSpec<TConfig = unknown> {
  id: string
  requires?: string[]
  provides?: string[]
  setup(
    context: HarnessPluginContext,
    config: TConfig,
  ): Promise<void | Disposable> | void | Disposable
}

interface HarnessPluginContext {
  fabric: EventFabric
  translators: TranslatorRegistry
  components: ComponentRegistryView
  messageSchemas: MessageSchemaRegistry
  addProcessor(processor: MessageProcessor): Disposable
  addRoute(route: EventRoute): Disposable
}

interface Disposable { dispose(): void }

interface MessageSchemaRegistry {
  register<T>(type: string, version: string, schema: PayloadSchema<T>): Disposable
  get(type: string, version: string): PayloadSchema<unknown> | undefined
}

interface MessageProcessor {
  id: string
  types: string[]
  process(
    message: HarnessMessage<string, unknown>,
    context: HarnessPluginContext,
    signal: AbortSignal,
  ): Promise<void> | void
}

interface ComponentRegistryView {
  get(id: string): Readonly<ComponentDescriptor> | undefined
  findByCapability(capability: string): ReadonlyArray<ComponentDescriptor>
  changes: Observable<ComponentRegistryChange>
}
```

Plugins compose similarly to Mol* plugin specifications: each declares stable
capabilities and dependencies, installation order is dependency-derived, and a
host assembles an application from reusable plugin specs. Plugins communicate
through public context capabilities and messages, not private imports.

Setup is transactional: if installation fails, registrations made during that
setup are disposed. Disposal runs in reverse installation order and is
idempotent.

Capability names match
`^[a-z][a-z0-9.-]*:[a-z][a-z0-9./-]*$`, for example
`seqviewspec:representation/blocks` or `seqstar:format/molviewspec`. Multiple
providers may expose a capability; a route expands a capability target to all
ready matching component instances unless configuration selects one. Required
plugin capabilities are satisfied by the union of registered static providers.

## 7. Component lifecycle

```typescript
interface HarnessComponent {
  id: string
  capabilities: string[]
  start(context: ComponentContext): Promise<void>
  dispose(): Promise<void> | void
}

interface ComponentContext {
  fabric: EventFabric
  translators: TranslatorRegistry
  reportCapabilities(capabilities: string[]): void
  reportCoordinateSpaces(spaces: CoordinateSpace[]): void
  signal: AbortSignal
}
```

States are `registered -> starting -> ready -> disposing -> disposed`, with a
terminal `failed` path. Requests arriving before ready are retained according
to route policy; for visualization requests only the latest pending request is
kept. A disposed component receives no messages.

Harness startup phases are: construct registries; register component factories
and static capabilities; start components; install and await plugins plus
translator registrations; then publish initial requests. Failure rolls back all
completed phases in reverse order. Dynamic coordinate spaces become available
after a visualization is accepted and are removed on replacement/disposal.

## 8. Routing

```typescript
interface EventRouteSpec {
  id: string
  type: string
  from?: EndpointSelector
  to: MessageTarget
  policy?: "all" | "latest" | "ordered" | "animation-frame-latest"
}
```

Defaults:

| Message class | Policy |
| --- | --- |
| Visualization request | `latest` per target |
| Hover/highlight | `animation-frame-latest` per target |
| Selection and explicit intent | `ordered` |
| Lifecycle/diagnostic | `all` |

Routes may filter and target but do not mutate payload semantics. Semantic
processing is an explicitly registered processor that emits a derived message.

## 9. Translator registry

```typescript
interface TranslatorRegistry {
  register(translator: CoordinateTranslator): Disposable
  findPaths(source: CoordinateSpace, target: CoordinateSpace): TranslationPath[]
  map(request: TranslationRequest, signal?: AbortSignal): Promise<TranslationResult>
}

interface TranslationRequest {
  loci: CoordinateLocus[]
  target: CoordinateSpace
  policy?: { preferredTranslatorIds?: string[]; maxSteps?: number }
}

interface TranslationResult extends MappingResult {
  paths: Array<{ sourceIndex: number; translatorIds: string[] }>
}
```

The registry is a directed multigraph. Path ordering is deterministic: explicit
preference, then lowest summed cost, then fewest steps, then lexical translator
ID order. Prototype paths default to at most four steps.

Coordinate spaces are equal only when `id`, `kind`, `authority`, and every
sorted context key/value are equal. Patterns match `kind` exactly, optional
authority exactly, and context keys exactly except for the explicit `"*"`
wildcard. Missing context never matches a required wildcard key.

A request containing heterogeneous source spaces is partitioned by canonical
space and resolved per source locus. `paths` records the selected path for each
source index. If the target pattern matches multiple concrete destination spaces,
the request must name one or policy must resolve one unambiguously.

Registration rejects duplicate translator IDs. Unregistering immediately
prevents new use but does not mutate results already emitted. Mapping supports
abort signals. Caches, if used, are scoped to translator identity/version and
exact serialized request.

Translator exceptions and timeouts become per-locus diagnostics and unmapped
or partial associations; they do not terminate the fabric. Cancellation emits
no stale derived interaction. One-to-many composition takes the Cartesian
continuation of mapped targets while retaining the original source and caps
expansion using an explicit policy to prevent unbounded paths.

The registry never guesses from equal lengths, labels, display order, or
identity metadata. An identity translator applies only to the exact same named
coordinate space.

## 10. Interaction synchronization

```typescript
interface InteractionSyncRule {
  id: string
  interaction: "hover" | "select" | "focus"
  between: string[]
  direction?: "both" | "forward"
  unmapped?: "clear" | "preserve"
}
```

For each native interaction the synchronization service:

1. identifies eligible destination components;
2. obtains their accepted coordinate-space capabilities;
3. maps source loci through the translator registry;
4. publishes one targeted apply or clear command per destination;
5. retains correlation and causation IDs;
6. records the selected translator path in diagnostics.

Hover defaults to `unmapped: "clear"`; selection defaults to `preserve` unless
configured. Partial results apply mapped loci and retain diagnostics for
unmapped source loci.

Feedback loops are prevented structurally: wrappers publish native events only
for native interactions, never for applied commands. The harness additionally
tracks `(correlationId, ruleId, destination)` and drops repeated reflections.

## 11. Harness policies

```typescript
interface HarnessPolicies {
  partialRendering?: "reject" | "allow-with-diagnostic"
  unhandledMessage?: "ignore" | "diagnostic"
  processorFailure?: "diagnostic" | "stop-harness"
}
```

Prototype defaults are reject partial rendering, diagnose unhandled messages,
and isolate processor failures as diagnostics.

## 12. React adapter

`harness-react` provides lifecycle integration only:

- a provider exposing one page-scoped harness instance;
- hooks for read-only message observation and component host registration;
- guaranteed disposal on route unmount;
- no alternate router, store, or event model.

React context exposes the harness API, not mutable internal subjects.

## 13. Acceptance criteria

1. Plugin dependency ordering, setup rollback, and reverse disposal are tested.
2. Envelope and payload validation reject malformed messages without ending the
   fabric.
3. Latest visualization requests supersede earlier in-flight requests.
4. Hover is coalesced; selection and track activation remain ordered.
5. Translation path selection is deterministic and diagnostics expose the path.
6. Partial, ambiguous, and unmapped translations retain source associations.
7. Bidirectional synchronization passes without echo loops.
8. Page unmount removes all routes, processors, translators, and subscriptions.
9. A mock third visualizer can register through public contracts without
   changing the harness core.
