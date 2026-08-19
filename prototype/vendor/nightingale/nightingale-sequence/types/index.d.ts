export type SequenceBaseType = { position: number; aa: string };

declare class NightingaleSequence extends HTMLElement {
  sequence?: string | null;
  fixedHighlight: string | null;
  highlight?: string | null;
  height: number;
  length: number;
  width: number;
  readonly updateComplete: Promise<boolean>;
  get data(): string;
  set data(value: string | Record<string, unknown>);
}

export default NightingaleSequence;

