// v4.3: iPhone Safari互換モード（2ペイン）付き
(function(){
  'use strict';

  const $ = sel => document.querySelector(sel);
  const headerRow = $('#headerRow');
  const colgroup = $('#colgroup');
  const colDate = $('#col-date');
  const colWeek = $('#col-week');
  const tbody = $('#tableBody');
  const monthLabel = $('#monthLabel');
  const prevMonthBtn = $('#prevMonth');
  const nextMonthBtn = $('#nextMonth');
  const todayBtn = $('#todayBtn');
  const addColumnBtn = $('#addColumn');
  const resetSizesBtn = $('#resetSizes');
  const resetDataBtn = $('#resetData');
  const exportBtn = $('#exportJSON');
  const importInput = $('#importJSON');
  const headerTemplate = $('#headerTemplate');
  const enableNotifyBtn = $('#enableNotify');
  const compactToggle = $('#compactToggle');
  const compatToggle = $('#compatToggle');

  // 互換モードDOM
  const tableWrapper = $('#tableWrapper');
  const compatWrapper = $('#compatWrapper');
  const leftPane = $('#leftPane');
  const leftBody = $('#leftBody');
  const rightPane = $('#rightPane');
  const rightHeader = $('#rightHeader');
  const rightBody = $('#rightBody');
  const dateResize = $('#dateResize');
  const weekResize = $('#weekResize');

  const cellDialog = $('#cellDialog');
  const cellTitle = $('#cellTitle');
  const cellMemo = $('#cellMemo');
  const startDateInput = $('#startDate');
  const endDateInput = $('#endDate');
  const startTimeInput = $('#startTime');
  const endTimeInput = $('#endTime');
  const notifyEnabledInput = $('#notifyEnabled');
  const notifyTimeInput = $('#notifyTime');
  const saveCellBtn = $('#saveCell');
  const clearCellBtn = $('#clearCell');
  const clearSpanBtn = $('#clearSpan');
  const scopeRow = $('#scopeRow');

  let state = migrate(loadState()) || defaultStateForMonth(fmtYM(new Date()));
  let activeCellKey = null;
  let activeCellDate = null;
  let activeColId = null;
  let notifiedMap = loadNotifiedMap();

  init();

  function isIOSSafari(){
    const ua = navigator.userAgent;
    const isIOS = /iP(hone|ad|od)/.test(ua);
    const isWebKit = /WebKit/.test(ua);
    const isCriOS = /CriOS/.test(ua);
    const isFxiOS = /FxiOS/.test(ua);
    const isEdgiOS = /EdgiOS/.test(ua);
    return isIOS && isWebKit && !isCriOS && !isFxiOS && !isEdgiOS;
  }

  function defaultStateForMonth(monthStr){
    return {
      version: 43,
      month: monthStr,
      columns: [
        { id: genId(), title: '予定1', width: 240 },
        { id: genId(), title: '予定2', width: 240 }
      ],
      events: {},
      dateColWidth: 120,
      weekdayColWidth: 70,
      rowHeights: {},
      compact: true,
      compatMode: isIOSSafari()
    };
  }

  function migrate(s){
    if (!s) return null;
    if (!s.version) s.version = 1;
    if (s.version < 4){
      s.dateColWidth = s.dateColWidth || 180;
      s.weekdayColWidth = s.weekdayColWidth || 110;
      s.compact = true;
      s.version = 4;
    }
    if (s.version <= 42) s.version = 43;
    if (typeof s.compatMode !== 'boolean') s.compatMode = isIOSSafari();
    s.dateColWidth = clamp(s.dateColWidth || 120, 70, 400);
    s.weekdayColWidth = clamp(s.weekdayColWidth || 70, 40, 300);
    return s;
  }

  function clamp(v, min, max){ v = Number(v) || 0; return Math.max(min, Math.min(max, v)); }
  function saveState(){ localStorage.setItem('plannerState', JSON.stringify(state)); }
  function loadState(){ try { return JSON.parse(localStorage.getItem('plannerState')); } catch(e){ return null; } }
  function loadNotifiedMap(){ try { return JSON.parse(localStorage.getItem('plannerNotifiedMap')) || {}; } catch(e){ return {}; } }
  function saveNotifiedMap(){ localStorage.setItem('plannerNotifiedMap', JSON.stringify(notifiedMap)); }

  function fmtYM(d){ const y=d.getFullYear(), m=('0'+(d.getMonth()+1)).slice(-2); return `${y}-${m}`; }
  function fmtYMD(d){ const y=d.getFullYear(), m=('0'+(d.getMonth()+1)).slice(-2), da=('0'+d.getDate()).slice(-2); return `${y}-${m}-${da}`; }
  function addDays(dateStr, n){ const [y,m,d]=dateStr.split('-').map(Number); const dt=new Date(y,m-1,d); dt.setDate(dt.getDate()+n); return fmtYMD(dt); }
  function eachDateInclusive(startStr, endStr, cb){ let cur=startStr; while(cur<=endStr){ cb(cur); cur=addDays(cur,1);} }
  function monthStartEnd(monthStr){ const [y,m]=monthStr.split('-').map(Number); const start=new Date(y,m-1,1); const end=new Date(y,m,0); return {start,end}; }
  function weekdayLabel(idx, compact){ const full=['日曜','月曜','火曜','水曜','木曜','金曜','土曜']; const short=['日','月','火','水','木','金','土']; return compact? short[idx] : full[idx]; }
  function fmtDateLabel(dateStr, compact){ if(!compact) return dateStr; const [y,m,d]=dateStr.split('-').map(Number); return `${m}/${d}`; }

  function setMonth(monthStr){ state.month=monthStr; render(); saveState(); }

  function buildColsTemplate(){ return state.columns.map(c => clamp(c.width||240, 80, 800)+'px').join(' '); }

  function render(){
    const monthStr = state.month;
    const [y, m] = monthStr.split('-').map(Number);
    monthLabel.textContent = `${y}年 ${m}月`;
    compactToggle.checked = !!state.compact;
    compatToggle.checked = !!state.compatMode;

    tableWrapper.classList.toggle('hidden', state.compatMode);
    compatWrapper.classList.toggle('hidden', !state.compatMode);

    if (state.compatMode){
      renderCompat();
    } else {
      renderTable();
    }
    scheduleNotificationCheck();
  }

  function renderTable(){
    colDate.style.width = state.dateColWidth + 'px';
    colWeek.style.width = state.weekdayColWidth + 'px';
    [...colgroup.querySelectorAll('col[data-col-id]')].forEach(c => c.remove());
    while (headerRow.children.length > 2) headerRow.removeChild(headerRow.lastElementChild);

    state.columns.forEach(col => {
      const colEl = document.createElement('col');
      colEl.setAttribute('data-col-id', col.id);
      colEl.style.width = clamp(col.width || 240, 80, 800) + 'px';
      colgroup.appendChild(colEl);

      const th = document.createElement('th');
      th.className = 'resizable';
      th.dataset.colId = col.id;
      th.style.width = colEl.style.width;
      th.innerHTML = `<div class="th-inner"><div class="th-title" contenteditable="true" spellcheck="false">${esc(col.title || '予定')}</div><button class="delete-col">×</button></div><div class="col-resizer"></div>`;
      th.querySelector('.th-title').addEventListener('input', (e)=>{ col.title = e.currentTarget.textContent.trim(); saveState(); });
      th.querySelector('.delete-col').addEventListener('click', ()=>{ if (!confirm('この列を削除しますか？（中の予定も削除）')) return; const suffix='|'+col.id; Object.keys(state.events).forEach(k=>{ if(k.endsWith(suffix)) delete state.events[k]; }); state.columns = state.columns.filter(c=>c.id!==col.id); saveState(); render(); });
      enableColResize(th.querySelector('.col-resizer'), (w)=>{ col.width = clamp(w,80,800); th.style.width = col.width+'px'; const matchCol=colgroup.querySelector(`col[data-col-id="${cssEscape(col.id)}"]`); if(matchCol) matchCol.style.width = col.width+'px'; saveState(); });
      headerRow.appendChild(th);
    });

    tbody.innerHTML = '';
    const {start, end} = monthStartEnd(state.month);
    const d = new Date(start);
    while (d <= end){
      const tr = document.createElement('tr');
      tr.className = 'row-wrapper';
      const dateStr = fmtYMD(d);
      const thDate = document.createElement('th');
      thDate.className = 'date-cell row-height';
      thDate.textContent = fmtDateLabel(dateStr, state.compact); thDate.title = dateStr;
      const tdW = document.createElement('td');
      tdW.className = 'weekday-cell row-height';
      tdW.textContent = weekdayLabel(d.getDay(), state.compact);
      if (state.rowHeights[dateStr]) tr.style.setProperty('--row-height', state.rowHeights[dateStr] + 'px');
      tr.appendChild(thDate); tr.appendChild(tdW);

      state.columns.forEach(col => {
        const td = document.createElement('td'); td.className = 'row-height';
        const key = dateStr + '|' + col.id; const data = state.events[key];
        const div = document.createElement('div'); div.className = 'cell ' + (data && data.title ? '' : 'empty');
        div.tabIndex = 0; div.dataset.key = key; div.dataset.date = dateStr; div.dataset.colId = col.id;
        if (data && data.spanId && data.spanStart && data.spanEnd){
          const chip = document.createElement('div'); chip.className='span-chip'; const line = document.createElement('div'); line.className='line'; chip.appendChild(line);
          if (data.spanStart === data.spanEnd) chip.classList.add('single'); else if (dateStr === data.spanStart) chip.classList.add('start'); else if (dateStr === data.spanEnd) chip.classList.add('end');
          div.appendChild(chip);
        }
        const span = document.createElement('span'); span.className='cell-title'; span.textContent = formatTitle(data); div.appendChild(span);
        div.addEventListener('click', ()=>openCellEditor(key, dateStr, col.id));
        td.appendChild(div); tr.appendChild(td);
      });

      const rowResizer = document.createElement('div'); rowResizer.className='row-resizer'; tr.appendChild(rowResizer);
      enableRowResize(rowResizer, dateStr, (h)=>{ state.rowHeights[dateStr] = Math.max(24, h); tr.style.setProperty('--row-height', state.rowHeights[dateStr] + 'px'); saveState(); });

      tbody.appendChild(tr);
      d.setDate(d.getDate() + 1);
    }
  }

  function renderCompat(){
    leftPane.style.setProperty('--dateW', state.dateColWidth + 'px');
    leftPane.style.setProperty('--weekW', state.weekdayColWidth + 'px');

    rightHeader.innerHTML = '';
    rightBody.style.setProperty('--cols', buildColsTemplate());
    state.columns.forEach(col => {
      const node = headerTemplate.content.firstElementChild.cloneNode(true);
      node.dataset.colId = col.id;
      node.style.width = clamp(col.width || 240, 80, 800) + 'px';
      node.querySelector('.th-title').textContent = col.title || '予定';
      node.querySelector('.th-title').addEventListener('input', (e)=>{ col.title = e.currentTarget.textContent.trim(); saveState(); });
      node.querySelector('.delete-col').addEventListener('click', ()=>{ if(!confirm('この列を削除しますか？（中の予定も削除）')) return; const suffix='|'+col.id; Object.keys(state.events).forEach(k=>{ if(k.endsWith(suffix)) delete state.events[k]; }); state.columns = state.columns.filter(c=>c.id!==col.id); saveState(); render(); });
      enableColResize(node.querySelector('.col-resizer'), (w)=>{
        col.width = clamp(w,80,800);
        node.style.width = col.width + 'px';
        rightBody.style.setProperty('--cols', buildColsTemplate());
        saveState();
      });
      rightHeader.appendChild(node);
    });

    leftBody.innerHTML = '';
    rightBody.innerHTML = '';
    const {start, end} = monthStartEnd(state.month);
    const d = new Date(start);
    while (d <= end){
      const dateStr = fmtYMD(d);
      const lrow = document.createElement('div'); lrow.className = 'leftRow';
      if (state.rowHeights[dateStr]) lrow.style.height = state.rowHeights[dateStr] + 'px';
      const lcDate = document.createElement('div'); lcDate.className='leftCell'; lcDate.textContent = fmtDateLabel(dateStr, state.compact); lcDate.title = dateStr;
      const lcWeek = document.createElement('div'); lcWeek.className='leftCell'; lcWeek.textContent = weekdayLabel(d.getDay(), state.compact);
      lrow.appendChild(lcDate); lrow.appendChild(lcWeek); leftBody.appendChild(lrow);

      const rrow = document.createElement('div'); rrow.className='rightRow';
      if (state.rowHeights[dateStr]) rrow.style.height = state.rowHeights[dateStr] + 'px';
      state.columns.forEach(col => {
        const rcell = document.createElement('div'); rcell.className='rCell';
        const key = dateStr + '|' + col.id; const data = state.events[key];
        const inner = document.createElement('div'); inner.className='cell ' + (data && data.title ? '' : 'empty');
        inner.tabIndex = 0; inner.dataset.key=key; inner.dataset.date=dateStr; inner.dataset.colId=col.id;
        if (data && data.spanId && data.spanStart && data.spanEnd){
          const chip = document.createElement('div'); chip.className='rSpanChip'; const line=document.createElement('div'); line.className='line'; chip.appendChild(line);
          if (data.spanStart === data.spanEnd) chip.classList.add('single'); else if (dateStr === data.spanStart) chip.classList.add('start'); else if (dateStr === data.spanEnd) chip.classList.add('end');
          inner.appendChild(chip);
        }
        const span = document.createElement('span'); span.className='cell-title'; span.textContent = formatTitle(data); inner.appendChild(span);
        inner.addEventListener('click', ()=>openCellEditor(key, dateStr, col.id));
        rcell.appendChild(inner); rrow.appendChild(rcell);
      });
      const rr = document.createElement('div'); rr.className='rRowResizer'; rrow.appendChild(rr);
      enableRowResize(rr, dateStr, (h)=>{
        state.rowHeights[dateStr] = Math.max(24, h);
        lrow.style.height = state.rowHeights[dateStr] + 'px';
        rrow.style.height = state.rowHeights[dateStr] + 'px';
        saveState();
      });
      rightBody.appendChild(rrow);

      d.setDate(d.getDate() + 1);
    }

    rightBody.addEventListener('scroll', ()=>{ leftBody.scrollTop = rightBody.scrollTop; }, { passive: true });
    leftBody.addEventListener('scroll', ()=>{ rightBody.scrollTop = leftBody.scrollTop; }, { passive: true });

    enableColResize(dateResize, (w)=>{ state.dateColWidth = clamp(w, 70, 400); leftPane.style.setProperty('--dateW', state.dateColWidth + 'px'); saveState(); });
    enableColResize(weekResize, (w)=>{ state.weekdayColWidth = clamp(w, 40, 300); leftPane.style.setProperty('--weekW', state.weekdayColWidth + 'px'); saveState(); });
  }

  function bindControls(){
    prevMonthBtn.addEventListener('click', () => { const [y, m] = state.month.split('-').map(Number); const dt = new Date(y, m-2, 1); setMonth(fmtYM(dt)); });
    nextMonthBtn.addEventListener('click', () => { const [y, m] = state.month.split('-').map(Number); const dt = new Date(y, m, 1); setMonth(fmtYM(dt)); });
    todayBtn.addEventListener('click', () => setMonth(fmtYM(new Date())));
    addColumnBtn.addEventListener('click', () => { state.columns.push({ id: genId(), title: '予定', width: 240 }); saveState(); render(); });
    resetSizesBtn.addEventListener('click', () => { if (!confirm('列幅・行高を初期化しますか？')) return; state.dateColWidth = 120; state.weekdayColWidth = 70; state.columns.forEach(c => c.width = 240); state.rowHeights = {}; saveState(); render(); });
    resetDataBtn.addEventListener('click', () => { if (!confirm('保存されたデータを初期化しますか？（予定やカスタマイズが消えます）')) return; localStorage.removeItem('plannerState'); localStorage.removeItem('plannerNotifiedMap'); state = defaultStateForMonth(fmtYM(new Date())); saveState(); render(); });
    exportBtn.addEventListener('click', () => { const blob = new Blob([JSON.stringify(state, null, 2)], {type: 'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `planner-${state.month}.json`; a.click(); URL.revokeObjectURL(url); });
    importInput.addEventListener('change', (e) => { const file = e.target.files && e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const obj = JSON.parse(reader.result); if (!obj || typeof obj !== 'object' || !obj.month) throw new Error('不正なファイルです'); state = migrate(obj); saveState(); render(); } catch (err) { alert('JSONの読み込みに失敗しました: ' + err.message); } }; reader.readAsText(file, 'utf-8'); e.target.value = ''; });
    enableNotifyBtn.addEventListener('click', requestNotificationPermission);
    compactToggle.addEventListener('change', () => { state.compact = !!compactToggle.checked; saveState(); render(); });
    compatToggle.addEventListener('change', () => { state.compatMode = !!compatToggle.checked; saveState(); render(); });
    saveCellBtn.addEventListener('click', onSaveCell);
    clearCellBtn.addEventListener('click', onClearCell);
    clearSpanBtn.addEventListener('click', onClearSpan);
  }

  function formatTitle(data){
    if (!data || (!data.title && !data.startTime && !data.endTime)) return '（タップで入力）';
    const t = data.title || '';
    const st = data.startTime || '';
    const et = data.endTime || '';
    const time = st && et ? `${st}–${et} ` : (st ? `${st} ` : (et ? `${et} ` : ''));
    return (time + t).trim();
  }

  function openCellEditor(key, dateStr, colId){
    activeCellKey = key; activeCellDate = dateStr; activeColId = colId;
    const data = state.events[key] || { title: '', memo: '', startTime: '', endTime: '', notify: true, notifyTime: '' };
    const defaultStart = data.spanStart || dateStr; const defaultEnd = data.spanEnd || dateStr;
    cellTitle.value = data.title || ''; cellMemo.value = data.memo || '';
    startDateInput.value = defaultStart; endDateInput.value = defaultEnd;
    startTimeInput.value = data.startTime || ''; endTimeInput.value = data.endTime || '';
    notifyEnabledInput.checked = data.notify !== false; notifyTimeInput.value = data.notifyTime || '';
    if (data.spanId && data.spanStart && data.spanEnd && data.spanStart !== data.spanEnd){ scopeRow.style.display = ''; clearSpanBtn.style.display = ''; setScope('span'); }
    else { scopeRow.style.display = 'none'; clearSpanBtn.style.display = 'none'; }
    if (typeof cellDialog.showModal === 'function') cellDialog.showModal();
  }

  function setScope(v){ document.querySelectorAll('input[name="editScope"]').forEach(r => r.checked = (r.value === v)); }
  function getScope(){ const r = document.querySelector('input[name="editScope"]:checked'); return r ? r.value : 'span'; }

  function onSaveCell(){
    const title = (cellTitle.value || '').trim();
    const memo = (cellMemo.value || '').trim();
    const stDate = startDateInput.value || activeCellDate;
    const enDate = endDateInput.value || stDate;
    const stTime = (startTimeInput.value || '').trim();
    const enTime = (endTimeInput.value || '').trim();
    const notify = !!notifyEnabledInput.checked;
    const ntime = (notifyTimeInput.value || '').trim();
    let startStr = stDate, endStr = enDate;
    if (startStr > endStr){ const t = startStr; startStr = endStr; endStr = t; }

    const data = state.events[activeCellKey] || {};
    const hasSpan = !!data.spanId && data.spanStart && data.spanEnd && data.spanStart !== data.spanEnd;
    const scope = hasSpan ? getScope() : (startStr !== endStr ? 'span' : 'single');
    applySave({ title, memo, start: startStr, end: endStr, st: stTime, et: enTime, notify, ntime, scope });
  }

  function applySave({ title, memo, start, end, st, et, notify, ntime, scope }){
    let spanId = null;
    if (scope === 'span' || start !== end){ spanId = (state.events[activeCellKey] && state.events[activeCellKey].spanId) || ('S_' + genId()); }
    if (scope === 'single'){
      const key = activeCellDate + '|' + activeColId;
      upsertEvent(key, { title, memo, startTime: st, endTime: et, notify, notifyTime: ntime, spanId: null, spanStart: null, spanEnd: null });
    } else {
      eachDateInclusive(start, end, (d) => {
        const key = d + '|' + activeColId;
        upsertEvent(key, { title, memo, startTime: st, endTime: et, notify, notifyTime: ntime, spanId, spanStart: start, spanEnd: end });
      });
    }
    saveState(); render();
  }

  function upsertEvent(key, obj){
    const v = state.events[key] || {};
    state.events[key] = { ...v, title: obj.title, memo: obj.memo, startTime: obj.startTime, endTime: obj.endTime, notify: obj.notify, notifyTime: obj.notifyTime, spanId: obj.spanId || null, spanStart: obj.spanStart || null, spanEnd: obj.spanEnd || null };
  }

  function onClearCell(){ const key = activeCellDate + '|' + activeColId; delete state.events[key]; saveState(); render(); }
  function onClearSpan(){
    const data = state.events[activeCellKey];
    if (!data || !data.spanId) return;
    if (!confirm('この期間の予定をすべて削除しますか？')) return;
    const spanId = data.spanId;
    Object.keys(state.events).forEach(k => { if (state.events[k] && state.events[k].spanId === spanId) delete state.events[k]; });
    saveState(); render();
  }

  function requestNotificationPermission(){
    if (!('Notification' in window)){ alert('このブラウザは通知に対応していません。'); return; }
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted'){ new Notification('通知を有効化しました', { body: '予定時刻にこの端末へお知らせします。' }); }
      else if (perm === 'denied'){ alert('通知がブロックされました。ブラウザ設定で許可してください。'); }
    });
  }

  let notifyIntervalId = null;
  function scheduleNotificationCheck(){ if (notifyIntervalId) clearInterval(notifyIntervalId); tryNotifyDueEvents(); notifyIntervalId = setInterval(tryNotifyDueEvents, 60 * 1000); }
  function tryNotifyDueEvents(){
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    const now = new Date();
    const months = [state.month, fmtYM(now), fmtYM(new Date(now.getFullYear(), now.getMonth()+1, 1))];
    const keys = Object.keys(state.events).filter(k => months.includes(k.slice(0,7)));
    for (const key of keys){
      const ev = state.events[key]; if (!ev || ev.notify === false) continue;
      const [dateStr] = key.split('|');
      const baseTime = ev.notifyTime || ev.startTime || '09:00';
      const target = parseDateTimeLocal(dateStr, baseTime);
      if (!target) continue;
      if (now >= target && now - target < 60 * 60 * 1000){
        const nKey = key + '|' + (ev.notifyTime || ev.startTime || '09:00');
        if (!notifiedMap[nKey]){ showEventNotification(ev, dateStr); notifiedMap[nKey] = true; }
      }
    }
    saveNotifiedMap();
  }
  function showEventNotification(ev, dateStr){
    const title = ev.title || '予定';
    const timePart = ev.startTime ? (ev.endTime ? `${ev.startTime}–${ev.endTime} ` : `${ev.startTime} `) : '';
    const body = `${dateStr} ${timePart}${title}` + (ev.memo ? `\n${ev.memo}` : '');
    try { new Notification('予定の通知', { body }); } catch(e){}
  }
  function parseDateTimeLocal(dateStr, hhmm){
    if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
    const [y,m,d] = dateStr.split('-').map(Number); const [hh,mm] = hhmm.split(':').map(Number);
    return new Date(y, m-1, d, hh, mm, 0, 0);
  }

  function enableColResize(handle, onDone){
    let startX, startW, el;
    const start = (e)=>{
      e.preventDefault();
      el = handle.closest('.resizable') || handle.parentElement;
      startX = clientX(e);
      startW = el.getBoundingClientRect().width;
      document.addEventListener('mousemove', move, { passive:false });
      document.addEventListener('mouseup', end, { passive:false });
      document.addEventListener('touchmove', move, { passive:false });
      document.addEventListener('touchend', end, { passive:false });
    };
    const move = (e)=>{
      e.preventDefault();
      const dx = clientX(e) - startX;
      const w = Math.max(50, Math.round(startW + dx));
      el.style.width = w + 'px';
    };
    const end = ()=>{
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', end);
      document.removeEventListener('touchmove', move); document.removeEventListener('touchend', end);
      const finalW = Math.round(el.getBoundingClientRect().width);
      onDone(finalW);
    };
    handle.addEventListener('mousedown', start);
    handle.addEventListener('touchstart', start, { passive:false });
  }

  function enableRowResize(handle, dateStr, onDone){
    let startY, startH, targetRow;
    const start = (e)=>{
      e.preventDefault();
      targetRow = handle.closest('.rightRow') || handle.closest('tr');
      startY = clientY(e);
      startH = (targetRow.getBoundingClientRect().height);
      document.addEventListener('mousemove', move, { passive:false });
      document.addEventListener('mouseup', end, { passive:false });
      document.addEventListener('touchmove', move, { passive:false });
      document.addEventListener('touchend', end, { passive:false });
    };
    const move = (e)=>{
      e.preventDefault();
      const dy = clientY(e) - startY;
      const h = Math.max(24, Math.round(startH + dy));
      if (targetRow.classList.contains('rightRow')){
        targetRow.style.height = h + 'px';
        const index = Array.from(rightBody.children).indexOf(targetRow);
        const leftRow = leftBody.children[index];
        if (leftRow) leftRow.style.height = h + 'px';
      } else {
        targetRow.style.setProperty('--row-height', h + 'px');
      }
    };
    const end = ()=>{
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', end);
      document.removeEventListener('touchmove', move); document.removeEventListener('touchend', end);
      const finalH = Math.round(targetRow.getBoundingClientRect().height);
      onDone(finalH);
    };
    handle.addEventListener('mousedown', start);
    handle.addEventListener('touchstart', start, { passive:false });
  }

  function clientX(e){ return e.touches ? e.touches[0].clientX : e.clientX; }
  function clientY(e){ return e.touches ? e.touches[0].clientY : e.clientY; }
  function genId(){ return Math.random().toString(36).slice(2, 10); }
  function cssEscape(s){ return s.replace(/["\\]/g, '\\$&'); }
  function esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  render(); bindControls();

})();