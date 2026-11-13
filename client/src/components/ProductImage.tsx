import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";

interface ProductImageProps {
  src: string | null | undefined;
  name: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function ProductImage({ src, name, className = "", size = "md" }: ProductImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className={`product-image product-image--fallback product-image--${size} ${className}`.trim()}>
        <ImageIcon size={size === "lg" ? 24 : 18} aria-hidden="true" />
        <span className="sr-only">Foto {name}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      className={`product-image product-image--${size} ${className}`.trim()}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
