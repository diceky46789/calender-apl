// 表カレンダー手帳 アプリ
// 要求仕様：
// - 一番左に「日にち（年月日）」、2番目に「曜日」、3番目以降は予定入力列（無制限に追加可）
// - 列・行はタップ/ドラッグでサイズ変更可能
// - 入力した予定をタップするとメモ入力（モーダル）
// - GitHub Pages 等の静的ホスティングで動作 / ローカルストレージ保存

(function(){
  'use strict';

  const table = document.getElementById('plannerTable');
  const headerRow = document.getElementById('headerRow');
  const tbody = document.getElementById('tableBody');
  const monthLabel = document.getElementById('monthLabel');
  const prevMonthBtn = document.getElementById('prevMonth');
  const nextMonthBtn = document.getElementById('nextMonth');
  const todayBtn = document.getElementById('todayBtn');
  const addColumnBtn = document.getElementById('addColumn');
  const resetSizesBtn = document.getElementById('resetSizes');
  const exportBtn = document.getElementById('exportJSON');
  const importInput = document.getElementById('importJSON');
  const headerTemplate = document.getElementById('headerTemplate');

  const cellDialog = document.getElementById('cellDialog');
  const cellTitle = document.getElementById('cellTitle');
  const cellMemo = document.getElementById('cellMemo');
  const saveCellBtn = document.getElementById('saveCell');
  const clearCellBtn = document.getElementById('clearCell');

  // 状態
  let state = loadState() || defaultStateForMonth(dayjs().format('YYYY-MM'));
  let activeCellKey = null; // "YYYY-MM-DD|colId"

  init();

  function defaultStateForMonth(monthStr){
    // monthStr: "YYYY-MM"
    return {
      version: 1,
      month: monthStr,
      columns: [
        // ユーザー列（3列目以降）
        { id: genId(), title: '予定1', width: 180 },
        { id: genId(), title: '予定2', width: 180 }
      ],
      events: {}, // key: "date|colId" -> {title, memo}
      // サイズ
      dateColWidth: 150,
      weekdayColWidth: 80,
      rowHeights: {} // key: "YYYY-MM-DD" -> number
    };
  }

  function init(){
    // ユーティリティ導入（dayjs）
    injectDayjs(() => {
      render();
      bindControls();
    });
  }

  function injectDayjs(cb){
    if (window.dayjs) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }

  function saveState(){
    localStorage.setItem('plannerState', JSON.stringify(state));
  }

  function loadState(){
    try {
      const raw = localStorage.getItem('plannerState');
      return raw ? JSON.parse(raw) : null;
    } catch(e){
      return null;
    }
  }

  function setMonth(monthStr){
    // monthStr: "YYYY-MM"
    state.month = monthStr;
    // rowHeightsは月ごとに独立管理：既存を保持（必要なら月キーに分ける設計も可）
    render();
    saveState();
  }

  function monthStartEnd(monthStr){
    const start = dayjs(monthStr + '-01');
    const end = start.endOf('month');
    return { start, end };
  }

  function render(){
    // ヘッダー（固定2列 + 可変列）
    monthLabel.textContent = dayjs(state.month + '-01').format('YYYY年 M月');
    // 更新時に一旦固定2列の後を削除
    while (headerRow.children.length > 2) headerRow.removeChild(headerRow.lastElementChild);

    // 固定列の幅を反映
    headerRow.children[0].style.width = state.dateColWidth + 'px';
    headerRow.children[1].style.width = state.weekdayColWidth + 'px';
    syncStickyLeftOffsets();

    // 動的列
    state.columns.forEach(col => {
      const th = headerTemplate.content.firstElementChild.cloneNode(true);
      th.dataset.colId = col.id;
      const content = th.querySelector('.th-content');
      content.textContent = col.title || '予定';
      th.style.width = (col.width || 180) + 'px';

      // 列名編集
      content.addEventListener('input', () => {
        col.title = content.textContent.trim();
        saveState();
      });

      // 列削除
      th.querySelector('.delete-col').addEventListener('click', () => {
        if (!confirm('この列を削除しますか？（中の予定も削除されます）')) return;
        // イベント削除
        const prefix = '|' + col.id;
        for (const key of Object.keys(state.events)) {
          if (key.endsWith(prefix)) delete state.events[key];
        }
        // 列配列から除去
        state.columns = state.columns.filter(c => c.id !== col.id);
        saveState();
        render();
      });

      // 幅変更ハンドル
      const resizer = th.querySelector('.col-resizer');
      enableColResize(resizer, (newWidth) => {
        col.width = Math.max(80, newWidth);
        th.style.width = col.width + 'px';
        saveState();
      });

      headerRow.appendChild(th);
    });

    // 本体
    tbody.innerHTML = '';
    const {start, end} = monthStartEnd(state.month);
    let d = start;
    while (d.isBefore(end) || d.isSame(end, 'day')) {
      const tr = document.createElement('tr');
      tr.className = 'row-wrapper';
      const dateStr = d.format('YYYY-MM-DD');

      // 左列：日にち
      const thDate = document.createElement('th');
      thDate.className = 'date-cell row-height';
      thDate.textContent = dateStr;
      thDate.style.width = state.dateColWidth + 'px';
      if (state.rowHeights[dateStr]) tr.style.setProperty('--row-height', state.rowHeights[dateStr] + 'px');

      // 2列目：曜日
      const tdW = document.createElement('td');
      tdW.className = 'weekday-cell row-height';
      tdW.textContent = weekdayLabel(d.day());
      tdW.style.width = state.weekdayColWidth + 'px';

      tr.appendChild(thDate);
      tr.appendChild(tdW);

      // 以降：ユーザー列
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

      // 行高さリサイザ
      const rowResizer = document.createElement('div');
      rowResizer.className = 'row-resizer';
      tr.appendChild(rowResizer);
      enableRowResize(rowResizer, dateStr, (newH) => {
        state.rowHeights[dateStr] = Math.max(28, newH);
        tr.style.setProperty('--row-height', state.rowHeights[dateStr] + 'px');
        saveState();
      });

      tbody.appendChild(tr);
      d = d.add(1, 'day');
    }

    // 固定列の幅を設定＆リサイズハンドラ
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
        state.weekdayColWidth = Math.max(60, w);
        headerRow.children[1].style.width = state.weekdayColWidth + 'px';
        document.querySelectorAll('.weekday-cell').forEach(c => c.style.width = state.weekdayColWidth + 'px');
        syncStickyLeftOffsets();
        saveState();
      });
    });
  }

  function weekdayLabel(d){
    const jp = ['日','月','火','水','木','金','土'];
    return jp[d] + '曜';
    // 英語が良ければ dayjs().format('ddd') などに変更可
  }

  function bindControls(){
    prevMonthBtn.addEventListener('click', () => {
      setMonth(dayjs(state.month + '-01').subtract(1, 'month').format('YYYY-MM'));
    });
    nextMonthBtn.addEventListener('click', () => {
      setMonth(dayjs(state.month + '-01').add(1, 'month').format('YYYY-MM'));
    });
    todayBtn.addEventListener('click', () => {
      setMonth(dayjs().format('YYYY-MM'));
    });
    addColumnBtn.addEventListener('click', () => {
      state.columns.push({ id: genId(), title: '予定', width: 180 });
      saveState();
      render();
    });
    resetSizesBtn.addEventListener('click', () => {
      if (!confirm('列幅・行高を初期化しますか？')) return;
      state.dateColWidth = 150;
      state.weekdayColWidth = 80;
      state.columns.forEach(c => c.width = 180);
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

    // モーダル操作
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
      alert('このブラウザはdialogをサポートしていません。最新ブラウザをご利用ください。');
    }
  }

  function onSaveCell(evt){
    // save title/memo
    if (!activeCellKey) return;
    const title = cellTitle.value.trim();
    const memo = cellMemo.value.trim();
    if (!title && !memo){
      delete state.events[activeCellKey];
    } else {
      state.events[activeCellKey] = { title, memo };
    }
    saveState();
    // 画面上のセル表示更新
    const el = document.querySelector(`.cell[data-key="${cssEscape(activeCellKey)}"]`);
    if (el){
      const titleSpan = el.querySelector('.cell-title');
      titleSpan.textContent = title || '（タップで入力）';
      el.classList.toggle('empty', !title);
    }
  }

  function onClearCell(){
    if (!activeCellKey) return;
    delete state.events[activeCellKey];
    saveState();
    const el = document.querySelector(`.cell[data-key="${cssEscape(activeCellKey)}"]`);
    if (el){
      const titleSpan = el.querySelector('.cell-title');
      titleSpan.textContent = '（タップで入力）';
      el.classList.add('empty');
    }
    cellTitle.value = '';
    cellMemo.value = '';
  }

  // --- リサイズ処理（列） ---
  function enableColResize(handle, onResizeDone){
    let startX, startWidth, thEl;

    const start = (e) => {
      e.preventDefault();
      thEl = handle.closest('th');
      startX = getClientX(e);
      startWidth = thEl.getBoundingClientRect().width;
      document.addEventListener('mousemove', move, { passive: false });
      document.addEventListener('mouseup', end, { passive: false });
      document.addEventListener('touchmove', move, { passive: false });
      document.addEventListener('touchend', end, { passive: false });
    };
    const move = (e) => {
      e.preventDefault();
      const dx = getClientX(e) - startX;
      const w = Math.max(60, Math.round(startWidth + dx));
      thEl.style.width = w + 'px';
      // 固定列はbody側も更新（描画中は見た目だけ合わせる）
      if (thEl.dataset.colFixed === 'date') {
        document.querySelectorAll('.date-cell').forEach(c => c.style.width = w + 'px');
        syncStickyLeftOffsets();
      } else if (thEl.dataset.colFixed === 'weekday') {
        document.querySelectorAll('.weekday-cell').forEach(c => c.style.width = w + 'px');
        syncStickyLeftOffsets();
      }
    };
    const end = (e) => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', end);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      const finalWidth = Math.round(thEl.getBoundingClientRect().width);
      onResizeDone(finalWidth);
    };
    handle.addEventListener('mousedown', start);
    handle.addEventListener('touchstart', start, { passive: false });
  }

  function syncStickyLeftOffsets(){
    const dateWidth = headerRow.children[0].getBoundingClientRect().width;
    const weekdayWidth = headerRow.children[1].getBoundingClientRect().width;
    // header
    headerRow.children[0].style.left = '0px';
    headerRow.children[1].style.left = dateWidth + 'px';
    // body
    document.querySelectorAll('tbody th.date-cell').forEach(el => el.style.left = '0px');
    document.querySelectorAll('tbody td.weekday-cell').forEach(el => el.style.left = dateWidth + 'px');
  }

  // --- リサイズ処理（行） ---
  function enableRowResize(handle, dateStr, onResizeDone){
    let startY, startH, trEl;

    const start = (e) => {
      e.preventDefault();
      trEl = handle.closest('tr');
      startY = getClientY(e);
      startH = trEl.getBoundingClientRect().height;
      document.addEventListener('mousemove', move, { passive: false });
      document.addEventListener('mouseup', end, { passive: false });
      document.addEventListener('touchmove', move, { passive: false });
      document.addEventListener('touchend', end, { passive: false });
    };
    const move = (e) => {
      e.preventDefault();
      const dy = getClientY(e) - startY;
      const h = Math.max(28, Math.round(startH + dy));
      trEl.style.setProperty('--row-height', h + 'px');
    };
    const end = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', end);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      const finalH = Math.round(parseFloat(getComputedStyle(trEl).getPropertyValue('--row-height')) || trEl.getBoundingClientRect().height);
      onResizeDone(finalH);
    };
    handle.addEventListener('mousedown', start);
    handle.addEventListener('touchstart', start, { passive: false });
  }

  // --- セルキー／ユーティリティ ---
  function genId(){
    return Math.random().toString(36).slice(2, 10);
  }
  function getClientX(e){ return e.touches ? e.touches[0].clientX : e.clientX; }
  function getClientY(e){ return e.touches ? e.touches[0].clientY : e.clientY; }
  function cssEscape(s){ return s.replace(/["\\]/g, '\\$&'); }

})();
