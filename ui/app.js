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

/* ---------- 首页 ---------- */
function card(title, desc, onclick) {
  return h("div", { class: "card", onclick: () => onclick() },
    h("div", {}, h("div", { class: "t" }, title), h("div", { class: "d" }, desc)),
    h("span", { class: "go" }, "›"));
}

async function renderHome() {
  stopTimer();
  const [cats, st] = await Promise.all([invoke("list_categories"), invoke("get_stats")]);
  let done = 0, right = 0;
  Object.values(st.stats).forEach((s) => { done += s.done; right += s.right; });
  const totalQ = cats.reduce((a, c) => a + c.count, 0);

  let confirmReset = false;
  const resetBtn = h("button", { class: "link", onclick: async () => {
    if (!confirmReset) {
      confirmReset = true;
      resetBtn.textContent = "再点一次确认清空";
      return;
    }
    await invoke("reset_progress");
    toast("已清空");
    renderHome();
  } }, "清空做题记录");

  app.replaceChildren(
    h("h1", {}, "行测刷题"),
    h("p", { class: "sub" }, done ? `累计答题 ${done} 道,正确率 ${pct(right, done)}` : "选择题型开始练习"),
    h("div", { class: "list" },
      card("计算训练", "速算 · 平方 · 分数百分数 · 增长率", renderDrillMenu),
      card("全部题型", `${totalQ} 题`, () => start("全部")),
      cats.map((c) => {
        const s = st.stats[c.name] || { done: 0, right: 0 };
        return card(c.name, `${c.count} 题` + (s.done ? ` · 正确率 ${pct(s.right, s.done)}` : ""), () => start(c.name));
      }),
      card("错题本", `${st.wrong.length} 题`, () => start("错题本"))),
    h("div", { class: "center" }, resetBtn));
}

/* ---------- 题库练习 ---------- */
let S = null;

async function start(mode) {
  const qs = await invoke("get_questions", { mode });
  if (!qs.length) return toast(mode === "错题本" ? "错题本是空的" : "该题型暂无题目");
  S = { mode, qs, i: 0, right: 0, done: false };
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

  S.ui = { opts, exp, next, q };
  app.replaceChildren(
    h("div", { class: "bar" },
      h("button", { class: "link", onclick: renderHome }, "← 返回"),
      h("span", {}, `${S.i + 1} / ${S.qs.length}`)),
    h("div", { class: "progress" }, h("i", { style: `width:${(S.i / S.qs.length) * 100}%` })),
    h("span", { class: "tag" }, q.category),
    h("p", { class: "stem" }, q.stem),
    h("div", { class: "opts" }, opts),
    exp, next);
}

async function choose(k) {
  if (S.done) return;
  S.done = true;
  const r = await invoke("submit_answer", { id: S.ui.q.id, choice: k });
  if (r.correct) S.right++;
  S.ui.opts.forEach((b, j) => {
    b.disabled = true;
    if (j === r.answer) b.classList.add("ok");
    else if (j === k) b.classList.add("bad");
  });
  S.ui.exp.textContent = (r.correct ? "✓ 回答正确。" : "✗ 回答错误。") + r.explanation;
  S.ui.exp.classList.remove("hidden");
  S.ui.next.classList.remove("hidden");
}

function renderResult() {
  const total = S.qs.length;
  app.replaceChildren(
    h("div", { class: "center" },
      h("div", { class: "big" }, pct(S.right, total)),
      h("p", { class: "sub" }, `本次 ${total} 题,答对 ${S.right} 题`),
      h("button", { class: "primary", onclick: () => start(S.mode) }, "再练一次"),
      h("button", { class: "link", onclick: renderHome }, "返回首页")));
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
    h("p", { class: "sub" }, "题量"),
    h("div", { class: "chips" }, chips),
    h("button", { class: "primary", onclick: () => startDrill(k) }, "开始"));
}

async function startDrill(k) {
  const qs = await invoke("gen_drill", { kind: k.name, count: drillCount });
  D = { kind: k.name, info: k, qs, i: 0, right: 0, spent: 0, qStart: 0,
        answered: false, active: true, wrong: [] };
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
    D.ui.fb.textContent = "✓ 正确";
    D.ui.fb.className = "fb good";
    const d = D, i = D.i;
    setTimeout(() => { if (D === d && D.active && D.i === i) nextDrill(); }, 450);
  } else {
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
  const st = await invoke("record_drill", { kind, total, right, secs });

  app.replaceChildren(
    h("div", { class: "center" },
      h("div", { class: "big" }, pct(right, total)),
      h("p", { class: "sub" },
        `${kind} · 答对 ${right}/${total} · 用时 ${secs.toFixed(1)} 秒,平均 ${(secs / total).toFixed(1)} 秒/题`),
      st.best_avg_secs ? h("p", { class: "sub" }, `历史最佳:${st.best_avg_secs.toFixed(1)} 秒/题`) : null),
    wrong.length
      ? h("div", { class: "exp" }, h("b", {}, "错题回顾"),
          wrong.map((w) => h("div", { class: "wrow" }, `${w.text}  正确 ${fmt(w.ans)},你答 ${w.mine}`)))
      : null,
    h("button", { class: "primary", onclick: () => startDrill(info) }, "再练一次"),
    h("div", { class: "center" }, h("button", { class: "link", onclick: renderDrillMenu }, "返回计算训练")));
}

renderHome();
