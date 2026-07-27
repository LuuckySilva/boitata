import { Application, Graphics } from 'pixi.js';

const app = new Application();

// input: guarda quais teclas estão pressionadas agora (não dispara a cada frame, só reflete o estado)
const keys = new Set<string>();
window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

async function main() {
  await app.init({
    width: 800,
    height: 600,
    backgroundColor: 0x0a0f0c, // já usando o "night" da paleta
  });

  document.querySelector<HTMLDivElement>('#app')!.appendChild(app.canvas);

  const player = new Graphics()
    .circle(0, 0, 16)
    .fill(0xff6a1f); // ember — placeholder, forma real vem depois

  player.x = app.screen.width / 2;
  player.y = app.screen.height / 2;
  app.stage.addChild(player);

  const SPEED = 220; // pixels por segundo

  // ---- fixed timestep ----
  const STEP = 1 / 60;
  let accumulator = 0;

  app.ticker.add((ticker) => {
    let frameTime = ticker.deltaMS / 1000;

    // trava o frameTime pra não explodir a física se a aba ficar em background
    // e você voltar depois de 10s (sem isso, o loop tentaria "recuperar" o tempo perdido de uma vez)
    if (frameTime > 0.25) frameTime = 0.25;

    accumulator += frameTime;

    while (accumulator >= STEP) {
      update(STEP);
      accumulator -= STEP;
    }
  });

  function update(dt: number) {
    let dx = 0;
    let dy = 0;
    if (keys.has('w') || keys.has('arrowup')) dy -= 1;
    if (keys.has('s') || keys.has('arrowdown')) dy += 1;
    if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;

    // normaliza diagonal — sem isso, W+D deixa você ~41% mais rápido que só W
    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
    }

    player.x += dx * SPEED * dt;
    player.y += dy * SPEED * dt;

    // por enquanto trava na borda da tela — vira a arena de verdade depois
    player.x = Math.max(16, Math.min(app.screen.width - 16, player.x));
    player.y = Math.max(16, Math.min(app.screen.height - 16, player.y));
  }
}

main();