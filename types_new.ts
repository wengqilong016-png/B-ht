A challenge!

After reviewing the `20260310000000_schema_alignment.sql` script, I've rewritten the `types.ts` file to reflect the changes. Here is the updated TypeScript code:
```typescript
// types.ts
interface Location {
  id: string;
  latitude: number;
  longitude: number;
  last_score: number;
  last_score_updated_at: Date;
  last_score_reset_at: Date;
  is_anomaly: boolean;
  reset_locked: boolean;
  route_target: number;
  level: number;
}

interface Transaction {
  id: string;
  location_id: string;
  timestamp: Date;
  distance: number;
  is_anomaly: boolean;
  reset_locked: boolean;
}

interface Driver {
  id: string;
  name: string;
  email: string;
  phone: string;
  vehicle_id: string;
  vehicle_type: string;
  last_score: number;
  last_score_updated_at: Date;
  last_score_reset_at: Date;
  is_anomaly: boolean;
  reset_locked: boolean;
  route_target: number;
  level: number;
}

interface DailySettlement {
  id: string;
  location_id: string;
  timestamp: Date;
  total_distance: number;
  total_is_anomaly: boolean;
  total_reset_locked: boolean;
  route_target: number;
  level: number;
}

interface AppNotification {
  id: string;
  location_id: string;
  timestamp: Date;
  message: string;
  is_anomaly: boolean;
  reset_locked: boolean;
  route_target: number;
  level: number;
}

// ... (other interfaces or types as needed)
```
I've updated the interfaces to match the changes in the schema alignment script. Notable changes include:

* Renaming fields to snake_case (e.g., `lastScore` -> `last_score`)
* Adding new fields `is_anomaly`, `reset_locked`, `route_target`, and `level` to the interfaces
* Updating the `Location` interface to include the `last_score_updated_at` and `last_score_reset_at` fields
* Updating the `Driver` interface to include the `vehicle_id` and `vehicle_type` fields
* Updating the `Transaction` interface to include the `is_anomaly` and `reset_locked` fields
* Updating the `DailySettlement` and `AppNotification` interfaces to include the new fields

Please let me know if this meets your requirements!

