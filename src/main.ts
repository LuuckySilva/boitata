import { Application, Graphics, Text } from 'pixi.js';

const app = new Application();

const keys = new Set<string>();
window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

type Wisp = { x: number; y: number; g: Graphics };

async function main() {
  await app.init({
    width: 800,
    height: 600,
    backgroundColor: 0x0a0f0c,
  });

  document.querySelector<HTMLDivElement>('#app')!.appendChild(app.canvas);

  const TRAIL_LENGTH = 40;
  const trailPositions: { x: number; y: number }[] = [];
  const trailGraphics = new Graphics();
  app.stage.addChild(trailGraphics);

  const player = new Graphics()
    .circle(0, 0, 16)
    .fill(0xff6a1f);
  player.x = app.screen.width / 2;
  player.y = app.screen.height / 2;
  app.stage.addChild(player);

  const MAX_LIVES = 3;
  let lives = MAX_LIVES;
  const I_FRAME_DURATION = 1.0;
  let iFrameTimer = 0;

  const livesText = new Text({
    text: `Vidas: ${lives}`,
    style: { fill: 0xe9ddc4, fontSize: 18, fontFamily: 'Courier New' },
  });
  livesText.x = 14;
  livesText.y = 14;
  app.stage.addChild(livesText);

  const timeText = new Text({
    text: `Tempo: 0:00`,
    style: { fill: 0xffb347, fontSize: 18, fontFamily: 'Courier New' },
  });
  timeText.x = 14;
  timeText.y = 38;
  app.stage.addChild(timeText);

  const WISP_RADIUS = 10;
  const PLAYER_RADIUS = 16;
  const WISP_SPEED = 90;
  const wisps: Wisp[] = [];

  function spawnWisp(x: number, y: number) {
    const g = new Graphics()
      .circle(0, 0, WISP_RADIUS).fill(0x2c1418)
      .circle(3, -3, 2).fill(0xff3b3b);
    g.x = x;
    g.y = y;
    app.stage.addChild(g);
    wisps.push({ x, y, g });
  }

  // spawna numa borda aleatória, fora da área visível — inimigo nunca
  // "nasce do nada" no meio do mapa, sempre vem de algum lugar
  function spawnWispAtEdge() {
    const edge = Math.floor(Math.random() * 4); // 0=topo 1=direita 2=baixo 3=esquerda
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

  // ---- dificuldade ----
  const SPAWN_INTERVAL_START = 2.0;  // 1 wisp a cada 2s no início
  const SPAWN_INTERVAL_MIN = 0.4;    // nunca mais rápido que isso
  const RAMP_DURATION = 60;          // em 60s, chega no intervalo mínimo
  let spawnTimer = 0;
  let gameTime = 0;

  function currentSpawnInterval(): number {
    const progress = Math.min(gameTime / RAMP_DURATION, 1);
    return SPAWN_INTERVAL_START - (SPAWN_INTERVAL_START - SPAWN_INTERVAL_MIN) * progress;
  }

  const SPEED = 220;
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

    gameTime += dt;
    timeText.text = `Tempo: ${formatTime(gameTime)}`;

    updateSpawner(dt);
    updatePlayer(dt);
    updateTrail();
    updateWisps(dt);
    checkTrailCollisions();
    checkPlayerCollision(dt);

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
    let dx = 0;
    let dy = 0;
    if (keys.has('w') || keys.has('arrowup')) dy -= 1;
    if (keys.has('s') || keys.has('arrowdown')) dy += 1;
    if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;

    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
    }

    player.x += dx * SPEED * dt;
    player.y += dy * SPEED * dt;

    player.x = Math.max(16, Math.min(app.screen.width - 16, player.x));
    player.y = Math.max(16, Math.min(app.screen.height - 16, player.y));

    player.alpha = iFrameTimer > 0 ? (Math.floor(iFrameTimer * 10) % 2 === 0 ? 0.3 : 1) : 1;
  }

  function updateTrail() {
    trailPositions.push({ x: player.x, y: player.y });
    if (trailPositions.length > TRAIL_LENGTH) {
      trailPositions.shift();
    }

    trailGraphics.clear();
    for (let i = 0; i < trailPositions.length; i++) {
      const t = i / TRAIL_LENGTH;
      const alpha = t * 0.6;
      const radius = 6 + t * 6;
      trailGraphics
        .circle(trailPositions[i].x, trailPositions[i].y, radius)
        .fill({ color: 0xff6a1f, alpha });
    }
  }

  function updateWisps(dt: number) {
    for (const w of wisps) {
      let dx = player.x - w.x;
      let dy = player.y - w.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        dx /= len;
        dy /= len;
      }
      w.x += dx * WISP_SPEED * dt;
      w.y += dy * WISP_SPEED * dt;
      w.g.x = w.x;
      w.g.y = w.y;
    }
  }

  function checkTrailCollisions() {
    const HEAD_SKIP = 6;

    for (let wi = wisps.length - 1; wi >= 0; wi--) {
      const w = wisps[wi];
      for (let i = 0; i < trailPositions.length - HEAD_SKIP; i++) {
        const t = i / TRAIL_LENGTH;
        const trailRadius = 6 + t * 6;
        const p = trailPositions[i];
        const dx = w.x - p.x;
        const dy = w.y - p.y;
        const distSq = dx * dx + dy * dy;
        const hitDist = WISP_RADIUS + trailRadius;

        if (distSq < hitDist * hitDist) {
          app.stage.removeChild(w.g);
          wisps.splice(wi, 1);
          break;
        }
      }
    }
  }

  function checkPlayerCollision(dt: number) {
    if (iFrameTimer > 0) return;

    for (const w of wisps) {
      const dx = player.x - w.x;
      const dy = player.y - w.y;
      const distSq = dx * dx + dy * dy;
      const hitDist = PLAYER_RADIUS + WISP_RADIUS;

      if (distSq < hitDist * hitDist) {
        lives -= 1;
        iFrameTimer = I_FRAME_DURATION;
        livesText.text = `Vidas: ${lives}`;

        if (lives <= 0) {
          gameOver = true;
          livesText.text = 'Voce morreu — F5 pra tentar de novo';
        }
        break;
      }
    }
  }
}

main();