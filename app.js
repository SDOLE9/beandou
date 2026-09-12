/* =========================================================================
   拼豆计时管理系统  app.js
   - 本地存储(localStorage) 全离线运行
   - 状态机: idle(空闲) / running(使用中) / paused(暂停) / overtime(超时)
   ========================================================================= */

'use strict';

/* ---------- 默认配置 ---------- */
const DEFAULTS = {
  shopName: '拼豆工坊',
  defaultDuration: 0,      // 0 = 开放计时; >0 = 固定分钟
  overtimeWarn: 5,        // 到期前5分钟黄色提醒
  voiceAlert: true,
  colors: { idle: '#6b7280', running: '#22c55e', paused: '#3b82f6', overtime: '#ef4444' },
  areas: [
    { id: 'A', name: 'A区', tables: [1, 2, 3, 4, 5, 6] },
    { id: 'B', name: 'B区', tables: [1, 2, 3, 4] },
  ],
  // 壁纸
  wallpapers: [],             // [{id, name, dataUrl}]  dataUrl是用户上传的base64
  wallpaperMode: 'off',       // off / startup / hourly
  wallpaperOverlay: 35,       // 遮罩浓度 0-80
  wallpaperActive: null,      // 当前激活的wp id
  wpLastRotateTs: 0,          // 上次轮播时间戳(小时级)
  modalSize: 'standard',      // 弹窗大小: compact / standard / large
  cardSize: 'compact',        // 桌台卡片大小: compact / standard / large
};

/* 弹窗大小档位(通过CSS变量 --modal-max 生效) */
const MODAL_SIZES = { compact: '380px', standard: '460px', large: '560px' };
function applyModalSize() {
  const px = MODAL_SIZES[state.settings.modalSize] || MODAL_SIZES.standard;
  document.documentElement.style.setProperty('--modal-max', px);
}

/* 桌台卡片大小档位(通过CSS变量 --tc-* 生效) */
const CARD_SIZES = ['compact', 'standard', 'large'];
function applyCardSize() {
  const s = CARD_SIZES.includes(state.settings.cardSize) ? state.settings.cardSize : 'compact';
  document.documentElement.dataset.cardSize = s;
}

/* ---------- 套餐配置 ---------- */
const BASE_PACKAGES = [
  '双人1小时¥18.8', '单人1小时¥9.8',
  '双人2小时¥34.8', '单人2小时¥18.8',
  '双人3小时¥47.8', '单人3小时¥26.8',
  '双人不限时(工作日)¥49.8', '单人不限时(工作日)¥28.8',
  '双人不限时(周末/节假日)¥58.8', '单人不限时(周末/节假日)¥38.8',
];
const PACKAGES = {
  '支付宝': BASE_PACKAGES,
  '微信': BASE_PACKAGES,
  '抖音': ['开业活动9.9¥9.9', ...BASE_PACKAGES],
};
const PAYMENTS = ['抖音', '微信', '支付宝'];

/* ---------- 壁纸单独持久化(避免撑坏主体state结构和导出文件) ---------- */
const WP_STORE_KEY = 'pindou_wallpapers_v1';
function loadWallpapers() {
  try {
    const raw = localStorage.getItem(WP_STORE_KEY);
    if (!raw) return { list: [], active: null };
    return JSON.parse(raw);
  } catch (e) { return { list: [], active: null }; }
}
function saveWallpapers(wpState) {
  try { localStorage.setItem(WP_STORE_KEY, JSON.stringify(wpState)); }
  catch (e) { console.error(e); toast('壁纸保存失败，图片可能过大', 'error'); }
}

/* ---------- 持久化 ---------- */
const STORE_KEY = 'pindou_system_v1';
function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      // 合并默认值，防止旧数据缺字段
      s.settings = Object.assign({}, DEFAULTS, s.settings || {});
      s.settings.colors = Object.assign({}, DEFAULTS.colors, (s.settings || {}).colors || {});
      s.tables = s.tables || [];
      s.sales = s.sales || [];
      s.storage = s.storage || [];
      return s;
    }
  } catch (e) { console.warn('加载状态失败', e); }
  const init = { settings: JSON.parse(JSON.stringify(DEFAULTS)), tables: [], sales: [], storage: [], seq: { sales: 0, storage: 0 } };
  // settings中单独保存wallpaper list和list共用同一key不便;清空list只保留引用
  init.settings.wallpapers = undefined;
  return init;
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { console.error('保存失败', e); toast('数据保存失败，请检查存储空间', 'error'); }
}

/* ---------- 状态 ---------- */
let state = loadState();
let tickHandle = null;
let currentView = 'dashboard';

/* ---------- 工具函数 ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const pad2 = n => String(n).padStart(2, '0');
const fmt = n => '¥' + (Math.round(n * 100) / 100).toFixed(2);
function todayStr(d = new Date()) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function nowStr() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function msToHMS(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}时${pad2(m)}分${pad2(s)}秒`;
  return `${pad2(m)}分${pad2(s)}秒`;
}
function daysBetween(d1, d2) {
  const a = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const b = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
  return Math.round((b - a) / 86400000);
}

/* ---------- 壁纸引擎 ---------- */
let wpState = loadWallpapers();
function activeWallpaper() {
  return wpState.list.find(w => w.id === wpState.active) || wpState.list[0] || null;
}
function pickRandomWallpaper() {
  if (wpState.list.length === 0) return null;
  if (wpState.list.length === 1) return wpState.list[0];
  const others = wpState.list.filter(w => w.id !== wpState.active);
  return others[Math.floor(Math.random() * others.length)];
}
function applyWallpaper(previewDataUrl /* optional */) {
  const overlay = parseInt(state.settings.wallpaperOverlay ?? DEFAULTS.wallpaperOverlay, 10) / 100;
  const overlayLow = Math.round(overlay * 0.68 * 100) / 100;
  const overlayHigh = Math.round(overlay * 100) / 100;
  const dataUrl = previewDataUrl || (activeWallpaper() ? activeWallpaper().dataUrl : null);
  if (!dataUrl) {
    // 无用户壁纸:保留CSS中的默认柔和渐变背景
    document.body.style.backgroundImage = '';
    return;
  }
  // 遮罩随主题切换:v2深色版用暗色遮罩(浅色文字可读),v1浅色版用白色柔光遮罩
  const dark = document.body.getAttribute('data-theme') === 'dark';
  const veil1 = dark ? `rgba(8, 11, 20, ${overlayLow})` : `rgba(240, 244, 250, ${overlayLow})`;
  const veil2 = dark ? `rgba(5, 8, 15, ${overlayHigh})` : `rgba(232, 238, 246, ${overlayHigh})`;
  document.body.style.backgroundImage =
    `linear-gradient(${veil1}, ${veil2}), url('${dataUrl}')`;
}

function rotateWallpaperIfNeeded() {
  const mode = state.settings.wallpaperMode || 'off';
  if (mode === 'off' || wpState.list.length < 2) return;
  if (mode === 'startup') {
    const today = todayStr();
    if (state.settings.wpLastRotateTs !== today) {
      const next = pickRandomWallpaper();
      if (next) { wpState.active = next.id; state.settings.wpLastRotateTs = today; saveWallpapers(wpState); saveState(); }
    }
  } else if (mode === 'hourly') {
    const bucket = Math.floor(Date.now() / 3600000);
    if (Number(state.settings.wpLastRotateTs || 0) !== bucket) {
      const next = pickRandomWallpaper();
      if (next) { wpState.active = next.id; state.settings.wpLastRotateTs = bucket; saveWallpapers(wpState); saveState(); }
    }
  }
}

/* 将任意图片文件压缩后转dataURL,避免localStorage超出 */
function fileToCompressedDataUrl(file, maxSide = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let w = img.width, h = img.height;
        if (Math.max(w, h) > maxSide) {
          const r = maxSide / Math.max(w, h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        try { resolve(canvas.toDataURL('image/jpeg', quality)); }
        catch (e) { try { resolve(canvas.toDataURL('image/png')); } catch (e2) { reject(e2); } }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function addWallpaperFiles(fileList) {
  const files = Array.from(fileList);
  let added = 0, skipped = 0;
  for (const f of files) {
    if (!f.type.startsWith('image/')) { skipped++; continue; }
    try {
      const dataUrl = await fileToCompressedDataUrl(f);
      if (dataUrl.length > 2 * 1024 * 1024) { skipped++; continue; } // 单张不超过2MB存储
      const id = 'wp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      wpState.list.push({ id, name: f.name.slice(0, 60), dataUrl });
      if (!wpState.active) wpState.active = id;
      added++;
    } catch (e) { skipped++; }
  }
  saveWallpapers(wpState);
  renderWallpaperPreview();
  applyWallpaper();
  if (added) toast(`已添加 ${added} 张壁纸${skipped ? `，跳过 ${skipped} 张(过大或非图片)` : ''}`, 'success');
  else toast('图片添加失败（可能过大）', 'error');
}

function removeWallpaper(id) {
  wpState.list = wpState.list.filter(w => w.id !== id);
  if (wpState.active === id) wpState.active = wpState.list[0] ? wpState.list[0].id : null;
  saveWallpapers(wpState);
  renderWallpaperPreview();
  applyWallpaper();
  toast('已删除该壁纸', 'success');
}

function setActiveWallpaper(id) {
  wpState.active = id;
  saveWallpapers(wpState);
  renderWallpaperPreview();
  applyWallpaper();
}

function resetWallpaper() {
  wpState = { list: [], active: null };
  saveWallpapers(wpState);
  state.settings.wallpaperMode = DEFAULTS.wallpaperMode;
  state.settings.wallpaperOverlay = DEFAULTS.wallpaperOverlay;
  saveState();
  renderWallpaperPreview();
  renderSettings();
  applyWallpaper();
  toast('已恢复默认壁纸', 'success');
}

function renderWallpaperPreview() {
  const host = $('#wpPreview');
  if (!host) return;
  const activeId = wpState.active;
  if (wpState.list.length === 0) {
    host.innerHTML = '<div class="wp-empty">还没有自定义壁纸，点击上方「+ 上传图片」选择你存的周杰伦专辑封面吧～</div>';
    return;
  }
  host.innerHTML = wpState.list.map(w => `
    <div class="wp-item ${w.id === activeId ? 'active' : ''}" data-id="${w.id}" data-name="${escHtml(w.name)}" title="${escHtml(w.name)}">
      <img src="${w.dataUrl}" alt="${escHtml(w.name)}">
      <button class="wp-remove" data-remove="${w.id}" title="删除">×</button>
    </div>`).join('');
  $$('.wp-item', host).forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.dataset.remove) return; // 点到删除钮不触发
      setActiveWallpaper(el.dataset.id);
    });
  });
  $$('.wp-remove', host).forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      confirmModal('删除壁纸？', '确认删除这张壁纸？不会影响你本地原图。', () => removeWallpaper(btn.dataset.remove));
    });
  });
}

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

/* ---------- 桌台运行时状态管理 ---------- */
// 桌台唯一ID: areaId + '-' + tableNumber
function tableId(areaId, num) { return `${areaId}-${num}`; }
function tableLabel(areaId, num) {
  const area = state.settings.areas.find(a => a.id === areaId);
  return `${area ? area.name : areaId} ${num}号桌`;
}

// 确保所有配置中的桌台都有运行时对象
function syncTables() {
  const ids = new Set();
  state.settings.areas.forEach(area => {
    area.tables.forEach(num => {
      const id = tableId(area.id, num);
      ids.add(id);
      if (!state.tables.find(t => t.id === id)) {
        state.tables.push({
          id, areaId: area.id, number: num,
          status: 'idle',
          payment: '', packageName: '',
          people: 1,
          sessionStart: 0,         // 本次(最后一次)开始时间戳
          accumulatedMs: 0,        // 已累计活跃时长(毫秒，不含当前段)
          pausedAt: 0,             // 暂停开始时间戳
          expectedMinutes: 0,      // 0=开放计时
        });
      }
    });
  });
  // 删除配置中已不存在的桌台(空闲中才删)
  state.tables = state.tables.filter(t => ids.has(t.id) || t.status !== 'idle');
}

function getTable(id) { return state.tables.find(t => t.id === id); }

/* 计算桌台实时数据 */
function tableRuntime(t) {
  const now = Date.now();
  let elapsedMs = t.accumulatedMs;
  let status = t.status;
  if (status === 'running') elapsedMs += now - t.sessionStart;
  // 暂停时 elapsed 不变(不含暂停段)
  let remainingMs = null;
  let overtime = false;
  if (t.expectedMinutes > 0) {
    remainingMs = t.expectedMinutes * 60000 - elapsedMs;
    if (remainingMs <= 0 && status !== 'idle') {
      if (status !== 'paused') status = 'overtime';
      else status = 'overtime';  // 暂停状态下也判定超时(暂停期间仍超时)
      overtime = true;
    }
  }
  return { elapsedMs, remainingMs, overtime, status };
}

/* ---------- 计时引擎 ---------- */
function startTick() {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(tick, 1000);
  tick();
}
function tick() {
  // 更新顶部时钟
  $('#clock').textContent = nowStr();
  // 更新看板上的桌台卡片
  if (currentView === 'dashboard') renderDashboard();
  // 检测超时语音提醒
  checkVoiceAlert();
}

let lastAlertedIds = new Set();
function checkVoiceAlert() {
  if (!state.settings.voiceAlert) return;
  const toAlert = [];
  state.tables.forEach(t => {
    if (t.status === 'idle') return;
    const rt = tableRuntime(t);
    if (rt.overtime && !lastAlertedIds.has(t.id)) {
      toAlert.push(t);
      lastAlertedIds.add(t.id);
    } else if (!rt.overtime) {
      lastAlertedIds.delete(t.id);
    }
  });
  if (toAlert.length) {
    const msg = toAlert.map(t => tableLabel(t.areaId, t.number) + '时间已到').join('，');
    speak(msg);
  }
}
function speak(text) {
  try {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = 1;
      speechSynthesis.speak(u);
    }
  } catch (e) { /* ignore */ }
}

/* ---------- 颜色应用 ---------- */
function applyColors() {
  const root = document.documentElement.style;
  root.setProperty('--c-idle', state.settings.colors.idle);
  root.setProperty('--c-running', state.settings.colors.running);
  root.setProperty('--c-paused', state.settings.colors.paused);
  root.setProperty('--c-overtime', state.settings.colors.overtime);
}

/* ============================= 视图: 桌台看板 ============================= */
function renderDashboard() {
  syncTables();
  const board = $('#tableBoard');
  const areaF = $('#areaFilter').value || 'all';
  const statusF = $('#statusFilter').value;

  // 区域筛选下拉
  const af = $('#areaFilter');
  if (af.options.length === 0 || af.dataset.last !== JSON.stringify(state.settings.areas.map(a => a.id))) {
    af.innerHTML = '<option value="all">全部区域</option>' +
      state.settings.areas.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    af.dataset.last = JSON.stringify(state.settings.areas.map(a => a.id));
  }

  let areas = state.settings.areas;
  if (areaF !== 'all') areas = areas.filter(a => a.id === areaF);

  board.innerHTML = areas.map(area => {
    const tables = area.tables.map(n => tableId(area.id, n)).map(getTable).filter(Boolean);
    const filtered = tables.filter(t => {
      if (statusF === 'all') return true;
      const rt = tableRuntime(t);
      return rt.status === statusF;
    });
    const counts = countByStatus(tables);
    return `<div class="area-section">
      <h3>${area.name}
        <span class="area-count">共 ${tables.length} 桌 · 空闲 ${counts.idle} · 使用 ${counts.running + counts.overtime} · 暂停 ${counts.paused}</span>
      </h3>
      <div class="table-grid">
        ${filtered.map(renderTableCard).join('') || '<p style="color:var(--text-muted);grid-column:1/-1">该筛选下无桌台</p>'}
      </div>
    </div>`;
  }).join('') || '<p style="color:var(--text-muted)">暂无桌台，请到「系统设置」中添加区域和桌台。</p>';

  // 绑定点击
  $$('.table-card', board).forEach(card => {
    card.addEventListener('click', () => openTableAction(card.dataset.id));
  });
}

function countByStatus(tables) {
  const c = { idle: 0, running: 0, paused: 0, overtime: 0 };
  tables.forEach(t => { const rt = tableRuntime(t); c[rt.status] = (c[rt.status] || 0) + 1; });
  return c;
}

function renderTableCard(t) {
  const rt = tableRuntime(t);
  const label = tableLabel(t.areaId, t.number);
  const statusText = { idle: '空闲', running: '使用中', paused: '已暂停', overtime: '已超时' }[rt.status];
  let timeDisplay = '--:--:--';
  let remainDisplay = '';
  if (t.status === 'idle') {
    timeDisplay = '空闲';
  } else {
    timeDisplay = msToHMS(rt.elapsedMs);
    if (t.expectedMinutes > 0) {
      if (rt.overtime) {
        remainDisplay = `<div class="tc-remaining over">超时 ${msToHMS(-rt.remainingMs)}</div>`;
      } else {
        const warn = state.settings.overtimeWarn > 0 && rt.remainingMs <= state.settings.overtimeWarn * 60000;
        remainDisplay = `<div class="tc-remaining ${warn ? 'warn' : ''}">剩余 ${msToHMS(rt.remainingMs)}</div>`;
      }
    }
  }
  return `<div class="table-card ${rt.status}" data-id="${t.id}">
    <div class="tc-head">
      <div class="tc-name">${label}</div>
      <div class="tc-status">${statusText}</div>
    </div>
    <div class="tc-customer">${t.status === 'idle' ? '—' : escHtml((t.payment || '') + ' ' + (t.packageName || '未选套餐'))}</div>
    ${t.status !== 'idle' && t.notes ? `<div class="tc-notes" title="${escHtml(t.notes)}">${escHtml(t.notes)}</div>` : ''}
    <div class="tc-time">${timeDisplay}</div>
    ${remainDisplay}
  </div>`;
}

function escHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ---------- 桌台操作面板 ---------- */
function openTableAction(id) {
  const t = getTable(id);
  if (!t) return;
  if (t.status === 'idle') return openStartDialog(t);
  return openRunningDialog(t);
}

/* 开台 */
function openStartDialog(t) {
  const s = state.settings;
  const body = `
    <div class="field">
      <label>支付方式</label>
      <select id="stPayment">
        ${PAYMENTS.map(p => `<option value="${p}">${p}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>套餐</label>
      <select id="stPackage"></select>
    </div>
    <div class="row-2">
      <div class="field">
        <label>人数</label>
        <input type="number" id="stPeople" value="1" min="1">
      </div>
      <div class="field">
        <label>计时模式</label>
        <select id="stMode">
          <option value="0" ${s.defaultDuration === 0 ? 'selected' : ''}>开放计时</option>
          <option value="1" ${s.defaultDuration > 0 ? 'selected' : ''}>固定时长</option>
        </select>
      </div>
    </div>
    <div class="field" id="durWrap" style="display:none">
      <label>时长(分钟)</label>
      <input type="number" id="stDuration" value="${s.defaultDuration || 60}" min="5" step="5">
    </div>
    <div class="field">
      <label>备注</label>
      <input type="text" id="stNotes" placeholder="选填">
    </div>`;
  const footer = `<button class="btn btn-secondary" data-act="cancel">取消</button>
    <button class="btn btn-success" data-act="start">开台</button>`;
  showModal(`开台 · ${tableLabel(t.areaId, t.number)}`, body, footer);

  const modeSel = $('#stMode');
  const durWrap = $('#durWrap');
  modeSel.onchange = () => { durWrap.style.display = modeSel.value === '1' ? 'block' : 'none'; };
  modeSel.onchange();

  const paySel = $('#stPayment');
  const pkgSel = $('#stPackage');
  function fillPackages() {
    const pkgs = PACKAGES[paySel.value] || [];
    pkgSel.innerHTML = pkgs.map(p => `<option value="${p}">${p}</option>`).join('');
  }
  paySel.onchange = fillPackages;
  fillPackages();

  $('#modalFooter').onclick = e => {
    const act = e.target.dataset.act;
    if (act === 'cancel') return closeModal();
    if (act === 'start') {
      const payment = paySel.value;
      const packageName = pkgSel.value;
      const people = parseInt($('#stPeople').value, 10) || 1;
      const notes = $('#stNotes').value.trim();
      let dur = 0;
      if (modeSel.value === '1') {
        dur = parseInt($('#stDuration').value, 10) || 0;
        if (dur < 5) { toast('固定时长不能少于5分钟', 'error'); return; }
      }
      t.status = 'running';
      t.payment = payment; t.packageName = packageName; t.notes = notes;
      t.people = people;
      t.expectedMinutes = dur;
      t.sessionStart = Date.now();
      t.accumulatedMs = 0;
      t.pausedAt = 0;
      saveState();
      closeModal();
      renderDashboard();
      updateTodaySummary();
      toast(`${tableLabel(t.areaId, t.number)} 已开台`, 'success');
    }
  };
}

/* 运行中操作 */
function openRunningDialog(t) {
  const rt = tableRuntime(t);
  const isPaused = t.status === 'paused';
  const isOvertime = rt.status === 'overtime';
  const body = `
    <div class="bill-section">
      <h4>当前使用</h4>
      <div class="bill-row"><span>支付/套餐</span><span>${escHtml(t.payment || '—')} ${escHtml(t.packageName || '—')}</span></div>
      ${t.notes ? `<div class="bill-row"><span>备注</span><span>${escHtml(t.notes)}</span></div>` : ''}
      <div class="bill-row"><span>状态</span><span>${isPaused ? '已暂停' : isOvertime ? '已超时' : '使用中'}</span></div>
      <div class="bill-row"><span>已用时长</span><span>${msToHMS(rt.elapsedMs)}</span></div>
      ${t.expectedMinutes > 0 ? `<div class="bill-row"><span>${rt.overtime ? '已超时' : '剩余'}</span><span>${msToHMS(Math.abs(rt.remainingMs))}</span></div>` : ''}
    </div>`;
  const footer = `
    <button class="btn btn-danger" data-act="clear">清空</button>
    <button class="btn btn-secondary" data-act="extend">加时</button>
    <button class="btn btn-secondary" data-act="repackage">换套餐</button>
    ${isPaused
      ? '<button class="btn btn-primary" data-act="resume">继续计时</button>'
      : '<button class="btn btn-secondary" data-act="pause">暂停</button>'}
    <button class="btn btn-success" data-act="checkout">结束</button>`;
  showModal(`${tableLabel(t.areaId, t.number)} · ${escHtml(t.packageName || '套餐')}`, body, footer);

  $('#modalFooter').onclick = e => {
    const act = e.target.dataset.act;
    if (!act) return;
    if (act === 'pause') { pauseTable(t); }
    else if (act === 'resume') { resumeTable(t); }
    else if (act === 'extend') { extendTable(t); }
    else if (act === 'repackage') { repackageTable(t); }
    else if (act === 'clear') { clearTable(t); }
    else if (act === 'checkout') { checkoutTable(t); }
  };
}

function pauseTable(t) {
  if (t.status !== 'running') return;
  t.accumulatedMs += Date.now() - t.sessionStart;
  t.sessionStart = 0;
  t.status = 'paused';
  t.pausedAt = Date.now();
  saveState();
  closeModal();
  renderDashboard();
  toast('已暂停', 'success');
}
function resumeTable(t) {
  if (t.status !== 'paused') return;
  t.status = 'running';
  t.sessionStart = Date.now();
  t.pausedAt = 0;
  saveState();
  closeModal();
  renderDashboard();
  toast('已继续计时', 'success');
}
function clearTable(t) {
  confirmModal('确认清空该桌台？', `将放弃「${tableLabel(t.areaId, t.number)}」当前记录，桌台恢复空闲。此操作不可撤销。`,
    () => {
      resetTable(t);
      saveState();
      closeModal();
      renderDashboard();
      updateTodaySummary();
      toast('已清空', 'success');
    });
}
function resetTable(t) {
  t.status = 'idle';
  t.payment = ''; t.packageName = ''; t.notes = '';
  t.people = 1;
  t.sessionStart = 0; t.accumulatedMs = 0; t.pausedAt = 0;
  t.expectedMinutes = 0;
}

/* 加时 */
function extendTable(t) {
  const body = `<div class="field"><label>增加时长(分钟)</label><input type="number" id="extMin" value="30" min="5" step="5"></div>
    <p class="hint">当前剩余 ${t.expectedMinutes > 0 ? msToHMS(tableRuntime(t).remainingMs) : '开放计时'}。加时将叠加到固定时长上。</p>`;
  const footer = `<button class="btn btn-secondary" data-act="cancel">取消</button><button class="btn btn-primary" data-act="ok">确定</button>`;
  showModal('加时', body, footer);
  $('#modalFooter').onclick = e => {
    if (e.target.dataset.act === 'cancel') return closeModal();
    if (e.target.dataset.act === 'ok') {
      const min = parseInt($('#extMin').value, 10) || 0;
      if (min < 5) { toast('加时不能少于5分钟', 'error'); return; }
      t.expectedMinutes += min;
      saveState();
      closeModal();
      openRunningDialog(t);
      toast(`已加时 ${min} 分钟`, 'success');
    }
  };
}

/* 换套餐：只更换支付方式/套餐名头，计时和已用时长完全保留 */
function repackageTable(t) {
  const rt = tableRuntime(t);
  const body = `
    <div class="bill-section">
      <h4>当前</h4>
      <div class="bill-row"><span>支付/套餐</span><span>${escHtml(t.payment || '—')} ${escHtml(t.packageName || '—')}</span></div>
      <div class="bill-row"><span>已用时长</span><span>${msToHMS(rt.elapsedMs)}</span></div>
      ${t.expectedMinutes > 0 ? `<div class="bill-row"><span>${rt.overtime ? '已超时' : '剩余'}</span><span>${msToHMS(Math.abs(rt.remainingMs))}</span></div>` : ''}
    </div>
    <div class="row-2">
      <div class="field">
        <label>支付方式</label>
        <select id="rpPayment">${PAYMENTS.map(p => `<option value="${p}" ${p === t.payment ? 'selected' : ''}>${p}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label>套餐</label>
        <select id="rpPackage"></select>
      </div>
    </div>
    <p class="hint">换套餐只更换名头，顾客已用的时间和计时完全保留。要加减时长请用「加时」。</p>`;
  const footer = `<button class="btn btn-secondary" data-act="back">返回</button><button class="btn btn-primary" data-act="ok">确认更换</button>`;
  showModal('更换套餐', body, footer);

  const paySel = $('#rpPayment');
  const pkgSel = $('#rpPackage');
  function fillPackages() {
    const pkgs = PACKAGES[paySel.value] || [];
    pkgSel.innerHTML = pkgs.map(p => `<option value="${p}" ${p === t.packageName ? 'selected' : ''}>${p}</option>`).join('');
  }
  paySel.onchange = fillPackages;
  fillPackages();

  $('#modalFooter').onclick = e => {
    if (e.target.dataset.act === 'back') return openRunningDialog(t);
    if (e.target.dataset.act === 'ok') {
      t.payment = paySel.value;
      t.packageName = pkgSel.value;
      saveState();
      closeModal();
      openRunningDialog(t);
      toast(`已更换为「${t.packageName}」，计时不变`, 'success');
    }
  };
}

/* 结束使用 */
function checkoutTable(t) {
  const rt = tableRuntime(t);
  const body = `
    <div class="bill-section">
      <h4>使用记录 · ${tableLabel(t.areaId, t.number)}</h4>
      <div class="bill-row"><span>支付/套餐</span><span>${escHtml(t.payment || '—')} ${escHtml(t.packageName || '—')}</span></div>
      <div class="bill-row"><span>使用时长</span><span>${msToHMS(rt.elapsedMs)}</span></div>
      ${t.expectedMinutes > 0 ? `<div class="bill-row"><span>${rt.overtime ? '已超时' : '剩余'}</span><span>${msToHMS(Math.abs(rt.remainingMs))}</span></div>` : ''}
    </div>
    <div class="field">
      <label>备注</label>
      <input type="text" id="coNotes" value="${escHtml(t.notes)}">
    </div>`;
  const footer = `<button class="btn btn-secondary" data-act="back">返回</button><button class="btn btn-success" data-act="confirm">确认结束</button>`;
  showModal('结束使用', body, footer);

  $('#modalFooter').onclick = e => {
    const act = e.target.dataset.act;
    if (act === 'back') return openRunningDialog(t);
    if (act === 'confirm') {
      const notes = $('#coNotes').value.trim();
      // 生成使用记录
      state.seq.sales = (state.seq.sales || 0) + 1;
      state.sales.push({
        id: 'S' + Date.now(),
        seq: state.seq.sales,
        date: todayStr(),
        time: nowStr(),
        timestamp: Date.now(),
        tableId: t.id,
        tableLabel: tableLabel(t.areaId, t.number),
        areaId: t.areaId,
        payment: t.payment || '', packageName: t.packageName || '',
        people: t.people || 0,
        durationMs: rt.elapsedMs,
        durationText: msToHMS(rt.elapsedMs),
        notes,
      });
      resetTable(t);
      saveState();
      closeModal();
      renderDashboard();
      updateTodaySummary();
      toast('已结束', 'success');
    }
  };
}

/* ============================= 视图: 使用记录 ============================= */
function renderSales() {
  const dateF = $('#salesDateFilter').value || todayStr();
  $('#salesDateFilter').value = dateF;
  const daySales = state.sales.filter(s => s.date === dateF).sort((a, b) => a.timestamp - b.timestamp);

  // 汇总
  const tables = new Set(daySales.map(r => r.tableId)).size;
  const totalPeople = daySales.reduce((s, r) => s + (r.people || 0), 0);

  $('#salesSummary').innerHTML = `
    <div class="summary-card"><div class="label">开台数</div><div class="value">${tables}</div></div>
    <div class="summary-card"><div class="label">记录数</div><div class="value">${daySales.length}</div></div>
    <div class="summary-card"><div class="label">客流(人)</div><div class="value">${totalPeople}</div></div>`;

  const tbody = $('#salesTbody');
  tbody.innerHTML = daySales.length ? daySales.map((r, i) => {
    return `<tr>
      <td>${i + 1}</td>
      <td>${r.time}</td>
      <td>${escHtml(r.tableLabel)}</td>
      <td>${escHtml(r.payment || '—')} ${escHtml(r.packageName || '')}</td>
      <td>${r.durationText}</td>
      <td>${r.people || 0}</td>
      <td>${escHtml(r.notes || '—')}</td>
    </tr>`;
  }).join('') : `<tr class="empty-row"><td colspan="7">该日期暂无使用记录</td></tr>`;
}

/* ============================= 视图: 储存管理 ============================= */
function renderStorage() {
  const f = $('#storageFilter').value;
  let list = state.storage.slice().sort((a, b) => b.storeTs - a.storeTs);
  if (f === 'stored') list = list.filter(r => r.status === 'stored');
  else if (f === 'picked') list = list.filter(r => r.status === 'picked');
  const today = new Date();
  const tbody = $('#storageTbody');
  tbody.innerHTML = list.length ? list.map((r, i) => {
    const days = daysBetween(parseDate(r.storeDate), today);
    const overdue = r.status === 'stored' && r.pickupDate && parseDate(r.pickupDate) < today;
    const statusBadge = r.status === 'picked'
      ? '<span class="status-badge picked">已取走</span>'
      : overdue ? `<span class="status-badge overdue">逾期(${days}天)</span>`
      : `<span class="status-badge stored">储存中(${days}天)</span>`;
    return `<tr>
      <td>${i + 1}</td>
      <td>${escHtml(r.customer || '—')}</td>
      <td>${escHtml(r.phone || '—')}</td>
      <td>${escHtml(r.workName || '—')}</td>
      <td>${r.storeDate}</td>
      <td>${r.pickupDate || '—'}</td>
      <td>${days}</td>
      <td>${statusBadge}</td>
      <td>${escHtml(r.notes || '—')}</td>
      <td><div class="action-btns">
        ${r.status === 'stored' ? '<button class="btn btn-success btn-sm" data-act="pick" data-id="' + r.id + '">取走</button>' : ''}
        <button class="btn btn-secondary btn-sm" data-act="edit" data-id="${r.id}">编辑</button>
        <button class="btn btn-danger btn-sm" data-act="del" data-id="${r.id}">删</button>
      </div></td>
    </tr>`;
  }).join('') : `<tr class="empty-row"><td colspan="10">暂无储存记录</td></tr>`;

  $$('.action-btns .btn', tbody).forEach(b => {
    b.onclick = () => {
      const id = b.dataset.id, act = b.dataset.act;
      const rec = state.storage.find(r => r.id === id);
      if (act === 'pick') {
        rec.status = 'picked'; rec.pickTs = Date.now();
        saveState(); renderStorage(); toast('已标记取走', 'success');
      } else if (act === 'edit') {
        storageDialog(rec);
      } else if (act === 'del') {
        confirmModal('删除储存记录？', '确认删除该条储存记录？此操作不可撤销。', () => {
          state.storage = state.storage.filter(r => r.id !== id);
          saveState(); renderStorage(); toast('已删除', 'success');
        });
      }
    };
  });
}

function storageDialog(rec) {
  const isNew = !rec;
  rec = rec || { id: 'R' + Date.now(), customer: '', phone: '', workName: '', storeDate: todayStr(), pickupDate: '', notes: '', status: 'stored', storeTs: Date.now() };
  const body = `
    <div class="row-2">
      <div class="field"><label>顾客姓名</label><input type="text" id="srCustomer" value="${escHtml(rec.customer)}"></div>
      <div class="field"><label>联系电话</label><input type="text" id="srPhone" value="${escHtml(rec.phone)}"></div>
    </div>
    <div class="field"><label>作品名称/描述</label><input type="text" id="srWork" value="${escHtml(rec.workName)}" placeholder="如：彩虹猫 8x8"></div>
    <div class="row-2">
      <div class="field"><label>储存日期</label><input type="date" id="srStore" value="${rec.storeDate}"></div>
      <div class="field"><label>预计取走日期</label><input type="date" id="srPick" value="${rec.pickupDate || ''}"></div>
    </div>
    <div class="field"><label>备注</label><textarea id="srNotes">${escHtml(rec.notes)}</textarea></div>`;
  const footer = `<button class="btn btn-secondary" data-act="cancel">取消</button><button class="btn btn-success" data-act="save">保存</button>`;
  showModal(isNew ? '新增储存记录' : '编辑储存记录', body, footer);
  $('#modalFooter').onclick = e => {
    if (e.target.dataset.act === 'cancel') return closeModal();
    if (e.target.dataset.act === 'save') {
      rec.customer = $('#srCustomer').value.trim();
      rec.phone = $('#srPhone').value.trim();
      rec.workName = $('#srWork').value.trim();
      rec.storeDate = $('#srStore').value || todayStr();
      rec.pickupDate = $('#srPick').value;
      rec.notes = $('#srNotes').value.trim();
      if (isNew) state.storage.push(rec);
      saveState();
      closeModal();
      renderStorage();
      toast('已保存', 'success');
    }
  };
}

/* ============================= 视图: 系统设置 ============================= */
function renderSettings() {
  const s = state.settings;
  $('#setShopName').value = s.shopName;
  $('#setDefaultDuration').value = s.defaultDuration;
  $('#setOvertimeWarn').value = s.overtimeWarn;
  $('#setVoiceAlert').checked = s.voiceAlert;
  const modalSizeSel = $('#setModalSize');
  if (modalSizeSel) modalSizeSel.value = s.modalSize || 'standard';
  const cardSizeSel = $('#setCardSize');
  if (cardSizeSel) cardSizeSel.value = s.cardSize || 'compact';
  $('#colorIdle').value = s.colors.idle;
  $('#colorRunning').value = s.colors.running;
  $('#colorPaused').value = s.colors.paused;
  $('#colorOvertime').value = s.colors.overtime;
  $('#wpMode').value = s.wallpaperMode || 'off';
  $('#wpOverlay').value = s.wallpaperOverlay ?? DEFAULTS.wallpaperOverlay;
  $('#wpOverlayVal').textContent = (s.wallpaperOverlay ?? DEFAULTS.wallpaperOverlay) + '%';
  renderWallpaperPreview();
  renderAreaManager();
}

function renderAreaManager() {
  const mgr = $('#areaManager');
  mgr.innerHTML = state.settings.areas.map((a, idx) => `
    <div class="area-row" data-idx="${idx}">
      <input type="text" class="area-input input" data-field="name" value="${escHtml(a.name)}" placeholder="区域名">
      <input type="text" class="tables-input input" data-field="tables" value="${a.tables.join(',')}" placeholder="桌号,逗号分隔,如 1,2,3">
      <button class="btn btn-danger btn-sm" data-act="del-area">删除区域</button>
    </div>`).join('') || '<p style="color:var(--text-muted)">暂无区域，点击下方添加</p>';

  $$('.area-row', mgr).forEach(row => {
    const idx = parseInt(row.dataset.idx, 10);
    $$('input', row).forEach(inp => {
      inp.onchange = () => {
        const f = inp.dataset.field;
        const a = state.settings.areas[idx];
        if (f === 'name') a.name = inp.value.trim() || a.id + '区';
        else if (f === 'tables') {
          a.tables = inp.value.split(',').map(x => parseInt(x.trim(), 10)).filter(n => Number.isFinite(n) && n > 0);
          a.tables = [...new Set(a.tables)].sort((x, y) => x - y);
          inp.value = a.tables.join(',');
        }
        syncTables();
        saveState();
      };
    });
    row.querySelector('[data-act="del-area"]').onclick = () => {
      confirmModal('删除区域？', `将删除「${state.settings.areas[idx].name}」及其桌台。若桌台在使用中则保留运行态直到结束。`, () => {
        state.settings.areas.splice(idx, 1);
        syncTables();
        saveState();
        renderAreaManager();
        renderDashboard();
        toast('已删除区域', 'success');
      });
    };
  });
}

function bindSettingsEvents() {
  $('#setShopName').onchange = e => { state.settings.shopName = e.target.value || '拼豆工坊'; $('#shopName').textContent = state.settings.shopName; saveState(); };
  $('#setDefaultDuration').onchange = e => { state.settings.defaultDuration = parseInt(e.target.value, 10) || 0; saveState(); };
  $('#setOvertimeWarn').onchange = e => { state.settings.overtimeWarn = parseInt(e.target.value, 10) || 0; saveState(); };
  $('#setVoiceAlert').onchange = e => { state.settings.voiceAlert = e.target.checked; saveState(); };
  const modalSizeSel = $('#setModalSize');
  if (modalSizeSel) modalSizeSel.onchange = e => {
    state.settings.modalSize = MODAL_SIZES[e.target.value] ? e.target.value : 'standard';
    applyModalSize();
    saveState();
    toast('弹窗大小已保存', 'success');
  };
  const cardSizeSel = $('#setCardSize');
  if (cardSizeSel) cardSizeSel.onchange = e => {
    state.settings.cardSize = CARD_SIZES.includes(e.target.value) ? e.target.value : 'compact';
    applyCardSize();
    saveState();
    toast('卡片大小已保存', 'success');
  };
  const onColor = () => {
    state.settings.colors = { idle: $('#colorIdle').value, running: $('#colorRunning').value, paused: $('#colorPaused').value, overtime: $('#colorOvertime').value };
    applyColors(); saveState(); renderDashboard();
  };
  ['colorIdle', 'colorRunning', 'colorPaused', 'colorOvertime'].forEach(id => $('#' + id).oninput = onColor);
  $('#resetColors').onclick = () => {
    state.settings.colors = JSON.parse(JSON.stringify(DEFAULTS.colors));
    applyColors(); saveState(); renderSettings(); renderDashboard(); toast('已恢复默认配色', 'success');
  };
  // 壁纸
  $('#wpFileInput').onchange = e => {
    const files = e.target.files;
    if (files && files.length) addWallpaperFiles(files);
    e.target.value = '';
  };
  $('#wpShuffle').onclick = () => {
    const n = pickRandomWallpaper();
    if (!n) return toast('请先上传至少2张壁纸', 'error');
    setActiveWallpaper(n.id); toast('已随机换一张', 'success');
  };
  $('#wpMode').onchange = e => {
    state.settings.wallpaperMode = e.target.value || 'off';
    state.settings.wpLastRotateTs = 0; // 换模式立刻允许下一次生效
    saveState();
    toast('轮播设置已保存', 'success');
  };
  $('#wpOverlay').oninput = e => {
    const v = parseInt(e.target.value, 10) || 0;
    state.settings.wallpaperOverlay = v;
    $('#wpOverlayVal').textContent = v + '%';
    saveState(); applyWallpaper();
  };
  $('#wpReset').onclick = () => confirmModal('恢复默认壁纸？', '将清空你上传的全部壁纸并切回系统默认。此操作不会删除你本地原图。', resetWallpaper);
  $('#addArea').onclick = () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const used = state.settings.areas.map(a => a.id);
    const nextId = letters.split('').find(c => !used.includes(c)) || 'X' + state.settings.areas.length;
    state.settings.areas.push({ id: nextId, name: nextId + '区', tables: [1, 2, 3] });
    syncTables(); saveState(); renderAreaManager(); renderDashboard();
  };
  // 数据管理
  $('#exportData').onclick = () => {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `拼豆系统备份_${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('已导出备份', 'success');
  };
  $('#importData').onclick = () => $('#importFile').click();
  $('#importFile').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        state = Object.assign(loadState(), data);
        state.settings = Object.assign({}, DEFAULTS, state.settings || {});
        state.settings.colors = Object.assign({}, DEFAULTS.colors, (state.settings || {}).colors || {});
        applyColors(); syncTables(); saveState();
        switchView('settings'); renderSettings(); renderDashboard(); updateTopbar();
        toast('导入成功', 'success');
      } catch (err) { toast('导入失败：文件格式错误', 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };
  $('#clearToday').onclick = () => {
    confirmModal('清空今日数据？', '将删除今日所有使用记录。储存记录不受影响。此操作不可撤销。', () => {
      const today = todayStr();
      state.sales = state.sales.filter(s => s.date !== today);
      saveState(); renderSales(); updateTodaySummary();
      toast('已清空今日记录', 'success');
    });
  };
  $('#clearAll').onclick = () => {
    confirmModal('清空全部数据？！', '将删除所有使用记录、储存记录，并重置所有桌台。仅保留店铺设置。此操作不可撤销！请确保已导出备份。', () => {
      state.sales = []; state.storage = []; state.seq = { sales: 0, storage: 0 };
      state.tables.forEach(resetTable);
      saveState(); renderSales(); renderStorage(); renderDashboard(); updateTodaySummary();
      toast('已清空全部数据', 'success');
    });
  };
}

/* ============================= 模态框 ============================= */
function showModal(title, bodyHtml, footerHtml) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  $('#modalFooter').innerHTML = footerHtml;
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; }
function confirmModal(title, msg, onOk) {
  const body = `<p style="margin-bottom:8px;font-weight:600">${escHtml(title)}</p><p style="color:var(--text-muted)">${escHtml(msg)}</p>`;
  const footer = `<button class="btn btn-secondary" data-act="cancel">取消</button><button class="btn btn-danger" data-act="ok">确认</button>`;
  showModal('请确认', body, footer);
  $('#modalFooter').onclick = e => {
    if (e.target.dataset.act === 'cancel') return closeModal();
    if (e.target.dataset.act === 'ok') { closeModal(); onOk(); }
  };
}
$('#modalClose').onclick = closeModal;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

/* ============================= 导航与顶部 ============================= */
function switchView(name) {
  currentView = name;
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $$('.view').forEach(v => v.classList.remove('active'));
  $('#view-' + name).classList.add('active');
  if (name === 'dashboard') renderDashboard();
  else if (name === 'sales') renderSales();
  else if (name === 'storage') renderStorage();
  else if (name === 'settings') renderSettings();
}
function updateTopbar() { $('#shopName').textContent = state.settings.shopName; }
function updateTodaySummary() {
  const today = todayStr();
  const daySales = state.sales.filter(s => s.date === today);
  const running = state.tables.filter(t => t.status !== 'idle').length;
  $('#todaySummary').textContent = `今日记录 ${daySales.length} 条 · 在用 ${running} 桌`;
}

/* ============================= 初始化 ============================= */
function init() {
  syncTables();
  applyColors();
  applyModalSize();
  applyCardSize();
  rotateWallpaperIfNeeded();
  applyWallpaper();
  updateTopbar();
  updateTodaySummary();
  $('#salesDateFilter').value = todayStr();

  $$('.nav-btn').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
  $('#areaFilter').onchange = renderDashboard;
  $('#statusFilter').onchange = renderDashboard;
  $('#salesDateFilter').onchange = renderSales;
  $('#salesPrevDay').onclick = () => shiftSalesDate(-1);
  $('#salesNextDay').onclick = () => shiftSalesDate(1);
  $('#salesToday').onclick = () => { $('#salesDateFilter').value = todayStr(); renderSales(); };
  $('#addStorage').onclick = () => storageDialog(null);
  $('#storageFilter').onchange = renderStorage;
  bindSettingsEvents();

  switchView('dashboard');
  startTick();
  // 小时级轮播:在tick里每秒检测太慢,单独30秒轮询一次
  setInterval(() => { rotateWallpaperIfNeeded(); applyWallpaper(); }, 30000);
}

function shiftSalesDate(delta) {
  const cur = parseDate($('#salesDateFilter').value);
  cur.setDate(cur.getDate() + delta);
  $('#salesDateFilter').value = todayStr(cur);
  renderSales();
}

document.addEventListener('DOMContentLoaded', init);
