from flask import Flask, jsonify
from flask_cors import CORS
import subprocess
import json
import requests

app = Flask(__name__)
CORS(app)  # Allow React frontend to access this API

SITE_URL = "https://bahatiwin.space"
SUPABASE_URL = "https://jhoyqqpuousxawdydlwe.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impob3lxcXB1b3VzeGF3ZHlkbHdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0Njk1MzAsImV4cCI6MjA4NzA0NTUzMH0.PIwZIxQihCcJ0ReNoZniJq244hWXcjlXGEOHZhKORoY"

@app.route('/status', methods=['GET'])
def get_status():
    status = {
        "hardware": {},
        "services": {},
        "timestamp": ""
    }
    
    # 1. Hardware Status (Termux API)
    try:
        res = subprocess.run(["termux-battery-status"], capture_output=True, text=True)
        status["hardware"]["battery"] = json.loads(res.stdout)
        
        disk = subprocess.run(["df", "-h", "/data"], capture_output=True, text=True).stdout.split("\n")[1].split()
        status["hardware"]["disk_free"] = disk[3]
        
        mem = subprocess.run(["free", "-m"], capture_output=True, text=True).stdout.split("\n")[1].split()
        status["hardware"]["mem_free"] = mem[3] + "MB"
    except:
        status["hardware"]["battery"] = "offline"

    # 2. Website Check
    try:
        r = requests.get(SITE_URL, timeout=3)
        status["services"]["website"] = "online" if r.status_code == 200 else f"error_{r.status_code}"
    except:
        status["services"]["website"] = "down"

    # 3. DB Check
    try:
        headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
        r = requests.get(f"{SUPABASE_URL}/rest/v1/drivers?select=id&limit=1", headers=headers, timeout=3)
        status["services"]["database"] = "online" if r.status_code == 200 else "error"
    except:
        status["services"]["database"] = "down"

    return jsonify(status)

if __name__ == '__main__':
    # Running on 18790 to keep 18789 free for OpenClaw
    app.run(host='0.0.0.0', port=18790)
