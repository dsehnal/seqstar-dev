import {
  ArrowRotateClockwise_16,
  ChevronBottom_16,
  ChevronDownSmall_16,
  ChevronRightSmall_16,
  CircleMinus_16,
  CirclePlus_16,
  Cmd_16,
  DotGrid2x3_16,
  Filter2_16,
  Import_16,
  PlusSmall_16,
  TrashCanSimple_16,
} from "@cradlebio/new-icons"
import type { Context } from "@cradlebio/sequence-viewer/src/context"
import type { Data, Feature, Track } from "@cradlebio/sequence-viewer/src/data"
import type { Spec } from "@cradlebio/sequence-viewer/src/data/specification"
import type { Ranges, TrackId } from "@cradlebio/sequence-viewer/src/data/types"
import type { SectionModel } from "@cradlebio/sequence-viewer/src/model/section"
import { Canvas, Cell, Layout, TrackRows } from "@cradlebio/sequence-viewer/src/react"
import {
  useBehavior,
  useCreateSequenceContext,
  useIsTrackHighlighted,
  useSequenceContext,
} from "@cradlebio/sequence-viewer/src/react/hooks"
import { uuid22 } from "@cradlebio/sequence-viewer/src/utils/object"
import {
  intersectRanges,
  isEmptyRanges,
  subtractRanges,
  unionRanges,
} from "@cradlebio/sequence-viewer/src/utils/range"
import {
  Button,
  Checkbox,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@cradlebio/ui-library"
import { useState } from "react"
import { AMINO_ACIDS, type AminoAcid } from "~/srcNew/utils/types"
import { ImportFeaturesDialog } from "../ui/ImportFeaturesDialog"

export function RegionAnnotationEditor({
  data,
  defaultSpec,
  setData,
}: {
  data: Data
  defaultSpec: Spec
  setData: (data: Data) => void
}) {
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
  }

  return (
    <>
      <Layout
        context={ctx}
        layout={{
          baseTrackHeight: 36,
          columns: [{ name: "header", width: 200 }, { name: "canvas" }],
          sections: [
            { name: "navigation", height: 36 },
            { name: "sequence", height: 36 },
            {
              name: "annotations-header",
              height: "min-content",
            },
            {
              name: "annotation-map",
              height: 48,
              horizontalView: "full",
              verticalView: "full",
              verticalPadding: 4,
              trackStyle: { baseHeight: 48 },
            },
            {
              name: "annotations",
              maxHeight: 36 * 7,
              trackStyle: { borders: true },
            },
            { name: "blocked-aas-header", height: "min-content" },
            { name: "blocked-aas", height: "auto", trackStyle: { borders: true } },
            { name: "unreliable-regions-header", height: "min-content" },
            { name: "unreliable-regions", height: "auto", trackStyle: { borders: true } },
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
        <TrackRows section="sequence" column="header" Element={TrackHeader} />
        <TrackRows
          section="blocked-aas"
          column="header"
          Element={BlockedAAsHeader}
          elementProps={{ setData }}
        />
        <TrackRows
          section="unreliable-regions"
          column="header"
          Element={UnreliableRegionHeader}
          elementProps={{ setData }}
        />

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
        <Canvas section="sequence" column="canvas" />
        <Canvas section="annotation-map" column="canvas" />
        <Canvas section="annotations" column="canvas" />
        <Canvas section="blocked-aas" column="canvas" />
        <Canvas section="unreliable-regions" column="canvas" />

        <Cell section="navigation" className="bg-gray-50" />

        <Cell
          section="annotations-header"
          className="flex items-center gap-1 border-t border-b bg-gray-50 px-3 py-1 font-bold"
        >
          Annotations
          <div className="ms-1" />
          <Button variant="link" size="xs" onClick={addAnnotation}>
            <PlusSmall_16 />
          </Button>
          <Button variant="link" size="xs" onClick={() => setImportFeaturesOpen(true)}>
            <Import_16 />
          </Button>
        </Cell>

        <Cell
          section="annotation-map"
          column="header"
          className="flex items-center px-3 text-gray-500 text-xs"
        >
          All Annotations
        </Cell>

        <Cell section="navigation" className="border-b" />
        <Cell section="annotation-map" className="border-b" />

        <Cell
          section="blocked-aas-header"
          className="flex items-center gap-1 border-t border-b bg-gray-50 px-3 py-1 font-bold"
        >
          Blocked AAs
          <div className="ms-1" />
          <Button
            title="Add"
            variant="secondary"
            size="xs"
            onClick={() => addRegion(ctx, setData, "blocked-aas")}
          >
            <PlusSmall_16 /> Add Blocked Region
          </Button>
        </Cell>

        <Cell
          section="unreliable-regions-header"
          className="flex items-center gap-1 border-t border-b bg-gray-50 px-3 py-1 font-bold"
        >
          Unreliable Regions
          <div className="ms-1" />
          <Button
            title="Add"
            variant="secondary"
            size="xs"
            onClick={() => addRegion(ctx, setData, "unreliable-regions")}
          >
            <PlusSmall_16 /> Add Unreliable Region
          </Button>
        </Cell>

        <Controls resetView={resetView} />

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

function addRegion(
  context: Context,
  setData: (data: Data) => void,
  region: "blocked-aas" | "unreliable-regions",
) {
  const { data } = context
  const selection = data.custom?.selectedTracks as TrackId[] | undefined
  if (!selection?.length) return

  const trackRanges = selection
    .map((id) => context.track.get(id))
    .map((t) => {
      if (!t) return null
      const ranges = t.features.map((fId) => context.getFeature(fId)?.ranges).filter((r) => !!r)
      return unionRanges(...ranges)
    })
    .filter((r) => !!r && !isEmptyRanges(r)) as Ranges[]

  const intersection = intersectRanges(...trackRanges)
  if (isEmptyRanges(intersection)) return

  const feature: Feature = {
    id: uuid22(),
    kind: "block",
    ranges: intersection,
  }

  const track: Track = {
    id: uuid22(),
    header: region === "blocked-aas" ? "Blocked AA" : "Unreliable Region",
    features: [feature.id],
  }

  if (region === "blocked-aas") {
    track.data = {
      blockedAAs: "*",
    }
  }

  setData({
    ...data,
    custom: {
      ...data.custom,
      selectedTracks: [],
    },
    features: [...data.features, feature],
    tracks: [...data.tracks, track],
    sections: {
      ...data.sections,
      [region]: [...(data.sections[region] || []), track.id],
    },
  })
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

function BlockedAAsHeader({
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

  const setBlockedAAs = (blockedAAs: string) => {
    setData({
      ...section.context.data,
      tracks: section.context.data.tracks.map((t) => {
        if (t !== track) return t
        return {
          ...t,
          data: {
            ...t.data,
            blockedAAs,
          },
        }
      }),
    })
  }

  return (
    <div className="relative flex h-full w-full items-center gap-1 px-3">
      <div className="text-xs">
        <BlockedAAs blockedAAs={track.data?.blockedAAs} setBlockedAAs={setBlockedAAs} />
      </div>
      {isHighlighted && isSectionHighlighted && (
        <div className="absolute right-3 flex bg-blue-100/50">
          <Button
            variant="secondary"
            size="xs"
            title="Filter View"
            className="rounded-none rounded-l border-r-0"
            onClick={() => context.viewport.focusTrack(track.id)}
          >
            <Filter2_16 />
          </Button>
          <Button
            variant="destructive"
            size="xs"
            title="Remove"
            className="rounded-none rounded-r"
            onClick={() => context.track.remove(track.id, setData)}
          >
            <TrashCanSimple_16 />
          </Button>
        </div>
      )}
    </div>
  )
}

function UnreliableRegionHeader({
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
    <div className="relative flex h-full w-full items-center gap-1 px-3">
      <div className="cursor-default text-xs">{track.header}</div>
      {isHighlighted && isSectionHighlighted && (
        <div className="absolute right-3 flex bg-blue-100/50">
          <Button
            variant="secondary"
            size="xs"
            title="Filter View"
            className="rounded-none rounded-l border-r-0"
            onClick={() => context.viewport.focusTrack(track.id)}
          >
            <Filter2_16 />
          </Button>
          <Button
            variant="destructive"
            size="xs"
            title="Remove"
            className="rounded-none rounded-r"
            onClick={() => context.track.remove(track.id, setData)}
          >
            <TrashCanSimple_16 />
          </Button>
        </div>
      )}
    </div>
  )
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

  const selectedTracks: TrackId[] | undefined = section.context.data.custom?.selectedTracks
  const isSelected = !!selectedTracks?.includes(track.id)
  const toggleSelect = () => {
    const data = section.context.data
    if (isSelected) {
      setData({
        ...data,
        custom: {
          ...data.custom,
          selectedTracks: selectedTracks?.filter((id) => id !== track.id),
        },
      })
    } else {
      setData({
        ...data,
        custom: {
          ...data.custom,
          selectedTracks: [...(selectedTracks ?? []), track.id],
        },
      })
    }
  }

  return (
    <div className="relative flex h-full w-full items-center gap-1 px-3">
      <Checkbox checked={isSelected} onClick={toggleSelect} />
      {hasChildren && (
        <Button
          variant="link"
          size="xs"
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
          {isExpanded ? <ChevronDownSmall_16 /> : <ChevronRightSmall_16 />}
        </Button>
      )}
      {!hasChildren && <div className="w-4" />}
      <div className={cn("cursor-default text-xs", `ms-${2 * depth}`)}>{track.header}</div>
      {isHighlighted && isSectionHighlighted && (
        <div className="absolute right-3 flex bg-blue-100/50">
          {!hasChildren && (
            <Button
              variant="secondary"
              size="xs"
              title="Union"
              className="rounded-none rounded-l"
              onClick={() => modifyTrackRanges(context, track, "union", setData)}
            >
              <CirclePlus_16 />
            </Button>
          )}
          {!hasChildren && (
            <Button
              variant="secondary"
              size="xs"
              title="Subtract"
              className="rounded-none border-r-0 border-l-0"
              onClick={() => modifyTrackRanges(context, track, "subtract", setData)}
            >
              <CircleMinus_16 />
            </Button>
          )}
          <Button
            variant="secondary"
            size="xs"
            title="Filter View"
            className={cn("rounded-none border-r-0", hasChildren ? "rounded-l" : undefined)}
            onClick={() => context.viewport.focusTrack(track.id)}
          >
            <Filter2_16 />
          </Button>
          <Button
            variant="destructive"
            size="xs"
            title="Remove"
            className="rounded-none rounded-r"
            onClick={() => context.track.remove(track.id, setData)}
          >
            <TrashCanSimple_16 />
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

function Controls({ resetView }: { resetView: () => void }) {
  const context = useSequenceContext()
  const mode = useBehavior(context.state.interactionMode)

  return (
    <div
      className="flex items-center px-2"
      style={{ gridArea: context.layout.getAreaName("navigation", "header") }}
    >
      <Button
        variant={mode === "default" ? "default" : "link"}
        size="xs"
        onClick={() => context.state.interactionMode.next("default")}
      >
        <Cmd_16 />
      </Button>
      <Button
        title="(Space)"
        variant={mode === "pan" ? "default" : "link"}
        size="xs"
        onClick={() => context.state.interactionMode.next("pan")}
      >
        <DotGrid2x3_16 />
      </Button>

      <Button variant="link" size="xs" onClick={resetView} title="Reset View" className="ms-2">
        <ArrowRotateClockwise_16 />
      </Button>
    </div>
  )
}

function CurrentInteraction() {
  const context = useSequenceContext()
  const highlight = useBehavior(context.state.highlight)
  const location = context.interaction.highlightedSequenceLocation
  const trackHeader = context.track.get(highlight.trackId)?.header

  return (
    <div className="flex h-full items-center gap-2 px-3 text-xs">
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

const AminoAcidOneLetterCodes = Object.keys(AMINO_ACIDS)

function BlockedAAs({
  blockedAAs,
  setBlockedAAs,
}: {
  blockedAAs: string
  setBlockedAAs: (blockedAAs: string) => void
}) {
  const [popoverOpen, setPopoverOpen] = useState(false)

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <div className="flex w-full justify-between gap-2">
          <span className={!blockedAAs ? "text-muted-foreground" : ""}>
            {formatBlockedAAs(blockedAAs)}
          </span>
          {/* negative z index required for Safari otherwise the icon renders on top the header when scrolling */}
          <ChevronBottom_16 className="z-[-1] opacity-50" />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Search" />
          <CommandList>
            <CommandEmpty>No AAs found</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="All mutations"
                onSelect={() => {
                  if (blockedAAs.length === AminoAcidOneLetterCodes.length || blockedAAs === "*") {
                    setBlockedAAs("")
                  } else {
                    setBlockedAAs("*")
                  }
                }}
              >
                <div className="flex space-x-2">
                  <Checkbox
                    checked={
                      blockedAAs.length === AminoAcidOneLetterCodes.length || blockedAAs === "*"
                    }
                  />
                  <div className="flex flex-col gap-1.5">
                    <span className="cursor-[inherit] font-medium text-sm leading-none">
                      All mutations
                    </span>
                  </div>
                </div>
              </CommandItem>
              {AminoAcidOneLetterCodes.map((aa) => {
                return (
                  <SelectAACommandItem
                    key={aa}
                    value={`${aa} (${AMINO_ACIDS[aa as keyof typeof AMINO_ACIDS]})`}
                    onSelect={() => {
                      setBlockedAAs(toggleBlockedAA(blockedAAs, aa as keyof typeof AMINO_ACIDS))
                    }}
                    selected={blockedAAs?.includes(aa) || blockedAAs === "*"}
                  />
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function SelectAACommandItem(props: {
  value: string
  onSelect: () => void
  visibleInSearchOnly?: boolean
  selected?: boolean
}) {
  return (
    <CommandItem value={props.value} onSelect={props.onSelect}>
      <div className="flex space-x-2">
        <Checkbox checked={!!props.selected} />
        <div className="flex flex-col gap-1.5">
          <span className="cursor-[inherit] font-medium text-sm leading-none">{props.value}</span>
        </div>
      </div>
    </CommandItem>
  )
}

const NUM_AAS = Object.keys(AMINO_ACIDS).length

function formatBlockedAAs(blockedAAs: string | undefined) {
  if (!blockedAAs?.length) return "Select amino acid(s)..."
  if (blockedAAs.length === NUM_AAS || blockedAAs === "*") {
    return "All mutations"
  }
  if (blockedAAs.length === 1) {
    return `${blockedAAs} (${AMINO_ACIDS[blockedAAs[0] as AminoAcid] ?? blockedAAs})`
  }
  return Array.from(blockedAAs).join(", ")
}

function toggleBlockedAA(blockedAAs: string, aa: AminoAcid): string {
  if (!blockedAAs) return aa
  if (blockedAAs === "*") {
    return Object.keys(AMINO_ACIDS)
      .filter((a) => a !== aa)
      .sort()
      .join("")
  }
  if (blockedAAs.includes(aa)) {
    return blockedAAs.replace(aa, "")
  }
  const ret = Array.from((blockedAAs ?? "") + aa)
    .sort()
    .join("")
  if (ret.length === NUM_AAS) {
    return "*"
  }
  return ret
}
