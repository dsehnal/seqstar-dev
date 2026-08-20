export type Shapes =
  | "rectangle"
  | "roundRectangle"
  | "bridge"
  | "line"
  | "diamond"
  | "chevron"
  | "catFace"
  | "triangle"
  | "wave"
  | "hexagon"
  | "pentagon"
  | "circle"
  | "arrow"
  | "doubleBar"
  | "discontinuosStart"
  | "discontinuos"
  | "discontinuosEnd"
  | "helix"
  | "strand"
  | "leftEndedTag"
  | "rightEndedTag"
  | "doubleEndedTag";

export type FeatureLocation = {
  fragments: Array<{ start: number; end: number }>;
};

export type Feature = {
  accession: string;
  externalId?: string;
  color?: string;
  fill?: string;
  shape?: Shapes;
  tooltipContent?: string;
  type?: string;
  locations?: FeatureLocation[];
  feature?: Feature;
  start?: number;
  end?: number;
  opacity?: number;
  residuesToHighlight?: Array<{ name?: string; position: number }>;
};

export type LayoutOptions = {
  layoutHeight: number;
  margin?: { top: number; bottom: number; left: number; right: number };
  minHeight?: number;
  maxHeight?: number;
  gap?: number;
};

export class DefaultLayout {
  constructor(options: LayoutOptions);
  init(features: Feature[], ...args: unknown[]): void;
  getFeatureYPos(feature?: Feature | string): number;
  getFeatureHeight(...args: unknown[]): number;
}

export class NonOverlappingLayout extends DefaultLayout {}

declare class NightingaleTrack extends HTMLElement {
  data: Feature[];
  fixedHighlight: string | null;
  highlight?: string | null;
  height: number;
  length: number;
  width: number;
  readonly updateComplete: Promise<boolean>;
  seqstarTrackId: string;
  seqstarLayerId: string;
  seqstarGeneration: number;
  seqstarDomId(externalId: string): string;
  emitSeqstarInteraction(value: { readonly kind: "hover" | "select" | "activate"; readonly phase: "set" | "clear"; readonly featureId?: string; readonly regions: readonly { readonly start: number; readonly end: number }[] }): void;
  waitForSeqstarFirstRender(generation: number, signal?: AbortSignal): Promise<void>;
  setSeqstarInteraction(family: "highlight" | "selection", owner: string, regions: readonly { readonly start: number; readonly end: number }[]): void;
  clearSeqstarInteraction(family: "highlight" | "selection", owner: string): void;
  activateSeqstarTrack(): void;
}

export function getColorByType(type: string): string;
export default NightingaleTrack;
