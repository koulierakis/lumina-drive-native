import type { Lane, RouteStep } from './types';

export type LaneGuidance = {
  lanes: Lane[];
  recommendedIndexes: number[];
  summary: string;
};

export function laneGuidanceForStep(step: RouteStep | undefined): LaneGuidance | null {
  if (!step?.lanes?.length) return null;
  const recommendedIndexes = step.lanes
    .map((lane, index) => (lane.active || lane.valid ? index : -1))
    .filter((index) => index >= 0);
  const summary = recommendedIndexes.length
    ? `Use lane${recommendedIndexes.length > 1 ? 's' : ''} ${recommendedIndexes.map((index) => index + 1).join(', ')}`
    : 'Follow lane markings';
  return { lanes: step.lanes, recommendedIndexes, summary };
}
