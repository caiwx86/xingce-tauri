# 行测刷题(Tauri 2 + Rust)

一个离线可用的行测刷题 App：分类题库、每日挑战、限时速算、错题本、经验/职级/连续打卡/成就。后端用 Rust 负责题库、判题和进度持久化，前端是原生 HTML/CSS/JS，不依赖 Node 构建链。

## 功能

- **分类题库**：言语理解、数量关系、判断推理、资料分析、常识判断，共 **500 道**内置题（五大分类各 100 道）
- **练习模式**：全部题型 / 单个分类 / 随机 10 题快速练习 / 错题本 / 智能复习
- **选项随机**：同一道题每次出现时选项顺序重新打乱；答对后进入复习冷却，到期前不会在普通练习中重复出现
- **内部数字键盘**：计算训练和公式实操使用 App 内置平铺数字键盘，不唤起手机第三方输入法
- **每日挑战**：按日期做种子，每天固定 5 题，完成额外 +30 XP
- **每日任务**：热身 10 题 / 答对 8 题 / 复习 5 题，完成后领取 XP
- **专注学习**：25/45/60 分钟番茄钟，按专注分钟获得 XP，单日上限 180 分钟
- **学习周报**：近 7 天答题趋势、正确率、活跃天数、分类表现和薄弱分类建议
- **学习搭子 PK**：30 秒离线一题对战，答题越快得分越高，可分享战绩
- **计算训练**：**21 类**基础数据训练 + **14 个速算技巧**；支持 10/20/30 题
- **公式背诵**：**43 个**公式，覆盖资料分析 + 数量关系；支持一览图、背诵卡、公式测验、**公式实操**和范围切换
- **艾宾浩斯复习**：题目和公式都按 1 / 2 / 4 / 7 / 15 / 30 / 60 天安排复习，提供智能复习和 7 天复习计划
- **动物收集**：**99 位**可爱动物伙伴，按答题、升级、连击、打卡、每日挑战、训练、记录等条件解锁
- **历史记录**：查看最近答题记录、只看错题、清空记录
- **自动发布**：GitHub Actions 构建并校验签名 APK 后自动发布 GitHub Release
- **每日提醒**：设置每天固定时间提醒，Android/iOS 使用系统本地通知
- **答题回顾**：结束后逐题展示你的答案、正确答案和解析，错题默认展开
- **游戏化**：12 级职级、连击加成、每日目标、连续打卡、补签卡、**888 个成就**、**99 位动物伙伴**
- **体验细节**：深色模式、iOS 透明玻璃底部 Tab、内置数字键盘、按键反馈/触感、数据表/长题干自适应、图标居中、41 条学习/动物小知识、切后台自动暂停计时、减少动效适配、安全区适配、简化首页、成就/动物分页

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

推送到 `main` / `master` 会自动构建，也可以在 Actions 页面手动触发。构建完成后：

- 在本次运行的 **Artifacts** 中下载 `xingce-apk`
- 配置签名密钥时，会自动发布 GitHub Release，标签为 `v<version>`，资产为 `xingce-<version>.apk`
- 未配置签名密钥时只上传 Artifact，并退回 debug 包

工作流做了这些优化：

- Rust target、`tauri-cli` 二进制、Gradle 依赖分别缓存
- 构建前先跑 `cargo fmt --check`、`cargo clippy -D warnings` 和单元测试
- 同一分支的新构建会取消尚未完成的旧构建
- 固定签名：从 GitHub Secrets 读取同一把 upload key，保证每次构建的 APK 可以覆盖安装
- 构建后自动执行 `apksigner verify`，签名异常时直接失败，不上传坏包
- 签名包构建成功后自动创建/更新 GitHub Release，Release 页可直接下载 APK

### 固定 APK 签名

仓库已配置以下 GitHub Actions Secrets：

| Secret | 说明 |
| --- | --- |
| `ANDROID_KEY_BASE64` | keystore 文件的 base64 内容 |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | store password / key password |

工作流在 `android init` 之后写入 `src-tauri/gen/android/keystore.properties`，再调用 `scripts/configure-android-signing.py` 给 Gradle 注入 `signingConfigs.release`，因此 CI 产物使用固定密钥签名。

本地 release 构建：

```bash
keytool -genkey -v -keystore ~/xingce-upload.jks -keyalg RSA -keysize 2048 \
  -validity 10000 -alias xingce

cat > src-tauri/gen/android/keystore.properties <<EOF
keyAlias=xingce
password=你的密码
storeFile=$HOME/xingce-upload.jks
EOF

./build.sh --release
```

> keystore 和密码不要提交到仓库；日常自用更推荐把密钥放在 GitHub Secrets 里由 Actions 构建。

> 首次从旧的 debug 包切换到固定签名 release 包时，因为签名不同，需要先卸载旧包再安装；之后同一把 key 构建的 APK 可以直接覆盖升级。

### 自动发布 Release

签名包构建并校验通过后，工作流会：

1. 从 `src-tauri/tauri.conf.json` 读取版本号
2. 把 APK 复制为 `xingce-<version>.apk`
3. 如果 `v<version>` Release 不存在就创建，存在则覆盖上传资产
4. 新 Release 自动标记为 latest

Release 页面会附带本次构建运行链接和安装说明。

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
- `review` / `formula_review` 保存艾宾浩斯阶段和到期日
- `animals` 保存已解锁动物，`history` 保存最近 500 条答题记录
- `focus_day` / `focus_minutes` 保存当日专注，`quest_day` / `quest_claimed` 保存每日任务领取状态
- 启动时主档损坏会自动回退到备份，坏档保留为 `progress.corrupt.json`
- 设置页底部「清空所有进度」会二次确认，然后重置所有数据

> `tauri.conf.json` 里的 `identifier` 目前是 `com.example.xingce`。正式发布前建议改成自己的反向域名；注意改 identifier 会改变应用数据目录，旧进度不会自动迁移。

## 扩充题库

当前题库为 **500 题**：五大分类各 100 题。其中前 80 题是手工基础题，其余题目由 `scripts/generate_questions.py` 生成，脚本可重复运行并保持结果稳定。

编辑 `src-tauri/questions.json`(构建时通过 `include_str!` 打包进二进制，不需要额外资源文件)。

```json
{
  "id": 501,
  "category": "言语理解",
  "stem": "题干",
  "options": ["选项 A", "选项 B", "选项 C", "选项 D"],
  "answer": 1,
  "explanation": "解析"
}
```

重新生成扩充题库：

```bash
python3 scripts/generate_questions.py
```

字段与校验规则：

- `id`：正整数，全库唯一
- `category`：必须是 `言语理解` / `数量关系` / `判断推理` / `资料分析` / `常识判断` 之一
- `stem`、`explanation`：不能为空
- `options`：至少 2 项，不能有空选项
- `answer`：从 **0** 开始的正确选项下标，必须小于 `options.length`

题库不合法时应用会在启动阶段报出具体题号和原因，不会带着坏数据运行。新增题目后建议跑一次 `cargo test --manifest-path src-tauri/Cargo.toml`；测试会校验总题数 500、每个分类 100 题以及每题的结构。

## 计算训练

题目由 Rust 随机生成（`src-tauri/src/lib.rs` 的 `make`），每次不同，不占题库。

| 题型 | 说明 |
| --- | --- |
| 综合 | 随机混合其余题型 |
| 加减 | 三位/四位数加减 |
| 乘法 | 两位数乘法、×11/×12/×15/×25 |
| 平方 | 11–35 的平方 |
| 除法 | 整除除法 |
| 分数 | 分数化百分数，保留 1 位小数 |
| 百分比 | 求一个数的百分之几 |
| 增长 | 增长/下降百分比 |
| 增长量 | 由基期量和增长率求增长量 |
| 基期量 | 由现期量和增长率求基期量 |
| 比重 | 部分量占整体量的比例 |
| 平均数 | 总量除以份数 |
| 倍数 | 求两个量的倍数关系 |
| 百分点 | 两个百分数直接相减 |
| 隔年增长 | 连续两年增长率求隔年增长率 |
| 年均增长量 | 由初期量、末期量和年数求年均增长量 |
| 年均增长率 | 由初期量、末期量和年数求年均增长率 |
| 贡献率 | 部分增长量占整体增长量的比例 |
| 资料分析 | 资料分析基础运算随机混合 |
| 估算 | 四舍五入到整百估算乘积 |
| 混合 | 四则混合运算 |

新增题型：在 `DRILLS` 常量加一行，并在 `make` 里加一个 `match` 分支即可。

- 每题单独计时，答对自动进入下一题，答错显示正确答案
- 切到后台会暂停计时，避免挂机拉高平均用时
- 结束后记录正确率、平均用时、历史最佳，并发放 XP
- 输入框兼容全角数字、中文逗号和百分号

### 速算技巧

计算训练页提供 **14 个常用速算技巧**背诵：凑整、拆分、×11、×15、×25、×125、个位是5的平方、(a±b)²、除法化乘、特征数字法、截位直除、尾数法、首数法、化同/差分比较。支持背诵模式隐藏技巧，点击条目查看公式和例子。

## 底部导航与首页

- 底部使用 iOS 风格透明玻璃 Tab：`backdrop-filter: blur(24px) saturate(180%)`
- 四个一级入口：首页 / 学习 / 效率 / 我的
- 首页只保留：今日学习小知识、个人等级、今日任务、开始练习
- 题库、公式、错题、复习计划、计算训练、速算技巧收进「学习」Tab
- 动物乐园、成就、历史记录、设置收进「我的」Tab
- 效率中心独立为「效率」Tab
- 今日小知识移到首页顶部，共 41 条，重点增加主动回忆、间隔重复、错题复盘、专注方法等学习 tips
- Tab 只在四个一级页面显示；答题、公式实操、计算训练等沉浸页面保持无 Tab，避免遮挡键盘
- Android 返回键在 Tab 子页面会回到对应一级页面

## 题目适配

- 资料分析/多行题干使用可横向滚动的等宽表格区域，列不再错位
- 普通多行题干保留换行但自动换行，不再撑破页面
- 页面禁止横向溢出，长选项、长解析、卡片文字自动换行
- 动物/成就图标使用固定高度居中容器，避免不同 Emoji 字体基线错位
- 移除部分 ZWJ/新版 Emoji，避免老设备显示成 tofu 或双图标
- 320px 窄屏有专门的字号、间距和键盘压缩规则

## 内部数字键盘

计算训练和公式实操不再使用手机第三方输入法：

- 答案输入框设置为只读，避免弹出系统键盘
- App 内提供 4 列平铺数字键盘：0–9、小数点、正负号、退格、清空、确定
- 键盘和输入框固定在屏幕底部安全区内，单手拇指可直接操作
- 小屏幕自动压缩键高，内容区自动留出键盘高度，避免遮挡和无法滚动
- 按键高度提升到 56px、字号 24px，短屏自动适配
- 每个按键带 `:active` 即时按压态、白字主色高亮、中心扩散波纹和轻触震动
- 每次按键输入框有边框/阴影/缩放弹动；非法提交会抖动并震动提示
- Android 构建加入 `VIBRATE` 权限；不支持震动时视觉反馈仍然生效
- 提交后输入框变绿/变红并加外圈高亮，正确答案/错误提示显示在键盘正上方
- 键盘立即禁用，避免重复提交
- 桌面端仍支持物理数字键、退格、Enter 提交

## 公式背诵

「学习」Tab → 公式背诵提供 **43 个**公式，覆盖资料分析和数量关系：

| 模块 | 公式 |
| --- | --- |
| 资料分析·增长 | 增长率、增长量、基期量、现期量、隔年增长率、年均增长量、年均增长率 |
| 资料分析·比重 | 比重、部分量、整体量、百分点 |
| 资料分析·平均 | 平均数、倍数 |
| 资料分析·综合 | 混合增长率、增长贡献率 |
| 数量关系·工程 | 工程总量、合作效率、合作时间 |
| 数量关系·行程 | 路程、相遇时间、追及时间、流水行船 |
| 数量关系·经济 | 利润、利润率、售价、折扣 |
| 数量关系·溶液 | 浓度、溶质 |
| 数量关系·计数 | 排列数、组合数、概率、两集合容斥 |
| 数量关系·数列 | 等差数列通项、等差数列求和、等比数列通项、等比数列求和 |
| 数量关系·几何 | 长方形面积、三角形面积、圆面积、圆柱体积 |
| 数量关系·杂题 | 鸡兔同笼、年龄问题、牛吃草 |

公式页支持：

- **全部 / 资料分析 / 数量关系**范围切换
- **背诵模式**隐藏公式，点击条目查看
- **公式一览图**：按专题分组展示全部公式，适合截图/打印
- **背诵卡**：先回忆、再显示答案，按「记住了 / 没记住」记录记忆状态
- **公式测验**：随机抽 10 个公式四选一，优先抽取到期公式，并展示解析
- **公式实操**：25 道公式计算题，输入数值作答，逐题展示公式和计算过程，并更新对应公式的复习阶段

## 艾宾浩斯复习

- 每次答题都会更新该题的记忆阶段；答对升阶，答错回到第 0 阶并安排到明天
- 答对后题目进入冷却：在下次复习到期前不会出现在「全部 / 分类 / 快速练习 / 每日挑战」中；错题本不受影响
- 复习间隔：1 / 2 / 4 / 7 / 15 / 30 / 60 天
- **智能复习**：先安排今天到期的题目，再用新题补足一组（最多 20 题）
- **复习计划**：查看今日到期、新题数量、公式到期、记忆阶段分布和未来 7 天预测
- 公式测验和背诵卡同样按复习状态抽取，形成「题目 + 公式」的完整记忆闭环
- 复习状态保存在 `progress.json` 的 `review` 和 `formula_review` 字段中

## 效率中心

「效率」Tab 聚合：

- **今日任务**：3 个每日任务，进度实时计算，完成后可领取 XP
- **专注学习**：25 / 45 / 60 分钟番茄钟，暂停、重置、后台时间校准
- **学习周报**：近 7 天柱状图、活跃天数、日均题量、分类正确率和薄弱分类建议
- **学习搭子 PK**：30 秒内完成一道题，答对得基础分并按剩余时间加分，对手是离线学习搭子
- **复习计划**：艾宾浩斯到期预测仍然保留在效率中心

每日任务和专注状态保存在 `progress.json` 中，跨天自动重置展示。

## 每日提醒

打开首页右上角 ⚙️ → 「每日提醒」：

- 选择时间并开启，授权通知权限后，按手机本地时区提醒
- 采用「未来 30 天逐日排期」：每次打开 App 会取消旧排期并重新排好未来 30 天，避免系统 interval 调度在部分 Android 机型上失效
- 修改时间会取消旧计划并重新调度
- Android 13+ 首次开启会请求 `POST_NOTIFICATIONS` 权限；插件权限失败时会尝试浏览器通知权限兜底
- 排期失败会直接提示具体错误，不再静默失败
- 桌面端暂不支持系统定时通知，设置页会给出提示
- 提醒设置保存在本机 `localStorage`，换机会重新设置

## 游戏化参数

参数在 `src-tauri/src/lib.rs` 顶部：

- `DAILY_GOAL = 20`：每日目标题数
- `GOAL_BONUS = 20`：达成目标奖励
- `DAILY_BONUS = 30`：完成每日挑战奖励
- `TITLES`：12 级职级称号
- 成就目录：**888 个**，按答题/正确/连续/连击/等级/分类/训练/记录/动物/特殊分组
- `ANIMALS`：**99 位**动物伙伴及解锁条件
- `FORMULA_EXERCISES`：25 道公式实操题
- `HISTORY_LIMIT = 500`：答题历史最多保留条数
- 专注 XP：2 XP / 分钟，单日专注上限 180 分钟
- 每日任务：热身 10 题 +20、答对 8 题 +20、智能复习 5 题 +30

经验规则：答对 +10 XP，连击每 3 连额外 +2（最多 +10），答错 +2；计算训练每答对一题 +4，10 题以上全对额外 +30。日期按手机本地时区计算，跨零点自动重置今日进度。

## 动物乐园与历史记录

- 99 位动物伙伴按答题数、等级、连击、连续打卡、每日挑战、计算训练、答题记录等条件解锁
- 解锁时弹窗庆祝；「动物乐园」显示已领养/未发现状态、稀有度和线索
- 首页显示当前动物伙伴和收集进度
- 首页顶部「今日学习小知识」按日期轮换，包含学习方法和动物冷知识
- 「答题记录」保存最近 500 条：日期、模式、分类、题目、你的答案、正确答案和解析
- 历史记录支持只看错题和清空，不影响错题本、经验、动物和复习计划

## 键盘快捷键

| 场景 | 按键 |
| --- | --- |
| 选择题 | `1`–`6` 或 `A`–`F` 作答 |
| 选择题 | `Enter` / `Space` 下一题 |
| 计算训练 / 公式实操 | 下方数字键盘输入；`Enter` 提交 / 下一题 |
| 公式背诵卡 | `Space` / `Enter` 显示答案；`1` 没记住、`2` 记住了 |
| 答题 / 训练 / 公式 / 背诵 | `Esc` 返回 / 退出 |
| 弹窗 | `Enter` 确认，`Esc` 取消 |
| Android 系统返回键 | 返回上一页；在首页时退出 App |

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
├── .github/workflows/      # Android CI（含固定签名）
├── scripts/
│   ├── configure-android-signing.py  # 给生成工程注入 release 签名
│   ├── generate_questions.py          # 生成扩充到 500 题的题库
│   └── patch-android-manifest.py      # 给 Android 构建补震动权限
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
