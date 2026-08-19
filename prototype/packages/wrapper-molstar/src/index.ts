import type { HarnessCorePackageBoundary } from "@seq-star/harness-core";

export interface MolstarWrapperPackageBoundary {
  readonly harness: HarnessCorePackageBoundary;
  readonly packageName: "@seq-star/wrapper-molstar";
}
