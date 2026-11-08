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

// 异步导航令牌：用户快速返回/切换页面时，丢弃已经过期的异步渲染结果
let navToken = 0;
const newNav = () => ++navToken;
const navIsCurrent = (token) => token === navToken;

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
  if (D) D.active = false;
  D = null;

  let cats, st, pf;
  try {
    [cats, st, pf] = await Promise.all([
      call("list_categories"),
      call("get_stats"),
      call("get_profile", { today: today() }),
    ]);
  } catch (err) {
    if (navIsCurrent(token)) renderError(err);
    return;
  }
  if (!navIsCurrent(token)) return;

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
    h("h1", {}, "行测刷题"),
    h(
      "p",
      { class: "sub" },
      pf.streak ? `已连续打卡 ${pf.streak} 天，别断哦！` : "今天做几道题，开启你的连续打卡"
    ),
    profileCard(pf),
    h(
      "div",
      { class: "statline" },
      h("span", {}, `累计 ${done} 题`),
      h("span", {}, `正确率 ${pct(right, done)}`),
      h("span", {}, `错题 ${wrongs}`)
    ),
    h(
      "div",
      { class: "list" },
      card(
        "📅 每日挑战",
        pf.daily_done ? "今日已完成 ✓ 明天再来" : "5 道精选题 · 完成额外 +30 XP",
        () => start("每日挑战"),
        pf.daily_done ? "" : "hot"
      ),
      card("⚡ 快速练习", "随机 10 题 · 跨题型热身", () =>
        start("全部", { limit: 10, shuffle: true, label: "快速练习" })
      ),
      card("🧮 计算训练", "速算 · 平方 · 分数百分数 · 增长率", renderDrillMenu),
      card("全部题型", `${totalQ} 题`, () => start("全部")),
      cats.map((c) => {
        const s = st.stats?.[c.name] || { done: 0, right: 0 };
        return card(
          c.name,
          `${c.count} 题` + (s.done ? ` · 正确率 ${pct(s.right, s.done)}` : ""),
          () => start(c.name)
        );
      }),
      card("错题本", `${wrongs} 题 · 答对即移出`, () => start("错题本")),
      card("🏅 成就", `已解锁 ${got} / ${pf.achievements.length}`, renderAchv)
    ),
    h(
      "div",
      { class: "center" },
      h("button", { class: "link danger", type: "button", onclick: resetAll }, "清空所有进度")
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

async function renderAchv() {
  const token = newNav();
  stopTimer();
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

/* ---------------- 题库练习 ---------------- */

let S = null;

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
    toast(mode === "错题本" ? "错题本是空的" : "该题型暂无题目");
    return;
  }
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
  if (S !== session || !S.ui) return;

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
      h("span", { class: "rstem" }, `${idx + 1}. ${q.stem}`)
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

  let kinds, st;
  try {
    [kinds, st] = await Promise.all([call("list_drills"), call("get_stats")]);
  } catch (err) {
    if (navIsCurrent(token)) renderError(err);
    return;
  }
  if (!navIsCurrent(token)) return;
  const drill = st.drill || {};

  screen(
    h("div", { class: "bar" }, h("button", { class: "link", type: "button", onclick: renderHome }, "← 返回"), h("span")),
    h("h1", {}, "计算训练"),
    h("p", { class: "sub" }, "限时速算，练出行测的计算手感"),
    h(
      "div",
      { class: "list" },
      kinds.map((k) => {
        const s = drill[k.name];
        let extra = "";
        if (s && s.done) {
          extra = ` · 已练${s.done}题 正确率${pct(s.right, s.done)}`;
          if (s.best_avg_secs) extra += ` · 最佳${s.best_avg_secs.toFixed(1)}秒/题`;
        }
        return card(k.name, k.desc + extra, () => renderDrillStart(k));
      })
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
    } else if (S) {
      e.preventDefault();
      leaveQuiz();
    }
    return;
  }
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
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
}
