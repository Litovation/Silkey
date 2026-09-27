import {
  BRAND_PINK,
  K_MARK_PATH,
  LOCKUP_VIEWBOX,
  SIL_PATH,
  TONE_PATH,
  VERSION_BADGE,
  VERSION_TEXT_PATH,
  WORDMARK_VIEWBOX,
} from "./brandPaths";

type Props = {
  width?: number | string;
  className?: string;
  /** Show the outlined version badge under the wordmark (dashboard lockup). */
  withVersion?: boolean;
};

/** The Silktone wordmark. Letters and badge follow `currentColor`; the k mark is pink. */
export default function SilktoneWordmark({
  width = 120,
  className,
  withVersion = false,
}: Props) {
  const { strokeWidth, ...badge } = VERSION_BADGE;
  return (
    <svg
      width={width}
      viewBox={withVersion ? LOCKUP_VIEWBOX : WORDMARK_VIEWBOX}
      className={className}
      role="img"
      aria-label="Silktone"
    >
      <path d={SIL_PATH} fill="currentColor" />
      <path d={K_MARK_PATH} fill={BRAND_PINK} />
      <path d={TONE_PATH} fill="currentColor" />
      {withVersion && (
        <>
          <rect
            {...badge}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
          />
          <path d={VERSION_TEXT_PATH} fill="currentColor" />
        </>
      )}
    </svg>
  );
}
