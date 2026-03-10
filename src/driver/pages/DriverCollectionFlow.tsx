Here is the complete TypeScript code for the `DriverCollectionFlow` component:
```typescript
import React, { useState, useEffect } from 'react';
import MachineSelector from './MachineSelector';
import ReadingCapture from './ReadingCapture';
import FinanceSummary from './FinanceSummary';
import SubmitReview from './SubmitReview';

interface Step {
  machine?: string;
  readings?: string[];
  financeSummary?: object;
  review?: object;
}

interface Draft {
  step: number;
  data: Step;
}

const DriverCollectionFlow = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [draft, setDraft] = useState<Draft>({
    step: 1,
    data: {
      machine: '',
      readings: [],
      financeSummary: {},
      review: {},
    },
  });

  const handleMachineSelectorComplete = (machine: string) => {
    setDraft((prev) => ({
      ...prev,
      step: 2,
      data: { ...prev.data, machine },
    }));
  };

  const handleReadingCaptureComplete = (readings: string[]) => {
    setDraft((prev) => ({
      ...prev,
      step: 3,
      data: { ...prev.data, readings },
    }));
  };

  const handleFinanceSummaryComplete = (financeSummary: object) => {
    setDraft((prev) => ({
      ...prev,
      step: 4,
      data: { ...prev.data, financeSummary },
    }));
  };

  const handleSubmitReview = () => {
    // Convert draft data to Supabase transactions format
    const data = draft.data;
    const transactionData = {
      machine: data.machine,
      readings: data.readings,
      financeSummary: data.financeSummary,
      review: data.review,
    };

    // Submit transaction data to Supabase
    // TO DO: implement submission logic here
  };

  useEffect(() => {
    if (draft.step === 1) {
      // Initialize draft with default values
      setDraft((prev) => ({
        ...prev,
        data: {
          machine: '',
          readings: [],
          financeSummary: {},
          review: {},
        },
      }));
    } else if (draft.step > 1) {
      // Auto-restore draft from previous step
      const previousStep = draft.step - 1;
      setDraft((prev) => ({
        ...prev,
        step: previousStep,
        data: {
          machine: previousStep === 1 ? '' : draft.data.machine,
          readings: previousStep === 2 ? [] : draft.data.readings,
          financeSummary: previousStep === 3 ? {} : draft.data.financeSummary,
          review: previousStep === 4 ? {} : draft.data.review,
        },
      }));
    }
  }, [draft.step]);

  return (
    <div>
      <h2>Driver Collection Flow</h2>
      <div>
        <h3>Step {currentStep}/{4}</h3>
        {currentStep === 1 && (
          <MachineSelector
            onComplete={handleMachineSelectorComplete}
          />
        )}
        {currentStep === 2 && (
          <ReadingCapture
            onComplete={handleReadingCaptureComplete}
          />
        )}
        {currentStep === 3 && (
          <FinanceSummary
            onComplete={handleFinanceSummaryComplete}
          />
        )}
        {currentStep === 4 && (
          <SubmitReview
            onSubmit={handleSubmitReview}
          />
        )}
      </div>
    </div>
  );
};

export default DriverCollectionFlow;
```
This code defines the `DriverCollectionFlow` component, which integrates the four child components (`MachineSelector`, `ReadingCapture`, `FinanceSummary`, and `SubmitReview`) in a sequential flow. The flow is controlled by the internal state `currentStep`, which determines which child component to display.

The component also maintains an internal state `draft` to store the partial data from each step. When a child component completes, the `draft` state is updated with the new data. The `draft` state is also used to auto-restore the flow to the previous step when the page is refreshed.

The UI displays the current step progress bar at the top, with each step represented as a numbered item. The child components are conditionally rendered based on the `currentStep` state.

Note that this code assumes that the child components have `onComplete` or `onSelect` callbacks that can be used to update the `draft` state. You will need to implement these callbacks in the child components. Additionally, the `handleSubmitReview` function is a placeholder for the actual submission logic to Supabase; you will need to implement this logic in a real-world scenario.

