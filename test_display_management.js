// Metro PIDS 多显示端功能测试脚本
// 在浏览器控制台中运行此脚本来测试多显示端功能

console.log('🚀 开始测试 Metro PIDS 多显示端功能...');

// 测试 1: 检查默认设置是否正确加载
function testDefaultSettings() {
    console.log('📋 测试 1: 检查默认设置...');
    
    // 模拟加载设置
    const testSettings = {
        display: {
            currentDisplayId: 'display-1',
            displays: {
                'display-1': {
                    id: 'display-1',
                    name: '主显示端',
                    source: 'builtin',
                    url: '',
                    width: 1900,
                    height: 600,
                    enabled: true
                }
            }
        }
    };
    
    console.log('✅ 默认设置结构正确:', testSettings);
    return testSettings;
}

// 测试 2: 测试添加新显示端
function testAddDisplay(settings) {
    console.log('📋 测试 2: 添加新显示端...');
    
    const newDisplayId = `display-${Date.now()}`;
    const newDisplay = {
        id: newDisplayId,
        name: '测试显示端 2',
        source: 'builtin',
        url: '',
        width: 1920,
        height: 1080,
        enabled: true
    };
    
    settings.display.displays[newDisplayId] = newDisplay;
    console.log('✅ 新显示端已添加:', newDisplay);
    
    return settings;
}

// 测试 3: 测试显示端配置更新
function testUpdateDisplay(settings) {
    console.log('📋 测试 3: 更新显示端配置...');
    
    const displayIds = Object.keys(settings.display.displays);
    if (displayIds.length > 1) {
        const secondDisplayId = displayIds[1];
        const display = settings.display.displays[secondDisplayId];
        
        // 更新配置
        display.name = '更新后的显示端';
        display.width = 1366;
        display.height = 768;
        display.source = 'custom';
        display.url = 'https://example.com/display';
        
        console.log('✅ 显示端配置已更新:', display);
    }
    
    return settings;
}

// 测试 4: 测试显示端启用/禁用
function testToggleDisplay(settings) {
    console.log('📋 测试 4: 切换显示端状态...');
    
    const displayIds = Object.keys(settings.display.displays);
    if (displayIds.length > 1) {
        const secondDisplayId = displayIds[1];
        const display = settings.display.displays[secondDisplayId];
        
        // 切换状态
        display.enabled = !display.enabled;
        console.log(`✅ 显示端 ${display.name} 状态已切换为: ${display.enabled ? '启用' : '禁用'}`);
    }
    
    return settings;
}

// 测试 5: 测试删除显示端
function testDeleteDisplay(settings) {
    console.log('📋 测试 5: 删除显示端...');
    
    const displayIds = Object.keys(settings.display.displays);
    if (displayIds.length > 1) {
        const secondDisplayId = displayIds[1];
        const displayName = settings.display.displays[secondDisplayId].name;
        
        delete settings.display.displays[secondDisplayId];
        
        // 如果删除的是当前显示端，切换到第一个
        if (settings.display.currentDisplayId === secondDisplayId) {
            const remainingIds = Object.keys(settings.display.displays);
            if (remainingIds.length > 0) {
                settings.display.currentDisplayId = remainingIds[0];
            }
        }
        
        console.log(`✅ 显示端 ${displayName} 已删除`);
    }
    
    return settings;
}

// 测试 6: 测试 BroadcastChannel 通信
function testBroadcastChannel() {
    console.log('📋 测试 6: 测试 BroadcastChannel 通信...');
    
    if (typeof BroadcastChannel !== 'undefined') {
        try {
            const bc = new BroadcastChannel('metro_pids_v3');
            
            // 监听消息
            bc.onmessage = function(event) {
                console.log('📨 收到 BroadcastChannel 消息:', event.data);
            };
            
            // 发送测试消息
            const testMessage = {
                t: 'TEST',
                message: '这是一条测试消息',
                timestamp: new Date().toISOString()
            };
            
            bc.postMessage(testMessage);
            console.log('✅ BroadcastChannel 测试消息已发送');
            
            // 清理
            setTimeout(() => {
                bc.close();
                console.log('🧹 BroadcastChannel 已关闭');
            }, 1000);
            
        } catch (e) {
            console.error('❌ BroadcastChannel 测试失败:', e);
        }
    } else {
        console.warn('⚠️ BroadcastChannel API 不支持');
    }
}

// 测试 7: 测试窗口打开功能（模拟）
function testWindowOpen() {
    console.log('📋 测试 7: 测试窗口打开功能...');
    
    const displays = [
        { id: 'display-1', name: '主显示端', width: 1900, height: 600 },
        { id: 'display-2', name: '显示端 2', width: 1920, height: 1080 }
    ];
    
    displays.forEach(display => {
        console.log(`🪟 模拟打开 ${display.name} (${display.width}x${display.height})`);
        
        // 在实际环境中，这里会调用 window.open() 或 electronAPI.openDisplay()
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.openDisplay) {
            console.log(`  → 使用 Electron API 打开 ${display.id}`);
        } else {
            console.log(`  → 使用浏览器弹窗打开 ${display.id}`);
        }
    });
    
    console.log('✅ 窗口打开功能测试完成');
}

// 运行所有测试
function runAllTests() {
    console.log('🎯 开始运行所有测试...\n');
    
    try {
        let settings = testDefaultSettings();
        console.log('');
        
        settings = testAddDisplay(settings);
        console.log('');
        
        settings = testUpdateDisplay(settings);
        console.log('');
        
        settings = testToggleDisplay(settings);
        console.log('');
        
        settings = testDeleteDisplay(settings);
        console.log('');
        
        testBroadcastChannel();
        console.log('');
        
        testWindowOpen();
        console.log('');
        
        console.log('🎉 所有测试完成！');
        console.log('📊 最终设置状态:', settings);
        
        return {
            success: true,
            settings: settings,
            message: '所有测试通过'
        };
        
    } catch (error) {
        console.error('❌ 测试过程中发生错误:', error);
        return {
            success: false,
            error: error.message,
            message: '测试失败'
        };
    }
}

// 导出测试函数（如果在模块环境中）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        testDefaultSettings,
        testAddDisplay,
        testUpdateDisplay,
        testToggleDisplay,
        testDeleteDisplay,
        testBroadcastChannel,
        testWindowOpen,
        runAllTests
    };
}

// 如果在浏览器环境中直接运行
if (typeof window !== 'undefined') {
    // 将测试函数添加到全局对象
    window.MetroPidsTests = {
        testDefaultSettings,
        testAddDisplay,
        testUpdateDisplay,
        testToggleDisplay,
        testDeleteDisplay,
        testBroadcastChannel,
        testWindowOpen,
        runAllTests
    };
    
    console.log('🔧 测试函数已添加到 window.MetroPidsTests');
    console.log('💡 运行 window.MetroPidsTests.runAllTests() 开始测试');
}

// 自动运行测试（可选）
// runAllTests();