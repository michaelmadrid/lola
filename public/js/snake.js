// SNAKE.JS — Summer Holiday / Lola v0.3

// ─── Snake state ───────────────────────────
let _snakeCols = 22, _snakeRows = 22;
let _snake = [], _snakeDir = {x:1,y:0}, _snakeNext = {x:1,y:0};
let _apple = {x:8,y:8}, _snakeScore = 0, _snakeLoop = null, _snakeRunning = false;
let _snakeCells = [];
let _snakeTouchX = 0, _snakeTouchY = 0;

export function snakeInit() {
  const container = document.getElementById('snake-grid');
  if (!container) return;

  // Size grid — slightly smaller than viewport
  const vw = Math.min(window.innerWidth - 48, 340);
  const vh = window.innerHeight - 260;
  const size = Math.min(vw, vh);
  const cellSize = Math.floor(size / _snakeCols);
  const gridSize = cellSize * _snakeCols;

  container.style.width = gridSize + 'px';
  container.style.height = gridSize + 'px';
  container.style.gridTemplateColumns = 'repeat(' + _snakeCols + ', ' + cellSize + 'px)';
  container.style.gridTemplateRows = 'repeat(' + _snakeRows + ', ' + cellSize + 'px)';
  container.style.gap = '0px';
  container.style.background = 'var(--gray-xlight)';

  container.innerHTML = '';
  _snakeCells = [];
  for (let y = 0; y < _snakeRows; y++) {
    _snakeCells[y] = [];
    for (let x = 0; x < _snakeCols; x++) {
      const cell = document.createElement('div');
      cell.style.background = 'var(--card)';
      cell.style.border = '0.5px solid var(--gray-xlight)';
      cell.style.borderRadius = '2px';
      container.appendChild(cell);
      _snakeCells[y][x] = cell;
    }
  }

  const midX = Math.floor(_snakeCols / 2);
  const midY = Math.floor(_snakeRows / 2);
  // Start with 4 segments so it looks like a snake immediately
  _snake = [
    {x: midX, y: midY},
    {x: midX-1, y: midY},
    {x: midX-2, y: midY},
    {x: midX-3, y: midY},
  ];
  _snakeDir = {x:1,y:0}; _snakeNext = {x:1,y:0};
  _snakeScore = 0;
  _snakeRunning = false;
  document.getElementById('snake-score').textContent = 'Score: 0';
  document.getElementById('snake-btn').textContent = 'Play';
  snakePlaceApple();
  snakeDraw();
}

export function snakePlaceApple() {
  let pos;
  do { pos = {x: Math.floor(Math.random()*_snakeCols), y: Math.floor(Math.random()*_snakeRows)}; }
  while (_snake.some(s => s.x === pos.x && s.y === pos.y));
  _apple = pos;
}

export function snakeDraw() {
  if (!_snakeCells.length) return;
  for (let y = 0; y < _snakeRows; y++) {
    for (let x = 0; x < _snakeCols; x++) {
      const cell = _snakeCells[y][x];
      const isHead = _snake[0] && _snake[0].x === x && _snake[0].y === y;
      const isBody = !isHead && _snake.some((s,i) => i > 0 && s.x === x && s.y === y);
      const isApple = _apple.x === x && _apple.y === y;
      if (isHead) cell.style.background = 'var(--gray-mid)';
      else if (isBody) cell.style.background = 'var(--black)';
      else if (isApple) cell.style.background = 'var(--accent)';
      else cell.style.background = 'var(--card)';
    }
  }
}

export function snakeStart() {
  if (_snakeRunning) return;
  if (!_snakeCells.length) snakeInit();
  _snakeRunning = true;
  document.getElementById('snake-btn').textContent = 'Pause';
  _snakeLoop = setInterval(snakeTick, 130);
}

export function snakePause() {
  _snakeRunning = false;
  clearInterval(_snakeLoop);
  document.getElementById('snake-btn').textContent = 'Play';
}

export function snakeTick() {
  _snakeDir = {x: _snakeNext.x, y: _snakeNext.y};
  const head = {
    x: (_snake[0].x + _snakeDir.x + _snakeCols) % _snakeCols,
    y: (_snake[0].y + _snakeDir.y + _snakeRows) % _snakeRows
  };

  if (_snake.some(s => s.x === head.x && s.y === head.y)) {
    snakePause();
    // Game over overlay
    const container = document.getElementById('snake-grid');
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.6);display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:var(--radius);';
    overlay.innerHTML = '<div style="font-family:var(--font-display);font-size:22px;font-weight:600;color:white;margin-bottom:4px;">Game Over</div>'
      + '<div style="font-family:var(--font-mono);font-size:13px;color:rgba(255,255,255,0.7);">Score: ' + _snakeScore + '</div>';
    overlay.onclick = () => { overlay.remove(); snakeInit(); };
    container.style.position = 'relative';
    container.appendChild(overlay);
    return;
  }

  _snake.unshift(head);
  if (head.x === _apple.x && head.y === _apple.y) {
    _snakeScore++;
    document.getElementById('snake-score').textContent = 'Score: ' + _snakeScore;
    snakePlaceApple();
  } else {
    _snake.pop();
  }
  snakeDraw();
}

export function snakeDir(dx, dy) {
  if (dx !== 0 && _snakeDir.x !== 0) return;
  if (dy !== 0 && _snakeDir.y !== 0) return;
  _snakeNext = {x: dx, y: dy};
  if (!_snakeRunning) snakeStart();
}

// ─── Event listeners ──────────────────────────────────────────────────────────
function isIdleActive() {
  return document.getElementById('view-idle')?.classList.contains('active');
}

document.addEventListener('keydown', e => {
  if (!isIdleActive()) return;
  const map = {'ArrowUp':[0,-1],'ArrowDown':[0,1],'ArrowLeft':[-1,0],'ArrowRight':[1,0]};
  if (map[e.key]) { e.preventDefault(); snakeDir(...map[e.key]); }
  if (e.key === ' ') { e.preventDefault(); _snakeRunning ? snakePause() : snakeStart(); }
});


document.addEventListener('touchstart', e => {
  if (!isIdleActive()) return;
  _snakeTouchX = e.touches[0].clientX;
  _snakeTouchY = e.touches[0].clientY;
}, {passive: true});

document.addEventListener('touchend', e => {
  if (!isIdleActive()) return;
  const dx = e.changedTouches[0].clientX - _snakeTouchX;
  const dy = e.changedTouches[0].clientY - _snakeTouchY;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
  if (Math.abs(dx) > Math.abs(dy)) snakeDir(dx > 0 ? 1 : -1, 0);
  else snakeDir(0, dy > 0 ? 1 : -1);
}, {passive: true});
