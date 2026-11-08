# 行测刷题(Tauri 2 + Rust)

一个离线可用的行测刷题 App：分类题库、每日挑战、限时速算、错题本、经验/职级/连续打卡/成就。后端用 Rust 负责题库、判题和进度持久化，前端是原生 HTML/CSS/JS，不依赖 Node 构建链。

## 功能

- **分类题库**:言语理解、数量关系、判断推理、资料分析、常识判断，共 40 道内置题
- **练习模式**:全部题型 / 单个分类 / 随机 10 题快速练习 / 错题本
- **每日挑战**:按日期做种子，每天固定 5 题，完成额外 +30 XP
- **计算训练**:加减、乘法、平方、除法、分数化百分数、增长率、四则混合；支持 10/20/30 题
- **答题回顾**:结束后逐题展示你的答案、正确答案和解析，错题默认展开
- **游戏化**:12 级职级、连击加成、每日目标、连续打卡、补签卡、13 个成就
- **体验细节**:深色模式、键盘作答、切后台自动暂停计时、减少动效适配、安全区适配

## 技术栈

| 层 | 说明 |
| --- | --- |
| 桌面/移动壳 | Tauri 2 |
| 后端 | Rust 2021，`serde` / `serde_json` |
| 前端 | 原生 HTML + CSS + JavaScript，无框架、无打包步骤 |
| 数据 | 应用私有目录下的 JSON 文件 |

## 环境要求

- Rust **1.90+**（Tauri 2.12 的 MSRV；推荐 `rustup` 安装 stable)
- `cargo install tauri-cli --version "^2" --locked`
- Android 构建额外需要：Android Studio(SDK + NDK)、JDK 17
- 桌面构建需要对应平台的系统依赖(见 [Tauri 文档](https://v2.tauri.app/start/prerequisites/))

## 本地开发

```bash
# 安装 tauri-cli
cargo install tauri-cli --version "^2" --locked

# 桌面调试
cargo tauri dev

# 只跑后端单元测试
cargo test --manifest-path src-tauri/Cargo.toml

# 格式与 Clippy
cargo fmt --manifest-path src-tauri/Cargo.toml --all
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

图标已经放在 `src-tauri/icons/`，拉下来即可直接 `cargo tauri dev`；修改 `app-icon.png` 后重新执行 `cargo tauri icon app-icon.png`。

## Android 构建

### 本地

```bash
export JAVA_HOME=/path/to/jdk17
export ANDROID_HOME=$HOME/Library/Android/sdk
export NDK_HOME=$ANDROID_HOME/ndk/27.0.12077973

rustup target add aarch64-linux-android

./build.sh            # debug APK，可直接安装
./build.sh --release  # release APK，需要自行配置签名
```

`build.sh` 会依次执行：检查环境 → 补 target → 安装 tauri-cli(如缺失)→ 生成图标 → `android init`(如未初始化)→ 单元测试 → 构建 → 打印 APK 路径。

也可以直接调用：

```bash
cargo tauri android init --ci
cargo tauri android build --apk --debug --target aarch64 --ci
```

默认只构建 `aarch64`（绝大多数现代手机）；需要其他 ABI 时把 `--target` 换成 `armv7` / `i686` / `x86_64`,并先 `rustup target add` 对应 target。

### GitHub Actions

推送到 `main` / `master` 会自动构建，也可以在 Actions 页面手动触发。构建完成后在本次运行的 **Artifacts** 中下载 `xingce-apk-debug`(debug 签名，可直接安装)。

工作流做了这些优化：

- Rust target 与 `tauri-cli` 二进制分别缓存，Gradle 依赖缓存
- 构建前先跑 `cargo fmt --check`、`cargo clippy -D warnings` 和单元测试
- 同一分支的新构建会取消尚未完成的旧构建

正式发布请使用自己的 keystore 做 release 签名。

## 数据与存档

进度保存在 Tauri 的应用数据目录中：

| 平台 | 位置 |
| --- | --- |
| macOS | `~/Library/Application Support/com.example.xingce/progress.json` |
| Windows | `%APPDATA%\com.example.xingce\progress.json` |
| Linux | `~/.local/share/com.example.xingce/progress.json` |
| Android | 应用私有目录(`app_data_dir`)下的 `progress.json` |

保存策略：

- 先写 `progress.json.tmp` 并 `fsync`，再原子改名，避免写一半崩溃导致坏档
- 每次保存前把上一份存档复制为 `progress.backup.json`
- 启动时主档损坏会自动回退到备份，坏档保留为 `progress.corrupt.json`
- 首页底部「清空所有进度」会二次确认，然后重置所有数据

> `tauri.conf.json` 里的 `identifier` 目前是 `com.example.xingce`。正式发布前建议改成自己的反向域名；注意改 identifier 会改变应用数据目录，旧进度不会自动迁移。

## 扩充题库

编辑 `src-tauri/questions.json`(构建时通过 `include_str!` 打包进二进制，不需要额外资源文件)。

```json
{
  "id": 41,
  "category": "言语理解",
  "stem": "题干",
  "options": ["选项 A", "选项 B", "选项 C", "选项 D"],
  "answer": 1,
  "explanation": "解析"
}
```

字段与校验规则：

- `id`：正整数，全库唯一
- `category`：必须是 `言语理解` / `数量关系` / `判断推理` / `资料分析` / `常识判断` 之一
- `stem`、`explanation`：不能为空
- `options`：至少 2 项，不能有空选项
- `answer`：从 **0** 开始的正确选项下标，必须小于 `options.length`

题库不合法时应用会在启动阶段报出具体题号和原因，不会带着坏数据运行。新增题目后建议跑一次 `cargo test --manifest-path src-tauri/Cargo.toml`。

## 计算训练

题目由 Rust 随机生成(`src-tauri/src/lib.rs` 的 `make`），每次不同，不占题库。

| 题型 | 说明 |
| --- | --- |
| 综合 | 随机混合其余题型 |
| 加减 | 三位/四位数加减 |
| 乘法 | 两位数乘法、×11/×12/×15/×25 |
| 平方 | 11–35 的平方 |
| 除法 | 整除除法 |
| 分数 | 分数化百分数，保留 1 位小数 |
| 增长 | 增长/下降百分比 |
| 混合 | 四则混合运算 |

新增题型：在 `DRILLS` 常量加一行，并在 `make` 里加一个 `match` 分支即可。

- 每题单独计时，答对自动进入下一题，答错显示正确答案
- 切到后台会暂停计时，避免挂机拉高平均用时
- 结束后记录正确率、平均用时、历史最佳，并发放 XP
- 输入框兼容全角数字、中文逗号和百分号

## 游戏化参数

参数在 `src-tauri/src/lib.rs` 顶部：

- `DAILY_GOAL = 20`：每日目标题数
- `GOAL_BONUS = 20`：达成目标奖励
- `DAILY_BONUS = 30`：完成每日挑战奖励
- `TITLES`：12 级职级称号
- `ACHV`：13 个成就

经验规则：答对 +10 XP，连击每 3 连额外 +2（最多 +10），答错 +2；计算训练每答对一题 +4，10 题以上全对额外 +30。日期按手机本地时区计算，跨零点自动重置今日进度。

## 键盘快捷键

| 场景 | 按键 |
| --- | --- |
| 选择题 | `1`–`6` 或 `A`–`F` 作答 |
| 选择题 | `Enter` / `Space` 下一题 |
| 计算训练 | `Enter` 提交 / 下一题 |
| 任意页面 | `Esc` 返回 / 退出训练 |
| 弹窗 | `Enter` 确认，`Esc` 取消 |

## 项目结构

```text
.
├── ui/                     # 前端(直接作为 frontendDist)
│   ├── index.html
│   ├── app.js              # 单文件视图与状态管理
│   └── style.css
├── src-tauri/
│   ├── src/lib.rs          # 命令、判题、进度、游戏化、速算生成
│   ├── questions.json      # 内置题库
│   ├── icons/              # 已生成的各平台图标
│   ├── capabilities/       # Tauri 权限
│   ├── tauri.conf.json
│   └── Cargo.toml
├── .github/workflows/      # Android CI
├── build.sh
└── app-icon.png            # 图标源文件(1024×1024)
```

## 常见问题

**`cargo tauri` 找不到？**
先 `cargo install tauri-cli --version "^2" --locked`,并确认 `~/.cargo/bin` 在 `PATH` 中。

**Android 构建提示 NDK / SDK 找不到？**
确认 `ANDROID_HOME`、`NDK_HOME`、`JAVA_HOME` 都指向真实目录；`NDK_HOME` 要精确到 `ndk/<版本>`。

**APK 安装后是旧图标？**
执行 `cargo tauri icon app-icon.png` 后重新构建；Android 的 mipmap 需要由 `tauri icon` 生成。

**改了题库但没生效？**
题库在编译时打包，需要重新 `cargo tauri dev` 或重新构建 APK。

**存档会不会丢？**
写入是原子替换并保留上一份备份；仍建议定期备份 `progress.json`。
