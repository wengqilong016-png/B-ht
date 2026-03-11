**Phase 1: Super Component Decomposition and Data Collection Flow Reconstruction Technical Specification**

**1. DraftState Interface Definition and Local Storage Persistence Logic**

The `DraftState` interface is responsible for managing the persistence of the draft data in the local storage. The interface will be implemented in the `useCollectionDraft` hook.

* `DraftState` interface definition:
	+ `getDraft`: returns the current draft data
	+ `setDraft`: sets the new draft data
	+ `persist`: persists the draft data to local storage
	+ `restore`: restores the draft data from local storage
* Local storage persistence logic:
	+ When the user creates a new draft, the `setDraft` method will be called to store the data in local storage.
	+ When the user navigates away from the draft, the `persist` method will be called to save the data to local storage.
	+ When the user comes back to the draft, the `restore` method will be called to retrieve the data from local storage and restore the draft state.
* Data recovery mechanism:
	+ The `restore` method will check if the data is valid and can be restored. If not, it will return an error.

**2. Component Props and State Management**

The following components will be implemented:

* `MachineSelector`: selects the machine type and provides the selected machine type as a prop to the `ReadingCapture` component.
* `ReadingCapture`: captures the reading and provides the captured reading as a prop to the `FinanceSummary` component.
* `FinanceSummary`: summarizes the financial information and provides the summarized data as a prop to the `SubmitReview` component.
* `SubmitReview`: submits the review and provides the submission result as a prop to the `Transaction` component.

The props and state management for each component are as follows:

* `MachineSelector`:
	+ Props: `machineTypes` (an array of machine types)
	+ State: `selectedMachineType` (the currently selected machine type)
* `ReadingCapture`:
	+ Props: `capturedReading` (the captured reading)
	+ State: `readingCaptured` (a boolean indicating whether the reading has been captured)
* `FinanceSummary`:
	+ Props: `summaryData` (the summarized financial data)
	+ State: `summaryGenerated` (a boolean indicating whether the summary has been generated)
* `SubmitReview`:
	+ Props: `submissionResult` (the submission result)
	+ State: `reviewSubmitted` (a boolean indicating whether the review has been submitted)

**3. Data Flow Logic**

The data flow logic will be implemented as follows:

Step 1: Machine Selection

* The `MachineSelector` component is rendered and the user selects a machine type.
* The selected machine type is passed as a prop to the `ReadingCapture` component.

Step 2: Reading Capture

* The `ReadingCapture` component is rendered and the user captures a reading.
* The captured reading is passed as a prop to the `FinanceSummary` component.

Step 3: Finance Summary

* The `FinanceSummary` component is rendered and the financial information is summarized.
* The summarized data is passed as a prop to the `SubmitReview` component.

Step 4: Submission Review

* The `SubmitReview` component is rendered and the user submits a review.
* The submission result is passed as a prop to the `Transaction` component.

The data flow will be accumulated in a partial data object, which will be wrapped in a `Transaction` object at the end.

**4. Performance Degradation Scheme**

The `usePerformanceMode` hook will be used to intercept the driver UI behavior and degrade the performance when necessary.

* When the performance mode is set to "degraded", the driver UI will be throttled to prevent excessive CPU usage.
* The degraded performance mode will be triggered when the system is under heavy load or when the user is not interacting with the system.

**5. Error Handling**

Error handling will be implemented for the following critical sections:

* Camera failure: when the camera fails to capture an image, the system will attempt to recover by restarting the camera or prompting the user to take another picture.
* GPS failure: when the GPS fails to get a location, the system will attempt to recover by prompting the user to enter a location manually or using an alternative location source.

The error handling mechanism will be implemented using a combination of try-catch blocks and error handling libraries.

