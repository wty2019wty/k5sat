import requests
import uuid
from datetime import datetime

# 基础URL（和你的Flask服务一致）
BASE_URL = "http://127.0.0.1:5000"

# 卫星参数（ISS）
SAT_NAME = "ISS (ZARYA)"
SAT_LINE_1 = "1 25544U 98067A   26128.97347854  .00006654  00000+0  12812-3 0  9993"
SAT_LINE_2 = "2 25544  51.6310 134.2107 0007399  38.6382 321.5134 15.49152986565672"

# https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle


# 观测位置（北京）
OBSERVER_LAT = 36.660022
OBSERVER_LNG = 114.586981
OBSERVER_ALT = 0
TIME_ZONE = "Asia/Shanghai"

# 频率参数
TX_FREQ = 437.5
RX_FREQ = 145.8


def test_lol_api():
    print("=== 测试 /lol 接口 ===")
    url = f"{BASE_URL}/lol"
    test_uuid = str(uuid.uuid4())
    test_cache = "test_cache_data"

    # 设置缓存
    res0 = requests.post(url, json={"func": 0, "uuid": test_uuid, "cache": test_cache})
    print(f"设置缓存 | 状态码：{res0.status_code} | 响应：{res0.text}")

    # 获取缓存
    res1 = requests.post(url, json={"func": 1, "uuid": test_uuid})
    print(f"获取缓存 | 状态码：{res1.status_code} | 响应：{res1.text}")
    print("=== /lol 测试完成 ===\n")


def test_pass_api():
    print("=== 测试 /pass 接口 ===")
    url = f"{BASE_URL}/pass"
    payload = {
        "sat": SAT_NAME,
        "sat_line_1": SAT_LINE_1,
        "sat_line_2": SAT_LINE_2,
        "lat": OBSERVER_LAT,
        "lng": OBSERVER_LNG,
        "alt": OBSERVER_ALT,
        "tz": TIME_ZONE
    }

    response = requests.post(url, json=payload)
    print(f"状态码：{response.status_code}")
    print(f"响应数据：{response.json()}\n")

    data = response.json()
    pass_time = data.get("pass_times", [])[0] if data.get("pass_times") else None
    departure_time = data.get("departure_times", [])[0] if data.get("departure_times") else None

    print(f"取第一个过境时间：{pass_time}")
    print(f"取第一个离境时间：{departure_time}")
    print("=== /pass 测试完成 ===\n")
    return pass_time, departure_time


def test_doppler_api(pass_time, departure_time):
    print("=== 测试 /doppler 接口 ===")
    if not pass_time or not departure_time:
        print("无有效时间，跳过测试")
        return

    url = f"{BASE_URL}/doppler"
    payload = {
        "sat": SAT_NAME,
        "sat_line_1": SAT_LINE_1,
        "sat_line_2": SAT_LINE_2,
        "lat": OBSERVER_LAT,
        "lng": OBSERVER_LNG,
        "alt": OBSERVER_ALT,
        "tx": TX_FREQ,
        "rx": RX_FREQ,
        "tz": TIME_ZONE,
        "pass_time": pass_time,
        "departure_time": departure_time
    }

    # 🚀 打印完整请求参数（关键调试信息）
    print("请求参数：")
    for k, v in payload.items():
        print(f"  {k}: {v}")

    try:
        response = requests.post(url, json=payload, timeout=30)
        # 🚀 打印完整响应（包括错误）
        print(f"状态码：{response.status_code}")
        print(f"响应内容：{response.text}")
        response.raise_for_status()
        print("/doppler 接口测试通过！")
    except requests.exceptions.HTTPError as e:
        print(f"HTTP 错误：{e}")
    except Exception as e:
        print(f"未知错误：{e}")
    print("=== /doppler 测试结束 ===\n")


if __name__ == "__main__":
    test_lol_api()
    pass_t, dep_t = test_pass_api()
    test_doppler_api(pass_t, dep_t)