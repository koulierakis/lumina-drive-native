export type DrivingEvent =
  | { type: 'hard_brake'; severity: number }
  | { type: 'rapid_acceleration'; severity: number }
  | { type: 'speeding'; severity: number }
  | { type: 'smooth_segment'; severity: number };

export type DriverScore = {
  safety: number;
  eco: number;
  contributions: Array<{ event: DrivingEvent['type']; safetyDelta: number; ecoDelta: number }>;
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function scoreDriving(events: DrivingEvent[]): DriverScore {
  let safety = 100;
  let eco = 100;
  const contributions: DriverScore['contributions'] = [];
  for (const event of events) {
    const severity = Math.max(0, Math.min(1, event.severity));
    let safetyDelta = 0;
    let ecoDelta = 0;
    if (event.type === 'hard_brake') { safetyDelta = -12 * severity; ecoDelta = -8 * severity; }
    if (event.type === 'rapid_acceleration') { safetyDelta = -6 * severity; ecoDelta = -12 * severity; }
    if (event.type === 'speeding') { safetyDelta = -15 * severity; ecoDelta = -5 * severity; }
    if (event.type === 'smooth_segment') { safetyDelta = 2 * severity; ecoDelta = 3 * severity; }
    safety += safetyDelta;
    eco += ecoDelta;
    contributions.push({ event: event.type, safetyDelta: Math.round(safetyDelta), ecoDelta: Math.round(ecoDelta) });
  }
  return { safety: clamp(safety), eco: clamp(eco), contributions };
}
