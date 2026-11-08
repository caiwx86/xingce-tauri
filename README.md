# 行测刷题 (Tauri 2 + Rust)

Rust 后端负责题库、判题、做题记录(错题本/正确率,存于应用私有目录 progress.json);前端为原生 HTML/JS,无需 Node。

## 环境
- Rust (rustup)、Android Studio(含 SDK + NDK)、JDK 17
- export JAVA_HOME=... ANDROID_HOME=... NDK_HOME=$ANDROID_HOME/ndk/<版本>
- rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
- cargo install tauri-cli --version "^2" --locked

## 步骤
cargo tauri icon app-icon.png     # 生成 src-tauri/icons(首次必须)
cargo tauri dev                   # 桌面调试
cargo tauri android init          # 生成 Android 工程(首次)
cargo tauri android dev           # 连接手机/模拟器调试
cargo tauri android build --apk --target aarch64   # 打包 APK

## 扩充题库
编辑 src-tauri/questions.json。字段:id(唯一)/category/stem/options/answer(从0开始)/explanation。
category 必须是:言语理解、数量关系、判断推理、资料分析、常识判断 之一。

## 计算训练
- 题目由 Rust 随机生成(src-tauri/src/lib.rs 的 make 函数),每次不同,不占题库
- 题型:加减 / 乘法 / 平方 / 除法 / 分数(化百分数) / 增长(增减百分比) / 混合运算 / 综合
- 每题计时,答对自动下一题,答错显示正确答案;结束后给出正确率、平均用时、历史最佳
- 新增题型:在 DRILLS 常量里加一行,并在 make 里加一个 match 分支即可
- 单元测试:cargo test --manifest-path src-tauri/Cargo.toml

## 一键构建
- 本地:配置好 ANDROID_HOME / NDK_HOME / JAVA_HOME 后运行 ./build.sh
- 云端:把项目推到 GitHub,Actions 里的 "Build Android APK" 会自动构建,
  完成后在该次运行的 Artifacts 下载 xingce-apk(debug 签名,可直接安装到手机)
- 正式发布需要自己的 keystore 做 release 签名;当前为 debug 构建,仅供自用

## 游戏化(留存机制)
- 经验值与职级:答对 +10 XP(连击每3连加成,最多 +10),答错 +2;计算训练答对 +4/题,10题以上全对额外 +30。共 12 级(见习考生→部长)
- 连续打卡:每天首次答题即打卡;每满 7 天送 1 张补签卡(最多持有 2 张),漏一天时自动使用
- 每日目标:每天 20 题,达成 +20 XP
- 每日挑战:每天固定 5 道精选题(同一天题目相同),完成 +30 XP
- 成就:13 个徽章,解锁时弹窗 + 彩带
- 参数在 src-tauri/src/lib.rs 顶部常量(DAILY_GOAL / GOAL_BONUS / DAILY_BONUS / TITLES / ACHV)
- 日期按手机本地时区计算(前端传入),跨零点自动重置今日进度
