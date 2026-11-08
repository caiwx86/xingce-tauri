const { invoke } = window.__TAURI__.core;
const app = document.getElementById("app");

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "-");
const fmt = (n) => String(+Number(n).toFixed(2));
const clock = (ms) => {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
};
// 本地日期 YYYY-MM-DD(按手机时区,保证"每天"以用户的零点为界)
const today = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

let toastTimer;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

let clockTimer = null;
function stopTimer() {
  if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
}

/* ---------- 庆祝效果 ---------- */
function confetti() {
  const em = ["🎉", "✨", "⭐", "🎊", "🍀"];
  for (let i = 0; i < 28; i++) {
    const s = h("span", { class: "cf" }, em[i % em.length]);
    s.style.left = Math.random() * 100 + "vw";
    s.style.animationDelay = Math.random() * 0.4 + "s";
    s.style.fontSize = 14 + Math.random() * 16 + "px";
    document.body.append(s);
    setTimeout(() => s.remove(), 2400);
  }
}

function modal(icon, title, desc) {
  return new Promise((resolve) => {
    confetti();
    const m = h("div", { class: "modal" },
      h("div", { class: "mbox" },
        h("div", { class: "micon" }, icon),
        h("div", { class: "mtitle" }, title),
        h("p", { class: "sub" }, desc),
        h("button", { class: "primary", onclick: () => { m.remove(); resolve(); } }, "太棒了")));
    document.body.append(m);
  });
}

// 升级 / 成就弹窗按顺序依次展示
let celebrating = Promise.resolve();
function celebrate(a) {
  if (!a) return;
  if (a.goal_hit) { toast("🎉 今日目标达成!"); confetti(); }
  celebrating = celebrating.then(async () => {
    if (a.level_up) await modal("🎊", "升职啦!", `Lv.${a.level} · ${a.title}`);
    for (const x of a.new_achv) await modal(x.icon, "解锁成就:" + x.name, x.desc);
  });
}

/* ---------- 首页 ---------- */
function card(title, desc, onclick, extra = "") {
  return h("div", { class: "card " + extra, onclick: () => onclick() },
    h("div", {}, h("div", { class: "t" }, title), h("div", { class: "d" }, desc)),
    h("span", { class: "go" }, "›"));
}

function profileCard(p) {
  const span = Math.max(1, p.level_next - p.level_floor);
  const xpPct = Math.min(100, ((p.xp - p.level_floor) / span) * 100);
  const goalPct = Math.min(100, (p.today_count / p.goal) * 100);
  const goalDone = p.today_count >= p.goal;
  return h("div", { class: "profile" },
    h("div", { class: "prow" },
      h("div", { class: "lvbadge" }, "Lv." + p.level),
      h("div", { class: "ptitle" }, p.title),
      h("div", { class: "pstreak" + (p.streak ? "" : " off") },
        "🔥 " + p.streak + " 天", p.freezes ? h("small", {}, ` 🧊×${p.freezes}`) : null)),
    h("div", { class: "bar2" }, h("i", { style: `width:${xpPct}%` })),
    h("div", { class: "pmeta" }, h("span", {}, `经验 ${p.xp} / ${p.level_next}`), h("span", {}, `距升职 ${Math.max(0, p.level_next - p.xp)}`)),
    h("div", { class: "pmeta goal" },
      h("span", {}, goalDone ? "✅ 今日目标已达成" : `今日目标 ${p.today_count} / ${p.goal} 题`),
      h("span", {}, goalDone ? "" : `+20 XP`)),
    h("div", { class: "bar2 g" + (goalDone ? " done" : "") }, h("i", { style: `width:${goalPct}%` })));
}

async function renderHome() {
  stopTimer();
  const [cats, st, pf] = await Promise.all([
    invoke("list_categories"), invoke("get_stats"), invoke("get_profile", { today: today() })]);
  const totalQ = cats.reduce((a, c) => a + c.count, 0);
  const got = pf.achievements.filter((a) => a.unlocked).length;

  let confirmReset = false;
  const resetBtn = h("button", { class: "link", onclick: async () => {
    if (!confirmReset) {
      confirmReset = true;
      resetBtn.textContent = "再点一次确认(将清空经验、成就等所有进度)";
      return;
    }
    await invoke("reset_progress");
    toast("已清空");
    renderHome();
  } }, "清空所有进度");

  app.replaceChildren(
    h("h1", {}, "行测刷题"),
    h("p", { class: "sub" }, pf.streak ? `已连续打卡 ${pf.streak} 天,别断哦!` : "今天做几道题,开启你的连续打卡"),
    profileCard(pf),
    h("div", { class: "list" },
      card("📅 每日挑战", pf.daily_done ? "今日已完成 ✓ 明天再来" : "5 道精选题 · 完成额外 +30 XP", () => start("每日挑战"), pf.daily_done ? "" : "hot"),
      card("🧮 计算训练", "速算 · 平方 · 分数百分数 · 增长率", renderDrillMenu),
      card("全部题型", `${totalQ} 题`, () => start("全部")),
      cats.map((c) => {
        const s = st.stats[c.name] || { done: 0, right: 0 };
        return card(c.name, `${c.count} 题` + (s.done ? ` · 正确率 ${pct(s.right, s.done)}` : ""), () => start(c.name));
      }),
      card("错题本", `${st.wrong.length} 题`, () => start("错题本")),
      card("🏅 成就", `已解锁 ${got} / ${pf.achievements.length}`, renderAchv)),
    h("div", { class: "center" }, resetBtn));
}

async function renderAchv() {
  stopTimer();
  const pf = await invoke("get_profile", { today: today() });
  const got = pf.achievements.filter((a) => a.unlocked).length;
  app.replaceChildren(
    h("div", { class: "bar" }, h("button", { class: "link", onclick: renderHome }, "← 返回"), h("span")),
    h("h1", {}, "成就"),
    h("p", { class: "sub" }, `已解锁 ${got} / ${pf.achievements.length} · 最长连续打卡 ${pf.best_streak} 天`),
    h("div", { class: "agrid" }, pf.achievements.map((a) =>
      h("div", { class: "badge" + (a.unlocked ? "" : " locked") },
        h("div", { class: "bicon" }, a.unlocked ? a.icon : "🔒"),
        h("div", { class: "bname" }, a.name),
        h("div", { class: "bdesc" }, a.desc)))));
}

/* ---------- 题库练习 ---------- */
let S = null;

async function start(mode) {
  const qs = await invoke("get_questions", { mode, today: today() });
  if (!qs.length) return toast(mode === "错题本" ? "错题本是空的" : "该题型暂无题目");
  S = { mode, qs, i: 0, right: 0, done: false, combo: 0, xp: 0 };
  renderQ();
}

function renderQ() {
  const q = S.qs[S.i];
  const last = S.i + 1 >= S.qs.length;
  S.done = false;

  const opts = q.options.map((t, k) =>
    h("button", { class: "opt", onclick: () => choose(k) },
      h("b", {}, String.fromCharCode(65 + k)), h("span", {}, t)));
  const exp = h("div", { class: "exp hidden" });
  const next = h("button", { class: "primary hidden", onclick: () => {
    if (last) renderResult(); else { S.i++; renderQ(); }
  } }, last ? "查看结果" : "下一题");
  const combo = h("span", { class: "combo" }, S.combo >= 2 ? `🔥 ${S.combo} 连击` : "");

  S.ui = { opts, exp, next, q, combo };
  app.replaceChildren(
    h("div", { class: "bar" },
      h("button", { class: "link", onclick: renderHome }, "← 返回"),
      combo,
      h("span", {}, `${S.i + 1} / ${S.qs.length}`)),
    h("div", { class: "progress" }, h("i", { style: `width:${(S.i / S.qs.length) * 100}%` })),
    h("span", { class: "tag" }, S.mode === "每日挑战" ? "每日挑战 · " + q.category : q.category),
    h("p", { class: "stem" }, q.stem),
    h("div", { class: "opts" }, opts),
    exp, next);
}

async function choose(k) {
  if (S.done) return;
  S.done = true;
  const r = await invoke("submit_answer", { id: S.ui.q.id, choice: k, combo: S.combo, today: today() });
  S.combo = r.combo;
  S.xp += r.award.xp;
  if (r.correct) S.right++;
  S.ui.opts.forEach((b, j) => {
    b.disabled = true;
    if (j === r.answer) b.classList.add("ok");
    else if (j === k) b.classList.add("bad");
  });
  S.ui.combo.textContent = r.combo >= 2 ? `🔥 ${r.combo} 连击` : "";
  if (r.combo >= 2) { S.ui.combo.classList.remove("pop"); void S.ui.combo.offsetWidth; S.ui.combo.classList.add("pop"); }
  S.ui.exp.textContent = (r.correct ? "✓ 回答正确。" : "✗ 回答错误。") + r.explanation;
  S.ui.exp.append(h("div", { class: "xp" }, `+${r.award.xp} XP` + (r.combo >= 3 && r.correct ? `(连击加成)` : "")));
  S.ui.exp.classList.remove("hidden");
  S.ui.next.classList.remove("hidden");
  celebrate(r.award);
}

async function renderResult() {
  const total = S.qs.length;
  let bonus = 0;
  if (S.mode === "每日挑战") {
    const aw = await invoke("claim_daily", { today: today() });
    bonus = aw.xp;
    celebrate(aw);
  }
  const perfect = S.right === total;
  app.replaceChildren(
    h("div", { class: "center" },
      h("div", { class: "big" }, pct(S.right, total)),
      h("p", { class: "sub" }, `${perfect ? "全对!" : ""}本次 ${total} 题,答对 ${S.right} 题`),
      h("p", { class: "xp big-xp" }, `本次获得 ${S.xp + bonus} XP`),
      bonus ? h("p", { class: "sub" }, `含每日挑战奖励 +${bonus} XP`) : null,
      S.mode === "每日挑战"
        ? h("button", { class: "primary", onclick: renderHome }, "返回首页")
        : h("button", { class: "primary", onclick: () => start(S.mode) }, "再练一次"),
      S.mode === "每日挑战" ? null : h("button", { class: "link", onclick: renderHome }, "返回首页")));
  if (perfect) confetti();
}

/* ---------- 计算训练 ---------- */
let D = null;
let drillCount = 10;

async function renderDrillMenu() {
  stopTimer();
  const [kinds, st] = await Promise.all([invoke("list_drills"), invoke("get_stats")]);
  const drill = st.drill || {};
  app.replaceChildren(
    h("div", { class: "bar" }, h("button", { class: "link", onclick: renderHome }, "← 返回"), h("span")),
    h("h1", {}, "计算训练"),
    h("p", { class: "sub" }, "限时速算,练出行测的计算手感"),
    h("div", { class: "list" }, kinds.map((k) => {
      const s = drill[k.name];
      let extra = "";
      if (s && s.done) {
        extra = ` · 已练${s.done}题 正确率${pct(s.right, s.done)}`;
        if (s.best_avg_secs) extra += ` · 最佳${s.best_avg_secs.toFixed(1)}秒/题`;
      }
      return card(k.name, k.desc + extra, () => renderDrillStart(k));
    })));
}

function renderDrillStart(k) {
  const chips = [10, 20, 30].map((n) =>
    h("button", { class: "chip" + (n === drillCount ? " on" : ""), onclick: (e) => {
      drillCount = n;
      chips.forEach((c) => c.classList.remove("on"));
      e.currentTarget.classList.add("on");
    } }, n + " 题"));
  app.replaceChildren(
    h("div", { class: "bar" }, h("button", { class: "link", onclick: renderDrillMenu }, "← 返回"), h("span")),
    h("h1", {}, k.name),
    h("p", { class: "sub" }, k.desc),
    h("div", { class: "exp" }, h("b", {}, "速算小贴士"), h("br"), k.tip),
    h("p", { class: "sub" }, "题量(每答对一题 +4 XP,10 题以上全对额外 +30 XP)"),
    h("div", { class: "chips" }, chips),
    h("button", { class: "primary", onclick: () => startDrill(k) }, "开始"));
}

async function startDrill(k) {
  const qs = await invoke("gen_drill", { kind: k.name, count: drillCount });
  D = { kind: k.name, info: k, qs, i: 0, right: 0, spent: 0, qStart: 0,
        answered: false, active: true, wrong: [], combo: 0 };
  renderDrillQ();
}

function renderDrillQ() {
  const q = D.qs[D.i];
  const last = D.i + 1 >= D.qs.length;
  D.answered = false;
  D.qStart = Date.now();

  const input = h("input", { class: "ans", type: "text", inputmode: "decimal",
    autocomplete: "off", enterkeyhint: "done", placeholder: "输入答案" });
  const fb = h("div", { class: "fb" });
  const ok = h("button", { class: "primary", onclick: submitDrill }, "确定");
  const nextBtn = h("button", { class: "primary hidden", onclick: nextDrill },
    last ? "查看结果" : "下一题");
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (D.answered) nextDrill(); else submitDrill();
  });
  D.ui = { input, fb, ok, nextBtn, q };

  app.replaceChildren(
    h("div", { class: "bar" },
      h("button", { class: "link", onclick: leaveDrill }, "← 退出"),
      h("span", {}, `${D.i + 1} / ${D.qs.length}`),
      h("span", { id: "clock", class: "clock" }, clock(D.spent))),
    h("div", { class: "progress" }, h("i", { style: `width:${(D.i / D.qs.length) * 100}%` })),
    h("div", { class: "big-q" }, q.text),
    input, fb, ok, nextBtn);
  setTimeout(() => input.focus(), 0);
  startClock();
}

function startClock() {
  stopTimer();
  clockTimer = setInterval(() => {
    const el = document.getElementById("clock");
    if (!el || !D || !D.active) { stopTimer(); return; }
    el.textContent = clock(D.spent + (D.answered ? 0 : Date.now() - D.qStart));
  }, 200);
}

function submitDrill() {
  if (!D.active || D.answered) return;
  const raw = D.ui.input.value.trim().replace(",", ".").replace("−", "-");
  if (raw === "" || Number.isNaN(Number(raw))) { toast("请输入数字"); return; }
  const mine = Number(raw);
  const q = D.ui.q;

  D.answered = true;
  D.spent += Date.now() - D.qStart;
  D.ui.input.readOnly = true;
  D.ui.ok.classList.add("hidden");

  if (Math.abs(mine - q.answer) <= q.tol + 1e-9) {
    D.right++;
    D.combo++;
    D.ui.fb.textContent = "✓ 正确" + (D.combo >= 3 ? `  🔥${D.combo}连击` : "");
    D.ui.fb.className = "fb good";
    const d = D, i = D.i;
    setTimeout(() => { if (D === d && D.active && D.i === i) nextDrill(); }, 450);
  } else {
    D.combo = 0;
    D.wrong.push({ text: q.text, ans: q.answer, mine: raw });
    D.ui.fb.textContent = "✗ 正确答案:" + fmt(q.answer);
    D.ui.fb.className = "fb bad";
    D.ui.nextBtn.classList.remove("hidden");
  }
}

function nextDrill() {
  if (!D.active || !D.answered) return;
  if (D.i + 1 >= D.qs.length) finishDrill();
  else { D.i++; renderDrillQ(); }
}

function leaveDrill() {
  if (D) D.active = false;
  stopTimer();
  renderDrillMenu();
}

async function finishDrill() {
  D.active = false;
  stopTimer();
  const { info, kind, wrong } = D;
  const total = D.qs.length, right = D.right, secs = D.spent / 1000;
  const res = await invoke("record_drill", { kind, total, right, secs, today: today() });
  const st = res.stat, aw = res.award;

  app.replaceChildren(
    h("div", { class: "center" },
      h("div", { class: "big" }, pct(right, total)),
      h("p", { class: "sub" },
        `${kind} · 答对 ${right}/${total} · 用时 ${secs.toFixed(1)} 秒,平均 ${(secs / total).toFixed(1)} 秒/题`),
      st.best_avg_secs ? h("p", { class: "sub" }, `历史最佳:${st.best_avg_secs.toFixed(1)} 秒/题`) : null,
      h("p", { class: "xp big-xp" }, `本次获得 ${aw.xp} XP`)),
    wrong.length
      ? h("div", { class: "exp" }, h("b", {}, "错题回顾"),
          wrong.map((w) => h("div", { class: "wrow" }, `${w.text}  正确 ${fmt(w.ans)},你答 ${w.mine}`)))
      : null,
    h("button", { class: "primary", onclick: () => startDrill(info) }, "再练一次"),
    h("div", { class: "center" }, h("button", { class: "link", onclick: renderDrillMenu }, "返回计算训练")));
  if (right === total) confetti();
  celebrate(aw);
}

renderHome();
