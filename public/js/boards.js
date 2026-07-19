/* =========================================================
   boards.js
   Boards index — lists all editions as cards, "+ New board"
   creates one and jumps into the editor. Mirrors the shape of
   notes.js / spots.js for the list side.
   ========================================================= */

(function(){

  var listEl = document.getElementById('boards-list');
  var countEl = document.getElementById('board-count');
  var addBtn = document.getElementById('board-add-btn');

  function esc(s){
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function statusLabel(status){
    return { draft: 'Draft', published: 'Published', archived: 'Archived' }[status] || status;
  }

  async function load(){
    try {
      var data = await api.get('/api/boards');
      var boards = data.boards || [];
      countEl.textContent = boards.length + (boards.length === 1 ? ' board' : ' boards');

      if (!boards.length){
        listEl.innerHTML = '<div class="stream__empty">No boards yet. Create your first edition.</div>';
        return;
      }

      listEl.innerHTML = '';
      boards.forEach(function(b){
        var card = document.createElement('a');
        card.className = 'board-card';
        card.href = '/boards/edit.html?id=' + b.id;
        card.innerHTML =
          '<div class="board-card__body">' +
            '<div class="board-card__title">' + esc(b.title) + '</div>' +
            '<div class="board-card__meta">' +
              '<span class="board-card__status board-card__status--' + b.status + '">' + statusLabel(b.status) + '</span>' +
              '<span class="board-card__count">' + b.item_count + (b.item_count == 1 ? ' item' : ' items') + '</span>' +
            '</div>' +
          '</div>';
        listEl.appendChild(card);
      });
    } catch (err) {
      console.error('Could not load boards', err);
      listEl.innerHTML = '<div class="stream__empty">Could not load boards.</div>';
    }
  }

  addBtn.addEventListener('click', async function(){
    var title = prompt('Edition title?');
    if (!title || !title.trim()) return;
    try {
      var data = await api.post('/api/boards', { title: title.trim() });
      location.href = '/boards/edit.html?id=' + data.board.id;
    } catch (err) {
      console.error('Could not create board', err);
      alert('Could not create board — see console.');
    }
  });

  load();

})();
