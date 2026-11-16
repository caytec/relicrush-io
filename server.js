const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 3000;
const TICK_RATE = 20;
const SNAPSHOT_RATE = 10;
const WORLD = 1800;
const MATCH_LENGTH = 180000;
const MAX_PLAYERS = 12;
const BOT_TARGET = 6;

const app = express();
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

app.get("/play", (req, res) => {
  res.sendFile("play.html", { root: "public" });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    game: "Relic Rush.io",
    rooms: rooms.size,
    time: Date.now()
  });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const rooms = new Map();

const COLORS = [
  "#ff5d73", "#55d6ff", "#ffd166", "#b88cff",
  "#62e889", "#ff9f43", "#f78fb3", "#70a1ff",
  "#c8ff5d", "#a29bfe", "#ff7675", "#00cec9"
];

const UPGRADE_POOL = [
  { id: "blade", name: "Brutal Blade", description: "+25% attack damage", color: "#ff6b6b" },
  { id: "swift", name: "Swift Boots", description: "+18% movement speed", color: "#55d6ff" },
  { id: "vitality", name: "Stone Heart", description: "+35 maximum health", color: "#62e889" },
  { id: "reach", name: "Long Arm", description: "+35 attack range", color: "#ffd166" },
  { id: "dash", name: "Flame Dash", description: "Dash damages nearby enemies", color: "#ff9f43" },
  { id: "fortune", name: "Lucky Pouch", description: "Gold pickups are worth 50% more", color: "#b88cff" },
  { id: "vampire", name: "Vampiric Edge", description: "Attacks heal 5 health", color: "#f78fb3" },
  { id: "cooldown", name: "Quick Hands", description: "Attack cooldown reduced by 20%", color: "#70a1ff" }
];

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(5).toString("hex")}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function choose(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function safeName(value) {
  return String(value || "Adventurer")
    .replace(/[^\w \-!]/g, "")
    .trim()
    .slice(0, 18) || "Adventurer";
}

function makeRoom(code) {
  const room = {
    code,
    createdAt: Date.now(),
    lastTick: Date.now(),
    lastSnapshot: 0,
    round: 1,
    roundStarted: Date.now(),
    finishedUntil: 0,
    players: new Map(),
    monsters: new Map(),
    loot: new Map(),
    particles: [],
    colorIndex: 0,
    relic: {
      id: id("relic"),
      x: WORLD / 2,
      y: WORLD / 2,
      homeX: WORLD / 2,
      homeY: WORLD / 2,
      carrierId: null,
      ownerId: null,
      value: 500
    }
  };

  for (let i = 0; i < 18; i++) spawnLoot(room);
  for (let i = 0; i < 9; i++) spawnMonster(room);
  rooms.set(code, room);
  return room;
}

function getRoom(code) {
  const clean = String(code || "MAIN")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 12) || "MAIN";

  return rooms.get(clean) || makeRoom(clean);
}

function spawnPoint() {
  const angle = Math.random() * Math.PI * 2;
  const radius = random(500, 760);

  return {
    x: clamp(WORLD / 2 + Math.cos(angle) * radius, 80, WORLD - 80),
    y: clamp(WORLD / 2 + Math.sin(angle) * radius, 80, WORLD - 80)
  };
}

function spawnLoot(room) {
  const point = spawnPoint();
  const rare = Math.random() < 0.1;

  const loot = {
    id: id("loot"),
    x: point.x,
    y: point.y,
    kind: rare ? "relic" : choose(["gold", "gold", "xp", "potion"]),
    value: rare ? 100 : Math.floor(random(15, 45)),
    rare
  };

  room.loot.set(loot.id, loot);
}

function spawnMonster(room) {
  const point = spawnPoint();
  const elite = Math.random() < 0.16;

  const monster = {
    id: id("monster"),
    x: point.x,
    y: point.y,
    hp: elite ? 100 : 48,
    maxHp: elite ? 100 : 48,
    radius: elite ? 25 : 18,
    speed: elite ? 70 : 52,
    damage: elite ? 18 : 10,
    elite,
    attackAt: 0
  };

  room.monsters.set(monster.id, monster);
}

function baseFor(player) {
  const margin = 115;

  if (player.base === 0) return { x: margin, y: margin };
  if (player.base === 1) return { x: WORLD - margin, y: margin };
  if (player.base === 2) return { x: margin, y: WORLD - margin };
  return { x: WORLD - margin, y: WORLD - margin };
}

function newPlayer(room, ws, name, bot) {
  const player = {
    id: id(bot ? "bot" : "player"),
    name: safeName(name),
    bot: Boolean(bot),
    ws,
    color: COLORS[room.colorIndex++ % COLORS.length],
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 18,
    hp: 100,
    maxHp: 100,
    gold: 0,
    score: 0,
    level: 1,
    xp: 0,
    nextXp: 100,
    kills: 0,
    deaths: 0,
    relics: 0,
    upgrades: [],
    pendingUpgrades: null,
    input: {
      up: false,
      down: false,
      left: false,
      right: false,
      attack: false,
      dash: false,
      aimX: WORLD / 2,
      aimY: WORLD / 2
    },
    attackReady: 0,
    dashReady: 0,
    invulnerableUntil: 0,
    respawnAt: 0,
    connected: true,
    base: room.players.size % 4,
    extractionScore: 0
  };

  const point = baseFor(player);
  player.x = point.x;
  player.y = point.y;
  room.players.set(player.id, player);
  return player;
}

function addBot(room) {
  if (room.players.size >= BOT_TARGET) return;

  const bot = newPlayer(room, null, choose([
    "Goblin Accountant",
    "Mira the Mild",
    "Tax Collector",
    "Definitely A Bot",
    "Cursed Chicken",
    "Sir Lootsalot"
  ]), true);

  bot.gold = Math.floor(random(0, 30));
}

function removePlayer(room, player) {
  if (room.relic.carrierId === player.id) {
    room.relic.carrierId = null;
    room.relic.ownerId = null;
    room.relic.x = player.x;
    room.relic.y = player.y;
  }

  room.players.delete(player.id);
}

function send(ws, message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function broadcast(room, message) {
  const data = JSON.stringify(message);

  for (const player of room.players.values()) {
    if (!player.bot && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(data);
    }
  }
}

function addParticle(room, x, y, color, text) {
  room.particles.push({
    id: id("particle"),
    x,
    y,
    color,
    text,
    born: Date.now()
  });
}

function randomUpgrades() {
  const available = UPGRADE_POOL.slice();
  const result = [];

  while (result.length < 3 && available.length) {
    result.push(available.splice(
      Math.floor(Math.random() * available.length),
      1
    )[0]);
  }

  return result;
}

function awardXp(room, player, amount) {
  player.xp += amount;

  while (player.xp >= player.nextXp) {
    player.xp -= player.nextXp;
    player.level++;
    player.nextXp = Math.floor(player.nextXp * 1.25);
    player.hp = player.maxHp;
    player.pendingUpgrades = randomUpgrades();
    addParticle(room, player.x, player.y - 28, "#ffd166", "LEVEL UP!");
  }
}

function hasUpgrade(player, upgradeId) {
  return player.upgrades.includes(upgradeId);
}

function applyUpgrade(player, upgradeId) {
  if (!UPGRADE_POOL.some(upgrade => upgrade.id === upgradeId)) return false;
  if (player.upgrades.includes(upgradeId)) return false;

  player.upgrades.push(upgradeId);

  if (upgradeId === "vitality") {
    player.maxHp += 35;
    player.hp = player.maxHp;
  }

  return true;
}

function damagePlayer(room, victim, amount, attacker) {
  if (Date.now() < victim.invulnerableUntil || victim.respawnAt) return;

  victim.hp -= amount;

  if (victim.hp > 0) return;

  victim.hp = 0;
  victim.deaths++;

  if (attacker) {
    attacker.kills++;
    attacker.score += 75;
    awardXp(room, attacker, 45);
    addParticle(room, attacker.x, attacker.y - 35, "#ffda79", "+75 KO");
  }

  if (room.relic.carrierId === victim.id) {
    room.relic.carrierId = null;
    room.relic.ownerId = null;
    room.relic.x = victim.x;
    room.relic.y = victim.y;
    addParticle(room, victim.x, victim.y, "#ff5d73", "RELIC DROPPED");
  }

  victim.gold = Math.floor(victim.gold * 0.55);
  victim.respawnAt = Date.now() + 3000;
  victim.x = -100;
  victim.y = -100;
  addParticle(room, victim.x, victim.y, "#ff5d73", "DOWN!");
}

function attack(room, player, now) {
  const cooldown = hasUpgrade(player, "cooldown") ? 320 : 400;
  if (now < player.attackReady || player.respawnAt) return;

  player.attackReady = now + cooldown;

  const dx = player.input.aimX - player.x;
  const dy = player.input.aimY - player.y;
  const length = Math.hypot(dx, dy) || 1;
  const range = hasUpgrade(player, "reach") ? 180 : 145;
  const damage = hasUpgrade(player, "blade") ? 30 : 24;
  const hitX = player.x + dx / length * range;
  const hitY = player.y + dy / length * range;

  for (const monster of room.monsters.values()) {
    if (Math.hypot(monster.x - hitX, monster.y - hitY) >= monster.radius + 30) {
      continue;
    }

    monster.hp -= damage;

    if (hasUpgrade(player, "vampire")) {
      player.hp = Math.min(player.maxHp, player.hp + 5);
    }

    addParticle(room, monster.x, monster.y, "#fff1a8", `${damage}`);

    if (monster.hp <= 0) {
      player.score += monster.elite ? 100 : 30;
      player.gold += monster.elite ? 60 : 18;
      awardXp(room, player, monster.elite ? 65 : 25);
      room.monsters.delete(monster.id);
      addParticle(
        room,
        monster.x,
        monster.y,
        "#ffd166",
        monster.elite ? "ELITE DOWN" : "+GOLD"
      );
    }
  }

  for (const other of room.players.values()) {
    if (other.id === player.id || other.respawnAt) continue;

    if (Math.hypot(other.x - hitX, other.y - hitY) < other.radius + 30) {
      damagePlayer(room, other, damage, player);

      if (hasUpgrade(player, "vampire")) {
        player.hp = Math.min(player.maxHp, player.hp + 5);
      }
    }
  }

  addParticle(room, hitX, hitY, "#ffffff", "✦");
}

function dash(room, player, now) {
  if (now < player.dashReady || player.respawnAt) return;

  player.dashReady = now + 2200;

  let dx = player.input.aimX - player.x;
  let dy = player.input.aimY - player.y;
  const length = Math.hypot(dx, dy) || 1;

  dx /= length;
  dy /= length;

  player.x = clamp(player.x + dx * 170, 25, WORLD - 25);
  player.y = clamp(player.y + dy * 170, 25, WORLD - 25);
  player.invulnerableUntil = now + 350;

  if (hasUpgrade(player, "dash")) {
    for (const monster of room.monsters.values()) {
      if (distance(player, monster) < 80) {
        monster.hp -= 45;
        addParticle(room, monster.x, monster.y, "#ff9f43", "BURN");
      }
    }

    for (const other of room.players.values()) {
      if (other.id !== player.id && distance(player, other) < 65) {
        damagePlayer(room, other, 28, player);
      }
    }
  }

  addParticle(room, player.x, player.y, "#55d6ff", "DASH");
}

function updateBotInput(room, bot) {
  const living = [...room.players.values()]
    .filter(player => !player.respawnAt && player.id !== bot.id)
    .sort((a, b) => distance(bot, a) - distance(bot, b));

  let target = living[0];

  if (room.relic.carrierId === bot.id) {
    target = baseFor(bot);
  } else if (!target || Math.random() < 0.025) {
    target = { x: room.relic.x, y: room.relic.y };
  }

  bot.input.up = target.y < bot.y - 12;
  bot.input.down = target.y > bot.y + 12;
  bot.input.left = target.x < bot.x - 12;
  bot.input.right = target.x > bot.x + 12;
  bot.input.aimX = target.x;
  bot.input.aimY = target.y;
  bot.input.attack = Math.random() < 0.2;
  bot.input.dash = Math.random() < 0.015;
}

function collectLoot(room, player) {
  for (const loot of room.loot.values()) {
    if (distance(player, loot) > player.radius + 18) continue;

    if (loot.kind === "gold") {
      const amount = hasUpgrade(player, "fortune")
        ? Math.floor(loot.value * 1.5)
        : loot.value;

      player.gold += amount;
      player.score += amount;
      awardXp(room, player, 5);
      addParticle(room, loot.x, loot.y, "#ffd166", `+${amount}g`);
    } else if (loot.kind === "xp") {
      awardXp(room, player, 22);
      addParticle(room, loot.x, loot.y, "#b88cff", "+XP");
    } else if (loot.kind === "potion") {
      player.hp = Math.min(player.maxHp, player.hp + 30);
      addParticle(room, loot.x, loot.y, "#62e889", "+HP");
    } else {
      player.score += 120;
      player.gold += loot.value;
      awardXp(room, player, 60);
      addParticle(room, loot.x, loot.y, "#ff9f43", "RARE RELIC!");
    }

    room.loot.delete(loot.id);
    break;
  }
}

function relicLogic(room, player) {
  const relic = room.relic;

  if (relic.carrierId === player.id) {
    relic.x = player.x;
    relic.y = player.y;

    if (distance(player, baseFor(player)) < 75) {
      relic.carrierId = null;
      relic.ownerId = player.id;
      relic.x = relic.homeX;
      relic.y = relic.homeY;
      player.relics++;
      player.score += relic.value;
      player.gold += relic.value;
      player.extractionScore += relic.value;
      awardXp(room, player, 100);
      addParticle(room, player.x, player.y, "#ffd166", "RELIC BANKED!");
    }

    return;
  }

  if (!relic.carrierId && distance(player, relic) < 45) {
    relic.carrierId = player.id;
    relic.ownerId = null;
    addParticle(room, player.x, player.y, "#ff9f43", "RELIC STOLEN!");
  }
}

function updatePlayer(room, player, dt, now) {
  if (player.respawnAt) {
    if (now >= player.respawnAt) {
      const point = baseFor(player);
      player.x = point.x;
      player.y = point.y;
      player.hp = player.maxHp;
      player.respawnAt = 0;
      player.invulnerableUntil = now + 1200;
      addParticle(room, player.x, player.y, "#62e889", "RESPAWN");
    }

    return;
  }

  if (player.input.attack) {
    player.input.attack = false;
    attack(room, player, now);
  }

  if (player.input.dash) {
    player.input.dash = false;
    dash(room, player, now);
  }

  let dx = 0;
  let dy = 0;

  if (player.input.left) dx--;
  if (player.input.right) dx++;
  if (player.input.up) dy--;
  if (player.input.down) dy++;

  const length = Math.hypot(dx, dy) || 1;
  const speed = hasUpgrade(player, "swift") ? 245 : 205;

  player.vx = dx / length * speed;
  player.vy = dy / length * speed;
  player.x = clamp(player.x + player.vx * dt, 25, WORLD - 25);
  player.y = clamp(player.y + player.vy * dt, 25, WORLD - 25);

  collectLoot(room, player);
  relicLogic(room, player);
}

function updateMonsters(room, dt, now) {
  for (const monster of room.monsters.values()) {
    let target = null;
    let closest = 300;

    for (const player of room.players.values()) {
      if (player.respawnAt) continue;

      const currentDistance = distance(monster, player);

      if (currentDistance < closest) {
        closest = currentDistance;
        target = player;
      }
    }

    if (!target) continue;

    const dx = target.x - monster.x;
    const dy = target.y - monster.y;
    const length = Math.hypot(dx, dy) || 1;

    if (closest > monster.radius + target.radius + 8) {
      monster.x += dx / length * monster.speed * dt;
      monster.y += dy / length * monster.speed * dt;
    } else if (now >= monster.attackAt) {
      monster.attackAt = now + 900;
      damagePlayer(room, target, monster.damage, null);
      addParticle(room, target.x, target.y, "#ff5d73", `-${monster.damage}`);
    }
  }
}

function leaderboard(room) {
  return [...room.players.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(player => ({
      id: player.id,
      name: player.name,
      score: player.score,
      gold: player.gold,
      level: player.level,
      kills: player.kills,
      relics: player.relics,
      color: player.color
    }));
}

function restartRound(room, now) {
  room.round++;
  room.roundStarted = now;
  room.finishedUntil = 0;
  room.monsters.clear();
  room.loot.clear();
  room.particles.length = 0;

  room.relic.carrierId = null;
  room.relic.ownerId = null;
  room.relic.x = room.relic.homeX;
  room.relic.y = room.relic.homeY;

  for (let i = 0; i < 18; i++) spawnLoot(room);
  for (let i = 0; i < 9; i++) spawnMonster(room);

  for (const player of room.players.values()) {
    const point = baseFor(player);

    player.x = point.x;
    player.y = point.y;
    player.hp = player.maxHp;
    player.gold = 0;
    player.score = 0;
    player.level = 1;
    player.xp = 0;
    player.nextXp = 100;
    player.kills = 0;
    player.deaths = 0;
    player.relics = 0;
    player.upgrades = [];
    player.pendingUpgrades = null;
    player.respawnAt = 0;
    player.extractionScore = 0;
  }

  broadcast(room, {
    type: "round",
    round: room.round,
    message: "A new dungeon run begins!"
  });
}

function snapshot(room, now) {
  return {
    type: "state",
    room: room.code,
    round: room.round,
    remaining: Math.max(0, MATCH_LENGTH - (now - room.roundStarted)),
    relic: {
      id: room.relic.id,
      x: room.relic.x,
      y: room.relic.y,
      carrierId: room.relic.carrierId,
      ownerId: room.relic.ownerId
    },
    players: [...room.players.values()].map(player => ({
      id: player.id,
      name: player.name,
      x: player.x,
      y: player.y,
      hp: player.hp,
      maxHp: player.maxHp,
      gold: player.gold,
      score: player.score,
      level: player.level,
      xp: player.xp,
      nextXp: player.nextXp,
      kills: player.kills,
      deaths: player.deaths,
      relics: player.relics,
      upgrades: player.upgrades,
      pendingUpgrades: player.pendingUpgrades || null,
      color: player.color,
      base: player.base,
      respawnAt: player.respawnAt,
      bot: player.bot
    })),
    monsters: [...room.monsters.values()].map(monster => ({
      id: monster.id,
      x: monster.x,
      y: monster.y,
      hp: monster.hp,
      maxHp: monster.maxHp,
      radius: monster.radius,
      elite: monster.elite
    })),
    loot: [...room.loot.values()].map(loot => ({
      id: loot.id,
      x: loot.x,
      y: loot.y,
      kind: loot.kind,
      value: loot.value,
      rare: loot.rare
    })),
    particles: room.particles,
    leaderboard: leaderboard(room)
  };
}

wss.on("connection", ws => {
  let room = null;
  let player = null;

  ws.on("message", raw => {
    let message;

    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type === "join") {
      if (player) return;

      room = getRoom(message.room);

      const humanCount = [...room.players.values()]
        .filter(existing => !existing.bot).length;

      if (humanCount >= MAX_PLAYERS) {
        send(ws, { type: "error", message: "That room is full." });
        return;
      }

      player = newPlayer(room, ws, message.name, false);

      send(ws, {
        type: "welcome",
        id: player.id,
        room: room.code,
        color: player.color,
        message: `Welcome to ${room.code}. Find the relic, then bank it at your glowing base.`
      });

      return;
    }

    if (!player || !room) return;

    if (message.type === "input") {
      const input = message.input || {};

      player.input.up = Boolean(input.up);
      player.input.down = Boolean(input.down);
      player.input.left = Boolean(input.left);
      player.input.right = Boolean(input.right);
      player.input.aimX = clamp(Number(input.aimX) || player.x, 0, WORLD);
      player.input.aimY = clamp(Number(input.aimY) || player.y, 0, WORLD);

      if (input.attack) player.input.attack = true;
      if (input.dash) player.input.dash = true;
    }

    if (message.type === "upgrade") {
      if (player.pendingUpgrades && applyUpgrade(player, message.id)) {
        player.pendingUpgrades = null;
      }
    }
  });

  ws.on("close", () => {
    if (player && room) removePlayer(room, player);
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    const humans = [...room.players.values()].filter(player => !player.bot).length;

    while (room.players.size < BOT_TARGET && humans > 0) {
      addBot(room);
    }

    if (room.players.size === 0 && Date.now() - room.createdAt > 120000) {
      rooms.delete(room.code);
    }
  }
}, 1000);

setInterval(() => {
  const now = Date.now();

  for (const room of rooms.values()) {
    const dt = Math.min(0.1, (now - room.lastTick) / 1000);
    room.lastTick = now;

    if (room.finishedUntil) {
      if (now >= room.finishedUntil) restartRound(room, now);
      continue;
    }

    for (const player of room.players.values()) {
      if (player.bot) updateBotInput(room, player);
      updatePlayer(room, player, dt, now);
    }

    updateMonsters(room, dt, now);

    if (now - room.roundStarted >= MATCH_LENGTH) {
      room.finishedUntil = now + 7000;

      const winner = [...room.players.values()]
        .sort((a, b) => b.score - a.score)[0];

      broadcast(room, {
        type: "roundEnd",
        winner: winner ? winner.name : "Nobody",
        leaderboard: leaderboard(room),
        nextRoundIn: 7
      });
    }

    while (room.monsters.size < 9) spawnMonster(room);
    while (room.loot.size < 18) spawnLoot(room);

    room.particles = room.particles.filter(
      particle => now - particle.born < 900
    );
  }
}, 1000 / TICK_RATE);

setInterval(() => {
  const now = Date.now();

  for (const room of rooms.values()) {
    if (now - room.lastSnapshot < 1000 / SNAPSHOT_RATE) continue;

    room.lastSnapshot = now;
    broadcast(room, snapshot(room, now));
  }
}, 1000 / SNAPSHOT_RATE);

server.listen(PORT, () => {
  console.log(`Relic Rush.io listening on port ${PORT}`);
});
