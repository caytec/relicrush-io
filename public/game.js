const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const join = document.getElementById("join");
const hud = document.getElementById("hud");
const upgrade = document.getElementById("upgrade");
const choices = document.getElementById("choices");
const toast = document.getElementById("toast");

let socket;
let currentState = null;
let previousState = null;
let myId = null;
let lastStateTime = performance.now();
let camera = { x: 0, y: 0 };
let mouse = { x: innerWidth / 2, y: innerHeight / 2 };
let keys = {};
let attackLatch = false;
let dashLatch = false;
let toastTimer = null;

const world = { w: 1800, h: 1800 };

const input = {
  up: false,
  down: false,
  left: false,
  right: false,
  attack: false,
  dash: false,
  aimX: 900,
  aimY: 900
};

function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);

  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

addEventListener("resize", resize);
resize();

function send(message) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function showToast(message, duration = 1600) {
  toast.textContent = message;
  toast.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.opacity = "0";
  }, duration);
}

function start() {
  const name = document.getElementById("name").value.trim() || "Adventurer";
  const room = document.getElementById("room").value.trim().toUpperCase() || "MAIN";
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";

  socket = new WebSocket(`${protocol}//${location.host}`);

  socket.addEventListener("open", () => {
    send({ type: "join", name, room });
  });

  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);

    if (message.type === "welcome") {
      myId = message.id;
      join.style.display = "none";
      hud.style.display = "block";
      showToast(message.message, 3500);
    }

    if (message.type === "state") {
      previousState = currentState;
      currentState = message;
      lastStateTime = performance.now();
      updateHud();
      showUpgradeIfNeeded();
    }

    if (message.type === "round") {
      showToast(message.message, 3000);
    }

    if (message.type === "roundEnd") {
      showToast(`${message.winner} wins the dungeon crown! New round soon.`, 6500);
    }

    if (message.type === "error") {
      showToast(message.message, 4000);
    }
  });

  socket.addEventListener("close", () => {
    showToast("Connection lost. Refresh to re-enter the dungeon.", 10000);
  });
}

document.getElementById("play").addEventListener("click", start);

document.getElementById("name").addEventListener("keydown", event => {
  if (event.key === "Enter") start();
});

addEventListener("keydown", event => {
  keys[event.key.toLowerCase()] = true;

  if (event.code === "Space") {
    event.preventDefault();
    dashLatch = true;
  }

  if (event.key.toLowerCase() === "f") {
    attackLatch = true;
  }
});

addEventListener("keyup", event => {
  keys[event.key.toLowerCase()] = false;
});

canvas.addEventListener("mousemove", event => {
  mouse.x = event.clientX;
  mouse.y = event.clientY;
});

canvas.addEventListener("mousedown", event => {
  if (event.button === 0) attackLatch = true;
});

function getMe() {
  return currentState?.players?.find(player => player.id === myId) || null;
}

function updateInput() {
  input.up = Boolean(keys.w || keys.arrowup);
  input.down = Boolean(keys.s || keys.arrowdown);
  input.left = Boolean(keys.a || keys.arrowleft);
  input.right = Boolean(keys.d || keys.arrowright);
  input.attack = attackLatch;
  input.dash = dashLatch;

  const me = getMe();

  if (me) {
    input.aimX = camera.x + mouse.x;
    input.aimY = camera.y + mouse.y;
  }

  send({ type: "input", input });

  attackLatch = false;
  dashLatch = false;
}

setInterval(updateInput, 50);

function interpolateEntity(id, collection) {
  const current = currentState?.[collection]?.find(entity => entity.id === id);
  const previous = previousState?.[collection]?.find(entity => entity.id === id);

  if (!current || !previous) return current;

  const alpha = Math.min(1, (performance.now() - lastStateTime) / 100);

  return {
    ...current,
    x: previous.x + (current.x - previous.x) * alpha,
    y: previous.y + (current.y - previous.y) * alpha
  };
}

function showUpgradeIfNeeded() {
  const me = getMe();

  if (!me || !me.pendingUpgrades) {
    upgrade.style.display = "none";
    return;
  }

  upgrade.style.display = "grid";
  choices.innerHTML = "";

  for (const item of me.pendingUpgrades) {
    const button = document.createElement("button");

    button.innerHTML = `<strong>${item.name}</strong><span>${item.description}</span>`;
    button.style.borderColor = item.color;

    button.addEventListener("click", () => {
      send({ type: "upgrade", id: item.id });
      upgrade.style.display = "none";
    });

    choices.appendChild(button);
  }
}

function updateHud() {
  if (!currentState) return;

  const me = getMe();
  if (!me) return;

  const seconds = Math.ceil(currentState.remaining / 1000);

  document.getElementById("roomLabel").textContent = `ROOM ${currentState.room}`;
  document.getElementById("timer").textContent =
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  document.getElementById("level").textContent = me.level;
  document.getElementById("score").textContent = me.score;
  document.getElementById("gold").textContent = me.gold;
  document.getElementById("hpBar").style.width =
    `${Math.max(0, me.hp / me.maxHp * 100)}%`;
  document.getElementById("xpBar").style.width =
    `${Math.max(0, me.xp / me.nextXp * 100)}%`;

  document.getElementById("leaders").innerHTML =
    currentState.leaderboard.slice(0, 6).map((player, index) => `
      <div class="leader ${player.id === myId ? "me" : ""}">
        <span>${index + 1}. ${escapeHtml(player.name)}</span>
        <b>${player.score}</b>
      </div>
    `).join("");
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[character]));
}

function draw() {
  requestAnimationFrame(draw);
  ctx.clearRect(0, 0, innerWidth, innerHeight);

  if (!currentState) {
    ctx.fillStyle = "#090b18";
    ctx.fillRect(0, 0, innerWidth, innerHeight);
    return;
  }

  const me = getMe();
  if (!me) return;

  camera.x = me.x - innerWidth / 2;
  camera.y = me.y - innerHeight / 2;
  camera.x = Math.max(0, Math.min(world.w - innerWidth, camera.x));
  camera.y = Math.max(0, Math.min(world.h - innerHeight, camera.y));

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  drawDungeon();
  drawBases();
  drawLoot();
  drawRelic();
  drawMonsters();
  drawPlayers();
  drawParticles();

  ctx.restore();
}

function drawDungeon() {
  ctx.fillStyle = "#10152a";
  ctx.fillRect(0, 0, world.w, world.h);

  ctx.strokeStyle = "rgba(127, 105, 190, .12)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= world.w; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, world.h);
    ctx.stroke();
  }

  for (let y = 0; y <= world.h; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(world.w, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#332b58";
  ctx.lineWidth = 12;
  ctx.strokeRect(18, 18, world.w - 36, world.h - 36);

  ctx.fillStyle = "rgba(120, 61, 177, .13)";
  ctx.beginPath();
  ctx.arc(world.w / 2, world.h / 2, 145, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#a990d6";
  ctx.font = "bold 14px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("CURSED VAULT", world.w / 2, world.h / 2 - 165);
}

function drawBases() {
  const bases = [
    { x: 115, y: 115, color: "#ff5d73" },
    { x: 1685, y: 115, color: "#55d6ff" },
    { x: 115, y: 1685, color: "#62e889" },
    { x: 1685, y: 1685, color: "#b88cff" }
  ];

  for (const base of bases) {
    ctx.beginPath();
    ctx.arc(base.x, base.y, 62, 0, Math.PI * 2);
    ctx.fillStyle = `${base.color}22`;
    ctx.fill();
    ctx.strokeStyle = base.color;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = base.color;
    ctx.font = "bold 11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("BANK RELIC", base.x, base.y + 4);
  }
}

function drawLoot() {
  for (const loot of currentState.loot) {
    ctx.save();
    ctx.translate(loot.x, loot.y);
    ctx.rotate(Math.PI / 4);

    ctx.fillStyle =
      loot.kind === "gold" ? "#ffd166" :
      loot.kind === "xp" ? "#b88cff" :
      loot.kind === "potion" ? "#62e889" :
      "#ff9f43";

    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = loot.rare ? 18 : 7;
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();
  }
}

function drawRelic() {
  const relic = currentState.relic;
  const pulse = 22 + Math.sin(performance.now() / 180) * 4;

  ctx.beginPath();
  ctx.arc(relic.x, relic.y, pulse, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,159,67,.16)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(relic.x, relic.y, 13, 0, Math.PI * 2);
  ctx.fillStyle = "#ff9f43";
  ctx.shadowColor = "#ff9f43";
  ctx.shadowBlur = 22;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#fff4c4";
  ctx.font = "bold 12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(relic.carrierId ? "CARRIED" : "RELIC", relic.x, relic.y - 28);
}

function drawMonsters() {
  for (const monster of currentState.monsters) {
    const current = interpolateEntity(monster.id, "monsters") || monster;

    ctx.fillStyle = monster.elite ? "#d95dff" : "#8b4d70";
    ctx.beginPath();
    ctx.arc(current.x, current.y, monster.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#21152b";
    ctx.beginPath();
    ctx.arc(current.x - 6, current.y - 3, 3, 0, Math.PI * 2);
    ctx.arc(current.x + 6, current.y - 3, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#27172e";
    ctx.fillRect(current.x - 24, current.y - monster.radius - 10, 48, 5);
    ctx.fillStyle = "#ff5d73";
    ctx.fillRect(
      current.x - 24,
      current.y - monster.radius - 10,
      48 * monster.hp / monster.maxHp,
      5
    );
  }
}

function drawPlayers() {
  for (const player of currentState.players) {
    if (player.respawnAt) continue;

    const current = interpolateEntity(player.id, "players") || player;

    ctx.save();
    ctx.globalAlpha = player.id === myId ? 1 : .9;

    ctx.beginPath();
    ctx.arc(current.x, current.y, 25, 0, Math.PI * 2);
    ctx.fillStyle = `${player.color}22`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(current.x, current.y, 18, 0, Math.PI * 2);
    ctx.fillStyle = player.color;
    ctx.fill();

    if (player.id === myId) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    if (currentState.relic.carrierId === player.id) {
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(current.x, current.y, 28, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(player.name, current.x, current.y - 30);

    ctx.fillStyle = "#241a35";
    ctx.fillRect(current.x - 22, current.y + 24, 44, 5);
    ctx.fillStyle = "#62e889";
    ctx.fillRect(
      current.x - 22,
      current.y + 24,
      44 * player.hp / player.maxHp,
      5
    );

    ctx.restore();
  }
}

function drawParticles() {
  for (const particle of currentState.particles || []) {
    const age = Math.min(1, (Date.now() - particle.born) / 900);

    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = particle.color;
    ctx.font = "bold 13px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(particle.text, particle.x, particle.y - age * 30);
  }

  ctx.globalAlpha = 1;
}

draw();
