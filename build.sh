#!/usr/bin/env bash
# 本地一键构建 Android APK (debug 签名,可直接安装)
set -euo pipefail
cd "$(dirname "$0")"

: "${ANDROID_HOME:?请先设置 ANDROID_HOME (Android SDK 路径)}"
: "${NDK_HOME:?请先设置 NDK_HOME (例如 \$ANDROID_HOME/ndk/27.0.12077973)}"
: "${JAVA_HOME:?请先设置 JAVA_HOME (JDK 17)}"

rustup target add aarch64-linux-android
command -v cargo-tauri >/dev/null || cargo install tauri-cli --version "^2" --locked

[ -d src-tauri/icons ] || cargo tauri icon app-icon.png
[ -d src-tauri/gen/android ] || cargo tauri android init

cargo test --manifest-path src-tauri/Cargo.toml   # 先跑单元测试
cargo tauri android build --apk --debug --target aarch64

echo "APK 位置:"
find src-tauri/gen/android/app/build/outputs/apk -name '*.apk'
