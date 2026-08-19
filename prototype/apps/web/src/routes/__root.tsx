import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="min-h-screen">
      <header className="border-slate-200 border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center px-6 py-5">
          <span className="font-semibold text-slate-900 text-xl">Seq* Prototype</span>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
