import requests
import json

# 基础配置
BASE_URL = "http://127.0.0.1:5000"
HEADERS = {"Content-Type": "application/json"}

def test_lol_api():
    """独立测试 /lol 缓存接口"""
    print("=== 独立测试 /lol 接口 ===")
    
    # 1. 设置缓存
    set_data = {
        "func": 0,
        "uuid": "test_uuid_123",
        "cache": "test_cache_content"
    }
    set_res = requests.post(f"{BASE_URL}/lol", headers=HEADERS, data=json.dumps(set_data))
    print(f"设置缓存 | 状态码：{set_res.status_code} | 结果：{set_res.json()}")

    # 2. 获取缓存
    get_data = {
        "func": 1,
        "uuid": "test_uuid_123"
    }
    get_res = requests.post(f"{BASE_URL}/lol", headers=HEADERS, data=json.dumps(get_data))
    print(f"获取缓存 | 状态码：{get_res.status_code} | 结果：{get_res.json()}")

if __name__ == "__main__":
    test_lol_api()