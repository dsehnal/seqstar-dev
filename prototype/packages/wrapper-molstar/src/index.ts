import type { HarnessCorePackageBoundary } from "@seq-star/harness-core";

export type {
  FirstFrameEvidence,
  MolstarSpikeViewer,
  NativeResidueEvent,
  ResidueIdentity,
} from "./p01b/index.js";
export {
  applySpikeHighlight,
  applySpikeSelection,
  clearSpikeHighlight,
  clearSpikeSelection,
  createMolstarSpikeViewer,
  createSyntheticPeptideMvs,
  extractResidues,
  findStructureLoci,
  loadSyntheticPeptide,
  subscribeNativeResidueHover,
  subscribeNativeResidueSelection,
  validateMvs,
} from "./p01b/index.js";

export interface MolstarWrapperPackageBoundary {
  readonly harness: HarnessCorePackageBoundary;
  readonly packageName: "@seq-star/wrapper-molstar";
}
