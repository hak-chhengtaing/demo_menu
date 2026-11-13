import { useState } from 'react';
import { Utensils } from 'lucide-react';

interface FoodImageProps {
  src?: string | null;
  alt: string;
  className?: string;
}

export function FoodImage({ src, alt, className = 'w-full h-full object-cover' }: FoodImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400 ${className}`}
        role="img"
        aria-label={alt}
      >
        <Utensils className="w-6 h-6 mb-1 opacity-60" />
        <span className="text-[11px] font-medium px-2 text-center truncate max-w-full">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
