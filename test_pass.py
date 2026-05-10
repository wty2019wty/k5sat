import requests
import json

# 基础配置
BASE_URL = "http://127.0.0.1:5000"
HEADERS = {"Content-Type": "application/json"}

# 你提供的最新ISS TLE数据
SAT_NAME = "ISS (ZARYA)"
SAT_LINE_1 = "1 25544U 98067A   26129.81209009  .00006662  00000+0  12821-3 0  9995"
SAT_LINE_2 = "2 25544  51.6310 130.0607 0007453  41.4864 318.6689 15.49164784565805"

# 观测位置：北京
OBSERVER_LAT = 39.9042
OBSERVER_LNG = 116.4074
OBSERVER_ALT = 50
TIMEZONE = "Asia/Shanghai"

def test_pass_api():
    """独立测试 /pass 卫星过境接口"""
    print("=== 独立测试 /pass 接口 ===")
    data = {
        "sat": SAT_NAME,
        "sat_line_1": SAT_LINE_1,
        "sat_line_2": SAT_LINE_2,
        "lat": OBSERVER_LAT,
        "lng": OBSERVER_LNG,
        "alt": OBSERVER_ALT,
        "tz": TIMEZONE
    }
    res = requests.post(f"{BASE_URL}/pass", headers=HEADERS, data=json.dumps(data))
    print(f"状态码：{res.status_code}")
    print(f"接口返回结果：{res.json()}")

if __name__ == "__main__":
    test_pass_api()