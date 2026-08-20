import { createRootRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="min-h-screen">
      <header className="border-slate-200 border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-5">
          <Link className="font-semibold text-slate-900 text-xl" to="/">
            Seq* Prototype
          </Link>
          <nav aria-label="Case studies" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <Link activeProps={{ "aria-current": "page" }} to="/renderer-portability">
              Renderer portability
            </Link>
            <Link activeProps={{ "aria-current": "page" }} to="/uniprot-structure">
              UniProt + structure
            </Link>
            <Link activeProps={{ "aria-current": "page" }} to="/complex">
              Complex
            </Link>
            <Link activeProps={{ "aria-current": "page" }} to="/alignment-structure">
              Alignment + structure
            </Link>
            <Link activeProps={{ "aria-current": "page" }} to="/cds-protein">
              CDS + protein
            </Link>
            <Link activeProps={{ "aria-current": "page" }} to="/p01-feasibility">
              P01 evidence
            </Link>
            <Link activeProps={{ "aria-current": "page" }} to="/reference-viewer">
              Reference viewer
            </Link>
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
