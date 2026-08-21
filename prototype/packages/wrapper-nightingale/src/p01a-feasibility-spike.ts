import NightingaleLinegraphTrack from "@nightingale-elements/nightingale-linegraph-track";
import NightingaleSequence from "@nightingale-elements/nightingale-sequence";
import NightingaleTrack from "@nightingale-elements/nightingale-track";

type RenderableNightingaleElement = HTMLElement & {
  data: unknown;
  fixedHighlight: string | null;
  height: number;
  length: number;
  updateComplete: Promise<boolean>;
  width: number;
};

export interface NightingaleSpikeEvidence {
  readonly blockCount: number;
  readonly lineGraphCount: number;
  readonly markerCount: number;
  readonly sequenceCellCount: number;
}

export interface NightingaleFeasibilitySpike {
  readonly element: HTMLElement;
  readonly ready: Promise<NightingaleSpikeEvidence>;
  clearHighlight(): void;
  dispose(): void;
  getHighlight(): string | null;
  getHighlightElementCount(): number;
  getFeatureElementId(): string | null;
  getSelectedId(): string | null;
  setHighlight(start: number, end: number): void;
}

const SEQUENCE = "MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGP";

// The upstream manifests declare `sideEffects: false`, so retain explicit value
// references to the decorator-registered element classes in production builds.
const NIGHTINGALE_CONSTRUCTORS = [
  NightingaleLinegraphTrack,
  NightingaleSequence,
  NightingaleTrack,
] as const;

function configureTrack(
  tagName: string,
  width: number,
  height: number,
): RenderableNightingaleElement {
  const element = document.createElement(tagName) as RenderableNightingaleElement;
  element.length = SEQUENCE.length;
  element.width = width;
  element.height = height;
  element.setAttribute("length", String(SEQUENCE.length));
  element.setAttribute("width", String(width));
  element.setAttribute("height", String(height));
  element.setAttribute("highlight-event", "onmouseover");
  return element;
}

function addRow(root: HTMLElement, label: string, element: RenderableNightingaleElement): void {
  const row = document.createElement("section");
  row.style.display = "grid";
  row.style.gridTemplateColumns = "8rem minmax(0, 1fr)";
  row.style.alignItems = "center";
  row.style.gap = "0.75rem";

  const heading = document.createElement("strong");
  heading.textContent = label;
  row.append(heading, element);
  root.append(row);
}

function afterAnimationFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const next = (remaining: number): void => {
      if (remaining === 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => next(remaining - 1));
    };
    next(count);
  });
}

/**
 * P01a-only executable probe. This is intentionally not the production wrapper:
 * it mounts upstream-native tracks directly so the feasibility gate can inspect
 * their real rendering, events, highlighting, and disconnect behavior.
 */
export function mountNightingaleFeasibilitySpike(target: HTMLElement): NightingaleFeasibilitySpike {
  if (NIGHTINGALE_CONSTRUCTORS.length !== 3) {
    throw new Error("Nightingale custom-element registrations are unavailable");
  }
  const root = document.createElement("div");
  root.dataset.testid = "p01a-nightingale-spike";
  root.style.display = "grid";
  root.style.gap = "0.5rem";

  const sequence = configureTrack("nightingale-sequence", 720, 54);
  sequence.dataset.testid = "p01a-nightingale-sequence";
  sequence.data = SEQUENCE;

  const features = configureTrack("nightingale-track", 720, 42);
  features.dataset.testid = "p01a-nightingale-features";
  features.data = [
    {
      accession: "p01a-block-domain",
      color: "#2563eb",
      end: 24,
      shape: "rectangle",
      start: 8,
      tooltipContent: "P01a feature/block probe",
      type: "DOMAIN",
    },
    {
      accession: "p01a-marker-site",
      color: "#dc2626",
      end: 36,
      shape: "diamond",
      start: 36,
      tooltipContent: "P01a single-position marker probe",
      type: "SITE",
    },
  ];

  const values = configureTrack("nightingale-linegraph-track", 720, 72);
  values.dataset.testid = "p01a-nightingale-values";
  values.data = [
    {
      color: "#059669",
      fill: "none",
      name: "p01a-confidence",
      range: [0, 1],
      values: Array.from({ length: SEQUENCE.length }, (_, index) => ({
        position: index + 1,
        value: 0.25 + ((index * 17) % 70) / 100,
      })),
    },
  ];

  addRow(root, "Sequence", sequence);
  addRow(root, "Blocks + marker", features);
  addRow(root, "Numeric values", values);
  target.append(root);

  const elements = [sequence, features, values] as const;
  let fixedHighlight: string | null = null;
  let selectedId: string | null = null;
  features.addEventListener("change", (event) => {
    const detail = (
      event as CustomEvent<{ feature?: { accession?: string }; selectedId?: string | null }>
    ).detail;
    selectedId = detail?.selectedId ?? detail?.feature?.accession ?? null;
  });
  const ready = Promise.all(elements.map((element) => element.updateComplete))
    .then(() => afterAnimationFrames(2))
    .then(() => {
      const evidence: NightingaleSpikeEvidence = {
        blockCount: features.querySelectorAll("g.feature-group").length,
        lineGraphCount: values.querySelectorAll("path.graph").length,
        markerCount: features.querySelectorAll("path.diamond").length,
        sequenceCellCount: sequence.querySelectorAll("rect.base_bg").length,
      };
      if (
        evidence.blockCount < 2 ||
        evidence.lineGraphCount < 1 ||
        evidence.markerCount < 1 ||
        evidence.sequenceCellCount < 1
      ) {
        throw new Error(`Nightingale feasibility frame incomplete: ${JSON.stringify(evidence)}`);
      }
      return evidence;
    });

  const setHighlight = (start: number, end: number): void => {
    const highlight = `${start}:${end}`;
    for (const element of elements) element.fixedHighlight = highlight;
    fixedHighlight = highlight;
  };

  return {
    element: root,
    ready,
    clearHighlight: () => {
      for (const element of elements) element.fixedHighlight = null;
      fixedHighlight = null;
    },
    dispose: () => root.remove(),
    getHighlight: () => fixedHighlight,
    getHighlightElementCount: () => root.querySelectorAll(".highlighted > *").length,
    getFeatureElementId: () => root.querySelector("#g_p01a-block-domain")?.id ?? null,
    getSelectedId: () => selectedId,
    setHighlight,
  };
}
