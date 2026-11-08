# Changelog

## 0.3.0

### 新增

- **每日提醒**：设置页可开启/关闭、选择时间；使用 Tauri 通知插件在 Android/iOS 上调度本地通知，支持 Android 通知渠道与 Android 13+ 权限请求
- **资料分析公式**：15 个高频公式速查，支持背诵模式（默认隐藏公式、点击展开）和 10 题公式测验
- **更多基础数据训练**：新增百分比、增长量、基期量、比重、平均数、倍数、百分点、估算 8 类，速算题型从 8 类扩展到 16 类
- **设置页**：提醒设置、数据说明、版本信息和清空进度入口集中管理
- **公式数据校验**：单元测试检查公式 id、分组、名称、说明和例子完整性

### 构建与签名

- GitHub Actions 使用固定 upload key 做 release 签名；密钥通过 `ANDROID_KEY_BASE64`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` Secrets 注入
- 新增 `scripts/configure-android-signing.py`，在 `android init` 后给 Gradle 注入 `signingConfigs.release`
- 未配置签名密钥时自动退回 debug 构建，保证 CI 仍可产出 APK
- CI 增加 Linux 桌面构建依赖，便于在打包前运行 fmt/clippy/test
- 本地 `./build.sh --release` 支持读取 `keystore.properties` 并自动注入签名

### 结构 / 界面

- 首页改为「今日 / 专项训练 / 题库练习 / 复习与成就」分区，分类和专项使用双列卡片
- 计算训练按「基础速算 / 资料分析」分组
- 设置页、公式页、公式测验复用现有组件与键盘交互
- 版本号升级到 0.3.0

## 0.2.0

### 修复与健壮性

- 进度改为「临时文件 + fsync + 原子改名」保存，并保留 `progress.backup.json`；主档损坏时自动回退备份
- 修复题库/存档异常时可能静默丢数据的问题；坏档保留为 `progress.corrupt.json`
- 严格校验 `YYYY-MM-DD` 日期，避免脏日期把连续打卡清零
- 题库在启动时校验：重复 id、未知分类、空题干/解析、选项过少、answer 越界都会给出具体错误
- 经验、答题数、训练统计改为饱和运算，避免极端值溢出
- `record_drill` 对题数、正确数、用时做边界收敛；非法参数返回明确错误
- 互斥锁中毒后继续使用内部数据，不再让一次 panic 导致整个应用不可用
- 每日挑战固定选取逻辑抽成纯函数并补测；训练随机数的退化区间不再可能除零

### 前端体验

- 新增答题回顾：逐题展示你的答案、正确答案和解析，错题默认展开
- 新增键盘作答(`1–6` / `A–F`、`Enter`、`Esc`)与桌面端快捷键提示
- 新增「快速练习」:随机 10 题跨题型热身
- 首页新增累计答题、总正确率、错题数统计；满级时正确显示「已满级」
- 错题答对后提示「已从错题本移除，还剩 N 题」
- 所有 `invoke` 调用统一错误处理，失败时 toast 提示，不再静默失败
- 计算训练：切后台暂停计时、全角数字/中文逗号归一化、训练题量持久化
- 弹窗支持 Enter/Esc、焦点管理；彩带尊重 `prefers-reduced-motion`
- 进度条、选项组、toast 等补充 ARIA；修复页面切换后的滚动位置

### 构建与发布

- 发布配置：单 codegen unit、LTO、`opt-level = "s"`、strip，减小移动端体积
- 提交各平台图标，桌面端 `cargo tauri dev` 开箱即用
- 增加 `.gitignore`、`Cargo.lock`(应用项目锁定依赖)
- Android CI：缓存 `tauri-cli` 与 Gradle、并发取消旧构建、最小权限、构建前跑 fmt/clippy/test、artifact 保留 14 天
- `build.sh` 支持 `--release`、环境检查、单元测试和 APK 路径/体积输出
- CSP 从 `null` 改为最小策略；补充窗口最小尺寸与 bundle 元数据

### 内容

- 题库从 20 题扩充到 40 题，覆盖五大分类，所有答案与解析均经过校验
