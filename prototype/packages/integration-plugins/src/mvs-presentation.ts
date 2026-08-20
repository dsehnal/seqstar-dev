import type { MVSData as MvsDocument } from "molstar/lib/extensions/mvs/mvs-data.js";
import type { Structure } from "molstar/lib/extensions/mvs/tree/mvs/mvs-builder.js";
import type { ComponentExpressionT } from "molstar/lib/extensions/mvs/tree/mvs/param-types.js";

/** A selector produced by a checked coordinate mapping, never by this presentation helper. */
export type MvsResidueSelector = Readonly<ComponentExpressionT>;

/** A mapped semantic group whose colors have already been evaluated by its integration plugin. */
export interface MvsResidueColorGroup {
  readonly semanticId: string;
  readonly color: `#${string}`;
  /** Larger values win when groups address the same mapped selector. Equal-priority conflicts fail. */
  readonly precedence: number;
  readonly selectors: readonly MvsResidueSelector[];
}

/** Explicit opt-in detail for a small semantic group; it is intentionally not a per-residue API. */
export interface MvsAtomicDetailGroup {
  readonly semanticId: string;
  readonly color: `#${string}`;
  readonly selectors: readonly MvsResidueSelector[];
}

/** One intentionally distinct polymer presentation. */
export interface MvsCartoonStyle {
  readonly componentSelector: MvsResidueSelector;
  readonly baseColor: `#${string}`;
  readonly residueColors: readonly MvsResidueColorGroup[];
  readonly atomicDetail?: MvsAtomicDetailGroup;
}

export interface MvsPresentationSummary {
  readonly cartoonComponents: number;
  readonly cartoonRepresentations: number;
  readonly selectorColorNodes: number;
  readonly atomicDetailComponents: number;
  readonly atomicDetailRepresentations: number;
}

type MvsTreeNode = Readonly<{
  readonly kind: string;
  readonly params?: unknown;
  readonly children?: readonly MvsTreeNode[];
}>;

const compareCanonical = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1;

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => compareCanonical(left, right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
};

const snapshot = <T>(value: T): T => JSON.parse(canonicalJson(value)) as T;

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const uniqueSortedSelectors = (
  selectors: readonly MvsResidueSelector[],
): readonly MvsResidueSelector[] =>
  Object.freeze(
    [...new Map(selectors.map((selector) => [canonicalJson(selector), selector])).entries()]
      .sort(([left], [right]) => compareCanonical(left, right))
      .map(([, selector]) => deepFreeze(snapshot(selector))),
  );

/**
 * Resolve caller-supplied semantic precedence, then collect equal final colors.
 * Callers must provide a total semantic ordering: larger precedence overlays smaller precedence.
 * Equal precedence with different colors is ambiguous and rejected instead of choosing arbitrarily.
 */
const colorGroups = (
  groups: readonly MvsResidueColorGroup[],
): readonly Readonly<{ color: `#${string}`; selectors: readonly MvsResidueSelector[] }>[] => {
  const candidates = new Map<
    string,
    {
      readonly color: `#${string}`;
      readonly precedence: number;
      readonly selector: MvsResidueSelector;
    }[]
  >();
  for (const group of groups) {
    for (const selector of group.selectors) {
      const key = canonicalJson(selector);
      const existing = candidates.get(key) ?? [];
      existing.push({ color: group.color, precedence: group.precedence, selector });
      candidates.set(key, existing);
    }
  }
  const selectorsByColor = new Map<string, MvsResidueSelector[]>();
  for (const [key, options] of candidates) {
    const precedence = Math.max(...options.map((option) => option.precedence));
    const winners = options.filter((option) => option.precedence === precedence);
    const colors = new Set(winners.map((winner) => winner.color));
    if (colors.size !== 1)
      throw new Error(
        `Ambiguous colors for mapped selector ${key} at precedence ${String(precedence)}.`,
      );
    const winner = winners[0];
    if (winner === undefined) throw new Error("Selector winner unexpectedly missing.");
    const existing = selectorsByColor.get(winner.color) ?? [];
    existing.push(winner.selector);
    selectorsByColor.set(winner.color, existing);
  }
  return Object.freeze(
    [...selectorsByColor.entries()]
      .sort(([left], [right]) => compareCanonical(left, right))
      .map(([color, selectors]) =>
        Object.freeze({
          color: color as `#${string}`,
          selectors: uniqueSortedSelectors(selectors),
        }),
      )
      .filter((group) => group.selectors.length > 0),
  );
};

const styleKey = (style: MvsCartoonStyle): string =>
  canonicalJson({
    atomicDetail:
      style.atomicDetail === undefined
        ? undefined
        : {
            color: style.atomicDetail.color,
            semanticId: style.atomicDetail.semanticId,
            selectors: uniqueSortedSelectors(style.atomicDetail.selectors),
          },
    baseColor: style.baseColor,
    componentSelector: snapshot(style.componentSelector),
    residueColors: colorGroups(style.residueColors),
  });

/**
 * Append deterministic polymer cartoons to an existing MVS structure.
 * Mapping, semantic precedence, and color evaluation deliberately remain with callers.
 */
export const appendMvsCartoonPresentation = (
  structure: Structure,
  styles: readonly MvsCartoonStyle[],
): MvsPresentationSummary => {
  const seenComponents = new Set<string>();
  for (const style of styles) {
    const key = canonicalJson(style.componentSelector);
    if (seenComponents.has(key))
      throw new Error(`Duplicate cartoon component selector ${key}; refusing duplicate geometry.`);
    seenComponents.add(key);
  }
  let selectorColorNodes = 0;
  let atomicDetailComponents = 0;
  for (const style of [...styles].sort((left, right) =>
    compareCanonical(styleKey(left), styleKey(right)),
  )) {
    const cartoon = structure
      .component({ selector: deepFreeze(snapshot(style.componentSelector)) })
      .representation({ type: "cartoon" })
      .color({ color: style.baseColor });
    for (const group of colorGroups(style.residueColors)) {
      cartoon.color({
        color: group.color,
        selector: group.selectors.map((selector) => snapshot(selector)),
      });
      selectorColorNodes++;
    }
    const detail = style.atomicDetail;
    if (detail === undefined) continue;
    const selectors = uniqueSortedSelectors(detail.selectors);
    if (selectors.length === 0) continue;
    structure
      .component({ selector: selectors.map((selector) => snapshot(selector)) })
      .representation({ type: "ball_and_stick" })
      .color({ color: detail.color });
    atomicDetailComponents++;
  }
  return Object.freeze({
    cartoonComponents: styles.length,
    cartoonRepresentations: styles.length,
    selectorColorNodes,
    atomicDetailComponents,
    atomicDetailRepresentations: atomicDetailComponents,
  });
};

const rootsForDocument = (document: MvsDocument): readonly MvsTreeNode[] =>
  document.kind === "multiple"
    ? document.snapshots.map((snapshot) => snapshot.root as MvsTreeNode)
    : [document.root as MvsTreeNode];

/**
 * Pure structural query for generated MVS documents. Returned snapshots are detached and deeply frozen,
 * so assertion code cannot mutate the source document or retain aliases into it.
 */
export const queryMvsTree = (document: MvsDocument, kind?: string): readonly MvsTreeNode[] => {
  const found: MvsTreeNode[] = [];
  const visit = (node: MvsTreeNode): void => {
    if (kind === undefined || node.kind === kind) found.push(deepFreeze(snapshot(node)));
    for (const child of node.children ?? []) visit(child);
  };
  for (const root of rootsForDocument(document)) visit(root);
  return Object.freeze(found);
};

/** Pure per-kind node counts for compact structural assertions. */
export const countMvsTreeNodes = (document: MvsDocument): Readonly<Record<string, number>> => {
  const counts: Record<string, number> = {};
  for (const node of queryMvsTree(document)) counts[node.kind] = (counts[node.kind] ?? 0) + 1;
  return Object.freeze(counts);
};

/** Pure representation counts keyed by the pinned MVS representation type. */
export const countMvsRepresentationTypes = (
  document: MvsDocument,
): Readonly<Record<string, number>> => {
  const counts: Record<string, number> = {};
  for (const node of queryMvsTree(document, "representation")) {
    const type =
      node.params !== null && typeof node.params === "object"
        ? (node.params as { readonly type?: unknown }).type
        : undefined;
    if (typeof type === "string") counts[type] = (counts[type] ?? 0) + 1;
  }
  return Object.freeze(counts);
};
