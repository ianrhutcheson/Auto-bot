const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlayEl = document.getElementById("overlay");
const gameoverEl = document.getElementById("gameover");
const finalScoreEl = document.getElementById("final-score");
const startBtn = document.getElementById("start-btn");
const restartBtn = document.getElementById("restart-btn");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const SETTINGS = {
  gravity: 2200,
  moveSpeed: 320,
  jumpVelocity: 900,
  springVelocity: 1350,
  scrollThreshold: HEIGHT * 0.4,
  platformWidth: 110,
  platformHeight: 22,
  platformGapMin: 70,
  platformGapMax: 130,
  maxPlatforms: 14,
};

const ASSET_PATHS = {
  playerSheet: "assets/player_sheet.png",
  player: "assets/player.png",
  platform: "assets/platform.png",
  platformMoving: "assets/platform_moving.png",
  spring: "assets/spring.png",
  background: "assets/background.png",
};

const assets = {
  ready: false,
  images: {},
};

const input = {
  left: false,
  right: false,
  pointerActive: false,
  pointerX: 0,
};

const rng = mulberry32(428202);

const state = {
  mode: "menu",
  score: 0,
  best: Number(localStorage.getItem("doodleBest") || 0),
  time: 0,
  player: {
    x: WIDTH / 2,
    y: HEIGHT - 120,
    vx: 0,
    vy: 0,
    w: 62,
    h: 68,
    squashTimer: 0,
    blinkTimer: 0,
    nextBlinkTime: 0,
  },
  platforms: [],
  puffs: [],
  streaks: [],
  manualStep: false,
};

bestEl.textContent = `Best: ${state.best}`;

function initGame() {
  state.score = 0;
  state.time = 0;
  state.player.x = WIDTH / 2;
  state.player.y = HEIGHT - 120;
  state.player.vx = 0;
  state.player.vy = -SETTINGS.jumpVelocity * 0.7;
  state.player.squashTimer = 0;
  state.player.blinkTimer = 0;
  state.player.nextBlinkTime = randRange(1.6, 3.2);
  state.platforms = [];
  state.puffs = [];
  state.streaks = [];

  let y = HEIGHT - 40;
  while (state.platforms.length < SETTINGS.maxPlatforms) {
    const gap = randRange(SETTINGS.platformGapMin, SETTINGS.platformGapMax);
    y -= gap;
    state.platforms.push(createPlatform(y));
  }
}

function createPlatform(y) {
  const type = rng() < 0.22 ? "moving" : "static";
  const width = SETTINGS.platformWidth;
  return {
    x: randRange(20, WIDTH - width - 20),
    y,
    w: width,
    h: SETTINGS.platformHeight,
    type,
    vx: type === "moving" ? randRange(50, 110) * (rng() > 0.5 ? 1 : -1) : 0,
    hasSpring: rng() < 0.15,
    springUsed: false,
  };
}

function update(dt) {
  if (state.mode !== "playing") {
    return;
  }

  state.time += dt;
  const player = state.player;
  if (player.blinkTimer > 0) {
    player.blinkTimer = Math.max(0, player.blinkTimer - dt);
  }
  if (state.time >= player.nextBlinkTime) {
    player.blinkTimer = 0.12;
    player.nextBlinkTime = state.time + randRange(2.4, 4.6);
  }
  const moveDirection = getMoveDirection();
  player.vx = moveDirection * SETTINGS.moveSpeed;

  player.vy += SETTINGS.gravity * dt;
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  wrapPlayer(player);

  for (const platform of state.platforms) {
    if (platform.type === "moving") {
      platform.x += platform.vx * dt;
      if (platform.x <= 12 || platform.x + platform.w >= WIDTH - 12) {
        platform.vx *= -1;
        platform.x = clamp(platform.x, 12, WIDTH - platform.w - 12);
      }
    }
  }

  if (player.vy > 0) {
    for (const platform of state.platforms) {
      if (checkLanding(player, platform, dt)) {
        const jumpPower =
          platform.hasSpring && !platform.springUsed
            ? SETTINGS.springVelocity
            : SETTINGS.jumpVelocity;
        if (platform.hasSpring) {
          platform.springUsed = true;
          spawnBoostStreaks(player);
        }
        player.vy = -jumpPower;
        player.squashTimer = 0.12;
        spawnPuff(platform);
        break;
      }
    }
  }

  if (player.y < SETTINGS.scrollThreshold) {
    const diff = SETTINGS.scrollThreshold - player.y;
    player.y = SETTINGS.scrollThreshold;
    for (const platform of state.platforms) {
      platform.y += diff;
    }
    state.score += diff;
  }

  state.platforms = state.platforms.filter(
    (platform) => platform.y < HEIGHT + 140
  );

  ensurePlatforms();

  if (player.y > HEIGHT + 120) {
    endGame();
  }

  if (player.squashTimer > 0) {
    player.squashTimer = Math.max(0, player.squashTimer - dt);
  }

  updatePuffs(dt);
  updateStreaks(dt);
}

function ensurePlatforms() {
  let minY = Math.min(...state.platforms.map((p) => p.y));
  while (state.platforms.length < SETTINGS.maxPlatforms || minY > -200) {
    const gap = randRange(SETTINGS.platformGapMin, SETTINGS.platformGapMax);
    const nextY = minY - gap;
    state.platforms.push(createPlatform(nextY));
    minY = nextY;
  }
}

function render() {
  drawBackground();

  for (const platform of state.platforms) {
    drawPlatform(platform);
  }

  drawPuffs();
  drawStreaks();
  drawPlayer(state.player);

  scoreEl.textContent = `Score: ${Math.floor(state.score)}`;
  bestEl.textContent = `Best: ${state.best}`;
}

function drawBackground() {
  if (assets.images.background) {
    const img = assets.images.background;
    const pattern = ctx.createPattern(img, "repeat");
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, "#1b2a4d");
    gradient.addColorStop(0.6, "#0c1328");
    gradient.addColorStop(1, "#070a18");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let i = 0; i < 40; i += 1) {
    const x = (i * 79 + 120) % WIDTH;
    const y = (i * 143 + 30) % HEIGHT;
    ctx.beginPath();
    ctx.arc(x, y, (i % 3) + 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlatform(platform) {
  if (platform.type === "moving" && assets.images.platformMoving) {
    ctx.drawImage(assets.images.platformMoving, platform.x, platform.y, platform.w, platform.h);
  } else if (platform.type === "static" && assets.images.platform) {
    ctx.drawImage(assets.images.platform, platform.x, platform.y, platform.w, platform.h);
  } else {
    ctx.fillStyle = platform.type === "moving" ? "#f6a04a" : "#64e1a5";
    ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.strokeRect(platform.x, platform.y, platform.w, platform.h);
  }

  if (platform.hasSpring && !platform.springUsed) {
    const springW = 24;
    const springH = 26;
    const springX = platform.x + platform.w / 2 - springW / 2;
    const springY = platform.y - springH + 4;
    if (assets.images.spring) {
      ctx.drawImage(assets.images.spring, springX, springY, springW, springH);
    } else {
      ctx.fillStyle = "#ffd86b";
      ctx.fillRect(springX, springY, springW, springH);
    }
  }
}

function spawnPuff(platform) {
  const count = 4 + Math.floor(rng() * 3);
  const baseX = platform.x + platform.w / 2;
  const baseY = platform.y + 2;
  for (let i = 0; i < count; i += 1) {
    const angle = randRange(-Math.PI, 0);
    const speed = randRange(30, 90);
    state.puffs.push({
      x: baseX + randRange(-18, 18),
      y: baseY + randRange(-4, 6),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.5 - randRange(10, 40),
      r: randRange(4, 9),
      life: randRange(0.35, 0.55),
      maxLife: randRange(0.35, 0.55),
    });
  }
}

function updatePuffs(dt) {
  state.puffs = state.puffs.filter((puff) => {
    puff.life -= dt;
    puff.x += puff.vx * dt;
    puff.y += puff.vy * dt;
    puff.vy += 120 * dt;
    puff.vx *= 0.98;
    return puff.life > 0;
  });
}

function drawPuffs() {
  for (const puff of state.puffs) {
    const alpha = clamp(puff.life / puff.maxLife, 0, 1);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.28 * alpha})`;
    ctx.beginPath();
    ctx.arc(puff.x, puff.y, puff.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function spawnBoostStreaks(player) {
  const count = 10;
  for (let i = 0; i < count; i += 1) {
    state.streaks.push({
      x: player.x + randRange(-10, 10),
      y: player.y + player.h * 0.35,
      vx: randRange(-40, 40),
      vy: randRange(220, 360),
      life: randRange(0.22, 0.36),
      maxLife: randRange(0.22, 0.36),
      length: randRange(10, 22),
    });
  }
}

function updateStreaks(dt) {
  state.streaks = state.streaks.filter((streak) => {
    streak.life -= dt;
    streak.x += streak.vx * dt;
    streak.y += streak.vy * dt;
    streak.vy += 40 * dt;
    return streak.life > 0;
  });
}

function drawStreaks() {
  ctx.lineCap = "round";
  for (const streak of state.streaks) {
    const alpha = clamp(streak.life / streak.maxLife, 0, 1);
    const speed = Math.hypot(streak.vx, streak.vy) || 1;
    const dx = (streak.vx / speed) * streak.length;
    const dy = (streak.vy / speed) * streak.length;
    ctx.strokeStyle = `rgba(120, 216, 255, ${0.65 * alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(streak.x, streak.y);
    ctx.lineTo(streak.x - dx, streak.y - dy);
    ctx.stroke();
  }
}

function getPlayerFrame(player) {
  if (player.blinkTimer > 0) {
    return 1;
  }
  if (player.vy < -160) {
    return 2 + (Math.floor(state.time * 12) % 2);
  }
  return 0;
}

function drawPlayer(player) {
  const bob = Math.sin(state.time * 6) * 2.5;
  const tilt = clamp(player.vx / SETTINGS.moveSpeed, -1, 1) * 0.22;
  const riseFactor = clamp(-player.vy / 1600, 0, 0.14);
  const fallFactor = clamp(player.vy / 1600, 0, 0.12);
  const squashProgress = player.squashTimer / 0.12;

  const stretchY = 1 + riseFactor * 0.9 - fallFactor * 0.35 - squashProgress * 0.15;
  const stretchX = 1 - riseFactor * 0.4 + fallFactor * 0.45 + squashProgress * 0.22;

  ctx.save();
  ctx.translate(player.x, player.y + bob);
  ctx.rotate(tilt);
  ctx.scale(stretchX, stretchY);

  if (assets.images.playerSheet) {
    const sheet = assets.images.playerSheet;
    const cols = 2;
    const rows = 2;
    const frame = getPlayerFrame(player);
    const frameW = sheet.width / cols;
    const frameH = sheet.height / rows;
    const sx = (frame % cols) * frameW;
    const sy = Math.floor(frame / cols) * frameH;
    ctx.drawImage(
      sheet,
      sx,
      sy,
      frameW,
      frameH,
      -player.w / 2,
      -player.h / 2,
      player.w,
      player.h
    );
  } else if (assets.images.player) {
    ctx.drawImage(
      assets.images.player,
      -player.w / 2,
      -player.h / 2,
      player.w,
      player.h
    );
  } else {
    ctx.fillStyle = "#9aa7ff";
    ctx.beginPath();
    ctx.ellipse(0, 0, player.w / 2, player.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function checkLanding(player, platform, dt) {
  const playerBottom = player.y + player.h / 2;
  const prevBottom = playerBottom - player.vy * dt;
  const platformTop = platform.y;

  const withinX =
    player.x + player.w / 2 > platform.x + 6 &&
    player.x - player.w / 2 < platform.x + platform.w - 6;

  const crossed = prevBottom <= platformTop && playerBottom >= platformTop;

  return withinX && crossed;
}

function wrapPlayer(player) {
  if (player.x < -player.w / 2) {
    player.x = WIDTH + player.w / 2;
  } else if (player.x > WIDTH + player.w / 2) {
    player.x = -player.w / 2;
  }
}

function startGame() {
  state.mode = "playing";
  overlayEl.classList.remove("visible");
  overlayEl.classList.add("hidden");
  gameoverEl.classList.add("hidden");
  initGame();
}

function endGame() {
  state.mode = "gameover";
  state.best = Math.max(state.best, Math.floor(state.score));
  localStorage.setItem("doodleBest", String(state.best));
  bestEl.textContent = `Best: ${state.best}`;
  finalScoreEl.textContent = `Score: ${Math.floor(state.score)}`;
  gameoverEl.classList.remove("hidden");
}

function getMoveDirection() {
  if (input.pointerActive) {
    const center = WIDTH / 2;
    const delta = input.pointerX - center;
    if (Math.abs(delta) < 12) {
      return 0;
    }
    return delta > 0 ? 1 : -1;
  }
  if (input.left && !input.right) {
    return -1;
  }
  if (input.right && !input.left) {
    return 1;
  }
  return 0;
}

function handleKeyDown(event) {
  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    input.left = true;
  }
  if (event.code === "ArrowRight" || event.code === "KeyD") {
    input.right = true;
  }
  if ((event.code === "Space" || event.code === "Enter") && state.mode !== "playing") {
    startGame();
  }
  if (event.code === "KeyF") {
    toggleFullscreen();
  }
}

function handleKeyUp(event) {
  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    input.left = false;
  }
  if (event.code === "ArrowRight" || event.code === "KeyD") {
    input.right = false;
  }
}

function handlePointer(event) {
  const rect = canvas.getBoundingClientRect();
  input.pointerActive = true;
  input.pointerX = ((event.clientX - rect.left) / rect.width) * WIDTH;
}

function stopPointer() {
  input.pointerActive = false;
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    canvas.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

function randRange(min, max) {
  return min + (max - min) * rng();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadAssets() {
  const entries = Object.entries(ASSET_PATHS);
  const promises = entries.map(([key, src]) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve([key, img]);
      img.onerror = () => resolve([key, null]);
      img.src = src;
    });
  });

  return Promise.all(promises).then((results) => {
    results.forEach(([key, img]) => {
      if (img) {
        assets.images[key] = img;
      }
    });
    assets.ready = true;
  });
}

function updateScore() {
  scoreEl.textContent = `Score: ${Math.floor(state.score)}`;
  bestEl.textContent = `Best: ${state.best}`;
}

function resizeCanvas() {
  const scale = Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT, 1);
  canvas.style.width = `${WIDTH * scale}px`;
  canvas.style.height = `${HEIGHT * scale}px`;
}

function loop(timestamp) {
  if (!state.lastTime) {
    state.lastTime = timestamp;
  }
  const dt = Math.min((timestamp - state.lastTime) / 1000, 0.033);
  state.lastTime = timestamp;

  if (!state.manualStep) {
    update(dt);
    render();
    updateScore();
  }

  requestAnimationFrame(loop);
}

window.advanceTime = (ms) => {
  state.manualStep = true;
  const step = 1000 / 60;
  let remaining = ms;
  while (remaining > 0) {
    update(step / 1000);
    remaining -= step;
  }
  render();
  updateScore();
};

window.render_game_to_text = () => {
  const payload = {
    mode: state.mode,
    note: "Canvas origin top-left, y increases downward. Platforms + player positions are screen-space.",
    player: {
      x: Number(state.player.x.toFixed(1)),
      y: Number(state.player.y.toFixed(1)),
      vx: Number(state.player.vx.toFixed(1)),
      vy: Number(state.player.vy.toFixed(1)),
      w: state.player.w,
      h: state.player.h,
    },
    platforms: state.platforms.slice(0, 12).map((platform) => ({
      x: Number(platform.x.toFixed(1)),
      y: Number(platform.y.toFixed(1)),
      w: platform.w,
      h: platform.h,
      type: platform.type,
      spring: platform.hasSpring && !platform.springUsed,
    })),
    effects: {
      puffs: state.puffs.length,
      streaks: state.streaks.length,
    },
    score: Math.floor(state.score),
  };
  return JSON.stringify(payload);
};

startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", startGame);
window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
canvas.addEventListener("pointerdown", handlePointer);
canvas.addEventListener("pointermove", handlePointer);
canvas.addEventListener("pointerup", stopPointer);
canvas.addEventListener("pointerleave", stopPointer);
window.addEventListener("resize", resizeCanvas);

resizeCanvas();
loadAssets().then(() => {
  updateScore();
  requestAnimationFrame(loop);
});
