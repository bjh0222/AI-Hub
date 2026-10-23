'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastAction, ToastMessage, ToastTone } from '@/components/ui/primitives';

export interface ToastApi {
  toast: ToastMessage | null;
  show: (message: string, tone?: ToastTone, action?: ToastAction) => void;
  dismiss: () => void;
}

export function useToast(durationMs = 2600): ToastApi {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timerRef = useRef<number | null>(null);
  const counterRef = useRef(0);

  const show = useCallback(
    (message: string, tone: ToastTone = 'info', action?: ToastAction) => {
      counterRef.current += 1;
      setToast({ id: counterRef.current, message, tone, action });
    },
    [],
  );

  const dismiss = useCallback(() => {
    setToast(null);
  }, []);

  useEffect(() => {
    if (toast === null) return undefined;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    // 带 action 的 toast（撤销/手动复制）停留更久，兜底才够得着
    const duration = toast.action !== undefined ? Math.max(durationMs, 8000) : durationMs;
    timerRef.current = window.setTimeout(() => setToast(null), duration);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [toast, durationMs]);

  return { toast, show, dismiss };
}
