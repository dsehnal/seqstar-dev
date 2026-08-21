# M01C alignment structural-ensemble feasibility audit

Status: **blocked — M50 structural ensemble must not be implemented yet.**

Date: 2026-08-20. This record changes no fixture, manifest, production code,
shared configuration, or lockfile.

## Decision

The frozen 32-row PF00042.29 alignment has one approved experimental structure:
query `P69905.2` mapped to PDB `1A3N`, entity 1, label/auth chain A. An official
UniProt query of all 31 non-query accessions found no usable current PDB
cross-reference (30 empty; `A0A8H3UHL5` reports `deleted`).

Three frozen members have promising AlphaFold DB v6 predictions (`P02197`,
`A0A5E4C8D4`, `A0A2Y9DEZ0`), and temporary files proved a mixed view is
technically possible. They are not approved fixtures because a clean checkout
cannot reproduce the downloaded sources or four-root proof, and the preliminary
transforms used automatic Mol* sequence alignment rather than frozen
alignment-column matched C-alpha pairs. Exact pair tables, pair counts, RMSD,
matrix convention, and hash-audited transforms are not retained. These are
material gaps; M50 must not promote the temporary result.

## Approved baseline

| Fact | Value |
| --- | --- |
| Alignment | PF00042.29, 32 rows, 118 columns |
| Query | `HBA_HUMAN/27-137`, `P69905.2` |
| Structure | `1A3N`, entity 1, label/auth chain A |
| Mapping | P69905 positions 2–142 map exactly to 141 observed residues |
| Alignment overlap | positions 27–137 with seven query gaps |
| Missing residue | initiator methionine, position 1 |
| 1A3N bytes / SHA-256 | 560,920 / `7cd2eb16d3469a3ef32864f33ee2ca09258b1b1fff2c1c83214b9af3087f93dd` |

The approved TSV mappings remain authoritative. Mol* supplies all mmCIF
parsing; a repository-owned tokenizer/parser is forbidden.

## Candidate screen (not fixture approval)

| Member | AFDB model | Exact UniProt coverage | Temporary bytes / SHA-256 | Global pLDDT |
| --- | --- | --- | --- | --- |
| `P02197.4` | `AF-P02197-F1-model_v6` | 154/154 | 153,621 / `add1eaa81d25e5243ae572beebb46bff297832bf4349a8b61eb1df8cd6c3e77f` | 95.98 |
| `A0A5E4C8D4.1` | `AF-A0A5E4C8D4-F1-model_v6` | 142/142 | 141,027 / `d9ae2fa3eec9af90c982f50bc77b2db1c4125f865d6e5b888c8aa1beb44a0206` | 97.10 |
| `A0A2Y9DEZ0.1` | `AF-A0A2Y9DEZ0-F1-model_v6` | 142/142 | 145,013 / `f254c99c3ce4fafdcc847e21c69e66ce443ce85e5a0c6d8ecb93b559714bb175` | 96.17 |

AlphaFold DB publishes predictions under CC BY 4.0. Future fixtures must label
them as theoretical predictions, retain AFDB/DeepMind attribution and model
version, and describe pLDDT as prediction confidence—not experimental data.

## Retained API-only proof

`tests/m01-ensemble/` is intentionally narrower. Its local Vite config resolves
the wrapper package's declared exact `molstar@5.11.0` dependency, while source
uses bare package imports. It loads
approved local `1A3N.cif` twice solely to prove MVS transform, independent
color, focus, fresh-frame readiness, no external request, and repeated disposal.
Evidence says `biologicalEnsembleClaim: false`; this is not an ensemble fixture.

```sh
cd prototype
pnpm exec playwright test -c tests/m01-ensemble/playwright.config.ts --reporter=list
```

## Unblock requirements

An exclusive fixture packet must retain and audit candidate mmCIFs, AFDB API
metadata, exact UniProt records, and licenses; derive positions from the frozen
AFA; use Mol* CIF/model APIs to select C-alpha pairs for shared non-gap columns;
freeze pair tables/counts, RMSD, and column-major mobile-to-1A3N matrices; then
prove a four-root local MVS with distinct colors, focus, fresh frame, no network,
and repeated disposal from a clean checkout. Only after independent review may
the fixture manifest change and M50 proceed.
