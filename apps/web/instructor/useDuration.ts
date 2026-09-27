import { useEffect, useState } from 'react';

/** Length of a clip in seconds, read from its metadata only (no full download). Null until known. */
export function useDuration(url: string | null): number | null {
  const [duration, setDuration] = useState<number | null>(null);
  useEffect(() => {
    setDuration(null);
    if (!url) return;
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const onMeta = () => setDuration(Number.isFinite(v.duration) ? v.duration : null);
    v.addEventListener('loadedmetadata', onMeta);
    v.src = url;
    return () => { v.removeEventListener('loadedmetadata', onMeta); v.removeAttribute('src'); v.load(); };
  }, [url]);
  return duration;
}
