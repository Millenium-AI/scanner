/**
 * useAutoScanWeb — auto-scan interval for the web camera.
 * Fires `onCapture` every `intervalMs`, but only when:
 *   • the camera ref has a live feed
 *   • not already scanning / showing result
 *   • backoff period hasn't elapsed
 */

import { useEffect, useRef } from 'react';
import type { WebCameraScannerHandle } from '@/components/WebCameraScanner';

export function useAutoScanWeb({
  cameraRef,
  enabled,
  intervalMs = 3000,
  backoffMs = 6000,
  onCapture,
}: {
  cameraRef: React.RefObject<WebCameraScannerHandle | null>;
  enabled: boolean;
  intervalMs?: number;
  backoffMs?: number;
  onCapture: (dataUri: string, auto: boolean) => void;
}) {
  const inflightRef = useRef(false);
  const backoffUntilRef = useRef(0);
  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const triggerBackoff = () => {
    backoffUntilRef.current = Date.now() + backoffMs;
  };

  useEffect(() => {
    const id = setInterval(async () => {
      if (!enabledRef.current) return;
      if (inflightRef.current) return;
      if (Date.now() < backoffUntilRef.current) return;
      if (!cameraRef.current) return;

      inflightRef.current = true;
      try {
        const dataUri = await cameraRef.current.captureFrame();
        if (dataUri) onCapture(dataUri, true);
      } finally {
        inflightRef.current = false;
      }
    }, intervalMs);

    return () => clearInterval(id);
  }, [cameraRef, intervalMs, onCapture]);

  return { triggerBackoff };
}
