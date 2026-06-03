'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * BarcodeScanner — opens the rear camera and decodes EAN/UPC packaged-food
 * barcodes. Prefers the platform's native `BarcodeDetector` (Chrome on Android,
 * Safari iOS 17+); falls back to a dynamic import of `@zxing/browser` when the
 * native API is missing.
 *
 * Calls `onScan` once with the decoded text on the first hit, then leaves the
 * caller to dismount this component (which cleans the stream up).
 */

const PACKAGED_FOOD_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
] as const;

type Permission = 'pending' | 'granted' | 'denied' | 'unsupported';

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
}

interface BarcodeDetectorCtor {
  new (init: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
  }
}

export interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onCancel: () => void;
}

export default function BarcodeScanner({
  onScan,
  onCancel,
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  // zxing controls — present only when we fell back to zxing.
  const zxingStopRef = useRef<(() => void) | null>(null);
  // Latch so we only fire onScan once, even if the decoder reports duplicates.
  const firedRef = useRef(false);

  const [permission, setPermission] = useState<Permission>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const fireOnce = useCallback(
    (text: string) => {
      if (firedRef.current) return;
      firedRef.current = true;
      onScan(text);
    },
    [onScan],
  );

  // Cleanup helper — used both on unmount and on retries.
  const cleanup = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (zxingStopRef.current) {
      try {
        zxingStopRef.current();
      } catch {
        // zxing throws on stop sometimes after stream is already torn down.
      }
      zxingStopRef.current = null;
    }
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      // SSR / non-browser environments: do nothing. Real Safari iOS 17+ and
      // Chrome support getUserMedia in secure contexts; otherwise we surface
      // an "unsupported" error.
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        setPermission('unsupported');
        setErrorMessage(
          'This browser does not support camera access. Try a recent Chrome or Safari.',
        );
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
      } catch (err) {
        if (cancelled) return;
        setPermission('denied');
        setErrorMessage(
          err instanceof Error && err.message
            ? err.message
            : 'Camera permission was denied.',
        );
        return;
      }

      if (cancelled) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }

      streamRef.current = stream;
      setPermission('granted');

      const video = videoRef.current;
      if (!video) {
        // Component went away between getUserMedia resolving and the ref
        // attaching. Bail out cleanly.
        for (const t of stream.getTracks()) t.stop();
        streamRef.current = null;
        return;
      }

      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.muted = true;
      try {
        await video.play();
      } catch {
        // Autoplay can reject if the page hasn't been gestured. The video
        // element will still show frames once the user interacts.
      }

      // Prefer native BarcodeDetector when present.
      const NativeDetector =
        typeof window !== 'undefined' ? window.BarcodeDetector : undefined;

      if (NativeDetector) {
        let detector: BarcodeDetectorLike;
        try {
          detector = new NativeDetector({ formats: [...PACKAGED_FOOD_FORMATS] });
        } catch {
          // Some browsers expose the constructor but reject the formats list.
          // Fall through to zxing.
          await startZxingFallback(video);
          return;
        }
        const loop = async () => {
          if (cancelled || firedRef.current) return;
          try {
            const results = await detector.detect(video);
            if (results[0]?.rawValue) {
              fireOnce(results[0].rawValue);
              return;
            }
          } catch {
            // Per-frame decode failures are noise; just try again next tick.
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      await startZxingFallback(video);
    }

    async function startZxingFallback(video: HTMLVideoElement) {
      try {
        const zxingBrowser = await import('@zxing/browser');
        const zxingLibrary = await import('@zxing/library');
        if (cancelled || firedRef.current) return;

        const hints = new Map<
          // DecodeHintType is a number enum at runtime.
          number,
          unknown
        >();
        hints.set(zxingLibrary.DecodeHintType.POSSIBLE_FORMATS, [
          zxingLibrary.BarcodeFormat.EAN_13,
          zxingLibrary.BarcodeFormat.EAN_8,
          zxingLibrary.BarcodeFormat.UPC_A,
          zxingLibrary.BarcodeFormat.UPC_E,
        ]);
        hints.set(zxingLibrary.DecodeHintType.TRY_HARDER, true);

        const reader = new zxingBrowser.BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromVideoElement(
          video,
          (result, err) => {
            if (firedRef.current) return;
            if (result) {
              fireOnce(result.getText());
            }
            // Swallow per-frame "NotFoundException" errors — they're normal
            // while the user is still aligning the camera.
            void err;
          },
        );
        zxingStopRef.current = () => controls.stop();
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(
          err instanceof Error
            ? `Scanner failed to start: ${err.message}`
            : 'Scanner failed to start.',
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      cleanup();
    };
    // `attempt` is included so the "retry" button can re-trigger initialisation.
  }, [attempt, cleanup, fireOnce]);

  function handleRetry() {
    firedRef.current = false;
    setPermission('pending');
    setErrorMessage(null);
    setAttempt((n) => n + 1);
  }

  if (permission === 'denied' || permission === 'unsupported') {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 shadow-sm">
        <p className="font-semibold">Camera permission required</p>
        <p className="mt-1 text-rose-700">
          {errorMessage ??
            'Allow camera access to scan barcodes, then tap Retry.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex h-11 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-900 p-3 shadow-sm">
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          className="block aspect-[4/3] w-full bg-black object-cover"
          playsInline
          muted
        />
        {/* Reticle overlay — visual hint where to align the barcode. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-24 w-3/4 max-w-xs rounded-md border-2 border-emerald-400/80 shadow-[0_0_0_2000px_rgba(0,0,0,0.35)]" />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-300">
          {permission === 'pending'
            ? 'Requesting camera…'
            : 'Point at a barcode (EAN/UPC).'}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-10 items-center rounded-lg border border-slate-500 bg-slate-800 px-4 text-sm font-medium text-slate-100 transition hover:bg-slate-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
