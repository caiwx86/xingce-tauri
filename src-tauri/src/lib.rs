use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::PathBuf,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, State};

const CATS: [&str; 5] = ["言语理解", "数量关系", "判断推理", "资料分析", "常识判断"];

/// (名称, 说明, 速算小贴士)。第一项"综合"表示随机混合其余各类。
const DRILLS: [(&str, &str, &str); 8] = [
    ("综合", "各类速算随机混合", "先看数字特征再动笔:能凑整就凑整,能拆分就拆分,心算不出再列竖式。"),
    ("加减", "三、四位数加减法", "凑整法:397+256 = 400+256−3;减法可以先多减再补回,如 842−298 = 842−300+2。"),
    ("乘法", "两位数乘法与特殊乘数", "×11:首尾拆开中间相加(35×11=385);×25:÷4再×100;×15:×10再加一半;两位数×两位数可拆成 (a×10)+(a×个位)。"),
    ("平方", "11–35 的平方", "个位是5:十位×(十位+1)后接25,如 35²→3×4=12→1225。其余用 (a±b)² 展开,如 23²=20²+2×20×3+3²=529。"),
    ("除法", "整除除法", "÷5 = ×2÷10;÷25 = ×4÷100;÷4 可连除两次2;÷9、÷11 可先估商再验算。"),
    ("分数", "分数化百分数(保留1位小数)", "牢记:1/3≈33.3%、1/6≈16.7%、1/7≈14.3%、1/8=12.5%、1/9≈11.1%、1/11≈9.1%、1/12≈8.3%、1/16=6.25%。其余分数由它们倍数推出。"),
    ("增长", "增长/下降百分比计算", "增长15% = 原数 + 10% + 5%;下降20% 即乘0.8(原数×4÷5);增长25% 即乘1.25(原数×5÷4)。"),
    ("混合", "四则混合运算", "先乘除后加减,有括号先算括号;先估个位数验证结果是否合理。"),
];

/* ---------------- 游戏化常量 ---------------- */

const DAILY_GOAL: u32 = 20; // 每日目标题数
const GOAL_BONUS: u32 = 20; // 达成每日目标奖励 XP
const DAILY_BONUS: u32 = 30; // 完成每日挑战奖励 XP

/// 职级称号(等级 1..=12)
const TITLES: [&str; 12] = [
    "见习考生", "初级科员", "科员", "副主任科员", "主任科员", "副科长",
    "正科长", "副处长", "正处长", "副厅长", "正厅长", "部长",
];

/// (id, 图标, 名称, 说明)
const ACHV: [(&str, &str, &str, &str); 13] = [
    ("first", "🌱", "初出茅庐", "完成第一道题"),
    ("ans100", "📚", "题海战术", "累计答题 100 道"),
    ("ans500", "🏔️", "登堂入室", "累计答题 500 道"),
    ("streak3", "🔥", "三日不辍", "连续打卡 3 天"),
    ("streak7", "⚡", "七日之约", "连续打卡 7 天"),
    ("streak30", "👑", "月度坚持", "连续打卡 30 天"),
    ("combo10", "🎯", "连对达人", "连续答对 10 题"),
    ("perfect", "🧮", "神算子", "计算训练 10 题以上全部答对"),
    ("fast", "🚀", "快如闪电", "计算训练平均 ≤3 秒/题且正确率 ≥90%"),
    ("goal", "✅", "今日达标", "完成一次每日目标"),
    ("daily", "📅", "挑战者", "完成一次每日挑战"),
    ("lvl5", "📈", "升职加薪", "升到 5 级"),
    ("clean", "🧹", "错题清零", "清空错题本"),
];

fn level_of(xp: u32) -> u32 {
    let mut l = 1u32;
    while l < 12 && 50 * (l + 1) * l <= xp {
        l += 1;
    }
    l
}
fn level_floor(l: u32) -> u32 {
    50 * l * (l - 1)
}
fn level_next(l: u32) -> u32 {
    50 * (l + 1) * l
}

/// 公历日期 → 自 1970-01-01 起的天数(Howard Hinnant 算法)
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = (if y >= 0 { y } else { y - 399 }) / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

/// 解析 "YYYY-MM-DD"
fn day_num(s: &str) -> Option<i64> {
    let mut it = s.split('-');
    let y = it.next()?.parse().ok()?;
    let m = it.next()?.parse().ok()?;
    let d = it.next()?.parse().ok()?;
    Some(days_from_civil(y, m, d))
}

/* ---------------- 数据结构 ---------------- */

#[derive(Deserialize, Serialize, Clone)]
struct Question {
    id: u32,
    category: String,
    stem: String,
    options: Vec<String>,
    answer: usize,
    explanation: String,
}

#[derive(Default, Serialize, Deserialize, Clone)]
struct CatStat {
    done: u32,
    right: u32,
}

#[derive(Default, Serialize, Deserialize, Clone)]
struct DrillStat {
    runs: u32,
    done: u32,
    right: u32,
    /// 历史最佳平均用时(秒/题),仅统计题量≥5且正确率≥90%的训练
    best_avg_secs: Option<f64>,
}

#[derive(Default, Serialize, Deserialize, Clone)]
#[serde(default)]
struct Progress {
    stats: BTreeMap<String, CatStat>,
    wrong: BTreeSet<u32>,
    drill: BTreeMap<String, DrillStat>,
    // 游戏化
    xp: u32,
    streak: u32,
    best_streak: u32,
    freezes: u32, // 补签卡
    last_active: String,
    today: String,
    today_count: u32,
    goal_hit: String,   // 最近一次达成每日目标的日期
    daily_done: String, // 最近一次完成每日挑战的日期
    achv: BTreeSet<String>,
}

struct AppState {
    questions: Vec<Question>,
    progress: Mutex<Progress>,
    path: PathBuf,
}

impl AppState {
    fn save(&self, p: &Progress) {
        if let Ok(s) = serde_json::to_string(p) {
            let _ = fs::write(&self.path, s);
        }
    }
}

#[derive(Serialize, Clone)]
struct AchvInfo {
    id: &'static str,
    icon: &'static str,
    name: &'static str,
    desc: &'static str,
}

#[derive(Serialize, Default)]
struct AwardInfo {
    xp: u32,
    level: u32,
    title: &'static str,
    level_up: bool,
    goal_hit: bool,
    streak: u32,
    new_achv: Vec<AchvInfo>,
}

#[derive(Default)]
struct Event {
    base_xp: u32,
    answers: u32,
    combo: u32,
    drill: Option<(u32, u32, f64)>, // (题数, 答对数, 用时秒)
    cleared: bool,
    unlock: Option<&'static str>,
}

fn achv_info(id: &str) -> Option<AchvInfo> {
    ACHV.iter()
        .find(|a| a.0 == id)
        .map(|&(id, icon, name, desc)| AchvInfo { id, icon, name, desc })
}

fn unlock(p: &mut Progress, ids: &mut Vec<&'static str>, id: &'static str) {
    if p.achv.insert(id.to_string()) {
        ids.push(id);
    }
}

/// 当天首次活动时更新连续打卡;日期变化时重置今日计数
fn touch(p: &mut Progress, today: &str) {
    if p.today != today {
        p.today = today.to_string();
        p.today_count = 0;
    }
    if p.last_active == today {
        return;
    }
    let gap = match (day_num(today), day_num(&p.last_active)) {
        (Some(t), Some(l)) => t - l,
        _ => i64::MAX, // 首次使用
    };
    if gap <= 0 {
        return; // 系统时间回拨,不处理
    }
    if gap == 1 {
        p.streak += 1;
    } else if gap == 2 && p.freezes > 0 {
        p.freezes -= 1; // 自动使用补签卡
        p.streak += 1;
    } else {
        p.streak = 1;
    }
    p.last_active = today.to_string();
    p.best_streak = p.best_streak.max(p.streak);
    if p.streak % 7 == 0 {
        p.freezes = (p.freezes + 1).min(2); // 每满7天送一张补签卡,最多持有2张
    }
}

fn live_streak(p: &Progress, today: &str) -> u32 {
    match (day_num(today), day_num(&p.last_active)) {
        (Some(t), Some(l)) => {
            let gap = t - l;
            if gap <= 1 || (gap == 2 && p.freezes > 0) {
                p.streak
            } else {
                0
            }
        }
        _ => 0,
    }
}

/// 结算一次事件:经验、等级、每日目标、连续打卡、成就
fn award(p: &mut Progress, today: &str, ev: Event) -> AwardInfo {
    touch(p, today);
    let before = level_of(p.xp);

    let mut gained = ev.base_xp;
    p.today_count += ev.answers;
    let mut goal_hit = false;
    if p.today_count >= DAILY_GOAL && p.goal_hit != today {
        p.goal_hit = today.to_string();
        gained += GOAL_BONUS;
        goal_hit = true;
    }
    p.xp += gained;
    let level = level_of(p.xp);

    let total: u32 = p.stats.values().map(|s| s.done).sum::<u32>()
        + p.drill.values().map(|s| s.done).sum::<u32>();
    let mut ids: Vec<&'static str> = Vec::new();
    if total >= 1 {
        unlock(p, &mut ids, "first");
    }
    if total >= 100 {
        unlock(p, &mut ids, "ans100");
    }
    if total >= 500 {
        unlock(p, &mut ids, "ans500");
    }
    if p.streak >= 3 {
        unlock(p, &mut ids, "streak3");
    }
    if p.streak >= 7 {
        unlock(p, &mut ids, "streak7");
    }
    if p.streak >= 30 {
        unlock(p, &mut ids, "streak30");
    }
    if ev.combo >= 10 {
        unlock(p, &mut ids, "combo10");
    }
    if let Some((t, r, secs)) = ev.drill {
        if t >= 10 && r == t {
            unlock(p, &mut ids, "perfect");
        }
        if t >= 10 && r * 10 >= t * 9 && secs / t as f64 <= 3.0 {
            unlock(p, &mut ids, "fast");
        }
    }
    if p.goal_hit == today {
        unlock(p, &mut ids, "goal");
    }
    if level >= 5 {
        unlock(p, &mut ids, "lvl5");
    }
    if ev.cleared {
        unlock(p, &mut ids, "clean");
    }
    if let Some(id) = ev.unlock {
        unlock(p, &mut ids, id);
    }

    AwardInfo {
        xp: gained,
        level,
        title: TITLES[(level - 1) as usize],
        level_up: level > before,
        goal_hit,
        streak: p.streak,
        new_achv: ids.iter().filter_map(|id| achv_info(id)).collect(),
    }
}

/* ---------------- 题库 ---------------- */

#[derive(Serialize)]
struct CatInfo {
    name: String,
    count: usize,
}

#[derive(Serialize)]
struct AnswerResult {
    correct: bool,
    answer: usize,
    explanation: String,
    combo: u32,
    award: AwardInfo,
}

#[tauri::command]
fn list_categories(state: State<AppState>) -> Vec<CatInfo> {
    CATS.iter()
        .map(|c| CatInfo {
            name: c.to_string(),
            count: state.questions.iter().filter(|q| q.category == *c).count(),
        })
        .collect()
}

/// mode: "全部" | "错题本" | "每日挑战" | 某个题型名称
#[tauri::command]
fn get_questions(state: State<AppState>, mode: String, today: Option<String>) -> Vec<Question> {
    if mode == "每日挑战" {
        // 以日期为种子,同一天题目固定
        let seed = today.as_deref().and_then(day_num).unwrap_or(0) as u64;
        let mut r = Rng::seeded(seed);
        let mut idx: Vec<usize> = (0..state.questions.len()).collect();
        for i in (1..idx.len()).rev() {
            let j = (r.next() % (i as u64 + 1)) as usize;
            idx.swap(i, j);
        }
        idx.truncate(5);
        return idx.into_iter().map(|i| state.questions[i].clone()).collect();
    }
    let p = state.progress.lock().unwrap();
    state
        .questions
        .iter()
        .filter(|q| match mode.as_str() {
            "全部" => true,
            "错题本" => p.wrong.contains(&q.id),
            c => q.category == c,
        })
        .cloned()
        .collect()
}

/// combo: 本次作答前的连对数(由前端维护)
#[tauri::command]
fn submit_answer(
    state: State<AppState>,
    id: u32,
    choice: usize,
    combo: u32,
    today: String,
) -> Result<AnswerResult, String> {
    let q = state
        .questions
        .iter()
        .find(|q| q.id == id)
        .ok_or_else(|| format!("题目 {id} 不存在"))?;
    let correct = choice == q.answer;

    let mut p = state.progress.lock().unwrap();
    let st = p.stats.entry(q.category.clone()).or_default();
    st.done += 1;
    let mut cleared = false;
    if correct {
        st.right += 1;
        cleared = p.wrong.remove(&id) && p.wrong.is_empty();
    } else {
        p.wrong.insert(id);
    }

    let new_combo = if correct { combo + 1 } else { 0 };
    let base = if correct { 10 + 2 * (new_combo / 3).min(5) } else { 2 };
    let aw = award(
        &mut p,
        &today,
        Event { base_xp: base, answers: 1, combo: new_combo, cleared, ..Default::default() },
    );
    state.save(&p);

    Ok(AnswerResult {
        correct,
        answer: q.answer,
        explanation: q.explanation.clone(),
        combo: new_combo,
        award: aw,
    })
}

/// 完成每日挑战后领取奖励(每天仅一次)
#[tauri::command]
fn claim_daily(state: State<AppState>, today: String) -> AwardInfo {
    let mut p = state.progress.lock().unwrap();
    if p.daily_done == today {
        let level = level_of(p.xp);
        return AwardInfo {
            level,
            title: TITLES[(level - 1) as usize],
            streak: live_streak(&p, &today),
            ..Default::default()
        };
    }
    p.daily_done = today.clone();
    let aw = award(
        &mut p,
        &today,
        Event { base_xp: DAILY_BONUS, unlock: Some("daily"), ..Default::default() },
    );
    state.save(&p);
    aw
}

#[tauri::command]
fn get_stats(state: State<AppState>) -> Progress {
    state.progress.lock().unwrap().clone()
}

#[derive(Serialize)]
struct AchvView {
    id: &'static str,
    icon: &'static str,
    name: &'static str,
    desc: &'static str,
    unlocked: bool,
}

#[derive(Serialize)]
struct Profile {
    xp: u32,
    level: u32,
    title: &'static str,
    level_floor: u32,
    level_next: u32,
    streak: u32,
    best_streak: u32,
    freezes: u32,
    today_count: u32,
    goal: u32,
    daily_done: bool,
    achievements: Vec<AchvView>,
}

#[tauri::command]
fn get_profile(state: State<AppState>, today: String) -> Profile {
    let p = state.progress.lock().unwrap();
    let level = level_of(p.xp);
    Profile {
        xp: p.xp,
        level,
        title: TITLES[(level - 1) as usize],
        level_floor: level_floor(level),
        level_next: level_next(level),
        streak: live_streak(&p, &today),
        best_streak: p.best_streak,
        freezes: p.freezes,
        today_count: if p.today == today { p.today_count } else { 0 },
        goal: DAILY_GOAL,
        daily_done: p.daily_done == today,
        achievements: ACHV
            .iter()
            .map(|&(id, icon, name, desc)| AchvView {
                id,
                icon,
                name,
                desc,
                unlocked: p.achv.contains(id),
            })
            .collect(),
    }
}

#[tauri::command]
fn reset_progress(state: State<AppState>) {
    let mut p = state.progress.lock().unwrap();
    *p = Progress::default();
    state.save(&p);
}

/* ---------------- 计算训练 ---------------- */

/// 简易 xorshift64 随机数(避免额外依赖)
struct Rng(u64);

impl Rng {
    fn seeded(seed: u64) -> Self {
        let mut r = Rng(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15).wrapping_add(0x1234_5678_9ABC_DEF1) | 1);
        for _ in 0..8 {
            r.next();
        }
        r
    }
    fn new() -> Self {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(88172645463325252);
        Rng::seeded(nanos)
    }
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    /// 闭区间 [lo, hi]
    fn range(&mut self, lo: i64, hi: i64) -> i64 {
        lo + (self.next() % (hi - lo + 1) as u64) as i64
    }
    fn pick<T: Copy>(&mut self, xs: &[T]) -> T {
        xs[(self.next() % xs.len() as u64) as usize]
    }
}

#[derive(Serialize)]
struct DrillInfo {
    name: &'static str,
    desc: &'static str,
    tip: &'static str,
}

#[derive(Serialize)]
struct DrillQ {
    text: String,
    answer: f64,
    /// 允许误差,整数题为 0
    tol: f64,
}

#[derive(Serialize)]
struct DrillResult {
    stat: DrillStat,
    award: AwardInfo,
}

fn make(kind: &str, r: &mut Rng) -> DrillQ {
    let ex = |text: String, ans: i64| DrillQ {
        text,
        answer: ans as f64,
        tol: 0.0,
    };
    match kind {
        "乘法" => {
            let (a, b) = match r.range(0, 2) {
                0 => (r.range(12, 99), r.range(3, 9)),
                1 => (r.range(12, 99), r.pick(&[11i64, 12, 15, 25])),
                _ => (r.range(11, 35), r.range(11, 35)),
            };
            ex(format!("{a} × {b} = ?"), a * b)
        }
        "平方" => {
            let n = r.range(11, 35);
            ex(format!("{n}² = ?"), n * n)
        }
        "除法" => {
            let b = r.range(3, 19);
            let q = r.range(12, 99);
            ex(format!("{} ÷ {b} = ?", b * q), q)
        }
        "分数" => {
            let n = r.range(3, 20);
            let k = r.range(1, (n - 1).min(3));
            let v = ((100.0 * k as f64 / n as f64) * 10.0).round() / 10.0;
            DrillQ {
                text: format!("{k}/{n} ≈ ?%(保留1位小数)"),
                answer: v,
                tol: 0.06,
            }
        }
        "增长" => {
            let a = 20 * r.range(5, 60);
            let p = r.pick(&[5i64, 10, 15, 20, 25, 30, 40, 50]);
            if r.range(0, 1) == 0 {
                ex(format!("{a} 增长 {p}% 后是多少?"), a * (100 + p) / 100)
            } else {
                ex(format!("{a} 下降 {p}% 后是多少?"), a * (100 - p) / 100)
            }
        }
        "混合" => {
            if r.range(0, 1) == 0 {
                let a = r.range(10, 99);
                let b = r.range(2, 12);
                let c = r.range(2, 12);
                let s = a + b * c;
                let d = r.range(10, s.min(99));
                ex(format!("{a} + {b} × {c} − {d} = ?"), s - d)
            } else {
                let a = r.range(10, 50);
                let b = r.range(10, 50);
                let c = r.range(2, 9);
                ex(format!("({a} + {b}) × {c} = ?"), (a + b) * c)
            }
        }
        // "加减" 以及未知类型
        _ => {
            let big = r.range(0, 2) == 0;
            let x = if big { r.range(1000, 9999) } else { r.range(100, 999) };
            let y = r.range(100, 999);
            let (a, b) = if x >= y { (x, y) } else { (y, x) };
            if r.range(0, 1) == 0 {
                ex(format!("{a} + {b} = ?"), a + b)
            } else {
                ex(format!("{a} − {b} = ?"), a - b)
            }
        }
    }
}

#[tauri::command]
fn list_drills() -> Vec<DrillInfo> {
    DRILLS
        .iter()
        .map(|&(name, desc, tip)| DrillInfo { name, desc, tip })
        .collect()
}

#[tauri::command]
fn gen_drill(kind: String, count: u32) -> Vec<DrillQ> {
    let mut r = Rng::new();
    let pool: Vec<&str> = DRILLS.iter().skip(1).map(|d| d.0).collect();
    (0..count.clamp(1, 50))
        .map(|_| {
            let k: &str = if kind == "综合" { r.pick(&pool) } else { &kind };
            make(k, &mut r)
        })
        .collect()
}

#[tauri::command]
fn record_drill(
    state: State<AppState>,
    kind: String,
    total: u32,
    right: u32,
    secs: f64,
    today: String,
) -> DrillResult {
    let mut p = state.progress.lock().unwrap();
    let st = p.drill.entry(kind).or_default();
    st.runs += 1;
    st.done += total;
    st.right += right;
    if total >= 5 && right * 10 >= total * 9 && secs > 0.0 {
        let avg = secs / total as f64;
        if st.best_avg_secs.map_or(true, |b| avg < b) {
            st.best_avg_secs = Some(avg);
        }
    }
    let stat = st.clone();

    let base = right * 4 + if total >= 10 && right == total { 30 } else { 0 };
    let aw = award(
        &mut p,
        &today,
        Event { base_xp: base, answers: total, drill: Some((total, right, secs)), ..Default::default() },
    );
    state.save(&p);
    DrillResult { stat, award: aw }
}

/* ---------------- 入口 ---------------- */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            fs::create_dir_all(&dir)?;
            let path = dir.join("progress.json");

            let questions: Vec<Question> =
                serde_json::from_str(include_str!("../questions.json"))?;
            let progress: Progress = fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default();

            app.manage(AppState {
                questions,
                progress: Mutex::new(progress),
                path,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_categories,
            get_questions,
            submit_answer,
            claim_daily,
            get_stats,
            get_profile,
            reset_progress,
            list_drills,
            gen_drill,
            record_drill
        ])
        .run(tauri::generate_context!())
        .expect("启动失败");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drills_are_sane() {
        let mut r = Rng::new();
        for (name, _, _) in DRILLS.iter().skip(1) {
            for _ in 0..500 {
                let q = make(name, &mut r);
                assert!(q.answer >= 0.0, "{name}: {}", q.text);
            }
        }
    }

    #[test]
    fn date_math() {
        assert_eq!(day_num("2026-03-01").unwrap() - day_num("2026-02-28").unwrap(), 1);
        assert_eq!(day_num("2024-03-01").unwrap() - day_num("2024-02-28").unwrap(), 2);
        assert_eq!(day_num("1970-01-01"), Some(0));
    }

    #[test]
    fn levels() {
        assert_eq!(level_of(0), 1);
        assert_eq!(level_of(99), 1);
        assert_eq!(level_of(100), 2);
        assert_eq!(level_of(1000), 5);
        assert_eq!(level_of(u32::MAX / 2), 12);
    }

    #[test]
    fn streak_and_freeze() {
        let mut p = Progress::default();
        touch(&mut p, "2026-11-01");
        touch(&mut p, "2026-11-02");
        assert_eq!(p.streak, 2);
        touch(&mut p, "2026-11-04"); // 断了一天,无补签卡 → 重置
        assert_eq!(p.streak, 1);
        p.freezes = 1;
        touch(&mut p, "2026-11-06"); // 断一天,用补签卡 → 续上
        assert_eq!(p.streak, 2);
        assert_eq!(p.freezes, 0);
    }

    #[test]
    fn goal_and_achievements() {
        let mut p = Progress::default();
        let a = award(&mut p, "2026-11-09", Event { base_xp: 10, answers: DAILY_GOAL, ..Default::default() });
        assert!(a.goal_hit);
        assert_eq!(a.xp, 10 + GOAL_BONUS);
        assert!(p.achv.contains("goal"));
        assert_eq!(a.new_achv.len(), 1);
    }
}
