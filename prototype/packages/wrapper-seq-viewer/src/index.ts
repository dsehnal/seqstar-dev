import type { HarnessCorePackageBoundary } from "@seq-star/harness-core";
import type { SeqViewerPackageBoundary } from "@seq-star/seq-viewer";

export interface SeqViewerWrapperPackageBoundary {
  readonly harness: HarnessCorePackageBoundary;
  readonly packageName: "@seq-star/wrapper-seq-viewer";
  readonly viewer: SeqViewerPackageBoundary;
}
