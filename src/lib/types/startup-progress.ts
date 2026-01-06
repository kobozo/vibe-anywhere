/**
 * Startup progress types for tracking container initialization
 */

export type StartupStep =
  | 'initializing'
  | 'creating_container'
  | 'starting_container'
  | 'configuring_network'
  | 'cloning_repository'
  | 'installing_tech_stack'
  | 'starting_agent'
  | 'connecting'
  | 'ready';

export interface StartupProgress {
  workspaceId: string;
  currentStep: StartupStep;
  stepIndex: number;
  totalSteps: number;
  message?: string;
  error?: string;
  startedAt: number;
}

export const STARTUP_STEPS: { step: StartupStep; label: string }[] = [
  { step: 'initializing', label: 'Initializing' },
  { step: 'creating_container', label: 'Creating Container' },
  { step: 'starting_container', label: 'Starting Container' },
  { step: 'configuring_network', label: 'Configuring Network' },
  { step: 'cloning_repository', label: 'Cloning Repository' },
  { step: 'installing_tech_stack', label: 'Installing Tech Stack' },
  { step: 'starting_agent', label: 'Starting Agent' },
  { step: 'connecting', label: 'Connecting' },
  { step: 'ready', label: 'Ready' },
];

export function getStepIndex(step: StartupStep): number {
  return STARTUP_STEPS.findIndex((s) => s.step === step);
}

export function getStepLabel(step: StartupStep): string {
  return STARTUP_STEPS.find((s) => s.step === step)?.label ?? step;
}
