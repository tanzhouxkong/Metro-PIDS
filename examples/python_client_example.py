#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Metro-PIDS Python 客户端完整示例

使用方法:
1. 确保已重新启用 HTTP API 服务器（见 API_DOCUMENTATION.md）
2. 启动 Metro-PIDS 应用
3. 运行此脚本: python examples/python_client_example.py

依赖:
    pip install requests
"""

import sys
import os
import json
import time

# 添加当前目录到路径，以便导入 metro_pids_client
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from metro_pids_client import MetroPIDSClient
except ImportError:
    print("❌ 无法导入 metro_pids_client")
    print("请确保 metro_pids_client.py 文件在同一目录下")
    sys.exit(1)


def main():
    """主函数"""
    # 创建客户端
    client = MetroPIDSClient()
    
    # 检查连接
    print("正在连接到 Metro-PIDS API...")
    try:
        info = client.get_info()
        print("✅ 已连接到 Metro-PIDS API")
        print(f"   API 名称: {info.get('name', 'N/A')}")
        print(f"   API 版本: {info.get('version', 'N/A')}")
        print(f"   可用端点: {len(info.get('endpoints', []))} 个")
    except Exception as e:
        print(f"❌ 无法连接到 Metro-PIDS API: {e}")
        print("\n请确保:")
        print("1. Metro-PIDS 应用正在运行")
        print("2. 已重新启用 HTTP API 服务器（见 API_DOCUMENTATION.md）")
        print("3. API 服务器端口为 9001（或已设置 DISPLAY_API_PORT 环境变量）")
        print("\n如何重新启用 HTTP API 服务器:")
        print("1. 打开 main.js 文件")
        print("2. 取消 displayApiServer 相关的注释")
        print("3. 取消 app.whenReady() 中启动 API 服务器的注释")
        print("4. 重启 Metro-PIDS 应用")
        sys.exit(1)
    
    # 获取当前状态
    print("\n" + "="*50)
    print("当前状态")
    print("="*50)
    try:
        status = client.get_status()
        print(f"已打开的显示器: {status['count']} 个")
        if status.get('displays'):
            for display in status['displays']:
                print(f"  - {display['id']}: {display['width']}x{display['height']} "
                      f"位置({display['x']}, {display['y']})")
        else:
            print("  (无打开的显示器)")
    except Exception as e:
        print(f"⚠️ 获取显示器状态失败: {e}")
    
    # 获取站点信息
    print("\n" + "="*50)
    print("站点信息")
    print("="*50)
    try:
        stations_data = client.get_stations()
        if stations_data.get('ok'):
            print(f"当前线路: {stations_data.get('lineName', 'N/A')}")
            print(f"方向: {stations_data.get('direction', 'N/A')}")
            print(f"车次号: {stations_data.get('trainNumber', 'N/A')}")
            print(f"站点数量: {len(stations_data.get('stations', []))}")
            print(f"当前站点索引: {stations_data.get('currentIdx', 0)}")
            state_text = '到达' if stations_data.get('currentState') == 0 else '发车'
            print(f"当前状态: {state_text}")
            
            # 显示前几个站点
            stations = stations_data.get('stations', [])
            if stations:
                print("\n站点列表（前5个）:")
                for i, station in enumerate(stations[:5]):
                    marker = " <-- 当前" if i == stations_data.get('currentIdx', -1) else ""
                    print(f"  {i}. {station.get('name', 'N/A')}{marker}")
        else:
            print("⚠️ 当前没有线路数据")
    except Exception as e:
        print(f"⚠️ 获取站点信息失败: {e}")
    
    # 演示控制命令
    print("\n" + "="*50)
    print("控制命令演示")
    print("="*50)
    print("发送控制命令（每个命令间隔0.5秒）...")
    
    commands = [
        ('next', '下一站'),
        ('prev', '上一站'),
        ('arrive', '到达'),
        ('depart', '发车')
    ]
    
    for cmd, desc in commands:
        try:
            result = client.send_command(cmd)
            if result.get('ok'):
                print(f"✅ {desc} ({cmd}): {result.get('message', '成功')}")
            else:
                print(f"⚠️ {desc} ({cmd}): {result.get('error', '未知错误')}")
            time.sleep(0.5)  # 避免命令发送过快
        except Exception as e:
            print(f"❌ {desc} ({cmd}): {e}")
    
    # 同步数据示例（可选）
    print("\n" + "="*50)
    print("数据同步示例")
    print("="*50)
    print("提示: 以下代码演示如何同步数据，但不会实际执行")
    print("如需执行，请取消注释相关代码")
    
    example_app_data = {
        "lineName": "测试线路",
        "direction": "up",
        "trainNumber": "T001",
        "stations": [
            {"name": "站点1", "dock": "both", "en": "Station 1"},
            {"name": "站点2", "dock": "both", "en": "Station 2"},
            {"name": "站点3", "dock": "both", "en": "Station 3"}
        ],
        "meta": {
            "lineName": "测试线路",
            "dirType": "up"
        }
    }
    
    example_rt_state = {
        "idx": 0,
        "state": 0  # 0: 到达, 1: 发车
    }
    
    print("\n示例数据:")
    print(json.dumps({
        "appData": example_app_data,
        "rtState": example_rt_state
    }, indent=2, ensure_ascii=False))
    
    # 取消下面的注释以实际执行同步
    # try:
    #     sync_result = client.sync_data(example_app_data, example_rt_state)
    #     if sync_result.get('ok'):
    #         print(f"\n✅ 数据同步成功: {sync_result.get('message', '')}")
    #     else:
    #         print(f"\n⚠️ 数据同步失败: {sync_result.get('error', '未知错误')}")
    # except Exception as e:
    #     print(f"\n❌ 数据同步失败: {e}")
    
    print("\n" + "="*50)
    print("✅ 示例完成")
    print("="*50)


if __name__ == "__main__":
    main()
