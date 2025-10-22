// 表カレンダー手帳（外部ライブラリなし版）
(function(){
  'use strict';

  const $ = sel => document.querySelector(sel);
  const headerRow = $('#headerRow');
  const tbody = $('#tableBody');
  const monthLabel = $('#monthLabel');
  const prevMonthBtn = $('#prevMonth');
  const nextMonthBtn = $('#nextMonth');
  const todayBtn = $('#todayBtn');
  const addColumnBtn = $('#addColumn');
  const resetSizesBtn = $('#resetSizes');
  const exportBtn = $('#exportJSON');
  const importInput = $('#importJSON');
  const headerTemplate = $('#headerTemplate');

  const cellDialog = $('#cellDialog');
  const cellTitle = $('#cellTitle');
  const cellMemo = $('#cellMemo');
  const saveCellBtn = $('#saveCell');
  const clearCellBtn = $('#clearCell');

  let state = loadState() || defaultStateForMonth(fmtYM(new Date()));
  let activeCellKey = null; // "YYYY-MM-DD|colId"

  init();

  function defaultStateForMonth(monthStr){
    return {
      version: 2,
      month: monthStr,
      columns: [
        { id: genId(), title: '予定1', width: 220 },
        { id: genId(), title: '予定2', width: 220 }
      ],
      events: {}, // key: "date|colId" -> {title, memo}
      dateColWidth: 160,
      weekdayColWidth: 100,
      rowHeights: {}
    };
  }

  function init(){
    render();
    bindControls();
  }

  function saveState(){
    localStorage.setItem('plannerState', JSON.stringify(state));
  }
  function loadState(){
    try { return JSON.parse(localStorage.getItem('plannerState')); }
    catch(e){ return null; }
  }

  function fmtYM(d){
    const y = d.getFullYear();
    const m = ('0' + (d.getMonth()+1)).slice(-2);
    return `${y}-${m}`;
  }
  function fmtYMD(d){
    const y = d.getFullYear();
    const m = ('0' + (d.getMonth()+1)).slice(-2);
    const da = ('0' + d.getDate()).slice(-2);
    return `${y}-${m}-${da}`;
  }

  function monthStartEnd(monthStr){
    const [y,m] = monthStr.split('-').map(Number);
    const start = new Date(y, m-1, 1);
    const end = new Date(y, m, 0);
    return { start, end };
  }

  function setMonth(monthStr){
    state.month = monthStr;
    render();
    saveState();
  }

  function weekdayLabel(idx){
    return ['日曜','月曜','火曜','水曜','木曜','金曜','土曜'][idx];
  }

  function render(){
    const monthStr = state.month;
    const [y, m] = monthStr.split('-').map(Number);
    monthLabel.textContent = `${y}年 ${m}月`;

    // ヘッダー再構築
    while (headerRow.children.length > 2) headerRow.removeChild(headerRow.lastElementChild);
    headerRow.children[0].style.width = state.dateColWidth + 'px';
    headerRow.children[1].style.width = state.weekdayColWidth + 'px';
    syncStickyLeftOffsets();

    state.columns.forEach(col => {
      const th = headerTemplate.content.firstElementChild.cloneNode(true);
      th.dataset.colId = col.id;
      th.style.width = (col.width || 220) + 'px';
      th.querySelector('.th-title').textContent = col.title || '予定';

      // 列名編集
      th.querySelector('.th-title').addEventListener('input', (e) => {
        col.title = e.currentTarget.textContent.trim();
        saveState();
      });

      // 列削除
      th.querySelector('.delete-col').addEventListener('click', () => {
        if (!confirm('この列を削除しますか？（中の予定も削除）')) return;
        const suffix = '|' + col.id;
        Object.keys(state.events).forEach(k => { if (k.endsWith(suffix)) delete state.events[k]; });
        state.columns = state.columns.filter(c => c.id !== col.id);
        saveState();
        render();
      });

      // 幅リサイズ
      enableColResize(th.querySelector('.col-resizer'), (w) => {
        col.width = Math.max(80, w);
        th.style.width = col.width + 'px';
        saveState();
      });

      headerRow.appendChild(th);
    });

    // 行生成
    tbody.innerHTML = '';
    const {start, end} = monthStartEnd(monthStr);
    const d = new Date(start);
    while (d <= end){
      const tr = document.createElement('tr');
      tr.className = 'row-wrapper';
      const dateStr = fmtYMD(d);

      const thDate = document.createElement('th');
      thDate.className = 'date-cell row-height';
      thDate.textContent = dateStr;
      thDate.style.width = state.dateColWidth + 'px';
      if (state.rowHeights[dateStr]) tr.style.setProperty('--row-height', state.rowHeights[dateStr] + 'px');

      const tdW = document.createElement('td');
      tdW.className = 'weekday-cell row-height';
      tdW.textContent = weekdayLabel(d.getDay());
      tdW.style.width = state.weekdayColWidth + 'px';

      tr.appendChild(thDate);
      tr.appendChild(tdW);

      state.columns.forEach(col => {
        const td = document.createElement('td');
        td.className = 'row-height';
        const key = dateStr + '|' + col.id;
        const data = state.events[key];
        const div = document.createElement('div');
        div.className = 'cell ' + (data && data.title ? '' : 'empty');
        div.tabIndex = 0;
        div.dataset.key = key;

        const span = document.createElement('span');
        span.className = 'cell-title';
        span.textContent = data && data.title ? data.title : '（タップで入力）';
        div.appendChild(span);

        div.addEventListener('click', () => openCellEditor(key));
        td.appendChild(div);
        tr.appendChild(td);
      });

      const rowResizer = document.createElement('div');
      rowResizer.className = 'row-resizer';
      tr.appendChild(rowResizer);
      enableRowResize(rowResizer, dateStr, (h) => {
        state.rowHeights[dateStr] = Math.max(28, h);
        tr.style.setProperty('--row-height', state.rowHeights[dateStr] + 'px');
        saveState();
      });

      tbody.appendChild(tr);
      d.setDate(d.getDate() + 1);
    }

    // 固定列のリサイズ
    document.querySelectorAll('th[data-col-fixed="date"] .col-resizer').forEach(res => {
      enableColResize(res, (w) => {
        state.dateColWidth = Math.max(100, w);
        headerRow.children[0].style.width = state.dateColWidth + 'px';
        document.querySelectorAll('.date-cell').forEach(c => c.style.width = state.dateColWidth + 'px');
        syncStickyLeftOffsets();
        saveState();
      });
    });
    document.querySelectorAll('th[data-col-fixed="weekday"] .col-resizer').forEach(res => {
      enableColResize(res, (w) => {
        state.weekdayColWidth = Math.max(80, w);
        headerRow.children[1].style.width = state.weekdayColWidth + 'px';
        document.querySelectorAll('.weekday-cell').forEach(c => c.style.width = state.weekdayColWidth + 'px');
        syncStickyLeftOffsets();
        saveState();
      });
    });
  }

  function syncStickyLeftOffsets(){
    const dateW = headerRow.children[0].getBoundingClientRect().width;
    headerRow.children[0].style.left = '0px';
    headerRow.children[1].style.left = dateW + 'px';
    document.querySelectorAll('tbody th.date-cell').forEach(el => el.style.left = '0px');
    document.querySelectorAll('tbody td.weekday-cell').forEach(el => el.style.left = dateW + 'px');
  }

  function bindControls(){
    prevMonthBtn.addEventListener('click', () => {
      const [y, m] = state.month.split('-').map(Number);
      const dt = new Date(y, m-2, 1);
      setMonth(fmtYM(dt));
    });
    nextMonthBtn.addEventListener('click', () => {
      const [y, m] = state.month.split('-').map(Number);
      const dt = new Date(y, m, 1);
      setMonth(fmtYM(dt));
    });
    todayBtn.addEventListener('click', () => {
      setMonth(fmtYM(new Date()));
    });
    addColumnBtn.addEventListener('click', () => {
      state.columns.push({ id: genId(), title: '予定', width: 220 });
      saveState();
      render();
    });
    resetSizesBtn.addEventListener('click', () => {
      if (!confirm('列幅・行高を初期化しますか？')) return;
      state.dateColWidth = 160;
      state.weekdayColWidth = 100;
      state.columns.forEach(c => c.width = 220);
      state.rowHeights = {};
      saveState();
      render();
    });
    exportBtn.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `planner-${state.month}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
    importInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const obj = JSON.parse(reader.result);
          if (!obj || typeof obj !== 'object' || !obj.month) throw new Error('不正なファイルです');
          state = obj;
          saveState();
          render();
        } catch (err) {
          alert('JSONの読み込みに失敗しました: ' + err.message);
        }
      };
      reader.readAsText(file, 'utf-8');
      e.target.value = '';
    });

    saveCellBtn.addEventListener('click', onSaveCell);
    clearCellBtn.addEventListener('click', onClearCell);
  }

  function openCellEditor(key){
    activeCellKey = key;
    const data = state.events[key] || { title: '', memo: '' };
    cellTitle.value = data.title || '';
    cellMemo.value = data.memo || '';
    if (typeof cellDialog.showModal === 'function') {
      cellDialog.showModal();
    } else {
      const title = prompt('タイトルを入力', cellTitle.value) || '';
      const memo = prompt('メモを入力', cellMemo.value) || '';
      applyCellEdit(title, memo);
    }
  }
  function onSaveCell(){
    applyCellEdit(cellTitle.value.trim(), cellMemo.value.trim());
  }
  function onClearCell(){
    applyCellEdit('', '');
    cellTitle.value = '';
    cellMemo.value = '';
  }
  function applyCellEdit(title, memo){
    if (!activeCellKey) return;
    if (!title && !memo) { delete state.events[activeCellKey]; }
    else { state.events[activeCellKey] = { title, memo }; }
    saveState();
    const el = document.querySelector(`.cell[data-key="${cssEscape(activeCellKey)}"]`);
    if (el){
      el.querySelector('.cell-title').textContent = title || '（タップで入力）';
      el.classList.toggle('empty', !title);
    }
  }

  /* リサイズ */
  function enableColResize(handle, onDone){
    let startX, startW, th;
    const start = (e) => {
      e.preventDefault();
      th = handle.closest('th');
      startX = clientX(e);
      startW = th.getBoundingClientRect().width;
      document.addEventListener('mousemove', move, { passive: false });
      document.addEventListener('mouseup', end, { passive: false });
      document.addEventListener('touchmove', move, { passive: false });
      document.addEventListener('touchend', end, { passive: false });
    };
    const move = (e) => {
      e.preventDefault();
      const dx = clientX(e) - startX;
      const w = Math.max(80, Math.round(startW + dx));
      th.style.width = w + 'px';
      if (th.dataset.colFixed === 'date') {
        document.querySelectorAll('.date-cell').forEach(c => c.style.width = w + 'px');
        syncStickyLeftOffsets();
      } else if (th.dataset.colFixed === 'weekday') {
        document.querySelectorAll('.weekday-cell').forEach(c => c.style.width = w + 'px');
        syncStickyLeftOffsets();
      }
    };
    const end = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', end);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      const finalW = Math.round(th.getBoundingClientRect().width);
      onDone(finalW);
    };
    handle.addEventListener('mousedown', start);
    handle.addEventListener('touchstart', start, { passive: false });
  }

  function enableRowResize(handle, dateStr, onDone){
    let startY, startH, tr;
    const start = (e) => {
      e.preventDefault();
      tr = handle.closest('tr');
      startY = clientY(e);
      startH = tr.getBoundingClientRect().height;
      document.addEventListener('mousemove', move, { passive: false });
      document.addEventListener('mouseup', end, { passive: false });
      document.addEventListener('touchmove', move, { passive: false });
      document.addEventListener('touchend', end, { passive: false });
    };
    const move = (e) => {
      e.preventDefault();
      const dy = clientY(e) - startY;
      const h = Math.max(28, Math.round(startH + dy));
      tr.style.setProperty('--row-height', h + 'px');
    };
    const end = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', end);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      const finalH = Math.round(parseFloat(getComputedStyle(tr).getPropertyValue('--row-height')) || tr.getBoundingClientRect().height);
      onDone(finalH);
    };
    handle.addEventListener('mousedown', start);
    handle.addEventListener('touchstart', start, { passive: false });
  }

  /* Utils */
  function genId(){ return Math.random().toString(36).slice(2, 10); }
  function clientX(e){ return e.touches ? e.touches[0].clientX : e.clientX; }
  function clientY(e){ return e.touches ? e.touches[0].clientY : e.clientY; }
  function cssEscape(s){ return s.replace(/["\\]/g, '\\$&'); }

})();