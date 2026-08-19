import type { HarnessCorePackageBoundary } from "@seq-star/harness-core";

export {
  mountNightingaleFeasibilitySpike,
  type NightingaleFeasibilitySpike,
  type NightingaleSpikeEvidence,
} from "./p01a-feasibility-spike.js";

export interface NightingaleWrapperPackageBoundary {
  readonly harness: HarnessCorePackageBoundary;
  readonly packageName: "@seq-star/wrapper-nightingale";
}
