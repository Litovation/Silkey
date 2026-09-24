import type { ImgHTMLAttributes } from "react";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  width?: number | string;
};

export default function SilkeyWordmark({ width = 120, ...props }: Props) {
  return <img src="/silkey.svg" alt="Silkey" width={width} {...props} />;
}
