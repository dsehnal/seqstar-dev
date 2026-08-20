export type SequenceBaseType = { position: number; aa: string };
export type SeqstarRegion = { readonly start: number; readonly end: number };

declare class NightingaleSequence extends HTMLElement {
  sequence?: string | null;
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
  emitSeqstarInteraction(value: { readonly kind: "hover" | "select" | "activate"; readonly phase: "set" | "clear"; readonly featureId?: string; readonly regions: readonly SeqstarRegion[] }): void;
  waitForSeqstarFirstRender(generation: number, signal?: AbortSignal): Promise<void>;
  setSeqstarInteraction(family: "highlight" | "selection", owner: string, regions: readonly SeqstarRegion[]): void;
  clearSeqstarInteraction(family: "highlight" | "selection", owner: string): void;
  activateSeqstarTrack(): void;
  get data(): string;
  set data(value: string | Record<string, unknown>);
}

export default NightingaleSequence;
