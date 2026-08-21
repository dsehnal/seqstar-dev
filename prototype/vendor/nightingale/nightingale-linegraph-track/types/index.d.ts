export type LineValue = {
  position: number;
  value: number;
};

export type LineData = {
  name: string;
  externalId?: string;
  range: number[];
  color?: string;
  fill?: string;
  lineCurve?: string;
  values: LineValue[];
};

declare class NightingaleLinegraphTrack extends HTMLElement {
  data: LineData[] | undefined;
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

export default NightingaleLinegraphTrack;
