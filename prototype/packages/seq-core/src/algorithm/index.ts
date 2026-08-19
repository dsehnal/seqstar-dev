import type { SeqModelPackageBoundary } from "../model/index.js";

export interface SeqAlgorithmPackageBoundary {
  readonly model: SeqModelPackageBoundary;
  readonly moduleName: "algorithm";
}
