// 表カレンダー手帳 v3（複数日スパン + 時間対応、外部ライブラリなし）
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
  const startDateInput = $('#startDate');
  const endDateInput = $('#endDate');
  const startTimeInput = $('#startTime');
  const endTimeInput = $('#endTime');
  const saveCellBtn = $('#saveCell');
  const clearCellBtn = $('#clearCell');
  const clearSpanBtn = $('#clearSpan');
  const scopeRow = $('#scopeRow');

  let state = migrate(loadState()) || defaultStateForMonth(fmtYM(new Date()));
  let activeCellKey = null; // "YYYY-MM-DD|colId"
  let activeCellDate = null; // "YYYY-MM-DD"
  let activeColId = null;

  init();

  function defaultStateForMonth(monthStr){
    return {
      version: 3,
      month: monthStr,
      columns: [
        { id: genId(), title: '予定1', width: 240 },
        { id: genId(), title: '予定2', width: 240 }
      ],
      events: {}, // key: "date|colId" -> {title, memo, startTime, endTime, spanId?, spanStart?, spanEnd?}
      dateColWidth: 180,
      weekdayColWidth: 110,
      rowHeights: {}
    };
  }

  function migrate(s){
    if (!s) return null;
    if (!s.version) s.version = 1;
    // v1/v2 -> v3: keep fields, bump version
    if (s.version < 3){
      s.version = 3;
      s.dateColWidth = s.dateColWidth || 180;
      s.weekdayColWidth = s.weekdayColWidth || 110;
      // events remain compatible
    }
    return s;
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
  function addDays(dateStr, n){
    const [y,m,d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m-1, d);
    dt.setDate(dt.getDate() + n);
    return fmtYMD(dt);
  }
  function eachDateInclusive(startStr, endStr, cb){
    let cur = startStr;
    while (cur <= endStr){
      cb(cur);
      cur = addDays(cur, 1);
    }
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
      th.style.width = (col.width || 240) + 'px';
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
        div.dataset.date = dateStr;
        div.dataset.colId = col.id;

        const span = document.createElement('span');
        span.className = 'cell-title';
        span.textContent = formatTitle(data);
        div.appendChild(span);

        div.addEventListener('click', (e) => openCellEditor(key, dateStr, col.id));
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
        state.dateColWidth = Math.max(120, w);
        headerRow.children[0].style.width = state.dateColWidth + 'px';
        document.querySelectorAll('.date-cell').forEach(c => c.style.width = state.dateColWidth + 'px');
        syncStickyLeftOffsets();
        saveState();
      });
    });
    document.querySelectorAll('th[data-col-fixed="weekday"] .col-resizer').forEach(res => {
      enableColResize(res, (w) => {
        state.weekdayColWidth = Math.max(90, w);
        headerRow.children[1].style.width = state.weekdayColWidth + 'px';
        document.querySelectorAll('.weekday-cell').forEach(c => c.style.width = state.weekdayColWidth + 'px');
        syncStickyLeftOffsets();
        saveState();
      });
    });
  }

  function formatTitle(data){
    if (!data || (!data.title && !data.startTime && !data.endTime)) return '（タップで入力）';
    const t = data.title || '';
    const st = data.startTime || '';
    const et = data.endTime || '';
    const time = st && et ? `${st}–${et} ` : (st ? `${st} ` : (et ? `${et} ` : ''));
    return (time + t).trim();
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
      state.columns.push({ id: genId(), title: '予定', width: 240 });
      saveState();
      render();
    });
    resetSizesBtn.addEventListener('click', () => {
      if (!confirm('列幅・行高を初期化しますか？')) return;
      state.dateColWidth = 180;
      state.weekdayColWidth = 110;
      state.columns.forEach(c => c.width = 240);
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
          state = migrate(obj);
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
    clearSpanBtn.addEventListener('click', onClearSpan);
  }

  /* ---- 編集ダイアログ ---- */
  function openCellEditor(key, dateStr, colId){
    activeCellKey = key;
    activeCellDate = dateStr;
    activeColId = colId;

    const data = state.events[key] || { title: '', memo: '', startTime: '', endTime: '' };

    // 期間情報（spanIdがあればその期間を優先）
    const defaultStart = data.spanStart || dateStr;
    const defaultEnd = data.spanEnd || dateStr;

    cellTitle.value = data.title || '';
    cellMemo.value = data.memo || '';
    startDateInput.value = defaultStart;
    endDateInput.value = defaultEnd;
    startTimeInput.value = data.startTime || '';
    endTimeInput.value = data.endTime || '';

    // 期間全体編集のUI
    if (data.spanId && data.spanStart && data.spanEnd && data.spanStart !== data.spanEnd){
      scopeRow.style.display = '';
      clearSpanBtn.style.display = '';
      // 既定は期間全体
      setScope('span');
    } else {
      scopeRow.style.display = 'none';
      clearSpanBtn.style.display = 'none';
    }

    if (typeof cellDialog.showModal === 'function') {
      cellDialog.showModal();
    } else {
      // フォールバック
      const title = prompt('タイトルを入力', cellTitle.value) || '';
      const memo = prompt('メモを入力', cellMemo.value) || '';
      applySave({ title, memo, start: dateStr, end: dateStr, st: '', et: '', scope: 'single' });
    }
  }

  function setScope(v){
    const radios = document.querySelectorAll('input[name="editScope"]');
    radios.forEach(r => r.checked = (r.value === v));
  }
  function getScope(){
    const r = document.querySelector('input[name="editScope"]:checked');
    return r ? r.value : 'span';
  }

  function onSaveCell(){
    const title = (cellTitle.value || '').trim();
    const memo = (cellMemo.value || '').trim();
    const stDate = startDateInput.value || activeCellDate;
    const enDate = endDateInput.value || stDate;
    const stTime = (startTimeInput.value || '').trim();
    const enTime = (endTimeInput.value || '').trim();

    // 正規化: 開始 > 終了 の時は入れ替え
    let startStr = stDate, endStr = enDate;
    if (startStr > endStr){ const t = startStr; startStr = endStr; endStr = t; }

    const data = state.events[activeCellKey] || {};
    const hasSpan = !!data.spanId && data.spanStart && data.spanEnd && data.spanStart !== data.spanEnd;
    const scope = hasSpan ? getScope() : (startStr !== endStr ? 'span' : 'single');

    applySave({ title, memo, start: startStr, end: endStr, st: stTime, et: enTime, scope });
  }

  function applySave({ title, memo, start, end, st, et, scope }){
    // 期間ID
    let spanId = null;
    if (scope === 'span' || start !== end){
      spanId = (state.events[activeCellKey] && state.events[activeCellKey].spanId) || ('S_' + genId());
    }

    if (scope === 'single'){
      // この日のみ
      const key = activeCellDate + '|' + activeColId;
      upsertEvent(key, { title, memo, startTime: st, endTime: et, spanId: null, spanStart: null, spanEnd: null });
    } else {
      // 期間全体
      eachDateInclusive(start, end, (d) => {
        const key = d + '|' + activeColId;
        upsertEvent(key, { title, memo, startTime: st, endTime: et, spanId, spanStart: start, spanEnd: end });
      });
    }
    saveState();
    refreshCellsForColumn(activeColId, start, end);
  }

  function upsertEvent(key, obj){
    const v = state.events[key] || {};
    state.events[key] = {
      ...v,
      title: obj.title,
      memo: obj.memo,
      startTime: obj.startTime,
      endTime: obj.endTime,
      spanId: obj.spanId || null,
      spanStart: obj.spanStart || null,
      spanEnd: obj.spanEnd || null
    };
  }

  function refreshCellsForColumn(colId, start, end){
    // 該当列の表示更新
    const cells = document.querySelectorAll(`.cell[data-col-id="${cssEscape(colId)}"]`);
    cells.forEach(cell => {
      const d = cell.dataset.date;
      const key = d + '|' + colId;
      const data = state.events[key];
      cell.querySelector('.cell-title').textContent = formatTitle(data);
      cell.classList.toggle('empty', !(data && data.title));
    });
  }

  function onClearCell(){
    const key = activeCellDate + '|' + activeColId;
    delete state.events[key];
    saveState();
    refreshCellsForColumn(activeColId, activeCellDate, activeCellDate);
  }

  function onClearSpan(){
    const data = state.events[activeCellKey];
    if (!data || !data.spanId) return;
    if (!confirm('この期間の予定をすべて削除しますか？')) return;
    const spanId = data.spanId;
    Object.keys(state.events).forEach(k => {
      if (state.events[k] && state.events[k].spanId === spanId){
        delete state.events[k];
      }
    });
    saveState();
    refreshCellsForColumn(activeColId, data.spanStart, data.spanEnd);
  }

  /* ---- リサイズ ---- */
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