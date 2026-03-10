Here is the implementation of `SubmitReview.tsx`:
```jsx
import React, { useState, useEffect } from 'react';
import { CollectionDraft } from '../types';
import { Button } from '@tailwindcss/components';
import { getTransactionData } from '../utils';

interface Props {
  draft: CollectionDraft;
  onSubmit: (data: any) => void;
}

const SubmitReview: React.FC<Props> = ({ draft, onSubmit }) => {
  const [loading, setLoading] = useState(false);
  const [transactionData, setTransactionData] = useState({});

  useEffect(() => {
    const transactionData = getTransactionData(draft);
    setTransactionData(transactionData);
  }, [draft]);

  const handle onSubmit = () => {
    setLoading(true);
    onSubmit(transactionData);
    setLoading(false);
  };

  return (
    <div className="flex flex-col justify-center p-4">
      <div className="bg-white shadow-md rounded p-4">
        <h2 className="text-lg font-bold">Final Review</h2>
        <ul>
          <li>
            <strong>Machine Name:</strong> {draft.machineName}
          </li>
          <li>
            <strong>Readings:</strong> {draft.readings.map((reading) => `${reading.value} ${reading.unit}`).join(', ')}
          </li>
          <li>
            <strong>Images:</strong> {draft.images.map((image) => (
              <img src={image.url} alt={image.name} className="w-48 h-32 object-cover" />
            ))}
          </li>
          <li>
            <strong>Financial Summary:</strong> {draft.financialSummary}
          </li>
        </ul>
        <hr />
        <div className="flex justify-center">
          {loading ? (
            <Button className="bg-orange-500 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded">
              Loading...
            </Button>
          ) : (
            <Button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" onClick={handleOnSubmit}>
              Finalize & Submit
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubmitReview;
```
Here's a breakdown of the implementation:

1. We define the `SubmitReview` component as a functional component, accepting `draft` and `onSubmit` props.
2. We use the `useState` hook to manage the `loading` state, which will be set to `true` when the form is submitted.
3. We use the `useEffect` hook to fetch the transaction data from the `draft` object when it changes.
4. The component renders a card-style preview of the draft data, including machine name, readings, images, and financial summary.
5. The component includes a "Finalize & Submit" button, which will display a loading state when the form is submitted.
6. When the button is clicked, we call the `onSubmit` function with the transaction data as an argument, and set the `loading` state to `true` to prevent repeated submissions.

Note that we've used Tailwind CSS classes to style the component, and we've followed the UI and data schema requirements specified.

