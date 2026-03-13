import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "sg-onboarding-v1";
const TOTAL_STEPS = 7; // steps 0..6

export interface OnboardingState {
  step: number | null; // null = not active
  next: () => void;
  dismiss: () => void;
}

export function useOnboarding(): OnboardingState {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setStep(0);
      }
    } catch {
      // localStorage unavailable (SSR / privacy mode) — skip onboarding
    }
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch { /* ignore */ }
    setStep(null);
  }, []);

  const next = useCallback(() => {
    setStep((prev) => {
      if (prev === null) return null;
      if (prev >= TOTAL_STEPS - 1) return null; // last step → also dismiss
      return prev + 1;
    });
  }, []);

  // Dismiss automatically when last step advances to null
  useEffect(() => {
    if (step === null) return;
    if (step >= TOTAL_STEPS) {
      dismiss();
    }
  }, [step, dismiss]);

  return { step, next, dismiss };
}
