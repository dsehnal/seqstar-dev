# P01c fixture pack

This directory freezes the deterministic, offline source pack selected by the
P01 feasibility gate. Each case records source URLs, retrieval and upstream
versions, usage terms, transformations, SHA-256 checksums, and browser-size
budgets in its `metadata.json`.

Exact upstream UniProt JSON responses use the `.json.raw` suffix so repository
formatters cannot rewrite their source bytes; consumers still parse their
contents as JSON.

`real` means an unchanged upstream record. `transformed-real` means a
deterministic derivative of an upstream record. `synthetic` means a value made
solely for the prototype and never presented as a biological observation or
prediction.

The three structure cases retain the complete raw mmCIF and SIFTS inputs. Their
mapping/contact tables were generated and cross-checked with the exact pinned
`molstar@5.11.0` CIF/model APIs. The verification summaries record those import
paths and counts. No repository-owned mmCIF parser is present or permitted.
