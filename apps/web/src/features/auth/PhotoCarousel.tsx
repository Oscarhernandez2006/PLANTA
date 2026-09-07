import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

// Carga todas las fotos optimizadas (foto-01.jpg ... foto-NN.jpg) en orden.
const images = Object.entries(
  import.meta.glob<string>('../../assets/fotos/*.{jpg,jpeg,png}', {
    eager: true,
    import: 'default',
  }),
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);

const INTERVAL_MS = 3000;

export function PhotoCarousel({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  if (images.length === 0) return null;

  return (
    <div className={cn('overflow-hidden', className)}>
      {images.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden
          className={cn(
            'absolute inset-0 size-full object-cover transition-opacity duration-1000 ease-in-out',
            i === index ? 'opacity-100' : 'opacity-0',
          )}
        />
      ))}
    </div>
  );
}
