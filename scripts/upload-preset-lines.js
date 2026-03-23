#!/usr/bin/env node
/**
 * 批量上传 preset-lines 目录下的线路到 Cloudflare Worker
 * 上传到预设线路和运控线路
 */

const fs = require('fs');
const path = require('path');

// 配置：API 地址和 Token（可选）
const API_BASE = process.env.API_BASE || 'https://metro.tanzhouxiang.dpdns.org';
const API_TOKEN = process.env.API_TOKEN || '';

// preset-lines 目录路径
const PRESET_LINES_DIR = path.join(__dirname, '..', 'preset-lines');

/**
 * 调用 API
 */
async function callApi(method, path, body = null) {
  const url = API_BASE.replace(/\/+$/, '') + path;
  const headers = {
    'Accept': 'application/json'
  };
  
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  
  if (API_TOKEN) {
    headers['Authorization'] = `Bearer ${API_TOKEN}`;
  }
  
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `HTTP ${response.status}: ${text}`);
  }
  
  return data;
}

/**
 * 上传单个线路到预设线路
 */
async function uploadPresetLine(lineName, lineData) {
  try {
    await callApi('PUT', `/preset/${encodeURIComponent(lineName)}`, lineData);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * 上传单个线路到运控线路
 */
async function uploadRuntimeLine(lineName, lineData) {
  try {
    await callApi('PUT', `/runtime/lines/${encodeURIComponent(lineName)}`, lineData);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🚇 开始批量上传线路...\n');
  console.log(`API 地址: ${API_BASE}`);
  console.log(`Token: ${API_TOKEN ? '已设置' : '未设置（可选）'}\n`);
  
  // 读取 preset-lines 目录下的所有 JSON 文件
  const files = fs.readdirSync(PRESET_LINES_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();
  
  if (files.length === 0) {
    console.log('❌ 未找到任何 JSON 文件');
    process.exit(1);
  }
  
  console.log(`找到 ${files.length} 个线路文件：\n`);
  
  const results = {
    preset: { success: [], failed: [] },
    runtime: { success: [], failed: [] }
  };
  
  // 逐个上传
  for (const file of files) {
    const filePath = path.join(PRESET_LINES_DIR, file);
    let lineData;
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      lineData = JSON.parse(content);
    } catch (e) {
      console.log(`⚠️  ${file}: 读取失败 - ${e.message}`);
      results.preset.failed.push({ file, error: `读取失败: ${e.message}` });
      results.runtime.failed.push({ file, error: `读取失败: ${e.message}` });
      continue;
    }
    
    const lineName = lineData?.meta?.lineName;
    if (!lineName) {
      console.log(`⚠️  ${file}: 缺少 meta.lineName`);
      results.preset.failed.push({ file, error: '缺少 meta.lineName' });
      results.runtime.failed.push({ file, error: '缺少 meta.lineName' });
      continue;
    }
    
    console.log(`📤 ${lineName} (${file})`);
    
    // 上传到预设线路
    const presetResult = await uploadPresetLine(lineName, lineData);
    if (presetResult.ok) {
      console.log(`   ✅ 预设线路: 成功`);
      results.preset.success.push(lineName);
    } else {
      console.log(`   ❌ 预设线路: ${presetResult.error}`);
      results.preset.failed.push({ file, lineName, error: presetResult.error });
    }
    
    // 上传到运控线路（使用相同数据）
    const runtimeResult = await uploadRuntimeLine(lineName, lineData);
    if (runtimeResult.ok) {
      console.log(`   ✅ 运控线路: 成功`);
      results.runtime.success.push(lineName);
    } else {
      console.log(`   ❌ 运控线路: ${runtimeResult.error}`);
      results.runtime.failed.push({ file, lineName, error: runtimeResult.error });
    }
    
    console.log('');
  }
  
  // 输出汇总
  console.log('\n' + '='.repeat(50));
  console.log('📊 上传汇总\n');
  
  console.log('预设线路:');
  console.log(`  ✅ 成功: ${results.preset.success.length}`);
  console.log(`  ❌ 失败: ${results.preset.failed.length}`);
  if (results.preset.failed.length > 0) {
    results.preset.failed.forEach(f => {
      console.log(`    - ${f.lineName || f.file}: ${f.error}`);
    });
  }
  
  console.log('\n运控线路:');
  console.log(`  ✅ 成功: ${results.runtime.success.length}`);
  console.log(`  ❌ 失败: ${results.runtime.failed.length}`);
  if (results.runtime.failed.length > 0) {
    results.runtime.failed.forEach(f => {
      console.log(`    - ${f.lineName || f.file}: ${f.error}`);
    });
  }
  
  console.log('\n' + '='.repeat(50));
  
  if (results.preset.failed.length === 0 && results.runtime.failed.length === 0) {
    console.log('🎉 所有线路上传成功！');
    process.exit(0);
  } else {
    console.log('⚠️  部分线路上传失败，请检查上述错误信息');
    process.exit(1);
  }
}

// 运行
main().catch(e => {
  console.error('❌ 发生错误:', e);
  process.exit(1);
});
