import requests
import subprocess
import json
import time
import sys

# --- CONFIGURATION ---
SITE_URL = "https://bahatiwin.space"
SUPABASE_URL = "https://jhoyqqpuousxawdydlwe.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impob3lxcXB1b3VzeGF3ZHlkbHdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0Njk1MzAsImV4cCI6MjA4NzA0NTUzMH0.PIwZIxQihCcJ0ReNoZniJq244hWXcjlXGEOHZhKORoY"

# --- HELPERS ---
def send_notification(title, content, priority="low"):
    """Sends a system notification via Termux API."""
    try:
        subprocess.run([
            "termux-notification",
            "--title", title,
            "--content", content,
            "--priority", priority,
            "--id", "bahati_monitor"
        ], check=True)
    except FileNotFoundError:
        print("Termux API not found. Skipping notification.")

def get_battery_status():
    """Gets battery percentage."""
    try:
        result = subprocess.run(["termux-battery-status"], capture_output=True, text=True)
        data = json.loads(result.stdout)
        return data.get("percentage", 0), data.get("status", "UNKNOWN")
    except Exception as e:
        return 0, "ERROR"

def check_site():
    """Checks if the main site is reachable."""
    try:
        response = requests.get(SITE_URL, timeout=5)
        return response.status_code == 200, response.status_code
    except:
        return False, "ERR"

def check_db():
    """Checks if Supabase is reachable."""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}"
    }
    try:
        # Simple query: select one driver
        url = f"{SUPABASE_URL}/rest/v1/drivers?select=id&limit=1"
        response = requests.get(url, headers=headers, timeout=5)
        return response.status_code == 200, response.status_code
    except:
        return False, "ERR"

def get_system_resources():
    """Gets disk and memory info."""
    try:
        disk = subprocess.run(["df", "-h", "/data"], capture_output=True, text=True).stdout.split("\n")[1].split()
        mem = subprocess.run(["free", "-m"], capture_output=True, text=True).stdout.split("\n")[1].split()
        return {
            "disk_free": disk[3],
            "mem_free": mem[3] + "MB"
        }
    except:
        return {"disk_free": "N/A", "mem_free": "N/A"}

# --- MAIN EXECUTION ---
def run_audit():
    print("🔍 Starting Bahati System Audit...")
    
    # 1. Battery Check
    batt_level, batt_status = get_battery_status()
    print(f"🔋 Battery: {batt_level}% ({batt_status})")
    
    # 2. Resources
    res = get_system_resources()
    print(f"💾 Disk Free: {res['disk_free']} | 🧠 Mem Free: {res['mem_free']}")
    
    # 3. Site Check
    site_ok, site_code = check_site()
    print(f"🌐 Website: {'ONLINE' if site_ok else 'OFFLINE'} ({site_code})")
    
    # 4. DB Check
    db_ok, db_code = check_db()
    print(f"🗄️ Database: {'CONNECTED' if db_ok else 'DISCONNECTED'} ({db_code})")

    # --- ANALYSIS ---
    issues = []
    if batt_level < 20 and batt_status != "CHARGING":
        issues.append(f"Low Battery ({batt_level}%)")
    if not site_ok:
        issues.append("Website Down")
    if not db_ok:
        issues.append("Database Unreachable")

    # --- REPORTING ---
    if issues:
        msg = "⚠️ ALERT: " + ", ".join(issues)
        print("\n" + msg)
        send_notification("Bahati Monitor 🚨", msg, "high")
    else:
        msg = f"✅ All Systems Operational. Battery: {batt_level}%"
        print("\n" + msg)
        # Only notify if explicitly asked or just log silently
        # send_notification("Bahati Monitor", msg, "low")

if __name__ == "__main__":
    run_audit()
