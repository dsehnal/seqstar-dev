import type { Feature, Track } from "@cradlebio/sequence-viewer/src/data"
import type { Ranges } from "@cradlebio/sequence-viewer/src/data/types"
import { uuid22 } from "@cradlebio/sequence-viewer/src/utils/object"
import { normalizeRange } from "@cradlebio/sequence-viewer/src/utils/range"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Textarea,
} from "@cradlebio/ui-library"
import _ from "lodash"
import { type ParseResult, parse as parseCSV } from "papaparse"
import { useState } from "react"

const ExampleImport = `Name,Polymer,Start,End,Group
vH,heavy,40,120,Variable reg.
vL,light,30,90,Variable reg.
CDR1,heavy,50,70,CDR
CDR1,light,32,44,CDR
CDR2,heavy,80,90,CDR
CDR2,light,66,87,CDR
A,heavy,50,70,Test
A,heavy,100,120,Test
A,light,32,80,Test
B,heavy,60,80,Test
B,light,5,15,Test
B,light,25,50,Test
C,heavy,25,100,Test
C,light,5,100,Test
`

function parseRanges(data: Record<string, string>[]): Ranges {
  const ranges = Object.entries(_.groupBy(data, "Polymer")).map(([polymer, records]) => [
    polymer,
    normalizeRange(
      records.map((r) => ({
        start: +r.Start,
        end: +r.End,
      })),
    ),
  ])

  return Object.fromEntries(ranges)
}

function parseRecords(data: Record<string, string>[]) {
  const byGroup = _.groupBy(data, "Group")

  const features: Feature[] = []
  const tracks: Partial<Track>[] = []

  for (const [groupName, entries] of Object.entries(byGroup)) {
    const byName = _.groupBy(entries, "Name")

    const groupTracks: Partial<Track>[] = []
    const groupFeatures: Feature[] = []

    for (const [name, ranges] of Object.entries(byName)) {
      const feature: Feature = {
        id: uuid22(),
        kind: "block",
        ranges: parseRanges(ranges),
        data: { label: name },
      }
      groupFeatures.push(feature)
      groupTracks.push({
        id: uuid22(),
        header: name,
        features: [feature.id],
        options: { stackFeatures: true },
      })
    }

    if (groupName) {
      tracks.push({
        id: uuid22(),
        header: groupName,
        features: groupFeatures.map((f) => f.id),
        children: groupTracks.map((t) => t.id!),
        options: { stackFeatures: true },
      })
    }

    features.push(...groupFeatures)
    tracks.push(...groupTracks)
  }

  return { tracks, features }
}

export function ImportFeaturesDialog({
  open,
  setOpen,
  onAdd,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  onAdd: (data: { tracks: Partial<Track>[]; features: Feature[] }) => void
}) {
  const [input, setInput] = useState(ExampleImport)

  const process = () => {
    parseCSV(input, {
      header: true,
      skipEmptyLines: true,
      complete: (results: ParseResult<Record<string, string>>) => {
        onAdd(parseRecords(results.data))
        setOpen(false)
      },
      error: () => onAdd({ tracks: [], features: [] }),
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-150 gap-0">
        <DialogTitle className="mb-2">Import Features</DialogTitle>
        <DialogDescription className="mb-4">
          Import a CSV file with columns <code>Polymer, Name, Start, End[, Group]</code>
        </DialogDescription>
        <Textarea
          className="mb-7 min-h-25"
          placeholder="Paste CSV here"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <DialogFooter>
          <Button onClick={() => setOpen(false)} variant="secondary">
            Cancel
          </Button>
          <Button disabled={!input} onClick={process}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
