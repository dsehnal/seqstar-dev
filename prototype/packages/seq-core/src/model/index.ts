import type { SeqDataPackageBoundary } from "../data/index.js";

export interface SeqModelPackageBoundary {
  readonly data: SeqDataPackageBoundary;
  readonly moduleName: "model";
}
