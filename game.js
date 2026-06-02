const silverPrices = {
  1970: 1.77, 1971: 1.55, 1972: 1.68, 1973: 2.56, 1974: 4.71, 1975: 4.42,
  1976: 4.35, 1977: 4.62, 1978: 5.40, 1979: 11.09, 1980: 20.63, 1981: 10.52,
  1982: 7.95, 1983: 11.44, 1984: 8.14, 1985: 6.14, 1986: 5.47, 1987: 7.01,
  1988: 6.53, 1989: 5.50, 1990: 4.82, 1991: 4.04, 1992: 3.94, 1993: 4.30,
  1994: 5.29, 1995: 5.15, 1996: 5.19, 1997: 4.89, 1998: 5.54, 1999: 5.25,
  2000: 5.00, 2001: 4.39, 2002: 4.62, 2003: 4.91, 2004: 6.69, 2005: 7.34,
  2006: 11.57, 2007: 13.41, 2008: 15.00, 2009: 14.69, 2010: 20.20, 2011: 35.12,
  2012: 31.15, 2013: 23.79, 2014: 19.08, 2015: 15.68, 2016: 17.14, 2017: 17.05,
  2018: 15.71, 2019: 16.22, 2020: 20.55, 2021: 25.14, 2022: 21.73, 2023: 23.35,
  2024: 28.27, 2025: 33.20
};

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const spark = document.querySelector("#spark");
const sparkCtx = spark.getContext("2d");
const yearSelect = document.querySelector("#yearSelect");
const startButton = document.querySelector("#startButton");
const pauseButton = document.querySelector("#pauseButton");
const overlay = document.querySelector("#overlay");
const priceLabel = document.querySelector("#priceLabel");
const priceStat = document.querySelector("#priceStat");
const priceTime = document.querySelector("#priceTime");
const rangeStat = document.querySelector("#rangeStat");
const scoreStat = document.querySelector("#scoreStat");
const yearNote = document.querySelector("#yearNote");

const W = canvas.width;
const H = canvas.height;
const years = Object.keys(silverPrices).map(Number);
const priceValues = Object.values(silverPrices);
const minPrice = Math.min(...priceValues);
const maxPrice = Math.max(...priceValues);

let selectedYear = 2024;
let level = makeLevel(selectedYear);
let player;
let running = false;
let paused = false;
let finished = false;
let lastTime = 0;
let camera = 0;
let score = 0;
let flipSide = 1;
let particles = [];
let liveQuote = null;
let quoteStatus = "Annual";
let isCharging = false;
let chargeStartedAt = 0;
let activePointerId = null;
const MAX_CHARGE_MS = 850;

for (const year of [...years].reverse()) {
  const option = document.createElement("option");
  option.value = year;
  option.textContent = year;
  yearSelect.append(option);
}
yearSelect.value = String(selectedYear);

function seededRandom(seed) {
  let value = seed % 2147483647;
  return () => {
    value = value * 16807 % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function makeLevel(year) {
  const price = silverPrices[year];
  const previous = silverPrices[year - 1] ?? price;
  const next = silverPrices[year + 1] ?? price;
  const normalized = (price - minPrice) / (maxPrice - minPrice);
  const annualMove = Math.abs(price - previous) / Math.max(previous, 1);
  const forwardMove = Math.abs(next - price) / Math.max(price, 1);
  const volatility = clamp((annualMove + forwardMove) * 0.58, 0.04, 0.62);
  const rand = seededRandom(year * 97);
  const points = [];
  const gateCount = 42;
  const width = Math.round(250 - volatility * 86 - normalized * 18);
  const baseline = lerp(H * 0.66, H * 0.31, normalized);
  const amplitude = lerp(30, 126, volatility);
  const span = 4200 + Math.round(volatility * 1600);

  for (let i = 0; i < gateCount; i++) {
    const x = 360 + i * (span / (gateCount - 1));
    const wave = Math.sin(i * 0.72 + year * 0.13) * amplitude;
    const chop = (rand() - 0.5) * amplitude * 0.52;
    const trend = Math.sin(i / gateCount * Math.PI * 2) * (next - previous) * 4.6;
    const center = clamp(baseline + wave + chop - trend, 120, H - 120);
    points.push({ x, center });
  }

  return {
    year,
    price,
    previous,
    next,
    volatility,
    width,
    points,
    length: points[points.length - 1].x + 500
  };
}

function tunnelCenter(worldX) {
  const pts = level.points;
  if (worldX <= pts[0].x) return pts[0].center;
  for (let i = 1; i < pts.length; i++) {
    if (worldX <= pts[i].x) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = smoothstep((worldX - a.x) / (b.x - a.x));
      return lerp(a.center, b.center, t);
    }
  }
  return pts[pts.length - 1].center;
}

function resetGame(autoStart = false) {
  level = makeLevel(selectedYear);
  player = {
    x: 150,
    worldX: 150,
    y: tunnelCenter(150),
    vy: 0,
    radius: 25,
    spin: 0
  };
  camera = 0;
  score = 0;
  flipSide = 1;
  particles = [];
  isCharging = false;
  chargeStartedAt = 0;
  activePointerId = null;
  running = autoStart;
  paused = false;
  finished = false;
  lastTime = 0;
  updateStats();
  drawSpark();
  draw(0);
  overlay.classList.toggle("is-hidden", autoStart);
  pauseButton.textContent = "Pause";
  pauseButton.setAttribute("aria-pressed", "false");
}

function updateStats() {
  const displayPrice = liveQuote?.price ?? level.price;
  priceLabel.textContent = liveQuote ? "Live XAG/USD" : "Price";
  priceStat.textContent = `$${displayPrice.toFixed(2)}`;
  priceTime.textContent = quoteStatus;
  rangeStat.textContent = `${Math.round(level.volatility * 100)}%`;
  scoreStat.textContent = String(score);
  const move = ((level.price - level.previous) / level.previous) * 100;
  const direction = move >= 0 ? "up" : "down";
  const liveText = liveQuote ? ` Live spot is $${liveQuote.price.toFixed(2)}/oz as of ${liveQuote.time}.` : " Live quote is loading; showing the annual value for now.";
  yearNote.textContent = `${level.year} averaged $${level.price.toFixed(2)}/oz, ${direction} ${Math.abs(move).toFixed(1)}% from the prior year.${liveText} Larger price swings narrow and bend the tunnel.`;
}

function parseSilverQuote(payload) {
  if (payload && typeof payload.price === "number") return payload;
  throw new Error("Silver quote payload did not include a price.");
}

async function refreshLiveQuote() {
  try {
    const response = await fetch("/api/silver", { cache: "no-store" });
    if (!response.ok) throw new Error(`Quote request failed: ${response.status}`);
    liveQuote = parseSilverQuote(await response.json());
    quoteStatus = liveQuote.time ? `Updated ${liveQuote.time}` : "Live";
  } catch (error) {
    liveQuote = null;
    quoteStatus = "Annual fallback";
  }
  updateStats();
}

function chargeLevel(now = performance.now()) {
  if (!isCharging) return 0;
  return clamp((now - chargeStartedAt) / MAX_CHARGE_MS, 0, 1);
}

function beginFlipCharge() {
  if (!running || paused || finished) return;
  if (isCharging) return;
  isCharging = true;
  chargeStartedAt = performance.now();
}

function releaseFlipCharge() {
  if (!running || paused || finished || !isCharging) return;
  const charge = chargeLevel();
  isCharging = false;
  chargeStartedAt = 0;
  flipSide *= -1;
  const lift = lerp(80, 340, Math.sqrt(charge));
  player.vy = Math.max(player.vy - lift, -390);
  const burst = Math.round(6 + charge * 14);
  for (let i = 0; i < burst; i++) {
    particles.push({
      x: player.x,
      y: player.y,
      vx: (Math.random() - 0.5) * (90 + charge * 90),
      vy: (Math.random() - 0.5) * (90 + charge * 90),
      life: 0.38 + charge * 0.28
    });
  }
}

function update(dt) {
  const speed = 165 + level.volatility * 55;
  player.worldX += speed * dt;
  camera = player.worldX - player.x;
  player.vy += 360 * dt;
  player.vy *= Math.pow(0.99, dt * 60);
  player.y += player.vy * dt;
  player.spin += (flipSide * (isCharging ? 18 : 8) + player.vy * 0.015) * dt;

  const center = tunnelCenter(player.worldX);
  const half = level.width / 2;
  const forgiveness = 24;
  const inTunnel = player.y - player.radius + forgiveness > center - half && player.y + player.radius - forgiveness < center + half;
  const inBounds = player.y > player.radius - forgiveness && player.y < H - player.radius + forgiveness;
  score = Math.max(score, Math.floor((player.worldX - 150) / 18));
  updateStats();

  particles = particles
    .map((p) => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, life: p.life - dt }))
    .filter((p) => p.life > 0);

  if (!inTunnel || !inBounds) {
    running = false;
    finished = true;
    overlay.querySelector("h2").textContent = "Margin call";
    overlay.querySelector("p").textContent = `Score ${score}. The ${level.year} tunnel was ${Math.round(level.width)}px wide. Start again or pick another year.`;
    overlay.classList.remove("is-hidden");
  }

  if (player.worldX > level.length) {
    running = false;
    finished = true;
    overlay.querySelector("h2").textContent = "Silver run cleared";
    overlay.querySelector("p").textContent = `Score ${score}. You held the coin through ${level.year}'s price action.`;
    overlay.classList.remove("is-hidden");
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, "#12141a");
  gradient.addColorStop(1, "#0c0d10");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(216, 220, 228, 0.08)";
  ctx.lineWidth = 1;
  for (let x = -camera % 80; x < W; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 80; y < H; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

function drawTunnel() {
  const step = 18;
  const upper = [];
  const lower = [];
  for (let sx = -20; sx <= W + 20; sx += step) {
    const worldX = sx + camera;
    const center = tunnelCenter(worldX);
    upper.push([sx, center - level.width / 2]);
    lower.push([sx, center + level.width / 2]);
  }

  ctx.beginPath();
  upper.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  [...lower].reverse().forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, 0, 0, H);
  fill.addColorStop(0, "rgba(57, 198, 189, 0.24)");
  fill.addColorStop(1, "rgba(231, 187, 82, 0.18)");
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.strokeStyle = "rgba(216, 220, 228, 0.72)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  upper.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.stroke();
  ctx.beginPath();
  lower.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.stroke();

  ctx.strokeStyle = "rgba(231, 187, 82, 0.34)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let sx = -20; sx <= W + 20; sx += step) {
    const y = tunnelCenter(sx + camera);
    sx === -20 ? ctx.moveTo(sx, y) : ctx.lineTo(sx, y);
  }
  ctx.stroke();
}

function drawCoin() {
  ctx.save();
  ctx.translate(player.x, player.y);
  const charge = chargeLevel();
  if (charge > 0) {
    ctx.strokeStyle = `rgba(216, 220, 228, ${0.24 + charge * 0.52})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius + 9 + charge * 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
    ctx.stroke();
  }
  ctx.rotate(player.spin);
  const squash = Math.max(0.18, Math.abs(Math.cos(player.spin)));
  ctx.scale(squash, 1);
  const grd = ctx.createRadialGradient(-10, -12, 3, 0, 0, player.radius);
  grd.addColorStop(0, "#ffffff");
  grd.addColorStop(0.38, "#dfe5ec");
  grd.addColorStop(1, "#6b7480");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#1f252d";
  ctx.font = "900 24px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(flipSide > 0 ? "T" : "H", 0, 1);
  ctx.restore();
}

function drawParticles() {
  particles.forEach((p) => {
    ctx.globalAlpha = p.life / 0.55;
    ctx.fillStyle = "#d8dce4";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawProgress() {
  const pct = clamp((player.worldX - 150) / (level.length - 150), 0, 1);
  ctx.fillStyle = "rgba(216, 220, 228, 0.16)";
  ctx.fillRect(32, 28, W - 64, 8);
  ctx.fillStyle = "#39c6bd";
  ctx.fillRect(32, 28, (W - 64) * pct, 8);
}

function draw() {
  drawBackground();
  drawTunnel();
  drawParticles();
  drawCoin();
  drawProgress();
}

function frame(time) {
  if (!lastTime) lastTime = time;
  const dt = Math.min((time - lastTime) / 1000, 0.032);
  lastTime = time;
  if (running && !paused) update(dt);
  draw(dt);
  requestAnimationFrame(frame);
}

function drawSpark() {
  const sw = spark.width;
  const sh = spark.height;
  sparkCtx.clearRect(0, 0, sw, sh);
  sparkCtx.fillStyle = "#111419";
  sparkCtx.fillRect(0, 0, sw, sh);

  const selectedIndex = years.indexOf(level.year);
  const start = Math.max(0, selectedIndex - 5);
  const end = Math.min(years.length - 1, selectedIndex + 5);
  const slice = years.slice(start, end + 1);
  const localValues = slice.map((y) => silverPrices[y]);
  const low = Math.min(...localValues);
  const high = Math.max(...localValues);

  sparkCtx.strokeStyle = "rgba(216, 220, 228, 0.14)";
  sparkCtx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (sh / 4) * i;
    sparkCtx.beginPath();
    sparkCtx.moveTo(0, y);
    sparkCtx.lineTo(sw, y);
    sparkCtx.stroke();
  }

  sparkCtx.strokeStyle = "#39c6bd";
  sparkCtx.lineWidth = 4;
  sparkCtx.beginPath();
  slice.forEach((year, index) => {
    const x = 24 + index * ((sw - 48) / (slice.length - 1));
    const y = sh - 18 - ((silverPrices[year] - low) / Math.max(high - low, 1)) * (sh - 36);
    index ? sparkCtx.lineTo(x, y) : sparkCtx.moveTo(x, y);
  });
  sparkCtx.stroke();

  slice.forEach((year, index) => {
    const x = 24 + index * ((sw - 48) / (slice.length - 1));
    const y = sh - 18 - ((silverPrices[year] - low) / Math.max(high - low, 1)) * (sh - 36);
    sparkCtx.fillStyle = year === level.year ? "#e7bb52" : "#d8dce4";
    sparkCtx.beginPath();
    sparkCtx.arc(x, y, year === level.year ? 6 : 3, 0, Math.PI * 2);
    sparkCtx.fill();
  });
}

startButton.addEventListener("click", () => {
  overlay.querySelector("h2").textContent = "Flip the coin";
  resetGame(true);
});

pauseButton.addEventListener("click", () => {
  if (!running || finished) return;
  paused = !paused;
  isCharging = false;
  pauseButton.textContent = paused ? "Resume" : "Pause";
  pauseButton.setAttribute("aria-pressed", String(paused));
  overlay.querySelector("h2").textContent = "Paused";
  overlay.querySelector("p").textContent = "Resume, then press and release to flip upward.";
  overlay.classList.toggle("is-hidden", !paused);
});

yearSelect.addEventListener("change", () => {
  selectedYear = Number(yearSelect.value);
  resetGame(false);
});

canvas.addEventListener("pointerdown", (event) => {
  if (!running || finished) {
    resetGame(true);
  }
  if (paused) {
    paused = false;
    pauseButton.textContent = "Pause";
    overlay.classList.add("is-hidden");
  }
  activePointerId = event.pointerId;
  canvas.setPointerCapture?.(event.pointerId);
  beginFlipCharge();
});

canvas.addEventListener("pointerup", (event) => {
  if (activePointerId !== null && event.pointerId !== activePointerId) return;
  releaseFlipCharge();
  activePointerId = null;
});

canvas.addEventListener("pointercancel", () => {
  isCharging = false;
  activePointerId = null;
});

window.addEventListener("keydown", (event) => {
  if (event.code !== "Space") return;
  event.preventDefault();
  if (event.repeat) return;
  if (!running || finished) {
    resetGame(true);
  }
  if (paused) {
    paused = false;
    pauseButton.textContent = "Pause";
    overlay.classList.add("is-hidden");
  }
  beginFlipCharge();
});

window.addEventListener("keyup", (event) => {
  if (event.code !== "Space") return;
  event.preventDefault();
  releaseFlipCharge();
});

window.addEventListener("blur", () => {
  isCharging = false;
  activePointerId = null;
});

resetGame(false);
refreshLiveQuote();
setInterval(refreshLiveQuote, 30000);
requestAnimationFrame(frame);
