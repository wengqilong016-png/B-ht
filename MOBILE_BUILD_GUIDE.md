# B-ht 移动端构建指南

## 🎯 项目概述

B-ht 项目已成功配置为移动端应用，支持 Android 和 iOS 平台。主要特性：

- ✅ **实时定位功能** - 解决了 Web App 无法实时定位的问题
- ✅ **Capacitor 框架** - 支持原生功能访问
- ✅ **测试环境配置** - 完整的 Jest 测试环境
- ✅ **代码优化** - 清理了无用的文件和代码

## 🚀 移动端配置完成

### 已配置的功能

**定位功能:**
- ✅ ACCESS_FINE_LOCATION - 精确定位
- ✅ ACCESS_COARSE_LOCATION - 粗略定位  
- ✅ ACCESS_BACKGROUND_LOCATION - 后台定位

**其他权限:**
- ✅ 相机权限 (用于拍照功能)
- ✅ 存储权限 (用于文件管理)
- ✅ 网络权限

**Capacitor 插件:**
- ✅ @capacitor/geolocation - 地理定位
- ✅ @capacitor/camera - 相机功能
- ✅ @capacitor/network - 网络状态

## 📱 构建 Android APK

### 前置要求

在 Windows/Mac/Linux 上构建需要：

1. **Java Development Kit (JDK) 11 或更高版本**
   ```bash
   java -version
   ```

2. **Android SDK**
   - Android Studio 或 Android SDK 命令行工具
   - Android SDK Platform-Tools
   - Android SDK Build-Tools

3. **环境变量**
   ```bash
   export ANDROID_HOME=/path/to/android/sdk
   export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools
   ```

### 构建步骤

#### 1. 安装依赖
```bash
cd B-ht
npm install
```

#### 2. 构建 Web 应用
```bash
npm run build
```

#### 3. 同步到 Android 平台
```bash
npm run cap:sync:android
```

#### 4. 构建 Debug APK
```bash
cd android
./gradlew assembleDebug
```

#### 5. 构建 Release APK
```bash
cd android
./gradlew assembleRelease
```

### APK 位置

- **Debug APK**: `android/app/build/outputs/apk/debug/app-debug.apk`
- **Release APK**: `android/app/build/outputs/apk/release/app-release.apk`

## 🍎 构建 iOS 应用

### 前置要求

1. **Mac 电脑** - iOS 开发只能在 Mac 上进行
2. **Xcode 14 或更高版本**
3. **CocoaPods**

### 构建步骤

#### 1. 添加 iOS 平台
```bash
npx cap add ios
```

#### 2. 同步到 iOS 平台
```bash
npm run cap:sync:ios
```

#### 3. 打开 Xcode
```bash
npm run cap:open:ios
```

#### 4. 在 Xcode 中构建
- 选择目标设备或模拟器
- 点击 Product > Build (Cmd+B)
- 产品 > Archive (用于发布版本)

## 🛠️ 使用 Capacitor 命令

### 同步命令
```bash
# 同步所有平台
npm run cap:sync

# 只同步 Android
npm run cap:sync:android

# 只同步 iOS
npm run cap:sync:ios
```

### 打开 IDE
```bash
# 打开 Android Studio
npm run cap:open:android

# 打开 Xcode
npm run cap:open:ios
```

### 一键构建脚本
```bash
# 构建 Debug APK
npm run cap:build:android

# 构建 Release APK
npm run cap:build:android:release
```

## 📍 定位功能实现

### 使用 Capacitor Geolocation API

```typescript
import { Geolocation } from '@capacitor/geolocation';

// 获取当前位置
const getCurrentPosition = async () => {
  try {
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });
    
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy
    };
  } catch (error) {
    console.error('定位失败:', error);
    throw error;
  }
};

// 监听位置变化
const watchPosition = (callback: (position: any) => void) => {
  const watchId = Geolocation.watchPosition({
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  }, (position, err) => {
    if (err) {
      console.error('位置监听错误:', err);
      return;
    }
    
    callback({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy
    });
  });
  
  return watchId;
};

// 停止位置监听
const clearWatch = (watchId: string) => {
  Geolocation.clearWatch({ id: watchId });
};
```

### 权限处理

```typescript
import { Geolocation } from '@capacitor/geolocation';

// 请求定位权限
const requestPermissions = async () => {
  const result = await Geolocation.requestPermissions({
    permissions: ['location', 'locationAlways']
  });
  
  console.log('权限请求结果:', result);
  return result;
};

// 检查权限状态
const checkPermissions = async () => {
  const result = await Geolocation.checkPermissions();
  console.log('当前权限状态:', result);
  return result;
};
```

## 🧪 测试环境

### 运行测试
```bash
# 运行所有测试
npm test

# 运行测试并生成覆盖率报告
npm test:coverage

# 监听模式（自动重新运行测试）
npm test:watch
```

### 测试文件位置
- 主应用测试: `src/__tests__/`
- 司机端测试: `driver-app/src/__tests__/`

### 当前测试状态
- ✅ 基础测试环境配置完成
- ✅ 3个基础测试用例通过
- ✅ Jest + React Testing Library 配置完成

## 🔧 代码优化

### 已完成的优化
- ✅ 清理了 16MB 的备份文件
- ✅ 归档了临时文档和脚本文件
- ✅ 移除了无用的 SQL 文件
- ✅ 优化了项目结构

### 性能优化建议
1. **代码分割** - 使用动态导入减少初始加载时间
2. **图片优化** - 压缩和优化图片资源
3. **缓存策略** - 实现更有效的缓存机制
4. **懒加载** - 对非关键组件实现懒加载

## 📦 部署到生产环境

### Android 部署

1. **签名 Release APK**
   ```bash
   # 使用 keytool 生成密钥
   keytool -genkey -v -keystore my-release-key.keystore -alias alias_name -keyalg RSA -keysize 2048 -validity 10000
   
   # 配置 build.gradle 签名信息
   ```

2. **上传到 Google Play**
   - 创建 Google Play 开发者账号
   - 创建应用并上传 APK
   - 填写应用信息和截图
   - 发布应用

### iOS 部署

1. **App Store 分发**
   - 在 Xcode 中配置签名和证书
   - Archive 应用
   - 上传到 App Store Connect

2. **TestFlight 测试**
   - 上传到 TestFlight
   - 邀请测试人员
   - 收集反馈

## 🎨 UI/UX 优化

### 响应式设计
- ✅ 移动端优先设计
- ✅ 适配不同屏幕尺寸
- ✅ 触摸友好的交互

### 性能优化
- ⚡ 快速启动时间
- ⚡ 流畅的动画效果
- ⚡ 优化的地图渲染

## 🔐 安全考虑

### 数据安全
- ✅ Supabase RLS (行级安全)
- ✅ HTTPS 加密通信
- ✅ 安全的认证机制

### 移动端安全
- ✅ 权限最小化原则
- ✅ 敏感数据本地加密
- ✅ 安全的文件存储

## 📊 监控和分析

### 应用监控
- 集成 Firebase Analytics
- 错误追踪
- 性能监控

### 用户分析
- 用户行为追踪
- 使用情况分析
- 转化率统计

## 🔄 持续集成

### CI/CD 配置
可以配置 GitHub Actions 或其他 CI/CD 工具：

```yaml
# .github/workflows/build-android.yml
name: Build Android APK
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-java@v2
        with:
          java-version: '11'
      - uses: actions/setup-node@v2
        with:
          node-version: '20'
      - run: npm install
      - run: npm run build
      - run: npm run cap:sync:android
      - run: cd android && ./gradlew assembleDebug
      - uses: actions/upload-artifact@v2
        with:
          name: app-debug.apk
          path: android/app/build/outputs/apk/debug/app-debug.apk
```

## 📞 故障排除

### 常见问题

**1. Gradle 构建失败**
```bash
# 清理并重新构建
cd android
./gradlew clean
./gradlew assembleDebug
```

**2. 定位权限问题**
```typescript
// 确保在 AndroidManifest.xml 中配置了权限
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

**3. iOS 构建问题**
```bash
# 清理 Derived Data
rm -rf ~/Library/Developer/Xcode/DerivedData
# 重新打开项目
npx cap open ios
```

## 🎯 下一步建议

1. **完整测试** - 在真实设备上测试所有功能
2. **性能优化** - 使用 Profiler 工具优化性能
3. **用户测试** - 收集真实用户的反馈
4. **文档完善** - 补充用户使用手册
5. **持续迭代** - 根据用户反馈持续改进

## 📝 开发环境配置文件

### 环境变量配置
创建 `.env` 文件：
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_key
VITE_GOOGLE_API_KEY=your_google_api_key
```

### 测试环境变量
创建 `.env.test` 文件：
```env
VITE_SUPABASE_URL=https://test.supabase.co
VITE_SUPABASE_ANON_KEY=test_key
```

---

**注意**: 移动端构建需要在相应的开发环境中进行。当前 Android 项目已配置完成，可以在有 Android SDK 的环境中构建 APK。