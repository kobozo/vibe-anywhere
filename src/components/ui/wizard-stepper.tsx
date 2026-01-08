'use client';

import React from 'react';

export interface WizardStep {
  id: string;
  label: string;
  badge?: string | number;
}

interface WizardStepperProps {
  steps: WizardStep[];
  activeStepId: string;
  completedSteps: Set<string>;
  onStepClick?: (stepId: string) => void;
  className?: string;
}

/**
 * WizardStepper - A reusable multi-step wizard navigation component
 *
 * Features:
 * - Shows step progress with completion indicators
 * - Supports optional badges on steps
 * - Can be configured to allow/disallow clicking on previous steps
 */
export function WizardStepper({
  steps,
  activeStepId,
  completedSteps,
  onStepClick,
  className = '',
}: WizardStepperProps) {
  const activeIndex = steps.findIndex((s) => s.id === activeStepId);

  return (
    <div className={`flex border-b border-border ${className}`}>
      {steps.map((step, index) => {
        const isActive = step.id === activeStepId;
        const isCompleted = completedSteps.has(step.id);
        const isPast = index < activeIndex;
        const canClick = onStepClick && (isCompleted || isPast);

        return (
          <button
            key={step.id}
            type="button"
            onClick={() => canClick && onStepClick(step.id)}
            disabled={!canClick}
            className={`
              flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative
              ${isActive
                ? 'text-primary border-b-2 border-primary -mb-[1px]'
                : isCompleted || isPast
                ? 'text-foreground-secondary hover:text-foreground cursor-pointer'
                : 'text-foreground-tertiary cursor-not-allowed'
              }
            `}
          >
            {/* Step number or checkmark */}
            <span
              className={`
                flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold
                ${isCompleted
                  ? 'bg-success/20 text-success'
                  : isActive
                  ? 'bg-primary/20 text-primary'
                  : 'bg-background-tertiary text-foreground-tertiary'
                }
              `}
            >
              {isCompleted ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                index + 1
              )}
            </span>

            {/* Step label */}
            <span>{step.label}</span>

            {/* Optional badge */}
            {step.badge !== undefined && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-background-tertiary rounded">
                {step.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface WizardNavigationProps {
  onBack?: () => void;
  onNext?: () => void;
  onCancel: () => void;
  onFinish?: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  canProceed?: boolean;
  isLoading?: boolean;
  backLabel?: string;
  nextLabel?: string;
  finishLabel?: string;
  cancelLabel?: string;
}

/**
 * WizardNavigation - Footer navigation buttons for wizard dialogs
 */
export function WizardNavigation({
  onBack,
  onNext,
  onCancel,
  onFinish,
  isFirstStep,
  isLastStep,
  canProceed = true,
  isLoading = false,
  backLabel = 'Back',
  nextLabel = 'Next',
  finishLabel = 'Save',
  cancelLabel = 'Cancel',
}: WizardNavigationProps) {
  return (
    <div className="p-4 border-t border-border flex justify-between">
      {/* Left side - Cancel or Back */}
      <div>
        {isFirstStep ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-foreground-secondary hover:text-foreground transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={onBack}
            disabled={isLoading}
            className="px-4 py-2 text-foreground-secondary hover:text-foreground transition-colors disabled:opacity-50"
          >
            {backLabel}
          </button>
        )}
      </div>

      {/* Right side - Next or Finish */}
      <div className="flex gap-2">
        {!isFirstStep && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-foreground-secondary hover:text-foreground transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
        )}
        {isLastStep ? (
          <button
            type="button"
            onClick={onFinish}
            disabled={!canProceed || isLoading}
            className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:bg-background-input disabled:opacity-50 disabled:cursor-not-allowed rounded text-foreground transition-colors"
          >
            {isLoading ? 'Saving...' : finishLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={!canProceed || isLoading}
            className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:bg-background-input disabled:opacity-50 disabled:cursor-not-allowed rounded text-foreground transition-colors"
          >
            {nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}
