/* =========================================================
   admin-boards.js
   Boards ("Editions") editor. Same free x/y placement mechanics
   proven out in the prototype — this file wires it to real data
   via api.js instead of a local array.

   URL: /admin/boards.html?id=123
   ========================================================= */

(function(){

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
  var frameLoopWidth = 840; // measured dynamically in renderPreview from the real rendered frame

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

      // Apply THIS board's stored aspect ratio to the canvas — read
      // from the board, not a hardcoded constant, so every board edits
      // and previews at the exact ratio it was composed against. New
      // boards get the API's default; old boards keep their own.
      var aspectW = board.aspect_w || 32;
      var aspectH = board.aspect_h || 9;
      document.documentElement.style.setProperty('--board-aspect', aspectW + ' / ' + aspectH);
      ITEMS = data.items.map(function(row){
        return {
          itemId: row.id,
          noteId: row.note_id,
          label: row.headline || '',
          image: imgSrc(row.image_url),
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

  // Safe-zone guide — top/bottom buffer bands. Toggled with the grid.
  function buildSafeZone(){
    var safe = document.createElement('div');
    safe.className = 'boards-canvas-safe';
    if (!gridToggle.checked) safe.classList.add('is-hidden');
    return safe;
  }

  function buildFrameEl(interactive){
    var frame = document.createElement('div');
    frame.className = 'boards-canvas-frame';
    frame.appendChild(buildGrid());
    frame.appendChild(buildSafeZone());

    var forDom = ITEMS.slice().reverse();
    forDom.forEach(function(item){
      var el = document.createElement('div');
      el.className = 'boards-free-item';
      el.dataset.id = item.itemId;
      if (item.image){
        var img = document.createElement('img');
        img.src = item.image;
        img.alt = item.label || '';
        img.draggable = false;
        el.appendChild(img);
      } else {
        el.style.background = '#ddd';
      }
      if (interactive){
        var handle = document.createElement('div');
        handle.className = 'boards-free-item__resize';
        handle.dataset.resize = item.itemId;
        el.appendChild(handle);
        el.addEventListener('pointerdown', function(e){
          if (e.target.dataset.resize) return;
          startMove(item, e);
        });
      }
      frame.appendChild(el);
    });
    return frame;
  }

  // Only WIDTH is authored. Height comes from the image's natural
  // aspect ratio (the <img> is width:100%, height:auto in CSS) — so
  // we never set an explicit height on the item box; it wraps its
  // image. Matches home.html exactly.
  function applyPlacementTo(frame){
    var rect = frame.getBoundingClientRect();
    ITEMS.forEach(function(item){
      var el = frame.querySelector('.boards-free-item[data-id="' + item.itemId + '"]');
      if (!el) return;
      el.style.left = (rect.width * (item.x / 100)) + 'px';
      el.style.top = (rect.height * (item.y / 100)) + 'px';
      el.style.width = (rect.width * (item.w / 100)) + 'px';
      el.style.height = 'auto';
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
    driftTrack.style.transform = 'translateX(0)';
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
        item.w = Math.max(3, Math.min(70, startW + dxPct));
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
    driftTrack.style.transform = 'translateX(0)';
    for (var i = 0; i < 4; i++){
      var frame = buildFrameEl(false);
      driftTrack.appendChild(frame);
      applyPlacementTo(frame);
    }
    // Measure the real rendered frame (incl. its right margin) so the
    // loop wraps correctly regardless of the now-dynamic frame size.
    var firstFrame = driftTrack.querySelector('.boards-canvas-frame');
    frameLoopWidth = firstFrame ? (firstFrame.getBoundingClientRect().width + 40) : 840;
    driftOffset = 0;
    driftRunning = true;
    requestAnimationFrame(tickDrift);
  }

  function tickDrift(){
    if (!driftRunning) return;
    driftOffset += 0.6;
    if (driftOffset >= frameLoopWidth) driftOffset -= frameLoopWidth;
    driftTrack.style.transform = 'translateX(' + (-driftOffset) + 'px)';
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
    document.querySelectorAll('.boards-canvas-grid, .boards-canvas-safe').forEach(function(g){
      g.classList.toggle('is-hidden', !gridToggle.checked);
    });
  });

  // Drawer toggle — slide the left panel out of the way to see the
  // canvas full-width. Overlay style, so the canvas doesn't resize;
  // no placement recompute needed on toggle.
  var editorEl = document.getElementById('boardsEditor');
  var drawerToggle = document.getElementById('drawerToggle');
  if (editorEl && drawerToggle){
    drawerToggle.addEventListener('click', function(){
      var closed = editorEl.classList.toggle('drawer-closed');
      drawerToggle.textContent = closed ? '›' : '‹';
    });
  }

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

  /* ── Add-notes picker ────────────────────────────────────────
     Pulls ALL published notes (the /public/grid endpoint), not just
     feed notes — since notes default off-feed now, the feed endpoint
     would be nearly empty. Filterable by search text AND category,
     both client-side (no extra requests). */
  var pickerNotes = [];   // cached full list
  var pickerCat = '';     // active category filter ('' = all)

  document.getElementById('addNotesBtn').addEventListener('click', openNotePicker);
  document.getElementById('notePickerClose').addEventListener('click', closeNotePicker);
  document.getElementById('notePickerSearch').addEventListener('input', function(){
    renderNotePicker(filterNotes());
  });

  function openNotePicker(){
    document.getElementById('notePicker').classList.add('is-open');
    document.getElementById('notePickerSearch').value = '';
    api.get('/api/board-notes/public/grid').then(function(data){
      pickerNotes = (data.notes || []).filter(function(n){ return !!n.image_url; });
      buildPickerCatFilter();
      renderNotePicker(filterNotes());
    }).catch(function(err){ console.error('Could not load notes', err); });
  }
  function closeNotePicker(){
    document.getElementById('notePicker').classList.remove('is-open');
  }

  // Build the category dropdown from whatever categories actually
  // appear in the fetched notes (only shows cats that have notes).
  function buildPickerCatFilter(){
    var sel = document.getElementById('notePickerCat');
    if (!sel) return;
    var slugs = {};
    pickerNotes.forEach(function(n){ if (n.category) slugs[n.category] = true; });
    var opts = '<option value="">All categories</option>';
    Object.keys(slugs).sort().forEach(function(slug){
      var selected = slug === pickerCat ? ' selected' : '';
      opts += '<option value="' + esc(slug) + '"' + selected + '>' + esc(slug) + '</option>';
    });
    sel.innerHTML = opts;
    sel.onchange = function(){
      pickerCat = sel.value;
      renderNotePicker(filterNotes());
    };
  }

  // Combined search + category filter.
  function filterNotes(){
    var q = (document.getElementById('notePickerSearch').value || '').trim().toLowerCase();
    return pickerNotes.filter(function(n){
      if (pickerCat && (n.category || '') !== pickerCat) return false;
      if (q && (n.headline || '').toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }
  function renderNotePicker(notes){
    var grid = document.getElementById('notePickerGrid');
    grid.innerHTML = '';
    var addedIds = ITEMS.map(function(i){ return i.noteId; });
    if (!notes.length){
      grid.innerHTML = '<div class="stream__empty">No matching notes with images.</div>';
      return;
    }
    notes.forEach(function(n){
      var el = document.createElement('div');
      el.className = 'boards-note-picker__item' + (addedIds.indexOf(n.id) > -1 ? ' is-added' : '');
      el.innerHTML = '<img src="' + imgSrc(n.image_url) + '" alt=""><span>' + esc(n.headline || '') + '</span>';
      el.addEventListener('click', function(){
        api.post('/api/boards/' + boardId + '/items', { note_id: n.id })
          .then(function(){ closeNotePicker(); return load(); })
          .catch(function(err){ console.error('Add failed', err); });
      });
      grid.appendChild(el);
    });
  }

  // Prefix relative upload paths with the API origin, same as home.html.
  function imgSrc(url){
    if (!url) return '';
    return url.indexOf('http') === 0 ? url : (location.origin + url);
  }

  load();

})();
