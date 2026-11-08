#!/usr/bin/env python3
"""为 tauri android init 生成的 Gradle 工程注入 release 签名配置。

Tauri 模板默认没有 signingConfigs；CI 在生成 Android 工程后调用本脚本，
把 keystore.properties 读取进 Gradle，从而保证每次构建使用同一把签名密钥。
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GRADLE = ROOT / "src-tauri/gen/android/app/build.gradle.kts"
DEFAULT_PROPS = ROOT / "src-tauri/gen/android/keystore.properties"


def fail(message: str) -> None:
    print(f"[signing] {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    gradle = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_GRADLE
    props = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_PROPS

    if not gradle.exists():
        fail(f"找不到 Gradle 文件：{gradle}")
    if not props.exists():
        fail(f"找不到签名配置：{props}")

    source = gradle.read_text(encoding="utf-8")
    if 'signingConfigs.getByName("release")' in source:
        print("[signing] signingConfigs 已存在，跳过")
        return

    if "import java.io.FileInputStream" not in source:
        if "import java.util.Properties" in source:
            source = source.replace(
                "import java.util.Properties",
                "import java.io.FileInputStream\nimport java.util.Properties",
                1,
            )
        else:
            source = "import java.io.FileInputStream\nimport java.util.Properties\n" + source

    signing_block = '''    signingConfigs {
        create("release") {
            val keystorePropertiesFile = rootProject.file("keystore.properties")
            val keystoreProperties = Properties()
            if (keystorePropertiesFile.exists()) {
                keystoreProperties.load(FileInputStream(keystorePropertiesFile))
            }
            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["password"] as String
            storeFile = file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["password"] as String
        }
    }
'''

    if "\n    buildTypes {" not in source:
        fail("Gradle 模板中没有找到 buildTypes 块")
    source = source.replace("\n    buildTypes {", "\n" + signing_block + "    buildTypes {", 1)

    release_marker = '        getByName("release") {\n'
    if release_marker not in source:
        fail("Gradle 模板中没有找到 release buildType")
    source = source.replace(
        release_marker,
        release_marker + '            signingConfig = signingConfigs.getByName("release")\n',
        1,
    )

    gradle.write_text(source, encoding="utf-8")
    print(f"[signing] 已写入 release signingConfig：{gradle}")


if __name__ == "__main__":
    main()
