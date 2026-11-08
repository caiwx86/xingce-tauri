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
struct Progress {
    stats: BTreeMap<String, CatStat>,
    wrong: BTreeSet<u32>,
    #[serde(default)]
    drill: BTreeMap<String, DrillStat>,
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

/// mode: "全部" | "错题本" | 某个题型名称
#[tauri::command]
fn get_questions(state: State<AppState>, mode: String) -> Vec<Question> {
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

#[tauri::command]
fn submit_answer(state: State<AppState>, id: u32, choice: usize) -> Result<AnswerResult, String> {
    let q = state
        .questions
        .iter()
        .find(|q| q.id == id)
        .ok_or_else(|| format!("题目 {id} 不存在"))?;
    let correct = choice == q.answer;

    let mut p = state.progress.lock().unwrap();
    let st = p.stats.entry(q.category.clone()).or_default();
    st.done += 1;
    if correct {
        st.right += 1;
        p.wrong.remove(&id);
    } else {
        p.wrong.insert(id);
    }
    state.save(&p);

    Ok(AnswerResult {
        correct,
        answer: q.answer,
        explanation: q.explanation.clone(),
    })
}

#[tauri::command]
fn get_stats(state: State<AppState>) -> Progress {
    state.progress.lock().unwrap().clone()
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
    fn new() -> Self {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(88172645463325252);
        let mut r = Rng(nanos.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1);
        for _ in 0..8 {
            r.next();
        }
        r
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
) -> DrillStat {
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
    let out = st.clone();
    state.save(&p);
    out
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
            get_stats,
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
}
