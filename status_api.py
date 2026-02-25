import os
import json
from flask import Flask, jsonify, request, abort
from flask_cors import CORS
from supabase import create_client, Client
import logging
from datetime import datetime
from functools import wraps

app = Flask(__name__)
CORS(app)

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- 环境变量配置 ---
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')
INTERNAL_API_KEY = os.getenv('INTERNAL_API_KEY')

# --- 安全装饰器 (Security Decorator) ---
def require_api_key(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        api_key = request.headers.get('X-API-KEY')
        if not api_key or api_key != INTERNAL_API_KEY:
            logger.warning(f'🚫 Unauthorized access attempt from {request.remote_addr} at {datetime.now()}')
            return jsonify({'error': 'Unauthorized', 'message': 'Invalid or missing API Key'}), 401
        return f(*args, **kwargs)
    return decorated_function

# 验证环境变量
if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error('❌ Missing Supabase credentials!')
    SUPABASE_CLIENT = None
else:
    try:
        SUPABASE_CLIENT: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info('✅ Supabase client initialized with Service Role Key')
    except Exception as e:
        logger.error(f'❌ Failed to initialize Supabase client: {str(e)}')
        SUPABASE_CLIENT = None

# --- 公开接口 (Public Endpoint) ---
@app.route('/api/status', methods=['GET'])
def get_status():
    """检查数据库连接状态 (无需 Key)"""
    if not SUPABASE_CLIENT:
        return jsonify({'status': 'error', 'message': 'Supabase client not initialized'}), 500
    return jsonify({
        'status': 'connected',
        'timestamp': datetime.now().isoformat()
    }), 200

# --- 受保护接口 (Protected Endpoints) ---
@app.route('/api/drivers', methods=['GET'])
@require_api_key
def get_drivers():
    """获取所有司机信息 (需要 Key)"""
    try:
        response = SUPABASE_CLIENT.table('drivers').select('*').execute()
        return jsonify({'status': 'success', 'data': response.data}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/transactions', methods=['GET'])
@require_api_key
def get_transactions():
    """获取所有交易记录 (需要 Key)"""
    try:
        limit = request.args.get('limit', 100, type=int)
        response = SUPABASE_CLIENT.table('transactions').select('*').limit(limit).order('timestamp', desc=True).execute()
        return jsonify({'status': 'success', 'data': response.data}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sync/transactions', methods=['POST'])
@require_api_key
def sync_transactions():
    """同步交易数据 (高危操作，强制校验 Key)"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        response = SUPABASE_CLIENT.table('transactions').upsert(data).execute()
        logger.info(f'✅ Securely synced {len(data)} transactions')
        return jsonify({'status': 'success', 'message': f'Synced {len(data)} transactions'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Endpoint not found'}), 404

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
