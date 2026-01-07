# 安装 Visual Studio Build Tools 指南

## 步骤 1: 下载 Visual Studio Build Tools

1. 访问：https://visualstudio.microsoft.com/zh-hans/downloads/
2. 在页面中找到"用于 Visual Studio 的工具"部分
3. 点击"Visual Studio 生成工具"下的"下载"按钮
4. 下载 `vs_buildtools.exe` 文件

## 步骤 2: 安装 Visual Studio Build Tools

1. 运行 `vs_buildtools.exe`
2. 在安装界面中，选择"**C++ 生成工具**"工作负载
3. 在"单个组件"选项卡下，确保勾选：
   - **MSVC v143 - VS 2022 C++ x64/x86 生成工具**（最新版本）
   - **Windows 10 SDK**（选择最新版本）
   - **CMake 工具**
4. 点击"安装"按钮
5. 等待安装完成（可能需要几分钟到几十分钟，取决于网络速度）

## 步骤 3: 重新编译 mica-electron

安装完成后，运行以下命令：

```powershell
npm install -g node-gyp
npm install --build-from-source mica-electron
```

或者使用项目中的脚本：

```powershell
npm run rebuild-mica
```

## 验证安装

运行以下命令验证是否安装成功：

```powershell
node-gyp --version
```

如果显示版本号，说明安装成功。

