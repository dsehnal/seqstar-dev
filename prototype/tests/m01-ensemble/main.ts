import { MVSData } from "molstar/lib/extensions/mvs/index.js";
import { createMolstarSpikeViewer } from "../../packages/wrapper-molstar/src/p01b/viewer.js";
import { createTransformSpikeMvs, validateTransformSpikeMvs } from "./mvs.js";

const host = document.querySelector<HTMLElement>("#viewer");
const status = document.querySelector<HTMLElement>("#status");
if (host === null || status === null) throw new Error("M01 ensemble spike host is missing.");

async function run(): Promise<void> {
  const viewer = await createMolstarSpikeViewer(host);
  const document = createTransformSpikeMvs("/1A3N.cif");
  const validationIssues = validateTransformSpikeMvs(document);
  if (validationIssues.length > 0)
    throw new Error(`M01 transform spike MVS is invalid: ${validationIssues.join("; ")}`);

  const canvas = viewer.plugin.canvas3d;
  if (canvas === undefined) throw new Error("Mol* Canvas3D did not initialize.");
  await viewer.loadMvsData(MVSData.toMVSJ(document), "mvsj", { sanityChecks: true });

  const firstFrame = await new Promise<{
    readonly drawDurationMs: number;
    readonly reprCount: number;
  }>((resolve) => {
    let armed = false;
    const subscription = canvas.didDraw.subscribe((drawDurationMs) => {
      if (!armed || canvas.reprCount.value < 2) return;
      subscription.unsubscribe();
      resolve({ drawDurationMs, reprCount: canvas.reprCount.value });
    });
    armed = true;
    canvas.requestDraw();
  });

  status.dataset.status = "ready";
  status.textContent = JSON.stringify(
    {
      apiOnly: true,
      biologicalEnsembleClaim: false,
      validationIssues,
      firstFrame,
      structureRoots: 2,
      colors: ["#2563EB", "#F97316"],
      focus: "1A3N-chain-A",
    },
    null,
    2,
  );

  const dispose = (): void => {
    const didDraw = viewer.plugin.canvas3d?.didDraw;
    viewer.dispose();
    viewer.dispose();
    status.dataset.disposeCompleted = "true";
    status.dataset.drawStreamStopped = String(
      didDraw === undefined || didDraw.closed || didDraw.isStopped,
    );
  };
  (
    window as typeof window & { __disposeM01TransformSpike?: () => void }
  ).__disposeM01TransformSpike = dispose;
  window.addEventListener("pagehide", dispose, { once: true });
}

run().catch((error: unknown) => {
  status.dataset.status = "failed";
  status.textContent = error instanceof Error ? (error.stack ?? error.message) : String(error);
});
