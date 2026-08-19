import { createFileRoute } from "@tanstack/react-router";

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
        The toolchain, package boundaries, and browser verification skeleton are in place. Domain
        behavior will arrive in reviewed implementation packets.
      </p>
    </main>
  );
}
