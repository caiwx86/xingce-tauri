"use strict";

const invoke = window.__TAURI__?.core?.invoke;
const app = document.getElementById("app");
const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
const DRILL_COUNT_KEY = "xingce.drillCount";
const MAX_OPTION_KEY = 6;

/* ---------------- 基础工具 ---------------- */

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function screen(...kids) {
  app.classList.remove("dock-open");
  app.replaceChildren(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
  window.scrollTo(0, 0);
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "-");

function fmt(n) {
  const v = Number(n);
  return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "-";
}

function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

// 本地日期 YYYY-MM-DD(按手机时区，保证"每天"以用户的零点为界)
function today() {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function errText(err) {
  if (typeof err === "string") return err;
  if (err && typeof err.message === "string") return err.message;
  return "未知错误";
}

async function call(cmd, args = {}) {
  if (!invoke) throw new Error("Tauri 接口不可用");
  try {
    return await invoke(cmd, args);
  } catch (err) {
    console.error(`[invoke:${cmd}]`, err);
    toast(`操作失败：${errText(err)}`);
    throw err;
  }
}

let toastTimer;
function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

function shuffle(xs) {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const FACTS = [
  "资料分析先读问题再找数据，通常比从头读到尾更快。",
  "增长率题先估基期，再和选项对量级，往往能排除一半答案。",
  "连续学习 25 分钟后休息 5 分钟，比一口气刷两小时更稳。",
  "猫每天平均睡 12–16 小时，但捕猎时爆发力很强。",
  "企鹅的膝盖藏在羽毛里，腿其实并不短。",
  "熊猫每天要吃约 12–38 公斤竹子，是名副其实的“吃货”。",
  "狐狸的大耳朵既能散热，也能听清雪下的小动静。",
  "章鱼有三颗心脏，血液是蓝色的。",
  "蜜蜂会用舞蹈告诉同伴花蜜的方向和距离。",
  "树懒一周才下树一次，行动慢是为了节省能量。",
  "数量关系先看选项量级，常能排除一半错误答案。",
  "每天固定时间复习，比随机刷题更容易形成长期记忆。",
];

function factOfDay() {
  const d = new Date();
  const key = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
  return FACTS[key % FACTS.length];
}

const TRICKS = [
  { cat: "基础运算", name: "凑整法", tip: "把一个数拆成整十、整百再加减，减少进位借位。", example: "397+256 = 400+256−3 = 653。" },
  { cat: "基础运算", name: "拆分法", tip: "把乘数拆成整十数加个位数，分别相乘再相加。", example: "24×15 = 24×10 + 24×5 = 240+120 = 360。" },
  { cat: "基础运算", name: "×11 速算", tip: "首尾拉开，中间相邻位相加，注意进位。", example: "35×11 = 3（3+5）5 = 385。" },
  { cat: "基础运算", name: "×15 速算", tip: "先乘10，再加一半。", example: "48×15 = 480+240 = 720。" },
  { cat: "基础运算", name: "×25 速算", tip: "先除以4，再乘100。", example: "36×25 = 36÷4×100 = 900。" },
  { cat: "基础运算", name: "×125 速算", tip: "先除以8，再乘1000。", example: "32×125 = 32÷8×1000 = 4000。" },
  { cat: "基础运算", name: "个位是5的平方", tip: "十位×（十位+1）后接25。", example: "35² → 3×4=12 → 1225。" },
  { cat: "基础运算", name: "(a±b)² 展开", tip: "拆成整十数加减，利用完全平方公式。", example: "23² = 20²+2×20×3+3² = 529。" },
  { cat: "基础运算", name: "除法化乘", tip: "÷5=×2÷10，÷25=×4÷100，÷125=×8÷1000。", example: "240÷5 = 240×2÷10 = 48。" },
  { cat: "资料分析", name: "特征数字法", tip: "把常见百分数换成分数，减少除法。", example: "1/3≈33.3%，1/7≈14.3%，1/8=12.5%，1/9≈11.1%。" },
  { cat: "资料分析", name: "截位直除", tip: "分子分母各保留前三位，估算首两位，先定量级。", example: "4821÷63.2 ≈ 4800÷63 ≈ 76。" },
  { cat: "资料分析", name: "尾数法", tip: "加减法只算末位，快速排除选项。", example: "387+245+169 的末位 = 7+5+9 = 21，末位是1。" },
  { cat: "资料分析", name: "首数法", tip: "除法先看首位商几，再结合选项缩小范围。", example: "813÷27，首位约3，因为27×30=810。" },
  { cat: "资料分析", name: "化同/差分比较", tip: "分数比较可交叉相乘；接近时可比较差值。", example: "比较 17/23 与 18/25：17×25=425 > 18×23=414，所以 17/23 > 18/25。" },
];

const FORMULA_SCOPES = [
  { id: "all", label: "全部" },
  { id: "data", label: "资料分析" },
  { id: "quant", label: "数量关系" },
];

function inFormulaScope(f, scope = formulaScope) {
  if (scope === "all") return true;
  if (scope === "data") return f.group.startsWith("资料");
  return f.group.startsWith("数量");
}

function formulaQueue(formulas, scope, limit) {
  const pool = formulas.filter((f) => inFormulaScope(f, scope));
  const due = shuffle(pool.filter((f) => f.due));
  const unseen = shuffle(pool.filter((f) => !f.due && f.reps === 0));
  const rest = shuffle(pool.filter((f) => !f.due && f.reps > 0));
  return [...due, ...unseen, ...rest].slice(0, limit);
}

async function loadFormulas(force = false) {
  if (!force && FORMULAS_CACHE && FORMULAS_CACHE.length) return FORMULAS_CACHE;
  const formulas = await call("list_formulas", { today: today() });
  FORMULAS_CACHE = formulas;
  return formulas;
}

function scopeChips(onChange) {
  return h(
    "div",
    { class: "chips scope-chips" },
    FORMULA_SCOPES.map((s) =>
      h(
        "button",
        {
          class: "chip" + (formulaScope === s.id ? " on" : ""),
          type: "button",
          "aria-pressed": formulaScope === s.id ? "true" : "false",
          onclick: () => {
            formulaScope = s.id;
            onChange();
          },
        },
        s.label
      )
    )
  );
}

// 异步导航令牌：用户快速返回/切换页面时，丢弃已经过期的异步渲染结果
let navToken = 0;
let backTarget = null;
let focusTimer = null;
let pkTimer = null;
function stopAuxTimers() {
  if (focusTimer) {
    clearInterval(focusTimer);
    focusTimer = null;
  }
  if (pkTimer) {
    clearInterval(pkTimer);
    pkTimer = null;
  }
}
async function handleHardwareBack() {
  if (backTarget) {
    const target = backTarget;
    backTarget = null;
    target();
    return;
  }
  if (FC) {
    FC = null;
    renderFormulaList();
    return;
  }
  if (FP) {
    FP = null;
    renderFormulaList();
    return;
  }
  if (F) {
    F = null;
    renderFormulaList();
    return;
  }
  if (D) {
    leaveDrill();
    return;
  }
  if (S) {
    S = null;
    renderHome();
    return;
  }
  if (PK) {
    PK = null;
    renderEfficiency();
    return;
  }
  if (FOCUS) {
    FOCUS = null;
    renderEfficiency();
    return;
  }
  const title = document.querySelector("h1")?.textContent || "";
  if (title === "行测刷题") {
    try {
      if (window.__TAURI__?.app?.exit) await window.__TAURI__.app.exit(0);
      else await invoke("plugin:app|exit", { code: 0 });
    } catch {
      // 桌面端或浏览器环境没有 app.exit
    }
    return;
  }
  if (title === "公式一览图") {
    renderFormulaList();
    return;
  }
  if (title === "速算技巧") {
    renderDrillMenu();
    return;
  }
  if (["专注学习", "学习周报", "学习搭子 PK", "PK 结果"].includes(title)) {
    renderEfficiency();
    return;
  }
  renderHome();
}

async function registerHardwareBack() {
  const api = window.__TAURI__?.app;
  if (!api?.onBackButtonPress) return;
  try {
    await api.onBackButtonPress(handleHardwareBack);
  } catch {
    // 桌面端没有 Android 返回键监听
  }
}

const newNav = () => {
  ++navToken;
  backTarget = null;
  stopAuxTimers();
  return navToken;
};
const navIsCurrent = (token) => token === navToken;
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const IS_ANDROID = /Android/i.test(navigator.userAgent);
const REMINDER_KEY = "xingce.reminder";
const REMINDER_ID = 7102026;
const REMINDER_COUNT = 30;
const REMINDER_IDS = Array.from({ length: REMINDER_COUNT }, (_, i) => REMINDER_ID + i);
const REMINDER_TEST_ID = REMINDER_ID + 1000;
const REMINDER_CHANNEL = "daily-reminder";

/* ---------------- 每日提醒 ---------------- */

function readReminder() {
  try {
    const raw = JSON.parse(localStorage.getItem(REMINDER_KEY) || "null");
    const hour = Number(raw?.hour);
    const minute = Number(raw?.minute);
    return {
      enabled: raw?.enabled === true,
      hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 21,
      minute: Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : 0,
    };
  } catch {
    return { enabled: false, hour: 21, minute: 0 };
  }
}

function saveReminder(r) {
  try {
    localStorage.setItem(REMINDER_KEY, JSON.stringify(r));
  } catch {
    // 存储不可用时只在内存中生效
  }
}

function reminderText(r) {
  return `${String(r.hour).padStart(2, "0")}:${String(r.minute).padStart(2, "0")}`;
}

async function tryPlugin(cmd, args = {}) {
  try {
    return await invoke(`plugin:notification|${cmd}`, args);
  } catch (err) {
    console.warn(`[notification:${cmd}]`, err);
    return null;
  }
}

async function ensureNotificationPermission() {
  if (!IS_MOBILE) return false;

  const granted = await tryPlugin("is_permission_granted");
  if (granted === true) return true;
  if (granted === false) {
    toast("通知权限已被拒绝，请到系统设置中允许通知");
    return false;
  }

  const state = await tryPlugin("request_permission");
  if (state === "granted" || state === "Granted" || state === true) return true;
  if (state === "prompt-with-rationale") {
    const retry = await tryPlugin("request_permission");
    if (retry === "granted" || retry === "Granted" || retry === true) return true;
  }

  // 部分 WebView 会走浏览器通知权限，作为插件权限的兜底
  if (typeof Notification !== "undefined") {
    if (Notification.permission === "granted") return true;
    if (Notification.permission !== "denied" && Notification.requestPermission) {
      try {
        const web = await Notification.requestPermission();
        if (web === "granted") return true;
      } catch {
        // 继续走失败提示
      }
    }
  }

  toast("未获得通知权限，请到系统设置中允许通知");
  return false;
}

async function ensureNotificationChannel() {
  if (!IS_ANDROID) return null;
  try {
    await invoke("plugin:notification|create_channel", {
      id: REMINDER_CHANNEL,
      name: "每日提醒",
      description: "每天提醒完成行测目标",
      importance: 3,
      visibility: 0,
      lights: true,
      vibration: true,
    });
    return REMINDER_CHANNEL;
  } catch (err) {
    console.warn("[notification:create_channel]", err);
    return null;
  }
}

function reminderDate(hour, minute, offset) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + offset);
  return d;
}

async function scheduleDailyReminder(hour, minute) {
  // 先取消旧版单条 interval 提醒和本版所有提前排期的提醒
  await tryPlugin("cancel", { notifications: REMINDER_IDS });
  const channelId = await ensureNotificationChannel();

  let scheduled = 0;
  let lastError = null;
  for (let i = 0; i < REMINDER_COUNT; i++) {
    const options = {
      id: REMINDER_ID + i,
      ...(channelId ? { channelId } : {}),
      title: "行测刷题 · 每日提醒",
      body: "今天的目标还没完成，来做几道题吧！",
      schedule: {
        at: {
          date: reminderDate(hour, minute, i).toISOString(),
          repeating: false,
          allowWhileIdle: true,
        },
      },
    };
    try {
      await invoke("plugin:notification|notify", { options });
      scheduled++;
    } catch (err) {
      lastError = err;
      console.warn("[notification:schedule]", err);
    }
  }
  if (!scheduled) throw lastError || new Error("系统未能创建提醒");
  return scheduled;
}

async function cancelDailyReminder() {
  await tryPlugin("cancel", { notifications: REMINDER_IDS });
  // 兜底清掉旧版本可能残留的单条提醒
  await tryPlugin("cancel", {});
}

async function sendTestNotification() {
  if (!IS_MOBILE) {
    toast("桌面端不支持系统通知，请在手机上测试");
    return;
  }
  if (!(await ensureNotificationPermission())) return;
  const channelId = await ensureNotificationChannel();
  try {
    await invoke("plugin:notification|notify", {
      options: {
        id: REMINDER_TEST_ID,
        ...(channelId ? { channelId } : {}),
        title: "行测刷题 · 测试提醒",
        body: "提醒功能已生效，明天见！",
      },
    });
    toast("已发送测试通知");
  } catch (err) {
    toast(`测试通知失败：${errText(err)}`);
  }
}

async function syncReminderOnStart() {
  const r = readReminder();
  if (!r.enabled || !IS_MOBILE) return;
  const granted = await tryPlugin("is_permission_granted");
  if (granted === true) {
    try {
      await scheduleDailyReminder(r.hour, r.minute);
    } catch (err) {
      console.warn("[notification:sync]", err);
    }
  }
}

/* ---------------- 弹窗 / 庆祝 ---------------- */

function confetti() {
  if (REDUCED_MOTION || document.hidden) return;
  const em = ["🎉", "✨", "⭐", "🎊", "🍀"];
  for (let i = 0; i < 28; i++) {
    const s = h("span", { class: "cf", "aria-hidden": "true" }, em[i % em.length]);
    s.style.left = Math.random() * 100 + "vw";
    s.style.animationDelay = Math.random() * 0.4 + "s";
    s.style.fontSize = 14 + Math.random() * 16 + "px";
    document.body.append(s);
    setTimeout(() => s.remove(), 2400);
  }
}

function showModal({ icon = "❓", title, desc = "", actions = [], primaryValue = null, escapeValue = null }) {
  return new Promise((resolve) => {
    let closed = false;
    let box;
    const finish = (value) => {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey, true);
      box?.remove();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        finish(escapeValue);
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        finish(primaryValue ?? actions[0]?.value ?? null);
      }
    };
    const buttons = actions.map((a) =>
      h(
        "button",
        {
          class: a.kind === "primary" ? "primary" : "link" + (a.kind === "danger" ? " danger" : ""),
          type: "button",
          onclick: () => finish(a.value),
        },
        a.label
      )
    );
    box = h(
      "div",
      { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": title },
      h(
        "div",
        { class: "mbox" },
        h("div", { class: "micon", "aria-hidden": "true" }, icon),
        h("div", { class: "mtitle" }, title),
        desc ? h("p", { class: "sub" }, desc) : null,
        h("div", { class: "mactions" }, buttons)
      )
    );
    document.addEventListener("keydown", onKey, true);
    document.body.append(box);
    requestAnimationFrame(() => {
      const primary = box.querySelector(".primary") || box.querySelector("button");
      primary?.focus();
    });
  });
}

function celebrateModal(icon, title, desc) {
  confetti();
  return showModal({
    icon,
    title,
    desc,
    actions: [{ label: "太棒了", value: true, kind: "primary" }],
    primaryValue: true,
    escapeValue: true,
  });
}

function confirmDialog({ icon = "❓", title, desc, ok = "确定", cancel = "取消" }) {
  return showModal({
    icon,
    title,
    desc,
    actions: [
      { label: cancel, value: false, kind: "link" },
      { label: ok, value: true, kind: "primary" },
    ],
    primaryValue: true,
    escapeValue: false,
  });
}

// 升级 / 成就弹窗按顺序依次展示
let celebrating = Promise.resolve();
function celebrate(a) {
  if (!a) return;
  if (a.goal_hit) {
    toast("🎉 今日目标达成！");
    confetti();
  }
  celebrating = celebrating
    .then(async () => {
      if (a.level_up) await celebrateModal("🎊", "升职啦！", `Lv.${a.level} · ${a.title}`);
      const newAchv = a.new_achv || [];
      if (newAchv.length === 1) {
        const x = newAchv[0];
        await celebrateModal(x.icon, "解锁成就：" + x.name, x.desc);
      } else if (newAchv.length > 1) {
        await celebrateModal(
          "🏅",
          `解锁 ${newAchv.length} 个成就`,
          newAchv.slice(0, 6).map((x) => x.name).join("、") +
            (newAchv.length > 6 ? " 等" : "")
        );
      }
      const newAnimals = a.new_animals || [];
      if (newAnimals.length === 1) {
        const x = newAnimals[0];
        await celebrateModal(x.icon, "邂逅新伙伴：" + x.name, `${x.rarity} · ${x.desc}`);
      } else if (newAnimals.length > 1) {
        await celebrateModal(
          "🐾",
          `邂逅 ${newAnimals.length} 位新伙伴`,
          newAnimals.map((x) => `${x.icon}${x.name}`).join("、")
        );
      }
    })
    .catch((err) => console.error("celebrate", err));
}

/* ---------------- 首页 ---------------- */

function section(title, note, ...kids) {
  return h(
    "section",
    { class: "section" },
    h("div", { class: "section-head" }, h("h2", {}, title), note ? h("span", {}, note) : null),
    ...kids
  );
}

function card(title, desc, onclick, extra = "") {
  return h(
    "button",
    { class: "card " + extra, type: "button", onclick },
    h(
      "span",
      { class: "cardtext" },
      h("span", { class: "t" }, title),
      h("span", { class: "d" }, desc)
    ),
    h("span", { class: "go", "aria-hidden": "true" }, "›")
  );
}

function profileCard(p) {
  const maxed = p.level >= (p.max_level || 12);
  const span = Math.max(1, p.level_next - p.level_floor);
  const xpPct = maxed ? 100 : Math.min(100, ((p.xp - p.level_floor) / span) * 100);
  const goalPct = Math.min(100, (p.today_count / Math.max(1, p.goal)) * 100);
  const goalDone = p.today_count >= p.goal;
  const buddies = (p.animals || []).filter((a) => a.unlocked);
  const buddy = buddies[buddies.length - 1];

  return h(
    "div",
    { class: "profile" },
    h(
      "div",
      { class: "prow" },
      h("div", { class: "lvbadge" }, "Lv." + p.level),
      h("div", { class: "ptitle" }, p.title),
      h(
        "div",
        { class: "pstreak" + (p.streak ? "" : " off") },
        "🔥 " + p.streak + " 天",
        p.freezes ? h("small", {}, ` 🧊×${p.freezes}`) : null
      )
    ),
    h("div", { class: "bar2" }, h("i", { style: `width:${xpPct}%` })),
    h(
      "div",
      { class: "pmeta" },
      h("span", {}, maxed ? `${p.xp} XP · 已满级` : `经验 ${p.xp} / ${p.level_next}`),
      h("span", {}, maxed ? "最高职级" : `距升职 ${Math.max(0, p.level_next - p.xp)}`)
    ),
    h(
      "div",
      { class: "pmeta goal" },
      h("span", {}, goalDone ? "✅ 今日目标已达成" : `今日目标 ${p.today_count} / ${p.goal} 题`),
      h("span", {}, goalDone ? "" : "+20 XP")
    ),
    h("div", { class: "bar2 g" + (goalDone ? " done" : "") }, h("i", { style: `width:${goalPct}%` })),
    h(
      "div",
      { class: "pmeta companion" },
      h(
        "span",
        {},
        buddy ? `🐾 ${buddy.icon} ${buddy.name} 在陪你刷题` : "完成第一题，领养第一位动物伙伴"
      ),
      h("span", {}, p.animal_count ? `${p.animal_count}/${p.animal_total} 位伙伴` : "")
    )
  );
}

async function renderHome() {
  const token = newNav();
  stopTimer();
  S = null;
  D = null;
  F = null;
  FC = null;
  FP = null;
  ACHV_CACHE = null;
  ANIMAL_CACHE = null;
  formulaScope = "all";

  let cats, st, pf, formulas, quests;
  try {
    [cats, st, pf, formulas, quests] = await Promise.all([
      call("list_categories"),
      call("get_stats"),
      call("get_profile", { today: today() }),
      call("list_formulas", { today: today() }),
      call("get_daily_quests", { today: today() }),
    ]);
  } catch (err) {
    if (navIsCurrent(token)) renderError(err);
    return;
  }
  if (!navIsCurrent(token)) return;
  FORMULAS_CACHE = formulas;

  const totalQ = cats.reduce((a, c) => a + c.count, 0);
  const catDone = Object.values(st.stats || {}).reduce((a, s) => a + (s.done || 0), 0);
  const catRight = Object.values(st.stats || {}).reduce((a, s) => a + (s.right || 0), 0);
  const drillDone = Object.values(st.drill || {}).reduce((a, s) => a + (s.done || 0), 0);
  const drillRight = Object.values(st.drill || {}).reduce((a, s) => a + (s.right || 0), 0);
  const done = catDone + drillDone;
  const right = catRight + drillRight;
  const wrongs = st.wrong?.length || 0;
  const got = pf.achievement_count;
  const questDone = quests.filter((q) => q.progress >= q.target).length;
  const questReady = quests.filter((q) => q.progress >= q.target && !q.claimed).length;

  const dailyNode = card(
    "📅 每日挑战",
    pf.daily_done ? "今日已完成 ✓" : "5 道题 · 额外 +30 XP",
    () => start("每日挑战"),
    pf.daily_done ? "" : "hot"
  );
  const smartNode = card(
    "🧠 智能复习",
    `到期 ${pf.review_due} · 新题 ${pf.new_questions}`,
    () => start("智能复习"),
    pf.review_due > 0 ? "hot" : ""
  );
  const quickNode = card("⚡ 快速练习", "随机 10 题 · 热身", () =>
    start("全部", { limit: 10, shuffle: true, label: "快速练习" })
  );

  const todayNote =
    pf.review_due > 0
      ? `先清 ${pf.review_due} 道到期复习`
      : pf.daily_done
        ? "今日任务已完成，随便练几题保持手感"
        : "完成 20 题即达标";

  const formulaNode = card(
    "🧠 公式背诵",
    pf.formula_due
      ? `${formulas.length} 个公式 · 待复习 ${pf.formula_due}`
      : `${formulas.length} 个公式 · 背诵 · 实操`,
    renderFormulaList
  );

  screen(
    h(
      "div",
      { class: "home-head" },
      h(
        "div",
        {},
        h("h1", {}, "行测刷题"),
        h(
          "p",
          { class: "sub" },
          pf.streak ? `已连续打卡 ${pf.streak} 天，别断哦！` : "今天做几道题，开启你的连续打卡"
        )
      ),
      h(
        "button",
        { class: "icon-btn", type: "button", "aria-label": "设置与提醒", onclick: renderSettings },
        "⚙️"
      )
    ),
    profileCard(pf),
    h(
      "div",
      { class: "statline" },
      h("span", {}, `累计 ${done} 题`),
      h("span", {}, `正确率 ${pct(right, done)}`),
      h("span", {}, `错题 ${wrongs}`),
      h("span", {}, `待复习 ${pf.review_due}`)
    ),
    h(
      "button",
      { class: "quest-strip", type: "button", onclick: renderEfficiency },
      h(
        "span",
        { class: "qs-main" },
        h("b", {}, "今日任务"),
        h("span", {}, `${questDone}/${quests.length} 完成` + (questReady ? ` · ${questReady} 项可领取` : ""))
      ),
      h(
        "span",
        { class: "qs-dots", "aria-hidden": "true" },
        quests.map((q) => h("i", { class: q.progress >= q.target ? "done" : "" }))
      ),
      h("span", { class: "go" }, "›")
    ),
    section(
      "开始",
      todayNote,
      h(
        "div",
        { class: "grid2" },
        smartNode,
        dailyNode,
        quickNode,
        card("🧮 计算训练", "21 类速算 · 14 个技巧", renderDrillMenu)
      )
    ),
    section(
      "学习",
      "题库 · 公式 · 错题 · 复习",
      h(
        "div",
        { class: "grid2" },
        card("📚 题库练习", `${totalQ} 题 · 五大分类`, renderLibrary),
        formulaNode,
        card("📕 错题本", `${wrongs} 题 · 答对即移出`, () => start("错题本")),
        card("🎯 效率中心", `任务 ${questDone}/${quests.length} · 专注/周报/PK`, renderEfficiency)
      )
    ),
    section(
      "我的",
      "伙伴 · 成就 · 记录",
      h(
        "div",
        { class: "grid2" },
        card("🐾 动物乐园", `${pf.animal_count} / ${pf.animal_total} 位伙伴`, renderAnimals),
        card("🏅 成就", `已解锁 ${got} / ${pf.achievement_total}`, renderAchv),
        card("📜 历史记录", `${pf.history_count} 条 · 最近答题`, renderHistory),
        card("⚙️ 设置", "提醒 · 外观 · 数据", renderSettings)
      )
    ),
    h(
      "div",
      { class: "fact-card compact" },
      h("div", { class: "fact-title" }, "🐾 今日小知识"),
      h("p", {}, factOfDay())
    )
  );
}

async function renderLibrary() {
  const token = newNav();
  stopTimer();
  S = null;
  D = null;
  F = null;
  FC = null;
  FP = null;

  let cats, st;
  try {
    [cats, st] = await Promise.all([call("list_categories"), call("get_stats")]);
  } catch (err) {
    if (navIsCurrent(token)) renderError(err);
    return;
  }
  if (!navIsCurrent(token)) return;
  const total = cats.reduce((a, c) => a + c.count, 0);

  screen(
    h(
      "div",
      { class: "bar" },
      h("button", { class: "link", type: "button", onclick: renderHome }, "← 返回"),
      h("span", {}, `${total} 题`)
    ),
    h("h1", {}, "题库练习"),
    h("p", { class: "sub" }, "按分类练习，或直接随机开始。"),
    h(
      "div",
      { class: "list" },
      card("📚 全部题型", `${total} 题 · 随机顺序`, () => start("全部"))
    ),
    h(
      "div",
      { class: "grid2" },
      cats.map((c) => {
        const s = st.stats?.[c.name] || { done: 0, right: 0 };
        return card(
          c.name,
          `${c.count} 题` + (s.done ? ` · 正确率 ${pct(s.right, s.done)}` : ""),
          () => start(c.name)
        );
      })
    ),
    h(
      "div",
      { class: "actions" },
      h("button", { class: "link", type: "button", onclick: renderHome }, "返回首页")
    )
  );
}

function questRow(q, onClaim) {
  const pctDone = Math.min(100, (q.progress / Math.max(1, q.target)) * 100);
  return h(
    "div",
    { class: "quest-row" + (q.claimed ? " done" : "") },
    h(
      "div",
      { class: "qmain" },
      h("b", {}, q.title),
      h("span", {}, `${q.progress}/${q.target} · +${q.reward} XP`)
    ),
    h("div", { class: "qbar" }, h("i", { style: `width:${pctDone}%` })),
    q.claimed
      ? h("span", { class: "qtag" }, "已领取")
      : q.progress >= q.target
        ? h("button", { class: "primary qclaim", type: "button", onclick: onClaim }, "领取")
        : h("span", { class: "qtag" }, "进行中")
  );
}

async function claimQuest(id) {
  try {
    const aw = await call("claim_daily_quest", { today: today(), id });
    celebrate(aw);
    toast("任务奖励已领取");
    renderEfficiency();
  } catch {
    // call 已提示错误
  }
}

async function renderEfficiency() {
  const token = newNav();
  stopTimer();
  S = null;
  D = null;
  F = null;
  FC = null;
  FP = null;

  let pf, quests;
  try {
    [pf, quests] = await Promise.all([
      call("get_profile", { today: today() }),
      call("get_daily_quests", { today: today() }),
    ]);
  } catch (err) {
    if (navIsCurrent(token)) renderError(err);
    return;
  }
  if (!navIsCurrent(token)) return;

  screen(
    h(
      "div",
      { class: "bar" },
      h("button", { class: "link", type: "button", onclick: renderHome }, "← 返回"),
      h("span", {}, `今日专注 ${pf.focus_minutes}/${pf.focus_goal} 分钟`)
    ),
    h("h1", {}, "效率中心"),
    h("p", { class: "sub" }, "把今天的任务清掉，再用专注和复盘把效率拉满。"),
    section(
      "今日任务",
      "完成任务领 XP",
      h(
        "div",
        { class: "quest-list" },
        quests.map((q) => questRow(q, () => claimQuest(q.id)))
      )
    ),
    section(
      "工具",
      "专注 · 复盘 · 对战",
      h(
        "div",
        { class: "grid2" },
        card("⏱️ 专注学习", `${pf.focus_minutes}/${pf.focus_goal} 分钟 · 番茄钟`, renderFocus),
        card("📊 学习周报", "近 7 天趋势 · 薄弱分类", renderWeekly),
        card("⚔️ 学习搭子 PK", "离线对战 · 每日一题", renderPK),
        card("📈 复习计划", "艾宾浩斯曲线 · 未来 7 天", renderReviewPlan)
      )
    ),
    h(
      "div",
      { class: "actions" },
      h("button", { class: "link", type: "button", onclick: renderHome }, "返回首页")
    )
  );
}

const FOCUS_PRESETS = [25, 45, 60];

function clockText(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function stopFocusTimer() {
  if (focusTimer) {
    clearInterval(focusTimer);
    focusTimer = null;
  }
}

function updateFocusView() {
  if (!FOCUS) return;
  const total = FOCUS.minutes * 60;
  const done = total - FOCUS.remaining;
  FOCUS.ui.time.textContent = clockText(FOCUS.remaining);
  FOCUS.ui.status.textContent = FOCUS.finished
    ? "已完成，去休息一下"
    : FOCUS.running
      ? "专注中，先不看手机"
      : "准备好后开始";
  FOCUS.ui.bar.style.width = `${Math.max(0, Math.min(100, (done / total) * 100))}%`;
  FOCUS.ui.main.textContent = FOCUS.running ? "暂停" : FOCUS.finished ? "再来一次" : "开始专注";
  FOCUS.ui.reset.classList.toggle("hidden", !FOCUS.running && FOCUS.remaining === total);
  FOCUS.ui.presets.forEach((b) => {
    b.disabled = FOCUS.running;
    b.classList.toggle("on", Number(b.dataset.minutes) === FOCUS.minutes);
  });
}

function focusTick() {
  if (!FOCUS || !FOCUS.running) return;
  FOCUS.remaining = Math.max(0, Math.ceil((FOCUS.endAt - Date.now()) / 1000));
  updateFocusView();
  if (FOCUS.remaining <= 0) completeFocus();
}

function focusToggle() {
  if (!FOCUS || FOCUS.busy) return;
  if (FOCUS.finished) {
    FOCUS.finished = false;
    FOCUS.remaining = FOCUS.minutes * 60;
    updateFocusView();
    return;
  }
  if (FOCUS.running) {
    FOCUS.remaining = Math.max(0, Math.ceil((FOCUS.endAt - Date.now()) / 1000));
    FOCUS.running = false;
    stopFocusTimer();
    updateFocusView();
    return;
  }
  FOCUS.running = true;
  FOCUS.endAt = Date.now() + FOCUS.remaining * 1000;
  stopFocusTimer();
  focusTimer = setInterval(focusTick, 250);
  updateFocusView();
}

function resetFocus() {
  if (!FOCUS || FOCUS.busy) return;
  FOCUS.running = false;
  FOCUS.finished = false;
  FOCUS.remaining = FOCUS.minutes * 60;
  stopFocusTimer();
  updateFocusView();
}

async function completeFocus() {
  if (!FOCUS || FOCUS.busy) return;
  FOCUS.busy = true;
  FOCUS.running = false;
  stopFocusTimer();
  const session = FOCUS;
  const minutes = FOCUS.minutes;
  FOCUS.remaining = 0;
  updateFocusView();
  try {
    const r = await call("record_focus", { minutes, today: today() });
    celebrate(r.award);
    toast(`专注 ${r.minutes} 分钟，获得 ${r.award.xp} XP`);
    if (FOCUS === session) {
      FOCUS.finished = true;
      FOCUS.remaining = 0;
      updateFocusView();
    }
  } catch {
    if (FOCUS === session) {
      FOCUS.finished = false;
      FOCUS.remaining = FOCUS.minutes * 60;
      updateFocusView();
    }
  } finally {
    if (FOCUS === session) FOCUS.busy = false;
  }
}

async function renderFocus() {
  const token = newNav();
  stopTimer();
  S = null;
  D = null;
  F = null;
  FC = null;
  FP = null;

  let pf;
  try {
    pf = await call("get_profile", { today: today() });
  } catch (err) {
    if (navIsCurrent(token)) renderError(err);
    return;
  }
  if (!navIsCurrent(token)) return;

  FOCUS = {
    minutes: 25,
    remaining: 25 * 60,
    running: false,
    finished: false,
    busy: false,
    endAt: 0,
    ui: {},
  };
  const time = h("div", { class: "focus-time", "aria-live": "off" }, "25:00");
  const status = h("div", { class: "focus-status" }, "准备好后开始");
  const bar = h("i", { style: "width:0%" });
  const presets = FOCUS_PRESETS.map((m) =>
    h(
      "button",
      {
        class: "chip",
        type: "button",
        "data-minutes": m,
        onclick: () => {
          if (!FOCUS || FOCUS.running || FOCUS.busy) return;
          FOCUS.minutes = m;
          FOCUS.remaining = m * 60;
          FOCUS.finished = false;
          updateFocusView();
        },
      },
      `${m} 分钟`
    )
  );
  const main = h("button", { class: "primary", type: "button", onclick: focusToggle }, "开始专注");
  const reset = h("button", { class: "link hidden", type: "button", onclick: resetFocus }, "重置");
  FOCUS.ui = { time, status, bar, presets, main, reset };
  updateFocusView();

  screen(
    h(
      "div",
      { class: "bar" },
      h("button", { class: "link", type: "button", onclick: renderEfficiency }, "← 效率中心"),
      h("span", {}, `今日 ${pf.focus_minutes} 分钟`)
    ),
    h("h1", {}, "专注学习"),
    h("p", { class: "sub" }, "选一个时长，专注做完一件事。完成后按分钟获得 XP。"),
    h(
      "div",
      { class: "focus-card" },
      h("div", { class: "focus-orbit" }, time, status),
      h("div", { class: "focus-bar" }, bar),
      h("div", { class: "focus-presets" }, presets),
      h("div", { class: "focus-actions" }, main, reset)
    ),
    h("p", { class: "kbd-hint" }, "离开页面会停止计时；单日专注上限 180 分钟。"),
    h(
      "div",
      { class: "actions" },
      h("button", { class: "link", type: "button", onclick: renderEfficiency }, "返回效率中心")
    )
  );
}

async function renderWeekly() {
  const token = newNav();
  stopTimer();
  S = null;
  D = null;
  F = null;
  FC = null;
  FP = null;

  let report;
  try {
    report = await call("get_weekly_report", { today: today() });
  } catch (err) {
    if (navIsCurrent(token)) renderError(err);
    return;
  }
  if (!navIsCurrent(token)) return;

  const max = Math.max(1, ...report.days.map((d) => d.count));
  const maxCat = Math.max(1, ...report.categories.map((c) => c.done));
  const catRows = report.categories.length
    ? report.categories.map((c) =>
        h(
          "div",
          { class: "wcat" },
          h(
            "div",
            { class: "wcat-head" },
            h("b", {}, c.name),
            h("span", {}, `${c.done} 题 · ${pct(c.right, c.done)}`)
          ),
          h("div", { class: "qbar" }, h("i", { style: `width:${(c.done / maxCat) * 100}%` }))
        )
      )
    : [h("p", { class: "sub" }, "本周还没有答题记录。")];

  screen(
    h(
      "div",
      { class: "bar" },
      h("button", { class: "link", type: "button", onclick: renderEfficiency }, "← 效率中心"),
      h("span", {}, `${report.start_date} — ${report.end_date}`)
    ),
    h("h1", {}, "学习周报"),
    h("p", { class: "sub" }, "看看这一周的节奏，找到最值得改进的一环。"),
    h(
      "div",
      { class: "statline" },
      h("span", {}, `答题 ${report.total}`),
      h("span", {}, `正确率 ${pct(report.correct, report.total)}`),
      h("span", {}, `活跃 ${report.active_days} 天`),
      h("span", {}, `日均 ${report.average} 题`)
    ),
    section(
      "近 7 天",
      `最佳 ${report.best_day || "—"}`,
      h(
        "div",
        { class: "wchart" },
        report.days.map((d) =>
          h(
            "div",
            { class: "wday" + (d.count ? " active" : "") },
            h("span", { class: "wcount" }, d.count ? String(d.count) : ""),
            h("div", { class: "wbar" }, h("i", { style: `height:${Math.max(4, (d.count / max) * 100)}%` })),
            h("small", {}, d.label)
          )
        )
      )
    ),
    section("分类表现", "正确率从低到高", h("div", { class: "wcats" }, catRows)),
    report.weakest
      ? h(
          "div",
          { class: "fact-card" },
          h("div", { class: "fact-title" }, "🎯 本周建议"),
          h("p", {}, `「${report.weakest.name}」正确率偏低，建议回看错题并做一组专项练习。`),
          h(
            "button",
            { class: "primary", type: "button", onclick: () => start(report.weakest.name) },
            `练习 ${report.weakest.name}`
          )
        )
      : null,
    h(
      "div",
      { class: "actions" },
      h("button", { class: "link", type: "button", onclick: renderEfficiency }, "返回效率中心")
    )
  );
}

function pkTick() {
  if (!PK || !PK.active || PK.answered) return;
  PK.remaining = Math.max(0, PK.remaining - 1);
  if (PK.ui?.time) PK.ui.time.textContent = `⏱ ${PK.remaining}s`;
  if (PK.remaining <= 0) finishPK(null);
}

async function renderPK() {
  const token = newNav();
  stopTimer();
  S = null;
  D = null;
  F = null;
  FC = null;
  FP = null;

  let base;
  try {
    base = await call("get_questions", { mode: "全部", today: today() });
  } catch (err) {
    if (navIsCurrent(token)) renderError(err);
    return;
  }
  if (!navIsCurrent(token)) return;
  if (!base.length) {
    toast("暂时没有可用的 PK 题目");
    return;
  }
  const q = shuffle(base)[0];
  const order = shuffle(q.options.map((_, i) => i));
  const seed = Number(today().replace(/-/g, ""));
  PK = {
    q,
    order,
    remaining: 30,
    botScore: 8 + ((q.id + seed) % 8),
    answered: false,
    active: true,
    ui: {},
  };

  const time = h("span", { class: "pk-timer" }, `⏱ ${PK.remaining}s`);
  const opts = order.map((original, k) =>
    h(
      "button",
      { class: "opt", type: "button", onclick: () => finishPK(k) },
      h("b", {}, String.fromCharCode(65 + k)),
      h("span", {}, q.options[original])
    )
  );
  PK.ui = { time };
  pkTimer = setInterval(pkTick, 1000);

  screen(
    h(
      "div",
      { class: "bar" },
      h("button", { class: "link", type: "button", onclick: renderEfficiency }, "← 效率中心"),
      time
    ),
    h("h1", {}, "学习搭子 PK"),
    h("p", { class: "sub" }, "30 秒内答对得基础分，答得越快加分越多。对手是离线学习搭子。"),
    h("div", { class: "pk-bot" }, "🐾 学习搭子已就位，准备好了吗？"),
    h("p", { class: "stem" }, q.stem),
    h("div", { class: "opts", role: "group", "aria-label": "PK 选项" }, opts),
    h("p", { class: "kbd-hint" }, "按 1–4 作答；超时视为放弃本题。")
  );
}

async function finishPK(choiceIndex) {
  if (!PK || !PK.active || PK.answered) return;
  PK.answered = true;
  if (pkTimer) {
    clearInterval(pkTimer);
    pkTimer = null;
  }
  const session = PK;
  const q = session.q;
  let userScore = 0;
  let correct = false;
  let explanation = "超时未作答。";
  if (choiceIndex !== null) {
    const choice = session.order[choiceIndex];
    try {
      const r = await call("submit_answer", {
        id: q.id,
        choice,
        combo: 0,
        today: today(),
        mode: "学习搭子 PK",
      });
      if (PK !== session) return;
      correct = r.correct;
      explanation = r.explanation;
      userScore = correct ? 10 + Math.min(10, Math.ceil(session.remaining / 5)) : 0;
      celebrate(r.award);
    } catch {
      if (PK === session) PK.active = false;
      return;
    }
  }
  if (PK !== session) return;
  PK.active = false;
  PK.result = { q, userScore, botScore: session.botScore, correct, explanation };
  renderPKResult(PK.result);
}

function renderPKResult(result) {
  const { q, userScore, botScore, correct, explanation } = result;
  const outcome = userScore > botScore ? "你赢了！" : userScore === botScore ? "平局" : "学习搭子略胜一筹";
  const answer =
    q.options[q.answer] != null ? q.options[q.answer] : "暂无";
  screen(
    h(
      "div",
      { class: "bar" },
      h("button", { class: "link", type: "button", onclick: renderEfficiency }, "← 效率中心"),
      h("span", {}, "离线对战")
    ),
    h("h1", {}, "PK 结果"),
    h("div", { class: "center" }, h("div", { class: "big" }, outcome)),
    h(
      "div",
      { class: "pk-score" },
      h("div", {}, h("b", {}, String(userScore)), h("span", {}, "你")),
      h("div", { class: "vs" }, "VS"),
      h("div", {}, h("b", {}, String(botScore)), h("span", {}, "学习搭子"))
    ),
    h(
      "div",
      { class: "exp" },
      h("div", {}, correct ? "✓ 本题答对。" : "✗ 本题未答对。"),
      h("div", { class: "note" }, `正确答案：${answer}`),
      h("div", {}, explanation)
    ),
    h(
      "div",
      { class: "actions" },
      h("button", { class: "primary", type: "button", onclick: renderPK }, "再来一局"),
      h("button", { class: "link", type: "button", onclick: sharePK }, "分享战绩"),
      h("button", { class: "link", type: "button", onclick: renderEfficiency }, "返回效率中心")
    )
  );
}

async function sharePK() {
  const r = PK?.result;
  const text = r
    ? `我在行测刷题的学习搭子 PK 中拿到 ${r.userScore} 分，学习搭子 ${r.botScore} 分，来挑战我！`
    : "我在行测刷题练习，来和我一起卷！";
  try {
    if (navigator.share) {
      await navigator.share({ title: "行测刷题 · 学习搭子 PK", text });
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      toast("战绩已复制");
    } else {
      toast("当前环境不支持分享");
    }
  } catch {
    // 用户取消分享时保持当前页面
  }
}

async function resetAll() {
  const ok = await confirmDialog({
    icon: "🧹",
    title: "清空所有进度？",
    desc: "经验、等级、成就、错题本和学习统计都会被清空，且无法恢复。",
    ok: "确认清空",
  });
  if (!ok) return;
  try {
    await call("reset_progress");
  } catch {
    return;
  }
  toast("已清空所有进度");
  renderHome();
}

function renderSettings() {
  newNav();
  stopTimer();
  S = null;
  D = null;
  F = null;
  FC = null;
  FP = null;

  const r = readReminder();
  const enabled = IS_MOBILE && r.enabled;
  const toggle = h("input", {
    class: "switch",
    type: "checkbox",
    checked: enabled,
    disabled: !IS_MOBILE,
    "aria-label": "开启每日提醒",
  });
  const time = h("input", {
    class: "time-input",
    type: "time",
    value: reminderText(r),
    disabled: !IS_MOBILE,
    "aria-label": "提醒时间",
  });
  const status = h(
    "p",
    { class: "sub" },
    !IS_MOBILE ? "桌面端暂不支持系统通知，请在手机上设置。" : enabled ? `已开启 · 每天 ${reminderText(r)}` : "未开启每日提醒"
  );

  const save = h(
    "button",
    {
      class: "primary",
      type: "button",
      disabled: !IS_MOBILE,
      onclick: async () => {
        if (!IS_MOBILE) {
          toast("桌面端暂不支持系统通知，请在手机上设置");
          return;
        }
        const [hourText, minuteText] = (time.value || "21:00").split(":");
        const hour = Number(hourText);
        const minute = Number(minuteText);
        if (
          !Number.isInteger(hour) ||
          !Number.isInteger(minute) ||
          hour < 0 ||
          hour > 23 ||
          minute < 0 ||
          minute > 59
        ) {
          toast("请选择有效的提醒时间");
          return;
        }
        const next = { enabled: toggle.checked, hour, minute };
        let scheduledCount = 0;
        if (next.enabled) {
          if (!(await ensureNotificationPermission())) {
            toggle.checked = readReminder().enabled;
            return;
          }
          try {
            scheduledCount = await scheduleDailyReminder(hour, minute);
          } catch (err) {
            toggle.checked = readReminder().enabled;
            toast(`提醒设置失败：${errText(err)}`);
            return;
          }
        } else {
          await cancelDailyReminder();
        }
        saveReminder(next);
        toast(
          next.enabled
            ? `已设置每天 ${reminderText(next)} 提醒（排期 ${scheduledCount} 天）`
            : "已关闭每日提醒"
        );
        renderSettings();
      },
    },
    "保存提醒"
  );
  const test = h("button", {
    class: "link",
    type: "button",
    onclick: sendTestNotification,
  }, "发送测试通知");
  if (!IS_MOBILE) test.classList.add("hidden");

  screen(
    h(
      "div",
      { class: "bar" },
      h("button", { class: "link", type: "button", onclick: renderHome }, "← 返回"),
      h("span")
    ),
    h("h1", {}, "设置"),
    h("p", { class: "sub" }, "把提醒时间固定下来，比“想起来再练”更有效。"),
    h(
      "div",
      { class: "settings-card" },
      h(
        "div",
        { class: "setting-row" },
        h(
          "div",
          {},
          h("div", { class: "t" }, "每日提醒"),
          h("div", { class: "d" }, IS_MOBILE ? "每天固定时间提醒你完成目标" : "桌面端暂不支持系统通知")
        ),
        h(
          "label",
          { class: "switch-wrap" },
          toggle,
          h("span", { class: "switch-track" }, h("span", { class: "switch-thumb" }))
        )
      ),
      h(
        "div",
        { class: "setting-row" },
        h("div", {}, h("div", { class: "t" }, "提醒时间"), h("div", { class: "d" }, "按手机本地时区")),
        time
      ),
      status,
      h("div", { class: "actions" }, save, test)
    ),
    h(
      "div",
      { class: "settings-card" },
      h(
        "div",
        { class: "setting-row" },
        h(
          "div",
          {},
          h("div", { class: "t" }, "数据与隐私"),
          h("div", { class: "d" }, "进度只保存在本机应用私有目录，不上传服务器。")
        )
      ),
      h(
        "div",
        { class: "setting-row" },
        h(
          "div",
          {},
          h("div", { class: "t" }, "版本"),
          h("div", { class: "d" }, "0.9.4 · 反馈置顶 · 返回键导航")
        )
      )
    ),
    h(
      "div",
      { class: "center" },
      h("button", { class: "link danger", type: "button", onclick: resetAll }, "清空所有进度")
    )
  );
}

async function renderReviewPlan() {
  const token = newNav();
  stopTimer();
  S = null;
  D = null;
  F = null;
  FC = null;
  FP = null;

  let plan;
  try {
    plan = await call("get_review_plan", { today: today() });
  } catch (err) {
    if (navIsCurrent(token)) renderError(err);
    return;
  }
  if (!navIsCurrent(token)) return;

  const bar = (label, count, max) =>
    h(
      "div",
      { class: "plan-row" },
      h("span", { class: "plan-label" }, label),
      h("div", { class: "plan-track" }, h("i", { style: `width:${max > 0 ? (count / max) * 100 : 0}%` })),
      h("span", { class: "plan-count" }, String(count))
    );
  const bars = (items, max) => h("div", { class: "plan-list" }, items.map((x) => bar(x.label, x.count, max)));
  const maxForecast = Math.max(1, ...plan.forecast.map((x) => x.count));
  const maxStage = Math.max(1, ...plan.stages.map((x) => x.count));
  const maxFormula = Math.max(1, ...plan.formula_forecast.map((x) => x.count));

  screen(
    h(
      "div",
      { class: "bar" },
      h("button", { class: "link", type: "button", onclick: renderHome }, "← 返回"),
      h("span")
    ),
    h("h1", {}, "复习计划"),
    h("p", { class: "sub" }, "艾宾浩斯间隔：1 / 2 / 4 / 7 / 15 / 30 / 60 天。答错回到第 0 阶，明天再复习。"),
    h(
      "div",
      { class: "statline" },
      h("span", {}, `今日到期 ${plan.due_today}`),
      h("span", {}, `新题 ${plan.new_questions}`),
      h("span", {}, `公式到期 ${plan.formula_due}`),
      h("span", {}, `已进入复习 ${plan.review_total}`)
    ),
    section("未来 7 天", "题目到期预测", bars(plan.forecast, maxForecast)),
    section("记忆阶段", "题目分布", bars(plan.stages, maxStage)),
    section("公式复习", "未来 7 天", bars(plan.formula_forecast, maxFormula)),
    h(
      "div",
      { class: "actions" },
      h("button", { class: "primary", type: "button", onclick: () => start("智能复习") }, "开始智能复习"),
      h("button", { class: "link", type: "button", onclick: startFormulaCards }, "公式背诵卡"),
      h("button", { class: "link", type: "button", onclick: startFormulaPractice }, "公式实操"),
      h("button", { class: "link", type: "button", onclick: renderHome }, "返回首页")
    )
  );
}

function makePager(page, total, size, setPage, rerender) {
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  return h(
    "div",
    { class: "pager" },
    h(
      "button",
      {
        class: "chip",
        type: "button",
        disabled: current <= 0,
        onclick: () => {
          setPage(current - 1);
          rerender();
        },
      },
      "上一页"
    ),
    h("span", {}, `${current + 1} / ${pages}`),
    h(
      "button",
      {
        class: "chip",
        type: "button",
        disabled: current >= pages - 1,
        onclick: () => {
          setPage(current + 1);
          rerender();
        },
      },
      "下一页"
    )
  );
}

async function renderAchv() {
  const token = newNav();
  stopTimer();
  S = null;
  D = null;
  F = null;
  FC = null;
  FP = null;

  if (!ACHV_CACHE) {
    try {
      ACHV_CACHE = await call("get_achievements");
    } catch (err) {
      if (navIsCurrent(token)) renderError(err);
      return;
    }
  }
  if (!navIsCurrent(token)) return;

  const all = ACHV_CACHE;
  const got = all.filter((a) => a.unlocked).length;
  const groups = [...new Set(all.map((a) => a.group))];
  const visible = achvFilter === "all" ? all : all.filter((a) => a.group === achvFilter);
  const pages = Math.max(1, Math.ceil(visible.length / ACHV_PAGE_SIZE));
  achvPage = Math.min(achvPage, pages - 1);
  const slice = visible.slice(achvPage * ACHV_PAGE_SIZE, (achvPage + 1) * ACHV_PAGE_SIZE);

  screen(
    h(
      "div",
      { class: "bar" },
      h("button", { class: "link", type: "button", onclick: renderHome }, "← 返回"),
      h("span")
    ),
    h("h1", {}, "成就墙"),
    h("p", { class: "sub" }, `已解锁 ${got} / ${all.length} 个成就`),
    h("div", { class: "progress" }, h("i", { style: `width:${(got / all.length) * 100}%` })),
    h(
      "div",
      { class: "chips scope-chips" },
      h(
        "button",
        {
          class: "chip" + (achvFilter === "all" ? " on" : ""),
          type: "button",
          onclick: () => {
            achvFilter = "all";
            achvPage = 0;
            renderAchv();
          },
        },
        `全部 ${all.length}`
      ),
      groups.map((g) =>
        h(
          "button",
          {
            class: "chip" + (achvFilter === g ? " on" : ""),
            type: "button",
            onclick: () => {
              achvFilter = g;
              achvPage = 0;
              renderAchv();
            },
          },
          g
        )
      )
    ),
    h(
      "div",
      { class: "agrid" },
      slice.map((a) =>
        h(
          "div",
          { class: "badge achv" + (a.unlocked ? "" : " locked") },
          h("div", { class: "bicon", "aria-hidden": "true" }, a.unlocked ? a.icon : "🔒"),
          h("div", { class: "bname" }, a.name),
          h("div", { class: "bmeta" }, a.group),
          h("div", { class: "bdesc" }, a.desc)
        )
      )
    ),
    makePager(achvPage, visible.length, ACHV_PAGE_SIZE, (n) => (achvPage = n), renderAchv),
    h(
      "div",
      { class: "actions" },
      h("button", { class: "link", type: "button", onclick: renderHome }, "返回首页")
    )
  );
}

async function renderAnimals() {
  const token = newNav();
  stopTimer();
  S = null;
  D = null;
  F = null;
  FC = null;
  FP = null;

  if (!ANIMAL_CACHE) {
    try {
      ANIMAL_CACHE = await call("get_profile", { today: today() });
    } catch (err) {
      if (navIsCurrent(token)) renderError(err);
      return;
    }
  }
  if (!navIsCurrent(token)) return;

  const pf = ANIMAL_CACHE;
  const all = pf.animals;
  const got = all.filter((a) => a.unlocked).length;
  const visible =
    animalFilter === "owned"
      ? all.filter((a) => a.unlocked)
      : animalFilter === "locked"
        ? all.filter((a) => !a.unlocked)
        : all;
  const pages = Math.max(1, Math.ceil(visible.length / ANIMAL_PAGE_SIZE));
  animalPage = Math.min(animalPage, pages - 1);
  const slice = visible.slice(animalPage * ANIMAL_PAGE_SIZE, (animalPage + 1) * ANIMAL_PAGE_SIZE);

  screen(
    h(
      "div",
      { class: "bar" },
      h("button", { class: "link", type: "button", onclick: renderHome }, "← 返回"),
      h("span")
    ),
    h("h1", {}, "动物乐园"),
    h("p", { class: "sub" }, `已领养 ${got} / ${pf.animal_total} 位伙伴 · 答题、打卡、升级都会遇到新朋友`),
    h("div", { class: "progress" }, h("i", { style: `width:${(got / Math.max(1, pf.animal_total)) * 100}%` })),
    h(
      "div",
      { class: "chips scope-chips" },
      h(
        "button",
        {
          class: "chip" + (animalFilter === "all" ? " on" : ""),
          type: "button",
          onclick: () => {
            animalFilter = "all";
            animalPage = 0;
            renderAnimals();
          },
        },
        `全部 ${all.length}`
      ),
      h(
        "button",
        {
          class: "chip" + (animalFilter === "owned" ? " on" : ""),
          type: "button",
          onclick: () => {
            animalFilter = "owned";
            animalPage = 0;
            renderAnimals();
          },
        },
        `已收集 ${got}`
      ),
      h(
        "button",
        {
          class: "chip" + (animalFilter === "locked" ? " on" : ""),
          type: "button",
          onclick: () => {
            animalFilter = "locked";
            animalPage = 0;
            renderAnimals();
          },
        },
        `未发现 ${all.length - got}`
      )
    ),
    h(
      "div",
      { class: "agrid" },
      slice.map((a) =>
        h(
          "div",
          { class: "badge animal" + (a.unlocked ? "" : " locked") },
          h("div", { class: "bicon", "aria-hidden": "true" }, a.unlocked ? a.icon : "🥚"),
          h("div", { class: "bname" }, a.name),
          h("div", { class: "ararity" }, a.unlocked ? a.rarity : `${a.rarity} · 未解锁`),
          h("div", { class: "bdesc" }, a.unlocked ? a.desc : a.hint)
        )
      )
    ),
    makePager(animalPage, visible.length, ANIMAL_PAGE_SIZE, (n) => (animalPage = n), renderAnimals),
    h(
      "div",
      { class: "actions" },
      h("button", { class: "primary", type: "button", onclick: () => start("智能复习") }, "去刷题找伙伴"),
      h("button", { class: "link", type: "button", onclick: renderHome }, "返回首页")
    )
  );
}

async function renderHistory() {
  const token = newNav();
  stopTimer();
  S = null;
  D = null;
  F = null;
  FC = null;
  FP = null;

  let items;
  try {
    items = await call("get_history", { limit: 500 });
  } catch (err) {
    if (navIsCurrent(token)) renderError(err);
    return;
  }
  if (!navIsCurrent(token)) return;

  const correct = items.filter((x) => x.correct).length;
  const filtered = historyFilter === "wrong" ? items.filter((x) => !x.correct) : items;
  const historyItem = (item, idx) => {
    const your =
      item.options[item.choice] != null ? item.options[item.choice] : "未记录";
    const answer =
      item.options[item.answer] != null ? item.options[item.answer] : "题目已移除";
    return h(
      "details",
      { class: "review" + (item.correct ? " ok" : " bad") },
      h(
        "summary",
        {},
        h("span", { class: "ricon", "aria-hidden": "true" }, item.correct ? "✓" : "✗"),
        h(
          "span",
          { class: "rstem" },
          `${idx + 1}. ${item.day} · ${item.mode} · ${item.category}
${item.stem}`
        )
      ),
      h(
        "div",
        { class: "rbody" },
        h("div", { class: "rrow" }, h("b", {}, "你的答案"), h("span", {}, your)),
        h("div", { class: "rrow" }, h("b", {}, "正确答案"), h("span", { class: "ok-text" }, answer)),
        h("div", { class: "rexp" }, item.explanation || "该题已从题库移除，暂无解析。")
      )
    );
  };

  screen(
    h(
      "div",
      { class: "bar" },
      h("button", { class: "link", type: "button", onclick: renderHome }, "← 返回"),
      h("span")
    ),
    h("h1", {}, "答题记录"),
    h(
      "p",
      { class: "sub" },
      items.length
        ? `最近 ${items.length} 条 · 正确率 ${pct(correct, items.length)}`
        : "还没有答题记录，先去做几道题吧。"
    ),
    h(
      "div",
      { class: "chips scope-chips" },
      h(
        "button",
        {
          class: "chip" + (historyFilter === "all" ? " on" : ""),
          type: "button",
          onclick: () => {
            historyFilter = "all";
            renderHistory();
          },
        },
        "全部"
      ),
      h(
        "button",
        {
          class: "chip" + (historyFilter === "wrong" ? " on" : ""),
          type: "button",
          onclick: () => {
            historyFilter = "wrong";
            renderHistory();
          },
        },
        "只看错题"
      )
    ),
    filtered.length
      ? h("div", { class: "reviews" }, filtered.map(historyItem))
      : h("p", { class: "sub" }, historyFilter === "wrong" ? "没有错题记录，很棒！" : "暂无记录。"),
    h(
      "div",
      { class: "actions" },
      h("button", { class: "link danger", type: "button", onclick: clearHistory }, "清空答题记录"),
      h("button", { class: "link", type: "button", onclick: renderHome }, "返回首页")
    )
  );
}

async function clearHistory() {
  const ok = await confirmDialog({
    icon: "📜",
    title: "清空答题记录？",
    desc: "只清空历史记录，不影响错题本、经验、复习计划和统计数据。",
    ok: "确认清空",
  });
  if (!ok) return;
  try {
    await call("clear_history");
  } catch {
    return;
  }
  toast("已清空答题记录");
  renderHistory();
}

/* ---------------- 资料分析公式 ---------------- */

async function renderFormulaList() {
  const token = newNav();
  stopTimer();
  S = null;
  D = null;
  F = null;
  FC = null;
  FP = null;

  let formulas;
  try {
    formulas = await loadFormulas(true);
  } catch (err) {
    if (navIsCurrent(token)) renderError(err);
    return;
  }
  if (!navIsCurrent(token)) return;

  const dueCount = formulas.filter((f) => f.due).length;
  const visible = formulas.filter((f) => inFormulaScope(f));
  const groups = [...new Set(visible.map((f) => f.group))];
  const formulaSections = groups.map((group) => {
    const items = visible.filter((f) => f.group === group);
    return section(
      group,
      `${items.length} 条`,
      h(
        "div",
        { class: "formula-list" },
        items.map((f) => {
          let badge = "新公式";
          let badgeClass = "fgroup new";
          if (f.due) {
            badge = "待复习";
            badgeClass = "fgroup due";
          } else if (f.reps > 0) {
            badge = `第 ${f.stage} 阶`;
            badgeClass = "fgroup stage";
          }
          return h(
            "details",
            { class: "formula", open: !memorizeFormulas },
            h(
              "summary",
              {},
              h("span", { class: "fname" }, f.name),
              h("span", { class: badgeClass }, badge)
            ),
            h(
              "div",
              { class: "fbody" },
              h("div", { class: "fformula" }, f.formula),
              h("div", { class: "fnote" }, f.note),
              h("div", { class: "fexample" }, "例：" + f.example)
            )
          );
        })
      )
    );
  });

  screen(
    h(
      "div",
      { class: "bar" },
      h("button", { class: "link", type: "button", onclick: renderHome }, "← 返回"),
      h("span")
    ),
    h("h1", {}, "公式背诵"),
    h(
      "p",
      { class: "sub" },
      `共 ${formulas.length} 个公式 · 当前范围 ${visible.length} 个 · 今日待复习 ${dueCount} 个`
    ),
    scopeChips(renderFormulaList),
    h(
      "div",
      { class: "formula-actions" },
      h("button", { class: "primary", type: "button", onclick: startFormulaQuiz }, "开始公式测验"),
      h(
        "div",
        { class: "grid2" },
        h("button", { class: "chip", type: "button", onclick: startFormulaCards }, "🃏 背诵卡"),
        h("button", { class: "chip", type: "button", onclick: renderFormulaPoster }, "🗺️ 一览图")
      ),
      h("button", { class: "chip", type: "button", onclick: startFormulaPractice }, "🧮 公式实操"),
      h(
        "button",
        {
          class: "chip" + (memorizeFormulas ? " on" : ""),
          type: "button",
          "aria-pressed": memorizeFormulas ? "true" : "false",
          onclick: () => {
            memorizeFormulas = !memorizeFormulas;
            renderFormulaList();
          },
        },
        memorizeFormulas ? "背诵模式：隐藏公式" : "背诵模式：显示公式"
      )
    ),
    formulaSections,
    h("button", { class: "primary", type: "button", onclick: startFormulaQuiz }, "开始公式测验")
  );
}

async function renderFormulaPoster() {
  const token = newNav();
  stopTimer();
  S = null;
  D = null;
  F = null;
  FC = null;
  FP = null;

  let formulas;
  try {
    formulas = await loadFormulas(false);
  } catch (err) {
    if (navIsCurrent(token)) renderError(err);
    return;
  }
  if (!navIsCurrent(token)) return;

  const visible = formulas.filter((f) => inFormulaScope(f));
  const groups = [...new Set(visible.map((f) => f.group))];
  const poster = h(
    "div",
    { class: "poster-groups" },
    groups.map((group) => {
      const items = visible.filter((f) => f.group === group);
      return h(
        "div",
        { class: "poster-group" },
        h("div", { class: "poster-head" }, h("b", {}, group), h("span", {}, `${items.length} 条`)),
        h(
          "div",
          { class: "poster-list" },
          items.map((f) =>
            h(
              "div",
              { class: "poster-item" },
              h("b", {}, f.name),
              h("span", {}, f.formula)
            )
          )
        )
      );
    })
  );

  screen(
    h(
      "div",
      { class: "bar" },
      h("button", { class: "link", type: "button", onclick: renderFormulaList }, "← 公式列表"),
      h("span")
    ),
    h("h1", {}, "公式一览图"),
    h("p", { class: "sub" }, `资料分析 + 数量关系 · 当前范围 ${visible.length} 个公式`),
    scopeChips(renderFormulaPoster),
    poster,
    h(
      "div",
      { class: "actions" },
      h("button", { class: "primary", type: "button", onclick: startFormulaCards }, "开始背诵卡"),
      h("button", { class: "link", type: "button", onclick: startFormulaPractice }, "公式实操"),
      h("button", { class: "link", type: "button", onclick: startFormulaQuiz }, "公式测验"),
      h("button", { class: "link", type: "button", onclick: renderFormulaList }, "返回公式列表")
    )
  );
}

async function startFormulaQuiz() {
  const token = newNav();
  let pool;
  try {
    pool = await loadFormulas(true);
  } catch {
    return;
  }
  if (!navIsCurrent(token)) return;
  const picked = formulaQueue(pool, formulaScope, 10);
  if (picked.length < 4) {
    toast("当前范围公式不足，无法开始测验");
    return;
  }

  stopTimer();
  S = null;
  D = null;
  FC = null;
  FP = null;
  const qs = picked.map((f) => {
    const others = shuffle(
      pool.filter(
        (x) => x.id !== f.id && x.formula !== f.formula && inFormulaScope(x, formulaScope)
      )
    )
      .slice(0, 3)
      .map((x) => x.formula);
    while (others.length < 3) others.push("以上都不对");
    const options = shuffle([f.formula, ...others]);
    return {
      id: f.id,
      prompt: `「${f.name}」的计算公式是？`,
      options,
      answer: options.indexOf(f.formula),
      explanation: `${f.note} 例：${f.example}`,
    };
  });
  F = { qs, i: 0, right: 0, done: false, log: [] };
  renderFormulaQ();
}

function renderFormulaQ() {
  const q = F.qs[F.i];
  const last = F.i + 1 >= F.qs.length;
  F.done = false;
  const opts = q.options.map((text, k) =>
    h(
      "button",
      { class: "opt", type: "button", onclick: () => chooseFormula(k) },
      h("b", {}, String.fromCharCode(65 + k)),
      h("span", {}, text)
    )
  );
  const exp = h("div", { class: "exp hidden", "aria-live": "polite" });
  const next = h(
    "button",
    {
      class: "primary hidden",
      type: "button",
      onclick: () => {
        if (last) renderFormulaResult();
        else {
          F.i++;
          renderFormulaQ();
        }
      },
    },
    last ? "查看结果" : "下一题"
  );
  F.ui = { opts, exp, next, q };

  screen(
    h(
      "div",
      { class: "bar" },
      h(
        "button",
        {
          class: "link",
          type: "button",
          onclick: () => {
            F = null;
            renderFormulaList();
          },
        },
        "← 公式列表"
      ),
      h("span", {}, `${F.i + 1} / ${F.qs.length}`)
    ),
    h(
      "div",
      {
        class: "progress",
        role: "progressbar",
        "aria-label": "公式测验进度",
        "aria-valuemin": 0,
        "aria-valuemax": F.qs.length,
        "aria-valuenow": F.i + 1,
      },
      h("i", { style: `width:${((F.i + 1) / F.qs.length) * 100}%` })
    ),
    h("span", { class: "tag" }, "公式测验"),
    h("p", { class: "stem" }, q.prompt),
    h("div", { class: "opts", role: "group", "aria-label": "公式选项" }, opts),
    exp,
    next,
    h("p", { class: "kbd-hint" }, "按 1–4 或 A–D 作答，Enter 下一题")
  );
}

async function chooseFormula(k) {
  if (!F || F.done) return;
  const session = F;
  const q = F.ui.q;
  const correct = k === q.answer;
  F.done = true;
  if (correct) F.right++;
  F.log.push({ q, choice: k, correct });
  F.ui.opts.forEach((b, j) => {
    b.disabled = true;
    if (j === q.answer) b.classList.add("ok");
    else if (j === k) b.classList.add("bad");
  });

  try {
    await call("record_formula", { id: q.id, correct, today: today() });
  } catch {
    // 记录失败也继续显示本题结果
  }
  if (F !== session || !F.ui || F.ui.q !== q) return;

  F.ui.exp.replaceChildren(
    h("div", {}, (correct ? "✓ 正确。" : "✗ 错误。") + q.explanation)
  );
  F.ui.exp.classList.remove("hidden");
  F.ui.next.classList.remove("hidden");
  F.ui.next.focus({ preventScroll: true });
}

function renderFormulaResult() {
  if (!F) return;
  const session = F;
  F = null;
  backTarget = renderFormulaList;
  const total = session.qs.length;
  const right = session.right;
  const wrongs = session.log.filter((x) => !x.correct);
  screen(
    h(
      "div",
      { class: "center" },
      h("div", { class: "big" }, pct(right, total)),
      h("p", { class: "sub" }, `公式测验 ${total} 题，答对 ${right} 题`),
      h("p", { class: "sub" }, "已按艾宾浩斯曲线安排下次复习，本次不记录 XP。")
    ),
    h(
      "div",
      { class: "review-head" },
      h("b", {}, "公式回顾"),
      h("span", { class: "sub" }, `${wrongs.length} 条需巩固`)
    ),
    h("div", { class: "reviews" }, session.log.map(reviewItem)),
    h(
      "div",
      { class: "actions" },
      h("button", { class: "primary", type: "button", onclick: startFormulaQuiz }, "再测一次"),
      h("button", { class: "link", type: "button", onclick: startFormulaCards }, "继续背诵卡"),
      h("button", { class: "link", type: "button", onclick: startFormulaPractice }, "公式实操"),
      h("button", { class: "link", type: "button", onclick: renderFormulaList }, "返回公式列表")
    )
  );
  if (right === total) confetti();
}

async function startFormulaCards() {
  const token = newNav();
  let pool;
  try {
    pool = await loadFormulas(true);
  } catch {
    return;
  }
  if (!navIsCurrent(token)) return;
  const cards = formulaQueue(pool, formulaScope, 15);
  if (!cards.length) {
    toast("当前范围暂无公式");
    return;
  }

  stopTimer();
  S = null;
  D = null;
  F = null;
  FP = null;
  FC = { cards, i: 0, known: 0, unknown: 0, revealed: false, busy: false };
  renderFormulaCard();
}

function renderFormulaCard() {
  const card = FC.cards[FC.i];
  const total = FC.cards.length;
  const revealed = FC.revealed;
  const body = revealed
    ? h(
        "div",
        { class: "flash-answer" },
        h("div", { class: "fformula" }, card.formula),
        h("div", { class: "fnote" }, card.note),
        h("div", { class: "fexample" }, "例：" + card.example)
      )
    : h("div", { class: "flash-mask" }, "先在心里回忆公式，再点击显示");
  const actions = revealed
    ? h(
        "div",
        { class: "flash-actions grid2" },
        h("button", { class: "chip danger", type: "button", onclick: () => answerFormulaCard(false) }, "没记住"),
        h("button", { class: "primary", type: "button", onclick: () => answerFormulaCard(true) }, "记住了")
      )
    : h("button", { class: "primary", type: "button", onclick: revealFormulaCard }, "显示答案");

  screen(
    h(
      "div",
      { class: "bar" },
      h(
        "button",
        {
          class: "link",
          type: "button",
          onclick: () => {
            FC = null;
            renderFormulaList();
          },
        },
        "← 公式列表"
      ),
      h("span", {}, `${FC.i + 1} / ${total}`)
    ),
    h(
      "div",
      {
        class: "progress",
        role: "progressbar",
        "aria-label": "背诵进度",
        "aria-valuemin": 0,
        "aria-valuemax": total,
        "aria-valuenow": FC.i + 1,
      },
      h("i", { style: `width:${((FC.i + 1) / total) * 100}%` })
    ),
    h("span", { class: "tag" }, card.group),
    h(
      "div",
      { class: "flash-card" },
      h("div", { class: "flash-name" }, card.name),
      h("div", { class: "flash-hint" }, revealed ? "对照公式检查记忆" : "点击下方按钮查看公式"),
      body
    ),
    actions,
    h("p", { class: "kbd-hint" }, "Space/Enter 显示答案；显示后按 1 没记住、2 记住了")
  );
}

function revealFormulaCard() {
  if (!FC || FC.busy || FC.revealed) return;
  FC.revealed = true;
  renderFormulaCard();
}

async function answerFormulaCard(known) {
  if (!FC || FC.busy || !FC.revealed) return;
  const session = FC;
  const card = FC.cards[FC.i];
  FC.busy = true;
  if (known) FC.known++;
  else FC.unknown++;
  FC.revealed = false;

  try {
    await call("record_formula", { id: card.id, correct: known, today: today() });
  } catch {
    // 记录失败也继续背诵流程
  }
  if (FC !== session) return;

  FC.busy = false;
  if (FC.i + 1 >= FC.cards.length) renderFormulaCardResult();
  else {
    FC.i++;
    renderFormulaCard();
  }
}

function renderFormulaCardResult() {
  const session = FC;
  FC = null;
  backTarget = renderFormulaList;
  const total = session.cards.length;
  screen(
    h(
      "div",
      { class: "center" },
      h("div", { class: "big" }, pct(session.known, total)),
      h("p", { class: "sub" }, `背诵 ${total} 个公式，记住 ${session.known} 个，没记住 ${session.unknown} 个`),
      h("p", { class: "sub" }, "已按艾宾浩斯曲线安排下次复习。")
    ),
    h(
      "div",
      { class: "actions" },
      h("button", { class: "primary", type: "button", onclick: startFormulaCards }, "再来一组"),
      h("button", { class: "link", type: "button", onclick: renderFormulaList }, "返回公式列表"),
      h("button", { class: "link", type: "button", onclick: renderReviewPlan }, "查看复习计划")
    )
  );
  if (session.known === total) confetti();
}

async function startFormulaPractice() {
  const token = newNav();
  let all;
  try {
    all = await call("list_formula_exercises");
  } catch {
    return;
  }
  if (!navIsCurrent(token)) return;
  const pool = all.filter((e) =>
    formulaScope === "all"
      ? true
      : formulaScope === "data"
        ? e.group === "资料"
        : e.group === "数量"
  );
  if (!pool.length) {
    toast("当前范围暂无公式实操题");
    return;
  }
  const qs = shuffle(pool).slice(0, Math.min(10, pool.length));

  stopTimer();
  S = null;
  D = null;
  F = null;
  FC = null;
  FP = { qs, i: 0, right: 0, done: false, wrong: [], active: true };
  renderFormulaPracticeQ();
}

function numberPad(input, onSubmit) {
  let locked = false;
  const haptic = (pattern = 18) => {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch {
      // WebView 可能因权限或安全上下文拒绝震动，视觉反馈仍然生效
    }
  };
  const keys = [
    ["7", "7"], ["8", "8"], ["9", "9"], ["⌫", "back"],
    ["4", "4"], ["5", "5"], ["6", "6"], ["C", "clear"],
    ["1", "1"], ["2", "2"], ["3", "3"], ["·", "."],
    ["0", "0"], ["±", "neg"], ["确定", "ok"],
  ];
  const setValue = (v) => {
    input.value = v;
    input.classList.remove("bump");
    void input.offsetWidth;
    input.classList.add("bump");
  };
  const button = (label, key) => {
    const el = h(
      "button",
      {
        class:
          "key" +
          (key === "0" ? " wide" : "") +
          (key === "back" || key === "clear" || key === "neg" || key === "." ? " op" : "") +
          (key === "ok" ? " confirm" : ""),
        type: "button",
        "data-key": key,
        "aria-label":
          key === "back" ? "删除" : key === "clear" ? "清空" : key === "neg" ? "正负号" : key === "ok" ? "确定" : label,
        onclick: () => press(key, el),
      },
      label
    );
    return el;
  };
  const buttons = keys.map(([label, key]) => button(label, key));
  const pad = h("div", { class: "keypad", role: "group", "aria-label": "数字键盘" }, buttons);

  const press = (key, element = null) => {
    if (locked) return;
    const active = element || pad.querySelector(`.key[data-key="${key}"]`);
    if (active) {
      active.classList.add("pressed");
      const ripple = document.createElement("span");
      ripple.className = "key-ripple";
      active.append(ripple);
      setTimeout(() => ripple.remove(), 360);
      setTimeout(() => active.classList.remove("pressed"), 150);
    }
    haptic(18);
    let v = input.value;
    if (key === "ok") {
      onSubmit();
      return;
    }
    if (key === "back") v = v.slice(0, -1);
    else if (key === "clear") v = "";
    else if (key === "neg") v = v.startsWith("-") ? v.slice(1) : `-${v}`;
    else if (key === ".") {
      if (!v.includes(".")) v = (v === "" ? "0" : v) + ".";
    } else if (/^\d$/.test(key)) {
      if (v.replace("-", "").replace(".", "").length >= 12) return;
      v = v === "0" ? key : v + key;
    }
    setValue(v);
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Enter") return;
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      press(e.key);
    } else if (e.key === "." || e.key === "Decimal") {
      e.preventDefault();
      press(".");
    } else if (e.key === "-" || e.key === "Subtract") {
      e.preventDefault();
      press("neg");
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      press("back");
    }
  });

  return {
    node: pad,
    setEnabled(enabled) {
      locked = !enabled;
      buttons.forEach((b) => (b.disabled = !enabled));
      input.classList.toggle("pad-locked", !enabled);
    },
    shake() {
      input.classList.remove("shake");
      void input.offsetWidth;
      input.classList.add("shake");
      setTimeout(() => input.classList.remove("shake"), 360);
      haptic([30, 40, 30]);
    },
  };
}

function renderFormulaPracticeQ() {
  const q = FP.qs[FP.i];
  const last = FP.i + 1 >= FP.qs.length;
  FP.done = false;
  FP.ready = false;

  const input = h("input", {
    class: "ans",
    type: "text",
    readonly: true,
    inputmode: "none",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    enterkeyhint: "done",
    placeholder: "用下方数字键盘输入",
    "aria-label": "公式实操答案",
  });
  const pad = numberPad(input, submitFormulaPractice);
  const fb = h("div", { class: "fb", "aria-live": "polite" });
  const next = h(
    "button",
    { class: "primary hidden", type: "button", onclick: nextFormulaPractice },
    last ? "查看结果" : "下一题"
  );
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      FP = null;
      renderFormulaList();
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (FP && FP.done && FP.ready) nextFormulaPractice();
    else if (FP && !FP.done) submitFormulaPractice();
  });
  FP.ui = { input, pad, fb, next, q };

  screen(
    h(
      "div",
      { class: "bar" },
      h(
        "button",
        {
          class: "link",
          type: "button",
          onclick: () => {
            FP = null;
            renderFormulaList();
          },
        },
        "← 公式列表"
      ),
      h("span", {}, `${FP.i + 1} / ${FP.qs.length}`)
    ),
    h(
      "div",
      {
        class: "progress",
        role: "progressbar",
        "aria-label": "公式实操进度",
        "aria-valuemin": 0,
        "aria-valuemax": FP.qs.length,
        "aria-valuenow": FP.i + 1,
      },
      h("i", { style: `width:${((FP.i + 1) / FP.qs.length) * 100}%` })
    ),
    h("span", { class: "tag" }, `公式实操 · ${q.title}`),
    h("div", { class: "big-q" }, q.text),
    h("p", { class: "kbd-hint" }, "使用下方数字键盘输入，确定/Enter 提交，Esc 退出"),
    h(
      "div",
      { class: "answer-dock" },
      input,
      fb,
      pad.node,
      next
    )
  );
  app.classList.add("dock-open");
  requestAnimationFrame(() => input.focus());
}

async function submitFormulaPractice() {
  if (!FP || !FP.active || FP.done) return;
  const raw = normalizeAnswer(FP.ui.input.value);
  if (raw === "" || !Number.isFinite(Number(raw))) {
    toast("请输入数字");
    FP.ui.pad.shake();
    FP.ui.input.focus();
    return;
  }
  const session = FP;
  const mine = Number(raw);
  const q = FP.ui.q;
  const correct = Math.abs(mine - q.answer) <= q.tol + 1e-9;
  FP.done = true;
  FP.ui.pad.setEnabled(false);
  FP.ui.input.classList.add(correct ? "good" : "bad");
  if (correct) {
    FP.right++;
    FP.ui.fb.textContent = "✓ 正确";
    FP.ui.fb.className = "fb good";
  } else {
    FP.wrong.push({ q, mine: raw });
    FP.ui.fb.textContent = `✗ 正确答案：${fmt(q.answer)}${q.unit}`;
    FP.ui.fb.className = "fb bad";
  }
  FP.ui.input.readOnly = true;

  try {
    await call("record_formula", { id: q.id, correct, today: today() });
  } catch {
    // 记录失败也继续显示解析
  }
  if (FP !== session || !FP.ui || FP.ui.q !== q) return;
  FP.ready = true;
  FP.ui.fb.textContent += `；${q.explanation}`;
  FP.ui.next.classList.remove("hidden");
  FP.ui.next.focus({ preventScroll: true });
}

function nextFormulaPractice() {
  if (!FP || !FP.active || !FP.done || !FP.ready) return;
  if (FP.i + 1 >= FP.qs.length) finishFormulaPractice();
  else {
    FP.i++;
    renderFormulaPracticeQ();
  }
}

function finishFormulaPractice() {
  if (!FP) return;
  const session = FP;
  FP = null;
  backTarget = renderFormulaList;
  const total = session.qs.length;
  const right = session.right;
  screen(
    h(
      "div",
      { class: "center" },
      h("div", { class: "big" }, pct(right, total)),
      h("p", { class: "sub" }, `公式实操 ${total} 题，答对 ${right} 题`),
      h("p", { class: "sub" }, "每题都关联到对应公式，已更新艾宾浩斯复习计划。")
    ),
    session.wrong.length
      ? h(
          "div",
          { class: "exp" },
          h("b", {}, "错题回顾"),
          session.wrong.map((w) =>
            h(
              "div",
              { class: "wrow" },
              `${w.q.title}：${w.q.text}  正确 ${fmt(w.q.answer)}${w.q.unit}，你答 ${w.mine}`
            )
          )
        )
      : null,
    h(
      "div",
      { class: "actions" },
      h("button", { class: "primary", type: "button", onclick: startFormulaPractice }, "再练一次"),
      h("button", { class: "link", type: "button", onclick: renderFormulaList }, "返回公式背诵"),
      h("button", { class: "link", type: "button", onclick: renderReviewPlan }, "查看复习计划")
    )
  );
  if (right === total) confetti();
}

/* ---------------- 题库练习 ---------------- */

let S = null;
let F = null;
let FC = null;
let FP = null;
let FOCUS = null;
let PK = null;
let FORMULAS_CACHE = null;
let memorizeFormulas = true;
let formulaScope = "all";
let historyFilter = "all";
let trickMemorize = true;
let achvFilter = "all";
let achvPage = 0;
let animalFilter = "all";
let animalPage = 0;
let ACHV_CACHE = null;
let ANIMAL_CACHE = null;
const ACHV_PAGE_SIZE = 18;
const ANIMAL_PAGE_SIZE = 18;

function shuffleOptions(qs) {
  return qs.map((q) => ({
    ...q,
    order: shuffle(q.options.map((_, i) => i)),
  }));
}

async function start(mode, opts = {}) {
  const token = newNav();
  let base;
  try {
    base = await call("get_questions", { mode, today: today() });
  } catch {
    return;
  }
  if (!navIsCurrent(token)) return;
  const picked = (opts.shuffle ? shuffle(base) : base).slice(0, opts.limit || undefined);
  if (!picked.length) {
    toast(
      mode === "错题本"
        ? "错题本是空的"
        : mode === "智能复习"
          ? "今天没有到期复习，也没有新题了"
          : "该题型暂无题目"
    );
    return;
  }
  F = null;
  FC = null;
  FP = null;
  const qs = shuffleOptions(picked);
  S = {
    mode,
    label: opts.label || mode,
    opts,
    qs,
    i: 0,
    right: 0,
    done: false,
    combo: 0,
    xp: 0,
    log: [],
  };
  renderQ();
}

function renderQ() {
  const q = S.qs[S.i];
  const last = S.i + 1 >= S.qs.length;
  S.done = false;

  const order = q.order || q.options.map((_, i) => i);
  const opts = order.map((original, k) =>
    h(
      "button",
      { class: "opt", type: "button", onclick: () => choose(k) },
      h("b", {}, String.fromCharCode(65 + k)),
      h("span", {}, q.options[original])
    )
  );
  const exp = h("div", { class: "exp hidden", "aria-live": "polite" });
  const next = h(
    "button",
    {
      class: "primary hidden",
      type: "button",
      onclick: () => {
        if (last) renderResult();
        else {
          S.i++;
          renderQ();
        }
      },
    },
    last ? "查看结果" : "下一题"
  );
  const combo = h("span", { class: "combo", "aria-live": "polite" }, S.combo >= 2 ? `🔥 ${S.combo} 连击` : "");
  S.ui = { opts, exp, next, q, combo };

  screen(
    h(
      "div",
      { class: "bar" },
      h("button", { class: "link", type: "button", onclick: leaveQuiz }, "← 返回"),
      combo,
      h("span", {}, `${S.i + 1} / ${S.qs.length}`)
    ),
    h(
      "div",
      {
        class: "progress",
        role: "progressbar",
        "aria-label": "答题进度",
        "aria-valuemin": 0,
        "aria-valuemax": S.qs.length,
        "aria-valuenow": S.i + 1,
      },
      h("i", { style: `width:${((S.i + 1) / S.qs.length) * 100}%` })
    ),
    h("span", { class: "tag" }, S.mode === "每日挑战" ? "每日挑战 · " + q.category : q.category),
    h("p", { class: "stem" }, q.stem),
    h("div", { class: "opts", role: "group", "aria-label": "选项", "data-qid": q.id }, opts),
    exp,
    next,
    h("p", { class: "kbd-hint" }, "按 1–4 或 A–D 作答，Enter 下一题")
  );
}

function leaveQuiz() {
  S = null;
  renderHome();
}

async function choose(k) {
  if (!S || S.done) return;
  const session = S;
  S.done = true;
  const q = S.ui.q;
  const order = q.order || q.options.map((_, i) => i);
  const originalChoice = order[k];
  S.ui.opts.forEach((b) => (b.disabled = true));

  let r;
  try {
    r = await call("submit_answer", {
      id: q.id,
      choice: originalChoice,
      combo: S.combo,
      today: today(),
      mode: S.label || S.mode,
    });
  } catch {
    if (S === session && S.ui) {
      S.done = false;
      S.ui.opts.forEach((b) => (b.disabled = false));
    }
    return;
  }
  if (S !== session || !S.ui || S.ui.q !== q) return;

  S.combo = r.combo;
  S.xp += Number(r.award?.xp) || 0;
  if (r.correct) S.right++;
  S.log.push({ q, choice: originalChoice, correct: r.correct, answer: r.answer });

  const correctPos = order.indexOf(r.answer);
  S.ui.opts.forEach((b, j) => {
    b.disabled = true;
    b.classList.remove("ok", "bad");
    if (j === correctPos) b.classList.add("ok");
    else if (j === k) b.classList.add("bad");
  });
  S.ui.combo.textContent = r.combo >= 2 ? `🔥 ${r.combo} 连击` : "";
  if (r.combo >= 2) {
    S.ui.combo.classList.remove("pop");
    void S.ui.combo.offsetWidth;
    S.ui.combo.classList.add("pop");
  }

  const xp = Number(r.award?.xp) || 0;
  S.ui.exp.replaceChildren(
    ...[
      h("div", {}, (r.correct ? "✓ 回答正确。" : "✗ 回答错误。") + r.explanation),
      h("div", { class: "xp" }, `+${xp} XP${r.combo >= 3 && r.correct ? "(连击加成)" : ""}`),
      r.removed_from_wrong
        ? h("div", { class: "note" }, `已从错题本移除，还剩 ${r.wrong_left} 题`)
        : null,
    ].filter(Boolean)
  );
  S.ui.exp.classList.remove("hidden");
  S.ui.next.classList.remove("hidden");
  S.ui.next.focus({ preventScroll: true });
  celebrate(r.award);
}

function reviewItem(item, idx) {
  const { q, choice, correct } = item;
  const your =
    choice >= 0 && choice < q.options.length ? q.options[choice] : "未作答";
  const ans = q.options[q.answer];
  return h(
    "details",
    { class: "review" + (correct ? " ok" : " bad"), open: !correct },
    h(
      "summary",
      {},
      h("span", { class: "ricon", "aria-hidden": "true" }, correct ? "✓" : "✗"),
      h("span", { class: "rstem" }, `${idx + 1}. ${q.stem || q.prompt || ""}`)
    ),
    h(
      "div",
      { class: "rbody" },
      h("div", { class: "rrow" }, h("b", {}, "你的答案"), h("span", {}, your)),
      h("div", { class: "rrow" }, h("b", {}, "正确答案"), h("span", { class: "ok-text" }, ans)),
      h("div", { class: "rexp" }, q.explanation)
    )
  );
}

async function renderResult() {
  const session = S;
  if (!session) return;
  const total = session.qs.length;
  const right = session.right;
  let bonus = 0;

  if (session.mode === "每日挑战") {
    try {
      const aw = await call("claim_daily", { today: today() });
      if (S !== session) return;
      bonus = Number(aw.xp) || 0;
      celebrate(aw);
    } catch {
      // 奖励领取失败不影响查看本次成绩
    }
  }
  if (S !== session) return;

  S.ui = null;
  S.done = true;
  const wrongs = S.log.filter((x) => !x.correct);

  screen(
    h(
      "div",
      { class: "center" },
      h("div", { class: "big" }, pct(right, total)),
      h("p", { class: "sub" }, `${right === total ? "全对！" : ""}本次 ${total} 题，答对 ${right} 题`),
      h("p", { class: "xp big-xp" }, `本次获得 ${S.xp + bonus} XP`),
      bonus ? h("p", { class: "sub" }, `含每日挑战奖励 +${bonus} XP`) : null
    ),
    h("div", { class: "review-head" }, h("b", {}, "答题回顾"), h("span", { class: "sub" }, `${wrongs.length} 道错题`)),
    h("div", { class: "reviews" }, S.log.map(reviewItem)),
    h(
      "div",
      { class: "actions" },
      S.mode === "每日挑战"
        ? h("button", { class: "primary", type: "button", onclick: renderHome }, "返回首页")
        : h("button", { class: "primary", type: "button", onclick: () => start(S.mode, S.opts) }, "再练一次"),
      S.mode === "每日挑战" ? null : h("button", { class: "link", type: "button", onclick: renderHome }, "返回首页"),
      wrongs.length && S.mode !== "错题本"
        ? h("button", { class: "link", type: "button", onclick: () => start("错题本") }, "去错题本巩固")
        : null
    )
  );
  if (right === total) confetti();
}

/* ---------------- 计算训练 ---------------- */

let D = null;
let clockTimer = null;

function stopTimer() {
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
}

function loadDrillCount() {
  try {
    const n = Number(localStorage.getItem(DRILL_COUNT_KEY));
    return [10, 20, 30].includes(n) ? n : 10;
  } catch {
    return 10;
  }
}

let drillCount = loadDrillCount();

function saveDrillCount(n) {
  drillCount = n;
  try {
    localStorage.setItem(DRILL_COUNT_KEY, String(n));
  } catch {
    // 隐身模式或存储不可用时就只保留在内存里
  }
}

async function renderDrillMenu() {
  const token = newNav();
  stopTimer();
  if (D) D.active = false;
  D = null;
  S = null;
  F = null;
  FC = null;
  FP = null;

  let kinds, st;
  try {
    [kinds, st] = await Promise.all([call("list_drills"), call("get_stats")]);
  } catch (err) {
    if (navIsCurrent(token)) renderError(err);
    return;
  }
  if (!navIsCurrent(token)) return;
  const drill = st.drill || {};
  const byName = Object.fromEntries(kinds.map((k) => [k.name, k]));
  const groups = [
    {
      title: "基础速算",
      note: "加减乘除 · 估算",
      names: ["综合", "加减", "乘法", "平方", "除法", "分数", "估算", "混合"],
    },
    {
      title: "资料分析",
      note: "增长 · 比重 · 平均",
      names: ["百分比", "增长", "增长量", "基期量", "比重", "平均数", "倍数", "百分点"],
    },
  ];
  const used = new Set();
  const renderKind = (k) => {
    used.add(k.name);
    const s = drill[k.name];
    let extra = "";
    if (s && s.done) {
      extra = ` · 已练${s.done}题 正确率${pct(s.right, s.done)}`;
      if (s.best_avg_secs) extra += ` · 最佳${s.best_avg_secs.toFixed(1)}秒/题`;
    }
    return card(k.name, k.desc + extra, () => renderDrillStart(k));
  };
  const groupSections = groups
    .map((g) => {
      const cards = g.names.map((n) => byName[n]).filter(Boolean).map(renderKind);
      return cards.length ? section(g.title, g.note, h("div", { class: "grid2" }, cards)) : null;
    })
    .filter(Boolean);
  const extras = kinds.filter((k) => !used.has(k.name)).map(renderKind);
  if (extras.length) {
    groupSections.push(section("其他", "", h("div", { class: "grid2" }, extras)));
  }

  screen(
    h("div", { class: "bar" }, h("button", { class: "link", type: "button", onclick: renderHome }, "← 返回"), h("span")),
    h("h1", {}, "计算训练"),
    h("p", { class: "sub" }, "基础速算 + 资料分析专项，按组练习更清晰。"),
    groupSections,
    h(
      "div",
      { class: "grid2" },
      h("button", { class: "chip", type: "button", onclick: renderTrickList }, "⚡ 速算技巧"),
      h("button", { class: "chip", type: "button", onclick: renderFormulaList }, "📐 公式背诵")
    )
  );
}

function renderTrickList() {
  newNav();
  stopTimer();
  S = null;
  D = null;
  F = null;
  FC = null;
  FP = null;

  const cats = [...new Set(TRICKS.map((t) => t.cat))];
  const sections = cats.map((cat) => {
    const items = TRICKS.filter((t) => t.cat === cat);
    return section(
      cat,
      `${items.length} 条`,
      h(
        "div",
        { class: "formula-list" },
        items.map((t) =>
          h(
            "details",
            { class: "formula", open: !trickMemorize },
            h(
              "summary",
              {},
              h("span", { class: "fname" }, t.name),
              h("span", { class: "fgroup" }, t.cat)
            ),
            h(
              "div",
              { class: "fbody" },
              h("div", { class: "fnote" }, t.tip),
              h("div", { class: "fexample" }, "例：" + t.example)
            )
          )
        )
      )
    );
  });

  screen(
    h(
      "div",
      { class: "bar" },
      h("button", { class: "link", type: "button", onclick: renderDrillMenu }, "← 计算训练"),
      h("span")
    ),
    h("h1", {}, "速算技巧"),
    h("p", { class: "sub" }, "14 个常用速算套路：先理解，再在计算训练里用出来。"),
    h(
      "div",
      { class: "formula-actions" },
      h(
        "button",
        {
          class: "chip" + (trickMemorize ? " on" : ""),
          type: "button",
          "aria-pressed": trickMemorize ? "true" : "false",
          onclick: () => {
            trickMemorize = !trickMemorize;
            renderTrickList();
          },
        },
        trickMemorize ? "背诵模式：隐藏技巧" : "背诵模式：显示技巧"
      ),
      h("button", { class: "primary", type: "button", onclick: renderDrillMenu }, "去计算训练")
    ),
    sections,
    h("button", { class: "primary", type: "button", onclick: renderDrillMenu }, "去计算训练")
  );
}

function renderDrillStart(k) {
  stopTimer();
  const chips = [10, 20, 30].map((n) =>
    h(
      "button",
      {
        class: "chip" + (n === drillCount ? " on" : ""),
        type: "button",
        "aria-pressed": n === drillCount ? "true" : "false",
        onclick: (e) => {
          saveDrillCount(n);
          chips.forEach((c) => {
            c.classList.remove("on");
            c.setAttribute("aria-pressed", "false");
          });
          e.currentTarget.classList.add("on");
          e.currentTarget.setAttribute("aria-pressed", "true");
        },
      },
      n + " 题"
    )
  );

  screen(
    h("div", { class: "bar" }, h("button", { class: "link", type: "button", onclick: renderDrillMenu }, "← 返回"), h("span")),
    h("h1", {}, k.name),
    h("p", { class: "sub" }, k.desc),
    h("div", { class: "tip" }, h("b", {}, "速算小贴士"), h("br"), k.tip),
    h("p", { class: "sub" }, "每答对一题 +4 XP,10 题以上全对额外 +30 XP"),
    h("div", { class: "chips" }, chips),
    h("button", { class: "primary", type: "button", onclick: () => startDrill(k) }, "开始")
  );
}

async function startDrill(k) {
  const token = newNav();
  let qs;
  try {
    qs = await call("gen_drill", { kind: k.name, count: drillCount });
  } catch {
    return;
  }
  if (!qs.length) {
    toast("题目生成失败，请重试");
    return;
  }
  D = {
    kind: k.name,
    info: k,
    qs,
    i: 0,
    right: 0,
    spent: 0,
    qStart: 0,
    answered: false,
    active: true,
    wrong: [],
    combo: 0,
    pausedAt: null,
  };
  renderDrillQ();
}

function renderDrillQ() {
  const q = D.qs[D.i];
  const last = D.i + 1 >= D.qs.length;
  D.answered = false;
  D.pausedAt = null;
  D.qStart = Date.now();

  const input = h("input", {
    class: "ans",
    type: "text",
    readonly: true,
    inputmode: "none",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    enterkeyhint: "done",
    placeholder: "用下方数字键盘输入",
    "aria-label": "答案",
  });
  const pad = numberPad(input, submitDrill);
  const fb = h("div", { class: "fb", "aria-live": "polite" });
  const nextBtn = h("button", { class: "primary hidden", type: "button", onclick: nextDrill }, last ? "查看结果" : "下一题");
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      leaveDrill();
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (D.answered) nextDrill();
    else submitDrill();
  });
  D.ui = { input, pad, fb, nextBtn, q };

  screen(
    h(
      "div",
      { class: "bar" },
      h("button", { class: "link", type: "button", onclick: leaveDrill }, "← 退出"),
      h("span", { class: "combo", "aria-live": "polite" }, D.combo >= 3 ? `🔥 ${D.combo} 连击` : ""),
      h("span", { id: "clock", class: "clock" }, clock(D.spent))
    ),
    h(
      "div",
      {
        class: "progress",
        role: "progressbar",
        "aria-label": "训练进度",
        "aria-valuemin": 0,
        "aria-valuemax": D.qs.length,
        "aria-valuenow": D.i + 1,
      },
      h("i", { style: `width:${((D.i + 1) / D.qs.length) * 100}%` })
    ),
    h("div", { class: "big-q" }, q.text),
    h("p", { class: "kbd-hint" }, "使用下方数字键盘输入，确定/Enter 提交，Esc 退出"),
    h(
      "div",
      { class: "answer-dock" },
      input,
      fb,
      pad.node,
      nextBtn
    )
  );
  app.classList.add("dock-open");
  requestAnimationFrame(() => input.focus());
  startClock();
}

function startClock() {
  stopTimer();
  clockTimer = setInterval(() => {
    const el = document.getElementById("clock");
    if (!el || !D || !D.active) {
      stopTimer();
      return;
    }
    const elapsed = D.answered ? 0 : D.pausedAt ? D.pausedAt - D.qStart : Date.now() - D.qStart;
    el.textContent = clock(D.spent + Math.max(0, elapsed));
  }, 200);
}

function normalizeAnswer(raw) {
  return raw
    .replace(/[\uFF10-\uFF19]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[，,]/g, ".")
    .replace(/[−–—]/g, "-")
    .replace(/[％%]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function submitDrill() {
  if (!D || !D.active || D.answered) return;
  const raw = normalizeAnswer(D.ui.input.value);
  if (raw === "" || !Number.isFinite(Number(raw))) {
    toast("请输入数字");
    D.ui.pad.shake();
    D.ui.input.focus();
    return;
  }
  const mine = Number(raw);
  const q = D.ui.q;

  D.answered = true;
  D.spent += Math.max(0, Date.now() - D.qStart);
  D.ui.input.readOnly = true;
  D.ui.pad.setEnabled(false);

  if (Math.abs(mine - q.answer) <= q.tol + 1e-9) {
    D.ui.input.classList.add("good");
    D.right++;
    D.combo++;
    D.ui.fb.textContent = "✓ 正确" + (D.combo >= 3 ? `  🔥${D.combo}连击` : "");
    D.ui.fb.className = "fb good";
    const d = D;
    const i = D.i;
    setTimeout(() => {
      if (D === d && D.active && D.i === i && D.answered) nextDrill();
    }, 550);
  } else {
    D.combo = 0;
    D.ui.input.classList.add("bad");
    D.wrong.push({ text: q.text, ans: q.answer, mine: raw });
    D.ui.fb.textContent = `✗ 正确答案：${fmt(q.answer)}`;
    D.ui.fb.className = "fb bad";
    D.ui.nextBtn.classList.remove("hidden");
    D.ui.nextBtn.focus({ preventScroll: true });
  }
}

function nextDrill() {
  if (!D || !D.active || !D.answered) return;
  if (D.i + 1 >= D.qs.length) finishDrill();
  else {
    D.i++;
    renderDrillQ();
  }
}

function leaveDrill() {
  if (D) D.active = false;
  D = null;
  stopTimer();
  renderDrillMenu();
}

async function finishDrill() {
  if (!D || !D.active) return;
  const session = D;
  D.active = false;
  stopTimer();
  const { info, kind, wrong } = D;
  const total = D.qs.length;
  const right = D.right;
  const secs = D.spent / 1000;

  let res = null;
  try {
    res = await call("record_drill", { kind, total, right, secs, today: today() });
  } catch {
    // 记录失败时仍展示本次成绩，避免白练
  }
  const st = res?.stat;
  const aw = res?.award;

  screen(
    h(
      "div",
      { class: "center" },
      h("div", { class: "big" }, pct(right, total)),
      h(
        "p",
        { class: "sub" },
        `${kind} · 答对 ${right}/${total} · 用时 ${secs.toFixed(1)} 秒，平均 ${(secs / total).toFixed(1)} 秒/题`
      ),
      st?.best_avg_secs ? h("p", { class: "sub" }, `历史最佳：${st.best_avg_secs.toFixed(1)} 秒/题`) : null,
      aw ? h("p", { class: "xp big-xp" }, `本次获得 ${aw.xp} XP`) : null
    ),
    wrong.length
      ? h(
          "div",
          { class: "exp" },
          h("b", {}, "错题回顾"),
          wrong.map((w) => h("div", { class: "wrow" }, `${w.text}  正确 ${fmt(w.ans)},你答 ${w.mine}`))
        )
      : null,
    h(
      "div",
      { class: "actions" },
      h("button", { class: "primary", type: "button", onclick: () => startDrill(info) }, "再练一次"),
      h("button", { class: "link", type: "button", onclick: renderDrillMenu }, "返回计算训练"),
      h("button", { class: "link", type: "button", onclick: renderHome }, "返回首页")
    )
  );
  if (right === total && total > 0) confetti();
  if (aw) celebrate(aw);
}

/* ---------------- 全局事件 ---------------- */

const CHOICE_KEYS = {
  "1": 0,
  "2": 1,
  "3": 2,
  "4": 3,
  "5": 4,
  "6": 5,
  a: 0,
  b: 1,
  c: 2,
  d: 3,
  e: 4,
  f: 5,
};

document.addEventListener("keydown", (e) => {
  if (document.querySelector(".modal")) return;
  if (e.key === "Escape") {
    if (D && D.active) {
      e.preventDefault();
      leaveDrill();
    } else if (FP) {
      e.preventDefault();
      FP = null;
      renderFormulaList();
    } else if (FC) {
      e.preventDefault();
      FC = null;
      renderFormulaList();
    } else if (F) {
      e.preventDefault();
      F = null;
      renderFormulaList();
    } else if (S) {
      e.preventDefault();
      leaveQuiz();
    }
    return;
  }
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;

  if (FC) {
    if (FC.busy) return;
    if (!FC.revealed) {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        revealFormulaCard();
      }
      return;
    }
    const key = e.key.toLowerCase();
    if (key === "1" || key === "f") {
      e.preventDefault();
      answerFormulaCard(false);
    } else if (key === "2" || key === "t") {
      e.preventDefault();
      answerFormulaCard(true);
    }
    return;
  }

  if (F && F.ui) {
    if (!F.done) {
      const k = CHOICE_KEYS[e.key.toLowerCase()];
      if (k !== undefined && k < F.ui.opts.length && k < MAX_OPTION_KEY) {
        e.preventDefault();
        chooseFormula(k);
      }
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      F.ui.next.click();
    }
    return;
  }

  if (!S || !S.ui) return;

  if (!S.done) {
    const k = CHOICE_KEYS[e.key.toLowerCase()];
    if (k !== undefined && k < S.ui.opts.length && k < MAX_OPTION_KEY) {
      e.preventDefault();
      choose(k);
    }
    return;
  }
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    S.ui.next.click();
  }
});

// 切到后台时暂停计时，回来再补回暂停时长，避免"挂机"拉高平均用时
document.addEventListener("visibilitychange", () => {
  if (!D || !D.active) return;
  if (document.hidden) {
    if (!D.answered && !D.pausedAt) D.pausedAt = Date.now();
  } else if (D.pausedAt) {
    D.qStart += Date.now() - D.pausedAt;
    D.pausedAt = null;
    startClock();
  }
});

window.addEventListener("beforeunload", stopTimer);

function renderError(err) {
  screen(
    h("h1", {}, "出了点问题"),
    h("p", { class: "sub" }, errText(err)),
    h("button", { class: "primary", type: "button", onclick: renderHome }, "重试")
  );
}

if (!invoke) {
  screen(
    h("h1", {}, "无法启动"),
    h("p", { class: "sub" }, "Tauri 接口未注入，请通过 cargo tauri dev 或安装包运行。")
  );
} else {
  renderHome();
  registerHardwareBack();
  setTimeout(syncReminderOnStart, 1200);
}
