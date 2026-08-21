import type { Diagnostic } from "@seq-star/seq-core";
import { diagnostic, immutable } from "@seq-star/seq-core";
import type {
  CoordinateLocus,
  CoordinateSpace,
  CoordinateSpacePattern,
  CoordinateTranslator,
  MappingAssociation,
  MappingRequest,
  MappingResult,
} from "./index.js";
import { coordinateSpaceEquals, coordinateSpaceMatches } from "./index.js";

/** A named, half-open CDS on a nucleotide sequence. `phase` bases are skipped
 * at the 5' coding end before the first complete codon. */
export interface CdsTranslatorConfig {
  readonly id: string;
  readonly nucleotideSpace: CoordinateSpace;
  readonly proteinSpace: CoordinateSpace;
  readonly cds: {
    readonly start: number;
    readonly end: number;
    readonly strand: "+" | "-";
    readonly phase: 0 | 1 | 2;
    readonly proteinOffset: number;
  };
}

const patternFor = (space: CoordinateSpace): CoordinateSpacePattern => ({
  id: space.id,
  kind: space.kind,
  ...(space.authority === undefined ? {} : { authority: space.authority }),
  ...(space.context === undefined ? {} : { context: space.context }),
});
const point = (space: CoordinateSpace, position: number): CoordinateLocus =>
  immutable({
    kind: "point",
    space,
    position: { kind: "index", value: position },
  }) as CoordinateLocus;
const interval = (space: CoordinateSpace, start: number, end: number): CoordinateLocus =>
  immutable({ kind: "interval", space, start, end }) as CoordinateLocus;

export const validateCdsTranslatorConfig = (config: CdsTranslatorConfig): readonly Diagnostic[] => {
  const errors: Diagnostic[] = [];
  const { start, end, strand, phase, proteinOffset } = config.cds;
  if (!/^[a-zA-Z0-9._-]+$/u.test(config.id))
    errors.push(diagnostic("seq.coords.cds.id", "CDS translator ID must be stable.", "/id"));
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start)
    errors.push(
      diagnostic(
        "seq.coords.cds.range",
        "CDS range must be a non-empty zero-based half-open interval.",
        "/cds",
      ),
    );
  if (strand !== "+" && strand !== "-")
    errors.push(
      diagnostic("seq.coords.cds.strand", "CDS strand must be '+' or '-'.", "/cds/strand"),
    );
  if (phase !== 0 && phase !== 1 && phase !== 2)
    errors.push(diagnostic("seq.coords.cds.phase", "CDS phase must be 0, 1, or 2.", "/cds/phase"));
  if (!Number.isSafeInteger(proteinOffset) || proteinOffset < 0)
    errors.push(
      diagnostic(
        "seq.coords.cds.offset",
        "Protein offset must be a non-negative integer.",
        "/cds/proteinOffset",
      ),
    );
  if (config.nucleotideSpace.id === config.proteinSpace.id)
    errors.push(
      diagnostic(
        "seq.coords.cds.named-spaces",
        "Nucleotide and protein spaces must have distinct exact IDs for directed translator routing.",
        "/",
      ),
    );
  if (
    config.nucleotideSpace.length === undefined ||
    !Number.isSafeInteger(config.nucleotideSpace.length) ||
    config.nucleotideSpace.length < 0
  )
    errors.push(
      diagnostic(
        "seq.coords.cds.nucleotide-length",
        "CDS nucleotide space must provide a non-negative integer length.",
        "/nucleotideSpace/length",
      ),
    );
  if (
    config.proteinSpace.length === undefined ||
    !Number.isSafeInteger(config.proteinSpace.length) ||
    config.proteinSpace.length < 0
  )
    errors.push(
      diagnostic(
        "seq.coords.cds.protein-length",
        "CDS protein space must provide a non-negative integer length.",
        "/proteinSpace/length",
      ),
    );
  if (config.nucleotideSpace.length !== undefined && end > config.nucleotideSpace.length)
    errors.push(
      diagnostic("seq.coords.cds.bounds", "CDS range exceeds nucleotide-space length.", "/cds/end"),
    );
  const codons = Math.floor((end - start - phase) / 3);
  if (codons < 1)
    errors.push(
      diagnostic("seq.coords.cds.geometry", "CDS phase leaves no complete codon.", "/cds"),
    );
  if (
    config.proteinSpace.length !== undefined &&
    proteinOffset + Math.max(0, codons) > config.proteinSpace.length
  )
    errors.push(
      diagnostic(
        "seq.coords.cds.protein-bounds",
        "CDS codons exceed protein-space length.",
        "/cds/proteinOffset",
      ),
    );
  return Object.freeze(errors);
};

type Geometry = {
  readonly codingStart: number;
  readonly codingEnd: number;
  readonly codonCount: number;
};
const geometry = (config: CdsTranslatorConfig): Geometry => {
  const { start, end, strand, phase } = config.cds;
  const rawStart = strand === "+" ? start + phase : start;
  const rawEnd = strand === "+" ? end : end - phase;
  const codonCount = Math.floor((rawEnd - rawStart) / 3);
  // The dropped trailing bases are at the 3' end: high genomic coordinates
  // on '+' but low genomic coordinates on '-'.
  return strand === "+"
    ? { codingStart: rawStart, codingEnd: rawStart + codonCount * 3, codonCount }
    : { codingStart: rawEnd - codonCount * 3, codingEnd: rawEnd, codonCount };
};
const nucleotideIndexToCodon = (
  position: number,
  config: CdsTranslatorConfig,
  g: Geometry,
): number | undefined => {
  if (position < g.codingStart || position >= g.codingEnd) return undefined;
  return config.cds.strand === "+"
    ? Math.floor((position - g.codingStart) / 3)
    : Math.floor((g.codingEnd - 1 - position) / 3);
};
const sourcePositions = (source: CoordinateLocus): readonly number[] => {
  if (source.kind === "point" && source.position.kind === "index") return [source.position.value];
  if (source.kind === "interval")
    return Array.from({ length: source.end - source.start }, (_, index) => source.start + index);
  return [];
};
const unmapped = (source: CoordinateLocus): MappingAssociation => ({
  source,
  targets: [],
  status: "unmapped",
});

/** Explicit one-way CDS nucleotide -> protein translator. */
export const createCdsNucleotideToProteinTranslator = (
  config: CdsTranslatorConfig,
): CoordinateTranslator => {
  const errors = validateCdsTranslatorConfig(config);
  if (errors.length) throw new Error(errors.map((item) => item.message).join("; "));
  const g = geometry(config);
  const nucleotidePattern = patternFor(config.nucleotideSpace);
  const proteinPattern = patternFor(config.proteinSpace);
  return {
    id: `${config.id}.nucleotide-to-protein`,
    source: nucleotidePattern,
    target: proteinPattern,
    async map(request: MappingRequest, signal: AbortSignal): Promise<MappingResult> {
      const target =
        request.target !== undefined && coordinateSpaceEquals(request.target, config.proteinSpace)
          ? request.target
          : config.proteinSpace;
      const diagnostics: Diagnostic[] = [];
      const associations = request.loci.map((source) => {
        if (
          signal.aborted ||
          !coordinateSpaceEquals(source.space, config.nucleotideSpace) ||
          (request.target !== undefined && !coordinateSpaceMatches(proteinPattern, request.target))
        )
          return unmapped(source);
        const positions = sourcePositions(source);
        if (positions.length === 0) return unmapped(source);
        const codons = [
          ...new Set(
            positions
              .map((position) => nucleotideIndexToCodon(position, config, g))
              .filter((value): value is number => value !== undefined),
          ),
        ];
        if (codons.length === 0) return unmapped(source);
        const selected = new Set(positions);
        const partial =
          source.kind === "interval" &&
          (positions.some(
            (position) => nucleotideIndexToCodon(position, config, g) === undefined,
          ) ||
            codons.some((codon) => {
              const start =
                config.cds.strand === "+"
                  ? g.codingStart + codon * 3
                  : g.codingEnd - (codon + 1) * 3;
              return ![start, start + 1, start + 2].every((position) => selected.has(position));
            }));
        if (partial)
          diagnostics.push(
            diagnostic(
              "seq.coords.cds.partial-codon-edge",
              "Nucleotide interval intersects a partial codon edge.",
              "/loci",
            ),
          );
        return {
          source,
          targets: codons.map((codon) => point(target, config.cds.proteinOffset + codon)),
          status: partial ? ("partial" as const) : ("exact" as const),
          details: {
            strand: config.cds.strand,
            phase: config.cds.phase,
            proteinOffset: config.cds.proteinOffset,
            codons: codons.length,
          },
        };
      });
      return immutable({ translatorIds: [this.id], associations, diagnostics }) as MappingResult;
    },
  };
};

/** Explicit one-way CDS protein -> nucleotide translator; each amino acid maps to one whole interval. */
export const createCdsProteinToNucleotideTranslator = (
  config: CdsTranslatorConfig,
): CoordinateTranslator => {
  const errors = validateCdsTranslatorConfig(config);
  if (errors.length) throw new Error(errors.map((item) => item.message).join("; "));
  const g = geometry(config);
  const nucleotidePattern = patternFor(config.nucleotideSpace);
  const proteinPattern = patternFor(config.proteinSpace);
  return {
    id: `${config.id}.protein-to-nucleotide`,
    source: proteinPattern,
    target: nucleotidePattern,
    async map(request: MappingRequest, signal: AbortSignal): Promise<MappingResult> {
      const target =
        request.target !== undefined &&
        coordinateSpaceEquals(request.target, config.nucleotideSpace)
          ? request.target
          : config.nucleotideSpace;
      const associations = request.loci.map((source) => {
        if (
          signal.aborted ||
          !coordinateSpaceEquals(source.space, config.proteinSpace) ||
          (request.target !== undefined &&
            !coordinateSpaceMatches(nucleotidePattern, request.target))
        )
          return unmapped(source);
        const positions = sourcePositions(source);
        if (positions.length === 0) return unmapped(source);
        const codons = [
          ...new Set(
            positions
              .map((position) => position - config.cds.proteinOffset)
              .filter((codon) => codon >= 0 && codon < g.codonCount),
          ),
        ];
        if (codons.length === 0) return unmapped(source);
        return {
          source,
          targets: codons.map((codon) => {
            const start =
              config.cds.strand === "+" ? g.codingStart + codon * 3 : g.codingEnd - (codon + 1) * 3;
            return interval(target, start, start + 3);
          }),
          status: codons.length === positions.length ? ("exact" as const) : ("partial" as const),
          details: {
            strand: config.cds.strand,
            phase: config.cds.phase,
            proteinOffset: config.cds.proteinOffset,
            codons: codons.length,
          },
        };
      });
      return immutable({
        translatorIds: [this.id],
        associations,
        diagnostics: [],
      }) as MappingResult;
    },
  };
};

export const createCdsTranslators = (
  config: CdsTranslatorConfig,
): readonly [CoordinateTranslator, CoordinateTranslator] =>
  Object.freeze([
    createCdsNucleotideToProteinTranslator(config),
    createCdsProteinToNucleotideTranslator(config),
  ]);
