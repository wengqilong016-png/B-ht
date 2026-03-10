import React from 'react';
import { Location, Driver, Transaction, AILog } from '../types';
import DriverCollectionFlow from '../driver/pages/DriverCollectionFlow';

interface CollectionFormProps {
  locations: Location[];
  currentDriver: Driver;
  onSubmit: (tx: Transaction) => void;
  lang: 'zh' | 'sw';
  onLogAI: (log: AILog) => void;
  onRegisterMachine?: (location: Location) => void;
  isOnline?: boolean;
  allTransactions?: Transaction[];
}

/**
 * CollectionForm — compatibility wrapper.
 *
 * The original 1600+ line component has been refactored into
 * DriverCollectionFlow and its sub-components. This file now
 * serves as a thin bridge so that existing imports (App.tsx,
 * admin collect view) continue to work without changing their
 * call sites.
 *
 * @see driver/pages/DriverCollectionFlow.tsx
 */
const CollectionForm: React.FC<CollectionFormProps> = (props) => {
  return (
    <DriverCollectionFlow
      locations={props.locations}
      currentDriver={props.currentDriver}
      onSubmit={props.onSubmit}
      lang={props.lang}
      onLogAI={props.onLogAI}
      onRegisterMachine={props.onRegisterMachine}
      isOnline={props.isOnline}
      allTransactions={props.allTransactions}
    />
  );
};

export default CollectionForm;
