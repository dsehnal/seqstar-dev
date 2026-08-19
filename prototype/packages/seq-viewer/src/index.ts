import type { SeqCoordsPackageBoundary } from "@seq-star/seq-coords";
import type { SeqModelPackageBoundary } from "@seq-star/seq-core/model";
import type { SeqViewSpecPackageBoundary } from "@seq-star/seq-view-spec";

export interface SeqViewerPackageBoundary {
  readonly coordinates: SeqCoordsPackageBoundary;
  readonly model: SeqModelPackageBoundary;
  readonly packageName: "@seq-star/seq-viewer";
  readonly viewSpec: SeqViewSpecPackageBoundary;
}
