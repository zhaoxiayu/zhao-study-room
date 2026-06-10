const STORAGE_KEY = "qingcheng-study-todo-v1";
const LAST_PHONE_KEY = "zhaosier-last-phone";
const LEGACY_LAST_PHONE_KEY = "zaoxiayu-last-phone";
const API_BASE = location.protocol === "file:" ? "http://127.0.0.1:5180" : "";
const COLORS = ["#48b884", "#f38daf", "#8ddfc0", "#f6b1c8", "#5a8ddf", "#e7a84c"];
const NICKNAME_BY_PHONE = {
  "15936073448": "考研的五一",
  "15939434458": "专升本的even",
  "13598570552": "考公的锤捶",
  "19538515421": "努力的晓",
};
const COVER_IMAGES = [
  "CE5C6D9B23D690CD33891D941816579E.jpg",
  "6F2CC1A53948F44F53EA01BB19E2D993.jpg",
  "CA1F544C27C9BBD9F3C0F685871B47B9.jpg",
  "3A15FF55E097B5A4AD148281A4B4E790.jpg",
  "FAAEB24C7CB726F202E92665AACB126E.jpg",
  "63440D98AC92318135022C3F98507427.jpg",
  "E4693D9C0027F813B1DB55C593E83A6C.jpg",
];

const defaultState = {
  activeTab: "study",
  user: {
    phone: "",
    name: "自习生",
    avatar: "",
    background: "",
    goalText: "",
    dailyGoalMinutes: 480,
    joinedAt: "",
  },
  openDays: [],
  records: [],
  friends: [],
  friendRanking: [],
  publicRanking: [],
  serverOnline: false,
};

let state = loadState();
removeSeedRecords();
normalizeFriends();
let draft = {
  mode: "countdown",
  topic: "",
  minutes: 45,
};
let session = null;
let timer = null;
let coverIndex = Math.floor(Date.now() / 10000) % COVER_IMAGES.length;

const app = document.querySelector("#app");
const railStats = document.querySelector("#railStats");
const navItems = [...document.querySelectorAll(".nav-item")];

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const storedUser = { ...(stored?.user || {}), avatar: "", background: "" };
    return {
      ...defaultState,
      ...stored,
      activeTab: "study",
      user: { ...defaultState.user, ...storedUser },
      friends: Array.isArray(stored?.friends) ? stored.friends : [],
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  const slimState = {
    ...state,
    user: {
      ...state.user,
      avatar: "",
      background: "",
    },
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slimState));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeTab: "study", user: slimState.user }));
  }
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function applyServerState(data) {
  state = {
    ...state,
    ...data,
    activeTab: state.activeTab || "study",
    user: { ...defaultState.user, ...(data.user || state.user) },
    friends: Array.isArray(data.friends) ? data.friends : state.friends,
    friendRanking: Array.isArray(data.friendRanking) ? data.friendRanking : [],
    publicRanking: Array.isArray(data.publicRanking) ? data.publicRanking : [],
    serverOnline: true,
  };
  localStorage.setItem(LAST_PHONE_KEY, state.user.phone || "");
  saveState();
}

function nicknameForPhone(phone) {
  return NICKNAME_BY_PHONE[String(phone || "").replace(/\D/g, "")] || "";
}

async function syncFromServer(phone = state.user.phone) {
  if (!phone) return false;
  try {
    const data = await api(`/api/state?phone=${encodeURIComponent(phone)}`);
    applyServerState(data);
    return true;
  } catch (error) {
    state.serverOnline = false;
    saveState();
    return false;
  }
}

async function checkServerOnline() {
  try {
    await api("/api/health");
    state.serverOnline = true;
    saveState();
    return true;
  } catch {
    state.serverOnline = false;
    saveState();
    return false;
  }
}

function isSeedRecord(item) {
  const seedTopics = new Set(["英语听力", "高数刷题", "Java 课程设计"]);
  const seedDurations = new Set([32 * 60, 48 * 60, 64 * 60]);
  return (
    seedTopics.has(item.topic) &&
    seedDurations.has(item.seconds) &&
    item.mode === "countdown" &&
    item.startedAt === item.finishedAt
  );
}

function removeSeedRecords() {
  const originalLength = state.records.length;
  state.records = state.records.filter((item) => !isSeedRecord(item));
  if (state.records.length !== originalLength) saveState();
}

function normalizeFriends() {
  const today = todayKey();
  let changed = false;
  state.friends = state.friends
    .filter((friend) => friend && friend.name)
    .map((friend) => {
      const next = {
        id: friend.id || crypto.randomUUID(),
        name: String(friend.name).slice(0, 12),
        secondsToday: Number(friend.secondsToday) || 0,
        date: friend.date || today,
        updatedAt: friend.updatedAt || new Date().toISOString(),
      };
      if (next.date !== today) {
        next.secondsToday = 0;
        next.date = today;
        changed = true;
      }
      if (next.id !== friend.id || next.name !== friend.name) changed = true;
      return next;
    });
  if (changed) saveState();
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addOpenDay() {
  const today = todayKey();
  if (!state.openDays.includes(today)) {
    state.openDays.push(today);
    state.openDays = [...new Set(state.openDays)].sort();
    saveState();
  }
}

function formatSeconds(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatMinutes(seconds) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} 分钟`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
}

function getTodayRecords() {
  const today = todayKey();
  return state.records.filter((item) => item.date === today);
}

function totalSeconds(records = state.records) {
  return records.reduce((sum, item) => sum + item.seconds, 0);
}

function calcStreak() {
  const days = new Set(state.openDays);
  let count = 0;
  const cursor = new Date();
  while (days.has(todayKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

function avatarMarkup(extraClass = "") {
  if (state.user.avatar) {
    return `<div class="avatar ${extraClass}"><img src="${state.user.avatar}" alt="头像" /></div>`;
  }
  const name = state.user.name || "学";
  return `<div class="avatar ${extraClass}" aria-label="默认头像">${name.slice(0, 1)}</div>`;
}

function currentUserName() {
  return state.user.phone ? state.user.name || "自习生" : "未登录";
}

function setUserBackgroundVar() {
  const background = state.user.background ? `url("${state.user.background}")` : `url("./assets/study-bg.png")`;
  document.documentElement.style.setProperty("--user-bg", background);
}

function setHomeCoverVar() {
  const file = COVER_IMAGES[coverIndex % COVER_IMAGES.length];
  document.documentElement.style.setProperty("--home-cover", `url("./assets/covers/${file}")`);
}

function render() {
  setUserBackgroundVar();
  setHomeCoverVar();
  const needsLogin = !state.user.phone && !session;
  document.querySelector(".bottom-nav").hidden = needsLogin;
  navItems.forEach((item) => item.classList.toggle("is-active", item.dataset.tab === state.activeTab));

  if (needsLogin) {
    renderLoginGate();
  } else if (session) {
    renderTimerPage();
  } else if (state.activeTab === "study") {
    renderStudy();
  } else if (state.activeTab === "records") {
    renderRecords();
  } else {
    renderProfile();
  }

  renderRail();
  refreshIcons();
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function renderLoginGate() {
  app.innerHTML = `
    <section class="login-gate">
      <div class="login-cover">
        <p class="kicker">赵四儿自习室</p>
        <h1>先进入你的自习座位</h1>
        <p>输入手机号后会自动生成昵称，之后打开就直接进入主页。</p>
      </div>

      <section class="profile-panel login-panel">
        <h3 class="section-title">登录账号</h3>
        <label class="field">
          <span>手机号</span>
          <input id="gatePhoneInput" inputmode="numeric" maxlength="11" placeholder="请输入手机号" />
        </label>
        <div class="nickname-preview">
          <span>对应昵称</span>
          <strong id="gateNickname">输入手机号后生成</strong>
        </div>
        <button class="primary-btn" type="button" id="gateLoginBtn">
          <i data-lucide="log-in"></i>
          进入自习室
        </button>
      </section>
    </section>
  `;

  const phoneInput = document.querySelector("#gatePhoneInput");
  const nickname = document.querySelector("#gateNickname");
  phoneInput.addEventListener("input", () => {
    const mapped = nicknameForPhone(phoneInput.value);
    nickname.textContent = mapped || "未匹配昵称";
  });
  document.querySelector("#gateLoginBtn").addEventListener("click", () => loginWithPhone(phoneInput.value));
}

function renderStudy() {
  const todayRecords = getTodayRecords();
  const total = totalSeconds(todayRecords);
  const goalMinutes = Number(state.user.dailyGoalMinutes) || 480;
  const goalSeconds = goalMinutes * 60;
  const goalRatio = Math.min(1, total / goalSeconds);
  const isGoalDone = total >= goalSeconds;
  const arcLength = 251;
  const arcProgress = Math.max(0, Math.min(arcLength, goalRatio * arcLength));
  app.innerHTML = `
    <section class="hero">
      <div class="top-row">
        <div class="hello">
          <p class="kicker">${state.user.phone ? "欢迎回来" : "先登录即可保存资料"}</p>
          <h2>${currentUserName()}</h2>
        </div>
        ${avatarMarkup()}
      </div>
      <div class="start-copy">
        <h1>不要在心上努力，行为却倦怠。</h1>
        <p>而是反过来，心态放松，直接去做</p>
      </div>
    </section>

    <div class="stack">
      <button class="primary-btn start-study-btn" type="button" id="openStart">
        <i data-lucide="play"></i>
        开始学习
      </button>

      <section class="goal-card">
        <div class="goal-head">
          <div>
            <span>目标学习时长</span>
            <strong>${formatMinutes(goalSeconds)}</strong>
          </div>
          <p>${escapeHtml(state.user.goalText || "今日专注")}</p>
        </div>
        <div class="semi-meter">
          <svg viewBox="0 0 200 112" aria-label="今日目标进度">
            <path d="M 20 96 A 80 80 0 0 1 180 96" class="meter-track"></path>
            <path d="M 20 96 A 80 80 0 0 1 180 96" class="meter-fill" style="stroke-dasharray: ${arcProgress} ${arcLength};"></path>
          </svg>
          <div class="meter-center">
            ${isGoalDone ? `<i data-lucide="check"></i><strong>已完成！</strong>` : `<strong>${Math.round(goalRatio * 100)}%</strong><span>${formatMinutes(total)} / ${formatMinutes(goalSeconds)}</span>`}
          </div>
        </div>
      </section>

      <section class="form-panel start-panel" id="startPanel">
        <h3 class="section-title">开始一段学习</h3>
        <div class="mode-grid">
          <button class="mode-option ${draft.mode === "countup" ? "is-selected" : ""}" type="button" data-mode="countup">
            <i data-lucide="refresh-cw"></i>
            正计时
          </button>
          <button class="mode-option ${draft.mode === "countdown" ? "is-selected" : ""}" type="button" data-mode="countdown">
            <i data-lucide="hourglass"></i>
            倒计时
          </button>
        </div>

        <label class="field">
          <span>学习内容</span>
          <textarea id="topicInput" maxlength="60">${draft.topic}</textarea>
        </label>

        <label class="field" id="minutesField">
          <span>倒计时时长</span>
          <select id="minutesInput">
            ${[25, 30, 45, 60, 90, 120].map((n) => `<option value="${n}" ${draft.minutes === n ? "selected" : ""}>${n} 分钟</option>`).join("")}
          </select>
        </label>

        <div class="form-actions">
          <button class="ghost-btn" type="button" id="closeStart">
            <i data-lucide="x"></i>
            取消
          </button>
          <button class="primary-btn" type="button" id="startStudy">
            <i data-lucide="arrow-right"></i>
            进入计时
          </button>
        </div>
      </section>

      <div class="stat-grid">
        <div class="stat-card">
          <span>今日学习</span>
          <strong>${formatMinutes(total)}</strong>
        </div>
        <div class="stat-card">
          <span>连续打开</span>
          <strong>${calcStreak()} 天</strong>
        </div>
      </div>
    </div>
  `;

  const startPanel = document.querySelector("#startPanel");
  const minutesField = document.querySelector("#minutesField");
  const topicInput = document.querySelector("#topicInput");
  const minutesInput = document.querySelector("#minutesInput");

  document.querySelector("#openStart").addEventListener("click", () => {
    const willOpen = !startPanel.classList.contains("is-open");
    startPanel.classList.toggle("is-open", willOpen);
    if (willOpen) topicInput.focus();
  });
  document.querySelector("#closeStart").addEventListener("click", () => {
    startPanel.classList.remove("is-open");
  });
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      draft.mode = button.dataset.mode;
      document.querySelectorAll("[data-mode]").forEach((item) => item.classList.toggle("is-selected", item === button));
      minutesField.style.display = draft.mode === "countdown" ? "grid" : "none";
      saveDraft(topicInput, minutesInput);
    });
  });
  topicInput.addEventListener("input", () => saveDraft(topicInput, minutesInput));
  minutesInput.addEventListener("change", () => saveDraft(topicInput, minutesInput));
  minutesField.style.display = draft.mode === "countdown" ? "grid" : "none";
  document.querySelector("#startStudy").addEventListener("click", () => startStudy(topicInput, minutesInput));
}

function saveDraft(topicInput, minutesInput) {
  draft.topic = topicInput.value.trim();
  draft.minutes = Number(minutesInput.value);
}

function startStudy(topicInput, minutesInput) {
  saveDraft(topicInput, minutesInput);
  const topic = draft.topic || "自由学习";
  const now = Date.now();
  session = {
    topic,
    mode: draft.mode,
    minutes: draft.minutes,
    startMs: now,
    pausedMs: 0,
    pauseStartedMs: null,
    isPaused: false,
  };
  startTick();
  render();
}

function startTick() {
  clearInterval(timer);
  timer = setInterval(updateTimerPage, 1000);
}

function elapsedSeconds() {
  if (!session) return 0;
  const now = session.isPaused ? session.pauseStartedMs : Date.now();
  return Math.max(0, Math.floor((now - session.startMs - session.pausedMs) / 1000));
}

function renderTimerPage() {
  app.innerHTML = `
    <section class="timer-page">
      <div class="session-top">
        <div class="session-topic">
          <p class="small-label">${session.mode === "countdown" ? "倒计时学习中" : "正计时学习中"}</p>
          <h2>${escapeHtml(session.topic)}</h2>
        </div>
        <button class="icon-button tiny-btn" type="button" id="quitSession" title="结束学习">
          <i data-lucide="x"></i>
        </button>
      </div>

      <div class="timer-card">
        <div class="timer-ring" id="timerRing">
          <div class="timer-readout">
            <strong id="timerText">00:00</strong>
            <span id="timerHint">保持专注</span>
          </div>
        </div>
      </div>

      <p class="timer-quote">
        任何时候不要去怀疑自己，或是羡慕别人。做好自己，全力以赴地把握好每一天，不要太计较最后的结果。这个过程只是迟早和长短而已，最终都会有属于自己的天地和展现自己价值的一天。
      </p>

      <div class="timer-controls">
        <button class="ghost-btn" type="button" id="pauseSession">
          <i data-lucide="${session.isPaused ? "play" : "pause"}"></i>
          ${session.isPaused ? "继续" : "暂停"}
        </button>
        <button class="ghost-btn" type="button" id="restartSession">
          <i data-lucide="rotate-ccw"></i>
          重开
        </button>
        <button class="primary-btn" type="button" id="finishSession">
          <i data-lucide="check"></i>
          完成
        </button>
      </div>
    </section>
  `;

  document.querySelector("#pauseSession").addEventListener("click", togglePause);
  document.querySelector("#restartSession").addEventListener("click", restartSession);
  document.querySelector("#finishSession").addEventListener("click", () => finishSession(false));
  document.querySelector("#quitSession").addEventListener("click", () => finishSession(true));
  updateTimerPage();
}

function updateTimerPage() {
  if (!session) return;
  const elapsed = elapsedSeconds();
  const total = session.minutes * 60;
  const isCountdown = session.mode === "countdown";
  const remaining = Math.max(0, total - elapsed);
  const displaySeconds = isCountdown ? remaining : elapsed;
  const progress = isCountdown ? Math.min(1, elapsed / total) : (elapsed % 3600) / 3600;

  const text = document.querySelector("#timerText");
  const hint = document.querySelector("#timerHint");
  const ring = document.querySelector("#timerRing");
  if (!text || !hint || !ring) return;

  text.textContent = formatSeconds(displaySeconds);
  hint.textContent = session.isPaused ? "已暂停" : isCountdown ? "倒计时进行中" : "正计时进行中";
  ring.style.setProperty("--progress", `${Math.max(1, progress * 360)}deg`);

  if (isCountdown && remaining <= 0) {
    finishSession(false);
  }
}

function togglePause() {
  if (!session) return;
  if (session.isPaused) {
    session.pausedMs += Date.now() - session.pauseStartedMs;
    session.pauseStartedMs = null;
    session.isPaused = false;
    startTick();
  } else {
    session.pauseStartedMs = Date.now();
    session.isPaused = true;
    clearInterval(timer);
  }
  render();
}

function restartSession() {
  if (!session) return;
  session.startMs = Date.now();
  session.pausedMs = 0;
  session.pauseStartedMs = null;
  session.isPaused = false;
  startTick();
  render();
}

async function finishSession(discard) {
  if (!session) return;
  const seconds = elapsedSeconds();
  const finishedSession = session;
  clearInterval(timer);
  if (!discard && seconds >= 30) {
    if (state.user.phone) {
      try {
        const data = await api("/api/records", {
          method: "POST",
          body: JSON.stringify({
            phone: state.user.phone,
            topic: finishedSession.topic,
            mode: finishedSession.mode,
            seconds,
            startedAt: new Date(finishedSession.startMs).toISOString(),
          }),
        });
        applyServerState(data);
      } catch (error) {
        alert(error.message);
      }
    } else {
      state.records.unshift({
        id: crypto.randomUUID(),
        date: todayKey(),
        topic: finishedSession.topic,
        mode: finishedSession.mode,
        seconds,
        startedAt: new Date(finishedSession.startMs).toISOString(),
        finishedAt: new Date().toISOString(),
      });
      saveState();
    }
  }
  session = null;
  state.activeTab = discard ? "study" : "records";
  render();
}

function renderRecords() {
  const todayRecords = getTodayRecords();
  const todayTotal = totalSeconds(todayRecords);
  const chart = buildChart(todayRecords);
  app.innerHTML = `
    <section class="page-title">
      <div>
        <p class="small-label">学习记录</p>
        <h2>今天的专注分布</h2>
      </div>
    </section>

    <div class="record-summary">
      <div class="stat-card">
        <span>连续打开</span>
        <strong>${calcStreak()} 天</strong>
      </div>
      <div class="stat-card">
        <span>今日学习</span>
        <strong>${formatMinutes(todayTotal)}</strong>
      </div>
    </div>

    <section class="record-card">
      ${todayRecords.length ? `
        <div class="chart-wrap">
          <div class="pie" style="--chart: ${chart.gradient};" aria-label="学习内容饼状图"></div>
          <div class="legend">
            ${chart.items.map((item) => `
              <div class="legend-item">
                <span class="dot" style="--dot: ${item.color};"></span>
                <strong>${escapeHtml(item.topic)}</strong>
                <span>${formatMinutes(item.seconds)}</span>
              </div>
            `).join("")}
          </div>
        </div>
      ` : `<div class="empty">今天还没有学习记录。完成一次计时后，这里会显示饼状图。</div>`}
    </section>

    ${renderFriendRoom(todayTotal)}

    ${renderPublicRanking()}

    <div class="stack">
      <h3 class="section-title">最近记录</h3>
      <div class="history-list">
        ${state.records.length ? state.records.slice(0, 12).map(recordItem).join("") : `<div class="empty">还没有历史记录。</div>`}
      </div>
    </div>
  `;

  bindFriendActions();
}

function buildChart(records) {
  const grouped = new Map();
  records.forEach((item) => grouped.set(item.topic, (grouped.get(item.topic) || 0) + item.seconds));
  const items = [...grouped.entries()].map(([topic, seconds], index) => ({
    topic,
    seconds,
    color: COLORS[index % COLORS.length],
  }));
  const total = totalSeconds(records);
  let cursor = 0;
  const stops = items.map((item) => {
    const start = cursor;
    const end = cursor + (item.seconds / total) * 360;
    cursor = end;
    return `${item.color} ${start}deg ${end}deg`;
  });
  return {
    items,
    gradient: `conic-gradient(${stops.join(", ")})`,
  };
}

function recordItem(item) {
  const date = new Date(item.startedAt);
  const time = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `
    <div class="history-item">
      <div>
        <strong>${escapeHtml(item.topic)}</strong>
        <span>${time} · ${item.mode === "countdown" ? "倒计时" : "正计时"}</span>
      </div>
      <strong>${formatMinutes(item.seconds)}</strong>
    </div>
  `;
}

function getRankingRows(mySeconds) {
  const myName = state.user.phone ? state.user.name || "我" : "我";
  if (state.friendRanking.length) return state.friendRanking;
  return [
    {
      id: "me",
      name: myName,
      seconds: mySeconds,
      note: "来自我的计时",
      isMe: true,
      canEdit: false,
    },
    ...state.friends.map((friend) => ({
      id: friend.id,
      name: friend.name,
      seconds: friend.secondsToday,
      note: "朋友今日学习",
      isMe: false,
      canEdit: true,
    })),
  ].sort((a, b) => b.seconds - a.seconds);
}

function renderFriendRoom(mySeconds) {
  const rows = getRankingRows(mySeconds);
  return `
    <section class="record-card friends-card">
      <div class="friends-head">
        <div>
          <p class="small-label">朋友自习室</p>
          <h3 class="section-title">今日一起学习排名</h3>
        </div>
        <span>${state.friends.length} 位朋友</span>
      </div>

      <div class="friend-form">
        <label class="field compact-field">
          <span>朋友昵称/手机号</span>
          <input id="friendNameInput" maxlength="12" placeholder="输入昵称或已登录手机号" />
        </label>
        <label class="field compact-field">
          <span>手动分钟</span>
          <input id="friendMinutesInput" type="number" inputmode="numeric" min="0" max="1440" value="0" />
        </label>
        <button class="primary-btn" type="button" id="addFriendBtn">
          <i data-lucide="user-plus"></i>
          添加朋友
        </button>
      </div>

      <div class="ranking-list">
        ${rows.map((row, index) => friendRankItem(row, index)).join("")}
      </div>
    </section>
  `;
}

function friendRankItem(row, index) {
  return `
    <div class="friend-rank ${row.isMe ? "is-me" : ""}">
      <span class="rank-badge">${index + 1}</span>
      <div class="friend-meta">
        <strong>${escapeHtml(row.name)}</strong>
        <span>${row.note}</span>
      </div>
      <strong class="friend-time">${formatMinutes(row.seconds)}</strong>
      ${row.isMe ? "" : `
        <div class="friend-actions">
          ${row.canEdit ? `
            <button class="tiny-btn" type="button" data-friend-action="add15" data-id="${row.id}" title="加 15 分钟">
              <i data-lucide="plus"></i>
            </button>
            <button class="tiny-btn" type="button" data-friend-action="reset" data-id="${row.id}" title="清零">
              <i data-lucide="rotate-ccw"></i>
            </button>
          ` : ""}
          <button class="tiny-btn" type="button" data-friend-action="delete" data-id="${row.id}" title="删除朋友">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      `}
    </div>
  `;
}

function renderPublicRanking() {
  const rows = state.publicRanking || [];
  return `
    <section class="record-card friends-card">
      <div class="friends-head">
        <div>
          <p class="small-label">公开自习榜</p>
          <h3 class="section-title">今日全员排名</h3>
        </div>
        <span>${rows.length} 人</span>
      </div>
      <div class="ranking-list">
        ${rows.length ? rows.map((row, index) => `
          <div class="friend-rank ${row.phone === state.user.phone ? "is-me" : ""}">
            <span class="rank-badge">${index + 1}</span>
            <div class="friend-meta">
              <strong>${escapeHtml(row.name)}</strong>
              <span>${row.phone === state.user.phone ? "我" : "自习室成员"}</span>
            </div>
            <strong class="friend-time">${formatMinutes(row.seconds)}</strong>
          </div>
        `).join("") : `<div class="empty">还没有公开学习记录。大家登录并完成一次学习后会出现在这里。</div>`}
      </div>
    </section>
  `;
}

function bindFriendActions() {
  const addButton = document.querySelector("#addFriendBtn");
  if (addButton) addButton.addEventListener("click", addFriend);
  document.querySelectorAll("[data-friend-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.id;
      const action = button.dataset.friendAction;
      if (action === "add15") adjustFriend(id, 15);
      if (action === "reset") resetFriend(id);
      if (action === "delete") deleteFriend(id);
    });
  });
}

async function addFriend() {
  const nameInput = document.querySelector("#friendNameInput");
  const minutesInput = document.querySelector("#friendMinutesInput");
  const name = nameInput.value.trim();
  const minutes = Math.max(0, Math.min(1440, Number(minutesInput.value) || 0));
  if (!name) {
    nameInput.focus();
    return;
  }
  if (state.user.phone) {
    try {
      const data = await api("/api/friends", {
        method: "POST",
        body: JSON.stringify({ phone: state.user.phone, friend: name, minutes }),
      });
      applyServerState(data);
    } catch (error) {
      alert(error.message);
    }
  } else {
    state.friends.push({
      id: crypto.randomUUID(),
      name,
      secondsToday: minutes * 60,
      date: todayKey(),
      updatedAt: new Date().toISOString(),
    });
    saveState();
  }
  render();
}

async function adjustFriend(id, minutes) {
  if (state.user.phone) {
    try {
      const data = await api(`/api/friends/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ phone: state.user.phone, action: "add" }),
      });
      applyServerState(data);
      render();
    } catch (error) {
      alert(error.message);
    }
    return;
  }
  const friend = state.friends.find((item) => item.id === id);
  if (!friend) return;
  friend.secondsToday = Math.min(24 * 60 * 60, friend.secondsToday + minutes * 60);
  friend.date = todayKey();
  friend.updatedAt = new Date().toISOString();
  saveState();
  render();
}

async function resetFriend(id) {
  if (state.user.phone) {
    try {
      const data = await api(`/api/friends/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ phone: state.user.phone, action: "reset" }),
      });
      applyServerState(data);
      render();
    } catch (error) {
      alert(error.message);
    }
    return;
  }
  const friend = state.friends.find((item) => item.id === id);
  if (!friend) return;
  friend.secondsToday = 0;
  friend.date = todayKey();
  friend.updatedAt = new Date().toISOString();
  saveState();
  render();
}

async function deleteFriend(id) {
  if (state.user.phone) {
    try {
      const data = await api(`/api/friends/${encodeURIComponent(id)}`, {
        method: "DELETE",
        body: JSON.stringify({ phone: state.user.phone }),
      });
      applyServerState(data);
      render();
    } catch (error) {
      alert(error.message);
    }
    return;
  }
  state.friends = state.friends.filter((item) => item.id !== id);
  state.friendRanking = state.friendRanking.filter((item) => item.id !== id);
  saveState();
  render();
}

function renderProfile() {
  const isLoggedIn = Boolean(state.user.phone);
  app.innerHTML = `
    <section class="profile-cover">
      <div>
        <p class="small-label">${isLoggedIn ? "个人页面" : "手机号登录"}</p>
        <h2>${currentUserName()}</h2>
        <p>${isLoggedIn ? state.user.phone : "登录后可保存头像、背景和记录"}</p>
      </div>
      ${avatarMarkup("profile-avatar")}
    </section>

    <div class="stack">
      <section class="profile-panel">
        <h3 class="section-title">${isLoggedIn ? "账号资料" : "登录账号"}</h3>
        <label class="field">
          <span>手机号</span>
          <input id="phoneInput" inputmode="numeric" maxlength="11" placeholder="请输入 11 位手机号" value="${state.user.phone}" ${isLoggedIn ? "readonly" : ""} />
        </label>
        <label class="field">
          <span>昵称</span>
          <input id="nameInput" maxlength="12" placeholder="输入手机号后自动生成" value="${escapeAttr(state.user.name)}" readonly />
        </label>
        <label class="field">
          <span>目标</span>
          <input id="goalTextInput" maxlength="28" placeholder="例如：考研数学一轮复习" value="${escapeAttr(state.user.goalText || "")}" />
        </label>
        <label class="field">
          <span>每日目标学习时长</span>
          <select id="dailyGoalInput">
            ${[120, 180, 240, 300, 360, 480, 600, 720].map((n) => `<option value="${n}" ${Number(state.user.dailyGoalMinutes || 480) === n ? "selected" : ""}>${formatMinutes(n * 60)}</option>`).join("")}
          </select>
        </label>
        <div class="form-actions">
          <button class="primary-btn" type="button" id="loginBtn">
            <i data-lucide="${isLoggedIn ? "save" : "log-in"}"></i>
            ${isLoggedIn ? "保存资料" : "登录"}
          </button>
          ${isLoggedIn ? `
            <button class="ghost-btn" type="button" id="logoutBtn">
              <i data-lucide="log-out"></i>
              退出
            </button>
          ` : ""}
        </div>
        <div class="notice">${state.serverOnline ? "已连接后端，账号、头像、记录和排行会同步保存。" : "请用后端网址打开并登录，才能让多台手机同步数据。"}</div>
      </section>

      <section class="profile-panel">
        <h3 class="section-title">个性设置</h3>
        <div class="upload-row">
          <label class="ghost-btn">
            <i data-lucide="image-up"></i>
            换头像
            <input class="file-input" id="avatarInput" type="file" accept="image/*" />
          </label>
          <label class="ghost-btn">
            <i data-lucide="wallpaper"></i>
            换背景
            <input class="file-input" id="bgInput" type="file" accept="image/*" />
          </label>
        </div>
      </section>

      <section class="profile-panel">
        <h3 class="section-title">学习数据</h3>
        <div class="stat-grid">
          <div class="stat-card">
            <span>累计学习</span>
            <strong>${formatMinutes(totalSeconds())}</strong>
          </div>
          <div class="stat-card">
            <span>总次数</span>
            <strong>${state.records.length} 次</strong>
          </div>
        </div>
      </section>
    </div>
  `;

  document.querySelector("#loginBtn").addEventListener("click", saveProfile);
  const phoneInput = document.querySelector("#phoneInput");
  phoneInput.addEventListener("input", () => {
    document.querySelector("#nameInput").value = nicknameForPhone(phoneInput.value) || "";
  });
  document.querySelector("#avatarInput").addEventListener("change", (event) => readImage(event, "avatar"));
  document.querySelector("#bgInput").addEventListener("change", (event) => readImage(event, "background"));
  const logout = document.querySelector("#logoutBtn");
  if (logout) logout.addEventListener("click", logoutProfile);
}

async function saveProfile() {
  const phone = document.querySelector("#phoneInput").value.trim();
  const name = nicknameForPhone(phone) || document.querySelector("#nameInput").value.trim() || "自习生";
  const goalText = document.querySelector("#goalTextInput").value.trim();
  const dailyGoalMinutes = Number(document.querySelector("#dailyGoalInput").value) || 480;
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    alert("请输入正确的 11 位手机号");
    return;
  }
  try {
    const data = state.user.phone
      ? await api("/api/profile", {
          method: "PUT",
          body: JSON.stringify({
            phone,
            name,
            avatar: state.user.avatar,
            background: state.user.background,
            goalText,
            dailyGoalMinutes,
          }),
        })
      : await api("/api/login", {
          method: "POST",
          body: JSON.stringify({ phone, name }),
        });
    applyServerState(data);
  } catch (error) {
    alert(error.message);
    state.serverOnline = false;
    state.user.phone = phone;
    state.user.name = name;
    state.user.joinedAt ||= new Date().toISOString();
    saveState();
  }
  render();
}

async function loginWithPhone(phone) {
  const clean = String(phone || "").replace(/\D/g, "");
  const name = nicknameForPhone(clean);
  if (!/^1[3-9]\d{9}$/.test(clean)) {
    alert("请输入正确的 11 位手机号");
    return;
  }
  if (!name) {
    alert("这个手机号暂未分配昵称");
    return;
  }
  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ phone: clean, name }),
    });
    applyServerState(data);
    state.activeTab = "study";
    saveState();
    render();
  } catch (error) {
    alert(error.message);
  }
}

function logoutProfile() {
  state.user.phone = "";
  state.serverOnline = false;
  state.friendRanking = [];
  state.publicRanking = [];
  localStorage.removeItem(LAST_PHONE_KEY);
  saveState();
  render();
}

function readImage(event, key) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    state.user[key] = await resizeImage(reader.result, key === "avatar" ? 360 : 1200);
    if (state.user.phone) {
      try {
        const data = await api("/api/profile", {
          method: "PUT",
          body: JSON.stringify({
            phone: state.user.phone,
            name: state.user.name,
            avatar: state.user.avatar,
            background: state.user.background,
            goalText: state.user.goalText,
            dailyGoalMinutes: state.user.dailyGoalMinutes,
          }),
        });
        applyServerState(data);
      } catch (error) {
        alert(error.message);
        saveState();
      }
    } else {
      saveState();
    }
    render();
  };
  reader.readAsDataURL(file);
}

function resizeImage(dataUrl, maxSize) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const context = canvas.getContext("2d");
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function renderRail() {
  const todayRecords = getTodayRecords();
  const topFriend = getRankingRows(totalSeconds(todayRecords))[0];
  railStats.innerHTML = `
    <div class="rail-card">
      <span>今日学习</span>
      <strong>${formatMinutes(totalSeconds(todayRecords))}</strong>
    </div>
    <div class="rail-card">
      <span>连续打开</span>
      <strong>${calcStreak()} 天</strong>
    </div>
    <div class="rail-card">
      <span>朋友数量</span>
      <strong>${state.friends.length}</strong>
    </div>
    <div class="rail-card">
      <span>今日第一</span>
      <strong>${escapeHtml(topFriend?.name || "我")}</strong>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    state.activeTab = item.dataset.tab;
    saveState();
    render();
  });
});

async function init() {
  await checkServerOnline();
  const lastPhone = localStorage.getItem(LAST_PHONE_KEY) || localStorage.getItem(LEGACY_LAST_PHONE_KEY) || state.user.phone;
  if (lastPhone) {
    state.user.phone = lastPhone;
    const synced = await syncFromServer(lastPhone);
    if (!synced) addOpenDay();
  } else {
    addOpenDay();
  }
  render();
  setInterval(() => {
    coverIndex = (coverIndex + 1) % COVER_IMAGES.length;
    setHomeCoverVar();
  }, 9000);
}

init();
