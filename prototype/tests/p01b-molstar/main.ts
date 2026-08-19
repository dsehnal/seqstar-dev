import {
  createMolstarSpikeViewer,
  extractResidues,
  findStructureLoci,
  loadSyntheticPeptide,
  subscribeNativeResidueHover,
  subscribeNativeResidueSelection,
} from "../../packages/wrapper-molstar/src/index.js";

function requiredElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`P01b spike host is missing ${selector}`);
  return element;
}

const target = requiredElement("#viewer");
const status = requiredElement("#status");

async function run(): Promise<void> {
  const viewer = await createMolstarSpikeViewer(target);
  const firstFrame = await loadSyntheticPeptide(viewer, "/synthetic-peptide.pdb");
  const residueOne = { auth_asym_id: "A", auth_seq_id: 1 } as const;
  const loci = findStructureLoci(viewer, residueOne).find(
    (candidate) => extractResidues(candidate).length > 0,
  );
  if (!loci) throw new Error("Mol* did not resolve residue A/1 to native loci");

  const nativeHover: unknown[] = [];
  const nativeSelection: unknown[] = [];
  const hoverSubscription = subscribeNativeResidueHover(viewer, (event) => {
    if (event.residues.length > 0) nativeHover.push(event);
  });
  const selectionSubscription = subscribeNativeResidueSelection(viewer, (event) => {
    nativeSelection.push(event);
  });

  const evidence = {
    firstFrame,
    nativeHover,
    nativeSelection,
    residue: extractResidues(loci)[0],
    selectedElementCount: viewer.plugin.managers.structure.selection.elementCount(),
    selectionAfterClear: viewer.plugin.managers.structure.selection.elementCount(),
  };
  status.dataset.status = "ready";
  status.textContent = JSON.stringify(evidence, null, 2);

  const dispose = (): void => {
    const didDraw = viewer.plugin.canvas3d?.didDraw;
    viewer.dispose();
    viewer.dispose();
    hoverSubscription.unsubscribe();
    selectionSubscription.unsubscribe();
    status.dataset.disposeCompleted = "true";
    status.dataset.drawStreamStopped = String(
      didDraw === undefined || didDraw.closed || didDraw.isStopped,
    );
  };
  (
    window as typeof window & {
      __disposeP01bMolstar?: () => void;
    }
  ).__disposeP01bMolstar = dispose;
  window.addEventListener("pagehide", dispose, { once: true });
}

run().catch((error: unknown) => {
  status.dataset.status = "failed";
  status.textContent = error instanceof Error ? (error.stack ?? error.message) : String(error);
});
