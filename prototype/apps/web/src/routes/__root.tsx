import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { Atom, ChevronDown } from "lucide-react";
import { useLayoutEffect, useRef } from "react";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const headerRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (header === null) return;

    const syncHeaderHeight = () => {
      document.documentElement.style.setProperty(
        "--shell-header-height",
        `${Math.ceil(header.getBoundingClientRect().height)}px`,
      );
    };

    syncHeaderHeight();
    const observer = new ResizeObserver(syncHeaderHeight);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="app-shell min-h-screen">
      <header className="app-shell-header" ref={headerRef}>
        <div className="app-shell-header__inner">
          <Link className="app-brand" to="/" activeProps={{ "aria-current": "page" }}>
            <Atom aria-hidden="true" className="app-brand__icon" size={20} strokeWidth={1.8} />
            <span>Mol* Harness Prototype</span>
          </Link>
          <nav aria-label="Case studies" className="app-nav">
            <Link
              activeProps={{ "aria-current": "page" }}
              search={{ renderer: undefined }}
              to="/uniprot-structure"
            >
              Protein + structure
            </Link>
            <Link
              activeProps={{ "aria-current": "page" }}
              search={{ renderer: undefined }}
              to="/complex"
            >
              Protein complex
            </Link>
            <Link
              activeProps={{ "aria-current": "page" }}
              search={{ renderer: undefined }}
              to="/alignment-structure"
            >
              Alignment ensemble
            </Link>
            <Link
              activeProps={{ "aria-current": "page" }}
              search={{ renderer: undefined }}
              to="/cds-protein"
            >
              CDS translation
            </Link>
            <Link
              activeProps={{ "aria-current": "page" }}
              search={{ renderer: undefined, particleSet: undefined }}
              to="/cryoet-tomogram"
            >
              Tomogram to molecule
            </Link>
            <details className="app-nav__more">
              <summary>
                More
                <ChevronDown aria-hidden="true" size={14} strokeWidth={1.8} />
              </summary>
              <div className="app-nav__menu">
                <Link
                  activeProps={{ "aria-current": "page" }}
                  search={{ renderer: undefined }}
                  to="/renderer-portability"
                >
                  Renderer comparison
                </Link>
                <Link activeProps={{ "aria-current": "page" }} to="/p01-feasibility">
                  Compatibility lab
                </Link>
                <Link activeProps={{ "aria-current": "page" }} to="/reference-viewer">
                  Reference sequence viewer lab
                </Link>
              </div>
            </details>
          </nav>
        </div>
      </header>
      <div className="app-shell-content">
        <Outlet />
      </div>
    </div>
  );
}
