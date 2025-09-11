import type { Context } from "../context"
import { getTableViewSequenceLocation } from "../utils/coordinates"

export class InteractionModel {
  constructor(private context: Context) {}

  get highlightedSequenceLocation() {
    const highlight = this.context.state.highlight.value
    if (typeof highlight?.column !== "number") return undefined
    return getTableViewSequenceLocation(this.context.dataView.current, highlight.column)
  }
}
