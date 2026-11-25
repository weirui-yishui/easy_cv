/* Easy CV — 事件绑定 + 启动 */
'use strict';

let store = null;
let editingSwatch = null;
let swatchMenuHex = null;
let photoTargetBlockId = null;   // 点了「选择图片」的那个块，文件选完后回填到这里

function bindEvents() {
  const list = $('#block-list');

  // 关闭弹层（点空白处）
  document.addEventListener('click', e => {
    if (!e.target.closest('.menu') && !e.target.closest('[data-act="add-block"]') && !e.target.closest('[data-action="menu"]')) hideMenus();
  });

  // 块级操作（在 .block-card 内部）
  list.addEventListener('click', e => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const card = a.closest('.block-card');
    const id = card ? card.dataset.blockId : null;
    switch (a.dataset.action) {
      case 'toggle': store.toggleCollapsed(id); break;
      case 'up': store.moveBlock(id, -1); break;
      case 'down': store.moveBlock(id, 1); break;
      case 'menu': {
        menuBlockId = id;
        const b = store.state.blocks.find(x => x.id === id);
        $('#menu-convert').hidden = !b || b.type === 'header';
        showMenu($('#blockMenu'), a.getBoundingClientRect());
        break;
      }
      case 'visible': store.toggleVisible(id); break;
    }
  });

  // 拖动排序：块（抓标题栏左侧 ⋮⋮）与要点（抓行首 ⋮⋮），落点按鼠标在目标上半 / 下半决定插在前 / 后
  let drag = null;
  const clearDrop = () => list.querySelectorAll('.drop-before, .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
  const dropTarget = e => {
    if (!drag) return null;
    const el = drag.kind === 'block' ? e.target.closest('.block-card') : e.target.closest('.bullet-row');
    if (!el) return null;
    if (drag.kind === 'bullet' && el.closest('.field') !== drag.field) return null;   // 要点只在本字段内移动
    const r = el.getBoundingClientRect();
    return { el, after: e.clientY > r.top + r.height / 2 };
  };
  list.addEventListener('dragstart', e => {
    const h = e.target.closest && e.target.closest('.drag-handle');
    if (!h) return;
    const card = h.closest('.block-card');
    const row = h.closest('.bullet-row');
    drag = row
      ? { kind: 'bullet', id: card.dataset.blockId, field: row.closest('.field'), key: row.closest('.field').dataset.key, from: +row.dataset.dragRow }
      : { kind: 'block', id: card.dataset.blockId };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');   // Firefox 不设数据不触发拖动
    const ghost = row || card;
    if (e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(ghost, 12, 12);
    ghost.classList.add('dragging');
  });
  list.addEventListener('dragover', e => {
    const t = dropTarget(e);
    if (!t) return;
    e.preventDefault();
    clearDrop();
    t.el.classList.add(t.after ? 'drop-after' : 'drop-before');
  });
  list.addEventListener('drop', e => {
    const t = dropTarget(e);
    clearDrop();
    if (!t) return;
    e.preventDefault();
    if (drag.kind === 'block') {
      const to = store.state.blocks.findIndex(b => b.id === t.el.dataset.blockId) + (t.after ? 1 : 0);
      store.moveBlockTo(drag.id, to);
    } else {
      moveBullet(drag.id, drag.key, drag.from, +t.el.dataset.dragRow + (t.after ? 1 : 0));
    }
  });
  list.addEventListener('dragend', () => {
    clearDrop();
    list.querySelectorAll('.dragging').forEach(x => x.classList.remove('dragging'));
    drag = null;
  });

  // 点预览里的条目 → 左侧跳到对应块（可在缩放条关掉）；点链接时不跳
  $('#preview-pane').addEventListener('click', e => {
    if (!previewJumpOn() || e.target.closest('a')) return;
    const el = e.target.closest('[data-bid]');
    if (el) jumpToBlock(el.dataset.bid);
  });

  // 文本输入 → 更新状态（预览即时刷新，编辑器不重建以保留焦点）
  list.addEventListener('input', e => {
    const el = e.target;
    if (el.matches('[data-field]')) {
      const card = el.closest('.block-card');
      const id = card.dataset.blockId;
      store.setField(id, el.dataset.field, el.value);
      return;
    }
    if (el.matches('[data-lk]')) {
      const card = el.closest('.block-card');
      const id = card.dataset.blockId;
      updateLink(id, +el.dataset.i, el.dataset.lk, el.value);
      return;
    }
    if (el.matches('[data-dt]')) {
      const card = el.closest('.block-card');
      const id = card.dataset.blockId;
      updateDetail(id, +el.dataset.i, el.dataset.dt, el.value);
      return;
    }
    if (el.matches('[data-bl]')) {
      const card = el.closest('.block-card');
      const id = card.dataset.blockId;
      const key = el.closest('.field').dataset.key;
      updateBullet(id, key, +el.dataset.bl, el.value);
    }
  });

  // checkbox / select
  list.addEventListener('change', e => {
    const el = e.target;
    if (el.matches('input[type=checkbox][data-field]')) {
      const card = el.closest('.block-card');
      const id = card.dataset.blockId;
      const key = el.dataset.field;
      store.setField(id, key, el.checked);
      if (key === 'current') {
        const wrap = card.querySelector('[data-key="endDate"]');
        if (wrap) wrap.classList.toggle('hidden', el.checked);
      }
      return;
    }
    if (el.matches('select[data-field]')) {
      const card = el.closest('.block-card');
      store.setField(card.dataset.blockId, el.dataset.field, el.value);
      if (el.dataset.field === 'layout') renderEditor();   // 换版式 = 换一套字段
    }
  });

  // tags 回车添加
  list.addEventListener('keydown', e => {
    if (e.target.matches('.tag-input') && e.key === 'Enter') {
      e.preventDefault();
      const card = e.target.closest('.block-card');
      const key = e.target.closest('.field').dataset.key;
      const v = e.target.value.trim();
      if (v) { addTag(card.dataset.blockId, key, v); e.target.value = ''; }
    }
  });

  // 全局操作
  document.addEventListener('click', e => {
    const p = e.target.closest('[data-act]');
    if (!p) return;
    const card = p.closest('.block-card');
    const id = card ? card.dataset.blockId : null;
    switch (p.dataset.act) {
      case 'chip-del': {
        const key = p.closest('.field').dataset.key;
        removeTag(id, key, p.dataset.tag);
        break;
      }
      case 'addlink': addLinkRow(id); break;
      case 'rmlink': removeLinkRow(id, +p.dataset.i); break;
      case 'adddetail': addDetailRow(id); break;
      case 'rmdetail': removeDetailRow(id, +p.dataset.i); break;
      case 'pick-photo': photoTargetBlockId = id; $('#photo-file').click(); break;
      // 清除照片不改变 showPhoto：「我要放照片」的意图没变，只是素材没了 → 回到虚线框
      case 'clear-photo': store.setField(id, 'photo', ''); renderPhotoField(id); break;
      case 'addbullet': { const k = p.closest('.field').dataset.key; addBullet(id, k); break; }
      case 'rmbullet': { const k = p.closest('.field').dataset.key; removeBullet(id, k, +p.dataset.i); break; }
      case 'add-block': addMenuAfterId = null; showMenu($('#addMenu'), p.getBoundingClientRect()); break;
      case 'pick-type': {
        const bid = store.addBlock(p.dataset.type, addMenuAfterId);
        hideMenus(); focusBlock(bid);
        break;
      }
      case 'menu-insert': addMenuAfterId = menuBlockId; showMenu($('#addMenu'), p.getBoundingClientRect()); break;
      case 'menu-dup': { const nid = store.duplicateBlock(menuBlockId); hideMenus(); focusBlock(nid); break; }
      case 'menu-convert': {
        const b = store.state.blocks.find(x => x.id === menuBlockId);
        if (!b || b.type === 'header') break;
        buildConvertMenu(b); showMenu($('#convertMenu'), p.getBoundingClientRect());
        break;
      }
      case 'convert-to': {
        const ok = store.convertBlock(menuBlockId, p.dataset.type, p.dataset.layout);
        hideMenus();
        if (ok) { focusBlock(menuBlockId); showToast('已转换；原有内容都保留着，转回去即可恢复'); }
        break;
      }
      case 'pick-tpl': { const bid = addBlockFromTemplate(+p.dataset.i, addMenuAfterId); hideMenus(); if (bid) focusBlock(bid); break; }
      case 'manage-tpl': hideMenus(); openTemplates(); break;
      case 'tpl-add': $('#tpl-rows').insertAdjacentHTML('beforeend', tplRowHTML({ title: '', en: '', layout: 'entry' })); break;
      case 'tpl-del': p.closest('.tpl-row').remove(); break;
      case 'tpl-reset': openTemplates(deepClone(SECTION_TEMPLATE_PRESETS)); break;
      case 'tpl-save': saveSectionTemplates(readTemplateRows()); $('#sections-modal').hidden = true; showToast('栏目已保存'); break;
      case 'tpl-close': $('#sections-modal').hidden = true; break;
      case 'menu-del': store.deleteBlock(menuBlockId); hideMenus(); break;
      case 'undo': store.undo(); break;
      case 'redo': store.redo(); break;
      case 'print': printPDF(); break;
      case 'import': $('#import-file').click(); break;
      case 'export': exportJSON('app'); break;
      case 'theme': store.setTheme(p.dataset.theme); hideMenus(); break;
      case 'dd-theme': showMenu($('#themeMenu'), p.getBoundingClientRect()); break;
      case 'dd-color': syncAccentUI(); showMenu($('#colorMenu'), p.getBoundingClientRect()); break;
      case 'accent-pick': editingSwatch = null; setAddBtnLabel(); $('#swatchMenu').hidden = true; store.setAccent(p.dataset.accent); syncAccentUI(); break;
      case 'accent-add': addCustomColor(); break;
      case 'swatch-edit': startEditSwatch(swatchMenuHex); break;
      case 'swatch-del': removeCustomColor(swatchMenuHex); hideMenus(); showToast('已删除 ' + swatchMenuHex); break;
      case 'accent-random': { const hex = randomAccent(); store.setAccent(hex); syncAccentUI(); showToast('随机配色 ' + hex); break; }
      case 'toggle-layout': setLayoutPaneOpen(!layoutPaneOpen()); break;
      case 'zoom-in': stepZoom(1); break;
      case 'zoom-out': stepZoom(-1); break;
      case 'zoom-fit': setZoomPref('fit'); break;
      case 'toggle-jump': setPreviewJump(!previewJumpOn()); break;
      case 'layout-reset': store.resetSettings(); syncLayoutUI(); showToast('排版已恢复默认'); break;
      case 'dd-settings': openSettings(); break;
      case 'save-settings': saveSettings(); break;
      case 'close-settings': closeSettings(); break;
    }
  });

  // 导入文件
  $('#import-file').addEventListener('change', e => { if (e.target.files[0]) importJSONFile(e.target.files[0]); e.target.value = ''; });

  // 照片文件：选完立刻缩到 400px 存成 data URL（同导入文件的写法，处理完清空 value 以便重复选同一文件）
  $('#photo-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    const id = photoTargetBlockId;
    e.target.value = '';
    if (!file || !id) return;
    try {
      const url = await makePhotoDataURL(file);
      store.setField(id, 'photo', url);
      renderPhotoField(id);
    } catch (err) { showToast(err.message); }
  });

  // 排版面板：滑块和数字框都实时生效，并互相同步
  $('#layout-pane').addEventListener('input', e => {
    const key = e.target.dataset.setting;
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (!key || !store.setSetting(key, value)) return;
    syncLayoutUI();
  });

  // 配色输入框回车：编辑模式保存修改，否则应用为主题色
  $('#accent-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); editingSwatch ? addCustomColor() : applyAccentInput(); } });

  // 自定义色块：右键弹出修改/删除菜单
  $('#color-swatches').addEventListener('contextmenu', e => {
    const sw = e.target.closest('.swatch');
    if (!sw || !sw.dataset.custom) return;
    e.preventDefault();
    swatchMenuHex = sw.dataset.accent;
    showMenu($('#swatchMenu'), { left: e.clientX, top: e.clientY, bottom: e.clientY, right: e.clientX });
  });

  // 快捷键
  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && !e.shiftKey && k === 'z') { e.preventDefault(); store.undo(); }
    else if (mod && (k === 'y' || (e.shiftKey && k === 'z'))) { e.preventDefault(); store.redo(); }
    else if (mod && !e.shiftKey && k === 's') { e.preventDefault(); saveJSONFile(); }
    else if (mod && !e.shiftKey && !e.altKey && k === 'b' && isBoldTarget(e.target)) { e.preventDefault(); applyBold(e.target); }
  });

}

function loadInitial() {
  let state;
  try {
    const raw = localStorage.getItem('easy_cv.draft');
    if (raw) state = JSON.parse(raw);
  } catch (e) { /* 忽略 */ }
  if (!state) state = deepClone(SAMPLE);
  if (!THEMES[state.theme]) state.theme = 'classic';
  if (!isValidHex(state.accent)) state.accent = DEFAULT_ACCENT;
  // 兼容旧数据：experience→research；旧 custom→继承 experience 字段
  for (const b of state.blocks) {
    migrateBlock(b);
    // 块默认折叠（已有折叠状态则尊重）
    if (typeof b.collapsed !== 'boolean') b.collapsed = true;
  }
  return state;
}

/* ---- 配色菜单 ---- */
function getCustomColors() {
  try {
    const raw = localStorage.getItem('easy_cv.custom_colors');
    if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) return arr.filter(isValidHex); }
  } catch (e) { /* 忽略 */ }
  return [];
}
function saveCustomColors(arr) {
  try { localStorage.setItem('easy_cv.custom_colors', JSON.stringify(arr)); } catch (e) { /* 忽略 */ }
}
function swatchHTML(hex, isCustom) {
  return '<button class="swatch' + (isCustom ? ' custom' : '') + '" data-act="accent-pick" data-accent="' + hex + '"' + (isCustom ? ' data-custom="1"' : '') + ' style="background:' + hex + '" title="' + hex + (isCustom ? '（右键：修改/删除）' : '') + '"></button>';
}
function buildColorMenu() {
  const presets = ACCENT_PRESETS.map(p => p.hex);
  const custom = getCustomColors();
  $('#color-swatches').innerHTML = presets.map(h => swatchHTML(h, false)).join('') + custom.map(h => swatchHTML(h, true)).join('');
}
function removeCustomColor(hex) {
  const custom = getCustomColors().filter(c => c !== hex);
  saveCustomColors(custom);
  if (editingSwatch === hex) editingSwatch = null;
  buildColorMenu();
  syncAccentUI();
  setAddBtnLabel();
}
function setAddBtnLabel() {
  const b = $('#accent-add');
  if (b) b.textContent = editingSwatch ? '保存' : '+ 添加';
}
function startEditSwatch(hex) {
  editingSwatch = hex;
  $('#accent-input').value = hex;
  $('#accent-input').focus();
  $('#accent-input').select();
  setAddBtnLabel();
  hideMenus();
  showToast('正在修改 ' + hex + '，改完按 Enter 或点「保存」');
}
function syncAccentUI() {
  const cur = normalizeAccent(store.state.accent);
  $('#accent-input').value = cur;
  $('#accent-current').textContent = cur;
  document.querySelectorAll('#color-swatches .swatch').forEach(el => {
    el.classList.toggle('active', String(el.dataset.accent).toLowerCase() === cur);
    el.classList.toggle('editing', String(el.dataset.accent).toLowerCase() === (editingSwatch || '').toLowerCase());
  });
}
function applyAccentInput() {
  const hex = parseColor($('#accent-input').value.trim());
  if (!hex) { showToast('颜色格式：支持 #RRGGBB / #RGB / rgb(r,g,b)'); return; }
  store.setAccent(hex);
  syncAccentUI();
}
function addCustomColor() {
  const hex = parseColor($('#accent-input').value.trim());
  if (!hex) { showToast('颜色格式：支持 #RRGGBB / #RGB / rgb(r,g,b)'); return; }
  let custom = getCustomColors();
  if (editingSwatch) {
    // 编辑模式：替换正在修改的色块
    custom = custom.filter(c => c !== editingSwatch);
    editingSwatch = null;
    if (!custom.includes(hex)) custom.push(hex);
    saveCustomColors(custom);
    buildColorMenu(); syncAccentUI(); setAddBtnLabel();
    showToast('已修改为 ' + hex);
    return;
  }
  if (!custom.includes(hex)) { custom.push(hex); saveCustomColors(custom); }
  buildColorMenu(); syncAccentUI();
  showToast('已添加 ' + hex);
}
/* ---- Ctrl/⌘+B 加粗：只作用于编辑器里的文本框 ---- */
function isBoldTarget(el) {
  return !!el && !!el.closest && !!el.closest('#block-list')
    && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text'));
}
function applyBold(el) {
  const r = toggleBoldMarkup(el.value, el.selectionStart, el.selectionEnd);
  el.value = r.value;
  el.setSelectionRange(r.start, r.end);
  el.dispatchEvent(new Event('input', { bubbles: true }));   // 走原有的 input 处理，写回状态、可撤销
}

/* ---- 点预览定位开关（界面偏好，存浏览器） ---- */
const JUMP_KEY = 'easy_cv.previewJump';
function previewJumpOn() { try { return localStorage.getItem(JUMP_KEY) !== 'off'; } catch (e) { return true; } }
function setPreviewJump(on) {
  try { localStorage.setItem(JUMP_KEY, on ? 'on' : 'off'); } catch (e) { /* 忽略 */ }
  applyPreviewJump();
}
function applyPreviewJump() {
  const on = previewJumpOn();
  const pane = $('#preview-pane'); if (pane && pane.classList) pane.classList.toggle('jump-on', on);
  const btn = $('#btn-jump'); if (btn && btn.classList) btn.classList.toggle('active', on);
}

/* ---- 排版面板（右侧，可收起；开合状态存浏览器） ---- */
const LAYOUT_PANE_KEY = 'easy_cv.layoutPane';
function layoutPaneOpen() {
  try { return localStorage.getItem(LAYOUT_PANE_KEY) !== 'closed'; } catch (e) { return true; }
}
function setLayoutPaneOpen(open) {
  try { localStorage.setItem(LAYOUT_PANE_KEY, open ? 'open' : 'closed'); } catch (e) { /* 忽略 */ }
  applyLayoutPane();
}
function applyLayoutPane() {
  const open = layoutPaneOpen();
  const body = document.querySelector('.app-body');
  if (body && body.classList) body.classList.toggle('layout-collapsed', !open);
  const btn = $('#btn-layout');
  if (btn && btn.classList) btn.classList.toggle('active', open);
  if (open) syncLayoutUI();
  applyZoom();   // 面板开合改变预览区宽度，「适应宽度」要重算
}
function fmtSetting(v) { return String(Math.round(v * 100) / 100); }
function choiceRowHTML(key) {
  const f = CHOICE_SETTINGS[key];
  return '<div class="layout-row"><label>' + f.label + '</label><select data-setting="' + key + '">'
    + '<option value="">' + (f.defaultLabel || '跟随主题') + '</option>'
    + Object.keys(f.options).map(k => '<option value="' + k + '">' + f.options[k].label + '</option>').join('')
    + '</select></div>';
}
function layoutRowHTML(key) {
  const t = toggleDef(key);
  if (t) return '<label class="layout-check"><input type="checkbox" data-setting="' + key + '">' + t.label + '</label>';
  if (isChoiceSetting(key)) return choiceRowHTML(key);
  const d = layoutDef(key);
  const attrs = ' data-setting="' + d.key + '" min="' + d.min + '" max="' + d.max + '" step="' + d.step + '"';
  return '<div class="layout-row"><label>' + d.label + '</label>'
    + '<input type="range"' + attrs + '>'
    + '<input type="number"' + attrs + '>'
    + '<span class="unit">' + d.unit + '</span></div>';
}
function buildLayoutMenu() {
  $('#layout-rows').innerHTML = PANEL_LAYOUT
    .map(g => '<div class="layout-group">' + g.title + '</div>' + g.keys.map(layoutRowHTML).join(''))
    .join('');
}
// 依赖其他开关才生效的项：前提没打开时置灰
const LAYOUT_REQUIRES = { repeatSectionTitles: 'pagedPreview', pageNumberPosition: 'showPageNumbers', pageNumberFormat: 'showPageNumbers' };
// 用当前状态回填面板（打开、撤销、恢复默认后调用）；正在输入的框不动，避免打断输入
function syncLayoutUI() {
  const themeFonts = THEME_FONTS[store.state.theme] || THEME_FONTS.classic;
  document.querySelectorAll('#layout-pane [data-setting]').forEach(el => {
    const key = el.dataset.setting;
    if (LAYOUT_REQUIRES[key]) el.disabled = !toggleValue(store.state.settings, LAYOUT_REQUIRES[key]);
    if (toggleDef(key)) { el.checked = toggleValue(store.state.settings, key); return; }
    if (isChoiceSetting(key)) {
      // 字体的「跟随主题」后面标出当前主题实际用的字体
      if (themeFonts[key]) el.options[0].textContent = '跟随主题（' + FONT_SETTINGS[key].options[themeFonts[key]].label + '）';
      el.value = choiceValue(store.state.settings, key) || '';
      return;
    }
    if (el === document.activeElement && el.type === 'number') return;
    el.value = fmtSetting(settingValue(store.state.settings, el.dataset.setting));
  });
}
function buildAddMenu() {
  const tpls = getSectionTemplates();
  $('#addMenu').innerHTML = Object.keys(BLOCK_TYPES).map(k => {
    const t = BLOCK_TYPES[k];
    return '<div class="menu-item" data-act="pick-type" data-type="' + k + '">' + icon(t.icon) + t.label + '</div>';
  }).join('')
    + '<div class="menu-sep">栏目模板</div>'
    + tpls.map((t, i) => '<div class="menu-item" data-act="pick-tpl" data-i="' + i + '">' + icon('grid') + escapeHTML(t.title) + '</div>').join('')
    + '<div class="menu-item" data-act="manage-tpl">⚙ 管理栏目…</div>';
}

/* ---- 栏目模板：列表存浏览器（同自定义配色），没存过就用预设 ---- */
const TPL_KEY = 'easy_cv.sectionTemplates';
function sanitizeTemplates(arr) {
  if (!Array.isArray(arr)) return null;
  return arr.filter(t => t && typeof t.title === 'string' && t.title.trim())
    .map(t => ({ title: t.title.trim(), en: typeof t.en === 'string' ? t.en.trim() : '', layout: CUSTOM_LAYOUTS[t.layout] ? t.layout : 'entry' }));
}
function getSectionTemplates() {
  try { const v = sanitizeTemplates(JSON.parse(localStorage.getItem(TPL_KEY))); if (v) return v; } catch (e) { /* 忽略 */ }
  return deepClone(SECTION_TEMPLATE_PRESETS);
}
function saveSectionTemplates(arr) {
  try { localStorage.setItem(TPL_KEY, JSON.stringify(sanitizeTemplates(arr) || [])); } catch (e) { /* 忽略 */ }
  buildAddMenu();
}
function addBlockFromTemplate(i, afterId) {
  const t = getSectionTemplates()[i];
  if (!t) return null;
  const zh = (store.state.meta && store.state.meta.language) === 'zh';
  return store.addBlock('custom', afterId, { title: zh || !t.en ? t.title : t.en, layout: t.layout });
}
function tplRowHTML(t) {
  const opts = Object.keys(CUSTOM_LAYOUTS).map(k => '<option value="' + k + '"' + (k === t.layout ? ' selected' : '') + '>' + CUSTOM_LAYOUTS[k].replace(/（.*/, '') + '</option>').join('');
  return '<div class="tpl-row"><input data-tpl="title" value="' + escapeHTML(t.title) + '" placeholder="如 实习经历">'
    + '<input data-tpl="en" value="' + escapeHTML(t.en || '') + '" placeholder="如 Internships">'
    + '<select data-tpl="layout">' + opts + '</select>'
    + '<span class="blk-btn del" data-act="tpl-del" title="删除">✕</span></div>';
}
function openTemplates(list) {
  $('#tpl-rows').innerHTML = (list || getSectionTemplates()).map(tplRowHTML).join('');
  $('#sections-modal').hidden = false;
}
function readTemplateRows() {
  return Array.from(document.querySelectorAll('#tpl-rows .tpl-row')).map(r => ({
    title: r.querySelector('[data-tpl=title]').value, en: r.querySelector('[data-tpl=en]').value, layout: r.querySelector('[data-tpl=layout]').value
  }));
}

/* ---- 转换块类型菜单 ---- */
function buildConvertMenu(b) {
  const items = Object.keys(BLOCK_TYPES).filter(k => k !== 'header' && k !== 'custom' && k !== b.type)
    .map(k => '<div class="menu-item" data-act="convert-to" data-type="' + k + '">' + icon(BLOCK_TYPES[k].icon) + BLOCK_TYPES[k].label + '</div>');
  const cur = b.type === 'custom' ? customLayout(b.data) : null;
  for (const l of Object.keys(CUSTOM_LAYOUTS)) {
    if (l === cur) continue;
    items.push('<div class="menu-item" data-act="convert-to" data-type="custom" data-layout="' + l + '">' + icon('grid') + '自定义 · ' + CUSTOM_LAYOUTS[l].replace(/（.*/, '') + '</div>');
  }
  $('#convertMenu').innerHTML = items.join('');
}
function boot() {
  buildAddMenu();
  buildColorMenu();
  buildLayoutMenu();
  refreshSaveTarget(); // 工具栏提示当前 Ctrl+S 保存位置
  store = new StateStore(loadInitial());
  store.subscribe((state, kind) => {
    renderPreview(state);
    if (kind === 'structure') renderEditor();
    if (layoutPaneOpen()) syncLayoutUI();   // 撤销/重做时面板数值跟着变
    updateToolbar();
  });
  renderEditor();
  renderPreview(store.state);
  updateToolbar();
  bindEvents();
  applyLayoutPane();
  applyPreviewJump();
  window.addEventListener('resize', debounce(applyZoom, 100));
}

boot();
