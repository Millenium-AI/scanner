/**
 * WebCameraScanner — live getUserMedia camera for the PWA / web build.
 *
 * • Requests rear camera via `facingMode: { ideal: 'environment' }`
 * • Streams to a <video> element that fills the scan frame
 * • Exposes `captureFrame()` which resolves to a base64 JPEG data-URI
 * • Handles permission denial gracefully
 * • Renders the 4-corner bracket overlay + dim background
 * • frameOffsetY shifts the frame up/down from center (negative = up)
 */

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from 'react-native';

export interface WebCameraScannerHandle {
  captureFrame: () => Promise<string | null>;
}

interface Props {
  frameWidth?: number;
  frameHeight?: number;
  /** Vertical offset from center in px. Negative shifts the frame up. */
  frameOffsetY?: number;
  accentColor?: string;
  onPermissionDenied?: () => void;
}

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;

const WebCameraScanner = forwardRef<WebCameraScannerHandle, Props>(
  function WebCameraScanner(
    {
      frameWidth = 300,
      frameHeight = 420,
      frameOffsetY = 0,
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

    // Frame centered horizontally, shifted vertically by frameOffsetY
    const frameTop  = (SCREEN_H - frameHeight) / 2 + frameOffsetY;
    const frameLeft = (SCREEN_W - frameWidth)  / 2;

    return (
      <View style={[styles.fullScreen, { width: SCREEN_W, height: SCREEN_H }]}>
        {/* Live video */}
        {/* @ts-ignore — HTMLVideoElement is web-only */}
        <video
          ref={videoRef as React.Ref<HTMLVideoElement>}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
          playsInline
          muted
          autoPlay
        />

        {/* Dim overlay — 4 panels around the frame */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Top */}
          <View style={[styles.dim, { top: 0, left: 0, right: 0, height: frameTop }]} />
          {/* Bottom */}
          <View style={[styles.dim, { top: frameTop + frameHeight, left: 0, right: 0, bottom: 0 }]} />
          {/* Left */}
          <View style={[styles.dim, { top: frameTop, left: 0, width: frameLeft, height: frameHeight }]} />
          {/* Right */}
          <View style={[styles.dim, { top: frameTop, left: frameLeft + frameWidth, right: 0, height: frameHeight }]} />
        </View>

        {/* 4-corner bracket */}
        <View
          style={[
            styles.frameBox,
            { width: frameWidth, height: frameHeight, top: frameTop, left: frameLeft },
          ]}
          pointerEvents="none"
        >
          <View style={[styles.corner, styles.cornerTL, { borderColor: accentColor }]} />
          <View style={[styles.corner, styles.cornerTR, { borderColor: accentColor }]} />
          <View style={[styles.corner, styles.cornerBL, { borderColor: accentColor }]} />
          <View style={[styles.corner, styles.cornerBR, { borderColor: accentColor }]} />
        </View>

        {/* Status overlays */}
        {status === 'requesting' && (
          <View style={styles.statusOverlay}>
            <ActivityIndicator color={accentColor} />
            <Text style={styles.statusText}>Starting camera…</Text>
          </View>
        )}
        {status === 'denied' && (
          <View style={styles.statusOverlay}>
            <Text style={styles.statusText}>
              Camera access denied.{`\n`}Please allow camera in browser settings and reload.
            </Text>
          </View>
        )}
        {status === 'unsupported' && (
          <View style={styles.statusOverlay}>
            <Text style={styles.statusText}>
              Live camera not supported.{`\n`}Use the Upload button below.
            </Text>
          </View>
        )}
      </View>
    );
  }
);

export default WebCameraScanner;

const CORNER_SIZE = 26;
const CORNER_THICKNESS = 3;
const CORNER_RADIUS = 6;

const styles = StyleSheet.create({
  fullScreen: { position: 'relative', backgroundColor: '#000' },
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  frameBox: { position: 'absolute' },
  corner: { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE, borderWidth: CORNER_THICKNESS },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: CORNER_RADIUS },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: CORNER_RADIUS },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: CORNER_RADIUS },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: CORNER_RADIUS },
  statusOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
  },
  statusText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
