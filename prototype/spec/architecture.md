# Seq* Prototype Component Architecture

Status: prototype specification draft

This document defines the components of the prototype and the allowed
dependencies among them. Detailed contracts are specified in the linked
component documents.

## 1. Components

```text
                         portable documents
              SeqViewSpec                  MolViewSpec
                   |                           |
                   v                           v
        +----------------------+    +----------------------+
        | Seq* / Nightingale   |    | Mol*                 |
        | visualizer wrappers  |    | visualizer wrapper   |
        +----------+-----------+    +-----------+----------+
                   \                            /
                    \ normalized messages     /
                     v                        v
                  +------------------------------+
                  | application harness          |
                  |                              |
                  | event fabric                 |
                  | routes and policies          |
                  | translator registry          |
                  | interaction synchronization  |
                  | plugin composition           |
                  +---------------+--------------+
                                  |
                    +-------------+-------------+
                    |                           |
                    v                           v
            integration plugins          React host adapter
            and view generators                |
                    \                           /
                     +------------+------------+
                                  v
                         prototype web app
```

The system has no single shared visualizer state tree. Each visualizer owns its
native state. Portable visualization documents describe requested views; the
harness routes messages and coordinates components without absorbing their
internal models.

## 2. Specification set

| Document | Normative subject |
| --- | --- |
| `seq-view-spec.md` | Portable sequence visualization document |
| `seq-library.md` | Seq* data, coordinate, algorithm, and reference-viewer APIs |
| `application-harness.md` | Event fabric, composition, routing, translators, synchronization, and plugins |
| `visualizer-wrappers.md` | Common wrapper lifecycle plus Seq*, Nightingale, and Mol* adapters |
| `integration-plugins.md` | Prototype data adapters, intent processors, translators, and view generators |
| `web-app.md` | React case-study host, routes, diagnostics, fixtures, and browser acceptance |
| `case-studies.md` | User-visible scenarios and their acceptance criteria |
| `tech-stack.md` | Workspace, tools, and implementation technology |

When documents conflict, the more component-specific document wins. The
reconciliation note records design history and is non-normative once a
component specification makes a concrete decision.

## 3. Dependency rules

```text
seq-data
   |
   +--> seq-model
           |
           +--> seq-coords
           |
           +--> seq-algorithm
           |
           +--> seq-view-spec
                    |
                    +--> seq-viewer

harness-core --> seq-core diagnostics + seq-coords types
      |
      +--> wrappers --> hosted visualizer
      |
      +--> integration plugins --> SeqViewSpec/MolViewSpec builders
      |
      +--> harness-react --> React app
```

Rules:

1. Lower Seq* packages MUST NOT import React, the harness, or a visualizer.
2. `seq-view-spec` MUST NOT import the harness or a renderer.
3. The reference `seq-viewer` MAY import Seq* packages and SeqViewSpec, but not
   the application harness.
4. `harness-core` MAY use dependency-free result/diagnostic primitives from
   `seq-core` and coordinate/locus types from `seq-coords`, but MUST NOT import
   React, Mol*, Nightingale, or the reference viewer.
5. A wrapper MAY import its hosted visualizer and harness contracts. It MUST
   NOT import another wrapper.
6. Integration plugins MAY import builders, translator APIs, and harness
   contracts. They MUST NOT manipulate visualizer-native state.
7. The web app composes components and layout. Biological translation and
   viewer-to-viewer wiring MUST remain in plugins and harness policies.
8. Vendored Nightingale packages MUST be consumed only through their public
   package entry points; local source patches do not erase the wrapper boundary.

Circular package dependencies are forbidden.

## 4. Runtime ownership

| State or responsibility | Owner |
| --- | --- |
| Sequence/annotation algorithms and normalized models | Seq* |
| Portable sequence view document | SeqViewSpec producer/consumer |
| Mol* native state | Mol* instance |
| Nightingale native component state | Nightingale instance |
| Reference viewer local viewport and render state | Seq* viewer instance |
| Message delivery and route policy | Harness |
| Registered coordinate-translation graph | Harness, populated by plugins |
| Cross-component hover/selection synchronization | Harness synchronization service |
| UniProt annotation-to-MVS generation | UniProt integration plugin |
| Case-study navigation and panel layout | Web app |

## 5. Composition invariant

A component joins the ecosystem by contributing one or more of:

- a portable visualization-request contract;
- a wrapper that consumes commands and publishes normalized messages;
- a coordinate translator;
- a message processor or view generator;
- optional host UI that publishes intents.

Adding a Neuroglancer consumer later must require a Neuroglancer request
contract, wrapper, and translators—not changes to SeqViewSpec, MolViewSpec,
Nightingale, Mol*, or existing wrappers.

## 6. Prototype boundary

The implementation is in-process and browser-hosted. Message contracts remain
serializable so a later transport can cross workers, iframes, or network
boundaries. The prototype does not include a broker, server, collaborative
session, persistence service, or general distributed-systems framework.
