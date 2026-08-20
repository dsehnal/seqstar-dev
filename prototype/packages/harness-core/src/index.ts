import {
  type CoordinateLocus,
  CoordinateLocusSchema,
  type CoordinateSpace,
  type CoordinateTranslator,
  type MappingResult,
} from "@seq-star/seq-coords";
import type { Diagnostic, JsonObject, JsonValue } from "@seq-star/seq-core";
import { DiagnosticSchema, isJsonSafeValue } from "@seq-star/seq-core";
import type { Observable, Subscription } from "rxjs";
import { type TSchema, Type } from "typebox";
import { Value } from "typebox/value";

const SerializedValueShapeSchema = Type.Cyclic(
  {
    JsonValue: Type.Union([
      Type.String(),
      Type.Number(),
      Type.Boolean(),
      Type.Null(),
      Type.Array(Type.Ref("JsonValue")),
      Type.Record(Type.String(), Type.Ref("JsonValue")),
    ]),
  },
  "JsonValue",
);

export const CapabilityPattern = "^[a-z][a-z0-9.-]*:[a-z][a-z0-9./-]*$";
export const UuidPattern = "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";
export const IsoUtcTimestampPattern = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z$";
export const isCapability = (value: string): boolean => new RegExp(CapabilityPattern).test(value);
export type Capability = string;
export type EndpointRef = { readonly component?: string; readonly plugin?: string };
export type MessageTarget =
  | { readonly component: string }
  | { readonly plugin: string }
  | { readonly capability: Capability }
  | { readonly broadcast: true };
export const EndpointRefSchema = Type.Object(
  { component: Type.Optional(Type.String()), plugin: Type.Optional(Type.String()) },
  { additionalProperties: false },
);
export const MessageTargetSchema = Type.Union([
  Type.Object({ component: Type.String() }, { additionalProperties: false }),
  Type.Object({ plugin: Type.String() }, { additionalProperties: false }),
  Type.Object(
    { capability: Type.String({ pattern: CapabilityPattern }) },
    { additionalProperties: false },
  ),
  Type.Object({ broadcast: Type.Literal(true) }, { additionalProperties: false }),
]);

/** Shape-only TypeBox artifact; use isHarnessMessage for JS runtime validation. */
export const HarnessMessageSchema = Type.Object(
  {
    id: Type.String({ pattern: UuidPattern }),
    type: Type.String({ minLength: 1 }),
    version: Type.Literal("0.1.0"),
    source: EndpointRefSchema,
    target: Type.Optional(MessageTargetSchema),
    correlationId: Type.String({ pattern: UuidPattern }),
    causationId: Type.Optional(Type.String({ pattern: UuidPattern })),
    timestamp: Type.String({ pattern: IsoUtcTimestampPattern }),
    payload: SerializedValueShapeSchema,
  },
  { additionalProperties: false },
);
export interface HarnessMessage<TType extends string = string, TPayload = JsonValue> {
  readonly id: string;
  readonly type: TType;
  readonly version: "0.1.0";
  readonly source: EndpointRef;
  readonly target?: MessageTarget;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly timestamp: string;
  readonly payload: TPayload;
}
export const isIsoUtcTimestamp = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/.exec(value);
  if (match === null) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const maximumDay = daysInMonth[month - 1] ?? 0;
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= maximumDay &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59
  );
};
export const isHarnessMessage = (value: unknown): value is HarnessMessage => {
  try {
    return (
      isJsonSafeValue(value) &&
      Value.Check(HarnessMessageSchema, value) &&
      isIsoUtcTimestamp((value as { readonly timestamp: unknown }).timestamp)
    );
  } catch {
    return false;
  }
};

export interface VisualizationRequest<TFormat extends string, TDocument extends JsonValue> {
  readonly format: TFormat;
  readonly requestId: string;
  readonly mode: "replace";
  readonly document: TDocument;
  readonly viewId?: string;
}
export type InteractionKind = "hover" | "select" | "focus" | "track-activate" | "viewport";
export interface InteractionOrigin {
  readonly componentId: string;
  readonly documentId?: string;
  readonly viewId?: string;
  readonly sectionId?: string;
  readonly trackId?: string;
  readonly layerId?: string;
  readonly sequenceId?: string;
  readonly alignmentId?: string;
  readonly alignmentMemberId?: string;
}
export interface SemanticTarget {
  readonly annotationId?: string;
  readonly itemId?: string;
  readonly relationshipId?: string;
  readonly trackId?: string;
  readonly structureObjectId?: string;
  readonly endpointRole?: string;
  readonly locusIndex?: number;
}
export interface InteractionEvent {
  readonly interactionId: string;
  readonly interaction: InteractionKind;
  readonly phase: "set" | "clear";
  readonly mode?: "replace" | "add" | "remove" | "toggle";
  readonly origin: InteractionOrigin;
  readonly semanticTarget?: SemanticTarget;
  readonly loci: readonly CoordinateLocus[];
}
export interface InteractionOwner {
  readonly correlationId: string;
  readonly sourceComponent: string;
}
export interface InteractionCommand {
  readonly interactionId: string;
  readonly owner: InteractionOwner;
  readonly mode: "replace" | "add" | "remove" | "toggle";
  readonly loci: readonly CoordinateLocus[];
  readonly semanticTarget?: SemanticTarget;
}
export interface InteractionClearCommand {
  readonly interactionId?: string;
  readonly owner: InteractionOwner;
}
export interface LifecycleResult {
  readonly requestId: string;
  readonly generation: number;
  readonly componentId: string;
  readonly status: "accepted" | "rendered" | "degraded" | "superseded" | "failed";
  readonly visibleRequestId?: string;
  readonly previousView?: "retained" | "cleared";
  readonly capabilities?: readonly Capability[];
  readonly diagnostics: readonly Diagnostic[];
}
export const VisualizationRequestSchema = Type.Object(
  {
    format: Type.String({ minLength: 1 }),
    requestId: Type.String({ minLength: 1 }),
    mode: Type.Literal("replace"),
    document: SerializedValueShapeSchema,
    viewId: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);
export const InteractionOriginSchema = Type.Object(
  {
    componentId: Type.String({ minLength: 1 }),
    documentId: Type.Optional(Type.String()),
    viewId: Type.Optional(Type.String()),
    sectionId: Type.Optional(Type.String()),
    trackId: Type.Optional(Type.String()),
    layerId: Type.Optional(Type.String()),
    sequenceId: Type.Optional(Type.String()),
    alignmentId: Type.Optional(Type.String()),
    alignmentMemberId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export const SemanticTargetSchema = Type.Object(
  {
    annotationId: Type.Optional(Type.String()),
    itemId: Type.Optional(Type.String()),
    relationshipId: Type.Optional(Type.String()),
    trackId: Type.Optional(Type.String()),
    structureObjectId: Type.Optional(Type.String()),
    endpointRole: Type.Optional(Type.String()),
    locusIndex: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);
export const InteractionOwnerSchema = Type.Object(
  { correlationId: Type.String({ minLength: 1 }), sourceComponent: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);
export const InteractionEventSchema = Type.Object(
  {
    interactionId: Type.String({ minLength: 1 }),
    interaction: Type.Union([
      Type.Literal("hover"),
      Type.Literal("select"),
      Type.Literal("focus"),
      Type.Literal("track-activate"),
      Type.Literal("viewport"),
    ]),
    phase: Type.Union([Type.Literal("set"), Type.Literal("clear")]),
    mode: Type.Optional(
      Type.Union([
        Type.Literal("replace"),
        Type.Literal("add"),
        Type.Literal("remove"),
        Type.Literal("toggle"),
      ]),
    ),
    origin: InteractionOriginSchema,
    semanticTarget: Type.Optional(SemanticTargetSchema),
    loci: Type.Array(CoordinateLocusSchema),
  },
  { additionalProperties: false },
);
export const InteractionCommandSchema = Type.Object(
  {
    interactionId: Type.String({ minLength: 1 }),
    owner: InteractionOwnerSchema,
    mode: Type.Union([
      Type.Literal("replace"),
      Type.Literal("add"),
      Type.Literal("remove"),
      Type.Literal("toggle"),
    ]),
    loci: Type.Array(CoordinateLocusSchema),
    semanticTarget: Type.Optional(SemanticTargetSchema),
  },
  { additionalProperties: false },
);
export const InteractionClearCommandSchema = Type.Object(
  { interactionId: Type.Optional(Type.String({ minLength: 1 })), owner: InteractionOwnerSchema },
  { additionalProperties: false },
);
export const LifecycleResultSchema = Type.Object(
  {
    requestId: Type.String({ minLength: 1 }),
    generation: Type.Integer({ minimum: 1 }),
    componentId: Type.String({ minLength: 1 }),
    status: Type.Union([
      Type.Literal("accepted"),
      Type.Literal("rendered"),
      Type.Literal("degraded"),
      Type.Literal("superseded"),
      Type.Literal("failed"),
    ]),
    visibleRequestId: Type.Optional(Type.String()),
    previousView: Type.Optional(Type.Union([Type.Literal("retained"), Type.Literal("cleared")])),
    capabilities: Type.Optional(Type.Array(Type.String({ pattern: CapabilityPattern }))),
    diagnostics: Type.Array(DiagnosticSchema),
  },
  { additionalProperties: false },
);
export interface InteractionLease {
  readonly interactionId: string;
  readonly owner: InteractionOwner;
}
export const interactionClearApplies = (
  lease: InteractionLease,
  command: InteractionClearCommand,
): boolean =>
  lease.owner.correlationId === command.owner.correlationId &&
  lease.owner.sourceComponent === command.owner.sourceComponent &&
  (command.interactionId === undefined || command.interactionId === lease.interactionId);
export const isLifecycleTransition = (
  from: LifecycleResult["status"],
  to: LifecycleResult["status"],
): boolean =>
  from === "accepted" &&
  (to === "rendered" || to === "degraded" || to === "superseded" || to === "failed");
export const isCurrentGeneration = (
  completionGeneration: number,
  acceptedGeneration: number,
): boolean => completionGeneration === acceptedGeneration;

export interface PayloadSchema<Value> {
  readonly schema: TSchema;
  check(value: unknown): value is Value;
}
export const payloadSchema = <Value>(schema: TSchema): PayloadSchema<Value> => ({
  schema,
  check: (value: unknown): value is Value => {
    try {
      return isJsonSafeValue(value) && Value.Check(schema, value);
    } catch {
      return false;
    }
  },
});
export interface MessageSchemaRegistry {
  register<Value>(type: string, version: string, schema: PayloadSchema<Value>): Disposable;
  get(type: string, version: string): PayloadSchema<unknown> | undefined;
}
export interface MessageFilter {
  readonly types?: readonly string[];
  readonly source?: EndpointRef;
  readonly targetComponent?: string;
  readonly correlationId?: string;
}
export interface EventFabric {
  publish<T extends HarnessMessage>(message: T): void;
  messages<TPayload>(
    type: string,
    schema: PayloadSchema<TPayload>,
  ): Observable<HarnessMessage<string, TPayload>>;
  observe(filter?: MessageFilter): Observable<HarnessMessage>;
}

export interface Disposable {
  dispose(): void;
}
export interface ComponentDescriptor {
  readonly id: string;
  readonly type: string;
  readonly capabilities: readonly Capability[];
  readonly coordinateSpaces: readonly CoordinateSpace[];
  readonly status: ComponentStatus;
}
export interface ComponentRegistryChange {
  readonly kind: "registered" | "ready" | "updated" | "removed";
  readonly component: ComponentDescriptor;
}
export interface ComponentRegistryView {
  get(id: string): Readonly<ComponentDescriptor> | undefined;
  findByCapability(capability: Capability): readonly Readonly<ComponentDescriptor>[];
  readonly changes: Observable<ComponentRegistryChange>;
}
export interface HarnessPluginSpec<TConfig = JsonObject> {
  readonly id: string;
  readonly requires?: readonly Capability[];
  readonly provides?: readonly Capability[];
  setup(
    context: HarnessPluginContext,
    config: TConfig,
  ): Promise<Disposable | undefined> | Disposable | undefined;
}
export interface HarnessPluginContext {
  readonly fabric: EventFabric;
  readonly translators: TranslatorRegistry;
  readonly components: ComponentRegistryView;
  readonly messageSchemas: MessageSchemaRegistry;
  addProcessor(processor: MessageProcessor): Disposable;
  addRoute(route: EventRoute): Disposable;
}
export interface MessageProcessor {
  readonly id: string;
  readonly types: readonly string[];
  process(
    message: HarnessMessage,
    context: HarnessPluginContext,
    signal: AbortSignal,
  ): Promise<void> | void;
}
export type ComponentStatus =
  | "registered"
  | "starting"
  | "ready"
  | "disposing"
  | "disposed"
  | "failed";
export interface ComponentContext {
  readonly fabric: EventFabric;
  readonly translators: TranslatorRegistry;
  reportCapabilities(capabilities: readonly Capability[]): void;
  reportCoordinateSpaces(spaces: readonly CoordinateSpace[]): void;
  readonly signal: AbortSignal;
}
export interface HarnessComponent {
  readonly id: string;
  readonly capabilities: readonly Capability[];
  start(context: ComponentContext): Promise<void>;
  dispose(): Promise<void> | void;
}
export interface ComponentFactory<TConfig extends JsonObject = JsonObject> {
  readonly type: string;
  create(options: { readonly id: string; readonly config?: TConfig }): HarnessComponent;
}
export interface PluginFactory<TConfig extends JsonObject = JsonObject> {
  readonly plugin: string;
  create(config: TConfig): HarnessPluginSpec<TConfig>;
}

export interface ComponentInstanceSpec {
  readonly id: string;
  readonly type: string;
  readonly config?: JsonObject;
}
export interface PluginInstanceSpec {
  readonly id: string;
  readonly plugin: string;
  readonly config?: JsonObject;
}
export type RoutePolicy = "all" | "latest" | "ordered" | "animation-frame-latest";
export type EndpointSelector = EndpointRef;
export interface EventRouteSpec {
  readonly id: string;
  readonly type: string;
  readonly from?: EndpointSelector;
  readonly to: MessageTarget;
  readonly policy?: RoutePolicy;
}
export type EventRoute = EventRouteSpec;
export interface InteractionSyncRule {
  readonly id: string;
  readonly interaction: "hover" | "select" | "focus";
  readonly between: readonly string[];
  readonly direction?: "both" | "forward";
  readonly unmapped?: "clear" | "preserve";
}
export interface HarnessPolicies {
  readonly partialRendering?: "reject" | "allow-with-diagnostic";
  readonly unhandledMessage?: "ignore" | "diagnostic";
  readonly processorFailure?: "diagnostic" | "stop-harness";
}
export interface ApplicationHarnessSpec {
  readonly id: string;
  readonly components: readonly ComponentInstanceSpec[];
  readonly plugins?: readonly PluginInstanceSpec[];
  readonly routes?: readonly EventRouteSpec[];
  readonly synchronization?: readonly InteractionSyncRule[];
  readonly policies?: HarnessPolicies;
  readonly extensions?: JsonObject;
}

export interface TranslationPath {
  readonly translatorIds: readonly string[];
  readonly cost: number;
}
export interface TranslationRequest {
  readonly loci: readonly CoordinateLocus[];
  readonly target: CoordinateSpace;
  readonly policy?: {
    readonly preferredTranslatorIds?: readonly string[];
    readonly maxSteps?: number;
  };
}
export interface TranslationResult extends MappingResult {
  readonly paths: readonly {
    readonly sourceIndex: number;
    readonly translatorIds: readonly string[];
  }[];
}
export interface TranslatorRegistry {
  register(translator: CoordinateTranslator): Disposable;
  findPaths(source: CoordinateSpace, target: CoordinateSpace): readonly TranslationPath[];
  map(request: TranslationRequest, signal?: AbortSignal): Promise<TranslationResult>;
}

/** Wrappers bind an exact native readiness signal to the request generation that produced it. */
export interface FirstFrameHook {
  readonly generation: number;
  readonly requestId: string;
  wait(signal: AbortSignal): Promise<void>;
}
export interface RequestGenerationAttribution {
  readonly requestId: string;
  readonly generation: number;
  readonly componentId: string;
}
export interface FifoReentrancyContract {
  readonly publications: "fifo";
  readonly derivedPublication: "append-after-current-delivery";
  readonly lateCompletion: "superseded-and-never-visible";
}
export const fifoReentrancyContract: FifoReentrancyContract = {
  publications: "fifo",
  derivedPublication: "append-after-current-delivery",
  lateCompletion: "superseded-and-never-visible",
};
export type ObservableSubscription = Subscription;
/** @deprecated P01 package-boundary marker retained while consumers move to named contracts. */
export interface HarnessCorePackageBoundary {
  readonly diagnostics: import("@seq-star/seq-core").SeqCorePackageBoundary;
  readonly coordinates: import("@seq-star/seq-coords").SeqCoordsPackageBoundary;
  readonly packageName: "@seq-star/harness-core";
}

export type { ApplicationHarness, ApplicationHarnessHost, EventFabricOptions } from "./runtime.js";
export {
  createApplicationHarness,
  createEventFabric,
  createMessageSchemaRegistry,
  createTranslatorRegistry,
  installCoreMessageSchemas,
} from "./runtime.js";
