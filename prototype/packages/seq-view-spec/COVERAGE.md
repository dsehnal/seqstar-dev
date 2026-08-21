# P11 semantic coverage matrix

`src/semantic.test.ts` contains one valid, fully populated document and **53**
independent negative mutations. Each mutation asserts one stable diagnostic code
and JSON Pointer; other independent diagnostics may also be returned.

The positive control exercises all annotation unions (`loci`, dense and sparse
`values`, `relationships`), all locus forms used by the document, assembly and
alignment members, all eight layer representations, a relationship-marker
fallback, fixed/categorical/continuous colors (including RGBA), a namespaced
extension, known capability requirements, and versions `0.1.0`, `0.1.9`, and
compatible `0.2.0`.

| Rule area | Targeted negative case names | Count |
| --- | --- | ---: |
| IDs, coordinates, sequences, capabilities | duplicate ID; duplicate coordinate space; gapped residues; alphabet mismatch; undeclared extension; duplicate requirement; unknown requirement; unsupported major | 8 |
| Assembly and alignment mappings | missing assembly sequence; duplicate assembly member; missing alignment sequence; duplicate alignment member; alignment mapping length/bounds/duplicate/order | 8 |
| Loci, values, and relationships | missing locus space; locus bounds; dense value length; sparse value bounds/duplicate; value type; duplicate relationship role | 7 |
| View layout and references | missing assembly/alignment context; missing axis space; axis bounds/gap; viewport coverage/bounds; track height | 8 |
| Layers and visual encodings | layer opacity; tooltip expression; missing sequence/alignment target; duplicate/missing layer member; missing/incompatible annotation; incompatible locus representation; annotation axis coverage; incompatible fallback; bar-scale domain; continuous color domain; categorical key | 14 |
| HTTP(S) link traversal | document, sequence, assembly, alignment, alignment-member, annotation, view metadata; item link | 8 |

Additional unit cases verify deep clone/freeze, JCS key/number/Unicode/cycle and
sparse-array behavior, digest order stability, categorical lookup, linear sRGB
interpolation, RGBA interpolation, and unclamped color failure. The checked
invalid corpus has four fixtures and six exact expected code/pointer entries in
`invalid/manifest.json`.

The JSON Schema artifact check verifies the draft 2020-12 URI, exactly one
`$id`, and resolution of every local `$ref`; it reads only and does not mutate
the artifact.
