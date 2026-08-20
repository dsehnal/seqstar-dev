import { createHashHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

// Keep the pre-hash feasibility deep link usable while all new navigation uses
// hashes, which makes the static app suitable for a later GitHub Pages deploy.
if (window.location.hash.length === 0 && window.location.pathname === "/p01-feasibility") {
  window.history.replaceState(
    window.history.state,
    "",
    `#${window.location.pathname}${window.location.search}`,
  );
}

const router = createRouter({ history: createHashHistory(), routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("The root application element is missing.");
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
