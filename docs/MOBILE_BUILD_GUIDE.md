# B-ht 移动端构建指南

## 目标

这份文档只定义一套移动端构建口径：**以仓库 CI 为准**。

- Java: **21**（Temurin）
- Node.js: **22.x**
- npm: **10.x**
- Android Gradle Plugin: `8.13.0`
- Android 打包方式: **Capacitor + Gradle**

当前 CI 配置来源：

- [build-apk.yml](/root/b-ht/.github/workflows/build-apk.yml)
- [release.yml](/root/b-ht/.github/workflows/release.yml)
- [package.json](/root/b-ht/package.json)

## 当前约定

### CI 会做什么

`main` 和 `v*` tag 的 Android 流程默认按 **release** 构建，手动触发时才允许选择 `debug`。

CI 的固定顺序是：

1. `npm ci`
2. `npm run build`
3. `npx cap sync android`
4. `cd android && ./gradlew assembleDebug` 或 `assembleRelease`

### 本地也必须跟 CI 保持一致

本地排查 Android 构建问题时，不要再用旧口径：

- 不要按 JDK 11 写环境
- 不要按 Node 20 写环境
- 不要跳过 `npm run build` 或 `npx cap sync android`

## 前置要求

### 1. Node.js / npm

仓库已经在 [package.json](/root/b-ht/package.json) 里固定了：

```json
"engines": {
  "node": "22.x",
  "npm": "10.x"
}
```

确认版本：

```bash
node -v
npm -v
```

### 2. Java 21

确认版本：

```bash
java -version
```

输出应为 Java 21。

### 3. Android SDK

本地需要安装：

- Android Studio，或 Android SDK Command-line Tools
- Android SDK Platform-Tools
- Android SDK Build-Tools

常见环境变量示例：

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

Linux 用户通常是：

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

## 本地构建步骤

### 1. 安装依赖

```bash
npm ci
```

### 2. 准备前端环境变量

复制示例文件：

```bash
cp .env.example .env.local
```

至少填好：

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

### 3. 构建 Web 资源

```bash
npm run build
```

### 4. 同步到 Android 平台

```bash
npx cap sync android
```

也可以使用脚本：

```bash
npm run cap:sync:android
```

### 5. 构建 Debug APK

```bash
cd android
./gradlew assembleDebug
```

Debug APK 输出位置：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

> `debug` 只用于开发联调、ADB 安装、USB 调试，不要发给最终用户。

### 6. 构建 Release APK

```bash
cd android
./gradlew assembleRelease
```

Release APK 输出位置：

```text
android/app/build/outputs/apk/release/app-release.apk
```

> 给最终用户分发的必须是 **Release APK**，并且应当已经完成签名。

## 推荐的一键命令

仓库已经提供了本地脚本：

```bash
# Debug
npm run cap:build:android

# Release
npm run cap:build:android:release
```

它们内部仍然遵循 CI 同样的顺序：

1. `npm run build`
2. `npx cap sync android`
3. `./gradlew assembleDebug` / `assembleRelease`

## 本地签名配置

Android Release 签名依赖 [android/app/build.gradle](/root/b-ht/android/app/build.gradle) 里的四个环境变量：

- `KEYSTORE_FILE`
- `KEYSTORE_PASSWORD`
- `KEY_ALIAS`
- `KEY_PASSWORD`

Gradle 只有在 `KEYSTORE_FILE` 存在时才会启用 release signing。

### 方案 A：新生成一个 keystore

```bash
keytool -genkeypair \
  -v \
  -storetype PKCS12 \
  -keystore bahati-release.keystore \
  -alias bahati \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

### 方案 B：使用已有 keystore

如果你已经有线上在用的签名文件，直接复用，不要重新生成。

### 校验 keystore 可读

```bash
keytool -list \
  -keystore bahati-release.keystore \
  -storetype PKCS12
```

### 配置本地环境变量

最稳妥的是用**绝对路径**：

```bash
export KEYSTORE_FILE="/absolute/path/to/bahati-release.keystore"
export KEYSTORE_PASSWORD="your-store-password"
export KEY_ALIAS="bahati"
export KEY_PASSWORD="your-key-password"
```

如果你把文件放在 `android/app/` 目录下，也可以像 CI 一样只传文件名：

```bash
export KEYSTORE_FILE="bahati.keystore"
export KEYSTORE_PASSWORD="your-store-password"
export KEY_ALIAS="bahati"
export KEY_PASSWORD="your-key-password"
```

然后构建：

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleRelease
```

### 本地签名与 CI 密钥的对应关系

CI 使用的是 GitHub Secrets：

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

本地不需要 `ANDROID_KEYSTORE_BASE64`，而是直接使用：

- `KEYSTORE_FILE`
- `KEYSTORE_PASSWORD`
- `KEY_ALIAS`
- `KEY_PASSWORD`

## 本地推送配置

仓库的 Android 工程已经支持 **Firebase Google Services**，但只有在本地放入
`google-services.json` 时才会启用。

相关逻辑在：

- [android/build.gradle](/root/b-ht/android/build.gradle)
- [android/app/build.gradle](/root/b-ht/android/app/build.gradle)

如果缺少这个文件，Gradle 会跳过 Google Services 插件，并记录日志：

```text
Push Notifications won't work
```

### 1. 在 Firebase 项目中注册 Android 应用

包名必须与 Android 工程一致：

```text
com.bahati.app
```

### 2. 下载 `google-services.json`

从 Firebase Console 下载后，放到：

```text
android/app/google-services.json
```

> 这个文件不应提交到仓库。`android/.gitignore` 已经忽略它。

### 3. 重新同步并构建

```bash
npx cap sync android
cd android
./gradlew assembleDebug
```

或：

```bash
./gradlew assembleRelease
```

### 4. 本地验证推送配置是否已接入

构建日志里不应再出现：

```text
google-services.json not found
```

如果仍然出现，说明文件位置不对，或者包名与 Firebase 配置不匹配。

## GitHub Actions 产物说明

### `build-apk.yml`

- `main` 分支：默认产出 release APK
- `v*` tag：默认产出 release APK
- 手动触发：可选 `debug` / `release`

### `release.yml`

GitHub Release 发布后会：

1. 重新跑测试
2. 构建 release APK
3. 上传 `bahati-*.apk`
4. 更新 [public/version.json](/root/b-ht/public/version.json)

稳定下载名为：

```text
bahati-latest-release.apk
```

## iOS 构建

### 前置要求

- macOS
- Xcode 14+
- CocoaPods

### 基本步骤

```bash
npx cap add ios
npx cap sync ios
npx cap open ios
```

然后在 Xcode 中：

1. 选择设备或模拟器
2. `Product -> Build`
3. 发布时使用 `Product -> Archive`

## 常见问题

### 1. Release 构建成功，但 APK 未签名

先检查四个签名环境变量是否都已设置：

```bash
echo "$KEYSTORE_FILE"
echo "$KEY_ALIAS"
```

再确认 keystore 可读：

```bash
keytool -list -keystore "$KEYSTORE_FILE" -storetype PKCS12
```

### 2. 本地和 CI 构建结果不一致

优先核对这三项：

1. `node -v` 是否为 22.x
2. `java -version` 是否为 21
3. 是否执行了 `npm run build` 和 `npx cap sync android`

### 3. Push Notifications 本地不可用

优先检查：

1. `android/app/google-services.json` 是否存在
2. Firebase Android 包名是否是 `com.bahati.app`
3. 构建日志里是否出现 `google-services.json not found`

### 4. Gradle 构建失败

```bash
cd android
./gradlew clean
./gradlew assembleDebug
```

## 最小发布检查清单

发布给真实用户前，至少确认：

1. 本地或 CI 使用的是 Node 22 / Java 21。
2. 构建命令走过 `npm run build` 和 `npx cap sync android`。
3. Release APK 已正确签名。
4. 如需推送，`android/app/google-services.json` 已就位。
5. 最终交付物是 `release` APK，而不是 `debug` APK。
