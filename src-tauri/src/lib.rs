use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, State};

const CATS: [&str; 5] = ["言语理解", "数量关系", "判断推理", "资料分析", "常识判断"];
const DAILY_COUNT: usize = 5;
const SMART_REVIEW_LIMIT: usize = 20;
const HISTORY_LIMIT: usize = 500;
/// 艾宾浩斯复习间隔（天）：新学 -> 1 -> 2 -> 4 -> 7 -> 15 -> 30 -> 60
const REVIEW_INTERVALS: [i64; 8] = [0, 1, 2, 4, 7, 15, 30, 60];
const PROGRESS_FILE: &str = "progress.json";
const BACKUP_FILE: &str = "progress.backup.json";

/// (名称， 说明， 速算小贴士)。第一项"综合"表示随机混合其余各类。
const DRILLS: [(&str, &str, &str); 21] = [
    ("综合", "各类速算随机混合", "先看数字特征再动笔：能凑整就凑整，能拆分就拆分，心算不出再列竖式。"),
    ("加减", "三、四位数加减法", "凑整法：397+256 = 400+256−3；减法可以先多减再补回，如 842−298 = 842−300+2。"),
    ("乘法", "两位数乘法与特殊乘数", "×11：首尾拆开中间相加（35×11=385）；×25：÷4再×100；×15：×10再加一半；两位数×两位数可拆成（a×10）+（a×个位）。"),
    ("平方", "11–35 的平方", "个位是5：十位×（十位+1）后接25，如 35²→3×4=12→1225。其余用（a±b）² 展开，如 23²=20²+2×20×3+3²=529。"),
    ("除法", "整除除法", "÷5 = ×2÷10；÷25 = ×4÷100；÷4 可连除两次2；÷9、÷11 可先估商再验算。"),
    ("分数", "分数化百分数（保留1位小数）", "牢记：1/3≈33.3%、1/6≈16.7%、1/7≈14.3%、1/8=12.5%、1/9≈11.1%、1/11≈9.1%、1/12≈8.3%、1/16=6.25%。其余分数由它们倍数推出。"),
    ("资料分析", "资料分析基础运算混合", "先判断求的是增长率、增长量、基期量还是比重，再选公式；能估算就先估算。"),
    ("百分比", "求一个数的百分之几", "把百分数拆成 10%、5% 等好算的份再相加；如 240×15% = 240×10% + 240×5%。"),
    ("增长", "增长/下降百分比计算", "增长15% = 原数 + 10% + 5%；下降20% 即乘0.8（原数×4÷5）；增长25% 即乘1.25（原数×5÷4）。"),
    ("增长量", "由基期量和增长率求增长量", "增长量 = 基期量 × 增长率；也可以先求现期量再相减。"),
    ("基期量", "由现期量和增长率求基期量", "基期量 = 现期量 ÷（1+增长率）；增长20% 就除以1.2，增长25% 就除以1.25。"),
    ("比重", "部分量占整体量的比例", "比重 = 部分量 ÷ 整体量；算完记得乘100%并保留1位小数。"),
    ("平均数", "总量除以份数", "平均数 = 总量 ÷ 份数；先看总量和份数的量级，答案应在两者之间。"),
    ("倍数", "求两个量的倍数关系", "倍数 = A ÷ B；注意“是几倍”和“多几倍”差1。"),
    ("百分点", "两个百分数直接相减", "百分点 = 现期比重 − 基期比重；百分数相减得到的是百分点，不是增长率。"),
    ("隔年增长", "连续两年增长率求隔年增长率", "隔年增长率 = r1 + r2 + r1×r2；先算前两项，再加乘积。"),
    ("年均增长量", "由初期量、末期量和年数求年均增长量", "年均增长量 =（末期量 − 初期量）÷ 年数；年数是末年减初年。"),
    ("年均增长率", "由初期量、末期量和年数求年均增长率", "年均增长率 =（末期量 ÷ 初期量）^(1/年数) − 1；可用常见增长率代入验证。"),
    ("贡献率", "部分增长量占整体增长量的比例", "增长贡献率 = 部分增长量 ÷ 整体增长量 × 100%；分母是整体增长量。"),
    ("估算", "四舍五入到整百估算乘积", "把两个数分别看成接近的整十/整百数再相乘，最后按题目要求取整。"),
    ("混合", "四则混合运算", "先乘除后加减，有括号先算括号；先估个位数验证结果是否合理。"),
];

/// (id, 分组, 名称, 公式, 说明, 例子)
const FORMULAS: [(&str, &str, &str, &str, &str, &str); 43] = [
    (
        "growth-rate",
        "资料·增长",
        "增长率",
        "增长率 = （现期量 − 基期量） ÷ 基期量 = 增长量 ÷ 基期量",
        "增长率表示现期量比基期量增长了百分之几。",
        "基期量500，现期量600，增长率 =（600−500）÷500 = 20%。",
    ),
    (
        "growth-amount",
        "资料·增长",
        "增长量",
        "增长量 = 现期量 − 基期量 = 基期量 × 增长率",
        "增长量是绝对量，增长率是相对量，两者不能混用。",
        "基期量500，增长20%，增长量 = 500×20% = 100。",
    ),
    (
        "base-value",
        "资料·增长",
        "基期量",
        "基期量 = 现期量 ÷（1 + 增长率）",
        "已知现期量和增长率，求基期量用除法。",
        "现期量600，增长20%，基期量 = 600÷1.2 = 500。",
    ),
    (
        "current-value",
        "资料·增长",
        "现期量",
        "现期量 = 基期量 ×（1 + 增长率）",
        "已知基期量和增长率，求现期量用乘法。",
        "基期量500，增长20%，现期量 = 500×1.2 = 600。",
    ),
    (
        "inter-year",
        "资料·增长",
        "隔年增长率",
        "隔年增长率 = r1 + r2 + r1 × r2",
        "r1、r2 为相邻两年的增长率；隔年增长量 = 基期量 × 隔年增长率。",
        "两年增长率分别为10%和20%，隔年增长率 = 10%+20%+10%×20% = 32%。",
    ),
    (
        "annual-amount",
        "资料·增长",
        "年均增长量",
        "年均增长量 =（末期量 − 初期量） ÷ 年数",
        "年数 = 末年 − 初年，不是末年 − 初年 + 1。",
        "2019年100，2024年160，年均增长量 =（160−100）÷5 = 12。",
    ),
    (
        "annual-rate",
        "资料·增长",
        "年均增长率",
        "年均增长率 =（末期量 ÷ 初期量）^（1/年数） − 1",
        "开方不好算时，可用选项代入或估算。",
        "初期100，末期121，年数2，年均增长率 =（121÷100）^(1/2)−1 = 10%。",
    ),
    (
        "ratio",
        "资料·比重",
        "比重",
        "比重 = 部分量 ÷ 整体量 × 100%",
        "比重是部分占整体的百分比，整体量在分母。",
        "部分量180，整体量600，比重 = 180÷600 = 30%。",
    ),
    (
        "part-value",
        "资料·比重",
        "部分量",
        "部分量 = 整体量 × 比重",
        "已知整体量和比重，求部分量用乘法。",
        "整体量600，比重30%，部分量 = 600×30% = 180。",
    ),
    (
        "whole-value",
        "资料·比重",
        "整体量",
        "整体量 = 部分量 ÷ 比重",
        "已知部分量和比重，求整体量用除法。",
        "部分量180，比重30%，整体量 = 180÷30% = 600。",
    ),
    (
        "percentage-point",
        "资料·比重",
        "百分点",
        "百分点 = 现期比重 − 基期比重",
        "两个百分数相减，单位是百分点，不是百分数。",
        "比重从30%提高到35%，提高了5个百分点。",
    ),
    (
        "average",
        "资料·平均",
        "平均数",
        "平均数 = 总量 ÷ 份数",
        "平均数反映整体水平，注意总量和份数要对应。",
        "总量240，份数6，平均数 = 240÷6 = 40。",
    ),
    (
        "multiple",
        "资料·平均",
        "倍数",
        "倍数 = A ÷ B",
        "“A 是 B 的几倍”用除法；“A 比 B 多几倍”再减1。",
        "A=240，B=60，A 是 B 的4倍，A 比 B 多3倍。",
    ),
    (
        "mixed-growth",
        "资料·综合",
        "混合增长率",
        "整体增长率介于两部分增长率之间，偏向基期量大的部分",
        "用于两部分合成整体的增长率判断，先定性再计算。",
        "两部分增长率分别为10%和20%，整体增长率一定在10%–20%之间。",
    ),
    (
        "contribution",
        "资料·综合",
        "增长贡献率",
        "增长贡献率 = 部分增长量 ÷ 整体增长量 × 100%",
        "贡献率的分母是整体增长量，不是整体量。",
        "整体增长100，某部分增长30，贡献率 = 30÷100 = 30%。",
    ),
    (
        "work-total",
        "数量·工程",
        "工程总量",
        "工作总量 = 工作效率 × 工作时间",
        "工程问题先设总量为效率的最小公倍数，通常更好算。",
        "效率20，时间6，工作总量 = 20×6 = 120。",
    ),
    (
        "work-efficiency",
        "数量·工程",
        "合作效率",
        "合作效率 = 各人效率之和",
        "合作时效率相加，时间取倒数后再相加也可以。",
        "甲效率10，乙效率15，合作效率 = 10+15 = 25。",
    ),
    (
        "work-time",
        "数量·工程",
        "合作时间",
        "合作时间 = 工作总量 ÷ 合作效率",
        "先求效率和，再用总量除以效率和。",
        "总量120，合作效率30，合作时间 = 120÷30 = 4。",
    ),
    (
        "distance",
        "数量·行程",
        "路程",
        "路程 = 速度 × 时间",
        "行程问题先统一单位，再代入公式。",
        "速度60，时间2，路程 = 60×2 = 120。",
    ),
    (
        "meeting",
        "数量·行程",
        "相遇时间",
        "相遇时间 = 路程和 ÷ 速度和",
        "相向而行用速度和；同向追及用速度差。",
        "路程和120，速度和60，相遇时间 = 120÷60 = 2。",
    ),
    (
        "catch-up",
        "数量·行程",
        "追及时间",
        "追及时间 = 路程差 ÷ 速度差",
        "追及问题找初始距离差和速度差。",
        "路程差100，速度差10，追及时间 = 100÷10 = 10。",
    ),
    (
        "boat",
        "数量·行程",
        "流水行船",
        "顺水速度 = 船速 + 水速；逆水速度 = 船速 − 水速",
        "船速 =（顺水速度 + 逆水速度）÷2；水速 =（顺水 − 逆水）÷2。",
        "船速20，水速5，顺水25，逆水15。",
    ),
    (
        "profit",
        "数量·经济",
        "利润",
        "利润 = 售价 − 成本",
        "利润是绝对量，利润率是相对量。",
        "售价120，成本100，利润 = 120−100 = 20。",
    ),
    (
        "profit-rate",
        "数量·经济",
        "利润率",
        "利润率 = 利润 ÷ 成本 × 100%",
        "利润率的分母是成本，不是售价。",
        "利润20，成本100，利润率 = 20÷100 = 20%。",
    ),
    (
        "price",
        "数量·经济",
        "售价",
        "售价 = 成本 ×（1 + 利润率）",
        "已知成本和利润率求售价，用乘法。",
        "成本100，利润率20%，售价 = 100×1.2 = 120。",
    ),
    (
        "discount",
        "数量·经济",
        "折扣",
        "折扣 = 售价 ÷ 标价",
        "八折表示售价是标价的80%。",
        "售价120，标价150，折扣 = 120÷150 = 80%，即八折。",
    ),
    (
        "concentration",
        "数量·溶液",
        "浓度",
        "浓度 = 溶质 ÷ 溶液 × 100%",
        "溶液 = 溶质 + 溶剂；稀释前后溶质质量不变。",
        "溶质20，溶液100，浓度 = 20÷100 = 20%。",
    ),
    (
        "solute",
        "数量·溶液",
        "溶质",
        "溶质 = 溶液 × 浓度",
        "已知溶液和浓度求溶质，用乘法。",
        "溶液200，浓度15%，溶质 = 200×15% = 30。",
    ),
    (
        "permutation",
        "数量·计数",
        "排列数",
        "A(n,m) = n! ÷（n−m）!",
        "排列与顺序有关；从n个不同元素中取m个排列。",
        "A(5,3) = 5×4×3 = 60。",
    ),
    (
        "combination",
        "数量·计数",
        "组合数",
        "C(n,m) = n! ÷ [m!（n−m）!]",
        "组合与顺序无关；C(n,m)=C(n,n−m)。",
        "C(5,3) = 5×4×3 ÷（3×2×1） = 10。",
    ),
    (
        "probability",
        "数量·计数",
        "概率",
        "概率 = 有利结果数 ÷ 总结果数",
        "概率一定在0到1之间，最后可化成百分数。",
        "有利结果3，总结果10，概率 = 3÷10 = 30%。",
    ),
    (
        "inclusion-exclusion",
        "数量·计数",
        "两集合容斥",
        "|A∪B| = |A| + |B| − |A∩B|",
        "至少满足一个条件的数量 = 两类数量之和 − 同时满足的数量。",
        "|A|=30，|B|=25，|A∩B|=10，|A∪B| = 30+25−10 = 45。",
    ),
    (
        "arithmetic-term",
        "数量·数列",
        "等差数列通项",
        "aₙ = a₁ +（n−1）d",
        "d为公差；第n项比首项多(n−1)个公差。",
        "a₁=3，d=4，n=10，a₁₀ = 3+9×4 = 39。",
    ),
    (
        "arithmetic-sum",
        "数量·数列",
        "等差数列求和",
        "Sₙ = n（a₁ + aₙ） ÷ 2",
        "等差数列求和等于“首项加末项乘项数除以2”。",
        "a₁=3，a₁₀=39，n=10，S₁₀ = 10×（3+39）÷2 = 210。",
    ),
    (
        "geometric-term",
        "数量·数列",
        "等比数列通项",
        "aₙ = a₁ × q^（n−1）",
        "q为公比；第n项比首项多乘(n−1)次公比。",
        "a₁=2，q=3，n=4，a₄ = 2×3³ = 54。",
    ),
    (
        "geometric-sum",
        "数量·数列",
        "等比数列求和",
        "Sₙ = a₁（1 − qⁿ） ÷（1 − q），q ≠ 1",
        "q=1时，Sₙ=n×a₁。",
        "a₁=2，q=3，n=4，S₄ = 2×（1−81）÷（1−3） = 80。",
    ),
    (
        "rectangle",
        "数量·几何",
        "长方形面积",
        "长方形面积 = 长 × 宽",
        "周长 = 2×（长+宽）。",
        "长5，宽4，面积 = 5×4 = 20。",
    ),
    (
        "triangle",
        "数量·几何",
        "三角形面积",
        "三角形面积 = 底 × 高 ÷ 2",
        "同底等高的三角形面积相等。",
        "底6，高4，面积 = 6×4÷2 = 12。",
    ),
    (
        "circle",
        "数量·几何",
        "圆面积",
        "圆面积 = π × 半径²",
        "周长 = 2πr；直径d=2r。",
        "半径3，面积 = π×3² = 9π。",
    ),
    (
        "cylinder",
        "数量·几何",
        "圆柱体积",
        "圆柱体积 = π × 半径² × 高",
        "底面积乘高；圆锥体积是等底等高圆柱的1/3。",
        "半径2，高5，体积 = π×2²×5 = 20π。",
    ),
    (
        "chicken-rabbit",
        "数量·杂题",
        "鸡兔同笼",
        "兔数 =（总脚数 − 2 × 总头数） ÷ 2",
        "假设全是鸡，多出来的脚每2只对应1只兔。",
        "35个头、94只脚，兔 =（94−70）÷2 = 12只。",
    ),
    (
        "age-difference",
        "数量·杂题",
        "年龄问题",
        "两人的年龄差始终不变",
        "年龄同时增长，倍数关系会变化，但差不变。",
        "父亲40岁、儿子10岁，差30岁；5年后差仍是30岁。",
    ),
    (
        "cow-grass",
        "数量·杂题",
        "牛吃草",
        "原有草量 =（牛数 − 每天生长量）× 天数",
        "草在吃的同时生长，先求每天新长草量。",
        "牛20头，每天长5份，吃10天，原有草量 =（20−5）×10 = 150份。",
    ),
];

const FORMULA_EXERCISES: [(&str, &str, &str, &str, f64, f64, &str, &str); 25] = [
    (
        "growth-rate",
        "资料",
        "增长率",
        "基期量为500，现期量为600，增长率是多少？",
        20,
        0.06,
        "%",
        "（600−500）÷500=20%。",
    ),
    (
        "growth-amount",
        "资料",
        "增长量",
        "基期量为500，同比增长20%，增长量是多少？",
        100,
        0.0,
        "",
        "500×20%=100。",
    ),
    (
        "base-value",
        "资料",
        "基期量",
        "现期量为600，同比增长20%，基期量是多少？",
        500,
        0.0,
        "",
        "600÷1.2=500。",
    ),
    (
        "current-value",
        "资料",
        "现期量",
        "基期量为500，同比增长20%，现期量是多少？",
        600,
        0.0,
        "",
        "500×1.2=600。",
    ),
    (
        "inter-year",
        "资料",
        "隔年增长率",
        "连续两年分别增长10%和20%，隔年增长率是多少？",
        32,
        0.06,
        "%",
        "10%+20%+10%×20%=32%。",
    ),
    (
        "annual-amount",
        "资料",
        "年均增长量",
        "初期量100，5年后为160，年均增长量是多少？",
        12,
        0.0,
        "",
        "（160−100）÷5=12。",
    ),
    (
        "annual-rate",
        "资料",
        "年均增长率",
        "初期量100，2年后为121，年均增长率是多少？",
        10,
        0.06,
        "%",
        "（121÷100）^(1/2)−1=10%。",
    ),
    (
        "ratio",
        "资料",
        "比重",
        "部分量180，整体量600，比重是多少？",
        30,
        0.06,
        "%",
        "180÷600=30%。",
    ),
    (
        "part-value",
        "资料",
        "部分量",
        "整体量600，比重30%，部分量是多少？",
        180,
        0.0,
        "",
        "600×30%=180。",
    ),
    (
        "whole-value",
        "资料",
        "整体量",
        "部分量180，比重30%，整体量是多少？",
        600,
        0.0,
        "",
        "180÷30%=600。",
    ),
    (
        "percentage-point",
        "资料",
        "百分点",
        "比重从30%提高到35%，提高了多少个百分点？",
        5,
        0.0,
        "",
        "35−30=5个百分点。",
    ),
    (
        "average",
        "资料",
        "平均数",
        "总量240，份数6，平均数是多少？",
        40,
        0.0,
        "",
        "240÷6=40。",
    ),
    (
        "multiple",
        "资料",
        "倍数",
        "A=240，B=60，A是B的多少倍？",
        4,
        0.0,
        "",
        "240÷60=4。",
    ),
    (
        "contribution",
        "资料",
        "增长贡献率",
        "整体增长量100，某部分增长量30，增长贡献率是多少？",
        30,
        0.06,
        "%",
        "30÷100=30%。",
    ),
    (
        "work-time",
        "数量",
        "合作时间",
        "工作总量120，合作效率30，合作时间是多少？",
        4,
        0.0,
        "天",
        "120÷30=4天。",
    ),
    (
        "distance",
        "数量",
        "路程",
        "速度60，时间2，路程是多少？",
        120,
        0.0,
        "",
        "60×2=120。",
    ),
    (
        "meeting",
        "数量",
        "相遇时间",
        "路程和120，速度和60，相遇时间是多少？",
        2,
        0.0,
        "小时",
        "120÷60=2小时。",
    ),
    (
        "catch-up",
        "数量",
        "追及时间",
        "路程差200，速度差2，追及时间是多少？",
        100,
        0.0,
        "秒",
        "200÷2=100秒。",
    ),
    (
        "profit-rate",
        "数量",
        "利润率",
        "成本100，售价120，利润率是多少？",
        20,
        0.06,
        "%",
        "（120−100）÷100=20%。",
    ),
    (
        "discount",
        "数量",
        "折扣",
        "售价120，标价150，折扣是多少？",
        80,
        0.06,
        "%",
        "120÷150=80%，即八折。",
    ),
    (
        "concentration",
        "数量",
        "浓度",
        "溶质20，溶液100，浓度是多少？",
        20,
        0.06,
        "%",
        "20÷100=20%。",
    ),
    (
        "combination",
        "数量",
        "组合数",
        "C(5,3)是多少？",
        10,
        0.0,
        "",
        "5×4×3÷（3×2×1）=10。",
    ),
    (
        "inclusion-exclusion",
        "数量",
        "两集合容斥",
        "|A|=30，|B|=25，|A∩B|=10，|A∪B|是多少？",
        45,
        0.0,
        "",
        "30+25−10=45。",
    ),
    (
        "arithmetic-term",
        "数量",
        "等差数列通项",
        "等差数列首项3，公差4，第10项是多少？",
        39,
        0.0,
        "",
        "3+9×4=39。",
    ),
    (
        "chicken-rabbit",
        "数量",
        "鸡兔同笼",
        "35个头、94只脚，兔有多少只？",
        12,
        0.0,
        "只",
        "（94−70）÷2=12只。",
    ),
];

/* ---------------- 游戏化常量 ---------------- */

const DAILY_GOAL: u32 = 20; // 每日目标题数
const GOAL_BONUS: u32 = 20; // 达成每日目标奖励 XP
const DAILY_BONUS: u32 = 30; // 完成每日挑战奖励 XP

/// 职级称号(等级 1..=12)
const TITLES: [&str; 12] = [
    "见习考生",
    "初级科员",
    "科员",
    "副主任科员",
    "主任科员",
    "副科长",
    "正科长",
    "副处长",
    "正处长",
    "副厅长",
    "正厅长",
    "部长",
];

/// (id, 图标， 名称， 说明)
const ACHV: [(&str, &str, &str, &str); 13] = [
    ("first", "🌱", "初出茅庐", "完成第一道题"),
    ("ans100", "📚", "题海战术", "累计答题 100 道"),
    ("ans500", "🏔️", "登堂入室", "累计答题 500 道"),
    ("streak3", "🔥", "三日不辍", "连续打卡 3 天"),
    ("streak7", "⚡", "七日之约", "连续打卡 7 天"),
    ("streak30", "👑", "月度坚持", "连续打卡 30 天"),
    ("combo10", "🎯", "连对达人", "连续答对 10 题"),
    ("perfect", "🧮", "神算子", "计算训练 10 题以上全部答对"),
    (
        "fast",
        "🚀",
        "快如闪电",
        "计算训练平均 ≤3 秒/题且正确率 ≥90%",
    ),
    ("goal", "✅", "今日达标", "完成一次每日目标"),
    ("daily", "📅", "挑战者", "完成一次每日挑战"),
    ("lvl5", "📈", "升职加薪", "升到 5 级"),
    ("clean", "🧹", "错题清零", "清空错题本"),
];

/// (id, 图标, 名称, 说明, 解锁提示, 稀有度)
const ANIMALS: [(&str, &str, &str, &str, &str, &str); 12] = [
    (
        "cat",
        "🐱",
        "小猫",
        "喜欢趴在书页上陪你刷题。",
        "完成第一道题",
        "普通",
    ),
    (
        "dog",
        "🐶",
        "小狗",
        "每天提醒你按时打卡。",
        "累计答题 30 道",
        "普通",
    ),
    (
        "rabbit",
        "🐰",
        "小兔",
        "跳一跳，正确率更高。",
        "累计答题 80 道",
        "普通",
    ),
    (
        "panda",
        "🐼",
        "熊猫",
        "慢悠悠但很稳，适合打基础。",
        "升到 3 级",
        "稀有",
    ),
    (
        "fox",
        "🦊",
        "狐狸",
        "擅长资料分析的机灵鬼。",
        "连续打卡 7 天",
        "稀有",
    ),
    (
        "koala",
        "🐨",
        "考拉",
        "困了也要复习完再睡。",
        "累计答题 150 道",
        "稀有",
    ),
    (
        "tiger",
        "🐯",
        "小老虎",
        "连对 10 题就会啸一声。",
        "连续答对 10 题",
        "稀有",
    ),
    (
        "lion",
        "🦁",
        "狮子",
        "职级达到 8 级解锁。",
        "升到 8 级",
        "史诗",
    ),
    (
        "frog",
        "🐸",
        "青蛙",
        "完成每日挑战后跳出来。",
        "完成一次每日挑战",
        "稀有",
    ),
    (
        "penguin",
        "🐧",
        "企鹅",
        "连续打卡 30 天，南极也坚持。",
        "连续打卡 30 天",
        "史诗",
    ),
    (
        "unicorn",
        "🦄",
        "独角兽",
        "计算训练 10 题全对时出现。",
        "计算训练 10 题以上全对",
        "传说",
    ),
    (
        "dragon",
        "🐉",
        "小龙",
        "累计答题 500 道，传说伙伴。",
        "累计答题 500 道",
        "传说",
    ),
];

fn level_of(xp: u32) -> u32 {
    let mut l = 1u32;
    while l < TITLES.len() as u32 && 50 * (l + 1) * l <= xp {
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

fn title_of(level: u32) -> &'static str {
    TITLES
        .get(level.saturating_sub(1) as usize)
        .copied()
        .unwrap_or(TITLES[0])
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

/// 严格解析 "YYYY-MM-DD";格式不对返回 None,避免脏日期把连续打卡清零。
fn day_num(s: &str) -> Option<i64> {
    if s.len() != 10 {
        return None;
    }
    let mut parts = s.split('-');
    let y = parts.next()?;
    let m = parts.next()?;
    let d = parts.next()?;
    if parts.next().is_some() || y.len() != 4 || m.len() != 2 || d.len() != 2 {
        return None;
    }
    if !y
        .bytes()
        .chain(m.bytes())
        .chain(d.bytes())
        .all(|b| b.is_ascii_digit())
    {
        return None;
    }
    let y: i64 = y.parse().ok()?;
    let m: i64 = m.parse().ok()?;
    let d: i64 = d.parse().ok()?;
    if !(1..=12).contains(&m) {
        return None;
    }
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let max_day = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return None,
    };
    if d < 1 || d > max_day {
        return None;
    }
    Some(days_from_civil(y, m, d))
}

fn require_day(today: &str) -> Result<(), String> {
    if day_num(today).is_some() {
        Ok(())
    } else {
        Err(format!("日期格式无效：{today}"))
    }
}

/// 按艾宾浩斯间隔推进记忆阶段；答错回到第 0 阶，明天再复习。
fn update_review(st: &mut ReviewState, correct: bool, today: i64) {
    let same_day = st.reps > 0 && st.last == today;
    st.reps = st.reps.saturating_add(1);
    st.last = today;
    if same_day {
        // 同一天重复作答只记录遗忘，不重复推进记忆阶段
        if !correct {
            st.stage = 0;
            st.lapses = st.lapses.saturating_add(1);
            st.due = today + 1;
        }
        return;
    }
    if correct {
        st.stage = st.stage.saturating_add(1).min(7);
        st.due = today + REVIEW_INTERVALS[st.stage as usize];
    } else {
        st.stage = 0;
        st.lapses = st.lapses.saturating_add(1);
        st.due = today + 1;
    }
}

fn count_due<T: Ord>(map: &BTreeMap<T, ReviewState>, today: i64) -> usize {
    map.values().filter(|s| s.due <= today).count()
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
struct HistoryLog {
    id: u32,
    category: String,
    correct: bool,
    choice: usize,
    answer: usize,
    day: String,
    mode: String,
}

#[derive(Default, Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
struct ReviewState {
    /// 记忆阶段 0..=7，对应 REVIEW_INTERVALS
    stage: u8,
    /// 下次复习日期（1970-01-01 起的天数）
    due: i64,
    /// 最近一次作答日期
    last: i64,
    /// 遗忘次数
    lapses: u32,
    /// 作答次数
    reps: u32,
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
    // 艾宾浩斯复习
    review: BTreeMap<u32, ReviewState>,
    formula_review: BTreeMap<String, ReviewState>,
    // 可爱动物收集
    animals: BTreeSet<String>,
    // 答题历史（最多 HISTORY_LIMIT 条）
    history: Vec<HistoryLog>,
}

struct AppState {
    questions: Vec<Question>,
    progress: Mutex<Progress>,
    data_dir: PathBuf,
}

impl AppState {
    fn progress(&self) -> MutexGuard<'_, Progress> {
        // 锁中毒时继续使用内部数据，避免一次 panic 让整个应用不可用。
        self.progress.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn save(&self, p: &Progress) {
        if let Err(e) = save_progress(&self.data_dir, p) {
            eprintln!("保存进度失败：{e}");
        }
    }
}

/* ---------------- 进度持久化 ---------------- */

fn progress_path(dir: &Path) -> PathBuf {
    dir.join(PROGRESS_FILE)
}

fn read_progress(path: &Path) -> Result<Progress, String> {
    let text =
        fs::read_to_string(path).map_err(|e| format!("读取 {} 失败：{e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("解析 {} 失败：{e}", path.display()))
}

/// 读取进度：主文件损坏时自动回退到备份，并把坏档留作排查。
fn load_progress(dir: &Path) -> Progress {
    let path = progress_path(dir);
    if path.exists() {
        match read_progress(&path) {
            Ok(p) => return p,
            Err(e) => {
                eprintln!("{e};尝试从备份恢复");
                let corrupt = dir.join("progress.corrupt.json");
                let _ = fs::rename(&path, &corrupt);
            }
        }
    }
    match read_progress(&dir.join(BACKUP_FILE)) {
        Ok(p) => {
            eprintln!("已从备份恢复进度");
            p
        }
        Err(_) => Progress::default(),
    }
}

/// 原子写入：先写临时文件并 fsync,再改名为正式文件；写前保留一份备份。
fn save_progress(dir: &Path, p: &Progress) -> Result<(), String> {
    let text = serde_json::to_string(p).map_err(|e| format!("序列化进度失败：{e}"))?;
    let path = progress_path(dir);
    let tmp = dir.join("progress.json.tmp");

    {
        let mut f =
            fs::File::create(&tmp).map_err(|e| format!("创建 {} 失败：{e}", tmp.display()))?;
        f.write_all(text.as_bytes())
            .map_err(|e| format!("写入 {} 失败：{e}", tmp.display()))?;
        f.sync_all()
            .map_err(|e| format!("同步 {} 失败：{e}", tmp.display()))?;
    }

    if path.exists() {
        let _ = fs::copy(&path, dir.join(BACKUP_FILE));
    }
    fs::rename(&tmp, &path).map_err(|e| format!("替换 {} 失败：{e}", path.display()))
}

/* ---------------- 题库校验 ---------------- */

fn validate_questions(qs: &[Question]) -> Result<(), String> {
    if qs.is_empty() {
        return Err("题库为空".into());
    }
    let mut ids = BTreeSet::new();
    for (idx, q) in qs.iter().enumerate() {
        let at = format!("第 {} 题(id={})", idx + 1, q.id);
        if !ids.insert(q.id) {
            return Err(format!("{at}:id 重复"));
        }
        if !CATS.contains(&q.category.as_str()) {
            return Err(format!(
                "{at}:未知分类 \"{}\",必须是 {}",
                q.category,
                CATS.join("、")
            ));
        }
        if q.stem.trim().is_empty() {
            return Err(format!("{at}:题干为空"));
        }
        if q.options.len() < 2 {
            return Err(format!("{at}:至少需要 2 个选项"));
        }
        if q.options.iter().any(|o| o.trim().is_empty()) {
            return Err(format!("{at}:存在空选项"));
        }
        if q.answer >= q.options.len() {
            return Err(format!(
                "{at}:answer={} 越界(选项数 {})",
                q.answer,
                q.options.len()
            ));
        }
        if q.explanation.trim().is_empty() {
            return Err(format!("{at}:解析为空"));
        }
    }
    Ok(())
}

fn load_questions() -> Result<Vec<Question>, String> {
    let qs: Vec<Question> = serde_json::from_str(include_str!("../questions.json"))
        .map_err(|e| format!("解析内置题库失败：{e}"))?;
    validate_questions(&qs)?;
    Ok(qs)
}

/* ---------------- 奖励与打卡 ---------------- */

#[derive(Serialize, Clone)]
struct AnimalInfo {
    id: &'static str,
    icon: &'static str,
    name: &'static str,
    desc: &'static str,
    hint: &'static str,
    rarity: &'static str,
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
    new_animals: Vec<AnimalInfo>,
}

#[derive(Default)]
struct Event {
    base_xp: u32,
    answers: u32,
    combo: u32,
    drill: Option<(u32, u32, f64)>, // (题数， 答对数， 用时秒)
    cleared: bool,
    unlock: Option<&'static str>,
}

fn achv_info(id: &str) -> Option<AchvInfo> {
    ACHV.iter()
        .find(|a| a.0 == id)
        .map(|&(id, icon, name, desc)| AchvInfo {
            id,
            icon,
            name,
            desc,
        })
}

fn unlock(p: &mut Progress, ids: &mut Vec<&'static str>, id: &'static str) {
    if p.achv.insert(id.to_string()) {
        ids.push(id);
    }
}

/// 当天首次活动时更新连续打卡；日期变化时重置今日计数
fn touch(p: &mut Progress, today: &str) {
    if day_num(today).is_none() {
        return;
    }
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
        return; // 系统时间回拨，不处理
    }
    if gap == 1 {
        p.streak = p.streak.saturating_add(1);
    } else if gap == 2 && p.freezes > 0 {
        p.freezes -= 1; // 自动使用补签卡
        p.streak = p.streak.saturating_add(1);
    } else {
        p.streak = 1;
    }
    p.last_active = today.to_string();
    p.best_streak = p.best_streak.max(p.streak);
    if p.streak.is_multiple_of(7) {
        p.freezes = (p.freezes + 1).min(2); // 每满7天送一张补签卡，最多持有2张
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

fn animal_unlocked(id: &str, p: &Progress, total: u32, level: u32, ev: &Event) -> bool {
    match id {
        "cat" => total >= 1,
        "dog" => total >= 30,
        "rabbit" => total >= 80,
        "panda" => level >= 3,
        "fox" => p.best_streak >= 7,
        "koala" => total >= 150,
        "tiger" => ev.combo >= 10,
        "lion" => level >= 8,
        "frog" => !p.daily_done.is_empty(),
        "penguin" => p.best_streak >= 30,
        "unicorn" => ev.drill.is_some_and(|(t, r, _)| t >= 10 && r == t),
        "dragon" => total >= 500,
        _ => false,
    }
}

/// 结算一次事件：经验、等级、每日目标、连续打卡、成就
fn award(p: &mut Progress, today: &str, ev: Event) -> AwardInfo {
    touch(p, today);
    let before = level_of(p.xp);

    let mut gained = ev.base_xp;
    p.today_count = p.today_count.saturating_add(ev.answers);
    let mut goal_hit = false;
    if p.today_count >= DAILY_GOAL && p.goal_hit != today {
        p.goal_hit = today.to_string();
        gained = gained.saturating_add(GOAL_BONUS);
        goal_hit = true;
    }
    p.xp = p.xp.saturating_add(gained);
    let level = level_of(p.xp);

    let total = p
        .stats
        .values()
        .fold(0u32, |a, s| a.saturating_add(s.done))
        .saturating_add(p.drill.values().fold(0u32, |a, s| a.saturating_add(s.done)));
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

    let mut new_animals = Vec::new();
    for &(id, icon, name, desc, hint, rarity) in ANIMALS.iter() {
        if !p.animals.contains(id) && animal_unlocked(id, p, total, level, &ev) {
            p.animals.insert(id.to_string());
            new_animals.push(AnimalInfo {
                id,
                icon,
                name,
                desc,
                hint,
                rarity,
            });
        }
    }

    AwardInfo {
        xp: gained,
        level,
        title: title_of(level),
        level_up: level > before,
        goal_hit,
        streak: p.streak,
        new_achv: ids.iter().filter_map(|id| achv_info(id)).collect(),
        new_animals,
    }
}

/* ---------------- 题库命令 ---------------- */

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
    /// 本题答对后是否从错题本移除
    removed_from_wrong: bool,
    /// 当前错题本剩余题数
    wrong_left: usize,
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

fn daily_questions(qs: &[Question], today: &str) -> Vec<Question> {
    // 以日期为种子，同一天题目固定；日期非法时退回固定种子。
    let seed = day_num(today).unwrap_or(0) as u64;
    let mut r = Rng::seeded(seed);
    let mut idx: Vec<usize> = (0..qs.len()).collect();
    for i in (1..idx.len()).rev() {
        let j = (r.next() % (i as u64 + 1)) as usize;
        idx.swap(i, j);
    }
    idx.truncate(DAILY_COUNT);
    idx.into_iter().map(|i| qs[i].clone()).collect()
}

/// 智能复习：先复习今天到期的题，再用新题补足一组。
fn smart_review_questions(state: &AppState, today: &str) -> Vec<Question> {
    let Some(today_num) = day_num(today) else {
        return Vec::new();
    };
    let p = state.progress();
    let mut due: Vec<&Question> = state
        .questions
        .iter()
        .filter(|q| p.review.get(&q.id).is_some_and(|s| s.due <= today_num))
        .collect();
    due.sort_by_key(|q| {
        p.review
            .get(&q.id)
            .map(|s| (s.due, s.stage))
            .unwrap_or((i64::MAX, 0))
    });
    let mut out: Vec<Question> = due.into_iter().take(SMART_REVIEW_LIMIT).cloned().collect();

    if out.len() < SMART_REVIEW_LIMIT {
        let mut r = Rng::seeded(today_num as u64);
        let mut unseen: Vec<&Question> = state
            .questions
            .iter()
            .filter(|q| !p.review.contains_key(&q.id))
            .collect();
        for i in (1..unseen.len()).rev() {
            let j = (r.next() % (i as u64 + 1)) as usize;
            unseen.swap(i, j);
        }
        out.extend(
            unseen
                .into_iter()
                .take(SMART_REVIEW_LIMIT - out.len())
                .cloned(),
        );
    }
    out
}

/// mode: "全部" | "错题本" | "每日挑战" | "智能复习" | 某个题型名称
#[tauri::command]
fn get_questions(state: State<AppState>, mode: String, today: Option<String>) -> Vec<Question> {
    match mode.as_str() {
        "智能复习" => smart_review_questions(&state, today.as_deref().unwrap_or("")),
        "每日挑战" => daily_questions(&state.questions, today.as_deref().unwrap_or("")),
        "全部" => state.questions.clone(),
        "错题本" => {
            let p = state.progress();
            state
                .questions
                .iter()
                .filter(|q| p.wrong.contains(&q.id))
                .cloned()
                .collect()
        }
        category => state
            .questions
            .iter()
            .filter(|q| q.category == category)
            .cloned()
            .collect(),
    }
}

/// combo: 本次作答前的连对数(由前端维护)
#[tauri::command]
fn submit_answer(
    state: State<AppState>,
    id: u32,
    choice: usize,
    combo: u32,
    today: String,
    mode: String,
) -> Result<AnswerResult, String> {
    require_day(&today)?;
    let q = state
        .questions
        .iter()
        .find(|q| q.id == id)
        .ok_or_else(|| format!("题目 {id} 不存在"))?;
    let correct = choice == q.answer;
    let combo = combo.min(999);

    let mut p = state.progress();
    let st = p.stats.entry(q.category.clone()).or_default();
    st.done = st.done.saturating_add(1);
    let mut cleared = false;
    let mut removed_from_wrong = false;
    if correct {
        st.right = st.right.saturating_add(1);
        removed_from_wrong = p.wrong.remove(&id);
        cleared = removed_from_wrong && p.wrong.is_empty();
    } else {
        p.wrong.insert(id);
    }

    let today_num = day_num(&today).unwrap_or(0);
    let review = p.review.entry(id).or_default();
    update_review(review, correct, today_num);

    p.history.push(HistoryLog {
        id,
        category: q.category.clone(),
        correct,
        choice,
        answer: q.answer,
        day: today.clone(),
        mode,
    });
    if p.history.len() > HISTORY_LIMIT {
        let keep_from = p.history.len() - HISTORY_LIMIT;
        p.history.drain(0..keep_from);
    }

    let new_combo = if correct { combo.saturating_add(1) } else { 0 };
    let base = if correct {
        10 + 2 * (new_combo / 3).min(5)
    } else {
        2
    };
    let aw = award(
        &mut p,
        &today,
        Event {
            base_xp: base,
            answers: 1,
            combo: new_combo,
            cleared,
            ..Default::default()
        },
    );
    let wrong_left = p.wrong.len();
    state.save(&p);

    Ok(AnswerResult {
        correct,
        answer: q.answer,
        explanation: q.explanation.clone(),
        combo: new_combo,
        award: aw,
        removed_from_wrong,
        wrong_left,
    })
}

/// 完成每日挑战后领取奖励(每天仅一次)
#[tauri::command]
fn claim_daily(state: State<AppState>, today: String) -> Result<AwardInfo, String> {
    require_day(&today)?;
    let mut p = state.progress();
    if p.daily_done == today {
        let level = level_of(p.xp);
        return Ok(AwardInfo {
            level,
            title: title_of(level),
            streak: live_streak(&p, &today),
            ..Default::default()
        });
    }
    p.daily_done = today.clone();
    let aw = award(
        &mut p,
        &today,
        Event {
            base_xp: DAILY_BONUS,
            unlock: Some("daily"),
            ..Default::default()
        },
    );
    state.save(&p);
    Ok(aw)
}

#[tauri::command]
fn get_stats(state: State<AppState>) -> Progress {
    state.progress().clone()
}

#[derive(Serialize)]
struct HistoryItem {
    id: u32,
    category: String,
    stem: String,
    options: Vec<String>,
    choice: usize,
    answer: usize,
    explanation: String,
    correct: bool,
    day: String,
    mode: String,
}

#[tauri::command]
fn get_history(state: State<AppState>, limit: Option<u32>) -> Vec<HistoryItem> {
    let p = state.progress();
    let limit = limit.unwrap_or(200).min(HISTORY_LIMIT as u32) as usize;
    p.history
        .iter()
        .rev()
        .take(limit)
        .map(|h| {
            let q = state.questions.iter().find(|q| q.id == h.id);
            HistoryItem {
                id: h.id,
                category: h.category.clone(),
                stem: q
                    .map(|q| q.stem.clone())
                    .unwrap_or_else(|| "题目已从题库移除".into()),
                options: q.map(|q| q.options.clone()).unwrap_or_default(),
                choice: h.choice,
                answer: h.answer,
                explanation: q.map(|q| q.explanation.clone()).unwrap_or_default(),
                correct: h.correct,
                day: h.day.clone(),
                mode: h.mode.clone(),
            }
        })
        .collect()
}

#[tauri::command]
fn clear_history(state: State<AppState>) {
    let mut p = state.progress();
    p.history.clear();
    state.save(&p);
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
struct AnimalView {
    id: &'static str,
    icon: &'static str,
    name: &'static str,
    desc: &'static str,
    hint: &'static str,
    rarity: &'static str,
    unlocked: bool,
}

#[derive(Serialize)]
struct Profile {
    xp: u32,
    level: u32,
    max_level: u32,
    title: &'static str,
    level_floor: u32,
    level_next: u32,
    streak: u32,
    best_streak: u32,
    freezes: u32,
    today_count: u32,
    goal: u32,
    daily_done: bool,
    review_due: usize,
    review_total: usize,
    new_questions: usize,
    formula_due: usize,
    formula_total: usize,
    animal_count: usize,
    animal_total: usize,
    history_count: usize,
    animals: Vec<AnimalView>,
    achievements: Vec<AchvView>,
}

#[tauri::command]
fn get_profile(state: State<AppState>, today: String) -> Profile {
    let p = state.progress();
    let level = level_of(p.xp);
    let today_num = day_num(&today);
    let review_due = today_num.map_or(0, |t| count_due(&p.review, t));
    let formula_due = today_num.map_or(0, |t| count_due(&p.formula_review, t));
    let review_total = p.review.len();
    let new_questions = state
        .questions
        .iter()
        .filter(|q| !p.review.contains_key(&q.id))
        .count();
    Profile {
        xp: p.xp,
        level,
        max_level: TITLES.len() as u32,
        title: title_of(level),
        level_floor: level_floor(level),
        level_next: level_next(level),
        streak: live_streak(&p, &today),
        best_streak: p.best_streak,
        freezes: p.freezes,
        today_count: if p.today == today { p.today_count } else { 0 },
        goal: DAILY_GOAL,
        daily_done: p.daily_done == today,
        review_due,
        review_total,
        new_questions,
        formula_due,
        formula_total: p.formula_review.len(),
        animal_count: p.animals.len(),
        animal_total: ANIMALS.len(),
        history_count: p.history.len(),
        animals: ANIMALS
            .iter()
            .map(|&(id, icon, name, desc, hint, rarity)| AnimalView {
                id,
                icon,
                name,
                desc,
                hint,
                rarity,
                unlocked: p.animals.contains(id),
            })
            .collect(),
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

#[derive(Serialize)]
struct ReviewStage {
    stage: u8,
    label: &'static str,
    count: usize,
}

#[derive(Serialize)]
struct ReviewDay {
    offset: i64,
    label: &'static str,
    count: usize,
}

#[derive(Serialize)]
struct ReviewPlan {
    due_today: usize,
    new_questions: usize,
    review_total: usize,
    formula_due: usize,
    formula_total: usize,
    stages: Vec<ReviewStage>,
    forecast: Vec<ReviewDay>,
    formula_forecast: Vec<ReviewDay>,
}

#[tauri::command]
fn get_review_plan(state: State<AppState>, today: String) -> ReviewPlan {
    let today_num = day_num(&today);
    let p = state.progress();
    let due_today = today_num.map_or(0, |t| count_due(&p.review, t));
    let formula_due = today_num.map_or(0, |t| count_due(&p.formula_review, t));
    let new_questions = state
        .questions
        .iter()
        .filter(|q| !p.review.contains_key(&q.id))
        .count();
    let stages = (0..=7u8)
        .map(|stage| {
            let label = match stage {
                0 => "待巩固",
                1 => "1 天",
                2 => "2 天",
                3 => "4 天",
                4 => "7 天",
                5 => "15 天",
                6 => "30 天",
                _ => "60 天",
            };
            ReviewStage {
                stage,
                label,
                count: p.review.values().filter(|s| s.stage == stage).count(),
            }
        })
        .collect();
    let labels = [
        "今天", "明天", "后天", "3 天后", "4 天后", "5 天后", "6 天后",
    ];
    let forecast = (0..7i64)
        .map(|offset| {
            let count = today_num.map_or(0, |t| {
                p.review.values().filter(|s| s.due == t + offset).count()
            });
            ReviewDay {
                offset,
                label: labels[offset as usize],
                count,
            }
        })
        .collect();
    let formula_forecast = (0..7i64)
        .map(|offset| {
            let count = today_num.map_or(0, |t| {
                p.formula_review
                    .values()
                    .filter(|s| s.due == t + offset)
                    .count()
            });
            ReviewDay {
                offset,
                label: labels[offset as usize],
                count,
            }
        })
        .collect();
    ReviewPlan {
        due_today,
        new_questions,
        review_total: p.review.len(),
        formula_due,
        formula_total: p.formula_review.len(),
        stages,
        forecast,
        formula_forecast,
    }
}

#[tauri::command]
fn reset_progress(state: State<AppState>) {
    let mut p = state.progress();
    *p = Progress::default();
    state.save(&p);
}

/* ---------------- 计算训练 ---------------- */

/// 简易 xorshift64 随机数(避免额外依赖)
struct Rng(u64);

impl Rng {
    fn seeded(seed: u64) -> Self {
        let mut r = Rng(seed
            .wrapping_mul(0x9E37_79B9_7F4A_7C15)
            .wrapping_add(0x1234_5678_9ABC_DEF1)
            | 1);
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

    /// 闭区间 [lo, hi];lo >= hi 时直接返回 lo,避免取模除零。
    fn range(&mut self, lo: i64, hi: i64) -> i64 {
        if hi <= lo {
            return lo;
        }
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
    /// 允许误差，整数题为 0
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
                ex(format!("{a} 增长 {p}% 后是多少？"), a * (100 + p) / 100)
            } else {
                ex(format!("{a} 下降 {p}% 后是多少？"), a * (100 - p) / 100)
            }
        }
        "百分比" => {
            let a = 20 * r.range(5, 60);
            let p = r.pick(&[5i64, 10, 15, 20, 25, 30, 40, 50, 60, 75]);
            ex(format!("{a} 的 {p}% 是多少？"), a * p / 100)
        }
        "增长量" => {
            let base = 20 * r.range(10, 60);
            let p = r.pick(&[5i64, 10, 15, 20, 25, 30, 40, 50]);
            let current = base * (100 + p) / 100;
            ex(
                format!("基期量为 {base}，同比增长 {p}%，增长量是多少？"),
                current - base,
            )
        }
        "基期量" => {
            let base = 20 * r.range(10, 60);
            let p = r.pick(&[5i64, 10, 15, 20, 25, 30, 40, 50]);
            let current = base * (100 + p) / 100;
            ex(
                format!("现期量为 {current}，同比增长 {p}%，基期量是多少？"),
                base,
            )
        }
        "比重" => {
            let whole = 20 * r.range(10, 50);
            let p = 5 * r.range(1, 19);
            let part = whole * p / 100;
            DrillQ {
                text: format!("部分量为 {part}，整体量为 {whole}，比重是多少？（%）"),
                answer: p as f64,
                tol: 0.06,
            }
        }
        "平均数" => {
            let n = r.range(4, 12);
            let avg = r.range(20, 120);
            let total = n * avg;
            ex(format!("{n} 个数的总和是 {total}，平均数是多少？"), avg)
        }
        "倍数" => {
            let b = r.range(5, 50);
            let k = r.range(2, 9);
            let a = b * k;
            ex(format!("{a} 是 {b} 的多少倍？"), k)
        }
        "百分点" => {
            let a = 5 * r.range(2, 16);
            let delta = 5 * r.range(1, 3);
            let b = a + delta;
            ex(
                format!("某比重从 {a}% 提高到 {b}%，提高了多少个百分点？"),
                delta,
            )
        }
        "估算" => {
            let a = r.range(100, 999);
            let b = r.range(11, 99);
            let rounded = ((a * b + 50) / 100) * 100;
            ex(format!("{a} × {b} ≈ ?（四舍五入到整百）"), rounded)
        }
        "资料分析" => {
            let kinds = [
                "百分比",
                "增长",
                "增长量",
                "基期量",
                "比重",
                "平均数",
                "倍数",
                "百分点",
                "隔年增长",
                "年均增长量",
                "年均增长率",
                "贡献率",
                "估算",
            ];
            let k = r.pick(&kinds);
            make(k, r)
        }
        "隔年增长" => {
            let r1 = r.pick(&[10i64, 20, 30, 40]);
            let r2 = r.pick(&[10i64, 20, 30, 40]);
            let answer = r1 + r2 + r1 * r2 / 100;
            DrillQ {
                text: format!("连续两年分别增长 {r1}% 和 {r2}%，隔年增长率是多少？（%）"),
                answer: answer as f64,
                tol: 0.06,
            }
        }
        "年均增长量" => {
            let initial = 20 * r.range(5, 50);
            let years = r.range(2, 5);
            let growth = 10 * r.range(1, 20);
            let last = initial + growth * years;
            ex(
                format!("初期量为 {initial}，{years} 年后为 {last}，年均增长量是多少？"),
                growth,
            )
        }
        "年均增长率" => {
            let rate = r.pick(&[10i64, 20]);
            let years = r.pick(&[2i64, 3]);
            let mut last = 1000i64;
            for _ in 0..years {
                last = last * (100 + rate) / 100;
            }
            DrillQ {
                text: format!("初期量为 1000，{years} 年后为 {last}，年均增长率是多少？（%）"),
                answer: rate as f64,
                tol: 0.06,
            }
        }
        "贡献率" => {
            let total = 20 * r.range(5, 25);
            let p = 5 * r.range(1, 10);
            let part = total * p / 100;
            DrillQ {
                text: format!(
                    "整体增长量为 {total}，某部分增长量为 {part}，增长贡献率是多少？（%）"
                ),
                answer: p as f64,
                tol: 0.06,
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
            let x = if big {
                r.range(1000, 9999)
            } else {
                r.range(100, 999)
            };
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

#[derive(Serialize)]
struct FormulaExercise {
    id: &'static str,
    group: &'static str,
    title: &'static str,
    text: &'static str,
    answer: f64,
    tol: f64,
    unit: &'static str,
    explanation: &'static str,
}

#[tauri::command]
fn list_formula_exercises() -> Vec<FormulaExercise> {
    FORMULA_EXERCISES
        .iter()
        .map(
            |&(id, group, title, text, answer, tol, unit, explanation)| FormulaExercise {
                id,
                group,
                title,
                text,
                answer,
                tol,
                unit,
                explanation,
            },
        )
        .collect()
}

#[derive(Serialize)]
struct FormulaInfo {
    id: &'static str,
    group: &'static str,
    name: &'static str,
    formula: &'static str,
    note: &'static str,
    example: &'static str,
    stage: u8,
    reps: u32,
    due: bool,
}

#[tauri::command]
fn list_formulas(state: State<AppState>, today: String) -> Vec<FormulaInfo> {
    let today_num = day_num(&today);
    let p = state.progress();
    FORMULAS
        .iter()
        .map(|&(id, group, name, formula, note, example)| {
            let st = p.formula_review.get(id);
            FormulaInfo {
                id,
                group,
                name,
                formula,
                note,
                example,
                stage: st.map_or(0, |s| s.stage),
                reps: st.map_or(0, |s| s.reps),
                due: st.is_some_and(|s| today_num.is_some_and(|t| s.due <= t)),
            }
        })
        .collect()
}

#[tauri::command]
fn record_formula(
    state: State<AppState>,
    id: String,
    correct: bool,
    today: String,
) -> Result<(), String> {
    require_day(&today)?;
    if !FORMULAS.iter().any(|f| f.0 == id.as_str()) {
        return Err(format!("公式 {id} 不存在"));
    }
    let today_num = day_num(&today).unwrap_or(0);
    let mut p = state.progress();
    let st = p.formula_review.entry(id).or_default();
    update_review(st, correct, today_num);
    state.save(&p);
    Ok(())
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
            let k: &str = if kind == "综合" {
                r.pick(&pool)
            } else {
                &kind
            };
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
) -> Result<DrillResult, String> {
    require_day(&today)?;
    // 参数由前端提供，做一次边界收敛，避免异常值把统计写坏。
    let total = total.clamp(1, 50);
    let right = right.min(total);
    let secs = if secs.is_finite() && secs >= 0.0 {
        secs
    } else {
        0.0
    };

    let mut p = state.progress();
    let st = p.drill.entry(kind).or_default();
    st.runs = st.runs.saturating_add(1);
    st.done = st.done.saturating_add(total);
    st.right = st.right.saturating_add(right);
    if total >= 5 && right * 10 >= total * 9 && secs > 0.0 {
        let avg = secs / total as f64;
        if st.best_avg_secs.is_none_or(|b| avg < b) {
            st.best_avg_secs = Some(avg);
        }
    }
    let stat = st.clone();

    let base = right
        .saturating_mul(4)
        .saturating_add(if total >= 10 && right == total { 30 } else { 0 });
    let aw = award(
        &mut p,
        &today,
        Event {
            base_xp: base,
            answers: total,
            drill: Some((total, right, secs)),
            ..Default::default()
        },
    );
    state.save(&p);
    Ok(DrillResult { stat, award: aw })
}

/* ---------------- 入口 ---------------- */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            fs::create_dir_all(&dir)?;
            let questions = load_questions().map_err(|e| {
                std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    format!("题库校验失败：{e}"),
                )
            })?;
            let progress = load_progress(&dir);

            app.manage(AppState {
                questions,
                progress: Mutex::new(progress),
                data_dir: dir,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_categories,
            get_questions,
            submit_answer,
            claim_daily,
            get_stats,
            get_history,
            clear_history,
            get_profile,
            get_review_plan,
            reset_progress,
            list_formulas,
            list_formula_exercises,
            record_formula,
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

    fn sample_question(id: u32) -> Question {
        Question {
            id,
            category: "言语理解".into(),
            stem: format!("题目 {id}"),
            options: vec!["甲".into(), "乙".into(), "丙".into(), "丁".into()],
            answer: 1,
            explanation: "解析".into(),
        }
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("xingce-test-{tag}-{stamp}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("创建临时目录");
        dir
    }

    #[test]
    fn builtin_question_bank_is_valid() {
        let qs = load_questions().expect("题库应通过校验");
        assert!(qs.len() >= 40, "题库应不少于 40 题，当前 {}", qs.len());
    }

    #[test]
    fn formulas_are_sane() {
        let total = FORMULAS.len();
        assert_eq!(total, 43);
        let mut ids = BTreeSet::new();
        for &(id, group, name, formula, note, example) in FORMULAS.iter() {
            assert!(ids.insert(id), "公式 id 重复：{id}");
            assert!(!group.trim().is_empty(), "{id} 分组为空");
            assert!(!name.trim().is_empty(), "{id} 名称为空");
            assert!(!formula.trim().is_empty(), "{id} 公式为空");
            assert!(!note.trim().is_empty(), "{id} 说明为空");
            assert!(!example.trim().is_empty(), "{id} 例子为空");
        }
    }

    #[test]
    fn review_schedule_follows_ebbinghaus() {
        let mut st = ReviewState::default();
        update_review(&mut st, true, 100);
        assert_eq!(st.stage, 1);
        assert_eq!(st.due, 101);
        update_review(&mut st, true, 100); // 同一天重复作答不重复升阶
        assert_eq!(st.stage, 1);
        assert_eq!(st.due, 101);

        update_review(&mut st, true, 101);
        assert_eq!(st.stage, 2);
        assert_eq!(st.due, 103);

        update_review(&mut st, false, 103);
        assert_eq!(st.stage, 0);
        assert_eq!(st.due, 104);
        assert_eq!(st.lapses, 1);

        for day in 0..20 {
            update_review(&mut st, true, 200 + day);
        }
        assert_eq!(st.stage, 7);
        assert!(count_due(&BTreeMap::from([(1u32, st)]), 400) >= 1);
    }

    #[test]
    fn formula_exercises_are_sane() {
        let total = FORMULA_EXERCISES.len();
        assert_eq!(total, 25);
        for &(id, group, title, text, answer, tol, unit, explanation) in FORMULA_EXERCISES.iter() {
            assert!(
                FORMULAS.iter().any(|f| f.0 == id),
                "公式实操引用了不存在的公式：{id}"
            );
            assert!(group == "资料" || group == "数量", "{id} 分组未知");
            assert!(!title.trim().is_empty(), "{id} 标题为空");
            assert!(!text.trim().is_empty(), "{id} 题目为空");
            assert!(answer.is_finite(), "{id} 答案不是有限数");
            assert!(tol >= 0.0, "{id} 容差为负");
            assert!(unit.chars().count() <= 2, "{id} 单位异常");
            assert!(!explanation.trim().is_empty(), "{id} 解析为空");
        }
    }

    #[test]
    fn animal_unlocks_follow_progress() {
        let p = Progress {
            best_streak: 7,
            daily_done: "2026-11-09".into(),
            ..Default::default()
        };
        let ev = Event {
            combo: 10,
            drill: Some((10, 10, 60.0)),
            ..Default::default()
        };
        assert!(animal_unlocked("cat", &p, 10, 3, &ev));
        assert!(animal_unlocked("panda", &p, 10, 3, &ev));
        assert!(animal_unlocked("fox", &p, 10, 3, &ev));
        assert!(animal_unlocked("tiger", &p, 10, 3, &ev));
        assert!(animal_unlocked("frog", &p, 10, 3, &ev));
        assert!(animal_unlocked("unicorn", &p, 10, 3, &ev));
        assert!(!animal_unlocked("dog", &p, 10, 3, &ev));
        assert!(!animal_unlocked("lion", &p, 10, 3, &ev));
        assert!(!animal_unlocked("dragon", &p, 10, 3, &ev));
    }

    #[test]
    fn duplicate_or_bad_questions_are_rejected() {
        let mut qs = vec![sample_question(1), sample_question(1)];
        assert!(validate_questions(&qs).unwrap_err().contains("id 重复"));

        qs = vec![sample_question(1)];
        qs[0].category = "不存在的分类".into();
        assert!(validate_questions(&qs).unwrap_err().contains("未知分类"));

        qs = vec![sample_question(1)];
        qs[0].answer = 9;
        assert!(validate_questions(&qs).unwrap_err().contains("越界"));

        qs = vec![sample_question(1)];
        qs[0].options.clear();
        assert!(validate_questions(&qs).is_err());
    }

    #[test]
    fn daily_selection_is_stable_per_day() {
        let qs: Vec<Question> = (1..=20).map(sample_question).collect();
        let a: Vec<u32> = daily_questions(&qs, "2026-11-09")
            .iter()
            .map(|q| q.id)
            .collect();
        let b: Vec<u32> = daily_questions(&qs, "2026-11-09")
            .iter()
            .map(|q| q.id)
            .collect();
        assert_eq!(a, b);
        assert_eq!(a.len(), DAILY_COUNT);
        let uniq: BTreeSet<u32> = a.iter().copied().collect();
        assert_eq!(uniq.len(), DAILY_COUNT);
    }

    #[test]
    fn date_math() {
        assert_eq!(
            day_num("2026-03-01").unwrap() - day_num("2026-02-28").unwrap(),
            1
        );
        assert_eq!(
            day_num("2024-03-01").unwrap() - day_num("2024-02-28").unwrap(),
            2
        );
        assert_eq!(day_num("1970-01-01"), Some(0));
        assert_eq!(day_num("2026-1-1"), None);
        assert_eq!(day_num("2026-13-01"), None);
        assert_eq!(day_num("abcd-01-01"), None);
        assert_eq!(day_num("2026-01-01x"), None);
        assert!(day_num("2024-02-29").is_some());
        assert_eq!(day_num("2026-02-29"), None);
        assert_eq!(day_num("2026-04-31"), None);
    }

    #[test]
    fn levels_and_titles() {
        assert_eq!(level_of(0), 1);
        assert_eq!(level_of(99), 1);
        assert_eq!(level_of(100), 2);
        assert_eq!(level_of(1000), 5);
        assert_eq!(level_of(u32::MAX), 12);
        assert_eq!(title_of(1), "见习考生");
        assert_eq!(title_of(12), "部长");
        assert_eq!(title_of(99), TITLES[0]);
        assert_eq!(level_floor(1), 0);
        assert_eq!(level_next(1), 100);
    }

    #[test]
    fn streak_and_freeze() {
        let mut p = Progress::default();
        touch(&mut p, "2026-11-01");
        touch(&mut p, "2026-11-01"); // 同一天重复活动不重复计数
        assert_eq!(p.streak, 1);
        touch(&mut p, "2026-11-02");
        assert_eq!(p.streak, 2);
        touch(&mut p, "2026-11-04"); // 断了一天，无补签卡 → 重置
        assert_eq!(p.streak, 1);
        p.freezes = 1;
        touch(&mut p, "2026-11-06"); // 断一天，用补签卡 → 续上
        assert_eq!(p.streak, 2);
        assert_eq!(p.freezes, 0);
        touch(&mut p, "bad-date"); // 脏日期不应清空连续打卡
        assert_eq!(p.streak, 2);
    }

    #[test]
    fn goal_and_achievements() {
        let mut p = Progress::default();
        let a = award(
            &mut p,
            "2026-11-09",
            Event {
                base_xp: 10,
                answers: DAILY_GOAL,
                ..Default::default()
            },
        );
        assert!(a.goal_hit);
        assert_eq!(a.xp, 10 + GOAL_BONUS);
        assert!(p.achv.contains("goal"));
        assert_eq!(a.new_achv.len(), 1);
        assert_eq!(a.streak, 1);

        // 同一天再结算一次，不重复发放目标奖励
        let b = award(
            &mut p,
            "2026-11-09",
            Event {
                base_xp: 10,
                answers: 1,
                ..Default::default()
            },
        );
        assert!(!b.goal_hit);
        assert_eq!(b.xp, 10);
    }

    #[test]
    fn xp_saturates_instead_of_overflowing() {
        let mut p = Progress {
            xp: u32::MAX,
            ..Default::default()
        };
        let a = award(
            &mut p,
            "2026-11-09",
            Event {
                base_xp: 100,
                ..Default::default()
            },
        );
        assert_eq!(p.xp, u32::MAX);
        assert_eq!(a.level, 12);
    }

    #[test]
    fn progress_roundtrip_backup_and_recovery() {
        let dir = temp_dir("progress");
        let mut p = Progress {
            xp: 123,
            ..Default::default()
        };
        save_progress(&dir, &p).expect("首次保存");
        assert_eq!(load_progress(&dir).xp, 123);

        p.xp = 456;
        save_progress(&dir, &p).expect("再次保存");
        assert_eq!(load_progress(&dir).xp, 456);
        assert_eq!(read_progress(&dir.join(BACKUP_FILE)).unwrap().xp, 123);

        // 主文件损坏：应自动回退到上一次的备份
        fs::write(progress_path(&dir), "{ 坏掉的 json").unwrap();
        assert_eq!(load_progress(&dir).xp, 123);
        assert!(dir.join("progress.corrupt.json").exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn corrupt_progress_without_backup_falls_back_to_default() {
        let dir = temp_dir("corrupt");
        fs::write(progress_path(&dir), "not json").unwrap();
        let p = load_progress(&dir);
        assert_eq!(p.xp, 0);
        assert!(p.stats.is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn drills_are_sane() {
        let mut r = Rng::new();
        for (name, _, _) in DRILLS.iter().skip(1) {
            for _ in 0..500 {
                let q = make(name, &mut r);
                assert!(
                    q.answer.is_finite() && q.answer >= 0.0,
                    "{name}: {}",
                    q.text
                );
                assert!(q.tol >= 0.0, "{name}: {}", q.text);
                assert!(!q.text.trim().is_empty(), "{name}: 题干为空");
            }
        }
    }

    #[test]
    fn rng_range_is_safe_for_degenerate_bounds() {
        let mut r = Rng::seeded(1);
        assert_eq!(r.range(5, 5), 5);
        assert_eq!(r.range(9, 3), 9);
        for _ in 0..1000 {
            let v = r.range(10, 20);
            assert!((10..=20).contains(&v));
        }
    }
}
