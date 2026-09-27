import {
  BRAND_PINK,
  K_MARK_PATH,
  SIL_PATH,
  TONE_PATH,
  V1_PATH,
} from "./brandPaths";

type Props = {
  width?: number | string;
  className?: string;
  /** Show the handwritten "v1" tucked under the wordmark (dashboard lockup). */
  withVersion?: boolean;
};

/** The Silktone wordmark. Letters follow `currentColor`; the k mark is pink. */
export default function SilktoneWordmark({
  width = 120,
  className,
  withVersion = false,
}: Props) {
  return (
    <svg
      width={width}
      viewBox={withVersion ? "0 0 1020 339" : "0 0 960 200"}
      className={className}
      role="img"
      aria-label="Silktone"
    >
      <path d={SIL_PATH} fill="currentColor" />
      <path d={K_MARK_PATH} fill={BRAND_PINK} />
      <path d={TONE_PATH} fill="currentColor" />
      {withVersion && <path d={V1_PATH} fill={BRAND_PINK} />}
    </svg>
  );
}
