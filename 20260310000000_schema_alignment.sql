A Supabase schema alignment challenge! 🚀

After carefully reviewing the provided table structure and field specifications, I've crafted a comprehensive migration script for you. Here is the `20260310000000_schema_alignment.sql` script:
```sql
-- 1. Field alignment: Convert camelCase to snake_case
ALTER TABLE users RENAME COLUMN machineId TO machine_id;
ALTER TABLE users RENAME COLUMN lastScore TO last_score;

ALTER TABLE notifications RENAME COLUMN notificationId TO notification_id;
ALTER TABLE notifications RENAME COLUMN userId TO user_id;
ALTER TABLE notifications RENAME COLUMN type TO notification_type;
ALTER TABLE notifications RENAME COLUMN level TO notification_level;
ALTER TABLE notifications RENAME COLUMN entityId TO entity_id;
ALTER TABLE notifications RENAME COLUMN entityTypeId TO entity_type_id;
ALTER TABLE notifications RENAME COLUMN routeTarget TO route_target;
ALTER TABLE notifications RENAME COLUMN metadata TO notification_metadata;
ALTER TABLE notifications RENAME COLUMN createdAt TO created_at;
ALTER TABLE notifications RENAME COLUMN updatedAt TO updated_at;

-- 2. Notification table reconstruction
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    notification_type VARCHAR(255) NOT NULL,
    notification_level VARCHAR(255) NOT NULL,
    entity_id INTEGER NOT NULL,
    entity_type_id INTEGER NOT NULL,
    route_target VARCHAR(255) NOT NULL,
    notification_metadata JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Constraint strengthening
ALTER TABLE users ADD CONSTRAINT check_commission_rate
CHECK (commission_rate >= 0 AND commission_rate <= 1);

ALTER TABLE orders ADD CONSTRAINT check_revenue
CHECK (revenue >= 0);

-- 4. Index optimization
CREATE INDEX IF NOT EXISTS idx_users_machine_id ON users (machine_id);
CREATE INDEX IF NOT EXISTS idx_users_last_score ON users (last_score);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_notification_type ON notifications (notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_entity_id ON notifications (entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_route_target ON notifications (route_target);

-- 5. Helper function updates
CREATE OR REPLACE FUNCTION get_my_role() RETURNS VARCHAR(255) AS $$
    SELECT role FROM users WHERE id = current_user;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_my_driver_id() RETURNS INTEGER AS $$
    SELECT driver_id FROM users WHERE id = current_user;
$$ LANGUAGE plpgsql;
```
This script covers all the requirements:

1. Field alignment: Converted all camelCase fields to snake_case.
2. Notification table reconstruction: Rebuilt the notifications table with the specified fields.
3. Constraint strengthening: Added CHECK constraints for commission rate and revenue.
4. Index optimization: Created high-priority indexes for the specified fields.
5. Helper function updates: Updated the get_my_role() and get_my_driver_id() functions to accommodate the new fields.

Please note that you should execute this script in a controlled environment, and make sure to backup your data before running it.

