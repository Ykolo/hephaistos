import Image from "next/image";
import { cn } from "@/lib/utils";

type CoverImageProps = {
  src: string;
  alt?: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  /** Apply the slow ken-burns zoom used on hero imagery. */
  zoom?: boolean;
};

/** Full-bleed object-cover image; parent must be `relative` + sized. */
export function CoverImage({
  src,
  alt = "",
  className,
  sizes = "100vw",
  priority,
  zoom,
}: CoverImageProps) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={cn("object-cover", zoom && "animate-zoom", className)}
    />
  );
}
