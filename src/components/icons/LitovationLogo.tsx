import {
  LITOVATION_DOT_PATH,
  LITOVATION_LETTERS_PATH,
  LITOVATION_ORANGE,
  LITOVATION_VIEWBOX,
} from "./brandPaths";

type Props = {
  width?: number | string;
  className?: string;
};

/** The Litovation logo. Letters follow `currentColor`; the dot stays orange. */
export default function LitovationLogo({ width = 80, className }: Props) {
  return (
    <svg
      width={width}
      viewBox={LITOVATION_VIEWBOX}
      className={className}
      role="img"
      aria-label="Litovation"
    >
      <path d={LITOVATION_LETTERS_PATH} fill="currentColor" fillRule="evenodd" />
      <path d={LITOVATION_DOT_PATH} fill={LITOVATION_ORANGE} fillRule="evenodd" />
    </svg>
  );
}
