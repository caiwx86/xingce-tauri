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
const newNav = () => ++navToken;
const navIsCurrent = (token) => token === navToken;
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const IS_ANDROID = /Android/i.test(navigator.userAgent);
const REMINDER_KEY = "xingce.reminder";
const REMINDER_ID = 7102026;

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
    toast("通知权限已被拒绝，请到系统设置中开启");
    return false;
  }
  const state = await tryPlugin("request_permission");
  const ok = state === "granted" || state === "Granted" || state === true;
  if (!ok) toast("未获得通知权限");
  return ok;
}

async function scheduleDailyReminder(hour, minute, quiet = false) {
  await tryPlugin("cancel", { notifications: [REMINDER_ID] });
  let channelId = null;
  if (IS_ANDROID) {
    try {
      await invoke("plugin:notification|create_channel", {
        id: "daily-reminder",
        name: "每日提醒",
        description: "每天提醒完成行测目标",
        importance: 3,
        visibility: 0,
        lights: true,
        vibration: true,
      });
      channelId = "daily-reminder";
    } catch (err) {
      console.warn("[notification:create_channel]", err);
    }
  }
  const options = {
    id: REMINDER_ID,
    ...(channelId ? { channelId } : {}),
    title: "行测刷题 · 每日提醒",
    body: "今天的目标还没完成，来做几道题吧！",
    schedule: {
      interval: {
        interval: { hour, minute },
        allowWhileIdle: true,
      },
    },
  };
  if (quiet) await tryPlugin("notify", { options });
  else await call("plugin:notification|notify", { options });
}

async function cancelDailyReminder() {
  await call("plugin:notification|cancel", { notifications: [REMINDER_ID] });
}

async function sendTestNotification() {
  if (!IS_MOBILE) {
    toast("桌面端不支持系统通知，请在手机上测试");
    return;
  }
  if (!(await ensureNotificationPermission())) return;
  await call("plugin:notification|notify", {
    options: {
      id: REMINDER_ID + 1,
      title: "行测刷题 · 测试提醒",
      body: "提醒功能已生效，明天见！",
    },
  });
  toast("已发送测试通知");
}

async function syncReminderOnStart() {
  const r = readReminder();
  if (!r.enabled || !IS_MOBILE) return;
  const granted = await tryPlugin("is_permission_granted");
  if (granted === true) {
    try {
      await scheduleDailyReminder(r.hour, r.minute, true);
    } catch {
      // 后台同步失败时保持现有计划
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
      for (const x of a.new_achv || []) {
        await celebrateModal(x.icon, "解锁成就：" + x.name, x.desc);
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
    h("div", { class: "bar2 g" + (goalDone ? " done" : "") }, h("i", { style: `width:${goalPct}%` }))
  );
}

async function renderHome() {
  const token = newNav();
  stopTimer();
  S = null;
  D = null;
  F = null;
  FC = null;
  formulaScope = "all";

  let cats, st, pf, formulas;
  try {
    [cats, st, pf, formulas] = await Promise.all([
      call("list_categories"),
      call("get_stats"),
      call("get_profile", { today: today() }),
      call("list_formulas", { today: today() }),
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
  const got = pf.achievements.filter((a) => a.unlocked).length;

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
    section(
      "今日",
      "完成 20 题即达标",
      h(
        "div",
        { class: "list" },
        card(
          "📅 每日挑战",
          pf.daily_done ? "今日已完成 ✓ 明天再来" : "5 道精选题 · 完成额外 +30 XP",
          () => start("每日挑战"),
          pf.daily_done ? "" : "hot"
        )
      ),
      h(
        "div",
        { class: "grid2" },
        card("⚡ 快速练习", "随机 10 题 · 跨题型热身", () =>
          start("全部", { limit: 10, shuffle: true, label: "快速练习" })
        ),
        card(
          "🧠 智能复习",
          `今日到期 ${pf.review_due} 题 · 新题 ${pf.new_questions} 题`,
          () => start("智能复习")
        )
      )
    ),
    section(
      "专项训练",
      "速算 · 公式",
      h(
        "div",
        { class: "grid2" },
        card("🧮 计算训练", "21 类速算 · 10/20/30 题", renderDrillMenu),
        card(
          "🧠 公式背诵",
          `${formulas.length} 个公式 · 今日待复习 ${pf.formula_due} 个`,
          renderFormulaList,
          "hot"
        )
      )
    ),
    section(
      "题库练习",
      `${totalQ} 题 · 五大分类`,
      h(
        "div",
        { class: "grid2" },
        card("📚 全部题型", `${totalQ} 题`, () => start("全部"), "wide"),
        cats.map((c) => {
          const s = st.stats?.[c.name] || { done: 0, right: 0 };
          return card(
            c.name,
            `${c.count} 题` + (s.done ? ` · 正确率 ${pct(s.right, s.done)}` : ""),
            () => start(c.name)
          );
        })
      )
    ),
    section(
      "复习与成就",
      "错题 · 徽章",
      h(
        "div",
        { class: "grid2" },
        card("📕 错题本", `${wrongs} 题 · 答对即移出`, () => start("错题本")),
        card("🏅 成就", `已解锁 ${got} / ${pf.achievements.length}`, renderAchv),
        card("📈 复习计划", "艾宾浩斯曲线 · 未来 7 天预测", renderReviewPlan, "wide")
      )
    )
  );
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
        if (next.enabled) {
          if (!(await ensureNotificationPermission())) return;
          try {
            await scheduleDailyReminder(hour, minute);
          } catch {
            return;
          }
        } else {
          try {
            await cancelDailyReminder();
          } catch {
            return;
          }
        }
        saveReminder(next);
        toast(next.enabled ? `已设置每天 ${reminderText(next)} 提醒` : "已关闭每日提醒");
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
          h("div", { class: "d" }, "0.4.0 · 80 道题库 · 21 类速算 · 43 个公式")
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
      h("button", { class: "link", type: "button", onclick: renderHome }, "返回首页")
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
  let pf;
  try {
    pf = await call("get_profile", { today: today() });
  } catch (err) {
    if (navIsCurrent(token)) renderError(err);
    return;
  }
  if (!navIsCurrent(token)) return;
  const got = pf.achievements.filter((a) => a.unlocked).length;
  screen(
    h("div", { class: "bar" }, h("button", { class: "link", type: "button", onclick: renderHome }, "← 返回"), h("span")),
    h("h1", {}, "成就"),
    h("p", { class: "sub" }, `已解锁 ${got} / ${pf.achievements.length} · 最长连续打卡 ${pf.best_streak} 天`),
    h("div", { class: "progress" }, h("i", { style: `width:${(got / pf.achievements.length) * 100}%` })),
    h(
      "div",
      { class: "agrid" },
      pf.achievements.map((a) =>
        h(
          "div",
          { class: "badge" + (a.unlocked ? "" : " locked") },
          h("div", { class: "bicon", "aria-hidden": "true" }, a.unlocked ? a.icon : "🔒"),
          h("div", { class: "bname" }, a.name),
          h("div", { class: "bdesc" }, a.desc)
        )
      )
    )
  );
}

/* ---------------- 资料分析公式 ---------------- */

async function renderFormulaList() {
  const token = newNav();
  stopTimer();
  S = null;
  D = null;
  F = null;
  FC = null;

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

/* ---------------- 题库练习 ---------------- */

let S = null;
let F = null;
let FC = null;
let FORMULAS_CACHE = null;
let memorizeFormulas = false;
let formulaScope = "all";

async function start(mode, opts = {}) {
  const token = newNav();
  let base;
  try {
    base = await call("get_questions", { mode, today: today() });
  } catch {
    return;
  }
  if (!navIsCurrent(token)) return;
  const qs = (opts.shuffle ? shuffle(base) : base).slice(0, opts.limit || undefined);
  if (!qs.length) {
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

  const opts = q.options.map((text, k) =>
    h(
      "button",
      { class: "opt", type: "button", onclick: () => choose(k) },
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
  S.ui.opts.forEach((b) => (b.disabled = true));

  let r;
  try {
    r = await call("submit_answer", {
      id: q.id,
      choice: k,
      combo: S.combo,
      today: today(),
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
  S.log.push({ q, choice: k, correct: r.correct, answer: r.answer });

  S.ui.opts.forEach((b, j) => {
    b.disabled = true;
    b.classList.remove("ok", "bad");
    if (j === r.answer) b.classList.add("ok");
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
    choice >= 0 && choice < q.options.length
      ? `${String.fromCharCode(65 + choice)}. ${q.options[choice]}`
      : "未作答";
  const ans = `${String.fromCharCode(65 + q.answer)}. ${q.options[q.answer]}`;
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
      { class: "center" },
      h("button", { class: "link", type: "button", onclick: renderFormulaList }, "📐 公式背诵与一览图")
    )
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
    inputmode: "decimal",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    enterkeyhint: "done",
    placeholder: "输入答案",
    "aria-label": "答案",
  });
  const fb = h("div", { class: "fb", "aria-live": "polite" });
  const ok = h("button", { class: "primary", type: "button", onclick: submitDrill }, "确定");
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
  D.ui = { input, fb, ok, nextBtn, q };

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
    input,
    fb,
    ok,
    nextBtn,
    h("p", { class: "kbd-hint" }, "Enter 提交 / 下一题，Esc 退出")
  );
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
    D.ui.input.focus();
    return;
  }
  const mine = Number(raw);
  const q = D.ui.q;

  D.answered = true;
  D.spent += Math.max(0, Date.now() - D.qStart);
  D.ui.input.readOnly = true;
  D.ui.ok.classList.add("hidden");

  if (Math.abs(mine - q.answer) <= q.tol + 1e-9) {
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
  setTimeout(syncReminderOnStart, 1200);
}
