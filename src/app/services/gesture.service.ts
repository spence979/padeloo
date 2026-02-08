import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

export type GestureCommand =
  | { type: 'point'; team: 1 | 2 }
  | { type: 'undo' };

@Injectable({ providedIn: 'root' })
export class GestureService {
  readonly isSupported = signal(false);
  readonly isActive = signal(false);
  readonly lastGesture = signal('');

  readonly command$ = new Subject<GestureCommand>();

  private video: HTMLVideoElement | null = null;
  private analysisCanvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private prevPixels: Uint8ClampedArray | null = null;
  private animFrameId: number | null = null;
  private frameCount = 0;
  private centroids: Array<{ x: number; time: number }> = [];
  private lastGestureTime = 0;
  private lastMotionTime = 0;

  // Tuning constants
  private readonly FRAME_W = 160;
  private readonly FRAME_H = 120;
  private readonly PIXEL_STRIDE = 3;          // sample every 3rd pixel (3x3 grid, ~11x faster)
  private readonly MOTION_THRESHOLD = 35;      // per-channel diff sum to count as "moved"
  private readonly MIN_MOTION_PIXELS = 80;     // minimum moving pixels before tracking
  private readonly GESTURE_DELTA = 0.35;       // must cross 35% of frame width
  private readonly MIN_GESTURE_MS = 150;       // must take at least 150ms (filters instantaneous entry)
  private readonly GESTURE_COOLDOWN_MS = 1500;
  private readonly CENTROID_WINDOW_MS = 700;
  private readonly MIN_SAMPLES = 5;
  private readonly DIRECTION_CONSISTENCY = 0.6; // 60% of steps must go same way
  private readonly MOTION_GAP_RESET_MS = 120;  // reset buffer if motion pauses this long
  private readonly PROCESS_EVERY_N_FRAMES = 3;  // only analyse every 3rd frame (~20fps)

  constructor() {
    this.isSupported.set(
      typeof navigator !== 'undefined' &&
      'mediaDevices' in navigator &&
      'getUserMedia' in navigator.mediaDevices
    );
  }

  async start(videoEl: HTMLVideoElement): Promise<void> {
    if (!this.isSupported() || this.isActive()) return;

    this.video = videoEl;
    this.analysisCanvas = document.createElement('canvas');
    this.analysisCanvas.width = this.FRAME_W;
    this.analysisCanvas.height = this.FRAME_H;
    this.ctx = this.analysisCanvas.getContext('2d', { willReadFrequently: true });

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 320, height: 240 },
      audio: false,
    });

    this.video.srcObject = stream;
    await this.video.play();

    this.isActive.set(true);
    this.prevPixels = null;
    this.centroids = [];
    this.frameCount = 0;
    this.processFrame();
  }

  stop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    const stream = this.video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach(t => t.stop());

    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.prevPixels = null;
    this.centroids = [];
    this.isActive.set(false);
  }

  private processFrame(): void {
    if (!this.isActive() || !this.video || !this.ctx) return;

    this.animFrameId = requestAnimationFrame(() => this.processFrame());

    // Throttle: only analyse every Nth frame
    this.frameCount++;
    if (this.frameCount % this.PROCESS_EVERY_N_FRAMES !== 0) return;

    this.ctx.drawImage(this.video, 0, 0, this.FRAME_W, this.FRAME_H);
    const current = this.ctx.getImageData(0, 0, this.FRAME_W, this.FRAME_H).data;

    if (this.prevPixels) {
      const now = Date.now();

      // Reset centroid buffer if motion paused (prevents stale data carrying over)
      if (now - this.lastMotionTime > this.MOTION_GAP_RESET_MS && this.centroids.length > 0) {
        this.centroids = [];
      }

      const centroid = this.computeMotionCentroid(current, this.prevPixels);
      if (centroid !== null) {
        this.lastMotionTime = now;
        this.centroids.push({ x: centroid, time: now });
        // Trim to window
        this.centroids = this.centroids.filter(c => now - c.time < this.CENTROID_WINDOW_MS);
        this.tryDetectGesture();
      }
    }

    this.prevPixels = new Uint8ClampedArray(current);
  }

  private computeMotionCentroid(
    curr: Uint8ClampedArray,
    prev: Uint8ClampedArray
  ): number | null {
    let sumX = 0;
    let count = 0;
    const stride = this.PIXEL_STRIDE;

    for (let y = 0; y < this.FRAME_H; y += stride) {
      for (let x = 0; x < this.FRAME_W; x += stride) {
        const i = (y * this.FRAME_W + x) * 4;
        const diff =
          Math.abs(curr[i] - prev[i]) +
          Math.abs(curr[i + 1] - prev[i + 1]) +
          Math.abs(curr[i + 2] - prev[i + 2]);

        if (diff > this.MOTION_THRESHOLD) {
          sumX += x;
          count++;
        }
      }
    }

    if (count < this.MIN_MOTION_PIXELS) return null;
    return sumX / count / this.FRAME_W; // normalized 0–1
  }

  private tryDetectGesture(): void {
    if (this.centroids.length < this.MIN_SAMPLES) return;

    const now = Date.now();
    if (now - this.lastGestureTime < this.GESTURE_COOLDOWN_MS) return;

    const first = this.centroids[0];
    const last = this.centroids[this.centroids.length - 1];
    const delta = last.x - first.x;

    // 1. Must cross enough of the frame
    if (Math.abs(delta) < this.GESTURE_DELTA) return;

    // 2. Gesture must take minimum time (prevents "hand entering frame" flash)
    if (last.time - first.time < this.MIN_GESTURE_MS) return;

    // 3. Gesture must start from the correct side of frame
    //    Left swipe: hand was already on the right → centroid starts in right half
    //    Right swipe: hand was already on the left → centroid starts in left half
    if (delta < 0 && first.x < 0.45) return;
    if (delta > 0 && first.x > 0.55) return;

    // 4. Directional consistency: most steps should go the same direction
    const direction = Math.sign(delta);
    let consistent = 0;
    for (let i = 1; i < this.centroids.length; i++) {
      if (Math.sign(this.centroids[i].x - this.centroids[i - 1].x) === direction) {
        consistent++;
      }
    }
    if (consistent / (this.centroids.length - 1) < this.DIRECTION_CONSISTENCY) return;

    // All checks passed — fire gesture
    this.lastGestureTime = now;
    this.centroids = [];

    if (delta < 0) {
      this.lastGesture.set('← Team 1');
      this.command$.next({ type: 'point', team: 1 });
    } else {
      this.lastGesture.set('Team 2 →');
      this.command$.next({ type: 'point', team: 2 });
    }
  }
}
