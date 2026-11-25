/* Easy CV — 预览渲染（预览 DOM 即打印对象） */
'use strict';

function renderSequence(blocks, ctx) {
  let html = '';
  let lastType = null;
  let lastCustomTitle = null;
  for (const b of blocks) {
    if (b.visible === false) continue;
    const t = BlockRegistry.get(b.type);
    if (!t) continue;
    if (t.sectionTitle && b.type !== lastType) {
      const lang = (ctx && ctx.lang === 'zh') ? 'zh' : 'en';
      html += '<h2 class="section-title">' + escapeHTML(sectionTitleFor(b.type, ctx && ctx.meta, lang)) + '</h2>';
    }
    if (b.type === 'custom') {
      // 自定义块：相同 title 自动合并为一个标题（仅连续块；隔其他类型则各自出标题）
      const title = (b.data.title || '').trim();
      if (title && title !== lastCustomTitle) html += '<h2 class="section-title">' + escapeHTML(title) + '</h2>';
      lastCustomTitle = title;
    } else {
      lastCustomTitle = null;
    }
    // 给块的最外层元素打上 data-bid，点预览时据此定位到左侧编辑卡片
    html += t.renderHTML(b, ctx).replace(/^<([a-z0-9]+)/i, '<$1 data-bid="' + escapeHTML(b.id) + '"');
    lastType = b.type;
  }
  return html;
}
// 自动小节标题：meta.sectionTitles 里改过名的优先，否则按语言取默认
function sectionTitleFor(type, meta, lang) {
  const custom = meta && meta.sectionTitles && meta.sectionTitles[type];
  if (typeof custom === 'string' && custom.trim()) return custom.trim();
  const t = BLOCK_TYPES[type];
  return (SECTION_TITLES[lang] && SECTION_TITLES[lang][type]) || (t && t.sectionTitle) || '';
}
function renderPreview(state) {
  const themeKey = THEMES[state.theme] ? state.theme : 'classic';
  const fmt = (state.meta && state.meta.dateFormat) || 'MMM YYYY';
  const lang = (state.meta && state.meta.language) === 'zh' ? 'zh' : 'en';
  const zh = lang === 'zh';
  const ctx = {
    esc: escapeHTML,
    icon,
    inline: inlineMarkup,
    markup: renderLightMarkup,
    fmtDate: v => fmtDate(v, fmt),
    range: (s, e, c) => rangeText(s, e, c, fmt, lang),
    lang,
    meta: state.meta,
    colon: zh ? '：' : ': ',   // 冒号（中/英）
    list: zh ? '，' : ', '     // 列表分隔符（中/英）
  };
  const accent = normalizeAccent(state.accent);
  const vars = layoutStyleVars(state.settings, themeKey);
  $('#preview-pane').innerHTML = '<div class="page-zoom"><div class="page ' + themeKey + layoutClasses(state.settings) + '" style="--accent:' + accent + vars + '">' + renderSequence(state.blocks, ctx) + '</div></div>';
  // 纸张 / 页边距 / 页码：@page 不能用 CSS 变量，改写 <head> 里的专用 <style>
  const pageStyle = $('#cv-page-style');
  if (pageStyle) pageStyle.textContent = pageCSS(state.settings);
  if (toggleValue(state.settings, 'pagedPreview')) paginatePreview($('#preview-pane').querySelector('.page'), state.settings);
  applyZoom();
}

/* ---- 预览缩放（界面偏好，存浏览器，不进简历 JSON） ----
 * 'fit' = 按预览区宽度缩放，最大 100%；数字 = 固定比例。
 * 用 transform 只缩放显示，排版仍按 100% 进行：分页测量在缩放前完成，打印时去掉 transform。 */
const ZOOM_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5];
const ZOOM_KEY = 'easy_cv.zoom';
function getZoomPref() {
  try { const v = localStorage.getItem(ZOOM_KEY); if (v === 'fit' || ZOOM_STEPS.includes(Number(v))) return v === 'fit' ? 'fit' : Number(v); } catch (e) { /* 忽略 */ }
  return 'fit';
}
function setZoomPref(v) { try { localStorage.setItem(ZOOM_KEY, String(v)); } catch (e) { /* 忽略 */ } applyZoom(); }
function stepZoom(dir) {
  const cur = currentZoom();
  const next = dir > 0 ? ZOOM_STEPS.find(z => z > cur + 0.001) : [...ZOOM_STEPS].reverse().find(z => z < cur - 0.001);
  if (next) setZoomPref(next);
}
let lastZoom = 1;
function currentZoom() { return lastZoom; }
function applyZoom() {
  const pane = $('#preview-pane');
  const wrap = pane && pane.querySelector && pane.querySelector('.page-zoom');
  const page = wrap && wrap.querySelector && wrap.querySelector('.page');
  if (!page || !page.offsetWidth) return;   // Node 桩 / 尚未布局
  const pref = getZoomPref();
  const avail = pane.clientWidth - 40;      // 减去左右 padding
  const z = pref === 'fit' ? Math.min(1, avail / page.offsetWidth) : pref;
  lastZoom = z;
  page.style.transform = z === 1 ? '' : 'scale(' + z + ')';
  wrap.style.width = page.offsetWidth * z + 'px';
  wrap.style.height = page.offsetHeight * z + 'px';
  const label = $('#zoom-label'); if (label) label.textContent = Math.round(z * 100) + '%';
  const fit = $('#zoom-fit'); if (fit && fit.classList) fit.classList.toggle('active', pref === 'fit');
}

/* ---- 分页预览 ----
 * 按打印版心高度（纸高 − 上下页边距）逐个量 .page 的直接子元素（header / 小节标题 / 条目 / 技能行，
 * 打印时它们都 break-inside: avoid），会超出当前页的就在它前面插一个 .page-gap：
 *   - 预览里 .page-gap 是「本页剩余空白 + 下边距 + 灰色间隔 + 下一页上边距」，看起来像分开的纸；
 *   - 打印时 .page-gap 高度为 0 且 break-before: page，强制在同一位置换页。
 * 预览就是打印对象，所以两边在同一处换页。小节标题和它后面的元素算一组（标题不落单）；
 * 同一行的技能行（双栏）算一组。单个元素比一页还高时无法避开，浏览器打印时会在它内部自然断开，
 * 预览不画这种断点。 */
const PAGE_GAP_PX = 18;
function paginatePreview(page, settings) {
  if (!page || !page.children || typeof page.getBoundingClientRect !== 'function') return 0;
  const MM = 96 / 25.4;
  const mt = settingValue(settings, 'marginTop') * MM, mb = settingValue(settings, 'marginBottom') * MM;
  const fullH = pageSizeOf(settings).h * MM - mt - mb;   // 版心高度
  const H = fullH - 2;                                    // 留 2px 余量，宁可早换页，也别让打印多出一次自然断页
  const repeat = toggleValue(settings, 'repeatSectionTitles');
  const atoms = Array.from(page.children);
  const rect = el => el.getBoundingClientRect();
  const pcs = getComputedStyle(page);
  const bleed = '0 -' + pcs.paddingRight + ' 0 -' + pcs.paddingLeft;   // 间隔条横跨整张纸
  let pageTop = rect(page).top + parseFloat(pcs.paddingTop);
  let pageNo = 1, section = null;
  for (let i = 0; i < atoms.length; i++) {
    const el = atoms[i];
    if (el.matches('h2.section-title')) section = el;
    // 组：小节标题 + 下一个元素；再把与组末元素同一行的元素并进来（双栏技能行）
    let j = (el.matches('h2.section-title') && atoms[i + 1]) ? i + 1 : i;
    const lineTop = rect(atoms[j]).top;
    while (atoms[j + 1] && Math.abs(rect(atoms[j + 1]).top - lineTop) < 1) j++;
    const top = rect(el).top - parseFloat(getComputedStyle(el).marginTop);
    const bottom = Math.max(...atoms.slice(i, j + 1).map(a => rect(a).bottom));
    if (bottom - pageTop > H && top > pageTop + 1) {
      const gap = document.createElement('div');
      gap.className = 'page-gap';
      gap.style.margin = bleed;
      page.insertBefore(gap, el);
      const rest = Math.max(0, pageTop + fullH - rect(gap).top);   // 本页剩余空白
      const h = rest + mb + PAGE_GAP_PX + mt;
      gap.style.height = h + 'px';
      gap.style.setProperty('--gap-a', (rest + mb) + 'px');
      gap.style.setProperty('--gap-b', (rest + mb + PAGE_GAP_PX) + 'px');
      pageNo++;
      gap.dataset.page = pageNo;
      pageTop = rect(gap).bottom;
      // 小节内部换页：下一页开头补一份小节标题（标题本身就是被挪走的元素时不用补）
      if (repeat && section && el !== section) {
        const copy = section.cloneNode(true);
        copy.classList.add('repeated');
        page.insertBefore(copy, el);
      }
    }
    // 单个组比一页还高：打印会在它内部自然断开，跟着推进页起点，后面的分页仍然对得上
    const groupBottom = Math.max(...atoms.slice(i, j + 1).map(a => rect(a).bottom));
    while (groupBottom - pageTop > fullH) { pageTop += fullH; pageNo++; }
    i = j;
  }
  // 补齐最后一页，让预览末页也是整张纸（先挂上再量位置，最后一个元素的下外边距才算得对）
  const filler = document.createElement('div');
  filler.className = 'page-filler';
  page.appendChild(filler);
  filler.style.height = Math.max(0, pageTop + fullH - rect(filler).top) + 'px';
  return pageNo;
}
