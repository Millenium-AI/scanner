/**
 * WebCameraScanner — live getUserMedia camera for the PWA / web build.
 *
 * • Requests rear camera via `facingMode: { ideal: 'environment' }`
 * • Streams to a <video> element that fills the scan frame
 * • Exposes `captureFrame()` which resolves to a base64 JPEG data-URI
 * • Handles permission denial gracefully
 *
 * Chrome for iOS note: getUserMedia IS supported in Chrome 88+ on iOS 14.3+
 * when the page is served over HTTPS (or localhost). The stream uses the
 * native iOS camera picker inside the WKWebView engine.
 */

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export interface WebCameraScannerHandle {
  captureFrame: () => Promise<string | null>;
}

interface Props {
  /** Width/height of the visible frame box in CSS px */
  frameWidth?: number;
  frameHeight?: number;
  accentColor?: string;
  onPermissionDenied?: () => void;
}

const WebCameraScanner = forwardRef<WebCameraScannerHandle, Props>(
  function WebCameraScanner(
    {
      frameWidth = 300,
      frameHeight = 420,
      accentColor = '#6EE7B7',
      onPermissionDenied,
    },
    ref
  ) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [status, setStatus] = useState<
      'idle' | 'requesting' | 'active' | 'denied' | 'unsupported'
    >('idle');

    useEffect(() => {
      let cancelled = false;

      async function startCamera() {
        if (!navigator.mediaDevices?.getUserMedia) {
          setStatus('unsupported');
          return;
        }
        setStatus('requesting');
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }
          setStatus('active');
        } catch (err) {
          if (cancelled) return;
          console.warn('[WebCameraScanner] getUserMedia error:', err);
          setStatus('denied');
          onPermissionDenied?.();
        }
      }

      startCamera();

      return () => {
        cancelled = true;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
    }, [onPermissionDenied]);

    useImperativeHandle(ref, () => ({
      captureFrame(): Promise<string | null> {
        return new Promise((resolve) => {
          const video = videoRef.current;
          if (!video || !video.videoWidth || !video.videoHeight) {
            resolve(null);
            return;
          }
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(null); return; }
          ctx.drawImage(video, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.9));
        });
      },
    }));

    return (
      <View style={[styles.wrapper, { width: frameWidth, height: frameHeight }]}>
        {/* Live video fill */}
        {/* @ts-ignore — HTMLVideoElement is web-only */}
        <video
          ref={videoRef as React.Ref<HTMLVideoElement>}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: 16,
          }}
          playsInline
          muted
          autoPlay
        />

        {/* Corner brackets overlay */}
        <View style={styles.cornersOverlay} pointerEvents="none">
          <View style={[styles.corner, styles.cornerTL, { borderColor: accentColor }]} />
          <View style={[styles.corner, styles.cornerTR, { borderColor: accentColor }]} />
          <View style={[styles.corner, styles.cornerBL, { borderColor: accentColor }]} />
          <View style={[styles.corner, styles.cornerBR, { borderColor: accentColor }]} />
        </View>

        {/* Requesting / denied / unsupported overlays */}
        {status === 'requesting' && (
          <View style={styles.overlay}>
            <ActivityIndicator color={accentColor} />
            <Text style={styles.overlayText}>Starting camera…</Text>
          </View>
        )}
        {status === 'denied' && (
          <View style={styles.overlay}>
            <Text style={styles.overlayText}>
              Camera access denied.{`\n`}Please allow camera in browser settings and reload.
            </Text>
          </View>
        )}
        {status === 'unsupported' && (
          <View style={styles.overlay}>
            <Text style={styles.overlayText}>
              Live camera not supported.{`\n`}Use the Upload button below.
            </Text>
          </View>
        )}
      </View>
    );
  }
);

export default WebCameraScanner;

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  cornersOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
  },
  corner: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderWidth: 3,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 6,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 6,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 6,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
    borderRadius: 16,
  },
  overlayText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});
