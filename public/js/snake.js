/* =========================================================
   snake.js — Idle page Snake game
   Crisp pixel grid · black body · grey head · blue apple
   Arrow keys / WASD / on-screen d-pad / swipe
   ========================================================= */

(function () {
  const canvas = document.getElementById('snake-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Board: 21x21 grid. Render at devicePixelRatio for crispness.
  const COLS = 21;
  const ROWS = 21;
  const PIXEL_RATIO = window.devicePixelRatio || 1;
  const LOGICAL = 420;                                // CSS px the canvas renders at
  const CANVAS_PX = LOGICAL * PIXEL_RATIO;
  const CELL = CANVAS_PX / COLS;                       // canvas px per cell

  canvas.width = CANVAS_PX;
  canvas.height = CANVAS_PX;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  ctx.imageSmoothingEnabled = false;

  // CSS tokens for color (read at boot)
  const css = getComputedStyle(document.documentElement);
  const COLOR = {
    bg:   (css.getPropertyValue('--surface') || '#ebeae5').trim(),
    grid: (css.getPropertyValue('--rule')  || '#d8d8d4').trim(),
    body: (css.getPropertyValue('--ink')   || '#111111').trim(),
    head: (css.getPropertyValue('--ink-3') || '#999995').trim(),
    apple:(css.getPropertyValue('--accent')  || '#2a4ed4').trim(),
  };

  // ============ STATE ============
  let snake;
  let dir;
  let nextDir;
  let apple;
  let score;
  let best = parseInt(localStorage.getItem('lola.snake.best') || '0', 10);
  let running = false;
  let paused = false;
  let gameOver = false;
  let tickInterval = null;
  const BASE_SPEED = 160;

  const overlay      = document.getElementById('snake-overlay');
  const overlayTitle = document.getElementById('snake-overlay-title');
  const overlayCta   = document.getElementById('snake-overlay-cta');
  const scoreEl      = document.getElementById('snake-score');
  const bestEl       = document.getElementById('snake-best');
  const dpad         = document.getElementById('dpad');

  function reset() {
    const cx = Math.floor(COLS / 2);
    const cy = Math.floor(ROWS / 2);
    snake = [
      { x: cx,     y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
    ];
    dir     = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    placeApple();
    paused = false;
    gameOver = false;
    running = false;
    if (tickInterval) clearInterval(tickInterval);
    tickInterval = null;
    updateScoreUi();
    updateDpadUi();
    showOverlay('Press any arrow to start', 'arrows · wasd · or tap below');
    draw();
  }

  function start() {
    if (running || gameOver) return;
    running = true;
    paused = false;
    hideOverlay();
    scheduleTick();
  }

  function scheduleTick() {
    if (tickInterval) clearInterval(tickInterval);
    // Speed up gradually: -4ms per apple, every 3 apples. Floor at 70ms.
    const speed = Math.max(70, BASE_SPEED - Math.floor(score / 3) * 4);
    tickInterval = setInterval(tick, speed);
  }

  function pause() {
    if (!running || gameOver) return;
    paused = !paused;
    if (paused) {
      clearInterval(tickInterval);
      tickInterval = null;
      showOverlay('Paused', 'space to resume');
    } else {
      hideOverlay();
      scheduleTick();
    }
  }

  function placeApple() {
    while (true) {
      const a = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
      if (!snake.some(s => s.x === a.x && s.y === a.y)) {
        apple = a;
        return;
      }
    }
  }

  function tick() {
    if (paused || gameOver) return;
    dir = nextDir;
    let head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // wrap around walls (Nokia 3310 rules)
    if (head.x < 0) head.x = COLS - 1;
    if (head.x >= COLS) head.x = 0;
    if (head.y < 0) head.y = ROWS - 1;
    if (head.y >= ROWS) head.y = 0;

    // self collision = death
    if (snake.some((s, i) => i !== snake.length - 1 && s.x === head.x && s.y === head.y)) return die();

    snake.unshift(head);

    if (head.x === apple.x && head.y === apple.y) {
      score += 1;
      if (score > best) {
        best = score;
        localStorage.setItem('lola.snake.best', String(best));
      }
      placeApple();
      scheduleTick();
    } else {
      snake.pop();
    }

    updateScoreUi();
    updateDpadUi();
    draw();
  }

  function die() {
    gameOver = true;
    running = false;
    if (tickInterval) clearInterval(tickInterval);
    tickInterval = null;
    showOverlay('Game over · ' + score, 'press <strong>enter</strong> to play again');
    draw();
  }

  function updateScoreUi() {
    scoreEl.textContent = String(score).padStart(3, '0');
    bestEl.textContent  = String(best).padStart(3, '0');
  }

  function updateDpadUi() {
    if (!dpad) return;
    const map = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] };
    dpad.querySelectorAll('.dpad__btn').forEach(btn => {
      const [dx, dy] = map[btn.dataset.dir];
      btn.classList.toggle('is-pressed', running && !paused && dir.x === dx && dir.y === dy);
    });
  }

  function showOverlay(title, cta) {
    overlayTitle.textContent = title;
    overlayCta.innerHTML = cta;
    overlay.classList.add('is-on');
  }
  function hideOverlay() {
    overlay.classList.remove('is-on');
  }

  // ============ RENDER ============
  function draw() {
    // background
    ctx.fillStyle = COLOR.bg;
    ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

    // hairline grid
    ctx.strokeStyle = COLOR.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < COLS; i++) {
      const x = Math.round(i * CELL) + 0.5;
      ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_PX);
    }
    for (let i = 1; i < ROWS; i++) {
      const y = Math.round(i * CELL) + 0.5;
      ctx.moveTo(0, y); ctx.lineTo(CANVAS_PX, y);
    }
    ctx.stroke();

    // apple
    drawCell(apple.x, apple.y, COLOR.apple);

    // snake — body
    for (let i = 1; i < snake.length; i++) {
      drawCell(snake[i].x, snake[i].y, COLOR.body);
    }
    // snake — head (grey)
    if (snake.length) {
      drawCell(snake[0].x, snake[0].y, COLOR.head);
    }
  }

  function drawCell(gx, gy, color) {
    const pad = 2 * PIXEL_RATIO;
    const x = Math.round(gx * CELL) + pad;
    const y = Math.round(gy * CELL) + pad;
    const s = Math.round(CELL) - pad * 2;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, s, s);
  }

  // ============ INPUT ============
  function setDirection(dx, dy) {
    // can't reverse onto self
    if (snake && snake.length > 1) {
      if (dir.x === -dx && dir.y === -dy) return;
    }
    nextDir = { x: dx, y: dy };
    if (!running && !gameOver) start();
  }

  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (gameOver && (k === 'enter' || k === ' ')) {
      e.preventDefault();
      reset();
      start();
      return;
    }
    if (k === ' ') { e.preventDefault(); pause(); return; }
    if (k === 'arrowup'    || k === 'w') { e.preventDefault(); setDirection(0, -1); }
    if (k === 'arrowdown'  || k === 's') { e.preventDefault(); setDirection(0,  1); }
    if (k === 'arrowleft'  || k === 'a') { e.preventDefault(); setDirection(-1, 0); }
    if (k === 'arrowright' || k === 'd') { e.preventDefault(); setDirection( 1, 0); }
  });

  // d-pad clicks (also serves as touch)
  if (dpad) {
    dpad.querySelectorAll('.dpad__btn').forEach(btn => {
      const handler = (e) => {
        e.preventDefault();
        const d = btn.dataset.dir;
        if (d === 'up')    setDirection(0, -1);
        if (d === 'down')  setDirection(0,  1);
        if (d === 'left')  setDirection(-1, 0);
        if (d === 'right') setDirection( 1, 0);
      };
      btn.addEventListener('click', handler);
      btn.addEventListener('touchstart', handler, { passive: false });
    });
  }

  // swipe on the canvas
  let touchStart = null;
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  canvas.addEventListener('touchend', (e) => {
    if (!touchStart || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.max(ax, ay) < 20) return; // tap, not swipe
    if (ax > ay) setDirection(dx > 0 ? 1 : -1, 0);
    else         setDirection(0, dy > 0 ? 1 : -1);
    touchStart = null;
  });
  canvas.addEventListener('touchcancel', () => { touchStart = null; });

  // tap on canvas to start when not running
  canvas.addEventListener('click', () => {
    if (gameOver) { reset(); start(); return; }
    if (!running) start();
    else pause();
  });

  // ============ BOOT ============
  reset();
})();
