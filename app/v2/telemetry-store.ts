import type { GpsPoint, ObdTelemetry, VisionResult } from './types';

export type TelemetrySnapshot = {
  obd: ObdTelemetry | null;
  vision: VisionResult | null;
  gps: GpsPoint | null;
};

type Listener = (snapshot: TelemetrySnapshot) => void;

class TelemetryStore {
  private listeners = new Set<Listener>();
  private state: TelemetrySnapshot = { obd: null, vision: null, gps: null };

  getSnapshot(): TelemetrySnapshot {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  updateObd(obd: ObdTelemetry): void {
    this.state = { ...this.state, obd };
    this.emit();
  }

  updateVision(vision: VisionResult): void {
    this.state = { ...this.state, vision };
    this.emit();
  }

  updateGps(gps: GpsPoint): void {
    this.state = { ...this.state, gps };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}

export const telemetryStore = new TelemetryStore();
