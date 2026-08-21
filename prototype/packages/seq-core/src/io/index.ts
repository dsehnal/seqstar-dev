import {
  codePointLength,
  type Diagnostic,
  diagnostic,
  type Result,
  resultError,
  resultOk,
} from "../data/index.js";
import {
  type AlignmentModel,
  type Alphabet,
  createAlignment,
  createSequence,
  type Provenance,
  type SequenceModel,
  type StableIdentifier,
} from "../model/index.js";
export interface FastaOptions {
  readonly alphabet?: Alphabet;
  readonly idPrefix?: string;
  readonly provenance?: Provenance;
}
export interface AlignmentOptions extends FastaOptions {
  readonly alignmentId?: string;
  readonly coordinateSpace?: string;
  readonly a3mInsertions?: "reject" | "drop";
}
export interface AlignmentInput {
  readonly records: readonly {
    readonly id: string;
    readonly rawHeader: string;
    readonly description?: string;
    readonly identifiers?: readonly StableIdentifier[];
    readonly residues: string;
  }[];
  readonly format: "aligned-fasta" | "a3m";
  readonly provenance?: Provenance;
}
type RecordRow = {
  id: string;
  rawHeader: string;
  description?: string;
  identifiers?: readonly StableIdentifier[];
  residues: string;
};
const canonicalHeader = (header: string): Omit<RecordRow, "residues"> | undefined => {
  const rawHeader = header.trim();
  if (rawHeader.length === 0) return undefined;
  const token = rawHeader.split(/\s+/, 1)[0];
  if (token === undefined) return undefined;
  const uniprot = /^(sp|tr)\|([^|]+)\|([^|]+)/.exec(token);
  if (uniprot !== null) {
    const description = rawHeader.slice(token.length).trim();
    return {
      id: uniprot[2] ?? "",
      rawHeader,
      ...(description.length === 0 ? {} : { description }),
      identifiers: [{ namespace: "uniprot", value: uniprot[2] ?? "" }],
    };
  }
  const id = (token.split("|")[0] ?? token)
    .replace(/[^A-Za-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const description = rawHeader.slice(token.length).trim();
  return {
    id: /^[A-Za-z]/.test(id) ? id : `seq-${id}`,
    rawHeader,
    ...(description.length === 0 ? {} : { description }),
  };
};
const records = (text: string): Result<readonly RecordRow[]> => {
  const errors: Diagnostic[] = [];
  const output: RecordRow[] = [];
  let current: RecordRow | undefined;
  text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .forEach((line, index) => {
      if (line.startsWith(">")) {
        const canonical = canonicalHeader(line.slice(1));
        if (canonical === undefined || canonical.id.length === 0)
          errors.push(
            diagnostic("seq.io.fasta.header", "FASTA header requires an ID.", `/${index + 1}`),
          );
        else {
          current = {
            ...canonical,
            ...(canonical.description === undefined ? {} : { description: canonical.description }),
            residues: "",
          };
          output.push(current);
        }
      } else if (line.trim().length) {
        if (current === undefined)
          errors.push(
            diagnostic(
              "seq.io.fasta.content",
              "Residues must follow a FASTA header.",
              `/${index + 1}`,
            ),
          );
        else if (/\s/.test(line))
          errors.push(
            diagnostic(
              "seq.io.fasta.whitespace",
              "Residue lines cannot contain whitespace.",
              `/${index + 1}`,
            ),
          );
        else current.residues += line;
      }
    });
  if (output.length === 0) errors.push(diagnostic("seq.io.fasta.empty", "No FASTA records found."));
  output.forEach((record, index) => {
    if (record.residues.length === 0)
      errors.push(
        diagnostic("seq.io.fasta.residues.empty", "FASTA record has no residues.", `/${index}`),
      );
  });
  return errors.length
    ? resultError(errors)
    : resultOk(Object.freeze(output.map((record) => Object.freeze({ ...record }))));
};
export const parseFasta = (
  text: string,
  options: FastaOptions = {},
): Result<readonly SequenceModel[]> => {
  const parsed = records(text);
  if (!parsed.ok) return parsed;
  const errors: Diagnostic[] = [];
  const ids = new Set<string>();
  const output: SequenceModel[] = [];
  parsed.value.forEach((record, index) => {
    const id = `${options.idPrefix ?? ""}${record.id}`;
    if (ids.has(id)) {
      errors.push(
        diagnostic("seq.io.fasta.id.duplicate", `Duplicate FASTA ID '${id}'.`, `/${index}`),
      );
      return;
    }
    ids.add(id);
    const sequence = createSequence({
      id,
      coordinateSpace: `${id}:sequence`,
      alphabet: options.alphabet ?? "protein",
      residues: record.residues,
      ...(record.identifiers === undefined ? {} : { identifiers: record.identifiers }),
      extensions: { "seq:rawHeader": record.rawHeader },
      provenance: {
        label: "FASTA",
        ...(options.provenance === undefined ? {} : options.provenance),
        transformations: [
          "FASTA header canonicalized to stable ID",
          "FASTA parsed; internal positions are zero-based",
        ],
      },
    });
    if (sequence.ok) output.push(sequence.value);
    else errors.push(...sequence.diagnostics);
  });
  return errors.length ? resultError(errors) : resultOk(Object.freeze(output));
};
export const parseAlignedFasta = (
  text: string,
  options: AlignmentOptions = {},
): Result<AlignmentInput> => {
  const parsed = records(text);
  if (!parsed.ok) return parsed;
  const errors: Diagnostic[] = [];
  const ids = new Set<string>();
  const width = codePointLength(parsed.value[0]?.residues ?? "");
  parsed.value.forEach((record, index) => {
    if (ids.has(record.id))
      errors.push(
        diagnostic(
          "seq.io.alignment.id.duplicate",
          `Duplicate canonical alignment ID '${record.id}'.`,
          `/${index}`,
        ),
      );
    ids.add(record.id);
    if (!/^[A-Za-z*.-]+$/.test(record.residues))
      errors.push(
        diagnostic(
          "seq.io.aligned-fasta.syntax",
          "Aligned FASTA supports residues, '-' gaps, and '.' gaps only.",
          `/${index}`,
        ),
      );
    if (codePointLength(record.residues) !== width)
      errors.push(
        diagnostic(
          "seq.io.aligned-fasta.length",
          "All aligned FASTA records must have equal width.",
          `/${index}`,
        ),
      );
  });
  return errors.length
    ? resultError(errors)
    : resultOk({
        records: parsed.value,
        format: "aligned-fasta",
        provenance: {
          label: "aligned FASTA",
          ...(options.provenance === undefined ? {} : options.provenance),
          transformations: [
            "FASTA headers canonicalized to stable IDs",
            "aligned FASTA parsed; gaps represented as null positions",
          ],
        },
      });
};
export const parseA3m = (text: string, options: AlignmentOptions = {}): Result<AlignmentInput> => {
  const parsed = records(text);
  if (!parsed.ok) return parsed;
  const errors: Diagnostic[] = [];
  const ids = new Set<string>();
  const query = parsed.value[0];
  if (query === undefined)
    return resultError([diagnostic("seq.io.a3m.empty", "A3M requires a query record.")]);
  const width = [...query.residues].filter((residue) => !/[a-z]/.test(residue)).length;
  const output = parsed.value.map((record, index) => {
    if (ids.has(record.id))
      errors.push(
        diagnostic(
          "seq.io.alignment.id.duplicate",
          `Duplicate canonical alignment ID '${record.id}'.`,
          `/${index}`,
        ),
      );
    ids.add(record.id);
    if (/[a-z]/.test(record.residues) && options.a3mInsertions !== "drop")
      errors.push(
        diagnostic(
          "seq.io.a3m.insertion",
          "A3M lowercase insertions require a3mInsertions: 'drop'.",
          `/${index}`,
        ),
      );
    const residues = record.residues.replace(/[a-z]/g, "");
    if (!/^[A-Z*.-]+$/.test(residues))
      errors.push(
        diagnostic("seq.io.a3m.syntax", "A3M contains invalid residue syntax.", `/${index}`),
      );
    if (codePointLength(residues) !== width)
      errors.push(
        diagnostic(
          "seq.io.a3m.length",
          "A3M match-state width must equal the query width.",
          `/${index}`,
        ),
      );
    return { ...record, residues };
  });
  return errors.length
    ? resultError(errors)
    : resultOk({
        records: Object.freeze(output.map((record) => Object.freeze(record))),
        format: "a3m",
        provenance: {
          label: "A3M",
          ...(options.provenance === undefined ? {} : options.provenance),
          transformations: [
            "A3M match states parsed",
            "FASTA headers canonicalized to stable IDs",
            ...(options.a3mInsertions === "drop"
              ? ["lowercase insertions dropped explicitly"]
              : []),
          ],
        },
      });
};
export const normalizeAlignment = (
  input: AlignmentInput,
  options: AlignmentOptions = {},
): Result<{ readonly sequences: readonly SequenceModel[]; readonly alignment: AlignmentModel }> => {
  const errors: Diagnostic[] = [];
  const sequences: SequenceModel[] = [];
  const members: { id: string; sequence: string; positions: (number | null)[] }[] = [];
  const ids = new Set<string>();
  const width = codePointLength(input.records[0]?.residues ?? "");
  input.records.forEach((record, index) => {
    if (ids.has(record.id)) {
      errors.push(
        diagnostic(
          "seq.io.alignment.id.duplicate",
          `Duplicate alignment ID '${record.id}'.`,
          `/records/${index}`,
        ),
      );
      return;
    }
    ids.add(record.id);
    if (codePointLength(record.residues) !== width) {
      errors.push(
        diagnostic(
          "seq.io.alignment.length",
          "Alignment record width differs from first record.",
          `/records/${index}`,
        ),
      );
      return;
    }
    const sequence = createSequence({
      id: record.id,
      coordinateSpace: `${record.id}:sequence`,
      alphabet: options.alphabet ?? "protein",
      residues: record.residues.replace(/[-.]/g, ""),
      ...(record.identifiers === undefined ? {} : { identifiers: record.identifiers }),
      extensions: { "seq:rawHeader": record.rawHeader },
      provenance: {
        label: input.format,
        transformations: ["gapped input normalized to explicit alignment positions"],
      },
    });
    if (!sequence.ok) {
      errors.push(...sequence.diagnostics);
      return;
    }
    sequences.push(sequence.value);
    let position = 0;
    members.push({
      id: `${record.id}:member`,
      sequence: record.id,
      positions: [...record.residues].map((residue) =>
        residue === "-" || residue === "." ? null : position++,
      ),
    });
  });
  if (errors.length) return resultError(errors);
  const alignment = createAlignment(
    {
      id: options.alignmentId ?? "alignment",
      coordinateSpace: options.coordinateSpace ?? "alignment:columns",
      length: width,
      members,
      ...(input.provenance === undefined ? {} : { provenance: input.provenance }),
    },
    sequences,
  );
  return alignment.ok
    ? resultOk({ sequences: Object.freeze(sequences), alignment: alignment.value })
    : alignment;
};
export interface SeqIoPackageBoundary {
  readonly data: import("../data/index.js").SeqDataPackageBoundary;
  readonly model: import("../model/index.js").SeqModelPackageBoundary;
  readonly moduleName: "io";
}
