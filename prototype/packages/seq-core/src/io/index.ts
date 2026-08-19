import type { SeqDataPackageBoundary } from "../data/index.js";
import type { SeqModelPackageBoundary } from "../model/index.js";

export interface SeqIoPackageBoundary {
  readonly data: SeqDataPackageBoundary;
  readonly model: SeqModelPackageBoundary;
  readonly moduleName: "io";
}
