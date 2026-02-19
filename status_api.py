import os
import json
from flask import Flask, jsonify, request
from flask_cors import CORS
from supabase import create_client, Client
import logging
from datetime import datetime

app = Flask(__name__)
CORS(app)

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- 环境变量配置 ---
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')

# 验证环境变量
if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error('❌ Missing Supabase credentials! Set SUPABASE_URL and SUPABASE_KEY environment variables.')
    SUPABASE_CLIENT = None
else:
    try:
        SUPABASE_CLIENT: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info('✅ Supabase client initialized successfully')
    except Exception as e:
        logger.error(f'❌ Failed to initialize Supabase client: {str(e)}')
        SUPABASE_CLIENT = None

# --- 健康检查端点 ---
@app.route('/api/status', methods=['GET'])
def get_status():
    """检查数据库连接状态"""
    if not SUPABASE_CLIENT:
        return jsonify({
            'status': 'error',
            'message': 'Supabase client not initialized',
            'timestamp': datetime.now().isoformat()
        }), 500
    
    try:
        # 执行简单查询来验证连接
        response = SUPABASE_CLIENT.table('drivers').select('id').limit(1).execute()
        logger.info('✅ Database health check passed')
        return jsonify({
            'status': 'connected',
            'message': 'Database is reachable',
            'timestamp': datetime.now().isoformat(),
            'url': SUPABASE_URL
        }), 200
    except Exception as e:
        logger.error(f'❌ Database health check failed: {str(e)}')
        return jsonify({
            'status': 'error',
            'message': f'Database connection failed: {str(e)}',
            'timestamp': datetime.now().isoformat()
        }), 500

# --- 获取所有司机数据 ---
@app.route('/api/drivers', methods=['GET'])
def get_drivers():
    """获取所有司机信息"""
    if not SUPABASE_CLIENT:
        return jsonify({'error': 'Database not available'}), 500
    
    try:
        response = SUPABASE_CLIENT.table('drivers').select('*').execute()
        return jsonify({
            'status': 'success',
            'data': response.data,
            'count': len(response.data)
        }), 200
    except Exception as e:
        logger.error(f'Error fetching drivers: {str(e)}')
        return jsonify({'error': str(e)}), 500

# --- 获取所有交易数据 ---
@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    """获取所有交易记录"""
    if not SUPABASE_CLIENT:
        return jsonify({'error': 'Database not available'}), 500
    
    try:
        limit = request.args.get('limit', 100, type=int)
        response = SUPABASE_CLIENT.table('transactions').select('*').limit(limit).order('timestamp', desc=True).execute()
        return jsonify({
            'status': 'success',
            'data': response.data,
            'count': len(response.data)
        }), 200
    except Exception as e:
        logger.error(f'Error fetching transactions: {str(e)}')
        return jsonify({'error': str(e)}), 500

# --- 获取所有位置数据 ---
@app.route('/api/locations', methods=['GET'])
def get_locations():
    """获取所有点位信息"""
    if not SUPABASE_CLIENT:
        return jsonify({'error': 'Database not available'}), 500
    
    try:
        response = SUPABASE_CLIENT.table('locations').select('*').execute()
        return jsonify({
            'status': 'success',
            'data': response.data,
            'count': len(response.data)
        }), 200
    except Exception as e:
        logger.error(f'Error fetching locations: {str(e)}')
        return jsonify({'error': str(e)}), 500

# --- 数据同步端点 ---
@app.route('/api/sync/transactions', methods=['POST'])
def sync_transactions():
    """同步交易数据"""
    if not SUPABASE_CLIENT:
        return jsonify({'error': 'Database not available'}), 500
    
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # 批量插入或更新
        response = SUPABASE_CLIENT.table('transactions').upsert(data).execute()
        logger.info(f'✅ Synced {len(data)} transactions')
        return jsonify({
            'status': 'success',
            'message': f'Synced {len(data)} transactions',
            'data': response.data
        }), 200
    except Exception as e:
        logger.error(f'Error syncing transactions: {str(e)}')
        return jsonify({'error': str(e)}), 500

# --- 错误处理 ---
@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(e):
    logger.error(f'Internal server error: {str(e)}')
    return jsonify({'error': 'Internal server error'}), 500

# --- 启动应用 ---
if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV') == 'development'
    app.run(host='0.0.0.0', port=port, debug=debug)