/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Data, Feature, Track } from "@/sequence-viewer/data"
import type { CoordinateSystem } from "@/sequence-viewer/data/coordinates"
import { DefaultTheme, type Spec } from "@/sequence-viewer/data/specification"
import { createBarsRenderer } from "@/sequence-viewer/renderers/bars"
import { createBlockRenderer } from "@/sequence-viewer/renderers/block"
import { createNavigationRenderer } from "@/sequence-viewer/renderers/navigation"
import { createSequenceRenderer } from "@/sequence-viewer/renderers/sequence"
import { createSwatchRenderer } from "@/sequence-viewer/renderers/swatch"
import { fullCoordinateSystemRanges } from "@/sequence-viewer/utils/coordinates"
import { uuid22 } from "@/sequence-viewer/utils/object"
import { navigationTrack } from "@/sequence-viewer/utils/track"
import { useState } from "react"
import { AnnotatedMSAView } from "./annotated-msa"

const NRandomAnnotations = 0
const NRandomSequences = 1000

type CSPolymer = CoordinateSystem["polymers"][number]

const AminoAcids = "ACDEFGHIKLMNPQRSTVWY"
function randomSequence(polymer: CSPolymer): string {
  return Array.from({ length: polymer.end - polymer.start }, () =>
    Math.random() < 0.025 ? "-" : AminoAcids[Math.floor(Math.random() * AminoAcids.length)],
  ).join("")
}

function randomGrayscale(sequence: string) {
  return sequence.split("").map((l) => {
    if (l === "-") return
    const shade = Math.floor(Math.random() * 256)
    return `rgba(${shade}, ${shade}, ${shade}, 0.33)`
  })
}

function getSampleRanges(
  polymer: CoordinateSystem["polymers"][number],
  width: number,
  offset: number,
) {
  const totalWidth = polymer.end - polymer.start
  const start = offset % totalWidth
  const end = start + width
  const ranges = []

  if (end > totalWidth) {
    ranges.push({ start: 0, end: end - totalWidth })
    ranges.push({ start: offset, end: totalWidth })
  } else {
    ranges.push({ start, end })
  }

  return ranges
}

function createRandomFeature(cs: CoordinateSystem, offset = 0, label?: string): Feature {
  return {
    id: uuid22(),
    kind: "block",
    ranges: Object.fromEntries(
      cs.polymers.map((polymer) => [
        polymer.name,
        getSampleRanges(
          polymer,
          Math.ceil((Math.random() * polymer.end) / 1.5),
          Math.round(offset + Math.random() * polymer.end),
        ),
      ]),
    ),
    data: { label },
  }
}

const CS: CoordinateSystem = {
  polymers: [
    {
      name: "light",
      start: 0,
      end: 200,
    },
    {
      name: "heavy",
      start: 0,
      end: 250,
    },
  ],
  polymerGap: 2,
}

const Consensus: Record<number, Feature> = {
  80: {
    id: uuid22(),
    kind: "bars",
    ranges: fullCoordinateSystemRanges(CS),
    data: {
      threshold: 80,
      range: [0, 1],
      values: {
        light: Array.from({ length: CS.polymers[0].end }, () =>
          Math.random() < 0.025 ? Math.random() * 0.4 + 0.6 : Math.random() * 0.33,
        ),
        heavy: Array.from({ length: CS.polymers[1].end }, () =>
          Math.random() < 0.025 ? Math.random() * 0.4 + 0.6 : Math.random() * 0.33,
        ),
      },
    },
  },
  90: {
    id: uuid22(),
    kind: "bars",
    ranges: fullCoordinateSystemRanges(CS),
    data: {
      threshold: 90,
      range: [0, 1],
      values: {
        light: Array.from({ length: CS.polymers[0].end }, () =>
          Math.random() < 0.025 ? Math.random() * 0.4 + 0.6 : Math.random() * 0.33,
        ),
        heavy: Array.from({ length: CS.polymers[1].end }, () =>
          Math.random() < 0.025 ? Math.random() * 0.4 + 0.6 : Math.random() * 0.33,
        ),
      },
    },
  },
}

const Navigation = navigationTrack(CS)
const Annotations = (function () {
  const ids = Array.from({ length: NRandomAnnotations }, () => uuid22())
  const features = ids.map((id, i) => createRandomFeature(CS, i * 20, id.substring(0, 3)))
  const tracks = features.map(
    (feature, i) =>
      ({
        id: ids[i],
        header: `Feature ${ids[i].substring(0, 3)}`,
        features: [feature.id],
      }) satisfies Track,
  )
  return { features, tracks }
})()
const Sequences = (function () {
  const features: Feature[] = []
  const tracks: Track[] = []

  for (let i = 0; i < NRandomSequences; i++) {
    const light = randomSequence(CS.polymers[0])
    const heavy = randomSequence(CS.polymers[1])

    const swatch: Feature = {
      id: uuid22(),
      kind: "swatch",
      ranges: fullCoordinateSystemRanges(CS),
      data: {
        colors: {
          light: randomGrayscale(light),
          heavy: randomGrayscale(heavy),
        },
        sequence: { heavy, light },
      },
    }
    const sequence: Feature = {
      id: uuid22(),
      kind: "sequence",
      ranges: fullCoordinateSystemRanges(CS),
      data: { light, heavy },
    }

    const track: Track = {
      id: `track${i + 1}`,
      header: `Track ${i + 1}`,
      features: [swatch.id, sequence.id],
      values: {
        x: Math.round(100 * Math.random()) / 100,
        y: Math.round(100 * Math.random()) / 100,
      },
      options: {
        drawGaps: true,
      },
    }

    features.push(swatch, sequence)
    tracks.push(track)
  }

  return { features, tracks }
})()

const BaseData: Data = {
  coordinateSystem: CS,
  features: [
    Navigation.feature,
    ...Object.values(Consensus),
    ...Annotations.features,
    ...Sequences.features,
  ],
  tracks: [
    Navigation.track,
    ...Annotations.tracks,
    ...Sequences.tracks,
    ...Object.entries(Consensus).map(([threshold, feature]) => ({
      id: `consensus/${threshold}`,
      header: `Consensus/${threshold}`,
      features: [feature.id],
      data: { threshold: +threshold },
    })),
  ],
  sections: {
    navigation: [Navigation.track.id],
    "annotation-map": Annotations.tracks.map((track) => track.id),
    annotations: Annotations.tracks.map((track) => track.id),
    consensus: ["consensus/90"],
    msa: Sequences.tracks.map((track) => track.id),
    map: ["consensus/90"],
  },
}

const AminoAcidColors = {
  A: "#C8C8C8", // Alanine - gray (nonpolar)
  R: "#145AFF", // Arginine - blue (positive)
  N: "#00DCDC", // Asparagine - cyan (polar)
  D: "#E60A0A", // Aspartic Acid - red (negative)
  C: "#E6E600", // Cysteine - yellow (polar)
  Q: "#00DCDC", // Glutamine - cyan (polar)
  E: "#E60A0A", // Glutamic Acid - red (negative)
  G: "#EBEBEB", // Glycine - light gray (small)
  H: "#8282D2", // Histidine - purple (positive/neutral)
  I: "#0F820F", // Isoleucine - green (nonpolar)
  L: "#0F820F", // Leucine - green (nonpolar)
  K: "#145AFF", // Lysine - blue (positive)
  M: "#E6E600", // Methionine - yellow (nonpolar)
  F: "#3232AA", // Phenylalanine - blue-violet (aromatic)
  P: "#DC9682", // Proline - salmon (unique structure)
  S: "#FA9600", // Serine - orange (polar)
  T: "#FA9600", // Threonine - orange (polar)
  W: "#B45AB4", // Tryptophan - purple (aromatic)
  Y: "#3232AA", // Tyrosine - blue-violet (aromatic)
  V: "#0F820F", // Valine - green (nonpolar)
  B: "#FF69B4", // Aspartic/Asparagine ambiguous
  Z: "#FF69B4", // Glutamic/Glutamine ambiguous
  X: "#AAAAAA", // Unknown
}

const DefaultSpec: Spec = {
  theme: {
    ...DefaultTheme,
    borderColor: "rgb(229, 231, 235)",
    uiFontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    monospaceFontFamily: "JetBrains Mono, ui-monospace, monospace",
  },
  smoothScroll: { x: true, y: true },
  layout: {
    baseTrackHeight: 36,
    columns: [],
    sections: [],
  },
  featureRenderers: {
    navigation: [
      createNavigationRenderer({
        relativeFrequency: () => 0.1,
        textColor: () => "#4B5563",
        tickColor: () => "rgb(229, 231, 235)",
      }),
    ],
    sequence: [
      createSequenceRenderer({
        widthFactor: () => 1,
        defaultColor: () => "#4B5563",
        gapColor: () => "#B5B7BB",
        glyphColor: () => "#95979B",
        sequence:
          ({ feature }) =>
          (polymerName, position, _) =>
            feature.data[polymerName]?.[position],
        color:
          () =>
          (_, __, { data }) => {
            if (data.custom?.msaSparkles) return "white"
            return undefined
          },
      }),
    ],
    swatch: [
      createSwatchRenderer({
        color: ({ feature, data }) => {
          if (data.custom?.msaSparkles) {
            return (polymerName, position, _) => {
              const aa = feature.data.sequence?.[polymerName]?.[position]
              return AminoAcidColors[aa as keyof typeof AminoAcidColors]
            }
          }
          return (polymerName, position, _) => feature.data.colors?.[polymerName]?.[position]
        },
      }),
    ],
    block: [
      createBlockRenderer({
        heightFactor: () => 0.4,
        backgroundColor: () => "#E5E7EB",
        borderColor: () => "#D1D5DB",
        getLabel: ({ feature }) => feature.data?.label,
        getLabelColor: () => "#4B5563",
      }),
    ],
    bars: [
      createBarsRenderer({
        widthFactor: () => 0.5,
        heightFactor: () => 0.8,
        defaultColor: () => "#E5E7EB",
        range: ({ feature }) => feature.data.range,
        value:
          ({ feature }) =>
          (polymer, position, _) =>
            feature.data.values[polymer][position],
        color:
          ({ feature }) =>
          (polymer, position, _) =>
            feature.data.values[polymer][position] > 0.8 ? "rgba(0, 102, 255, 0.5)" : undefined,
      }),
    ],
  },
}

export function AnnotatedMSAExample() {
  const [data, setData] = useState(BaseData)

  return (
    <div className="fixed inset-4 border rounded">
      <AnnotatedMSAView data={data} defaultSpec={DefaultSpec} setData={setData} />
    </div>
  )
}
