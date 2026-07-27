import { Application, Graphics, Text, Container } from 'pixi.js';

const app = new Application();

const keys = new Set<string>();
window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

type Wisp = { x: number; y: number; g: Graphics };
type Projectile = { x: number; y: number; dx: number; dy: number; g: Graphics };
type Gem = { x: number; y: number; g: Graphics };
type Upgrade = { title: string; desc: string; apply: () => void };

class SpatialGrid<T extends { x: number; y: number }> {
  private cellSize: number;
  private cells: Map<string, T[]> = new Map();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  clear() {
    this.cells.clear();
  }

  insert(item: T) {
    const cx = Math.floor(item.x / this.cellSize);
    const cy = Math.floor(item.y / this.cellSize);
    const k = this.key(cx, cy);
    let bucket = this.cells.get(k);
    if (!bucket) {
      bucket = [];
      this.cells.set(k, bucket);
    }
    bucket.push(item);
  }

  queryNear(x: number, y: number, radius: number): T[] {
    const result: T[] = [];
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (bucket) result.push(...bucket);
      }
    }
    return result;
  }
}

async function main() {
  await app.init({
    width: 800,
    height: 600,
    backgroundColor: 0x0a0f0c,
  });

  document.querySelector<HTMLDivElement>('#app')!.appendChild(app.canvas);

  let trailLength = 40;
  const trailPositions: { x: number; y: number }[] = [];
  const trailGraphics = new Graphics();
  app.stage.addChild(trailGraphics);

  // ---- arena que encolhe ----
  const arenaCenter = { x: app.screen.width / 2, y: app.screen.height / 2 };
  const ARENA_RADIUS_START = 380;
  const ARENA_RADIUS_MIN = 150;
  const ARENA_SHRINK_DURATION = 90; // segundos até chegar no raio minimo
  const arenaGraphics = new Graphics();
  app.stage.addChild(arenaGraphics);

  function currentArenaRadius(): number {
    const progress = Math.min(gameTime / ARENA_SHRINK_DURATION, 1);
    return ARENA_RADIUS_START - (ARENA_RADIUS_START - ARENA_RADIUS_MIN) * progress;
  }

  function drawArena() {
    const radius = currentArenaRadius();
    arenaGraphics.clear();
    // três traços concêntricos com alpha decrescente pra simular brilho da borda
    for (let i = 0; i < 3; i++) {
      arenaGraphics
        .circle(arenaCenter.x, arenaCenter.y, radius + i * 4)
        .stroke({ width: 2, color: 0xff6a1f, alpha: 0.5 - i * 0.15 });
    }
  }

  const player = new Graphics().circle(0, 0, 16).fill(0xff6a1f);
  player.x = app.screen.width / 2;
  player.y = app.screen.height / 2;
  app.stage.addChild(player);

  let playerSpeed = 220;
  const PLAYER_RADIUS = 16;

  const MAX_LIVES = 3;
  let lives = MAX_LIVES;
  const I_FRAME_DURATION = 1.0;
  let iFrameTimer = 0;

  // ---- centraliza a lógica de "tomar dano" — usada por inimigo e por arena ----
  function damagePlayer() {
    lives -= 1;
    iFrameTimer = I_FRAME_DURATION;
    livesText.text = `Vidas: ${lives}`;

    if (lives <= 0) {
      gameOver = true;
      livesText.text = 'Voce morreu — F5 pra tentar de novo';
    }
  }

  const livesText = new Text({ text: `Vidas: ${lives}`, style: { fill: 0xe9ddc4, fontSize: 18, fontFamily: 'Courier New' } });
  livesText.x = 14; livesText.y = 14;
  app.stage.addChild(livesText);

  const timeText = new Text({ text: `Tempo: 0:00`, style: { fill: 0xffb347, fontSize: 18, fontFamily: 'Courier New' } });
  timeText.x = 14; timeText.y = 38;
  app.stage.addChild(timeText);

  const levelText = new Text({ text: `Nivel: 1`, style: { fill: 0x8bff9e, fontSize: 18, fontFamily: 'Courier New' } });
  levelText.x = 14; levelText.y = 62;
  app.stage.addChild(levelText);

  const xpBarBg = new Graphics().rect(14, 88, 200, 8).fill(0x232a24);
  app.stage.addChild(xpBarBg);
  const xpBarFill = new Graphics();
  app.stage.addChild(xpBarFill);

  function updateXpBar() {
    xpBarFill.clear();
    const pct = Math.min(xp / xpToNext, 1);
    xpBarFill.rect(14, 88, 200 * pct, 8).fill(0xffb347);
  }

  const WISP_RADIUS = 10;
  const WISP_SPEED = 90;
  const wisps: Wisp[] = [];

  const CELL_SIZE = 60;
  const wispGrid = new SpatialGrid<Wisp>(CELL_SIZE);

  function rebuildWispGrid() {
    wispGrid.clear();
    for (const w of wisps) wispGrid.insert(w);
  }

  function spawnWisp(x: number, y: number) {
    const g = new Graphics()
      .circle(0, 0, WISP_RADIUS).fill(0x2c1418)
      .circle(3, -3, 2).fill(0xff3b3b);
    g.x = x; g.y = y;
    app.stage.addChild(g);
    wisps.push({ x, y, g });
  }

  function spawnWispAtEdge() {
    const edge = Math.floor(Math.random() * 4);
    const margin = 30;
    let x = 0, y = 0;
    switch (edge) {
      case 0: x = Math.random() * app.screen.width; y = -margin; break;
      case 1: x = app.screen.width + margin; y = Math.random() * app.screen.height; break;
      case 2: x = Math.random() * app.screen.width; y = app.screen.height + margin; break;
      case 3: x = -margin; y = Math.random() * app.screen.height; break;
    }
    spawnWisp(x, y);
  }

  function removeWisp(w: Wisp): boolean {
    const idx = wisps.indexOf(w);
    if (idx === -1) return false;
    app.stage.removeChild(w.g);
    wisps.splice(idx, 1);
    return true;
  }

  function killWisp(w: Wisp) {
    if (removeWisp(w)) {
      spawnGem(w.x, w.y);
    }
  }

  const SPAWN_INTERVAL_START = 2.0;
  const SPAWN_INTERVAL_MIN = 0.4;
  const RAMP_DURATION = 60;
  let spawnTimer = 0;
  let gameTime = 0;

  function currentSpawnInterval(): number {
    const progress = Math.min(gameTime / RAMP_DURATION, 1);
    return SPAWN_INTERVAL_START - (SPAWN_INTERVAL_START - SPAWN_INTERVAL_MIN) * progress;
  }

  const GEM_RADIUS = 5;
  const MAGNET_RADIUS = 80;
  const GEM_SPEED = 260;
  const gems: Gem[] = [];

  function spawnGem(x: number, y: number) {
    const g = new Graphics().circle(0, 0, GEM_RADIUS).fill(0x8bff9e);
    g.x = x; g.y = y;
    app.stage.addChild(g);
    gems.push({ x, y, g });
  }

  function updateGems(dt: number) {
    for (const gem of gems) {
      const dx = player.x - gem.x;
      const dy = player.y - gem.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < MAGNET_RADIUS * MAGNET_RADIUS) {
        const dist = Math.sqrt(distSq) || 1;
        gem.x += (dx / dist) * GEM_SPEED * dt;
        gem.y += (dy / dist) * GEM_SPEED * dt;
        gem.g.x = gem.x; gem.g.y = gem.y;
      }
    }
  }

  function checkGemCollection() {
    const collectDist = PLAYER_RADIUS + GEM_RADIUS;
    for (let i = gems.length - 1; i >= 0; i--) {
      const gem = gems[i];
      const dx = player.x - gem.x, dy = player.y - gem.y;
      if (dx * dx + dy * dy < collectDist * collectDist) {
        app.stage.removeChild(gem.g);
        gems.splice(i, 1);
        addXp(1);
      }
    }
  }

  let level = 1;
  let xp = 0;
  let xpToNext = 5;
  let paused = false;

  function addXp(amount: number) {
    xp += amount;
    if (xp >= xpToNext) {
      xp -= xpToNext;
      level += 1;
      xpToNext = 5 + (level - 1) * 3;
      levelText.text = `Nivel: ${level}`;
      triggerLevelUp();
    }
    updateXpBar();
  }

  let attackInterval = 0.5;
  let projectileCount = 1;
  const PROJECTILE_SPEED = 500;
  const PROJECTILE_RADIUS = 5;
  let attackTimer = 0;
  const projectiles: Projectile[] = [];

  function findNearestWisp(): Wisp | null {
    let nearest: Wisp | null = null;
    let nearestDistSq = Infinity;
    for (const w of wisps) {
      const dx = w.x - player.x, dy = w.y - player.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < nearestDistSq) { nearestDistSq = distSq; nearest = w; }
    }
    return nearest;
  }

  function fireWeapon() {
    const target = findNearestWisp();
    if (!target) return;

    let dx = target.x - player.x, dy = target.y - player.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) { dx /= len; dy /= len; }
    const baseAngle = Math.atan2(dy, dx);

    const spread = 0.25;
    const mid = (projectileCount - 1) / 2;

    for (let i = 0; i < projectileCount; i++) {
      const angle = baseAngle + (i - mid) * spread;
      const pdx = Math.cos(angle), pdy = Math.sin(angle);

      const g = new Graphics().circle(0, 0, PROJECTILE_RADIUS).fill(0xffb347);
      g.x = player.x; g.y = player.y;
      app.stage.addChild(g);
      projectiles.push({ x: player.x, y: player.y, dx: pdx, dy: pdy, g });
    }
  }

  const UPGRADE_POOL: Upgrade[] = [
    { title: 'Ataque Rápido', desc: 'intervalo de tiro cai 15%', apply: () => { attackInterval = Math.max(0.15, attackInterval * 0.85); } },
    { title: 'Tiro Duplo', desc: '+1 projetil por disparo, em leque', apply: () => { projectileCount += 1; } },
    { title: 'Passo Firme', desc: 'velocidade de movimento +8%', apply: () => { playerSpeed *= 1.08; } },
    { title: 'Rastro Maior', desc: 'trilha de fogo fica mais longa', apply: () => { trailLength += 8; } },
  ];

  let currentChoices: Upgrade[] = [];
  const overlayBg = new Graphics();
  overlayBg.visible = false;
  app.stage.addChild(overlayBg);

  const cardContainer = new Container();
  cardContainer.visible = false;
  app.stage.addChild(cardContainer);

  function triggerLevelUp() {
    paused = true;
    const pool = [...UPGRADE_POOL];
    currentChoices = [];
    for (let i = 0; i < 3 && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      currentChoices.push(pool[idx]);
      pool.splice(idx, 1);
    }
    renderLevelUpUI();
  }

  function renderLevelUpUI() {
    cardContainer.removeChildren();
    overlayBg.clear();
    overlayBg.rect(0, 0, app.screen.width, app.screen.height).fill({ color: 0x06080a, alpha: 0.72 });
    overlayBg.visible = true;
    cardContainer.visible = true;

    const cardWidth = 150, cardHeight = 130, gap = 14;
    const totalWidth = currentChoices.length * cardWidth + (currentChoices.length - 1) * gap;
    const startX = (app.screen.width - totalWidth) / 2;
    const y = (app.screen.height - cardHeight) / 2;

    currentChoices.forEach((upg, i) => {
      const card = new Graphics()
        .roundRect(0, 0, cardWidth, cardHeight, 10)
        .fill(0x1b1712)
        .stroke({ width: 1, color: 0xe9ddc4, alpha: 0.18 });
      card.x = startX + i * (cardWidth + gap);
      card.y = y;
      card.eventMode = 'static';
      card.cursor = 'pointer';
      card.on('pointertap', () => selectUpgrade(upg));

      const title = new Text({ text: `${i + 1}. ${upg.title}`, style: { fill: 0xe9ddc4, fontSize: 13, fontFamily: 'Georgia' } });
      title.x = 12; title.y = 14;
      card.addChild(title);

      const desc = new Text({ text: upg.desc, style: { fill: 0xa99b7c, fontSize: 10.5, fontFamily: 'Courier New', wordWrap: true, wordWrapWidth: cardWidth - 24 } });
      desc.x = 12; desc.y = 42;
      card.addChild(desc);

      cardContainer.addChild(card);
    });
  }

  function selectUpgrade(upg: Upgrade) {
    upg.apply();
    overlayBg.visible = false;
    cardContainer.visible = false;
    paused = false;
  }

  window.addEventListener('keydown', (e) => {
    if (!paused) return;
    const n = parseInt(e.key);
    if (n >= 1 && n <= currentChoices.length) selectUpgrade(currentChoices[n - 1]);
  });

  const STEP = 1 / 60;
  let accumulator = 0;
  let gameOver = false;

  app.ticker.add((ticker) => {
    let frameTime = ticker.deltaMS / 1000;
    if (frameTime > 0.25) frameTime = 0.25;
    accumulator += frameTime;
    while (accumulator >= STEP) {
      update(STEP);
      accumulator -= STEP;
    }
  });

  function update(dt: number) {
    if (gameOver) return;
    if (paused) return;

    gameTime += dt;
    timeText.text = `Tempo: ${formatTime(gameTime)}`;

    updateSpawner(dt);
    updatePlayer(dt);
    updateTrail();
    updateWisps(dt);
    drawArena();

    rebuildWispGrid();

    updateWeapon(dt);
    updateProjectiles(dt);
    updateGems(dt);
    checkTrailCollisions();
    checkProjectileCollisions();
    checkGemCollection();
    checkPlayerCollision();
    checkArenaDamage();

    if (iFrameTimer > 0) iFrameTimer -= dt;
  }

  function updateSpawner(dt: number) {
    spawnTimer += dt;
    const interval = currentSpawnInterval();
    if (spawnTimer >= interval) {
      spawnTimer -= interval;
      spawnWispAtEdge();
    }
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function updatePlayer(dt: number) {
    let dx = 0, dy = 0;
    if (keys.has('w') || keys.has('arrowup')) dy -= 1;
    if (keys.has('s') || keys.has('arrowdown')) dy += 1;
    if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;

    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len; dy /= len;
    }

    player.x += dx * playerSpeed * dt;
    player.y += dy * playerSpeed * dt;
    player.x = Math.max(16, Math.min(app.screen.width - 16, player.x));
    player.y = Math.max(16, Math.min(app.screen.height - 16, player.y));

    player.alpha = iFrameTimer > 0 ? (Math.floor(iFrameTimer * 10) % 2 === 0 ? 0.3 : 1) : 1;
  }

  function updateTrail() {
    trailPositions.push({ x: player.x, y: player.y });
    if (trailPositions.length > trailLength) trailPositions.shift();

    trailGraphics.clear();
    for (let i = 0; i < trailPositions.length; i++) {
      const t = i / trailLength;
      const alpha = t * 0.6;
      const radius = 6 + t * 6;
      trailGraphics.circle(trailPositions[i].x, trailPositions[i].y, radius).fill({ color: 0xff6a1f, alpha });
    }
  }

  function updateWisps(dt: number) {
    for (const w of wisps) {
      let dx = player.x - w.x, dy = player.y - w.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) { dx /= len; dy /= len; }
      w.x += dx * WISP_SPEED * dt;
      w.y += dy * WISP_SPEED * dt;
      w.g.x = w.x; w.g.y = w.y;
    }
  }

  function updateWeapon(dt: number) {
    attackTimer += dt;
    if (attackTimer >= attackInterval) {
      attackTimer -= attackInterval;
      fireWeapon();
    }
  }

  function updateProjectiles(dt: number) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += p.dx * PROJECTILE_SPEED * dt;
      p.y += p.dy * PROJECTILE_SPEED * dt;
      p.g.x = p.x; p.g.y = p.y;

      const margin = 40;
      if (p.x < -margin || p.x > app.screen.width + margin || p.y < -margin || p.y > app.screen.height + margin) {
        app.stage.removeChild(p.g);
        projectiles.splice(i, 1);
      }
    }
  }

  function checkTrailCollisions() {
    const HEAD_SKIP = 6;

    for (let i = 0; i < trailPositions.length - HEAD_SKIP; i++) {
      const t = i / trailLength;
      const trailRadius = 6 + t * 6;
      const p = trailPositions[i];

      const nearby = wispGrid.queryNear(p.x, p.y, trailRadius + WISP_RADIUS);
      for (const w of nearby) {
        const dx = w.x - p.x, dy = w.y - p.y;
        const hitDist = WISP_RADIUS + trailRadius;
        if (dx * dx + dy * dy < hitDist * hitDist) {
          killWisp(w);
        }
      }
    }
  }

  function checkProjectileCollisions() {
    for (let pi = projectiles.length - 1; pi >= 0; pi--) {
      const p = projectiles[pi];
      const nearby = wispGrid.queryNear(p.x, p.y, PROJECTILE_RADIUS + WISP_RADIUS);

      for (const w of nearby) {
        const dx = p.x - w.x, dy = p.y - w.y;
        const hitDist = PROJECTILE_RADIUS + WISP_RADIUS;
        if (dx * dx + dy * dy < hitDist * hitDist) {
          app.stage.removeChild(p.g);
          projectiles.splice(pi, 1);
          killWisp(w);
          break;
        }
      }
    }
  }

  function checkPlayerCollision() {
    if (iFrameTimer > 0) return;
    for (const w of wisps) {
      const dx = player.x - w.x, dy = player.y - w.y;
      const hitDist = PLAYER_RADIUS + WISP_RADIUS;
      if (dx * dx + dy * dy < hitDist * hitDist) {
        damagePlayer();
        break;
      }
    }
  }

  // fora do anel de segurança = dano. iFrameTimer > 0 já serve de cooldown
  // natural aqui: ao ser queimado, você ganha ~1s pra voltar pro seguro
  // antes de poder tomar dano de arena de novo
  function checkArenaDamage() {
    if (iFrameTimer > 0) return;
    const dx = player.x - arenaCenter.x;
    const dy = player.y - arenaCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > currentArenaRadius()) {
      damagePlayer();
    }
  }

  updateXpBar();
}

main();