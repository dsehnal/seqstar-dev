import { createFileRoute } from "@tanstack/react-router";
import { PendingCasePage } from "../case-page";

/** Hidden, local-only harness lifecycle diagnostic used by the integration suite. */
export const Route = createFileRoute("/harness-diagnostics")({
  component: () => (
    <PendingCasePage
      definition={{
        id: "harness-diagnostics",
        title: "Harness lifecycle diagnostics",
        story: "Exercise host ordering, disposal, diagnostics retention, and startup recovery.",
        instructions: "This route is intentionally omitted from the case-study navigation.",
        panels: [
          {
            id: "diagnostic-sequence",
            title: "Diagnostic sequence host",
            detail: "Lifecycle-only host for the application harness.",
          },
          {
            id: "diagnostic-structure",
            title: "Diagnostic structure host",
            detail: "Second lifecycle-only host for disposal ordering.",
          },
        ],
      }}
    />
  ),
});
