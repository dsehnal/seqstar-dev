import { MVSData } from "molstar/lib/extensions/mvs/index.js";
import type { MVSData as MvsDocument } from "molstar/lib/extensions/mvs/mvs-data.js";

/**
 * This is an API-only transform spike. It intentionally loads the approved
 * query structure twice and must never be represented as a biological
 * ensemble: the M01 audit found no two additional exact member structures.
 */
export function createTransformSpikeMvs(structureUrl: string): MvsDocument {
  const builder = MVSData.createBuilder();
  builder.canvas({ background_color: "white" });

  const reference = builder
    .download({ url: structureUrl })
    .parse({ format: "mmcif" })
    .modelStructure();
  const referenceComponent = reference
    .transform({
      rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      translation: [0, 0, 0],
    })
    .component({ selector: { label_entity_id: "1", label_asym_id: "A", auth_asym_id: "A" } });
  referenceComponent.focus();
  referenceComponent.representation({ type: "cartoon" }).color({ color: "#2563EB" });

  const transformedCopy = builder
    .download({ url: structureUrl })
    .parse({ format: "mmcif" })
    .modelStructure();
  const transformedCopyComponent = transformedCopy
    .transform({
      rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      translation: [0, 0, 0],
    })
    .component({ selector: { label_entity_id: "1", label_asym_id: "A", auth_asym_id: "A" } });
  transformedCopyComponent.representation({ type: "cartoon" }).color({ color: "#F97316" });

  return builder.getState({
    title: "M01 transform API spike — not a biological ensemble",
    description:
      "Pinned Mol* MVS transform/load/color/focus/dispose feasibility only; both roots are 1A3N chain A.",
    description_format: "plaintext",
  });
}

export function validateTransformSpikeMvs(document: MvsDocument): readonly string[] {
  return MVSData.validationIssues(document, { noExtra: true }) ?? [];
}
