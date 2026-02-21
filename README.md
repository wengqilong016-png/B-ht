<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/19ZXHne5Pl7SQ2J0RPJvTJi1lf01A0cU6

## Supabase Database Setup

Before running the app, you must create the required tables in your Supabase project.

**Tables required:**

| Table | Purpose |
|---|---|
| `locations` | Machine / store point-of-sale locations |
| `drivers` | Driver accounts and debt information |
| `transactions` | Revenue collection and expense records |
| `daily_settlements` | End-of-day cash reconciliation records |
| `ai_logs` | AI audit query and response history |
| `notifications` | System notifications |

**How to create the tables:**

1. Open your [Supabase dashboard](https://supabase.com/dashboard) and select your project.
2. Go to **SQL Editor** in the left sidebar.
3. Copy the entire contents of [`setup_db.sql`](./setup_db.sql) and paste it into the editor.
4. Click **Run** to execute the script.

The script will create all required tables with the correct columns, indexes, and permissions.

> **Note:** The script starts with `DROP TABLE IF EXISTS … CASCADE` statements to allow clean re-runs. Do **not** run it against a production database that already has data you want to keep.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase and Gemini API credentials:
   ```bash
   cp .env.example .env.local
   ```
3. Run the app:
   `npm run dev`
