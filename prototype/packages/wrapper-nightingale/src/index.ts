import type { HarnessCorePackageBoundary } from "@seq-star/harness-core";

export interface NightingaleWrapperPackageBoundary {
  readonly harness: HarnessCorePackageBoundary;
  readonly packageName: "@seq-star/wrapper-nightingale";
}
