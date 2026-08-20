import { createFileRoute } from "@tanstack/react-router";
import { PendingCasePage } from "../case-page";

export const Route = createFileRoute("/complex")({
  component: () => (
    <PendingCasePage
      definition={{
        id: "complex",
        title: "Multi-polymer complex",
        story:
          "Inspect chain identity, interface roles, and explicitly synthetic confidence values.",
        instructions:
          "Later packets will clearly label synthetic contacts and chain mappings here.",
        panels: [
          { id: "complex-sequence", title: "Multi-polymer sequence", detail: "Awaiting P50." },
          { id: "complex-structure", title: "Complex structure", detail: "Awaiting P50." },
        ],
      }}
    />
  ),
});
