/**
 * Display-3 出站页面数据提供示例
 * 展示如何向display-3发送出站指示数据
 * 
 * 使用方式:
 * 1. 从main.js中的display-3窗口发送消息
 * 2. 或使用BroadcastChannel在不同窗口间通信
 */

// 示例1: 北京地铁10号线在公主坡站的出站数据
const exitDataExample1 = {
  t: 'EXIT_DATA',
  d: {
    line: '10',
    direction: 'inner',  // '内循' 或 '外循'
    nextStation: {
      name: '公主坡',
      nameEn: 'Gongzhufen'
    },
    transfers: [
      '1号线'
    ],
    stations: [
      {
        name: '莲花桥',
        nameEn: 'Lianhuaqiao'
      },
      {
        name: '公主坡',
        nameEn: 'Gongzhufen'
      },
      {
        name: '西钓鱼台',
        nameEn: 'Xidiayoutai'
      }
    ],
    currentStationIndex: 1,  // 当前站在stations数组中的索引
    exitGuide: {
      cn: '本侧开门',
      en: 'Please exit from this door'
    }
  }
};

// 示例2: 北京地铁2号线在复兴门站的出站数据
const exitDataExample2 = {
  t: 'EXIT_DATA',
  d: {
    line: '2',
    direction: 'inner',
    nextStation: {
      name: '和平门',
      nameEn: 'Hepingmen'
    },
    transfers: [
      '4号线',
      '6号线'
    ],
    stations: [
      {
        name: '长椅',
        nameEn: 'Changing Street'
      },
      {
        name: '复兴门',
        nameEn: 'Fuxingmen'
      },
      {
        name: '和平门',
        nameEn: 'Hepingmen'
      }
    ],
    currentStationIndex: 1,
    exitGuide: {
      cn: '右侧开门',
      en: 'Right side doors open'
    }
  }
};

/**
 * 从main.js中的display-3窗口发送数据的方法:
 * 
 * const display3Window = getDisplay3Window();  // 获取display-3窗口对象
 * 
 * // 方法1: 使用BroadcastChannel
 * const bc = new BroadcastChannel('metro_pids_v3');
 * bc.postMessage(exitDataExample1);
 * 
 * // 方法2: 使用postMessage (如果display3Window有effectiveAccess)
 * display3Window.webContents.send('display:exit-data', exitDataExample1.d);
 * 
 * // 或通过事件监听器处理
 * ipcMain.handle('display:get-exit-data', (event) => {
 *   return exitDataExample1.d;
 * });
 */

// 导出示例数据
export { exitDataExample1, exitDataExample2 };

/**
 * 数据格式说明:
 * 
 * t (string): 消息类型，固定为 'EXIT_DATA'
 * d (object): 数据对象，包含:
 *   - line (string): 线路号，如 '10', '2' 等
 *   - direction (string): 循环方向，'inner' 表示内环，'outer' 表示外环
 *   - nextStation (object): 下一站信息
 *     - name (string): 站名(中文)
 *     - nameEn (string): 站名(英文)
 *   - transfers (array): 换乘线路数组，如 ['1号线', '2号线']
 *   - stations (array): 站点列表，包含要显示的站点
 *     - name (string): 站名(中文)
 *     - nameEn (string): 站名(英文)
 *   - currentStationIndex (number): 当前站在stations数组中的索引
 *   - exitGuide (object): 出门指引信息
 *     - cn (string): 中文文字，如 '本侧开门', '左侧开门', '右侧开门'
 *     - en (string): 英文文字，如 'Please exit from this door'
 */
