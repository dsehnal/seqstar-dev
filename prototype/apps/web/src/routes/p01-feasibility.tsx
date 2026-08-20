import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import "molstar/build/viewer/molstar.css";
import type { MolstarSpikeViewer, NativeResidueEvent } from "@seq-star/wrapper-molstar";
import {
  applySpikeHighlight,
  applySpikeSelection,
  clearSpikeHighlight,
  clearSpikeSelection,
  createMolstarSpikeViewer,
  extractResidues,
  findStructureLoci,
  loadSyntheticPeptide,
  subscribeNativeResidueHover,
  subscribeNativeResidueSelection,
} from "@seq-star/wrapper-molstar";
import {
  mountNightingaleFeasibilitySpike,
  type NightingaleFeasibilitySpike,
} from "@seq-star/wrapper-nightingale/p01a-feasibility-spike";

export const Route = createFileRoute("/p01-feasibility")({ component: P01FeasibilityPage });

type Evidence = {
  firstFrame: { drawDurationMs: number; representationCount: number };
  nativeHover: NativeResidueEvent[];
  nativeSelection: NativeResidueEvent[];
  residue: { authAsymId: string; authSeqId: number };
  external?: {
    highlightAfterApply: number;
    highlightAfterClear: number;
    nativeEventCountBefore: number;
    nativeEventCountAfter: number;
    selectionAfterApply: number;
    selectionAfterClear: number;
  };
  disposal?: { canvasRemoved: boolean; pluginDisposed: boolean; subscriptionClosed: boolean };
};
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function P01FeasibilityPage() {
  const nightingaleTarget = useRef<HTMLDivElement>(null);
  const molstarTarget = useRef<HTMLDivElement>(null);
  const nightingale = useRef<NightingaleFeasibilitySpike | undefined>(undefined);
  const viewer = useRef<MolstarSpikeViewer | undefined>(undefined);
  const evidence = useRef<Evidence | undefined>(undefined);
  const [session, setSession] = useState(1);
  const [nightingaleStatus, setNightingaleStatus] = useState("loading");
  const [molstarStatus, setMolstarStatus] = useState("loading");
  const [nightingaleText, setNightingaleText] = useState("");
  const [molstarText, setMolstarText] = useState("");

  useEffect(() => {
    const target = nightingaleTarget.current;
    if (!target) return;
    const spike = mountNightingaleFeasibilitySpike(target);
    nightingale.current = spike;
    void spike.ready.then(
      (result) => {
        setNightingaleText(
          JSON.stringify({ ...result, blockElementId: spike.getFeatureElementId() }),
        );
        setNightingaleStatus("ready");
      },
      (error: unknown) =>
        setNightingaleStatus(error instanceof Error ? error.message : String(error)),
    );
    return () => {
      spike.dispose();
      if (nightingale.current === spike) nightingale.current = undefined;
    };
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    const target = molstarTarget.current;
    if (!target) return;
    void (async () => {
      const instance = await createMolstarSpikeViewer(target);
      if (cancelled) return instance.dispose();
      viewer.current = instance;
      const firstFrame = await loadSyntheticPeptide(instance);
      const schema = { auth_asym_id: "A", auth_seq_id: 1 } as const;
      const loci = findStructureLoci(instance, schema).find(
        (candidate) => extractResidues(candidate).length > 0,
      );
      const residue = loci && extractResidues(loci)[0];
      if (!residue) throw new Error("Mol* did not resolve synthetic residue A/1 to a native locus");
      const current: Evidence = {
        firstFrame,
        nativeHover: [],
        nativeSelection: [],
        residue: { authAsymId: residue.authAsymId, authSeqId: residue.authSeqId },
      };
      const publish = () => setMolstarText(JSON.stringify(current));
      const hover = subscribeNativeResidueHover(instance, (event) => {
        if (event.residues.length > 0) {
          current.nativeHover.push(event);
          publish();
        }
      });
      const selection = subscribeNativeResidueSelection(instance, (event) => {
        current.nativeSelection.push(event);
        publish();
      });
      evidence.current = current;
      publish();
      setMolstarStatus("ready");
      return () => {
        hover.unsubscribe();
        selection.unsubscribe();
      };
    })().catch((error: unknown) => {
      if (!cancelled) setMolstarStatus(error instanceof Error ? error.message : String(error));
    });
    return () => {
      cancelled = true;
      viewer.current?.dispose();
      viewer.current = undefined;
    };
  }, [session]);

  const proveNightingale = async () => {
    const spike = nightingale.current;
    if (!spike) return;
    spike.setHighlight(8, 24);
    await frame();
    const applied = spike.getHighlightElementCount();
    spike.clearHighlight();
    await frame();
    setNightingaleText(
      JSON.stringify({
        highlightAfterApply: applied,
        highlightAfterClear: spike.getHighlightElementCount(),
        blockElementId: spike.getFeatureElementId(),
      }),
    );
  };
  const proveExternal = () => {
    const instance = viewer.current;
    const current = evidence.current;
    if (!instance || !current) return;
    const schema = { auth_asym_id: "A", auth_seq_id: 1 } as const;
    const highlights = instance.plugin.managers.interactivity.lociHighlights as unknown as {
      prev?: unknown[];
    };
    const before = current.nativeHover.length + current.nativeSelection.length;
    applySpikeHighlight(instance, schema);
    const highlightAfterApply = highlights.prev?.length ?? -1;
    clearSpikeHighlight(instance);
    const highlightAfterClear = highlights.prev?.length ?? -1;
    applySpikeSelection(instance, schema);
    const selectionAfterApply = instance.plugin.managers.structure.selection.elementCount();
    clearSpikeSelection(instance);
    current.external = {
      highlightAfterApply,
      highlightAfterClear,
      nativeEventCountBefore: before,
      nativeEventCountAfter: current.nativeHover.length + current.nativeSelection.length,
      selectionAfterApply,
      selectionAfterClear: instance.plugin.managers.structure.selection.elementCount(),
    };
    setMolstarText(JSON.stringify(current));
  };
  const disposeAndRemount = () => {
    const instance = viewer.current;
    const target = molstarTarget.current;
    const current = evidence.current;
    if (instance && target && current) {
      const lifecycle = instance.plugin.behaviors.interaction.hover.subscribe(() => {});
      instance.dispose();
      current.disposal = {
        canvasRemoved: !target.querySelector("canvas"),
        pluginDisposed: Boolean((instance.plugin as unknown as { disposed?: boolean }).disposed),
        subscriptionClosed: lifecycle.closed,
      };
      setMolstarText(JSON.stringify(current));
    }
    nightingale.current?.dispose();
    viewer.current = undefined;
    setSession((value) => value + 1);
  };
  return (
    <main
      className="mx-auto grid min-w-0 max-w-6xl gap-8 px-6 py-10"
      data-testid="p01-feasibility-page"
    >
      <section>
        <p className="font-semibold text-sky-700 text-sm uppercase tracking-[0.16em]">P01 gate</p>
        <h1 className="mt-2 font-bold text-3xl text-slate-950">Offline renderer feasibility</h1>
      </section>
      <section className="min-w-0 rounded border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-xl text-slate-900">
          Nightingale renderer-output feasibility
        </h2>
        <output
          className="mt-3 block max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950 p-3 font-mono text-slate-100 text-xs"
          data-session={session}
          data-source="workspace-local"
          data-status={nightingaleStatus}
          data-testid="p01a-status"
        >
          {nightingaleText || nightingaleStatus}
        </output>
        <button onClick={proveNightingale} type="button">
          Prove Nightingale highlight
        </button>
        <div className="mt-4 min-w-0 max-w-full overflow-x-auto" ref={nightingaleTarget} />
      </section>
      <section className="min-w-0 rounded border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-xl text-slate-900">
          Mol* interaction-stream/locus normalization feasibility
        </h2>
        <output
          className="mt-3 block max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950 p-3 font-mono text-slate-100 text-xs"
          data-session={session}
          data-source="synthetic-data-uri"
          data-status={molstarStatus}
          data-testid="p01b-status"
        >
          {molstarText || molstarStatus}
        </output>
        <button onClick={proveExternal} type="button">
          Prove external Mol* commands
        </button>
        <div
          className="relative mt-4 h-[420px] min-w-0 max-w-full overflow-hidden rounded border border-slate-200"
          data-testid="p01b-canvas-host"
          ref={molstarTarget}
        />
      </section>
      <button onClick={disposeAndRemount} type="button">
        Dispose and remount feasibility probes
      </button>
    </main>
  );
}
