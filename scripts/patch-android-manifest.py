#!/usr/bin/env python3
"""给 Tauri 生成的 AndroidManifest 增加震动权限，供内置键盘触感反馈使用。"""
from pathlib import Path

manifest = Path("src-tauri/gen/android/app/src/main/AndroidManifest.xml")
if not manifest.exists():
    raise SystemExit(f"AndroidManifest not found: {manifest}")

text = manifest.read_text(encoding="utf-8")
if "android.permission.VIBRATE" in text:
    print("VIBRATE permission already present")
    raise SystemExit(0)

if "<application" not in text:
    raise SystemExit("unexpected AndroidManifest: <application> not found")

text = text.replace(
    "<application",
    '    <uses-permission android:name="android.permission.VIBRATE" />\n    <application',
    1,
)
manifest.write_text(text, encoding="utf-8")
print("VIBRATE permission added")
