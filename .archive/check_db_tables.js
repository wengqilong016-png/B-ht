import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://yctsiudhicztvppddbvk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkTables() {
  const { data, error } = await supabase.rpc('get_schema_info');
  if (error) {
    // Fallback: try to query information_schema directly if RPC not available
    console.log('RPC get_schema_info not available, trying raw query...');
    const { data: tables, error: tableError } = await supabase.from('pg_catalog.pg_tables').select('tablename').eq('schemaname', 'public');
    
    if (tableError) {
      console.error('Error listing tables:', tableError.message);
      // Try one more simple check
      const { error: testError } = await supabase.from('locations').select('id').limit(1);
      console.log('Test "locations" table access:', testError ? testError.message : 'OK');
      
      const { error: txTestError } = await supabase.from('transactions').select('id').limit(1);
      console.log('Test "transactions" table access:', txTestError ? txTestError.message : 'OK');
    } else {
      console.log('Tables in public schema:', tables.map(t => t.tablename));
    }
  } else {
    console.log('Schema info:', data);
  }
}

checkTables();
