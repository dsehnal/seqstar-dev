import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: OverviewPage,
});

function OverviewPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16" data-testid="prototype-shell">
      <p className="font-semibold text-sky-700 text-sm uppercase tracking-[0.16em]">
        Workspace ready
      </p>
      <h1 className="mt-3 max-w-3xl font-bold text-4xl text-slate-950 tracking-tight">
        A modular foundation for interoperable sequence visualization
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-slate-600 leading-8">
        This exploration separates sequence models, visualizer contracts, event composition, and
        visualizer-native state. Case pages expose the same page-scoped harness boundary that later
        packets will connect to local fixtures and wrappers.
      </p>
      <Link
        className="mt-8 inline-flex rounded bg-sky-700 px-4 py-2 font-semibold text-white"
        to="/renderer-portability"
      >
        Explore case shells
      </Link>
    </main>
  );
}
