import {
  type ComponentInstanceSpec,
  type RendererChooserDescriptor,
  RendererChooserHost,
  type RendererChooserRenderState,
  type RendererMode,
} from "@seq-star/harness-react";
import type { ReactNode } from "react";
import { RendererChooser } from "./presentation";

export type { RendererMode } from "@seq-star/harness-react";

export const rendererSearch = (
  value: unknown,
  modes: readonly RendererMode[],
  fallback: RendererMode,
): RendererMode =>
  typeof value === "string" && modes.includes(value as RendererMode)
    ? (value as RendererMode)
    : fallback;

/** Shared UI shell around the harness-owned, renderer replacement lifecycle. */
export function CaseRendererChooser({
  descriptor,
  modeComponents,
  onModeChange,
  children,
}: {
  readonly descriptor: RendererChooserDescriptor;
  readonly modeComponents: Readonly<
    Partial<Record<RendererMode, readonly ComponentInstanceSpec[]>>
  >;
  readonly onModeChange: (mode: RendererMode) => void;
  readonly children: (state: RendererChooserRenderState) => ReactNode;
}) {
  return (
    <RendererChooserHost descriptor={descriptor} modeComponents={modeComponents}>
      {(state) => (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <RendererChooser
              choices={descriptor.modes.map((value) => ({
                value,
                label:
                  value === "compare"
                    ? "Compare"
                    : value === "reference"
                      ? "Reference"
                      : "Nightingale",
              }))}
              disabled={state.state === "pending"}
              onChange={(next) => {
                state.selectMode(next);
                onModeChange(next);
              }}
              value={state.requestedMode}
            />
            <p
              aria-live="polite"
              className="text-slate-500 text-sm"
              data-testid="renderer-chooser-status"
              role={state.state === "failed" ? "alert" : "status"}
            >
              {state.state === "ready"
                ? `${state.mode === "compare" ? "Comparison" : state.mode} renderer ready`
                : state.state === "failed"
                  ? `Renderer switch failed: ${state.error?.message ?? "unknown error"}`
                  : "Switching renderer…"}
            </p>
          </div>
          {children(state)}
        </>
      )}
    </RendererChooserHost>
  );
}
