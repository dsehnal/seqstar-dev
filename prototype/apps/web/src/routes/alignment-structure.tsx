import { createFileRoute } from "@tanstack/react-router";
import { PendingCasePage } from "../case-page";

export const Route = createFileRoute("/alignment-structure")({
  component: () => (
    <PendingCasePage
      definition={{
        id: "alignment-structure",
        title: "Alignment and structure",
        story:
          "Follow alignment columns through the structure-linked member without inventing positions for gaps.",
        instructions:
          "Later packets will expose the selected mapping path and virtualized alignment here.",
        panels: [
          { id: "alignment-view", title: "Alignment viewer", detail: "Awaiting P60." },
          { id: "alignment-structure-view", title: "Linked structure", detail: "Awaiting P60." },
        ],
      }}
    />
  ),
});
