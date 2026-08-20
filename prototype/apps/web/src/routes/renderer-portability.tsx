import { createFileRoute } from "@tanstack/react-router";
import { PendingCasePage } from "../case-page";

export const Route = createFileRoute("/renderer-portability")({
  component: () => (
    <PendingCasePage
      definition={{
        id: "renderer-portability",
        title: "Renderer portability",
        story: "Compare the reference viewer and Nightingale against one shared sequence document.",
        instructions: "Later packets will demonstrate bidirectional hover and selection here.",
        panels: [
          { id: "reference-viewer", title: "Seq* reference viewer", detail: "Awaiting P22." },
          { id: "nightingale", title: "Nightingale", detail: "Awaiting P30." },
        ],
      }}
    />
  ),
});
