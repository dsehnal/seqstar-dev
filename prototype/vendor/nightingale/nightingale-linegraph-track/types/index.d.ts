export type LineValue = {
  position: number;
  value: number;
};

export type LineData = {
  name: string;
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
}

export default NightingaleLinegraphTrack;

