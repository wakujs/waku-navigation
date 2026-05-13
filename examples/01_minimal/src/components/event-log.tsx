'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'waku-navigation';

export function EventLog() {
  const { unstable_events } = useRouter();
  const [entries, setEntries] = useState<string[]>([]);
  useEffect(() => {
    const onStart = (r: { path: string }) => {
      setEntries((prev) => [...prev, `start:${r.path}`]);
    };
    const onComplete = (r: { path: string }) => {
      setEntries((prev) => [...prev, `complete:${r.path}`]);
    };
    unstable_events.on('start', onStart);
    unstable_events.on('complete', onComplete);
    return () => {
      unstable_events.off('start', onStart);
      unstable_events.off('complete', onComplete);
    };
  }, [unstable_events]);
  // Fixed-position so the log growing/shrinking doesn't reflow the rest of
  // the layout (which would otherwise trip the scroll-preservation test).
  return (
    <div
      data-testid="event-log"
      style={{ position: 'fixed', bottom: 0, left: 0, zIndex: 1 }}
    >
      {entries.join('|')}
    </div>
  );
}
