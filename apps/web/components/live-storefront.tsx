'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
/** Server anchored clock avoids relying on a buyer's wall clock. */
export function useSaleClock(serverNow: number) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const start = performance.now();
    setNow(serverNow);
    const timer = setInterval(() => setNow(serverNow + performance.now() - start), 1000);
    return () => clearInterval(timer);
  }, [serverNow]);
  return Math.max(now, serverNow);
}
export function LiveStorefront() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') router.refresh(); };
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [router]);
  return null;
}
