# Metro-PIDS 显示器控制 API 文档

## ⚠️ 重要变更

**HTTP API 服务器已弃用，现在使用 BroadcastChannel 进行通信。**

BroadcastChannel 是更可靠的方案，具有以下优势：
- ✅ **无需 HTTP 服务器**：避免端口占用、防火墙等问题
- ✅ **更快速**：浏览器原生 API，性能更好
- ✅ **更简单**：无需检查 API 可用性，直接使用广播通信
- ✅ **跨窗口通信**：在同一浏览器/Electron 环境中，可以跨窗口通信

## 概述

Metro-PIDS 使用 **BroadcastChannel** 进行主程序与第三方显示器之间的通信。频道名称为 `metro_pids_v3`。

## 通信方式

### BroadcastChannel

Metro-PIDS 使用 **BroadcastChannel** 作为主要通信机制，频道名称为 `metro_pids_v3`。如果浏览器不支持 BroadcastChannel，会自动回退到 `window.postMessage`。

### 消息格式

主程序发送的消息格式如下：

```javascript
{
  t: 'SYNC',        // 消息类型：'SYNC' | 'CMD_KEY' | 'REC_START' | 'REC_STOP' | 'REQ'
  d: appData,       // 应用数据（当 t === 'SYNC' 时）
  r: rtState,       // 实时状态（当 t === 'SYNC' 时，可选）
  command: 'next',  // 命令类型（当 t === 'CMD_KEY' 时，推荐使用）：'next' | 'prev' | 'arrive' | 'depart'
  code: 'ArrowRight', // 按键代码（当 t === 'CMD_KEY' 时，向后兼容）
  key: 'ArrowRight', // 按键名称（当 t === 'CMD_KEY' 时，向后兼容）
  bps: 800000       // 比特率（当 t === 'REC_START' 时）
}
```

### 消息类型说明

- **`SYNC`**: 同步数据消息，包含完整的 PIDS 应用数据和实时状态
- **`CMD_KEY`**: 控制命令消息，支持三种格式：
  - **按键格式**（推荐，支持自定义快捷键）：发送 `{ t: 'CMD_KEY', code: 'ArrowRight', key: 'ArrowRight', normCode, normKey }`，主程序会检查是否与用户配置的快捷键匹配。这是 `installKeyboardHandler()` 自动发送的格式。
  - **命令格式**（语义化命令，不依赖快捷键）：发送 `{ t: 'CMD_KEY', command: 'next' }`，主程序直接执行对应操作，不依赖用户快捷键配置
  - **按键格式（向后兼容）**：发送 `{ t: 'CMD_KEY', code: 'ArrowRight', key: 'ArrowRight' }`，主程序会检查是否与用户配置的快捷键匹配
- **`REC_START`**: 开始录制消息
- **`REC_STOP`**: 停止录制消息
- **`REQ`**: 请求数据消息（显示端启动时发送，请求主程序同步数据）

## 第三方显示器实现

### 基本实现

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>第三方显示器</title>
</head>
<body>
  <div id="display-content"></div>
  
  <script>
    // 创建 BroadcastChannel
    const channelName = 'metro_pids_v3';
    let bc = null;
    
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel(channelName);
        console.log('BroadcastChannel 已创建:', channelName);
      } catch (e) {
        console.warn('BroadcastChannel 创建失败:', e);
      }
    }
    
    // 处理消息
    function handleMessage(data) {
      if (!data || !data.t) return;
      
      switch (data.t) {
        case 'SYNC':
          // 接收到同步数据
          const appData = data.d;      // 应用数据
          const rtState = data.r;      // 实时状态
          
          console.log('收到同步数据:', appData);
          console.log('实时状态:', rtState);
          
          // 更新显示内容
          updateDisplay(appData, rtState);
          break;
          
        case 'CMD_KEY':
          // 接收到控制命令
          if (data.command) {
            // 命令格式（推荐）
            console.log('收到控制命令:', data.command);
            handleControlCommand(data.command);
          } else {
            // 按键格式（向后兼容）
            console.log('收到按键命令:', data.code);
            handleControlCommand(data.code);
          }
          break;
          
        case 'REC_START':
          console.log('开始录制，比特率:', data.bps);
          break;
          
        case 'REC_STOP':
          console.log('停止录制');
          break;
      }
    }
    
    // 更新显示内容
    function updateDisplay(appData, rtState) {
      const content = document.getElementById('display-content');
      // 根据 appData 和 rtState 更新显示内容
      // ...
    }
    
    // 处理控制命令
    function handleControlCommand(command) {
      // 根据命令执行相应操作
      // command 可能是命令格式（'next', 'prev', 'arrive', 'depart'）
      // 或按键格式（向后兼容）
      // ...
    }
    
    // 监听消息
    if (bc) {
      bc.addEventListener('message', (event) => {
        handleMessage(event.data);
      });
      
      // 显示端启动时，请求主程序同步数据
      bc.postMessage({ t: 'REQ' });
    }
  </script>
</body>
</html>
```

### 发送控制命令

第三方显示器可以通过 BroadcastChannel 发送控制命令到主程序。有两种方式：

#### 方式一：使用 SDK 的键盘事件处理器（推荐，支持自定义快捷键）

**这是最推荐的方式**，与显示器1的处理方式完全一致。第三方显示器只需要安装键盘事件处理器，主程序会根据用户配置的快捷键自动匹配并执行对应操作。

```javascript
// 使用 SDK（推荐）
import { createDisplaySdk } from '../src/utils/displaySdk.js';

const sdk = createDisplaySdk({ channelName: 'metro_pids_v3' });

// 安装键盘事件处理器（类似显示器1的处理方式）
// 主程序会根据用户配置的快捷键自动匹配并执行对应操作
sdk.installKeyboardHandler();

// 这样，用户在第三方显示器上按任何键，都会发送到主程序
// 主程序会检查该按键是否与用户配置的快捷键匹配
// 如果匹配，则执行对应操作（下一站/上一站/到达发车）
```

**工作原理：**
- 第三方显示器安装键盘事件处理器后，会自动监听键盘事件
- 当用户按下按键时，SDK 会发送按键信息（`code`, `key`, `normCode`, `normKey`）到主程序
- 主程序收到按键信息后，会检查是否与用户配置的快捷键匹配
- 如果匹配，则执行对应操作（下一站/上一站/到达发车）
- **完全支持用户自定义快捷键**，与显示器1的行为完全一致

#### 方式二：手动发送命令（语义化命令，不依赖快捷键）

如果不想使用键盘事件处理器，也可以手动发送语义化命令。这种方式不依赖用户快捷键配置。

```javascript
// 发送控制命令（使用命令格式）
function sendCommand(command) {
  // 直接发送命令格式，主程序会根据用户配置的快捷键自动执行对应操作
  // 支持的命令：'next'（下一站）、'prev'（上一站）、'arrive'（到达）、'depart'（发车）
  if (bc) {
    try {
      bc.postMessage({
        t: 'CMD_KEY',
        command: command  // 'next' | 'prev' | 'arrive' | 'depart'
      });
      console.log('✅ 控制命令已通过广播发送:', command);
      return true;
    } catch (e) {
      console.warn('❌ 广播发送命令失败:', e);
      return false;
    }
  } else {
    console.warn('❌ BroadcastChannel 不可用，无法发送控制命令');
    return false;
  }
}

// 使用示例
sendCommand('next');    // 下一站（无论用户配置的快捷键是什么，都会执行下一站操作）
sendCommand('prev');    // 上一站
sendCommand('arrive');  // 到达（进站/出站切换）
sendCommand('depart');  // 发车（进站/出站切换，与 arrive 相同）
```

**工作原理：**
- 第三方显示器发送命令格式（如 `{ t: 'CMD_KEY', command: 'next' }`）
- 主程序收到命令后，直接执行对应的操作（如 `move(getStep())`）
- **不依赖用户快捷键配置**，命令是语义化的，确保第三方显示器始终能正常工作

#### 方式三：手动发送按键信息（向后兼容）

如果发送的是按键格式（如 `{ t: 'CMD_KEY', code: 'ArrowRight' }`），主程序会检查该按键是否与用户配置的快捷键匹配。如果匹配，则执行对应操作；如果不匹配，则不执行（确保只有用户配置的快捷键才能触发操作）。

```javascript
// 使用 SDK 的 sendKeyEvent 方法
import { createDisplaySdk } from '../src/utils/displaySdk.js';

const sdk = createDisplaySdk({ channelName: 'metro_pids_v3' });

// 手动发送按键信息
sdk.sendKeyEvent('ArrowRight', 'ArrowRight');  // 发送右箭头键
```

**总结：**
- **推荐使用方式一**（`installKeyboardHandler`）：与显示器1完全一致，支持用户自定义快捷键
- 方式二（语义化命令）：适合程序化控制，不依赖快捷键
- 方式三（手动发送按键）：向后兼容，但需要手动处理键盘事件

### 请求数据同步

第三方显示器启动时，可以通过发送 `REQ` 消息请求主程序同步数据：

```javascript
// 请求数据同步
function requestDataSync() {
  if (bc) {
    try {
      bc.postMessage({ t: 'REQ' });
      console.log('✅ 已通过广播请求数据同步');
      return true;
    } catch (e) {
      console.warn('❌ 广播请求数据失败:', e);
      return false;
    }
  } else {
    console.warn('❌ BroadcastChannel 不可用，无法请求数据');
    return false;
  }
}

// 在初始化时调用
requestDataSync();
```

## 完整示例

请参考以下示例文件：
- **`examples/third-party-display-template.html`** - 完整的第三方显示器实现示例
- **`examples/display-with-station-calculator.html`** - 使用站点计算 API 和键盘事件处理器的完整示例（推荐）

## 数据格式

### appData（应用数据）

```javascript
{
  stations: [
    {
      name: '站点名称',
      dock: 'up',        // 'up' | 'down' | 'both'
      // ... 其他站点属性
    },
    // ...
  ],
  lineName: '线路名称',
  direction: 'up',      // 'up' | 'down'
  trainNumber: '车次号',
  meta: {
    dirType: 'up',      // 'up' | 'down'
    // ... 其他元数据
  }
}
```

### rtState（实时状态）

```javascript
{
  idx: 0,               // 当前站点索引
  state: 0             // 0: 到达, 1: 发车
}
```

## 站点计算 API

Metro-PIDS 提供了站点计算 API，用于处理复杂的站点逻辑（如短交路、暂缓停靠、大战车、直达车等）。

### JavaScript 使用

如果您的第三方显示器与 Metro-PIDS 主程序在同一项目中，可以使用 ES6 模块导入：

```javascript
import {
  getFilteredStations,
  calculateDisplayStationInfo,
  isSkippedByService,
  getNextValidSt,
  calculateNextStationIndex
} from '../src/utils/displayStationCalculator.js';

// 显示器配置
const displayConfig = {
  filterByDirection: true,  // 是否根据方向过滤站点（dock限制）
  reverseOnDown: true       // 下行方向时是否反转站点顺序
};

// 使用示例
const stationInfo = calculateDisplayStationInfo(appData, rtState, displayConfig);
const filteredStations = getFilteredStations(appData, appData.meta?.dirType, displayConfig);
```

### Python 使用

由于 BroadcastChannel 是浏览器 API，Python 无法直接使用。Python 客户端可以通过以下方式与 Metro-PIDS 通信：

#### 方案一：使用 HTTP API（推荐）

如果您需要 Python 支持，可以重新启用 HTTP API 服务器（见下方说明），然后使用以下 Python 客户端：

```python
import requests
import json
from typing import Optional, Dict, Any

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
        """获取 API 信息"""
        try:
            response = self.session.get(f"{self.api_base}/api/display/info")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"获取 API 信息失败: {e}")
    
    def get_status(self) -> Dict[str, Any]:
        """获取显示器状态"""
        try:
            response = self.session.get(f"{self.api_base}/api/display/status")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"获取显示器状态失败: {e}")
    
    def get_stations(self) -> Dict[str, Any]:
        """获取站点列表"""
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
                    - 'next': 下一站
                    - 'prev': 上一站
                    - 'arrive': 到达（进站/出站切换）
                    - 'depart': 发车（进站/出站切换，与 arrive 相同）
                    - 'key': 自定义按键（需要提供 key_code）
            key_code: 自定义按键代码（当 command='key' 时必需）
        
        注意：推荐使用命令格式（'next', 'prev', 'arrive', 'depart'），
        这样无论用户如何配置快捷键，命令都能正常工作。
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
        """打开显示器"""
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
        """关闭显示器（不传 display_id 则关闭所有）"""
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


# 使用示例
if __name__ == "__main__":
    # 创建客户端
    client = MetroPIDSClient()
    
    # 检查 API 是否可用
    try:
        info = client.get_info()
        print("API 信息:", json.dumps(info, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"❌ API 不可用: {e}")
        print("提示: 请确保已重新启用 HTTP API 服务器（见文档说明）")
        exit(1)
    
    # 获取显示器状态
    status = client.get_status()
    print(f"显示器状态: {status['count']} 个显示器已打开")
    
    # 获取站点列表
    stations_data = client.get_stations()
    print(f"当前线路: {stations_data.get('lineName', 'N/A')}")
    print(f"站点数量: {len(stations_data.get('stations', []))}")
    print(f"当前站点索引: {stations_data.get('currentIdx', 0)}")
    
    # 发送控制命令
    print("\n发送控制命令...")
    # 推荐使用命令格式，这样无论用户如何配置快捷键，命令都能正常工作
    result = client.send_command('next')  # 下一站
    print(f"命令结果: {result}")
    
    # 其他命令示例
    client.send_command('prev')    # 上一站
    client.send_command('arrive')  # 到达（进站/出站切换）
    client.send_command('depart')  # 发车（进站/出站切换）
    
    # 同步数据示例
    app_data = {
        "lineName": "测试线路",
        "direction": "up",
        "trainNumber": "T001",
        "stations": [
            {"name": "站点1", "dock": "both"},
            {"name": "站点2", "dock": "both"},
            {"name": "站点3", "dock": "both"}
        ],
        "meta": {
            "lineName": "测试线路",
            "dirType": "up"
        }
    }
    rt_state = {
        "idx": 0,
        "state": 0  # 0: 到达, 1: 发车
    }
    
    sync_result = client.sync_data(app_data, rt_state)
    print(f"同步结果: {sync_result}")
```

#### 方案二：使用文件系统监控（适用于本地开发）

如果您的 Python 程序与 Metro-PIDS 在同一台机器上运行，可以通过监控文件系统来获取数据：

```python
import json
import time
import os
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class MetroPIDSFileWatcher(FileSystemEventHandler):
    """监控 Metro-PIDS 数据文件的变更"""
    
    def __init__(self, data_file: str, callback):
        """
        Args:
            data_file: 数据文件路径（例如：主程序的 localStorage 导出文件）
            callback: 数据变更时的回调函数
        """
        self.data_file = Path(data_file)
        self.callback = callback
        self.last_modified = 0
    
    def on_modified(self, event):
        if event.src_path == str(self.data_file):
            self.load_data()
    
    def load_data(self):
        """加载数据文件"""
        try:
            if not self.data_file.exists():
                return
            
            mtime = self.data_file.stat().st_mtime
            if mtime <= self.last_modified:
                return
            
            self.last_modified = mtime
            
            with open(self.data_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.callback(data)
        except Exception as e:
            print(f"加载数据失败: {e}")
    
    def start(self):
        """开始监控"""
        if not self.data_file.parent.exists():
            print(f"警告: 数据文件目录不存在: {self.data_file.parent}")
            return
        
        observer = Observer()
        observer.schedule(self, str(self.data_file.parent), recursive=False)
        observer.start()
        
        # 立即加载一次
        self.load_data()
        
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            observer.stop()
        observer.join()


# 使用示例
def on_data_changed(data):
    """数据变更回调"""
    print("数据已更新:")
    print(json.dumps(data, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    # 注意：需要根据实际情况设置数据文件路径
    # 例如：主程序导出的 JSON 文件路径
    data_file = "path/to/metro-pids-data.json"
    
    watcher = MetroPIDSFileWatcher(data_file, on_data_changed)
    watcher.start()
```

#### 安装依赖

```bash
# 方案一：HTTP API 客户端
pip install requests

# 方案二：文件系统监控
pip install watchdog
```

#### 重新启用 HTTP API 服务器

如果使用方案一（HTTP API），需要重新启用 API 服务器：

1. 打开 `main.js` 文件
2. 找到以下代码并取消注释：
   ```javascript
   // 取消这行的注释
   let displayApiServer = null;
   try {
     const apiServerModule = require('./scripts/display-api-server.js');
     displayApiServer = apiServerModule.createDisplayApiServer();
   } catch (e) {
     console.warn('[main] 无法加载显示器控制API服务器:', e);
   }
   ```
3. 找到 `app.whenReady()` 中的 API 服务器启动代码并取消注释
4. 重启 Metro-PIDS 应用

#### 完整 Python 示例脚本

创建一个完整的 Python 示例脚本 `examples/python_client_example.py`：

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Metro-PIDS Python 客户端示例

使用方法:
1. 确保已重新启用 HTTP API 服务器（见 API_DOCUMENTATION.md）
2. 启动 Metro-PIDS 应用
3. 运行此脚本: python examples/python_client_example.py
"""

import sys
import time
from metro_pids_client import MetroPIDSClient

def main():
    # 创建客户端
    client = MetroPIDSClient()
    
    # 检查连接
    try:
        info = client.get_info()
        print("✅ 已连接到 Metro-PIDS API")
        print(f"API 版本: {info.get('version', 'N/A')}")
    except Exception as e:
        print(f"❌ 无法连接到 Metro-PIDS API: {e}")
        print("\n请确保:")
        print("1. Metro-PIDS 应用正在运行")
        print("2. 已重新启用 HTTP API 服务器（见 API_DOCUMENTATION.md）")
        print("3. API 服务器端口为 9001（或已设置 DISPLAY_API_PORT 环境变量）")
        sys.exit(1)
    
    # 获取当前状态
    print("\n=== 当前状态 ===")
    status = client.get_status()
    print(f"已打开的显示器: {status['count']} 个")
    
    stations_data = client.get_stations()
    if stations_data.get('ok'):
        print(f"当前线路: {stations_data.get('lineName', 'N/A')}")
        print(f"站点数量: {len(stations_data.get('stations', []))}")
        print(f"当前站点索引: {stations_data.get('currentIdx', 0)}")
        print(f"当前状态: {'到达' if stations_data.get('currentState') == 0 else '发车'}")
    
    # 演示控制命令
    print("\n=== 发送控制命令 ===")
    commands = ['next', 'prev', 'arrive', 'depart']
    for cmd in commands:
        try:
            result = client.send_command(cmd)
            print(f"✅ {cmd}: {result.get('message', '成功')}")
            time.sleep(0.5)  # 避免命令发送过快
        except Exception as e:
            print(f"❌ {cmd}: {e}")
    
    print("\n✅ 示例完成")

if __name__ == "__main__":
    main()
```

## 迁移指南

如果您之前使用 HTTP API，现在需要迁移到 BroadcastChannel：

### 1. 移除 HTTP API 调用

**之前（HTTP API）：**
```javascript
// 获取站点列表
const response = await fetch('http://localhost:9001/api/display/stations');
const data = await response.json();

// 发送控制命令
await fetch('http://localhost:9001/api/display/control', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ command: 'next' })
});
```

**现在（BroadcastChannel）：**
```javascript
// 通过 BroadcastChannel 接收数据（自动接收 SYNC 消息）
bc.addEventListener('message', (event) => {
  if (event.data.t === 'SYNC') {
    const appData = event.data.d;
    const rtState = event.data.r;
    // 使用数据更新显示
  }
});

// 发送控制命令（推荐：使用命令格式）
bc.postMessage({
  t: 'CMD_KEY',
  command: 'next'  // 'next' | 'prev' | 'arrive' | 'depart'
});

// 或使用按键格式（向后兼容，会检查是否与用户配置的快捷键匹配）
bc.postMessage({
  t: 'CMD_KEY',
  code: 'ArrowRight',
  key: 'ArrowRight'
});
```

### 2. 移除 API 可用性检查

**之前：**
```javascript
async function checkApiAvailability() {
  try {
    const response = await fetch('http://localhost:9001/api/display/info');
    return response.ok;
  } catch (e) {
    return false;
  }
}
```

**现在：**
```javascript
// 无需检查，BroadcastChannel 始终可用（如果浏览器支持）
if (typeof BroadcastChannel !== 'undefined') {
  const bc = new BroadcastChannel('metro_pids_v3');
  // BroadcastChannel 已就绪
}
```

## 常见问题

### 1. BroadcastChannel 不可用怎么办？

如果浏览器不支持 BroadcastChannel，Metro-PIDS 会自动回退到 `window.postMessage`。您也可以手动实现回退：

```javascript
let bc = null;
if (typeof BroadcastChannel !== 'undefined') {
  bc = new BroadcastChannel('metro_pids_v3');
} else {
  // 使用 window.postMessage 作为回退
  window.addEventListener('message', (event) => {
    if (event.data && event.data.t) {
      handleMessage(event.data);
    }
  });
}
```

### 2. 如何调试 BroadcastChannel 消息？

在浏览器开发者工具的控制台中，您可以监听 BroadcastChannel 消息：

```javascript
const bc = new BroadcastChannel('metro_pids_v3');
bc.addEventListener('message', (event) => {
  console.log('收到消息:', event.data);
});
```

### 3. 第三方显示器与主程序不在同一台机器上怎么办？

BroadcastChannel 只能在同一个浏览器/Electron 实例中使用。如果第三方显示器与主程序不在同一台机器上，您需要：

1. 使用 WebSocket 进行跨机器通信
2. 使用 HTTP API（需要重新启用，见下方说明）
3. 使用其他跨网络通信方案

### 4. 如何重新启用 HTTP API 服务器？

如果您需要 HTTP API 服务器（例如用于跨机器通信），可以：

1. 在 `main.js` 中取消 `displayApiServer` 相关的注释
2. 取消 `app.whenReady()` 中启动 API 服务器的注释
3. 重启应用

注意：HTTP API 服务器代码已保留在 `scripts/display-api-server.js` 中，但默认已禁用。

## Python 客户端文件

项目提供了完整的 Python 客户端实现：

- **`examples/metro_pids_client.py`** - Python 客户端类库
- **`examples/python_client_example.py`** - 完整的使用示例

### 快速开始

1. **安装依赖**：
   ```bash
   pip install requests
   ```

2. **重新启用 HTTP API 服务器**（见上方说明）

3. **使用客户端**：
   ```python
   from metro_pids_client import MetroPIDSClient
   
   client = MetroPIDSClient()
   status = client.get_status()
   stations = client.get_stations()
   client.send_command('next')
   ```

4. **运行示例**：
   ```bash
   python examples/python_client_example.py
   ```

## 参考

- [BroadcastChannel API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)
- [examples/third-party-display-template.html](../examples/third-party-display-template.html) - 完整的第三方显示器实现示例
- [examples/display-with-station-calculator.html](../examples/display-with-station-calculator.html) - 使用站点计算 API 和键盘事件处理器的完整示例（推荐）
- [examples/display-sdk-demo.html](../examples/display-sdk-demo.html) - Display SDK 使用示例
- [examples/metro_pids_client.py](../examples/metro_pids_client.py) - Python 客户端类库
- [examples/python_client_example.py](../examples/python_client_example.py) - Python 使用示例
