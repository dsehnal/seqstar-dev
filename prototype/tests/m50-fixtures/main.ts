import { MVSData } from "molstar/lib/extensions/mvs/index.js";
import type { MVSData as MvsDocument } from "molstar/lib/extensions/mvs/mvs-data.js";
import { createMolstarSpikeViewer } from "../../packages/wrapper-molstar/src/p01b/viewer.js";

const mvsPath = "/expected/PF00042.29-4-root-ensemble.mvsj";
const host = document.querySelector<HTMLElement>("#viewer");
const status = document.querySelector<HTMLElement>("#status");
if (host === null || status === null) throw new Error("M50 ensemble fixture host is missing.");

type MvsNode = {
  readonly kind?: string;
  readonly params?: { readonly url?: string; readonly color?: string };
  readonly children?: readonly MvsNode[];
};

const findNodes = (node: MvsNode | undefined, kind: string): readonly MvsNode[] => [
  ...(node?.kind === kind ? [node] : []),
  ...(node?.children?.flatMap((child) => findNodes(child, kind)) ?? []),
];

async function run(): Promise<void> {
  const response = await fetch(mvsPath, { cache: "no-store" });
  if (!response.ok) throw new Error(`M50 MVS fixture failed to load: ${response.status}`);
  const document = MVSData.fromMVSJ(await response.text()) as MvsDocument;
  const validationIssues = MVSData.validationIssues(document, { noExtra: true }) ?? [];
  if (validationIssues.length > 0)
    throw new Error(`M50 ensemble MVS is invalid: ${validationIssues.join("; ")}`);

  const root = document.kind === "multiple" ? document.snapshots[0]?.root : document.root;
  const urls = findNodes(root, "download").map((node) => node.params?.url);
  const colors = findNodes(root, "color").map((node) => node.params?.color);
  if (urls.length !== 4 || colors.length !== 4)
    throw new Error("M50 ensemble MVS does not contain exactly four structures and colors.");

  const viewer = await createMolstarSpikeViewer(host);
  const canvas = viewer.plugin.canvas3d;
  if (canvas === undefined) throw new Error("Mol* Canvas3D did not initialize.");
  await viewer.loadMvsData(MVSData.toMVSJ(document), "mvsj", { sanityChecks: true });
  const firstFrame = await new Promise<{
    readonly drawDurationMs: number;
    readonly reprCount: number;
  }>((resolve) => {
    let armed = false;
    const subscription = canvas.didDraw.subscribe((drawDurationMs) => {
      if (!armed || canvas.reprCount.value < 4) return;
      subscription.unsubscribe();
      resolve({ drawDurationMs, reprCount: canvas.reprCount.value });
    });
    armed = true;
    canvas.requestDraw();
  });

  status.dataset.status = "ready";
  status.textContent = JSON.stringify(
    {
      biologicalEnsembleClaim: false,
      validationIssues,
      mvsPath,
      structureRoots: urls.length,
      urls,
      colors,
      focus: "experimental 1A3N chain A",
      firstFrame,
    },
    null,
    2,
  );

  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    const didDraw = viewer.plugin.canvas3d?.didDraw;
    viewer.dispose();
    viewer.dispose();
    status.dataset.disposeCallCount = "2";
    status.dataset.disposeCompleted = "true";
    status.dataset.drawStreamStopped = String(
      didDraw === undefined || didDraw.closed || didDraw.isStopped,
    );
  };
  (
    window as typeof window & { __disposeM50EnsembleFixture?: () => void }
  ).__disposeM50EnsembleFixture = dispose;
  window.addEventListener("pagehide", dispose, { once: true });
}

run().catch((error: unknown) => {
  status.dataset.status = "failed";
  status.textContent = error instanceof Error ? (error.stack ?? error.message) : String(error);
});
