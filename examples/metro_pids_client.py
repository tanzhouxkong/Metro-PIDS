#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Metro-PIDS Python 客户端

使用方法:
1. 确保已重新启用 HTTP API 服务器（见 API_DOCUMENTATION.md）
2. 启动 Metro-PIDS 应用
3. 导入并使用此客户端

示例:
    from metro_pids_client import MetroPIDSClient
    
    client = MetroPIDSClient()
    status = client.get_status()
    stations = client.get_stations()
    client.send_command('next')
"""

import requests
from typing import Optional, Dict, Any, List


class MetroPIDSClient:
    """Metro-PIDS Python 客户端"""
    
    def __init__(self, api_base: str = "http://localhost:9001"):
        """
        初始化客户端
        
        Args:
            api_base: API 服务器地址（默认: http://localhost:9001）
        """
        self.api_base = api_base.rstrip('/')
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
    
    def get_info(self) -> Dict[str, Any]:
        """
        获取 API 信息
        
        Returns:
            API 信息字典，包含版本、端点列表等
        """
        try:
            response = self.session.get(f"{self.api_base}/api/display/info")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"获取 API 信息失败: {e}")
    
    def get_status(self) -> Dict[str, Any]:
        """
        获取显示器状态
        
        Returns:
            状态字典，包含已打开的显示器列表和数量
        """
        try:
            response = self.session.get(f"{self.api_base}/api/display/status")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"获取显示器状态失败: {e}")
    
    def get_stations(self) -> Dict[str, Any]:
        """
        获取站点列表
        
        Returns:
            站点数据字典，包含 stations, currentIdx, currentState 等
        """
        try:
            response = self.session.get(f"{self.api_base}/api/display/stations")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"获取站点列表失败: {e}")
    
    def sync_data(self, app_data: Dict[str, Any], rt_state: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        同步数据到显示器
        
        Args:
            app_data: 应用数据（包含 stations, lineName, direction 等）
            rt_state: 实时状态（可选，包含 idx, state 等）
        
        Returns:
            同步结果字典
        """
        try:
            payload = {
                "appData": app_data,
                "rtState": rt_state or {}
            }
            response = self.session.post(
                f"{self.api_base}/api/display/sync",
                json=payload
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"同步数据失败: {e}")
    
    def send_command(self, command: str, key_code: Optional[str] = None) -> Dict[str, Any]:
        """
        发送控制命令
        
        Args:
            command: 命令类型 ('next', 'prev', 'arrive', 'depart', 'key')
            key_code: 自定义按键代码（当 command='key' 时必需）
        
        Returns:
            命令执行结果字典
        
        Examples:
            client.send_command('next')      # 下一站
            client.send_command('prev')      # 上一站
            client.send_command('arrive')    # 到达
            client.send_command('depart')    # 发车
            client.send_command('key', 'F1') # 自定义按键
        """
        try:
            payload = {"command": command}
            if command == 'key' and key_code:
                payload["keyCode"] = key_code
            
            response = self.session.post(
                f"{self.api_base}/api/display/control",
                json=payload
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"发送命令失败: {e}")
    
    def open_display(self, display_id: str = "display-1", width: Optional[int] = None, height: Optional[int] = None) -> Dict[str, Any]:
        """
        打开显示器
        
        Args:
            display_id: 显示器 ID（默认: "display-1"）
            width: 窗口宽度（可选）
            height: 窗口高度（可选）
        
        Returns:
            打开结果字典
        """
        try:
            payload = {"displayId": display_id}
            if width:
                payload["width"] = width
            if height:
                payload["height"] = height
            
            response = self.session.post(
                f"{self.api_base}/api/display/open",
                json=payload
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"打开显示器失败: {e}")
    
    def close_display(self, display_id: Optional[str] = None) -> Dict[str, Any]:
        """
        关闭显示器
        
        Args:
            display_id: 显示器 ID（可选，不传则关闭所有显示器）
        
        Returns:
            关闭结果字典
        """
        try:
            payload = {}
            if display_id:
                payload["displayId"] = display_id
            
            response = self.session.post(
                f"{self.api_base}/api/display/close",
                json=payload
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"关闭显示器失败: {e}")
    
    def edit_display(self, display_id: str, display_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        编辑显示端配置
        
        Args:
            display_id: 显示器 ID
            display_data: 显示端配置数据
        
        Returns:
            编辑结果字典
        """
        try:
            payload = {
                "displayId": display_id,
                "displayData": display_data
            }
            response = self.session.post(
                f"{self.api_base}/api/display/edit",
                json=payload
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"编辑显示端失败: {e}")


if __name__ == "__main__":
    # 示例用法
    import json
    import time
    
    # 创建客户端
    client = MetroPIDSClient()
    
    # 检查连接
    try:
        info = client.get_info()
        print("✅ 已连接到 Metro-PIDS API")
        print(f"API 版本: {info.get('version', 'N/A')}")
        print(f"可用端点: {len(info.get('endpoints', []))} 个")
    except Exception as e:
        print(f"❌ 无法连接到 Metro-PIDS API: {e}")
        print("\n请确保:")
        print("1. Metro-PIDS 应用正在运行")
        print("2. 已重新启用 HTTP API 服务器（见 API_DOCUMENTATION.md）")
        print("3. API 服务器端口为 9001（或已设置 DISPLAY_API_PORT 环境变量）")
        exit(1)
    
    # 获取当前状态
    print("\n=== 当前状态 ===")
    status = client.get_status()
    print(f"已打开的显示器: {status['count']} 个")
    if status.get('displays'):
        for display in status['displays']:
            print(f"  - {display['id']}: {display['width']}x{display['height']}")
    
    # 获取站点信息
    try:
        stations_data = client.get_stations()
        if stations_data.get('ok'):
            print(f"\n当前线路: {stations_data.get('lineName', 'N/A')}")
            print(f"站点数量: {len(stations_data.get('stations', []))}")
            print(f"当前站点索引: {stations_data.get('currentIdx', 0)}")
            state_text = '到达' if stations_data.get('currentState') == 0 else '发车'
            print(f"当前状态: {state_text}")
    except Exception as e:
        print(f"\n⚠️ 获取站点信息失败: {e}")
    
    # 演示控制命令
    print("\n=== 发送控制命令 ===")
    commands = [
        ('next', '下一站'),
        ('prev', '上一站'),
        ('arrive', '到达'),
        ('depart', '发车')
    ]
    for cmd, desc in commands:
        try:
            result = client.send_command(cmd)
            print(f"✅ {desc} ({cmd}): {result.get('message', '成功')}")
            time.sleep(0.5)  # 避免命令发送过快
        except Exception as e:
            print(f"❌ {desc} ({cmd}): {e}")
    
    print("\n✅ 示例完成")
