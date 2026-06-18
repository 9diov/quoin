import { performance } from 'node:perf_hooks';

export type TimingPhase = { name: string; ms: number };

export type Timing = {
  totalMs: number;
  phases: TimingPhase[];
};

export type TimingRecorder = {
  startPhase(): number;
  endPhase(name: string, phaseStart: number): void;
  finish(): Timing;
};

export function createTimingRecorder(): TimingRecorder {
  const totalStart = performance.now();
  const phases: TimingPhase[] = [];

  return {
    startPhase() {
      return performance.now();
    },
    endPhase(name, phaseStart) {
      phases.push({ name, ms: Math.round(performance.now() - phaseStart) });
    },
    finish() {
      return {
        totalMs: Math.round(performance.now() - totalStart),
        phases: [...phases],
      };
    },
  };
}

export function formatTimingHuman(timing: Timing): string {
  if (timing.phases.length === 0) {
    return `Time taken: ${timing.totalMs}ms`;
  }

  const detail = timing.phases.map((phase) => `${phase.name}: ${phase.ms}ms`).join(', ');
  return `Time taken: ${timing.totalMs}ms (${detail})`;
}
