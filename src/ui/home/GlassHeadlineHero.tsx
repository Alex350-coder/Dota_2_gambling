import { Fragment } from "react";
import { splitWords } from "./glassHeadlineMath";

interface HeroAction {
  readonly label: string;
  readonly href?: string;
  readonly onClick?: () => void;
}

export interface GlassHeadlineHeroProps {
  readonly title: string;
  readonly eyebrow?: string;
  readonly description?: string;
  readonly primaryAction?: HeroAction;
  readonly secondaryAction?: HeroAction;
  readonly className?: string;
  readonly children?: React.ReactNode;
}

function ActionArrow() {
  return (
    <svg
      className="ghr-arrow"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Action({ action, kind }: { action: HeroAction; kind: "primary" | "secondary" }) {
  const className = `ghr-btn ghr-${kind}`;
  const content = (
    <>
      {action.label}
      {kind === "primary" ? <ActionArrow /> : null}
    </>
  );
  if (action.href) {
    return (
      <a className={className} href={action.href} onClick={action.onClick}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" className={className} onClick={action.onClick}>
      {content}
    </button>
  );
}

/**
 * Glass Headline Hero content (T-717 follow-up) — the real <h1> (every word a real <span>,
 * laid out by the browser), eyebrow, description and CTAs for a glass-refraction headline.
 * This is content only: it renders in normal document flow wherever a page places it, not a
 * sized box with its own background. The actual WebGL2 glass effect is a separate, page-wide
 * fixed background (PageGlassBackground, mounted once in PublicLayout) that finds this
 * component's <h1> via `data-glass-title` and paints the refraction onto it; without that
 * background mounted (or without WebGL2, or under prefers-reduced-motion), the title just
 * stays solid white text - never a replacement for the real, selectable, indexable text.
 */
export function GlassHeadlineHero({
  title,
  eyebrow,
  description,
  primaryAction,
  secondaryAction,
  className = "",
  children,
}: GlassHeadlineHeroProps) {
  const words = splitWords(title);

  return (
    <div className={`ghr-content ${className}`}>
      {eyebrow ? <span className="ghr-eyebrow">{eyebrow}</span> : null}
      <h1 data-glass-title="" className="ghr-title">
        {words.map((word, i) => (
          <Fragment key={word + String(i)}>
            <span className="ghr-word">{word}</span>
            {i < words.length - 1 ? " " : null}
          </Fragment>
        ))}
      </h1>
      {description ? <p className="ghr-desc">{description}</p> : null}
      {primaryAction || secondaryAction ? (
        <div className="ghr-actions">
          {primaryAction ? <Action action={primaryAction} kind="primary" /> : null}
          {secondaryAction ? <Action action={secondaryAction} kind="secondary" /> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
