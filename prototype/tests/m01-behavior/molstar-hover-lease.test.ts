import {
  type ComponentContext,
  createApplicationHarness,
  type HarnessComponent,
  type HarnessMessage,
  type InteractionClearCommand,
  type InteractionCommand,
} from "@seq-star/harness-core";
import type { CoordinateLocus, CoordinateSpace, CoordinateTranslator } from "@seq-star/seq-coords";
import { coordinateLocusEquals } from "@seq-star/seq-coords";
import { describe, expect, it } from "vitest";
import { createSyntheticPeptideMvs } from "../../packages/wrapper-molstar/src/p01b/mvs.js";
import type {
  NativeResidueEvent,
  ResidueIdentity,
} from "../../packages/wrapper-molstar/src/p01b/residues.js";
import {
  type MolstarNativeDriver,
  MolstarWrapper,
  residueLocus,
  residueSpace,
} from "../../packages/wrapper-molstar/src/wrapper.js";

const residueA: ResidueIdentity = {
  structureId: "audit-structure",
  modelEntryId: "audit-entry",
  modelId: "audit-model",
  modelIndex: 0,
  modelNumber: 1,
  unitId: 1,
  operatorName: "1_555",
  instanceId: "audit-instance",
  entityId: "1",
  labelAsymId: "A",
  authAsymId: "A",
  labelSeqId: 1,
  authSeqId: 101,
  insertionCode: "",
  componentId: "ALA",
};
const residueB: ResidueIdentity = {
  ...residueA,
  labelSeqId: 2,
  authSeqId: 102,
  componentId: "GLY",
};
const sequenceSpace: CoordinateSpace = {
  id: "audit-sequence",
  kind: "sequence",
  length: 10,
};

class ControlledMolstarDriver implements MolstarNativeDriver {
  private listener: ((event: NativeResidueEvent) => void) | undefined;
  private loadResolve: (() => void) | undefined;
  readonly applyCalls: Array<{ readonly action: string; readonly count: number }> = [];

  stage(): void {}
  loadAndWaitForFirstFrame(_document: unknown, _signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      this.loadResolve = resolve;
    });
  }
  resolveLoad(): void {
    this.loadResolve?.();
  }
  reveal(): void {}
  subscribeNative(listener: (event: NativeResidueEvent) => void): { unsubscribe(): void } {
    this.listener = listener;
    return {
      unsubscribe: () => {
        if (this.listener === listener) this.listener = undefined;
      },
    };
  }
  emit(event: NativeResidueEvent): void {
    this.listener?.(event);
  }
  knownResidues(): readonly ResidueIdentity[] {
    return [residueA, residueB];
  }
  resolve(locus: CoordinateLocus): readonly never[] {
    return [residueA, residueB].some((residue) =>
      coordinateLocusEquals(residueLocus(residue), locus),
    )
      ? ([{}] as readonly never[])
      : [];
  }
  apply(action: "highlight" | "select" | "focus", loci: readonly never[]): void {
    this.applyCalls.push({ action, count: loci.length });
    // The production wrapper's applying guard must suppress this imperative
    // callback. The test itself never publishes interaction.native.
    this.listener?.({ kind: "hover", residues: [residueA] });
  }
  clearView(): Promise<void> {
    return Promise.resolve();
  }
  resize(): void {}
  dispose(): void {
    this.listener = undefined;
  }
}

type OwnedHighlight = {
  readonly interactionId: string;
  readonly owner: InteractionCommand["owner"];
  readonly loci: readonly CoordinateLocus[];
};

class RecordingSequenceComponent implements HarnessComponent {
  readonly capabilities = ["seqstar:coordinates/sequence"] as const;
  readonly highlights = new Map<string, OwnedHighlight>();
  readonly received: HarnessMessage[] = [];
  private subscription: { unsubscribe(): void } | undefined;

  constructor(readonly id: string) {}

  async start(context: ComponentContext): Promise<void> {
    context.reportCoordinateSpaces([sequenceSpace]);
    this.subscription = context.fabric
      .observe({ targetComponent: this.id })
      .subscribe((message) => {
        if (!message.type.startsWith("interaction.highlight")) return;
        this.received.push(message);
        const command = message.payload as unknown as InteractionCommand & InteractionClearCommand;
        const owner = command.owner;
        const key = `${owner.correlationId}\u0000${owner.sourceComponent}`;
        if (message.type.endsWith(".apply")) {
          this.highlights.set(key, {
            interactionId: command.interactionId ?? "",
            owner,
            loci: command.loci,
          });
          return;
        }
        const active = this.highlights.get(key);
        if (
          active !== undefined &&
          (command.interactionId === undefined || command.interactionId === active.interactionId)
        )
          this.highlights.delete(key);
      });
  }

  dispose(): void {
    this.subscription?.unsubscribe();
  }
}

const message = (type: string, payload: unknown, target: string): HarnessMessage => ({
  id: crypto.randomUUID(),
  type,
  version: "0.1.0",
  source: { plugin: "m01-behavior-audit" },
  target: { component: target },
  correlationId: crypto.randomUUID(),
  timestamp: "2026-08-20T00:00:00.000Z",
  payload: payload as never,
});

const translator: CoordinateTranslator = {
  id: "m01-structure-to-sequence",
  source: residueSpace(residueA),
  target: sequenceSpace,
  async map(request) {
    return {
      translatorIds: [this.id],
      diagnostics: [],
      associations: request.loci.map((source) => {
        const label = source.kind === "point" ? source.position.value : "";
        const match = typeof label === "string" ? /^label:(\d+)\|auth:/u.exec(label) : null;
        const value = Number(match?.[1] ?? Number.NaN) - 1;
        return {
          source,
          targets: Number.isInteger(value)
            ? [
                {
                  kind: "point" as const,
                  space: sequenceSpace,
                  position: { kind: "index" as const, value },
                },
              ]
            : [],
          status: Number.isInteger(value) ? ("exact" as const) : ("unmapped" as const),
        };
      }),
    };
  },
};

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
};

describe("M01 production-wrapper hover lease evidence", () => {
  it("reflects Mol* native A -> B -> clear as one replace-only sequence lease", async () => {
    const driver = new ControlledMolstarDriver();
    let sequence: RecordingSequenceComponent | undefined;
    const native: HarnessMessage[] = [];
    const harness = createApplicationHarness(
      {
        id: "m01-hover-lease",
        components: [
          { id: "molstar", type: "m01.molstar" },
          { id: "sequence", type: "m01.sequence" },
        ],
        synchronization: [
          { id: "m01-hover", interaction: "hover", between: ["molstar", "sequence"] },
        ],
      },
      {
        componentFactories: [
          {
            type: "m01.molstar",
            create: ({ id }) =>
              new MolstarWrapper({
                id,
                target: {} as HTMLElement,
                driverFactory: async () => driver,
              }),
          },
          {
            type: "m01.sequence",
            create: ({ id }) => {
              sequence = new RecordingSequenceComponent(id);
              return sequence;
            },
          },
        ],
        frame: (callback) => {
          queueMicrotask(callback);
          return { dispose() {} };
        },
      },
    );
    const subscription = harness.fabric.observe().subscribe((entry) => {
      if (entry.type === "interaction.native") native.push(entry);
    });
    await harness.start();
    harness.translators.register(translator);
    harness.fabric.publish(
      message(
        "visualization.mvs.request",
        {
          format: "mvs",
          requestId: "m01-hover-mvs",
          mode: "replace",
          document: JSON.parse(JSON.stringify(createSyntheticPeptideMvs())),
        },
        "molstar",
      ),
    );
    await flush();
    driver.resolveLoad();
    await flush();
    if (sequence === undefined) throw new Error("Expected the recording sequence component.");

    const unrelatedOwner = {
      correlationId: crypto.randomUUID(),
      sourceComponent: "unrelated-owner",
    };
    const unrelatedLocus: CoordinateLocus = {
      kind: "point",
      space: sequenceSpace,
      position: { kind: "index", value: 8 },
    };
    harness.fabric.publish(
      message(
        "interaction.highlight.apply",
        {
          interactionId: "unrelated-highlight",
          owner: unrelatedOwner,
          mode: "replace",
          loci: [unrelatedLocus],
        },
        "sequence",
      ),
    );

    const state = () =>
      [...sequence.highlights.values()].map((entry) => ({
        owner: entry.owner.sourceComponent,
        interactionId: entry.interactionId,
        positions: entry.loci.map((locus) =>
          locus.kind === "point" && locus.position.kind === "index" ? locus.position.value : -1,
        ),
      }));

    driver.emit({ kind: "hover", residues: [residueA] });
    await flush();
    expect(state()).toEqual([
      { owner: "unrelated-owner", interactionId: "unrelated-highlight", positions: [8] },
      { owner: "molstar", interactionId: expect.any(String), positions: [0] },
    ]);
    driver.emit({ kind: "hover", residues: [residueB] });
    await flush();
    expect(state()).toEqual([
      { owner: "unrelated-owner", interactionId: "unrelated-highlight", positions: [8] },
      { owner: "molstar", interactionId: expect.any(String), positions: [1] },
    ]);
    driver.emit({ kind: "hover", residues: [] });
    await flush();
    expect(state()).toEqual([
      { owner: "unrelated-owner", interactionId: "unrelated-highlight", positions: [8] },
    ]);

    const reflected = sequence.received.filter((entry) =>
      entry.type.startsWith("interaction.highlight"),
    );
    const molstarReflections = reflected.filter(
      (entry) =>
        (entry.payload as unknown as InteractionCommand).owner.sourceComponent === "molstar",
    );
    expect(molstarReflections.map((entry) => entry.type)).toEqual([
      "interaction.highlight.apply",
      "interaction.highlight.apply",
      "interaction.highlight.clear",
    ]);
    const owners = molstarReflections.map(
      (entry) => (entry.payload as unknown as InteractionCommand).owner,
    );
    expect(new Set(owners.map((owner) => owner.correlationId))).toHaveLength(1);
    expect(new Set(owners.map((owner) => owner.sourceComponent))).toEqual(new Set(["molstar"]));
    expect(
      new Set(
        molstarReflections.map(
          (entry) => (entry.payload as unknown as InteractionCommand).interactionId,
        ),
      ),
    ).toHaveLength(1);
    expect(native.map((entry) => (entry.payload as { phase: string }).phase)).toEqual([
      "set",
      "set",
      "clear",
    ]);
    expect(native).toHaveLength(3);
    expect(native.every((entry) => entry.source.component === "molstar")).toBe(true);
    expect(driver.applyCalls.map(({ action, count }) => [action, count])).toEqual([
      ["highlight", 1],
      ["highlight", 1],
      ["highlight", 0],
    ]);

    subscription.unsubscribe();
    await harness.disposeAsync();
  });
});
