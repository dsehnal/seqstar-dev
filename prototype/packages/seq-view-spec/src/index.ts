import type { SeqCoordsPackageBoundary } from "@seq-star/seq-coords";
import type { SeqModelPackageBoundary } from "@seq-star/seq-core/model";

export interface SeqViewSpecPackageBoundary {
  readonly coordinates: SeqCoordsPackageBoundary;
  readonly model: SeqModelPackageBoundary;
  readonly packageName: "@seq-star/seq-view-spec";
}
