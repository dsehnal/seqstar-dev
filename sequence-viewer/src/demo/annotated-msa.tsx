import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Context } from "@/sequence-viewer/context"
import type { Data, Feature, Track } from "@/sequence-viewer/data"
import type { Spec } from "@/sequence-viewer/data/specification"
import type { SectionModel } from "@/sequence-viewer/model/section"
import { Canvas, Cell, Layout, TrackRows } from "@/sequence-viewer/react"
import {
  useBehavior,
  useCreateSequenceContext,
  useIsTrackHighlighted,
  useSequenceContext,
} from "@/sequence-viewer/react/hooks"
import { uuid22 } from "@/sequence-viewer/utils/object"
import {
  isEmptyRanges,
  subtractRanges,
  unionRanges,
} from "@/sequence-viewer/utils/range"
import { ChevronDownIcon, ChevronRightIcon, CircleMinusIcon, CirclePlusIcon, FilterIcon, ImportIcon, ListIcon, MousePointerClickIcon, MoveIcon, PencilIcon, PlusIcon, RefreshCwIcon, SparklesIcon, TelescopeIcon, TrashIcon } from "lucide-react"
import { useState } from "react"
import { ImportFeaturesDialog } from "./ImportFeaturesDialog"

interface LayoutState {
  annotations: boolean
  data: boolean
  msaZoom: boolean
}

export function AnnotatedMSAView({
  data,
  defaultSpec,
  setData,
}: {
  data: Data
  defaultSpec: Spec
  setData: (data: Data) => void
}) {
  const [layoutState, setLayoutState] = useState<LayoutState>({
    annotations: false,
    data: false,
    msaZoom: false,
  })
  const [importFeaturesOpen, setImportFeaturesOpen] = useState(false)

  const ctx = useCreateSequenceContext(defaultSpec, data)

  const addAnnotation = () => {
    const id = uuid22()

    const ranges = ctx.getSelectedRanges()
    if (isEmptyRanges(ranges)) return

    const feature: Feature = {
      id: uuid22(),
      kind: "block",
      ranges,
    }

    addAnnotations(
      data,
      setData,
      [feature],
      [
        {
          id,
          header: `Feature ${id.substring(0, 3)}`,
          features: [feature.id],
        },
      ],
    )

    ctx.getSection("annotations")?.scrollToTrack(id)
  }

  const resetView = () => {
    ctx.viewport.resetView()
    setData({
      ...data,
      custom: undefined,
    })
    setLayoutState((prev) => ({ ...prev, msaZoom: false }))
  }

  return (
    <>
      <Layout
        context={ctx}
        layout={{
          baseTrackHeight: 36,
          columns: [
            { name: "header", width: 200 },
            { name: "canvas" },
            { name: "data-x", width: 60, isHidden: !layoutState.data },
            { name: "data-y", width: 60, isHidden: !layoutState.data },
          ],
          sections: [
            { name: "navigation", height: 36 },
            {
              name: "annotations-header",
              height: "min-content",
              isHidden: !layoutState.annotations,
            },
            {
              name: "annotation-map",
              height: 48,
              horizontalView: "full",
              verticalView: "full",
              verticalPadding: 4,
              isHidden: !layoutState.annotations,
              trackStyle: { baseHeight: 48 },
            },
            {
              name: "annotations",
              maxHeight: 36 * 4,
              trackStyle: { borders: true },
              isHidden: !layoutState.annotations,
            },
            { name: "msa-header", height: "min-content" },
            { name: "consensus", height: 36, trackStyle: { borders: true } },
            {
              name: "msa",
              height: "auto",
              verticalView: layoutState.msaZoom ? "full" : "default",
              trackStyle: { borders: true },
            },
            { name: "separator-3", height: 6 },
            { name: "map", height: 55, horizontalView: "full", trackStyle: { baseHeight: 55 } },
            { name: "interaction", height: 36 },
          ],
        }}
      >
        <TrackRows
          section="annotations"
          column="header"
          Element={AnnotationHeader}
          elementProps={{ setData }}
        />
        <TrackRows section="consensus" column="header" Element={TrackHeader} />
        <TrackRows section="msa" column="header" Element={TrackHeader} />
        <TrackRows
          section="map"
          column="header"
          Element={GlobalConsensusHeader}
          elementProps={{ setData }}
        />

        <Cell
          section="consensus"
          column="data-x"
          className="flex items-end border-b px-3 py-1 font-bold text-xs"
        >
          X
        </Cell>
        <Cell
          section="consensus"
          column="data-y"
          className="flex items-end border-b px-3 py-1 font-bold text-xs"
        >
          Y
        </Cell>
        <TrackRows
          section="msa"
          column="data-x"
          Element={DataValue}
          elementProps={{ column: "x" }}
        />
        <TrackRows
          section="msa"
          column="data-y"
          Element={DataValue}
          elementProps={{ column: "y" }}
        />

        <Canvas section="navigation" column="canvas" />
        <Canvas section="annotation-map" column="canvas" />
        <Canvas section="annotations" column="canvas" />
        <Canvas section="consensus" column="canvas" />
        <Canvas section="msa" column="canvas" />
        <Canvas section="map" column="canvas" />

        <Cell section="navigation" className="bg-gray-50" />

        <Cell
          section="annotations-header"
          className="flex items-center gap-1 border-t border-b bg-gray-50 px-3 py-1 font-bold"
        >
          Annotations
          <div className="ms-1" />
          <Button variant="link" size="sm" onClick={addAnnotation}>
            <PlusIcon />
          </Button>
          <Button variant="link" size="sm" onClick={() => setImportFeaturesOpen(true)}>
            <ImportIcon />
          </Button>
        </Cell>

        <Cell
          section="annotation-map"
          column="header"
          className="flex items-center px-3 text-gray-500 text-xs"
        >
          All Annotations
        </Cell>

        <Cell section="annotation-map" className="border-b" />

        <Cell
          section="msa-header"
          className="flex items-center gap-1 border-t border-b bg-gray-50 px-3 py-1 font-bold"
        >
          MSA
          <div className="ms-1" />
          <Button
            title="Toggle residue coloring"
            variant={data.custom?.msaSparkles ? "default" : "link"}
            size="sm"
            onClick={() =>
              setData({
                ...data,
                custom: { ...data.custom, msaSparkles: !data.custom?.msaSparkles },
              })
            }
          >
            <SparklesIcon />
          </Button>
          <Button
            title="Toggle data"
            variant={layoutState.msaZoom ? "default" : "link"}
            size="sm"
            onClick={() => setLayoutState({ ...layoutState, msaZoom: !layoutState.msaZoom })}
          >
            <TelescopeIcon />
          </Button>
        </Cell>
        <Cell section="separator-3" className="border-t border-b bg-gray-50" />

        <Controls layoutState={layoutState} setLayoutState={setLayoutState} resetView={resetView} />

        <Cell section="interaction" className="border-t bg-gray-50">
          <CurrentInteraction />
        </Cell>
      </Layout>

      <ImportFeaturesDialog
        open={importFeaturesOpen}
        setOpen={setImportFeaturesOpen}
        onAdd={(xs) =>
          addAnnotations(data, setData, xs.features, xs.tracks, { skipChildren: true })
        }
      />
    </>
  )
}

function addAnnotations(
  data: Data,
  setData: (data: Data) => void,
  features: Feature[],
  tracks: Partial<Track>[],
  options?: { skipChildren?: boolean },
) {
  const newTracks = tracks.map(
    (t) =>
      ({
        ...t,
        height: 36,
      }) as Track,
  )

  let newIds = newTracks.map((t) => t.id)
  if (options?.skipChildren) {
    const childrenIds = new Set(tracks.flatMap((t) => t.children ?? []))
    newIds = newIds.filter((id) => !childrenIds.has(id))
  }

  setData({
    ...data,
    features: [...data.features, ...features],
    tracks: [...data.tracks, ...newTracks],
    sections: {
      ...data.sections,
      "annotation-map": [...data.sections["annotation-map"], ...newIds],
      annotations: [...data.sections.annotations, ...newIds],
    },
  })
}

function TrackHeader({ track }: { track: Track }) {
  return <div className="cursor-default px-3 text-xs">{track.header}</div>
}

function DataValue({ track, column }: { track: Track; column: string }) {
  return <div className="px-3 text-xs">{track.values?.[column]}</div>
}

function GlobalConsensusHeader({
  section,
  track,
  setData,
}: {
  section: SectionModel
  track: Track
  setData: (data: Data) => void
}) {
  const context = useSequenceContext()
  const isHighlighted = useIsTrackHighlighted(context, track.id)
  const isSectionHighlighted = section.context.highlight.sectionName === section.name

  return (
    <div className="flex w-full cursor-default items-center px-3 text-xs">
      {track.header ?? "Consensus"}
      <div className="m-auto" />
      {isHighlighted &&
        isSectionHighlighted &&
        [80, 90].map((threshold) => (
          <Button
            key={threshold}
            variant={track.data?.threshold === threshold ? "default" : "secondary"}
            size="sm"
            className="ms-1"
            onClick={() => updateConsensus(context, threshold, setData)}
          >
            {threshold}%
          </Button>
        ))}
    </div>
  )
}

function updateConsensus(context: Context, threshold: number, setData: (data: Data) => void) {
  const { data } = context.base
  const track = context.track.get(`consensus/${threshold}`)

  if (!track) return

  setData({
    ...data,
    sections: {
      ...data.sections,
      consensus: [track.id],
      map: [track.id],
    },
  })
}

function AnnotationHeader({
  section,
  track,
  setData,
}: {
  section: SectionModel
  track: Track
  setData: (data: Data) => void
}) {
  const context = useSequenceContext()
  const isHighlighted = useIsTrackHighlighted(context, track.id)
  const isSectionHighlighted = section.context.highlight.sectionName === section.name

  const depth = context.track.getDepth(track.id)
  const isExpanded = section.track.isExpanded(track)
  const hasChildren = !!track.children?.length

  return (
    <div className="relative flex h-full w-full items-center gap-1 px-3">
      {hasChildren && (
        <Button
          variant="link"
          size="sm"
          title="Union"
          className="w-4 rounded-none rounded-l px-0"
          onClick={() =>
            context.track.expand(
              track.id,
              ["annotation-map", "annotations"],
              isExpanded ? "collapse" : "expand",
            )
          }
        >
          {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </Button>
      )}
      {!hasChildren && <div className="w-4" />}
      <div className={cn("cursor-default text-xs", `ms-${2 * depth}`)}>{track.header}</div>
      {isHighlighted && isSectionHighlighted && (
        <div className="absolute right-3 flex bg-blue-100/50">
          {!hasChildren && (
            <Button
              variant="secondary"
              size="sm"
              title="Union"
              className="rounded-none rounded-l"
              onClick={() => modifyTrackRanges(context, track, "union", setData)}
            >
              <CirclePlusIcon />
            </Button>
          )}
          {!hasChildren && (
            <Button
              variant="secondary"
              size="sm"
              title="Subtract"
              className="rounded-none border-r-0 border-l-0"
              onClick={() => modifyTrackRanges(context, track, "subtract", setData)}
            >
              <CircleMinusIcon />
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            title="Filter View"
            className={cn("rounded-none border-r-0", hasChildren ? "rounded-l" : undefined)}
            onClick={() => context.viewport.focusTrack(track.id)}
          >
            <FilterIcon />
          </Button>
          <Button
            variant="destructive"
            size="sm"
            title="Remove"
            className="rounded-none rounded-r"
            onClick={() => context.track.remove(track.id, setData)}
          >
            <TrashIcon />
          </Button>
        </div>
      )}
    </div>
  )
}

function modifyTrackRanges(
  context: Context,
  track: Track,
  action: "union" | "subtract",
  setData: (data: Data) => void,
) {
  const selection = context.getSelectedRanges()
  if (isEmptyRanges(selection)) return

  const featureIds = new Set(track.features)

  const { data } = context.base
  const features = data.features.map((f) => {
    if (!featureIds.has(f.id)) return f

    return {
      ...f,
      ranges:
        action === "union" ? unionRanges(f.ranges, selection) : subtractRanges(f.ranges, selection),
    }
  })

  setData({
    ...data,
    features,
  })
}

function Controls({
  layoutState,
  setLayoutState,
  resetView,
}: {
  layoutState: LayoutState
  setLayoutState: (show: LayoutState) => void
  resetView: () => void
}) {
  const context = useSequenceContext()
  const mode = useBehavior(context.state.interactionMode)

  return (
    <div
      className="flex items-center px-2"
      style={{ gridArea: context.layout.getAreaName("navigation", "header") }}
    >
      <Button
        variant={mode === "default" ? "default" : "link"}
        size="sm"
        onClick={() => context.state.interactionMode.next("default")}
      >
        <MousePointerClickIcon />
      </Button>
      <Button
        title="(Space)"
        variant={mode === "pan" ? "default" : "link"}
        size="sm"
        onClick={() => context.state.interactionMode.next("pan")}
      >
        <MoveIcon />
      </Button>

      <Button variant="link" size="sm" onClick={resetView} title="Reset View" className="ms-2">
        <RefreshCwIcon />
      </Button>
      <div className="m-auto" />
      <Button
        title="Toggle annotations"
        variant={layoutState.annotations ? "default" : "link"}
        size="sm"
        onClick={() => setLayoutState({ ...layoutState, annotations: !layoutState.annotations })}
      >
        <PencilIcon />
      </Button>
      <Button
        title="Toggle data"
        variant={layoutState.data ? "default" : "link"}
        size="sm"
        className="ms-1"
        onClick={() => setLayoutState({ ...layoutState, data: !layoutState.data })}
      >
        <ListIcon />
      </Button>
    </div>
  )
}

function CurrentInteraction() {
  const context = useSequenceContext()
  const highlight = useBehavior(context.state.highlight)
  const location = context.interaction.highlightedSequenceLocation
  const trackHeader = context.track.get(highlight.trackId)?.header

  const consensusTrackId = context.data.sections.consensus?.[0]
  const consensusTrack = context.track.get(consensusTrackId)
  const consensus = context.getFeature(consensusTrack?.features?.[0])

  return (
    <div className="flex h-full items-center gap-2 px-3 text-xs">
      {location && consensus && (
        <span>
          Consensus/{consensus.data?.threshold ?? "?"}:{" "}
          {consensus.data?.values?.[location.polymerName]?.[location.position ?? 0]?.toFixed(2) ??
            "-"}
        </span>
      )}
      <div className="m-auto" />
      {trackHeader && <span className="text-gray-500">{trackHeader}</span>}
      {location && (
        <span className="text-gray-500">
          {location.polymerName}
          {location.polymerName ? "/" : undefined}
          {location.position}
        </span>
      )}
    </div>
  )
}
