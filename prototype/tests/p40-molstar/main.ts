import "../../packages/wrapper-molstar/src/browser-styles.js";
import {
  createEventFabric,
  createMessageSchemaRegistry,
  createTranslatorRegistry,
  type HarnessMessage,
  installCoreMessageSchemas,
} from "../../packages/harness-core/src/index.js";
import { createSyntheticPeptideMvs } from "../../packages/wrapper-molstar/src/p01b/mvs.js";
import { MolstarWrapper } from "../../packages/wrapper-molstar/src/wrapper.js";

const host = document.querySelector<HTMLElement>("#viewer");
const status = document.querySelector<HTMLElement>("#status");
if (host === null || status === null) throw new Error("P40 host is missing.");

const schemas = createMessageSchemaRegistry();
installCoreMessageSchemas(schemas);
const fabric = createEventFabric({ schemas });
const messages: HarnessMessage[] = [];
const spaces: unknown[][] = [];
fabric.observe().subscribe((message) => messages.push(message));
let wrapper: MolstarWrapper | undefined;
let mountSession = 0;
let remountEvidence = { oldCanvasRemoved: true, newCanvasCreated: false };

const publish = (type: string, payload: unknown): void => {
  fabric.publish({
    id: crypto.randomUUID(),
    type,
    version: "0.1.0",
    source: { plugin: "p40-test" },
    target: { component: "molstar" },
    correlationId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    payload: payload as never,
  });
};

const mvsDocument = (): object =>
  JSON.parse(JSON.stringify(createSyntheticPeptideMvs("/synthetic-peptide.pdb"))) as object;

const render = (): void => {
  status.dataset.status = "ready";
  status.textContent = JSON.stringify(
    { messages, spaces, disposed: wrapper === undefined, mountSession, remountEvidence },
    null,
    2,
  );
};

async function start(): Promise<void> {
  mountSession++;
  messages.length = 0;
  spaces.length = 0;
  wrapper = new MolstarWrapper({ id: "molstar", target: host });
  await wrapper.start({
    fabric,
    translators: createTranslatorRegistry(),
    signal: new AbortController().signal,
    reportCapabilities: () => undefined,
    reportCoordinateSpaces: (reported) => spaces.push([...reported]),
  });
  const requestId = `first-${mountSession}`;
  publish("visualization.mvs.request", {
    format: "mvs",
    requestId,
    mode: "replace",
    document: mvsDocument(),
  });
  const result = await waitForRendered(requestId);
  if (!result) throw new Error("Mol* wrapper did not produce a first frame.");
  remountEvidence = {
    ...remountEvidence,
    newCanvasCreated: host.querySelector("canvas") !== null,
  };
  render();
}

async function waitForRendered(requestId: string): Promise<boolean> {
  for (let i = 0; i < 300; i++) {
    if (
      messages.some(
        (message) =>
          message.type === "lifecycle.visualization" &&
          (message.payload as { requestId?: string; status?: string }).requestId === requestId &&
          (message.payload as { status?: string }).status === "rendered",
      )
    )
      return true;
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  }
  return false;
}

(
  window as typeof window & {
    __p40?: {
      replace(): Promise<void>;
      apply(): void;
      unrelated(): void;
      resize(): void;
      dispose(): Promise<void>;
      remount(): Promise<void>;
    };
  }
).__p40 = {
  async replace() {
    publish("visualization.mvs.request", {
      format: "mvs",
      requestId: "replacement",
      mode: "replace",
      document: mvsDocument(),
    });
    if (!(await waitForRendered("replacement"))) throw new Error("Replacement did not render.");
    render();
  },
  apply() {
    const space = spaces.at(-1)?.[0] as { readonly context?: Record<string, string> } | undefined;
    if (space === undefined) throw new Error("No active structural coordinate space.");
    publish("interaction.highlight.apply", {
      interactionId: "highlight",
      owner: { correlationId: "p40-owner", sourceComponent: "p40-test" },
      mode: "replace",
      loci: [{ kind: "point", space, position: { kind: "label", value: "label:1|auth:1" } }],
    });
    render();
  },
  unrelated() {
    const active = spaces.at(-1)?.[0] as { readonly context?: Record<string, string> } | undefined;
    if (active === undefined) throw new Error("No active structural coordinate space.");
    publish("interaction.highlight.apply", {
      interactionId: "unrelated",
      owner: { correlationId: "p40-owner", sourceComponent: "p40-test" },
      mode: "replace",
      loci: [
        {
          kind: "point",
          space: { ...active, context: { ...active.context, structure: "wrong" } },
          position: { kind: "label", value: "label:1|auth:1" },
        },
      ],
    });
    render();
  },
  resize() {
    host.style.width = "70%";
    window.dispatchEvent(new Event("resize"));
  },
  async dispose() {
    await wrapper?.dispose();
    await wrapper?.dispose();
    wrapper = undefined;
    render();
  },
  async remount() {
    const oldCanvas = host.querySelector("canvas");
    await wrapper?.dispose();
    await wrapper?.dispose();
    wrapper = undefined;
    remountEvidence = {
      oldCanvasRemoved: oldCanvas === null || !oldCanvas.isConnected,
      newCanvasCreated: false,
    };
    await start();
  },
};

start().catch((error: unknown) => {
  status.dataset.status = "failed";
  status.textContent = error instanceof Error ? (error.stack ?? error.message) : String(error);
});
