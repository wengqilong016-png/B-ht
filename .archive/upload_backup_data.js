import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://yctsiudhicztvppddbvk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_KEY;
const BACKUP_FILE = 'BAHATI_DATA_BACKUP.json';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_KEY is missing');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function uploadData() {
  if (!fs.existsSync(BACKUP_FILE)) {
    console.error('Backup file not found');
    return;
  }

  const backup = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
  console.log(`Starting data upload. Found: ${backup.locations.length} locations, ${backup.drivers.length} drivers, ${backup.transactions.length} transactions.`);

  // Helper to clean object based on known good fields (minimal set)
  const cleanObject = (obj, allowedFields) => {
    const newObj = {};
    allowedFields.forEach(f => {
      if (obj[f] !== undefined) newObj[f] = obj[f];
    });
    return newObj;
  };

  // 1. Upload Drivers
  if (backup.drivers.length > 0) {
    console.log('Uploading drivers...');
    const driverFields = ['id', 'name', 'username', 'phone', 'initialDebt', 'remainingDebt', 'dailyFloatingCoins', 'vehicleInfo', 'currentGps', 'lastActive', 'status', 'baseSalary', 'commissionRate'];
    const cleanedDrivers = backup.drivers.map(d => cleanObject(d, driverFields));
    const { error } = await supabase.from('drivers').upsert(cleanedDrivers);
    if (error) console.error('Error uploading drivers:', error.message);
    else console.log('✅ Drivers uploaded.');
  }

  // 2. Upload Locations
  if (backup.locations.length > 0) {
    console.log('Uploading locations...');
    const locFields = ['id', 'name', 'machineId', 'lastScore', 'area', 'assignedDriverId', 'ownerName', 'shopOwnerPhone', 'ownerPhotoUrl', 'machinePhotoUrl', 'initialStartupDebt', 'remainingStartupDebt', 'isNewOffice', 'coords', 'status', 'lastRevenueDate', 'commissionRate', 'resetLocked', 'dividendBalance'];
    const chunkSize = 50;
    for (let i = 0; i < backup.locations.length; i += chunkSize) {
      const chunk = backup.locations.slice(i, i + chunkSize).map(l => cleanObject(l, locFields));
      const { error } = await supabase.from('locations').upsert(chunk);
      if (error) console.error(`Error uploading locations chunk ${i}:`, error.message);
    }
    console.log('✅ Locations uploaded.');
  }

  // 3. Upload Transactions
  if (backup.transactions.length > 0) {
    console.log('Uploading transactions...');
    const txFields = ['id', 'timestamp', 'locationId', 'locationName', 'driverId', 'driverName', 'previousScore', 'currentScore', 'revenue', 'commission', 'ownerRetention', 'debtDeduction', 'startupDebtDeduction', 'expenses', 'coinExchange', 'extraIncome', 'netPayable', 'gps', 'photoUrl', 'aiScore', 'isAnomaly', 'notes', 'paymentStatus', 'type', 'approvalStatus', 'expenseType', 'expenseCategory', 'expenseStatus'];
    const validTxs = backup.transactions.filter(t => t.locationId && t.driverId).map(t => cleanObject(t, txFields));
    const chunkSize = 50;
    for (let i = 0; i < validTxs.length; i += chunkSize) {
        const chunk = validTxs.slice(i, i + chunkSize);
        const { error } = await supabase.from('transactions').upsert(chunk);
        if (error) console.error(`Error uploading transactions chunk ${i}:`, error.message);
    }
    console.log('✅ Transactions uploaded.');
  }

  // 4. Create Profiles for Auth Users (Essential for Login)
  console.log('Creating system profiles...');
  const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
  if (userError) {
    console.error('Error listing auth users:', userError.message);
  } else {
    const profiles = users.map(u => {
      const role = u.email === 'admin@bahati.com' ? 'admin' : 'driver';
      const driver = backup.drivers.find(d => d.username === u.email?.split('@')[0]);
      return {
        auth_user_id: u.id,
        role: role,
        display_name: u.email?.split('@')[0].toUpperCase(),
        driver_id: driver?.id || null
      };
    });
    const { error: pError } = await supabase.from('profiles').upsert(profiles);
    if (pError) console.error('Error creating profiles:', pError.message);
    else console.log('✅ System profiles created/linked.');
  }

  console.log('--- Data synchronization complete ---');
}

uploadData();
