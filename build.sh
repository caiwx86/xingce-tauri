#!/usr/bin/env bash
# 本地构建 Android APK(默认 debug 签名，可直接安装；--release 需自行配置签名)
set -euo pipefail
cd "$(dirname "$0")"

MODE="debug"
for arg in "$@"; do
  case "$arg" in
    --release) MODE="release" ;;
    -h|--help)
      echo "用法： ./build.sh [--release]"
      echo "  --release  构建 release APK(需要提前配置 Android 签名)"
      exit 0
      ;;
    *) echo "未知参数： $arg(用 --help 查看用法)" >&2; exit 2 ;;
  esac
done

: "${ANDROID_HOME:?请先设置 ANDROID_HOME(Android SDK 路径)}"
: "${NDK_HOME:?请先设置 NDK_HOME(例如 \$ANDROID_HOME/ndk/27.0.12077973)}"
: "${JAVA_HOME:?请先设置 JAVA_HOME(JDK 17)}"

command -v cargo >/dev/null || { echo "未找到 cargo,请先安装 Rust(https://rustup.rs)" >&2; exit 1; }
if command -v rustup >/dev/null; then
  rustup target add aarch64-linux-android
fi

if ! cargo tauri --version >/dev/null 2>&1; then
  echo "未安装 tauri-cli,正在安装(首次较慢)…"
  cargo install tauri-cli --version "^2" --locked
fi

# 生成各平台图标(同时为 Android 准备 mipmap);只依赖仓库内的 app-icon.png
cargo tauri icon app-icon.png

[ -d src-tauri/gen/android ] || cargo tauri android init --ci

if [ "$MODE" = "release" ]; then
  if [ -f src-tauri/gen/android/keystore.properties ]; then
    command -v python3 >/dev/null || { echo "签名配置需要 python3" >&2; exit 1; }
    python3 scripts/configure-android-signing.py
  else
    echo "警告：未找到 src-tauri/gen/android/keystore.properties，release 构建可能未签名。" >&2
    echo "请参考 README 配置 keystore.properties，或使用 GitHub Actions 的固定签名。" >&2
  fi
fi

echo "运行单元测试…"
cargo test --manifest-path src-tauri/Cargo.toml

if [ "$MODE" = "release" ]; then
  echo "构建 release APK(请确认已配置签名)…"
  cargo tauri android build --apk --target aarch64 --ci
else
  echo "构建 debug APK…"
  cargo tauri android build --apk --debug --target aarch64 --ci
fi

echo
echo "APK 位置："
find src-tauri/gen/android/app/build/outputs/apk -name '*.apk' -print -exec ls -lh {} \;
