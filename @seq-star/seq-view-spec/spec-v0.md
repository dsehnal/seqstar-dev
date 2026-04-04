# SeqViewSpec (SVS) — Draft Specification v0.1

A declarative, JSON-based specification for describing multi-track sequence views of multi-polymer assemblies. Inspired by and designed to complement [MolViewSpec](https://molviewspec.org).

---

## 1. Design Principles

- **Declarative**: Describe *what* to show, not *how* to render it.
- **View-only**: No computation in the spec. All derived data (conservation scores, alignments, annotation transfers) is resolved externally and provided as data.
- **Renderer-agnostic**: Any conforming viewer (custom canvas viewer, Nightingale, notebooks) can consume an SVS document. Rendering implementation (themes, feature renderers) lives in the viewer.
- **Reactive runtime**: The runtime interprets and reconciles the state tree, re-rendering only what changed. Same pattern as MolViewSpec/Mol\*.
- **Extensible via `custom`**: Every node supports a `custom` field for renderer/runtime-specific extensions without polluting the core spec.

---

## 2. Document Root

```jsonc
{
  "svs_version": "0.1.0",
  "root": { /* Node */ }
}
```

| Field         | Type     | Required | Description                    |
|---------------|----------|----------|--------------------------------|
| `svs_version` | `string` | yes      | Semver version of the spec.    |
| `root`        | `Node`   | yes      | The root node of the SVS tree. |

---

## 3. Common Node Properties

Every node in the tree:

```jsonc
{
  "kind": "...",
  "params": { /* kind-specific */ },
  "children": [ /* child nodes */ ],
  "ref": "optional-id",
  "custom": { /* arbitrary */ }
}
```

| Property   | Type     | Required | Description                                                      |
|------------|----------|----------|------------------------------------------------------------------|
| `kind`     | `string` | yes      | Node type discriminator.                                         |
| `params`   | `object` | no       | Kind-specific parameters.                                        |
| `children` | `Node[]` | no       | Child nodes. Valid child kinds depend on parent kind.             |
| `ref`      | `string` | no       | Unique reference ID. Used for cross-referencing within the tree.  |
| `custom`   | `any`    | no       | Arbitrary renderer/runtime-specific metadata.                     |

---

## 4. Source Nodes

Source nodes form a pipeline that acquires and structures data. The pipeline flows: **download → parse → construct**. The output of the source subtree is one or more named assemblies (collections of polymers with associated data).

### 4.1 `download`

Fetch a resource from a URL or provide data inline.

```jsonc
{
  "kind": "download",
  "params": { "url": "https://files.rcsb.org/download/1CRN.cif" }
}
```

| Param  | Type     | Required | Description                                             |
|--------|----------|----------|---------------------------------------------------------|
| `url`  | `string` | no*      | URL to fetch.                                           |
| `data` | `string` | no*      | Inline data string.                                     |

\* One of `url` or `data` must be provided.

**Valid children**: `parse`

---

### 4.2 `parse`

Interpret raw data into a format-specific queryable structure.

```jsonc
{
  "kind": "parse",
  "params": { "format": "cif" }
}
```

| Param    | Type     | Required | Description                                |
|----------|----------|----------|--------------------------------------------|
| `format` | `string` | yes      | `"cif"`, `"fasta"`, `"json"`, or others.  |

**Valid children**: `construct`

---

### 4.3 `construct`

Select and address into parsed data to extract polymers and assemble them into a named assembly. This is the bridge between raw data and the view model.

```jsonc
{
  "kind": "construct",
  "params": {
    "assembly_name": "antibody",
    "selectors": [
      {
        "kind": "cif-field",
        "polymer_name": "light",
        "category": "entity_poly",
        "field": "pdbx_seq_one_letter_code_can",
        "row": 0
      },
      {
        "kind": "cif-field",
        "polymer_name": "heavy",
        "category": "entity_poly",
        "field": "pdbx_seq_one_letter_code_can",
        "row": 1
      }
    ]
  }
}
```

| Param           | Type                  | Required | Description                                     |
|-----------------|-----------------------|----------|-------------------------------------------------|
| `assembly_name` | `string`              | no       | Name for this assembly. Defaults to `ref` or auto-generated. |
| `selectors`     | `ConstructSelector[]` | yes      | How to extract polymers from the parsed data.   |

**Valid children**: `view`

#### ConstructSelector (tagged union)

**`cif-field`** — Address into a parsed mmCIF file.

| Param          | Type     | Required | Description                                      |
|----------------|----------|----------|--------------------------------------------------|
| `polymer_name` | `string` | yes      | Name to assign this polymer in the assembly.     |
| `category`     | `string` | no       | mmCIF category (e.g. `entity_poly`).             |
| `field`        | `string` | no       | Field within the category.                       |
| `row`          | `int`    | no       | Row index (default `0`).                         |

**`fasta-field`** — Address into a parsed FASTA file.

| Param          | Type     | Required | Description                                      |
|----------------|----------|----------|--------------------------------------------------|
| `polymer_name` | `string` | yes      | Name to assign this polymer in the assembly.     |
| `name`         | `string` | yes      | Header/name to match in the FASTA.               |

**`json-field`** — Address into a parsed JSON structure.

| Param          | Type       | Required | Description                                    |
|----------------|------------|----------|------------------------------------------------|
| `polymer_name` | `string`   | yes      | Name to assign this polymer in the assembly.   |
| `path`         | `string[]` | yes      | JSON path segments (e.g. `["chains", "0", "sequence"]`). |

---

## 5. View Nodes

View nodes describe the visual structure. They reference data produced by source nodes (or provided directly via inline data on features).

### 5.1 `view`

Defines a coordinate system and contains sections/tracks/features. A single SVS document may contain multiple views (e.g. via multiple `construct → view` branches).

```jsonc
{
  "kind": "view",
  "params": {
    "coordinate_system": {
      "polymers": [
        { "name": "light", "start": 0, "end": 200 },
        { "name": "heavy", "start": 0, "end": 250 }
      ],
      "polymer_gap": 2
    }
  }
}
```

#### CoordinateSystem

| Param         | Type              | Required | Description                                          |
|---------------|-------------------|----------|------------------------------------------------------|
| `polymers`    | `PolymerDef[]`    | yes      | Ordered list of polymers defining the horizontal axis.|
| `polymer_gap` | `number`          | no       | Column gap between polymers (default `0`).           |

#### PolymerDef

| Param   | Type     | Required | Description                      |
|---------|----------|----------|----------------------------------|
| `name`  | `string` | yes      | Polymer name (matches selectors).|
| `start` | `int`    | yes      | Start index (typically `0`).     |
| `end`   | `int`    | yes      | End index (exclusive).           |

**Valid children**: `section`, `track` (tracks at view level are implicitly in a default section)

---

### 5.2 `section`

Groups tracks into a named layout region. Sections control vertical layout behavior (scrolling, collapsing, height constraints).

```jsonc
{
  "kind": "section",
  "params": {
    "name": "msa",
    "max_height": 400,
    "horizontal_view": "zoomed",
    "vertical_view": "default"
  }
}
```

| Param              | Type                         | Required | Description                                         |
|--------------------|------------------------------|----------|-----------------------------------------------------|
| `name`             | `string`                     | yes      | Section identifier.                                 |
| `max_height`       | `number`                     | no       | Maximum pixel height before scrolling.              |
| `height`           | `"min-content"` \| `"auto"` \| `number` | no | Height behavior.                           |
| `horizontal_view`  | `"zoomed"` \| `"full"`       | no       | Whether this section shows the zoomed viewport or the full extent. |
| `vertical_view`    | `"default"` \| `"full"`      | no       | Vertical layout mode.                               |
| `vertical_padding` | `number`                     | no       | Padding in pixels.                                  |
| `is_hidden`        | `boolean`                    | no       | Initially hidden.                                   |
| `track_style`      | `TrackStyle`                 | no       | Default styling for tracks in this section.         |

#### TrackStyle

| Param            | Type      | Description                          |
|------------------|-----------|--------------------------------------|
| `base_height`    | `number`  | Default track height in pixels.      |
| `borders`        | `boolean` | Show track borders.                  |
| `hide_selection` | `boolean` | Suppress selection highlighting.     |

**Valid children**: `track`

---

### 5.3 `track`

A horizontal lane containing features. Tracks can have child tracks (grouping).

```jsonc
{
  "kind": "track",
  "params": {
    "id": "track-1",
    "header": "Track 1",
    "height_factor": 1.0,
    "values": { "x": 0.42, "y": 0.87 },
    "options": {
      "draw_gaps": true,
      "stack_features": false
    }
  }
}
```

| Param           | Type                    | Required | Description                                      |
|-----------------|-------------------------|----------|--------------------------------------------------|
| `id`            | `string`                | yes      | Unique track identifier.                         |
| `header`        | `string`                | no       | Display label.                                   |
| `height_factor` | `number`                | no       | Multiplier on base track height (default `1.0`). |
| `values`        | `Record<string, any>`   | no       | Arbitrary per-track metadata (sorting, filtering, display). |
| `options`       | `TrackOptions`          | no       | Track behavior options.                          |

#### TrackOptions

| Param            | Type      | Description                                                        |
|------------------|-----------|--------------------------------------------------------------------|
| `draw_gaps`      | `boolean` | Render visual gap indicators at polymer boundaries.                |
| `stack_features` | `boolean` | When features overlap, split into stacked sub-lanes.               |

**Valid children**: `feature`, `track` (for nested/grouped tracks)

---

### 5.4 `feature`

A visual element on a track. Features are the leaf rendering primitives. Multiple features on one track are layered in order.

```jsonc
{
  "kind": "feature",
  "params": {
    "id": "feat-seq-1",
    "type": "sequence",
    "ranges": {
      "light": [{ "start": 0, "end": 200 }],
      "heavy": [{ "start": 0, "end": 250 }]
    },
    "data": {
      "light": "CTVPQQTYLRDT...",
      "heavy": "HIKEITHMCMFR..."
    }
  }
}
```

| Param    | Type                              | Required | Description                                                          |
|----------|-----------------------------------|----------|----------------------------------------------------------------------|
| `id`     | `string`                          | yes      | Unique feature identifier.                                           |
| `type`   | `string`                          | yes      | Feature kind — determines which renderer handles it.                 |
| `ranges` | `Record<PolymerName, Range[]>`    | no       | Where on each polymer this feature applies. Defaults to full extent of the view's coordinate system. |
| `data`   | `any`                             | no       | Inline feature data payload, polymer-keyed by convention.            |
| `source` | `DataSource`                      | no       | Reference to external/parsed data instead of inline `data`.          |

#### Range

| Param   | Type  | Required | Description                    |
|---------|-------|----------|--------------------------------|
| `start` | `int` | yes      | Start index (inclusive).       |
| `end`   | `int` | yes      | End index (exclusive).         |

#### DataSource

An alternative to inline `data`. Points at data extracted from a source node.

| Param      | Type       | Required | Description                                                |
|------------|------------|----------|------------------------------------------------------------|
| `ref`      | `string`   | yes      | Reference to a source node (by its `ref`).                 |
| `selector` | `object`   | no       | Additional addressing into the referenced data (same selector types as `construct`). |

---

## 6. Layout Hints

Layout hints can appear on the `view` node's params. These are declarative suggestions; renderers may interpret or ignore them.

```jsonc
{
  "kind": "view",
  "params": {
    "coordinate_system": { "..." : "..." },
    "layout": {
      "base_track_height": 36,
      "columns": [
        { "name": "header", "width": 120 },
        { "name": "values.x", "width": 60 },
        { "name": "values.y", "width": 60 }
      ]
    }
  }
}
```

#### Layout

| Param              | Type              | Description                              |
|--------------------|-------------------|------------------------------------------|
| `base_track_height`| `number`          | Default track height in pixels.          |
| `columns`          | `LayoutColumn[]`  | Column definitions for the track header/metadata area. |

#### LayoutColumn

| Param       | Type               | Description                           |
|-------------|--------------------|---------------------------------------|
| `name`      | `string`           | Column identifier (can reference `values` keys). |
| `width`     | `string \| number` | Column width.                         |
| `is_hidden` | `boolean`          | Initially hidden.                     |

---

## 7. Full Example

An antibody with light and heavy chains, loaded from a FASTA, with an MSA section and annotation tracks.

```json
{
  "svs_version": "0.1.0",
  "root": {
    "kind": "download",
    "params": { "url": "https://example.com/antibody.fasta" },
    "ref": "ab-fasta",
    "children": [{
      "kind": "parse",
      "params": { "format": "fasta" },
      "ref": "ab-parsed",
      "children": [{
        "kind": "construct",
        "params": {
          "assembly_name": "antibody",
          "selectors": [
            { "kind": "fasta-field", "polymer_name": "light", "name": "VL" },
            { "kind": "fasta-field", "polymer_name": "heavy", "name": "VH" }
          ]
        },
        "children": [{
          "kind": "view",
          "params": {
            "coordinate_system": {
              "polymers": [
                { "name": "light", "start": 0, "end": 200 },
                { "name": "heavy", "start": 0, "end": 250 }
              ],
              "polymer_gap": 2
            },
            "layout": {
              "base_track_height": 36,
              "columns": [
                { "name": "header", "width": 120 }
              ]
            }
          },
          "children": [
            {
              "kind": "section",
              "params": { "name": "sequence", "height": "min-content" },
              "children": [{
                "kind": "track",
                "params": { "id": "seq", "header": "Sequence" },
                "children": [{
                  "kind": "feature",
                  "params": {
                    "id": "seq-letters",
                    "type": "sequence",
                    "source": { "ref": "ab-parsed" }
                  }
                }]
              }]
            },
            {
              "kind": "section",
              "params": { "name": "annotations" },
              "children": [
                {
                  "kind": "track",
                  "params": { "id": "variable-reg", "header": "Variable reg." },
                  "children": [
                    {
                      "kind": "feature",
                      "params": {
                        "id": "vl-region",
                        "type": "block",
                        "ranges": {
                          "light": [{ "start": 10, "end": 120 }]
                        },
                        "data": { "label": "vL" }
                      }
                    },
                    {
                      "kind": "feature",
                      "params": {
                        "id": "vh-region",
                        "type": "block",
                        "ranges": {
                          "heavy": [{ "start": 10, "end": 130 }]
                        },
                        "data": { "label": "vH" }
                      }
                    }
                  ]
                },
                {
                  "kind": "track",
                  "params": { "id": "cdr", "header": "CDR" },
                  "children": [
                    {
                      "kind": "feature",
                      "params": {
                        "id": "cdr1-light",
                        "type": "block",
                        "ranges": { "light": [{ "start": 24, "end": 40 }] },
                        "data": { "label": "CDR1" }
                      }
                    },
                    {
                      "kind": "feature",
                      "params": {
                        "id": "cdr2-light",
                        "type": "block",
                        "ranges": { "light": [{ "start": 56, "end": 70 }] },
                        "data": { "label": "CDR2" }
                      }
                    },
                    {
                      "kind": "feature",
                      "params": {
                        "id": "cdr1-heavy",
                        "type": "block",
                        "ranges": { "heavy": [{ "start": 26, "end": 38 }] },
                        "data": { "label": "CDR1" }
                      }
                    },
                    {
                      "kind": "feature",
                      "params": {
                        "id": "cdr2-heavy",
                        "type": "block",
                        "ranges": { "heavy": [{ "start": 56, "end": 65 }] },
                        "data": { "label": "CDR2" }
                      }
                    }
                  ]
                }
              ]
            },
            {
              "kind": "section",
              "params": {
                "name": "msa",
                "max_height": 400,
                "horizontal_view": "zoomed"
              },
              "children": [
                {
                  "kind": "track",
                  "params": {
                    "id": "msa-track-1",
                    "header": "Track 1",
                    "options": { "draw_gaps": true }
                  },
                  "children": [
                    {
                      "kind": "feature",
                      "params": {
                        "id": "msa-swatch-1",
                        "type": "swatch",
                        "data": {
                          "colors": {
                            "light": ["rgba(128,128,128,0.33)", "..."],
                            "heavy": ["rgba(200,200,200,0.33)", "..."]
                          }
                        }
                      }
                    },
                    {
                      "kind": "feature",
                      "params": {
                        "id": "msa-seq-1",
                        "type": "sequence",
                        "data": {
                          "light": "VLYRLS...",
                          "heavy": "CTVPQ..."
                        }
                      }
                    }
                  ]
                }
              ]
            },
            {
              "kind": "section",
              "params": {
                "name": "consensus",
                "height": "min-content",
                "horizontal_view": "zoomed"
              },
              "children": [{
                "kind": "track",
                "params": {
                  "id": "consensus-90",
                  "header": "Consensus/90"
                },
                "children": [{
                  "kind": "feature",
                  "params": {
                    "id": "consensus-bars",
                    "type": "bars",
                    "data": {
                      "threshold": 90,
                      "range": [0, 1],
                      "values": {
                        "light": [0.12, 0.05, 0.88, "..."],
                        "heavy": [0.03, 0.72, 0.15, "..."]
                      }
                    }
                  }
                }]
              }]
            }
          ]
        }]
      }]
    }]
  }
}
```

---

## 8. Data Conventions

### 8.1 Feature data is polymer-keyed

By convention, feature data that varies per-residue is keyed by polymer name:

```jsonc
{
  "data": {
    "light": [/* per-position values */],
    "heavy": [/* per-position values */]
  }
}
```

This matches the renderer pattern `feature.data[polymerName][position]`.

### 8.2 Feature data can reference sources

Instead of inline data, a feature can reference a parsed source:

```jsonc
{
  "source": {
    "ref": "my-parsed-cif",
    "selector": {
      "kind": "cif-field",
      "category": "atom_site",
      "field": "B_iso_or_equiv"
    }
  }
}
```

The runtime resolves this at load time and makes it available through the same polymer-keyed interface.

### 8.3 Ranges are polymer-keyed and use half-open intervals

```jsonc
{
  "ranges": {
    "light": [{ "start": 10, "end": 50 }],
    "heavy": [{ "start": 10, "end": 65 }, { "start": 100, "end": 130 }]
  }
}
```

Ranges use half-open intervals `[start, end)` consistent with standard programming conventions.

---

## 9. Relationship to MolViewSpec

SVS is designed to complement MolViewSpec for synchronized 1D+3D views. The coordination model is **external**: a host application (e.g. Mol\*) loads both an SVS document and an MVS document, and provides a linking layer that translates selections/highlights between the two coordinate spaces. The SVS `ref` system and polymer naming enable this mapping.

SIFTS-based coordinate resolution (mapping between PDB residue numbering, UniProt positions, etc.) is a **runtime concern** — the runtime uses mmCIF `atom_site.pdbx_sifts_xref_db_*` fields or external SIFTS data to resolve cross-references. SVS declares the *intent* (polymer names that can be matched across specs) but not the mapping logic.

---

## 10. Conformance

A conforming SVS runtime MUST:
- Parse the document and reconcile state reactively (diff-based updates).
- Support all source node kinds (`download`, `parse`, `construct`).
- Support all view node kinds (`view`, `section`, `track`, `feature`).
- Pass `custom` fields through to renderers without interpretation.
- Ignore unrecognized feature `type` values gracefully.

A conforming SVS runtime MAY:
- Support additional `parse` formats.
- Support additional `ConstructSelector` kinds.
- Support additional feature types.
- Interpret `layout` hints or use its own layout strategy.
- Implement linked highlighting with MolViewSpec views.