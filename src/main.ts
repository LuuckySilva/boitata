import { Application, Graphics } from 'pixi.js';

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

  // ---- inimigos (wisps) ----
  const WISP_RADIUS = 10;
  const WISP_SPEED = 90; // mais lento que o player (220) — dá pra fugir dele de propósito
  const wisps: Wisp[] = [];

  function spawnWisp(x: number, y: number) {
    const g = new Graphics()
      .circle(0, 0, WISP_RADIUS).fill(0x2c1418)
      .circle(3, -3, 2).fill(0xff3b3b); // "olho" vermelho
    g.x = x;
    g.y = y;
    app.stage.addChild(g);
    wisps.push({ x, y, g });
  }

  // por enquanto, spawn manual fixo — sistema de onda vem depois
  spawnWisp(100, 100);

  const SPEED = 220;
  const STEP = 1 / 60;
  let accumulator = 0;

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
    updatePlayer(dt);
    updateTrail();
    updateWisps(dt);
    checkTrailCollisions();
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
      // seek simples: vetor na direção do player, normalizado
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
    // força bruta: cada wisp contra cada ponto da trilha — ok pra poucas entidades,
    // vira gargalo na casa de centenas (aí entra a spatial grid da pesquisa)
    for (let wi = wisps.length - 1; wi >= 0; wi--) {
      const w = wisps[wi];
      for (let i = 0; i < trailPositions.length; i++) {
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
          console.log('Inimigo queimado pela trilha');
          break; // já morreu, não checa o resto dos pontos pra esse wisp
        }
      }
    }
  }
}

main();