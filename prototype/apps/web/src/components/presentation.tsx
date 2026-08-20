import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

type Tone = "neutral" | "info" | "success" | "warning";

export function PageIntro({
  eyebrow,
  title,
  description,
  children,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly description?: ReactNode;
  readonly children?: ReactNode;
}) {
  return (
    <header className="page-intro">
      {eyebrow === undefined ? null : <p className="page-intro__eyebrow">{eyebrow}</p>}
      <h1 className="page-intro__title">{title}</h1>
      {description === undefined ? null : (
        <div className="page-intro__description">{description}</div>
      )}
      {children === undefined ? null : <div className="page-intro__actions">{children}</div>}
    </header>
  );
}

export function StatusCard({
  title,
  children,
  tone = "neutral",
}: {
  readonly title?: string;
  readonly children: ReactNode;
  readonly tone?: Tone;
}) {
  return (
    <aside
      className={`status-card status-card--${tone}`}
      role={title === undefined ? undefined : "status"}
    >
      {title === undefined ? null : <p className="status-card__title">{title}</p>}
      <div className="status-card__body">{children}</div>
    </aside>
  );
}

export function VisualizationCard({
  title,
  description,
  children,
  toolbar,
  className = "",
  ...props
}: {
  readonly title: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  readonly toolbar?: ReactNode;
  readonly className?: string;
} & Omit<ComponentProps<"section">, "children" | "title">) {
  return (
    <section className={`visualization-card ${className}`.trim()} {...props}>
      <div className="visualization-card__header">
        <div className="visualization-card__heading">
          <h2 className="visualization-card__title">{title}</h2>
          {description === undefined ? null : (
            <p className="visualization-card__description">{description}</p>
          )}
        </div>
        {toolbar === undefined ? null : (
          <div className="visualization-card__toolbar">{toolbar}</div>
        )}
      </div>
      <div className="visualization-card__body">{children}</div>
    </section>
  );
}

export function CompactToolbar({
  children,
  label = "Visualization controls",
}: {
  readonly children: ReactNode;
  readonly label?: string;
}) {
  return (
    <div aria-label={label} className="compact-toolbar" role="toolbar">
      <SlidersHorizontal aria-hidden="true" size={15} strokeWidth={1.8} />
      {children}
    </div>
  );
}

export function IconButton({
  label,
  children,
  className = "",
  ...props
}: { readonly label: string; readonly children: ReactNode; readonly className?: string } & Omit<
  ComponentProps<"button">,
  "children" | "aria-label"
>) {
  return (
    <button
      aria-label={label}
      className={`icon-button ${className}`.trim()}
      title={label}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

export type RendererChoice = "reference" | "nightingale" | "compare";

export function RendererChooser({
  value,
  onChange,
  disabled = false,
  choices = [
    { value: "reference", label: "Reference" },
    { value: "nightingale", label: "Nightingale" },
  ],
  label = "Sequence renderer",
}: {
  readonly value: RendererChoice;
  readonly onChange: (value: RendererChoice) => void;
  readonly disabled?: boolean;
  readonly choices?: readonly { value: RendererChoice; label: string }[];
  readonly label?: string;
}) {
  return (
    <label className="renderer-chooser">
      <span className="renderer-chooser__label">{label}</span>
      <span className="renderer-chooser__select-wrap">
        <select
          aria-label={label}
          className="renderer-chooser__select"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value as RendererChoice)}
          value={value}
        >
          {choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="renderer-chooser__icon" size={15} />
      </span>
    </label>
  );
}

export function ChoicePill({
  active,
  children,
}: {
  readonly active: boolean;
  readonly children: ReactNode;
}) {
  return (
    <span className={`choice-pill${active ? " choice-pill--active" : ""}`}>
      {active ? <Check aria-hidden="true" size={13} /> : null}
      {children}
    </span>
  );
}
