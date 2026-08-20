import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: OverviewPage,
});

function OverviewPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16" data-testid="prototype-shell">
      <p className="font-semibold text-sky-700 text-sm uppercase tracking-[0.16em]">
        Vibe-coded research prototype
      </p>
      <h1 className="mt-3 max-w-3xl font-bold text-4xl text-slate-950 tracking-tight">
        A harness for interoperable molecular and biological visualization
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-slate-600 leading-8">
        This exploration connects many kinds of source data—including sequences, alignments,
        annotations, coordinate mappings, experimental structures, predicted models, live tomograms,
        particle annotations, and EM densities—to independent spatial, 1D, and 3D renderers through
        a shared interaction harness.
      </p>
      <p className="mt-6 max-w-2xl rounded-lg border border-amber-300/70 bg-amber-50/80 px-4 py-3 text-amber-950 leading-7">
        This is a vibe-coded prototype, not a product. It is intended to test interaction contracts,
        local fixture pipelines, and presentation ideas—not for production use or scientific
        decision-making.
      </p>
    </main>
  );
}
