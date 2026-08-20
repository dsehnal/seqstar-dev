import type { HarnessMessage } from "@seq-star/harness-core";
import { type DiagnosticRow, retainDiagnosticRow, sanitizeForDiagnostics } from "./diagnostics";

export type InspectDocument = {
  readonly format: "seqviewspec" | "mvs";
  /** The immutable visualization-request envelope ID; never synthesized from requestId. */
  readonly identity: string;
  readonly requestId: string;
  readonly targetComponent: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly source: HarnessMessage["source"];
  readonly viewId?: string;
  readonly document: unknown;
  readonly lifecycle: "requested" | "accepted" | "rendered" | "degraded";
  readonly wrapperGeneration?: number;
};

export type InspectDatasetDefinition = {
  readonly id: string;
  readonly label: string;
  readonly accession?: string;
  readonly structureId?: string;
  readonly structureLabel?: string;
  readonly viewId?: string;
  readonly seqViewSpec?: { readonly id?: string };
  readonly provenance?: readonly string[];
};

export type InspectDatasetCatalog = {
  readonly initialDatasetId: string;
  readonly datasets: readonly InspectDatasetDefinition[];
};

export type InspectDatasetStatus = {
  readonly datasetId: string;
  readonly previousDatasetId?: string;
  readonly generation: number;
  readonly status: "switching" | "active" | "superseded";
  readonly sequenceRequestId: string;
  readonly structureRequestId: string;
};

export type InspectGeneration = {
  readonly requestId: string;
  /** Dataset generators supply these; generic generators may omit them. */
  readonly documentId?: string;
  readonly viewId?: string;
  readonly trackId?: string;
  readonly layerId?: string;
  /** A generic generator may call this either `profile` or `activation`. */
  readonly profile?: string;
  readonly relationshipId?: string;
  readonly endpointRoles?: readonly {
    readonly role: string;
    readonly selectorCount: number;
  }[];
  readonly mappedContactCount?: number;
  readonly counts?: Readonly<Record<"mapped" | "partial" | "ambiguous" | "unmapped", number>>;
  readonly mapping?: readonly {
    readonly itemId: string;
    readonly status: string;
    readonly selectors: readonly unknown[];
    readonly color: string;
  }[];
};

type InspectGenerationCandidate = {
  readonly generation: InspectGeneration;
  readonly identity: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly source: HarnessMessage["source"];
};

type InspectRequestBinding = Pick<
  InspectDocument,
  "identity" | "requestId" | "correlationId" | "causationId" | "source"
>;

export type InspectPanelState = {
  readonly catalog: InspectDatasetCatalog | undefined;
  readonly catalogSource: HarnessMessage["source"] | undefined;
  readonly datasetStatus: InspectDatasetStatus | undefined;
  /** Last wrapper-confirmed visible documents. */
  readonly sequenceDocument: InspectDocument | undefined;
  readonly structureDocument: InspectDocument | undefined;
  /** Latest targeted candidates, kept separate until the wrapper confirms promotion. */
  readonly pendingSequenceDocument: InspectDocument | undefined;
  readonly pendingStructureDocument: InspectDocument | undefined;
  /** Mapping for the visible MVS only. */
  readonly generation: InspectGeneration | undefined;
  /** Generation exactly bound to the current pending targeted MVS request. */
  readonly boundGeneration: InspectGenerationCandidate | undefined;
  /** Generated-before-request candidates, keyed by their complete request envelope. */
  readonly unboundGenerations: readonly InspectGenerationCandidate[];
  /** Bounded envelope history used only to reject late generations for already-observed requests. */
  readonly structureRequestHistory: readonly InspectRequestBinding[];
  readonly rows: readonly DiagnosticRow[];
};

export type InspectPanelTargets = {
  readonly sequenceComponent: string;
  readonly structureComponent: string;
};

export const emptyInspectPanelState = (): InspectPanelState => ({
  catalog: undefined,
  catalogSource: undefined,
  datasetStatus: undefined,
  sequenceDocument: undefined,
  structureDocument: undefined,
  pendingSequenceDocument: undefined,
  pendingStructureDocument: undefined,
  generation: undefined,
  boundGeneration: undefined,
  unboundGenerations: [],
  structureRequestHistory: [],
  rows: [],
});

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const nonemptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const nonnegativeInteger = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

const generationFrom = (value: unknown): InspectGeneration | undefined => {
  const payload = record(value);
  const requestId = nonemptyString(payload?.requestId);
  if (requestId === undefined) return undefined;
  const countsRecord = record(payload?.counts);
  const counts =
    countsRecord === undefined
      ? undefined
      : {
          mapped: nonnegativeInteger(countsRecord.mapped),
          partial: nonnegativeInteger(countsRecord.partial),
          ambiguous: nonnegativeInteger(countsRecord.ambiguous),
          unmapped: nonnegativeInteger(countsRecord.unmapped),
        };
  const completeCounts =
    counts === undefined || Object.values(counts).some((count) => count === undefined)
      ? undefined
      : (counts as Readonly<Record<"mapped" | "partial" | "ambiguous" | "unmapped", number>>);
  const mapping = Array.isArray(payload?.mapping)
    ? payload.mapping
        .flatMap((entry) => {
          const item = record(entry);
          const itemId = nonemptyString(item?.itemId);
          const status = nonemptyString(item?.status);
          const color = nonemptyString(item?.color);
          return itemId === undefined ||
            status === undefined ||
            color === undefined ||
            !Array.isArray(item?.selectors)
            ? []
            : [{ itemId, status, color, selectors: item.selectors }];
        })
        .slice(-100)
    : undefined;
  const endpointRoles = Array.isArray(payload?.endpointRoles)
    ? payload.endpointRoles
        .flatMap((entry) => {
          const endpoint = record(entry);
          const role = nonemptyString(endpoint?.role);
          const selectorCount = Array.isArray(endpoint?.selectors)
            ? endpoint.selectors.length
            : nonnegativeInteger(endpoint?.selectorCount);
          return role === undefined || selectorCount === undefined ? [] : [{ role, selectorCount }];
        })
        .slice(-16)
    : undefined;
  const profile = nonemptyString(payload?.profile) ?? nonemptyString(payload?.activation);
  const documentId = nonemptyString(payload?.documentId);
  const viewId = nonemptyString(payload?.viewId);
  const trackId = nonemptyString(payload?.trackId);
  const layerId = nonemptyString(payload?.layerId);
  const relationshipId = nonemptyString(payload?.relationshipId);
  const mappedContactCount = Array.isArray(payload?.mappedContactIds)
    ? payload.mappedContactIds.length
    : nonnegativeInteger(payload?.mappedContactCount);
  return {
    requestId,
    ...(documentId === undefined ? {} : { documentId }),
    ...(viewId === undefined ? {} : { viewId }),
    ...(trackId === undefined ? {} : { trackId }),
    ...(layerId === undefined ? {} : { layerId }),
    ...(profile === undefined ? {} : { profile }),
    ...(relationshipId === undefined ? {} : { relationshipId }),
    ...(endpointRoles === undefined ? {} : { endpointRoles }),
    ...(mappedContactCount === undefined ? {} : { mappedContactCount }),
    ...(completeCounts === undefined ? {} : { counts: completeCounts }),
    ...(mapping === undefined ? {} : { mapping }),
  };
};

const targetComponent = (message: HarnessMessage): string | undefined =>
  message.target !== undefined && "component" in message.target
    ? message.target.component
    : undefined;

const documentFrom = (
  message: HarnessMessage,
  format: InspectDocument["format"],
): InspectDocument | undefined => {
  const payload = record(message.payload);
  const target = targetComponent(message);
  if (
    payload === undefined ||
    target === undefined ||
    typeof payload.requestId !== "string" ||
    payload.document === undefined
  )
    return undefined;
  return {
    format,
    identity: message.id,
    requestId: payload.requestId,
    targetComponent: target,
    correlationId: message.correlationId,
    ...(message.causationId === undefined ? {} : { causationId: message.causationId }),
    source: message.source,
    ...(typeof payload.viewId === "string" ? { viewId: payload.viewId } : {}),
    document: payload.document,
    lifecycle: "requested",
  };
};

const statusRank: Readonly<Record<InspectDatasetStatus["status"], number>> = {
  switching: 0,
  superseded: 1,
  active: 2,
};

const isNewerStatus = (
  current: InspectDatasetStatus | undefined,
  incoming: InspectDatasetStatus,
): boolean =>
  current === undefined ||
  incoming.generation > current.generation ||
  (incoming.generation === current.generation &&
    statusRank[incoming.status] >= statusRank[current.status]);

const sameSource = (left: HarnessMessage["source"], right: HarnessMessage["source"]): boolean =>
  left.component === right.component && left.plugin === right.plugin;

const generationMatchesRequest = (
  candidate: InspectGenerationCandidate | undefined,
  request: InspectRequestBinding,
): boolean =>
  candidate !== undefined &&
  candidate.generation.requestId === request.requestId &&
  candidate.correlationId === request.correlationId &&
  (candidate.causationId === undefined && request.causationId === undefined
    ? true
    : candidate.causationId === request.causationId) &&
  sameSource(candidate.source, request.source);

const generationCandidateKey = (candidate: InspectGenerationCandidate): string =>
  [
    candidate.generation.requestId,
    candidate.correlationId,
    candidate.causationId ?? "",
    candidate.source.component ?? "",
    candidate.source.plugin ?? "",
  ].join("\u0000");

const requestBindingKey = (request: InspectRequestBinding): string =>
  [
    request.requestId,
    request.correlationId,
    request.causationId ?? "",
    request.source.component ?? "",
    request.source.plugin ?? "",
  ].join("\u0000");

const hasObservedStructureRequest = (
  history: readonly InspectRequestBinding[],
  candidate: InspectGenerationCandidate,
): boolean =>
  history.some((request) => generationCandidateKey(candidate) === requestBindingKey(request));

const upsertUnboundGeneration = (
  values: readonly InspectGenerationCandidate[],
  incoming: InspectGenerationCandidate,
): readonly InspectGenerationCandidate[] => {
  const key = generationCandidateKey(incoming);
  return [
    ...values.filter((candidate) => generationCandidateKey(candidate) !== key),
    incoming,
  ].slice(-64);
};

const generationBelongsToActiveDataset = (
  state: InspectPanelState,
  generation: InspectGeneration,
  source: HarnessMessage["source"],
): boolean => {
  const sequence = state.sequenceDocument;
  const sequenceDocumentId = record(sequence?.document)?.id;
  if (
    sequence === undefined ||
    sequence.lifecycle === "requested" ||
    !sameSource(sequence.source, source)
  )
    return false;
  if (state.catalog === undefined) {
    return (
      (generation.documentId === undefined || generation.documentId === sequenceDocumentId) &&
      (generation.viewId === undefined || generation.viewId === sequence.viewId)
    );
  }
  const active = state.catalog?.datasets.find(
    (dataset) => dataset.id === state.datasetStatus?.datasetId,
  );
  return (
    active !== undefined &&
    state.catalogSource !== undefined &&
    sameSource(state.catalogSource, source) &&
    sequenceDocumentId === generation.documentId &&
    sequence.viewId === generation.viewId &&
    active?.seqViewSpec?.id === generation.documentId &&
    active.viewId === generation.viewId
  );
};

const lifecycleMatchesCandidate = (
  message: HarnessMessage,
  payload: Record<string, unknown>,
  candidate: InspectDocument | undefined,
): candidate is InspectDocument => {
  return (
    candidate !== undefined &&
    payload.requestId === candidate.requestId &&
    message.source.component === candidate.targetComponent &&
    message.correlationId === candidate.correlationId &&
    message.causationId === candidate.identity
  );
};

type LifecycleReduction = {
  readonly visible: InspectDocument | undefined;
  readonly pending: InspectDocument | undefined;
  readonly promoted: boolean;
  readonly cleared: boolean;
};

const reduceLifecycle = (
  message: HarnessMessage,
  payload: Record<string, unknown>,
  visible: InspectDocument | undefined,
  pending: InspectDocument | undefined,
): LifecycleReduction => {
  if (!lifecycleMatchesCandidate(message, payload, pending))
    return { visible, pending, promoted: false, cleared: false };
  const status = payload.status;
  const wrapperGeneration =
    typeof payload.generation === "number" ? payload.generation : pending.wrapperGeneration;
  if (pending.wrapperGeneration !== undefined && wrapperGeneration !== pending.wrapperGeneration)
    return { visible, pending, promoted: false, cleared: false };
  if (status === "accepted")
    return {
      visible,
      pending: {
        ...pending,
        lifecycle: "accepted",
        ...(wrapperGeneration === undefined ? {} : { wrapperGeneration }),
      },
      promoted: false,
      cleared: false,
    };
  if (status === "rendered" || status === "degraded") {
    const visibleRequestId = payload.visibleRequestId;
    if (typeof visibleRequestId === "string" && visibleRequestId !== pending.requestId)
      return { visible, pending, promoted: false, cleared: false };
    return {
      visible: {
        ...pending,
        lifecycle: status,
        ...(wrapperGeneration === undefined ? {} : { wrapperGeneration }),
      },
      pending: undefined,
      promoted: true,
      cleared: false,
    };
  }
  if (status === "superseded")
    return { visible, pending: undefined, promoted: false, cleared: false };
  if (status === "failed") {
    const retained =
      payload.previousView === "retained" ||
      (typeof payload.visibleRequestId === "string" &&
        payload.visibleRequestId === visible?.requestId);
    if (retained) return { visible, pending: undefined, promoted: false, cleared: false };
    if (payload.previousView === "cleared" || visible === undefined)
      return { visible: undefined, pending: undefined, promoted: false, cleared: true };
    return { visible, pending: undefined, promoted: false, cleared: false };
  }
  return { visible, pending, promoted: false, cleared: false };
};

/** Reduces serializable harness facts without mistaking requests for displayed state. */
export const reduceInspectPanelMessage = (
  state: InspectPanelState,
  message: HarnessMessage,
  targets: InspectPanelTargets,
): InspectPanelState => {
  let next = state;
  if (message.type === "dataset.catalog.ready")
    next = {
      ...next,
      catalog: message.payload as unknown as InspectDatasetCatalog,
      catalogSource: message.source,
    };
  if (message.type === "dataset.status") {
    const status = message.payload as unknown as InspectDatasetStatus;
    if (isNewerStatus(next.datasetStatus, status)) {
      const switchingGeneration =
        status.status === "switching" &&
        (next.datasetStatus === undefined || status.generation > next.datasetStatus.generation);
      next = {
        ...next,
        datasetStatus: status,
        ...(switchingGeneration
          ? {
              pendingSequenceDocument: undefined,
              pendingStructureDocument: undefined,
              boundGeneration: undefined,
              unboundGenerations: [],
              structureRequestHistory: [],
            }
          : {}),
      };
    }
  }
  if (message.type === "visualization.seqviewspec.request") {
    const document = documentFrom(message, "seqviewspec");
    if (document?.targetComponent === targets.sequenceComponent)
      next = { ...next, pendingSequenceDocument: document };
  }
  if (message.type === "visualization.mvs.request") {
    const document = documentFrom(message, "mvs");
    if (document?.targetComponent === targets.structureComponent) {
      const withDisplacedBound =
        next.boundGeneration === undefined
          ? next.unboundGenerations
          : upsertUnboundGeneration(next.unboundGenerations, next.boundGeneration);
      const exactKey = requestBindingKey(document);
      const matched = withDisplacedBound.find(
        (candidate) => generationCandidateKey(candidate) === exactKey,
      );
      next = {
        ...next,
        pendingStructureDocument: document,
        boundGeneration: matched,
        unboundGenerations: withDisplacedBound.filter(
          (candidate) => generationCandidateKey(candidate) !== exactKey,
        ),
        structureRequestHistory: [
          ...next.structureRequestHistory,
          {
            identity: document.identity,
            requestId: document.requestId,
            correlationId: document.correlationId,
            ...(document.causationId === undefined ? {} : { causationId: document.causationId }),
            source: document.source,
          },
        ].slice(-64),
      };
    }
  }
  if (message.type === "document.generated.mvs") {
    const generation = generationFrom(message.payload);
    if (
      generation !== undefined &&
      generationBelongsToActiveDataset(next, generation, message.source)
    ) {
      const candidate: InspectGenerationCandidate = {
        generation,
        identity: message.id,
        correlationId: message.correlationId,
        ...(message.causationId === undefined ? {} : { causationId: message.causationId }),
        source: message.source,
      };
      const matchesCurrent =
        next.pendingStructureDocument !== undefined &&
        generationMatchesRequest(candidate, next.pendingStructureDocument);
      // Catalog-driven UniProt keeps its reviewed out-of-order behavior. Generic profiles reject
      // a late generation for an already-retired request before it can bind a reused request ID.
      const retiredGenericCandidate =
        next.catalog === undefined &&
        !matchesCurrent &&
        hasObservedStructureRequest(next.structureRequestHistory, candidate);
      next = retiredGenericCandidate
        ? next
        : matchesCurrent
          ? {
              ...next,
              boundGeneration: candidate,
              unboundGenerations: next.unboundGenerations.filter(
                (item) => generationCandidateKey(item) !== generationCandidateKey(candidate),
              ),
            }
          : {
              ...next,
              unboundGenerations: upsertUnboundGeneration(next.unboundGenerations, candidate),
            };
    }
  }
  if (message.type === "lifecycle.visualization") {
    const payload = record(message.payload);
    if (payload !== undefined && typeof payload.componentId === "string") {
      if (payload.componentId === targets.sequenceComponent) {
        const result = reduceLifecycle(
          message,
          payload,
          next.sequenceDocument,
          next.pendingSequenceDocument,
        );
        next = {
          ...next,
          sequenceDocument: result.visible,
          pendingSequenceDocument: result.pending,
        };
      }
      if (payload.componentId === targets.structureComponent) {
        const pending = next.pendingStructureDocument;
        const result = reduceLifecycle(message, payload, next.structureDocument, pending);
        const promotedGeneration =
          result.promoted &&
          pending !== undefined &&
          generationMatchesRequest(next.boundGeneration, pending)
            ? next.boundGeneration?.generation
            : undefined;
        next = {
          ...next,
          structureDocument: result.visible,
          pendingStructureDocument: result.pending,
          generation: result.promoted
            ? promotedGeneration
            : result.cleared
              ? undefined
              : next.generation,
          boundGeneration: result.pending === undefined ? undefined : next.boundGeneration,
        };
      }
    }
  }
  return { ...next, rows: retainDiagnosticRow(next.rows, message) };
};

export const safeInspectJson = (value: unknown): string => {
  try {
    return JSON.stringify(sanitizeForDiagnostics(value), null, 2) ?? "null";
  } catch {
    return JSON.stringify("[unserializable value]");
  }
};

export type InspectValidation = {
  readonly identity: string;
  readonly valid: boolean;
  readonly diagnostics: readonly string[];
};

export const commitInspectValidation = (
  currentDocument: InspectDocument | undefined,
  incoming: InspectValidation,
  current: InspectValidation | undefined,
): InspectValidation | undefined =>
  currentDocument?.identity === incoming.identity ? incoming : current;

export const prepareInspectDownload = (
  document: InspectDocument | undefined,
  validation: InspectValidation | undefined,
): { readonly filename: string; readonly mediaType: string; readonly text: string } | undefined => {
  if (
    document === undefined ||
    (document.lifecycle !== "rendered" && document.lifecycle !== "degraded") ||
    validation?.valid !== true ||
    validation.identity !== document.identity
  )
    return undefined;
  return {
    filename: `${document.requestId}.${document.format === "mvs" ? "mvsj" : "seqviewspec"}.json`,
    mediaType: "application/json",
    text: `${safeInspectJson(document.document)}\n`,
  };
};
