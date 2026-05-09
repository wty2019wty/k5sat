from flask import Flask, request, jsonify
import sys
import os
from datetime import datetime
from dateutil import tz
import pytz

# 导入head.py的卫星计算函数
from head import FIND_SATE, CAL_PASS_TIME

app = Flask(__name__)

# ===================== 工具函数 =====================
def local2utc(local_time_str, timezone='Asia/Shanghai'):
    """本地时间转UTC时间"""
    tz_local = pytz.timezone(timezone)
    local_time = tz_local.localize(datetime.strptime(local_time_str, '%Y-%m-%d %H:%M:%S'))
    utc_time = local_time.astimezone(pytz.UTC)
    return utc_time.strftime('%Y-%m-%d %H:%M:%S')

# ===================== 缓存接口（已禁用Redis） =====================
@app.route('/lol', methods=['POST'])
def lol():
    """缓存接口（无Redis，直接返回模拟数据）"""
    return jsonify({
        "status": 0,
        "msg": "Redis已禁用，缓存功能不可用",
        "uuid": "",
        "cache": ""
    })

# ===================== 卫星过境时间接口（核心功能） =====================
@app.route('/pass', methods=['POST'])
def pass_time():
    try:
        data = request.get_json()
        sat_name = data.get('sat_name')  # 获取卫星名
        tle1 = data.get('tle1')
        tle2 = data.get('tle2')
        lon = data.get('lon')
        lat = data.get('lat')
        alt = data.get('alt', 0)
        tz_str = data.get('tz', 'Asia/Shanghai')

        # 修复：补全 3 个参数！
        sat = FIND_SATE(sat_name, tle1, tle2)
        
        # 计算过境时间
        rise_time, set_time = CAL_PASS_TIME(sat, lat, lon, alt, tz_str)

        return jsonify({
            "status": 1,
            "rise_time": rise_time,
            "set_time": set_time
        })
    except Exception as e:
        return jsonify({"status": 0, "error": str(e)})

# ===================== 多普勒频移接口（核心功能） =====================
@app.route('/doppler', methods=['POST'])
def doppler():
    try:
        data = request.get_json()
        sat_name = data.get('sat_name')
        tle1 = data.get('tle1')
        tle2 = data.get('tle2')
        lon = data.get('lon')
        lat = data.get('lat')
        alt = data.get('alt', 0)
        tx_freq = data.get('tx_freq', 437.5)
        rx_freq = data.get('rx_freq', 437.5)
        start_time = data.get('start_time')
        end_time = data.get('end_time')
        tz_str = data.get('tz', 'Asia/Shanghai')

        from head import CAL_DATA
        
        # 修复：补全 3 个参数！
        sat = FIND_SATE(sat_name, tle1, tle2)

        shift_up_list = []
        shift_down_list = []

        start_utc = local2utc(start_time, tz_str)
        end_utc = local2utc(end_time, tz_str)

        start_dt = datetime.strptime(start_utc, '%Y-%m-%d %H:%M:%S')
        end_dt = datetime.strptime(end_utc, '%Y-%m-%d %H:%M:%S')

        delta = (end_dt - start_dt).total_seconds()

        for i in range(int(delta)):
            current_time = start_dt.timestamp() + i
            az, el, shift_up, shift_down, dis = CAL_DATA(
                sat, lat, lon, alt, current_time, tx_freq, rx_freq
            )
            shift_up_list.append(shift_up)
            shift_down_list.append(shift_down)

        return jsonify({
            "status": 1,
            "SHIFT_UP": shift_up_list,
            "SHIFT_DOWN": shift_down_list
        })
    except Exception as e:
        return jsonify({"status": 0, "error": str(e)})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)