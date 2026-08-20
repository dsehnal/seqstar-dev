import { createFileRoute } from "@tanstack/react-router";
import { PendingCasePage } from "../case-page";

export const Route = createFileRoute("/uniprot-structure")({
  component: () => (
    <PendingCasePage
      definition={{
        id: "uniprot-structure",
        title: "UniProt annotations and structure",
        story:
          "Trace a UniProt annotation from track activation to an inspectable structure request.",
        instructions: "Later packets will expose mapping summaries and local MVS inspection here.",
        panels: [
          { id: "uniprot-tracks", title: "UniProt annotation tracks", detail: "Awaiting P41." },
          { id: "structure-view", title: "Mol* structure", detail: "Awaiting P40/P41." },
        ],
      }}
    />
  ),
});
