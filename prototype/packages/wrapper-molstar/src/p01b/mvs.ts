import { MVSData } from "molstar/lib/extensions/mvs/index.js";
import type { MVSData as MVSDataDocument } from "molstar/lib/extensions/mvs/mvs-data.js";

/**
 * A deliberately synthetic two-residue structure used only by the P01b
 * feasibility spike. It has no biological or fixture provenance claim.
 */
export const SYNTHETIC_PEPTIDE_PDB = `HEADER    SYNTHETIC PEPTIDE FOR SEQSTAR P01B
TITLE     NON-BIOLOGICAL TWO RESIDUE WEBGL SPIKE
ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00 10.00           N
ATOM      2  CA  ALA A   1       1.458   0.000   0.000  1.00 10.00           C
ATOM      3  C   ALA A   1       2.009   1.421   0.000  1.00 10.00           C
ATOM      4  O   ALA A   1       1.334   2.406   0.000  1.00 10.00           O
ATOM      5  CB  ALA A   1       1.972  -0.774  -1.215  1.00 10.00           C
ATOM      6  N   GLY A   2       3.254   1.524   0.000  1.00 10.00           N
ATOM      7  CA  GLY A   2       3.891   2.836   0.000  1.00 10.00           C
ATOM      8  C   GLY A   2       5.408   2.717   0.000  1.00 10.00           C
ATOM      9  O   GLY A   2       6.039   1.657   0.000  1.00 10.00           O
TER      10      GLY A   2
END
`;

function structureDataUri(pdb: string): string {
  return `data:chemical/x-pdb;charset=utf-8,${encodeURIComponent(pdb)}`;
}

/** Build a complete, local-only MVS document from Mol*'s shipped builder. */
export function createSyntheticPeptideMvs(
  structureUrl = structureDataUri(SYNTHETIC_PEPTIDE_PDB),
): MVSDataDocument {
  const builder = MVSData.createBuilder();
  builder.canvas({ background_color: "white" });
  const structure = builder
    .download({ url: structureUrl })
    .parse({ format: "pdb" })
    .modelStructure();
  const component = structure.component({ selector: "all" });
  component.representation({ type: "ball_and_stick" }).color({ color: "#2563eb" });
  component.focus();
  return builder.getState({
    title: "Seq* P01b synthetic peptide",
    description: "A local, non-biological two-residue MolViewSpec spike.",
    description_format: "plaintext",
  });
}

/** Use the validator exported by the same Mol* package as the builder/loader. */
export function validateMvs(document: MVSDataDocument): readonly string[] {
  return MVSData.validationIssues(document, { noExtra: true }) ?? [];
}
