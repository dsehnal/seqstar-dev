import type { SeqCoordsPackageBoundary } from "@seq-star/seq-coords";
import type { SeqCorePackageBoundary } from "@seq-star/seq-core";

export interface HarnessCorePackageBoundary {
  readonly coordinates: SeqCoordsPackageBoundary;
  readonly diagnostics: SeqCorePackageBoundary;
  readonly packageName: "@seq-star/harness-core";
}
