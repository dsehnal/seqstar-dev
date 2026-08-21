import { Viewer } from "molstar/lib/apps/viewer/app.js";
import { MVSData } from "molstar/lib/extensions/mvs/index.js";
import type { StructureElement } from "molstar/lib/mol-model/structure.js";
import { createSyntheticPeptideMvs, validateMvs } from "./mvs.js";

export type MolstarSpikeViewer = Viewer;

export interface FirstFrameEvidence {
  readonly representationCount: number;
  readonly drawDurationMs: number;
}

export async function createMolstarSpikeViewer(target: HTMLElement): Promise<Viewer> {
  return Viewer.create(target, {
    extensions: ["mvs"],
    layoutIsExpanded: false,
    layoutShowControls: false,
    layoutShowSequence: false,
    layoutShowLog: false,
    layoutShowLeftPanel: false,
    layoutShowRemoteState: false,
    viewportShowControls: false,
    volumeStreamingDisabled: true,
  });
}

/**
 * Load the checked-in local structure and resolve only after a requested canvas
 * draw reports at least one representation. No timer is used as readiness.
 */
export async function loadSyntheticPeptide(
  viewer: Viewer,
  structureUrl?: string,
): Promise<FirstFrameEvidence> {
  const document = createSyntheticPeptideMvs(structureUrl);
  const issues = validateMvs(document);
  if (issues.length > 0) throw new Error(`Invalid P01b MVS: ${issues.join("; ")}`);

  const canvas = viewer.plugin.canvas3d;
  if (!canvas) throw new Error("Mol* Canvas3D did not initialize");

  await viewer.loadMvsData(MVSData.toMVSJ(document), "mvsj", {
    sanityChecks: true,
  });

  const frame = new Promise<FirstFrameEvidence>((resolve) => {
    let armed = false;
    let subscription: { unsubscribe(): void } | undefined;
    subscription = canvas.didDraw.subscribe((drawDurationMs) => {
      if (!armed) return;
      const representationCount = canvas.reprCount.value;
      if (representationCount === 0) return;
      subscription?.unsubscribe();
      resolve({ representationCount, drawDurationMs });
    });
    armed = true;
  });
  canvas.requestDraw();
  return frame;
}

export function applySpikeHighlight(viewer: Viewer, elements: StructureElement.Schema): void {
  viewer.structureInteractivity({ action: "highlight", elements });
}

export function clearSpikeHighlight(viewer: Viewer): void {
  viewer.structureInteractivity({ action: "highlight" });
}

export function applySpikeSelection(viewer: Viewer, elements: StructureElement.Schema): void {
  viewer.structureInteractivity({ action: "select", elements });
}

export function clearSpikeSelection(viewer: Viewer): void {
  viewer.structureInteractivity({ action: "select" });
}
