import type { HarnessCorePackageBoundary } from "@seq-star/harness-core";
import type { SeqCoordsPackageBoundary } from "@seq-star/seq-coords";
import type { SeqViewSpecPackageBoundary } from "@seq-star/seq-view-spec";

export interface IntegrationPluginsPackageBoundary {
  readonly coordinates: SeqCoordsPackageBoundary;
  readonly harness: HarnessCorePackageBoundary;
  readonly packageName: "@seq-star/integration-plugins";
  readonly viewSpec: SeqViewSpecPackageBoundary;
}
