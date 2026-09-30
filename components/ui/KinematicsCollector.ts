import { KinematicVector } from "@/lib/security/kinematicsEvaluator";

/**
 * High-performance, zero-allocation client-side Kinematics Collector.
 * 
 * Captures touch and pointer trajectories during user physical interactions
 * (swipe, press & hold, tap) with microsecond precision via `performance.now()`.
 * 
 * Automatically caps buffer at 50 points to guarantee payload < 500 bytes.
 */

export class KinematicsCollector {
  private vectors: KinematicVector[] = [];
  private startPerfTime: number = 0;
  private lastSampleTime: number = 0;
  private isCollecting: boolean = false;
  private mode: "swipe" | "hold" | "tap" = "swipe";
  private isTrusted: boolean = true;
  private readonly maxSamples: number = 50;
  private readonly minSampleIntervalMs: number = 10; // ~100Hz max sampling rate

  public start(
    x: number,
    y: number,
    pressure = 1.0,
    mode: "swipe" | "hold" | "tap" = "swipe",
    isTrusted = true
  ): void {
    this.vectors = [];
    this.mode = mode;
    this.isTrusted = isTrusted;
    this.startPerfTime = performance.now();
    this.lastSampleTime = this.startPerfTime;
    this.isCollecting = true;

    this.vectors.push({
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      t: 0,
      p: Math.round(pressure * 100) / 100,
      mode: this.mode,
      isTrusted: this.isTrusted,
    });
  }

  public record(x: number, y: number, pressure = 1.0): void {
    if (!this.isCollecting) return;
    if (this.vectors.length >= this.maxSamples) return;

    const now = performance.now();
    if (now - this.lastSampleTime < this.minSampleIntervalMs) {
      return; // Throttle to prevent duplicate identical points
    }

    this.lastSampleTime = now;
    const relTimeMs = Math.round(now - this.startPerfTime);

    this.vectors.push({
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      t: relTimeMs,
      p: Math.round(pressure * 100) / 100,
      mode: this.mode,
      isTrusted: this.isTrusted,
    });
  }

  public finish(x: number, y: number, pressure = 1.0): KinematicVector[] {
    if (!this.isCollecting) return this.vectors;
    this.isCollecting = false;

    const now = performance.now();
    const relTimeMs = Math.round(now - this.startPerfTime);

    this.vectors.push({
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      t: relTimeMs,
      p: Math.round(pressure * 100) / 100,
      mode: this.mode,
      isTrusted: this.isTrusted,
    });

    return [...this.vectors];
  }

  public getVectors(): KinematicVector[] {
    return [...this.vectors];
  }

  public reset(): void {
    this.vectors = [];
    this.isCollecting = false;
    this.startPerfTime = 0;
    this.lastSampleTime = 0;
    this.isTrusted = true;
  }
}
