import type {
  ComponentDescriptor,
  ComponentRegistryChange,
  HarnessMessage,
} from "@seq-star/harness-core";

export type DiagnosticRow = {
  readonly message: HarnessMessage;
  readonly sanitized: unknown;
};

export type LifecycleSummary = {
  readonly messageId: string;
  readonly componentId: string;
  readonly requestId: string;
  readonly generation: number;
  readonly status: string;
  readonly diagnostics: unknown;
};

export type MappingSummary = {
  readonly messageId: string;
  readonly type: string;
  readonly status?: string;
  readonly paths?: unknown;
  readonly associations?: unknown;
  readonly diagnostics?: unknown;
};

export type GeneratedDocument = {
  readonly key: string;
  readonly identity: string;
  readonly messageId: string;
  readonly requestId: string;
  readonly viewId?: string;
  readonly targetComponent?: string;
  readonly format: "seqviewspec" | "mvs";
  readonly document: unknown;
};

export type ActiveDocumentSummary = {
  readonly componentId: string;
  readonly requestId: string;
  readonly viewId?: string;
  readonly documentIdentity?: string;
  readonly status: string;
  readonly visibleRequestId?: string;
};

export type DiagnosticsState = {
  readonly rows: readonly DiagnosticRow[];
  readonly lifecycles: readonly LifecycleSummary[];
  readonly mappings: readonly MappingSummary[];
  readonly documents: readonly GeneratedDocument[];
  readonly activeDocuments: Readonly<Record<string, ActiveDocumentSummary>>;
  readonly components: Readonly<Record<string, ComponentDescriptor>>;
};

export type DocumentValidationResult = {
  readonly valid: boolean;
  readonly diagnostics: readonly string[];
};

export type DocumentValidation = DocumentValidationResult & {
  readonly documentIdentity: string;
};

export type DocumentValidator = (document: unknown) => Promise<DocumentValidationResult>;

export const emptyDiagnosticsState = (): DiagnosticsState => ({
  rows: [],
  lifecycles: [],
  mappings: [],
  documents: [],
  activeDocuments: {},
  components: {},
});

const sensitiveKey = /(?:authorization|credential|password|secret|token|api[-_]?key)/iu;
const compactPayloadKey = /(?:document|sequence|structure|alignment|coordinates?|loci)/iu;

const describeLargeValue = (value: unknown) => {
  const record =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  let size: number | undefined;
  try {
    size = JSON.stringify(value).length;
  } catch {
    // The message fabric already rejects unsafe payloads; remain defensive for tests.
  }
  return {
    inspection: "on-demand",
    kind: Array.isArray(value) ? "array" : typeof value,
    ...(typeof record?.id === "string" ? { id: record.id } : {}),
    ...(typeof record?.digest === "string" ? { digest: record.digest } : {}),
    ...(size === undefined ? {} : { size }),
  };
};

export const sanitizeForDiagnostics = (
  value: unknown,
  options: { readonly summarizeLargePayloads?: boolean } = {},
  key?: string,
): unknown => {
  if (key !== undefined && sensitiveKey.test(key)) return "[redacted]";
  if (options.summarizeLargePayloads && key !== undefined && compactPayloadKey.test(key))
    return describeLargeValue(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeForDiagnostics(item, options));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([name, item]) => [
        name,
        sanitizeForDiagnostics(item, options, name),
      ]),
    );
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return value;
  return `[unsupported ${typeof value}]`;
};

const hoverKey = (message: HarnessMessage): string | undefined => {
  const payload = message.payload as { readonly interaction?: unknown };
  const hover =
    (message.type === "interaction.native" && payload.interaction === "hover") ||
    message.type === "interaction.highlight.apply" ||
    message.type === "interaction.highlight.clear";
  if (!hover) return undefined;
  const source = message.source.component ?? message.source.plugin ?? "unknown";
  const target =
    message.target === undefined
      ? "broadcast"
      : "component" in message.target
        ? message.target.component
        : "plugin" in message.target
          ? message.target.plugin
          : "capability" in message.target
            ? message.target.capability
            : "broadcast";
  return `${source}\u0000${target}`;
};

export const retainDiagnosticRow = (
  rows: readonly DiagnosticRow[],
  message: HarnessMessage,
): readonly DiagnosticRow[] => {
  const incoming: DiagnosticRow = {
    message,
    sanitized: sanitizeForDiagnostics(message, { summarizeLargePayloads: true }),
  };
  const key = hoverKey(message);
  const withoutPreviousHover =
    key === undefined ? rows : rows.filter((row) => hoverKey(row.message) !== key);
  const next = [...withoutPreviousHover, incoming];
  const nonHover = next.filter((row) => hoverKey(row.message) === undefined);
  if (nonHover.length <= 2000) return next;
  const discarded = new Set(nonHover.slice(0, nonHover.length - 2000));
  return next.filter((row) => !discarded.has(row));
};

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const lifecycleFrom = (message: HarnessMessage): LifecycleSummary | undefined => {
  if (message.type !== "lifecycle.visualization") return undefined;
  const payload = record(message.payload);
  if (
    payload === undefined ||
    typeof payload.componentId !== "string" ||
    typeof payload.requestId !== "string" ||
    typeof payload.generation !== "number" ||
    typeof payload.status !== "string"
  )
    return undefined;
  return {
    messageId: message.id,
    componentId: payload.componentId,
    requestId: payload.requestId,
    generation: payload.generation,
    status: payload.status,
    diagnostics: sanitizeForDiagnostics(payload.diagnostics),
  };
};

const mappingFrom = (message: HarnessMessage): MappingSummary | undefined => {
  const payload = record(message.payload);
  if (payload === undefined) return undefined;
  const looksLikeMapping =
    message.type.includes("mapping") ||
    Array.isArray(payload.paths) ||
    Array.isArray(payload.associations);
  if (!looksLikeMapping) return undefined;
  return {
    messageId: message.id,
    type: message.type,
    ...(typeof payload.status === "string" ? { status: payload.status } : {}),
    ...(payload.paths === undefined
      ? {}
      : { paths: sanitizeForDiagnostics(payload.paths, { summarizeLargePayloads: false }) }),
    ...(payload.associations === undefined
      ? {}
      : { associations: sanitizeForDiagnostics(payload.associations) }),
    ...(payload.diagnostics === undefined
      ? {}
      : { diagnostics: sanitizeForDiagnostics(payload.diagnostics) }),
  };
};

const documentFrom = (message: HarnessMessage): GeneratedDocument | undefined => {
  const format = message.type === "visualization.seqviewspec.request" ? "seqviewspec" : "mvs";
  if (
    message.type !== "visualization.seqviewspec.request" &&
    message.type !== "visualization.mvs.request"
  )
    return undefined;
  const payload = record(message.payload);
  if (
    payload === undefined ||
    typeof payload.requestId !== "string" ||
    payload.document === undefined
  )
    return undefined;
  return {
    key: `${format}:${payload.requestId}`,
    identity: message.id,
    messageId: message.id,
    requestId: payload.requestId,
    ...(typeof payload.viewId === "string" ? { viewId: payload.viewId } : {}),
    ...(message.target !== undefined && "component" in message.target
      ? { targetComponent: message.target.component }
      : {}),
    format,
    document: payload.document,
  };
};

const replaceBy = <Value>(
  values: readonly Value[],
  incoming: Value,
  key: (value: Value) => string,
): readonly Value[] => [...values.filter((value) => key(value) !== key(incoming)), incoming];

export const reduceDiagnosticMessage = (
  state: DiagnosticsState,
  message: HarnessMessage,
): DiagnosticsState => {
  const lifecycle = lifecycleFrom(message);
  const mapping = mappingFrom(message);
  const document = documentFrom(message);
  const documents =
    document === undefined
      ? state.documents
      : replaceBy(state.documents, document, (item) => item.key);
  let activeDocuments = state.activeDocuments;
  if (document?.targetComponent !== undefined)
    activeDocuments = {
      ...activeDocuments,
      [document.targetComponent]: {
        componentId: document.targetComponent,
        requestId: document.requestId,
        ...(document.viewId === undefined ? {} : { viewId: document.viewId }),
        documentIdentity: document.identity,
        status: "requested",
      },
    };
  if (lifecycle !== undefined) {
    const matchingDocument = [...documents]
      .reverse()
      .find((item) => item.requestId === lifecycle.requestId);
    const payload = record(message.payload);
    activeDocuments = {
      ...activeDocuments,
      [lifecycle.componentId]: {
        componentId: lifecycle.componentId,
        requestId: lifecycle.requestId,
        ...(matchingDocument?.viewId === undefined ? {} : { viewId: matchingDocument.viewId }),
        ...(matchingDocument === undefined ? {} : { documentIdentity: matchingDocument.identity }),
        status: lifecycle.status,
        ...(typeof payload?.visibleRequestId === "string"
          ? { visibleRequestId: payload.visibleRequestId }
          : {}),
      },
    };
  }
  return {
    ...state,
    rows: retainDiagnosticRow(state.rows, message),
    lifecycles:
      lifecycle === undefined
        ? state.lifecycles
        : replaceBy(state.lifecycles, lifecycle, (item) => `${item.componentId}:${item.requestId}`),
    mappings:
      mapping === undefined
        ? state.mappings
        : replaceBy(state.mappings, mapping, (item) => item.messageId),
    documents,
    activeDocuments,
  };
};

export const reduceComponentChange = (
  state: DiagnosticsState,
  change: ComponentRegistryChange,
): DiagnosticsState => ({
  ...state,
  components: { ...state.components, [change.component.id]: change.component },
});

export const prepareDocumentDownload = (
  document: GeneratedDocument,
  validation: DocumentValidation,
): { readonly filename: string; readonly text: string; readonly mediaType: string } | undefined => {
  if (!validation.valid || validation.documentIdentity !== document.identity) return undefined;
  const safe = sanitizeForDiagnostics(document.document);
  return {
    filename: `${document.requestId}.${document.format === "seqviewspec" ? "seqviewspec" : "mvsj"}.json`,
    text: `${JSON.stringify(safe, null, 2)}\n`,
    mediaType: "application/json",
  };
};

export const commitValidationIfCurrent = (
  documents: readonly GeneratedDocument[],
  validation: DocumentValidation,
  current: Readonly<Record<string, DocumentValidation | undefined>>,
): Readonly<Record<string, DocumentValidation | undefined>> =>
  documents.some((document) => document.identity === validation.documentIdentity)
    ? { ...current, [validation.documentIdentity]: validation }
    : current;

export const describeMessageTarget = (message: HarnessMessage): string =>
  message.target === undefined
    ? "unaddressed"
    : "component" in message.target
      ? `component:${message.target.component}`
      : "plugin" in message.target
        ? `plugin:${message.target.plugin}`
        : "capability" in message.target
          ? `capability:${message.target.capability}`
          : "broadcast";

export const downloadPreparedDocument = (download: {
  readonly filename: string;
  readonly text: string;
  readonly mediaType: string;
}): void => {
  const url = URL.createObjectURL(new Blob([download.text], { type: download.mediaType }));
  const anchor = document.createElement("a");
  anchor.download = download.filename;
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
};
