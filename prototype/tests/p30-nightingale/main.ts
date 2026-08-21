import {
  createEventFabric,
  createMessageSchemaRegistry,
  createTranslatorRegistry,
  type HarnessMessage,
  installCoreMessageSchemas,
} from "@seq-star/harness-core";
import type { SeqViewSpec } from "@seq-star/seq-view-spec";
import type { NightingalePresentation } from "@seq-star/wrapper-nightingale";
import { NightingaleWrapper } from "@seq-star/wrapper-nightingale";

const base = {
  kind: "seq-view-spec",
  version: "0.1.0",
  sequences: [{ id: "sequence", coordinateSpace: "space", alphabet: "protein", residues: "MKTAY" }],
} as const;
const axis = { segments: [{ id: "axis", space: "space", start: 0, end: 5 }] } as const;
const documentA: SeqViewSpec = {
  ...base,
  id: "document-a",
  annotations: [
    {
      id: "features",
      kind: "loci",
      semanticType: "test.feature",
      items: [{ id: "shared", loci: [{ kind: "interval", space: "space", start: 1, end: 4 }] }],
    },
    {
      id: "relationships",
      kind: "relationships",
      semanticType: "test.relationship",
      items: [
        {
          id: "paired",
          endpoints: [
            { role: "source", loci: [{ kind: "interval", space: "space", start: 0, end: 1 }] },
            { role: "target", loci: [{ kind: "point", space: "space", position: 4 }] },
          ],
        },
      ],
    },
  ],
  views: [
    {
      id: "main",
      axis,
      sections: [
        {
          id: "section",
          tracks: [
            {
              id: "sequence-track",
              layers: [{ id: "sequence-layer", representation: "sequence", sequence: "sequence" }],
            },
            {
              id: "feature-track",
              layers: [{ id: "feature-layer", representation: "blocks", annotation: "features" }],
            },
            {
              id: "relationship-track",
              layers: [
                {
                  id: "relationship-layer",
                  representation: "links",
                  annotation: "relationships",
                  fallback: { representation: "blocks" },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
const unsupportedDocument: SeqViewSpec = {
  ...base,
  id: "document-unsupported",
  annotations: [
    {
      id: "relationships",
      kind: "relationships",
      semanticType: "test.relationship",
      items: [
        {
          id: "link",
          endpoints: [
            { role: "source", loci: [{ kind: "point", space: "space", position: 0 }] },
            { role: "target", loci: [{ kind: "point", space: "space", position: 3 }] },
          ],
        },
      ],
    },
  ],
  views: [
    {
      id: "main",
      axis,
      sections: [
        {
          id: "section",
          tracks: [
            {
              id: "sequence-track",
              layers: [{ id: "sequence-layer", representation: "sequence", sequence: "sequence" }],
            },
            {
              id: "links-track",
              layers: [{ id: "links-layer", representation: "links", annotation: "relationships" }],
            },
          ],
        },
      ],
    },
  ],
};
const fallbackDocument: SeqViewSpec = {
  ...base,
  id: "document-fallback",
  annotations: [
    {
      id: "values",
      kind: "values",
      semanticType: "test.values",
      space: "space",
      valueType: "number",
      values: { encoding: "dense", data: [0, 1, 2, 3, 4] },
    },
  ],
  views: [
    {
      id: "main",
      axis,
      sections: [
        {
          id: "section",
          tracks: [
            {
              id: "values-track",
              layers: [
                {
                  id: "values-layer",
                  representation: "bars",
                  annotation: "values",
                  color: {
                    kind: "continuous",
                    field: "value",
                    domain: [0, 4],
                    range: ["#ffffff", "#000000"],
                    missing: "#cccccc",
                  },
                  fallback: {
                    representation: "heatmap",
                    color: {
                      kind: "continuous",
                      field: "value",
                      domain: [0, 4],
                      range: ["#ffffff", "#000000"],
                      missing: "#cccccc",
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
const linegraphDocument: SeqViewSpec = {
  ...fallbackDocument,
  id: "document-linegraph",
  views: [
    {
      id: "main",
      axis,
      sections: [
        {
          id: "section",
          tracks: [
            {
              id: "values-track",
              layers: [
                {
                  id: "values-layer",
                  representation: "bars",
                  annotation: "values",
                  color: { kind: "fixed", color: "#2563eb" },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
const viewportSequence = "ACDEFGHIKLMNPQRSTVWY".repeat(12);
const viewportDocument: SeqViewSpec = {
  ...base,
  id: "document-viewport",
  sequences: [
    { id: "sequence", coordinateSpace: "space", alphabet: "protein", residues: viewportSequence },
  ],
  annotations: [
    {
      id: "features",
      kind: "loci",
      semanticType: "test.feature",
      items: [{ id: "feature", loci: [{ kind: "interval", space: "space", start: 40, end: 98 }] }],
    },
    {
      id: "values",
      kind: "values",
      semanticType: "test.values",
      space: "space",
      valueType: "number",
      values: {
        encoding: "dense",
        data: Array.from({ length: viewportSequence.length }, (_, i) => i % 9),
      },
    },
  ],
  views: [
    {
      id: "main",
      axis: { segments: [{ id: "axis", space: "space", start: 0, end: viewportSequence.length }] },
      sections: [
        {
          id: "section",
          tracks: [
            {
              id: "sequence-track",
              label: "Sequence letters",
              layers: [{ id: "sequence-layer", representation: "sequence", sequence: "sequence" }],
            },
            {
              id: "feature-track",
              label: "An intentionally long feature label that must truncate",
              layers: [{ id: "feature-layer", representation: "blocks", annotation: "features" }],
            },
            {
              id: "value-track",
              label: "Conservation",
              layers: [
                {
                  id: "value-layer",
                  representation: "bars",
                  annotation: "values",
                  color: { kind: "fixed", color: "#2563eb" },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const alignmentColumns = 118;
const alignmentMembers = Array.from({ length: 32 }, (_, memberIndex) => {
  let position = 0;
  const positions = Array.from({ length: alignmentColumns }, (_, column) => {
    // Every row has a stable explicit gap at column 2. Member 1 adds a
    // member-specific gap at column 5 to prove rows are not inferred from the
    // query sequence.
    if (column === 2 || (memberIndex === 1 && column === 5)) return null;
    return position++;
  });
  return {
    id: `member-${memberIndex}`,
    sequence: `sequence-${memberIndex}`,
    positions,
    metadata: { label: memberIndex === 0 ? "query" : `member ${memberIndex}` },
  };
});
const alignmentDocument: SeqViewSpec = {
  kind: "seq-view-spec",
  version: "0.1.0",
  id: "alignment-32x118",
  sequences: alignmentMembers.map((member, memberIndex) => ({
    id: member.sequence,
    coordinateSpace: `member-space-${memberIndex}`,
    alphabet: "protein" as const,
    residues: Array.from(
      { length: member.positions.filter((position) => position !== null).length },
      (_, position) => "ACDEFGHIKLMNPQRSTVWY"[(position + memberIndex) % 20],
    ).join(""),
  })),
  alignments: [
    {
      id: "alignment-32",
      coordinateSpace: "alignment-columns",
      length: alignmentColumns,
      members: alignmentMembers,
    },
  ],
  annotations: [
    {
      id: "annotation-consensus",
      kind: "values",
      semanticType: "test.consensus",
      space: "alignment-columns",
      valueType: "category",
      values: { encoding: "dense", data: Array.from({ length: alignmentColumns }, () => "A") },
    },
    {
      id: "annotation-conservation",
      kind: "values",
      semanticType: "test.conservation",
      space: "alignment-columns",
      valueType: "number",
      values: {
        encoding: "dense",
        data: Array.from({ length: alignmentColumns }, (_, column) => column / alignmentColumns),
      },
    },
    {
      id: "annotation-subgroups",
      kind: "loci",
      semanticType: "test.subgroups",
      items: [
        {
          id: "subgroup",
          value: "group-a",
          loci: [{ kind: "interval", space: "alignment-columns", start: 20, end: 60 }],
        },
      ],
    },
  ],
  views: [
    {
      id: "main",
      context: { alignment: "alignment-32" },
      axis: { segments: [{ id: "columns", space: "alignment-columns", start: 0, end: 118 }] },
      sections: [
        {
          id: "rows",
          tracks: [
            {
              id: "alignment",
              label: "Alignment",
              layers: [
                {
                  id: "aligned-residues",
                  representation: "alignment",
                  alignment: "alignment-32",
                  showLetters: true,
                },
              ],
            },
          ],
        },
        {
          id: "annotations",
          tracks: [
            {
              id: "track-consensus",
              layers: [
                {
                  id: "consensus-swatch",
                  representation: "swatch",
                  annotation: "annotation-consensus",
                  color: { kind: "fixed", color: "#2563eb" },
                },
              ],
            },
            {
              id: "track-conservation",
              layers: [
                {
                  id: "conservation-heatmap",
                  representation: "heatmap",
                  annotation: "annotation-conservation",
                  color: {
                    kind: "continuous",
                    field: "value",
                    domain: [0, 1],
                    range: ["#dbeafe", "#1d4ed8"],
                    missing: "#cbd5e1",
                  },
                },
              ],
            },
            {
              id: "track-subgroups",
              layers: [
                {
                  id: "subgroup-blocks",
                  representation: "blocks",
                  annotation: "annotation-subgroups",
                  color: { kind: "fixed", color: "#7c3aed" },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const uuid = (): string => crypto.randomUUID();
const setup = async (
  id: string,
  target: HTMLElement,
  failureViewPolicy: "retain" | "clear",
  presentation?: NightingalePresentation,
) => {
  const schemas = createMessageSchemaRegistry();
  installCoreMessageSchemas(schemas);
  const fabric = createEventFabric({ schemas });
  const messages: HarnessMessage[] = [];
  fabric.observe().subscribe((message) => messages.push(message));
  const wrapper = new NightingaleWrapper({
    id,
    target,
    config: { failureViewPolicy, ...(presentation === undefined ? {} : { presentation }) },
  });
  await wrapper.start({
    fabric,
    translators: createTranslatorRegistry(),
    signal: new AbortController().signal,
    reportCapabilities() {},
    reportCoordinateSpaces() {},
  });
  const load = async (document: SeqViewSpec, requestId: string) => {
    fabric.publish({
      id: uuid(),
      type: "visualization.seqviewspec.request",
      version: "0.1.0",
      source: { plugin: "p30-browser" },
      target: { component: id },
      correlationId: uuid(),
      timestamp: new Date().toISOString(),
      payload: { format: "seqviewspec", requestId, mode: "replace", document, viewId: "main" },
    });
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline) {
      const lifecycle = messages.findLast((message) => {
        const payload = message.payload as { requestId?: string; status?: string };
        return (
          message.type === "lifecycle.visualization" &&
          payload.requestId === requestId &&
          payload.status !== "accepted"
        );
      });
      if (lifecycle !== undefined) return lifecycle.payload;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Timed out waiting for ${requestId}`);
  };
  return { fabric, load, messages, wrapper };
};

const retainTarget = document.querySelector<HTMLElement>("#retain");
const clearTarget = document.querySelector<HTMLElement>("#clear");
const viewportTarget = document.querySelector<HTMLElement>("#viewport");
const alignmentTarget = document.querySelector<HTMLElement>("#alignment");
const status = document.querySelector<HTMLElement>("#status");
if (
  retainTarget === null ||
  clearTarget === null ||
  viewportTarget === null ||
  alignmentTarget === null ||
  status === null
)
  throw new Error("Missing P30 fixture host.");
const retain = await setup("retain", retainTarget, "retain");
const clear = await setup("clear", clearTarget, "clear");
const viewport = await setup("viewport", viewportTarget, "retain", {
  trackActions: [
    { trackId: "feature-track", label: "Show feature in 3D", kind: "structure" },
    { trackId: "value-track", label: "Inspect conservation layers", kind: "layers" },
    { trackId: "absent-track", label: "Unavailable action", kind: "layers" },
  ],
});
const alignment = await setup("alignment", alignmentTarget, "retain", {
  initialViewport: { start: 1, end: 10 },
  alignmentMemberActions: [
    { alignmentId: "alignment-32", memberId: "member-0", label: "Show query structure" },
  ],
});
await retain.load(documentA, "retain-a");
await clear.load(documentA, "clear-a");
await viewport.load(viewportDocument, "viewport-a");
await alignment.load(alignmentDocument, "alignment-a");

const nativeMessages = (probe: typeof retain) =>
  probe.messages.filter((message) => message.type === "interaction.native");
const dispatchClick = (target: Element, clientX = 1): void =>
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX, clientY: 1 }));

Object.assign(window, {
  p30Probe: {
    async retainFailure() {
      const lifecycle = await retain.load(unsupportedDocument, "retain-b");
      return {
        lifecycle,
        rootCount: retainTarget.querySelectorAll('[data-seqstar-nightingale="root"]').length,
        hasA: Boolean(
          retainTarget.querySelector('[data-seqstar-native-id*="document:10:document-a"]'),
        ),
        stagingCount: retainTarget.querySelectorAll("[data-seqstar-nightingale-staging]").length,
      };
    },
    clickFeature() {
      const before = nativeMessages(retain).length;
      const feature = retainTarget.querySelector("rect.outer-rectangle.feature");
      if (feature === null) throw new Error("Missing actual Nightingale feature node.");
      dispatchClick(feature);
      return nativeMessages(retain)
        .slice(before)
        .map((message) => message.payload);
    },
    clickSequence() {
      const before = nativeMessages(retain).length;
      const residue = retainTarget.querySelector("nightingale-sequence rect.base_bg.feature");
      if (residue === null) throw new Error("Missing actual Nightingale residue node.");
      dispatchClick(residue);
      return nativeMessages(retain)
        .slice(before)
        .map((message) => message.payload);
    },
    async clearFailure() {
      const lifecycle = await clear.load(unsupportedDocument, "clear-b");
      return {
        lifecycle,
        rootCount: clearTarget.querySelectorAll('[data-seqstar-nightingale="root"]').length,
        stagingCount: clearTarget.querySelectorAll("[data-seqstar-nightingale-staging]").length,
      };
    },
    async declaredFallback() {
      const lifecycle = await retain.load(fallbackDocument, "fallback");
      return {
        lifecycle,
        trackCount: retainTarget.querySelectorAll("nightingale-track").length,
        linegraphCount: retainTarget.querySelectorAll("nightingale-linegraph-track").length,
      };
    },
    async clickLinegraph() {
      await retain.load(linegraphDocument, "linegraph");
      const before = nativeMessages(retain).length;
      const element = retainTarget.querySelector("nightingale-linegraph-track") as
        | (HTMLElement & { getXFromSeqPosition(position: number): number })
        | null;
      const overlay = element?.querySelector("g.mouse-over-effects > rect");
      if (element === null || overlay === null || overlay === undefined)
        throw new Error("Missing actual Nightingale linegraph overlay.");
      const x = overlay.getBoundingClientRect().left + element.getXFromSeqPosition(4);
      dispatchClick(overlay, x);
      return nativeMessages(retain)
        .slice(before)
        .map((message) => message.payload);
    },
    async viewportStress() {
      const root = viewportTarget.querySelector<HTMLElement>('[data-seqstar-nightingale="root"]');
      const navigation = root?.querySelector<HTMLElement>(
        '[data-seqstar-nightingale-viewport="root"]',
      );
      const header = root?.querySelector<HTMLElement>(".seqstar-nightingale-track-header");
      const action = root?.querySelector<HTMLButtonElement>('[aria-label="Show feature in 3D"]');
      if (root === undefined || navigation === null || header === null || action === null)
        throw new Error("Missing synchronized viewport controls.");
      const headerBefore = header.getBoundingClientRect().x;
      const label = root.querySelector<HTMLButtonElement>(
        '[data-seqstar-track="feature-track"] [data-seqstar-track-activate]',
      );
      if (label === null) throw new Error("Missing interactive feature label.");
      const activeHeader = label.closest<HTMLElement>("[data-seqstar-track-header]");
      if (activeHeader === null) throw new Error("Missing interactive feature header.");
      const activationsBefore = nativeMessages(viewport).length;
      label.click();
      action.click();
      for (let index = 0; index < 100; index += 1) {
        root.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: root.getBoundingClientRect().left + root.getBoundingClientRect().width / 2,
            deltaX: index % 2 === 0 ? 32 : 0,
            deltaY: index % 2 === 0 ? 0 : index % 4 === 1 ? -160 : 160,
          }),
        );
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      }
      for (let index = 0; index < 8; index += 1) {
        root.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: root.getBoundingClientRect().left + root.getBoundingClientRect().width / 2,
            deltaY: -360,
          }),
        );
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      }
      const slider = navigation.querySelector<HTMLInputElement>("input[type=range]");
      if (slider === null) throw new Error("Missing viewport slider.");
      slider.value = slider.max;
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      for (let index = 0; index < 3; index += 1)
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      const elements = [
        ...root.querySelectorAll<HTMLElement>(
          "nightingale-sequence, nightingale-track, nightingale-linegraph-track",
        ),
      ];
      const positions = elements.map((element) => {
        const coordinate = element as HTMLElement & {
          getXFromSeqPosition(position: number): number;
        };
        return element.getBoundingClientRect().left + coordinate.getXFromSeqPosition(50);
      });
      const sequence = root.querySelector<HTMLElement>("nightingale-sequence");
      return {
        viewport: {
          start: root.dataset.seqstarViewportStart,
          end: root.dataset.seqstarViewportEnd,
        },
        wrapperViewport: viewport.wrapper.getViewport(),
        headerBefore,
        headerAfter: header.getBoundingClientRect().x,
        headerPosition: getComputedStyle(header).position,
        action: {
          radius: getComputedStyle(action).borderRadius,
          hasSvg: action.querySelector("svg") !== null,
          pressed: action.getAttribute("aria-pressed"),
        },
        labelTitle: label.title,
        labelPressed: label.getAttribute("aria-pressed"),
        headerActive: activeHeader.dataset.seqstarTrackActive,
        navigationWidth: navigation.getBoundingClientRect().width,
        rootWidth: root.getBoundingClientRect().width,
        lettersVisible: /[A-Z]{2}/u.test(sequence?.textContent ?? ""),
        trackActivations: nativeMessages(viewport)
          .slice(activationsBefore)
          .filter(
            (message) =>
              (message.payload as { interaction?: string }).interaction === "track-activate",
          ).length,
        absentActionDiagnostic: viewport.messages
          .filter((message) => message.type === "lifecycle.visualization")
          .flatMap((message) =>
            ((message.payload as { diagnostics?: Array<{ code?: string }> }).diagnostics ?? []).map(
              (diagnostic) => diagnostic.code,
            ),
          )
          .includes("wrapper.nightingale.presentation.track-action.absent"),
        positions,
      };
    },
    async semanticLoci() {
      await retain.load(documentA, "semantic");
      const root = retainTarget.querySelector<HTMLElement>('[data-seqstar-nightingale="root"]');
      const feature = root?.querySelector<HTMLElement>('[data-seqstar-layer="feature-layer"]');
      const relationship = root?.querySelector<HTMLElement>(
        '[data-seqstar-layer="relationship-layer"]',
      );
      const featureId = feature?.querySelector<HTMLElement>("[data-seqstar-feature-id]")?.dataset
        .seqstarFeatureId;
      const relationshipId = relationship?.querySelector<HTMLElement>("[data-seqstar-feature-id]")
        ?.dataset.seqstarFeatureId;
      const emit = (
        target: HTMLElement | undefined,
        kind: "hover" | "select",
        featureId: string | undefined,
      ) => {
        const native = target as HTMLElement & {
          emitSeqstarInteraction(value: {
            kind: "hover" | "select";
            phase: "set";
            featureId?: string;
            regions: readonly { start: number; end: number }[];
          }): void;
        };
        if (target === undefined || featureId === undefined)
          throw new Error("Missing semantic native feature.");
        native.emitSeqstarInteraction({
          kind,
          phase: "set",
          featureId,
          regions: [{ start: 1, end: 1 }],
        });
      };
      const before = nativeMessages(retain).length;
      emit(feature, "hover", featureId);
      emit(relationship, "hover", relationshipId);
      emit(relationship, "select", relationshipId);
      emit(relationship, "select", relationshipId);
      return nativeMessages(retain)
        .slice(before)
        .map((message) => message.payload);
    },
    async alignmentAdapter() {
      const root = alignmentTarget.querySelector<HTMLElement>('[data-seqstar-nightingale="root"]');
      const rows = root?.querySelector<HTMLElement>('[data-seqstar-alignment-rows="alignment-32"]');
      const query = root?.querySelector<HTMLElement>('[data-seqstar-alignment-member="member-0"]');
      const nonQuery = root?.querySelector<HTMLElement>(
        '[data-seqstar-alignment-member="member-1"]',
      );
      const queryAction = query?.querySelector<HTMLButtonElement>(
        '[aria-label="Show query structure"]',
      );
      if (
        root === null ||
        rows === null ||
        query === null ||
        nonQuery === null ||
        queryAction === null
      )
        throw new Error(
          `Missing rendered alignment rows or configured query action: ${JSON.stringify(
            alignment.messages
              .filter((message) => message.type === "lifecycle.visualization")
              .map((message) => message.payload),
          )}`,
        );
      const actionBefore = nativeMessages(alignment).length;
      queryAction.click();
      for (let index = 0; index < 100; index += 1) {
        root.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: root.getBoundingClientRect().left + root.getBoundingClientRect().width / 2,
            deltaX: index % 2 === 0 ? 24 : 0,
            deltaY: index % 2 === 0 ? 0 : index % 4 === 1 ? -120 : 120,
          }),
        );
      }
      rows.scrollTop = rows.scrollHeight;
      const emit = (row: HTMLElement, column: number) => {
        const native = row.querySelector<HTMLElement>("nightingale-sequence") as HTMLElement & {
          emitSeqstarInteraction(value: {
            kind: "select";
            phase: "set";
            regions: readonly { start: number; end: number }[];
          }): void;
        };
        if (native === null) throw new Error("Missing native alignment sequence row.");
        native.emitSeqstarInteraction({
          kind: "select",
          phase: "set",
          regions: [{ start: column, end: column }],
        });
      };
      const before = nativeMessages(alignment).length;
      emit(query, 2);
      emit(nonQuery, 3);
      emit(nonQuery, 6);
      await alignment.load(alignmentDocument, "alignment-b");
      return {
        rowCount: root.querySelectorAll("section[data-seqstar-alignment-member]").length,
        sequenceRows: root.querySelectorAll("nightingale-sequence[data-seqstar-alignment]").length,
        structureActionCount: root.querySelectorAll('[aria-label="Show query structure"]').length,
        annotationTracks: root.querySelectorAll("nightingale-track").length,
        viewport: alignment.wrapper.getViewport(),
        rowsScrollTop: rows.scrollTop,
        actionEvents: nativeMessages(alignment)
          .slice(actionBefore)
          .filter(
            (message) =>
              (message.payload as { interaction?: string }).interaction === "track-activate",
          )
          .map((message) => message.payload),
        loci: nativeMessages(alignment)
          .slice(before)
          .filter((message) => {
            const payload = message.payload as { interaction?: string; phase?: string };
            return payload.interaction === "select" && payload.phase === "set";
          })
          .map((message) => message.payload),
        replacementRows: alignmentTarget.querySelectorAll("section[data-seqstar-alignment-member]")
          .length,
      };
    },
  },
});
status.dataset.status = "ready";
status.textContent = "ready";
