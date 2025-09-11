// import { action } from "@storybook/addon-actions"

import { Data, Feature, Track } from "@cradlebio/sequence-viewer/src/data"
import { CoordinateSystem } from "@cradlebio/sequence-viewer/src/data/coordinates"
import { DefaultTheme, Spec } from "@cradlebio/sequence-viewer/src/data/specification"
import { createBarsRenderer } from "@cradlebio/sequence-viewer/src/renderers/bars"
import { createBlockRenderer } from "@cradlebio/sequence-viewer/src/renderers/block"
import { createNavigationRenderer } from "@cradlebio/sequence-viewer/src/renderers/navigation"
import { createSequenceRenderer } from "@cradlebio/sequence-viewer/src/renderers/sequence"
import { createSwatchRenderer } from "@cradlebio/sequence-viewer/src/renderers/swatch"
import { fullCoordinateSystemRanges } from "@cradlebio/sequence-viewer/src/utils/coordinates"
import { uuid22 } from "@cradlebio/sequence-viewer/src/utils/object"
import { navigationTrack } from "@cradlebio/sequence-viewer/src/utils/track"
import { Meta, StoryObj } from "@storybook/react"
import { useState } from "react"
import { RegionAnnotationEditor } from "./region-annotation"

const NRandomAnnotations = 2

type CSPolymer = CoordinateSystem["polymers"][number]

const AminoAcids = "ACDEFGHIKLMNPQRSTVWY"
function randomSequence(polymer: CSPolymer): string {
  return Array.from({ length: polymer.end - polymer.start }, () =>
    Math.random() < 0.025 ? "-" : AminoAcids[Math.floor(Math.random() * AminoAcids.length)],
  ).join("")
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

const Sequence = (function () {
  const light = randomSequence(CS.polymers[0])
  const heavy = randomSequence(CS.polymers[1])
  const feature: Feature = {
    id: uuid22(),
    kind: "sequence",
    ranges: fullCoordinateSystemRanges(CS),
    data: { light, heavy },
  }

  const track: Track = {
    id: "sequence",
    header: `Sequence`,
    features: [feature.id],
    values: {
      x: Math.round(100 * Math.random()) / 100,
      y: Math.round(100 * Math.random()) / 100,
    },
    options: {
      drawGaps: true,
    },
  }

  return { feature, track }
})()

const BaseData: Data = {
  coordinateSystem: CS,
  features: [Navigation.feature, ...Annotations.features, Sequence.feature],
  tracks: [Navigation.track, ...Annotations.tracks, Sequence.track],
  sections: {
    navigation: [Navigation.track.id],
    sequence: [Sequence.track.id],
    "annotation-map": Annotations.tracks.map((track) => track.id),
    annotations: Annotations.tracks.map((track) => track.id),
    "blocked-aas": [],
    "unreliable-regions": [],
  },
}

const DefaultSpec: Spec = {
  theme: {
    ...DefaultTheme,
    borderColor: "rgb(229, 231, 235)",
    uiFontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    monospaceFontFamily: "JetBrains Mono, ui-monospace, monospace",
  },
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
    block: [
      createBlockRenderer({
        heightFactor: () => 0.4,
        backgroundColor: () => "#E5E7EB",
        borderColor: () => "#D1D5DB",
        getLabel: ({ feature }) => feature.data?.label,
        getLabelColor: () => "#4B5563",
      }),
    ],
  },
}

function StoryRenderer() {
  const [data, setData] = useState(BaseData)

  return (
    <div className="fixed inset-4 border rounded">
      <RegionAnnotationEditor data={data} defaultSpec={DefaultSpec} setData={setData} />
    </div>
  )
}

const meta = {
  title: "Components/Sequence Canvas/Region Annotation",
  render: StoryRenderer,
  // Do not use <RegionAnnotationEditor /> as it's not intended to be modified here
  // and we want to skip Storybook serializing the large amount of data
  // the example uses
  component: StoryRenderer,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof StoryRenderer>

export default meta

type Story = StoryObj<typeof meta>
export const Default: Story = {
  args: {},
}
