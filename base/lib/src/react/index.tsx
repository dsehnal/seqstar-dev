import { type CSSProperties, type FC, type ReactNode, useEffect, useMemo, useRef } from "react"
import type { Context } from "../context"
import type { Track } from "../data"
import type { Layout as LayoutSpec } from "../data/specification"
import type { SectionModel } from "../model/section"
import { ReactiveModel } from "../utils/reactive-model"
import { ReactContext, useBehavior, useBehaviorProp, useEvent, useSequenceContext } from "./hooks"

export function Layout({
  context,
  layout,
  children,
  className,
}: {
  context: Context
  layout: LayoutSpec
  children?: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    context.layout.update(layout)
  }, [context, layout])

  useEffect(() => {
    if (!ref.current) return

    context.layout.mount(ref.current)
    return () => {
      context.layout.dispose()
    }
  }, [context])

  return (
    <ReactContext.Provider value={context}>
      <div
        ref={ref}
        style={{ display: "grid", position: "relative", height: "100%" }}
        className={className}
      >
        {children}
      </div>
    </ReactContext.Provider>
  )
}

export type GridElementLayoutProps = {
  section?: string
  column?: string
  style?: CSSProperties
}

export type GridElementProps = {
  children?: ReactNode
  className?: string
} & GridElementLayoutProps

function getGridElementStyle(
  context: Context,
  { section, column, style }: GridElementLayoutProps,
): CSSProperties | undefined {
  const isVisible = context.layout.isVisible(section, column)
  if (!isVisible) return undefined

  let baseStyle: CSSProperties

  if (section && column) {
    baseStyle = {
      gridArea: context.layout.getAreaName(section, column),
      ...style,
    }
  } else if (section) {
    const idx = context.layout.getSectionIndex(section)
    if (idx < 0) return undefined

    baseStyle = {
      gridRow: idx + 1,
      gridColumn: "1 / -1",
      ...style,
    }
  } else if (column) {
    const idx = context.layout.getColumnIndex(column)
    if (idx < 0) return undefined

    baseStyle = {
      gridRow: "1 / -1",
      gridColumn: idx + 1,
      ...style,
    }
  } else {
    return undefined
  }

  return baseStyle
}

export function Cell({ section, column, children, className, style }: GridElementProps) {
  const context = useSequenceContext()
  useEvent(context.layout.events.updated)

  const baseStyle = getGridElementStyle(context, { section, column, style })
  if (!baseStyle) return null

  return (
    <div style={baseStyle} className={className}>
      {children}
    </div>
  )
}

export function TrackRows<T extends { section?: SectionModel; track: Track }>({
  section,
  column,
  Element,
  elementProps,
}: {
  section: string
  column?: string
  Element?: FC<T>
  elementProps?: Omit<T, "section" | "track">
}) {
  const context = useSequenceContext()
  useBehavior(context.state.spec)
  useEvent(context.layout.events.updated)

  const model = useBehaviorProp(context.state.base, (s) => s.sections)[section]
  useEvent(model?.events.resized)
  const view = useBehavior(model?.state)
  const ref = useRef<HTMLDivElement>(null)

  const baseStyle = getGridElementStyle(context, { section, column })
  const isVisible = !!baseStyle

  useEffect(() => {
    if (!model || !isVisible || !ref.current) return

    const { theme } = context.spec
    const events = new ReactiveModel()

    // This needs to be done manually, because for some
    // reason the onWheel event assigned via react is passive
    // and the "preventDefault" doesn't work as expected
    events.event(ref.current, "wheel", model.wheelScroll)

    let highlightedEls: NodeListOf<HTMLElement> | null = null
    let highlightFrame: number | null = null
    events.subscribe(context.state.highlight, (h) => {
      if (highlightFrame !== null) cancelAnimationFrame(highlightFrame)
      highlightedEls?.forEach((item) => {
        item.style.backgroundColor = ""
      })
      highlightFrame = null
      highlightedEls = null

      const hasTrack = h.trackId && model.info.trackIds.has(h.trackId)
      if (!hasTrack) return

      const els = ref.current?.querySelectorAll(
        `[data-track-id="${h.trackId}"]`,
      ) as NodeListOf<HTMLElement>
      els.forEach((item) => {
        item.style.backgroundColor = theme.highlightRowColor
      })
      highlightedEls = els

      // Trigger the highlight again in case underlying data changed
      highlightFrame = requestAnimationFrame(() => {
        highlightedEls?.forEach((item) => {
          item.style.backgroundColor = ""
        })
        const els = ref.current?.querySelectorAll(
          `[data-track-id="${h.trackId}"]`,
        ) as NodeListOf<HTMLElement>
        els.forEach((item) => {
          item.style.backgroundColor = theme.highlightRowColor
        })
        highlightedEls = els
      })
    })

    let isInside = false
    let lastY = 0

    events.event(ref.current, "mousemove", (e) => {
      isInside = true
      const top = ref.current?.getBoundingClientRect().top ?? 0
      lastY = e.clientY - top
    })

    events.event(ref.current, "mouseleave", () => {
      isInside = false
    })

    events.subscribe(context.state.base, () => {
      if (!isInside || context.viewport.isUpdating) return
      const trackId = model.getTrackIdFromY(lastY)
      context.updateHighlight({ trackId, sectionName: model.name })
    })

    return () => {
      events.dispose()
      highlightedEls?.forEach((item) => {
        item.style.backgroundColor = ""
      })
      highlightedEls = null
    }
  }, [context, model, isVisible])

  const elements = useMemo(() => {
    if (!model) return null

    const { spec, baseTrackHeight, visibleTracks } = model!
    return visibleTracks.tracks.map((track, i) => {
      const offsetY = visibleTracks.offsets[i]
      const height = (track.heightFactor ?? 1) * baseTrackHeight
      if (height < 2) return

      const E = Element as any // typechecking breaks on full <Element>
      let inner: ReactNode = null
      if (height > 12) {
        inner = Element ? <E section={model} track={track} {...elementProps} /> : track.header
      }
      return (
        <div
          key={track.id}
          data-track-id={track.id}
          className="track-header"
          style={{
            position: "absolute",
            display: "flex",
            alignItems: "center",
            top: offsetY,
            width: "100%",
            height: (track.heightFactor ?? 1) * baseTrackHeight,
            borderBottom:
              height > 8 && spec?.trackStyle?.borders
                ? `1px solid ${context.spec.theme.borderColor}`
                : undefined,
          }}
        >
          {inner}
        </div>
      )
    })
  }, [model?.visibleTracks])

  if (!model || !view || !isVisible) return null

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: ...
    <div
      ref={ref}
      style={{
        ...baseStyle,
        position: "relative",
        overflow: "hidden",
      }}
      onMouseMove={(e) => {
        if (context.viewport.isUpdating) return
        let current = e.target as HTMLElement | null
        while (current) {
          const trackId = current.getAttribute("data-track-id")
          if (trackId) {
            context.updateHighlight({ trackId, sectionName: model.name })
            break
          }
          current = current.parentElement
        }
      }}
      onMouseLeave={() => {
        if (context.viewport.isUpdating) return
        context.updateHighlight(undefined)
      }}
    >
      {elements}
    </div>
  )
}

export function Canvas({
  section,
  column,
  className,
  noBorder,
}: {
  section: string
  column?: string
  className?: string
  noBorder?: boolean
}) {
  const context = useSequenceContext()
  useEvent(context.layout.events.updated)
  const ref = useRef<HTMLDivElement>(null)

  const baseStyle = getGridElementStyle(context, { section, column })
  const isVisible = !!baseStyle

  useEffect(() => {
    if (!ref.current || !isVisible) return

    const s = context.getSection(section)
    s?.canvas.mount(ref.current)
    return () => {
      s?.canvas.dispose()
    }
  }, [context, section, isVisible])

  if (!isVisible) return null

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...baseStyle,
        position: "relative",
        borderLeft: noBorder ? undefined : `1px solid ${context.spec.theme.borderColor}`,
      }}
    />
  )
}
