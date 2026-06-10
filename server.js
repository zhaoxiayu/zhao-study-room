import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize } from "node:path";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 5180);
const ROOT = new URL(".", import.meta.url).pathname;
const DEFAULT_DATA_DIR = join(ROOT, "data");
const REQUESTED_DATA_DIR = process.env.DATA_DIR || DEFAULT_DATA_DIR;
let activeDataDir = REQUESTED_DATA_DIR;
let warnedDataFallback = false;

const NICKNAME_BY_PHONE = {
  "15936073448": "考研的五一",
  "15939434458": "专升本的even",
  "13598570552": "考公的锤捶",
  "19538515421": "努力的晓",
};

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function dbFile() {
  return join(activeDataDir, "db.json");
}

async function ensureDataDir() {
  try {
    await mkdir(activeDataDir, { recursive: true });
  } catch (error) {
    if (activeDataDir !== DEFAULT_DATA_DIR) {
      activeDataDir = DEFAULT_DATA_DIR;
      if (!warnedDataFallback) {
        warnedDataFallback = true;
        console.warn(`数据目录 ${REQUESTED_DATA_DIR} 不可写，已临时切换到 ${DEFAULT_DATA_DIR}`);
      }
      await mkdir(activeDataDir, { recursive: true });
      return;
    }
    throw error;
  }
}

async function loadDb() {
  try {
    await ensureDataDir();
    return JSON.parse(await readFile(dbFile(), "utf8"));
  } catch {
    return { users: {} };
  }
}

async function saveDb(db) {
  await ensureDataDir();
  await writeFile(dbFile(), JSON.stringify(db, null, 2));
}

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 11);
}

function validPhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone);
}

function cleanName(value, fallback = "自习生") {
  const text = String(value || "").trim();
  return (text || fallback).slice(0, 12);
}

function mappedNickname(phone, fallback) {
  return NICKNAME_BY_PHONE[phone] || cleanName(fallback);
}

function cleanGoal(value) {
  return String(value || "").trim().slice(0, 28);
}

function cleanGoalMinutes(value) {
  return Math.max(15, Math.min(1440, Math.floor(Number(value) || 480)));
}

function ensureUser(db, phone, name) {
  const displayName = mappedNickname(phone, name);
  if (!db.users[phone]) {
    db.users[phone] = {
      phone,
      name: displayName,
      avatar: "",
      background: "",
      goalText: "",
      dailyGoalMinutes: 480,
      joinedAt: new Date().toISOString(),
      openDays: [],
      records: [],
      friends: [],
    };
  } else if (name || NICKNAME_BY_PHONE[phone]) {
    db.users[phone].name = displayName;
  }
  db.users[phone].goalText ||= "";
  db.users[phone].dailyGoalMinutes = cleanGoalMinutes(db.users[phone].dailyGoalMinutes);
  db.users[phone].openDays ||= [];
  db.users[phone].records ||= [];
  db.users[phone].friends ||= [];
  return db.users[phone];
}

function totalSeconds(records, date = todayKey()) {
  return records
    .filter((record) => record.date === date)
    .reduce((sum, record) => sum + (Number(record.seconds) || 0), 0);
}

function resetOldManualFriends(user) {
  const today = todayKey();
  user.friends = user.friends.map((friend) => {
    if (!friend.phone && friend.date !== today) {
      return { ...friend, secondsToday: 0, date: today };
    }
    return friend;
  });
}

function publicRanking(db) {
  const rows = Object.values(db.users).map((user) => ({
    id: user.phone,
    name: user.name || "自习生",
    phone: user.phone,
    seconds: totalSeconds(user.records || []),
  }));
  return rows.sort((a, b) => b.seconds - a.seconds).slice(0, 20);
}

function friendRanking(db, user) {
  resetOldManualFriends(user);
  const rows = [
    {
      id: "me",
      name: user.name || "我",
      phone: user.phone,
      seconds: totalSeconds(user.records || []),
      note: "我的真实计时",
      isMe: true,
      canEdit: false,
    },
  ];

  for (const friend of user.friends || []) {
    if (friend.phone && db.users[friend.phone]) {
      const linked = db.users[friend.phone];
      rows.push({
        id: friend.id,
        name: linked.name || friend.name,
        phone: linked.phone,
        seconds: totalSeconds(linked.records || []),
        note: "已登录朋友",
        isMe: false,
        canEdit: false,
      });
    } else {
      rows.push({
        id: friend.id,
        name: friend.name,
        phone: "",
        seconds: Number(friend.secondsToday) || 0,
        note: "手动填写朋友",
        isMe: false,
        canEdit: true,
      });
    }
  }

  return rows.sort((a, b) => b.seconds - a.seconds);
}

function userState(db, user) {
  resetOldManualFriends(user);
  return {
    user: {
      phone: user.phone,
      name: user.name,
      avatar: user.avatar || "",
      background: user.background || "",
      goalText: user.goalText || "",
      dailyGoalMinutes: cleanGoalMinutes(user.dailyGoalMinutes),
      joinedAt: user.joinedAt,
    },
    openDays: user.openDays || [],
    records: user.records || [],
    friends: user.friends || [],
    friendRanking: friendRanking(db, user),
    publicRanking: publicRanking(db),
  };
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 20 * 1024 * 1024) throw new Error("请求内容太大");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") return send(res, 204, {});

  const db = await loadDb();
  const body = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) ? await readJson(req) : {};
  const phone = cleanPhone(body.phone || body.ownerPhone || url.searchParams.get("phone"));

  if (url.pathname === "/api/health") return send(res, 200, { ok: true });

  if (url.pathname === "/api/login" && req.method === "POST") {
    if (!validPhone(phone)) return send(res, 400, { error: "请输入正确的手机号" });
    const user = ensureUser(db, phone, body.name);
    const today = todayKey();
    if (!user.openDays.includes(today)) user.openDays.push(today);
    await saveDb(db);
    return send(res, 200, userState(db, user));
  }

  if (!validPhone(phone)) return send(res, 401, { error: "请先用手机号登录" });
  const user = ensureUser(db, phone);

  if (url.pathname === "/api/state" && req.method === "GET") {
    const today = todayKey();
    if (!user.openDays.includes(today)) user.openDays.push(today);
    await saveDb(db);
    return send(res, 200, userState(db, user));
  }

  if (url.pathname === "/api/profile" && req.method === "PUT") {
    user.name = mappedNickname(phone, body.name);
    user.avatar = String(body.avatar || "");
    user.background = String(body.background || "");
    user.goalText = cleanGoal(body.goalText);
    user.dailyGoalMinutes = cleanGoalMinutes(body.dailyGoalMinutes);
    await saveDb(db);
    return send(res, 200, userState(db, user));
  }

  if (url.pathname === "/api/records" && req.method === "POST") {
    const seconds = Math.max(0, Math.floor(Number(body.seconds) || 0));
    if (seconds < 30) return send(res, 400, { error: "学习时间少于 30 秒，不写入记录" });
    user.records.unshift({
      id: randomUUID(),
      date: todayKey(),
      topic: cleanName(body.topic, "自由学习"),
      mode: body.mode === "countup" ? "countup" : "countdown",
      seconds,
      startedAt: body.startedAt || new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    });
    await saveDb(db);
    return send(res, 200, userState(db, user));
  }

  if (url.pathname === "/api/friends" && req.method === "POST") {
    const friendPhone = cleanPhone(body.friend);
    const name = cleanName(body.friend, "朋友");
    const linkedUser = validPhone(friendPhone) ? db.users[friendPhone] : null;
    user.friends.push({
      id: randomUUID(),
      phone: linkedUser ? friendPhone : "",
      name: linkedUser ? linkedUser.name : name,
      secondsToday: linkedUser ? 0 : Math.max(0, Math.min(1440, Number(body.minutes) || 0)) * 60,
      date: todayKey(),
      updatedAt: new Date().toISOString(),
    });
    await saveDb(db);
    return send(res, 200, userState(db, user));
  }

  const friendMatch = url.pathname.match(/^\/api\/friends\/([^/]+)$/);
  if (friendMatch && req.method === "PATCH") {
    const friend = user.friends.find((item) => item.id === friendMatch[1]);
    if (!friend || friend.phone) return send(res, 404, { error: "这个朋友不能手动修改" });
    if (body.action === "reset") friend.secondsToday = 0;
    if (body.action === "add") friend.secondsToday = Math.min(24 * 60 * 60, (Number(friend.secondsToday) || 0) + 15 * 60);
    friend.date = todayKey();
    friend.updatedAt = new Date().toISOString();
    await saveDb(db);
    return send(res, 200, userState(db, user));
  }

  if (friendMatch && req.method === "DELETE") {
    user.friends = user.friends.filter((item) => item.id !== friendMatch[1]);
    await saveDb(db);
    return send(res, 200, userState(db, user));
  }

  send(res, 404, { error: "接口不存在" });
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = normalize(join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not file");
    res.writeHead(200, {
      "Content-Type": mime[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (error) {
    send(res, 500, { error: error.message || "服务器错误" });
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`赵四儿自习室后端已启动：http://0.0.0.0:${PORT}`);
});
