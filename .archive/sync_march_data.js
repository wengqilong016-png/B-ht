import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
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

async function syncData() {
  const startDate = '2026-03-03T00:00:00Z';
  const endDate = '2026-03-07T23:59:59Z';
  
  console.log(`Fetching transactions between ${startDate} and ${endDate}...`);
  
  const { data: txs, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .gte('timestamp', startDate)
    .lte('timestamp', endDate);

  if (txError) {
    console.error('Error fetching transactions:', txError.message);
    return;
  }

  console.log(`Fetched ${txs.length} transactions.`);

  // Update backup file
  let backup = { transactions: [], locations: [], drivers: [] };
  if (fs.existsSync(BACKUP_FILE)) {
    backup = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
  }

  // Merge new transactions (avoid duplicates)
  const existingIds = new Set(backup.transactions.map(t => t.id));
  const newTxs = txs.filter(t => !existingIds.has(t.id));
  backup.transactions = [...backup.transactions, ...newTxs];

  fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2));
  console.log(`Sync complete! Total transactions in backup: ${backup.transactions.length}`);
}

syncData();
