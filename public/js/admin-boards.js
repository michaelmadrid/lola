/* =========================================================
   admin-boards.js
   Boards ("Editions") editor. Same free x/y placement mechanics
   proven out in the prototype — this file wires it to real data
   via api.js instead of a local array.

   URL: /admin/boards.html?id=123
   ========================================================= */

(function(){

  var ASPECT_FALLBACK = 0.75; // used only until an item's real image loads

  var boardId = new URLSearchParams(location.search).get('id');
  if (!boardId) {
    document.getElementById('boardTitle').textContent = 'No board selected';
    return;
  }

  var ITEMS = [];       // in-memory working copy — saved via debounced PATCH per item
  var board = null;
  var activeId = null;
  var isPreviewMode = false;
  var driftOffset = 0;
  var driftRunning = false;
  var FRAME_WIDTH = 800 + 40;

  var driftTrack   = document.getElementById('driftTrack');
  var itemList     = document.getElementById('itemList');
  var modeToggle   = document.getElementById('modeToggle');
  var modeHint     = document.getElementById('modeHint');
  var gridToggle   = document.getElementById('gridToggle');
  var titleInput   = document.getElementById('titleInput');
  var vibeInput    = document.getElementById('vibeInput');
  var statusSelect = document.getElementById('statusSelect');
  var setHomeBtn   = document.getElementById('setHomeBtn');
  var boardTitleEl = document.getElementById('boardTitle');

  /* ── Load ─────────────────────────────────────────────────── */
  async function load(){
    try {
      var data = await api.get('/api/boards/' + boardId);
      board = data.board;
      ITEMS = data.items.map(function(row){
        return {
          itemId: row.id,
          noteId: row.note_id,
          label: row.headline || '',
          image: row.image_url,
          x: parseFloat(row.x_pct),
          y: parseFloat(row.y_pct),
          w: parseFloat(row.width_pct)
        };
      });

      boardTitleEl.textContent = board.title;
      titleInput.value = board.title;
      vibeInput.value = board.vibe || '';
      statusSelect.value = board.status;
      setHomeBtn.textContent = board.status === 'published' ? 'Set as Home' : 'Publish to set as Home';
      setHomeBtn.disabled = board.status !== 'published';

      renderEditFrame();
    } catch (err) {
      boardTitleEl.textContent = 'Could not load board';
      console.error(err);
    }
  }

  /* ── Debounced field saves ───────────────────────────────── */
  var fieldSaveTimer = null;
  function saveFields(){
    clearTimeout(fieldSaveTimer);
    fieldSaveTimer = setTimeout(function(){
      api.patch('/api/boards/' + boardId, {
        title: titleInput.value,
        vibe: vibeInput.value
      }).then(function(data){
        boardTitleEl.textContent = data.board.title;
      }).catch(function(err){ console.error('Save failed', err); });
    }, 500);
  }
  titleInput.addEventListener('input', saveFields);
  vibeInput.addEventListener('input', saveFields);

  statusSelect.addEventListener('change', function(){
    api.patch('/api/boards/' + boardId, { status: statusSelect.value })
      .then(function(){
        setHomeBtn.disabled = statusSelect.value !== 'published';
        setHomeBtn.textContent = statusSelect.value === 'published' ? 'Set as Home' : 'Publish to set as Home';
      })
      .catch(function(err){ console.error('Status update failed', err); });
  });

  setHomeBtn.addEventListener('click', function(){
    api.patch('/api/boards/_home/config', { source: 'board', board_id: boardId })
      .then(function(){ setHomeBtn.textContent = '✓ This is Home'; })
      .catch(function(err){ console.error('Set-home failed', err); alert('Could not set as home — see console.'); });
  });

  /* ── Debounced per-item placement saves — fires while dragging
     but only actually PATCHes ~150ms after movement stops, so a
     smooth drag doesn't fire dozens of requests. ─────────────── */
  var placementSaveTimers = {};
  function savePlacement(item){
    clearTimeout(placementSaveTimers[item.itemId]);
    placementSaveTimers[item.itemId] = setTimeout(function(){
      api.patch('/api/boards/' + boardId + '/items/' + item.itemId, {
        x_pct: item.x, y_pct: item.y, width_pct: item.w
      }).catch(function(err){ console.error('Placement save failed', err); });
    }, 150);
  }

  /* ── z-order — server reindexes ALL items in one call so
     position stays a dense, unambiguous sequence. ────────────── */
  function reorder(item, direction){
    api.post('/api/boards/' + boardId + '/items/' + item.itemId + '/reorder', { direction: direction })
      .then(function(){ return load(); })
      .catch(function(err){ console.error('Reorder failed', err); });
  }

  function removeItem(item){
    if (!confirm('Remove "' + item.label + '" from this board?')) return;
    api.delete('/api/boards/' + boardId + '/items/' + item.itemId)
      .then(function(){ return load(); })
      .catch(function(err){ console.error('Remove failed', err); });
  }

  /* ── Rendering — same mechanics as the prototype ─────────── */

  function setActive(id){
    activeId = id;
    document.querySelectorAll('.board-item-card, .boards-free-item').forEach(function(el){
      el.classList.toggle('is-active', el.dataset.id == id);
    });
  }

  function buildGrid(){
    var grid = document.createElement('div');
    grid.className = 'boards-canvas-grid';
    for (var i = 0; i < 12; i++){
      var col = document.createElement('div');
      col.className = 'boards-canvas-grid__col';
      grid.appendChild(col);
    }
    if (!gridToggle.checked) grid.classList.add('is-hidden');
    return grid;
  }

  function buildFrameEl(interactive){
    var frame = document.createElement('div');
    frame.className = 'boards-canvas-frame';
    frame.appendChild(buildGrid());

    var forDom = ITEMS.slice().reverse();
    forDom.forEach(function(item){
      var el = document.createElement('div');
      el.className = 'boards-free-item';
      el.dataset.id = item.itemId;
      if (item.image){
        el.style.backgroundImage = 'url(' + item.image + ')';
      } else {
        el.style.background = '#ddd';
      }
      if (interactive){
        el.innerHTML = '<div class="boards-free-item__resize" data-resize="' + item.itemId + '"></div>';
        el.addEventListener('pointerdown', function(e){
          if (e.target.dataset.resize) return;
          startMove(item, e);
        });
      }
      frame.appendChild(el);
    });
    return frame;
  }

  function applyPlacementTo(frame){
    var rect = frame.getBoundingClientRect();
    ITEMS.forEach(function(item){
      var el = frame.querySelector('.boards-free-item[data-id="' + item.itemId + '"]');
      if (!el) return;
      var wPx = rect.width * (item.w / 100);
      var hPx = wPx * ASPECT_FALLBACK; // real <img> aspect handled via object-fit in production; fine for placement math here
      el.style.left = (rect.width * (item.x / 100)) + 'px';
      el.style.top = (rect.height * (item.y / 100)) + 'px';
      el.style.width = wPx + 'px';
      el.style.height = hPx + 'px';
    });
  }

  function renderEditFrame(){
    itemList.innerHTML = '';
    if (!ITEMS.length){
      itemList.innerHTML = '<div class="stream__empty">No items yet — add some from the library.</div>';
    }
    ITEMS.forEach(function(item, i){
      var card = document.createElement('div');
      card.className = 'board-item-card';
      card.dataset.id = item.itemId;
      var thumbStyle = item.image ? 'background-image:url(' + item.image + ')' : 'background:#ddd';
      card.innerHTML =
        '<div class="board-item-card__thumb" style="' + thumbStyle + '"></div>' +
        '<div class="board-item-card__body">' +
          '<div class="board-item-card__name">' + esc(item.label) + '</div>' +
          '<div class="board-item-card__z">Layer ' + (ITEMS.length - i) + ' of ' + ITEMS.length + '</div>' +
        '</div>' +
        '<div class="board-item-card__actions">' +
          '<button class="icon-btn" data-action="front" title="Bring to front">⬆</button>' +
          '<button class="icon-btn" data-action="back" title="Send to back">⬇</button>' +
          '<button class="icon-btn" data-action="remove" title="Remove">×</button>' +
        '</div>';
      card.addEventListener('click', function(e){
        var action = e.target.dataset.action;
        if (action === 'front') return reorder(item, 'front');
        if (action === 'back') return reorder(item, 'back');
        if (action === 'remove') return removeItem(item);
        setActive(item.itemId);
      });
      itemList.appendChild(card);
    });

    driftTrack.innerHTML = '';
    driftTrack.style.transform = 'translateY(-50%)';
    var frame = buildFrameEl(true);
    driftTrack.appendChild(frame);
    applyPlacementTo(frame);

    frame.addEventListener('pointerdown', function(e){
      var id = e.target.dataset.resize;
      if (!id) return;
      e.stopPropagation();
      var item = ITEMS.find(function(i){ return i.itemId == id; });
      setActive(item.itemId);
      var rect = frame.getBoundingClientRect();
      var startX = e.clientX;
      var startW = item.w;
      function move(ev){
        var dxPct = ((ev.clientX - startX) / rect.width) * 100;
        item.w = Math.max(6, Math.min(70, startW + dxPct));
        applyPlacementTo(frame);
      }
      function up(){
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        savePlacement(item);
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  }

  function startMove(item, e){
    setActive(item.itemId);
    var frame = driftTrack.querySelector('.boards-canvas-frame');
    var el = frame.querySelector('.boards-free-item[data-id="' + item.itemId + '"]');
    el.classList.add('is-dragging');
    var rect = frame.getBoundingClientRect();
    var startX = e.clientX, startY = e.clientY;
    var startXPct = item.x, startYPct = item.y;
    function move(ev){
      var dxPct = ((ev.clientX - startX) / rect.width) * 100;
      var dyPct = ((ev.clientY - startY) / rect.height) * 100;
      item.x = Math.max(-10, Math.min(100, startXPct + dxPct));
      item.y = Math.max(-10, Math.min(100, startYPct + dyPct));
      applyPlacementTo(frame);
    }
    function up(){
      el.classList.remove('is-dragging');
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      savePlacement(item);
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  function renderPreview(){
    driftTrack.innerHTML = '';
    driftTrack.style.transform = 'translateY(-50%)';
    for (var i = 0; i < 4; i++){
      var frame = buildFrameEl(false);
      driftTrack.appendChild(frame);
      applyPlacementTo(frame);
    }
    driftOffset = 0;
    driftRunning = true;
    requestAnimationFrame(tickDrift);
  }

  function tickDrift(){
    if (!driftRunning) return;
    driftOffset += 0.6;
    if (driftOffset >= FRAME_WIDTH) driftOffset -= FRAME_WIDTH;
    driftTrack.style.transform = 'translateY(-50%) translateX(' + (-driftOffset) + 'px)';
    requestAnimationFrame(tickDrift);
  }

  modeToggle.addEventListener('click', function(){
    isPreviewMode = !isPreviewMode;
    driftRunning = false;
    if (isPreviewMode){
      modeToggle.textContent = '◀ Back to editing';
      modeHint.textContent = 'Same composition, tiled and drifting — items never move relative to each other, only the whole frame pans sideways.';
      renderPreview();
    } else {
      modeToggle.textContent = 'Preview drift ▶';
      modeHint.textContent = 'Drag anywhere to move · drag the accent dot to resize · list order (left) is front-to-back stacking';
      renderEditFrame();
    }
  });

  gridToggle.addEventListener('change', function(){
    document.querySelectorAll('.boards-canvas-grid').forEach(function(g){
      g.classList.toggle('is-hidden', !gridToggle.checked);
    });
  });

  window.addEventListener('resize', function(){
    if (!isPreviewMode){
      var frame = driftTrack.querySelector('.boards-canvas-frame');
      if (frame) applyPlacementTo(frame);
    }
  });

  function esc(s){
    var div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  }

  /* ── Add-notes picker — wired separately, opens on demand ──── */
  document.getElementById('addNotesBtn').addEventListener('click', openNotePicker);
  document.getElementById('notePickerClose').addEventListener('click', closeNotePicker);

  function openNotePicker(){
    document.getElementById('notePicker').hidden = false;
    api.get('/api/board-notes?status=published').then(function(data){
      renderNotePicker(data.notes || []);
    }).catch(function(err){ console.error('Could not load notes', err); });
  }
  function closeNotePicker(){
    document.getElementById('notePicker').hidden = true;
  }
  function renderNotePicker(notes){
    var grid = document.getElementById('notePickerGrid');
    grid.innerHTML = '';
    var addedIds = ITEMS.map(function(i){ return i.noteId; });
    notes.filter(function(n){ return !!n.image_url; }).forEach(function(n){
      var el = document.createElement('div');
      el.className = 'boards-note-picker__item' + (addedIds.indexOf(n.id) > -1 ? ' is-added' : '');
      el.innerHTML = '<img src="' + n.image_url + '" alt=""><span>' + esc(n.headline || '') + '</span>';
      el.addEventListener('click', function(){
        api.post('/api/boards/' + boardId + '/items', { note_id: n.id })
          .then(function(){ closeNotePicker(); return load(); })
          .catch(function(err){ console.error('Add failed', err); });
      });
      grid.appendChild(el);
    });
  }

  load();

})();
