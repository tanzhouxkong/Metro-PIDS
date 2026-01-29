#!/bin/bash
# Metro-PIDS 版本发布示例脚本（macOS/Linux）
# 使用前请修改以下参数

echo "========================================"
echo "Metro-PIDS 版本发布脚本"
echo "========================================"
echo ""

# 配置参数
VERSION="1.5.5"
FILE="dist/Metro-PIDS-Setup-${VERSION}.exe"  # 修改为对应平台的文件
PLATFORM="win32"  # win32, darwin, linux
ARCH="x64"  # x64, arm64
MINIMUM_VERSION="1.5.0"
API_BASE="https://metro.tanzhouxiang.dpdns.org"

# 检查文件是否存在
if [ ! -f "$FILE" ]; then
    echo "[错误] 文件不存在: $FILE"
    echo "请先构建应用或修改 FILE 变量"
    exit 1
fi

echo "版本信息:"
echo "  版本号: $VERSION"
echo "  文件: $FILE"
echo "  平台: $PLATFORM ($ARCH)"
echo "  最低要求版本: $MINIMUM_VERSION"
echo "  API: $API_BASE"
echo ""

# 提示用户确认
read -p "确认发布此版本？(y/N): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "已取消"
    exit 0
fi

echo ""
echo "正在发布..."
echo ""

# 运行发布脚本
node scripts/publish-update.js \
  --file "$FILE" \
  --version "$VERSION" \
  --platform "$PLATFORM" \
  --arch "$ARCH" \
  --api "$API_BASE" \
  --minimum-version "$MINIMUM_VERSION" \
  --changelog-title "版本 $VERSION" \
  --changelog-content "### 新功能\n- 请在此处添加更新内容\n\n### 修复\n- 修复了若干已知问题"

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================"
    echo "发布成功！"
    echo "========================================"
    echo ""
    echo "后续步骤："
    echo "1. 将安装包上传到 CDN 或 R2"
    echo "2. 确保文件可通过以下地址访问："
    echo "   $API_BASE/update/Metro-PIDS-Setup-$VERSION.exe"
    echo "3. 在客户端测试更新功能"
    echo ""
else
    echo ""
    echo "[错误] 发布失败，请查看上方错误信息"
    echo ""
    exit 1
fi
