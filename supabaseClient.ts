// supabaseClient.ts

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from a .env file
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing Supabase environment variables. Make sure SUPABASE_URL and SUPABASE_ANON_KEY are set.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default supabase;

// Error handling example
async function fetchData(tableName) {
    try {
        const { data, error } = await supabase.from(tableName).select('*');
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Error fetching data from Supabase:', err.message);
        throw new Error('Could not fetch data from Supabase.');
    }
}