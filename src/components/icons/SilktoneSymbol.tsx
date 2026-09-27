import { BRAND_PINK, K_MARK_PATH, K_MARK_VIEWBOX } from "./brandPaths";

type Props = {
  width?: number | string;
  height?: number | string;
  className?: string;
  /** Defaults to the brand pink; pass "currentColor" to inherit. */
  color?: string;
};

/** The stylized "k" logo mark on its own. */
export default function SilktoneSymbol({
  width = 24,
  height = 24,
  className,
  color = BRAND_PINK,
}: Props) {
  return (
    <svg
      width={width}
      height={height}
      viewBox={K_MARK_VIEWBOX}
      className={className}
      aria-hidden="true"
    >
      <path d={K_MARK_PATH} fill={color} />
    </svg>
  );
}
