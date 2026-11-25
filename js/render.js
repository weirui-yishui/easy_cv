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
    // 允许跨页的块再加 data-break：打印时可在要点之间断开，分页预览会把它拆成两段
    html += t.renderHTML(b, ctx).replace(/^<([a-z0-9]+)/i, '<$1 data-bid="' + escapeHTML(b.id) + '"' + (b.allowBreak && b.type !== 'header' ? ' data-break="1"' : ''));
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
// opts.measure：强制分页并返回页数（「缩到 N 页」试排用，不改状态）
function renderPreview(state, opts) {
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
  const names = $('#cv-page-names');
  if (names) names.textContent = '';
  let pages = 0;
  if (toggleValue(state.settings, 'pagedPreview') || (opts && opts.measure)) {
    pages = paginatePreview($('#preview-pane').querySelector('.page'), state.settings);
    if (names && pages) names.textContent = namedPagesCSS(state.settings, pages);
  }
  lastPageCount = pages;
  applyZoom();
  return pages;
}
let lastPageCount = 0;

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
 * 按打印版心高度（纸高 − 该页上下页边距）逐个量 .page 的直接子元素（header / 小节标题 / 条目 / 技能行，
 * 打印时它们都 break-inside: avoid），会超出当前页的就在它前面插一个 .page-gap：
 *   - 预览里 .page-gap 是「本页剩余空白 + 下边距 + 灰色间隔 + 下一页上边距」，看起来像分开的纸；
 *   - 打印时 .page-gap 高度为 0 且 break-before: page，强制在同一位置换页。
 * 预览就是打印对象，所以两边在同一处换页。
 * 分组：小节标题与下一个元素一组（标题不落单）；同一行的技能行（双栏）一组。
 * 允许跨页的块（data-break）：放不下时在要点 / 段落之间把它拆成两个元素（后半段带同样的 data-bid），
 *   条目头部（标题行、机构、成绩、标签）至少带着一条内容留在一起，不会单独留在页底。
 * 每页单独页边距：每页的元素装进带 page: pN 的 .pg 容器（打印用 @page pN），预览里容器左右外边距补出边距差。
 * 单个不可拆的元素比一页还高时无法避开，浏览器打印时会在它内部自然断开，预览不画这种断点。 */
const PAGE_GAP_PX = 18;
const ENTRY_HEAD_SEL = '.entry-head, .org, .score, .tags-line';
// 可拆块的「最小单位」：列表展开成 li，嵌套的条目容器展开
function breakItems(el) {
  return Array.from(el.children).flatMap(c =>
    (c.tagName === 'UL' || c.tagName === 'OL') ? Array.from(c.children)
      : (c.classList.contains('entry') || c.tagName === 'SECTION') ? breakItems(c) : [c]);
}
// 把 E 从 x 处拆开：x 及其后面的内容挪进 E 的浅拷贝（逐层复制祖先），拷贝插在 E 后面并返回
function splitAt(E, x) {
  let cur = x, built = null;
  while (cur !== E) {
    const parent = cur.parentNode;
    const pc = parent.cloneNode(false);
    if (built) pc.appendChild(built);
    for (let n = built ? cur.nextSibling : cur; n;) { const nx = n.nextSibling; pc.appendChild(n); n = nx; }
    built = pc;
    cur = parent;
  }
  built.classList.add('continued');
  E.parentNode.insertBefore(built, E.nextSibling);
  return built;
}
function paginatePreview(page, settings) {
  if (!page || !page.children || typeof page.getBoundingClientRect !== 'function') return 0;
  const MM = 96 / 25.4;
  const pageH = pageSizeOf(settings).h * MM;
  const perPage = perPageMargins(settings);
  const marg = n => { const m = pageMarginsFor(settings, n); return { t: m.marginTop * MM, r: m.marginRight * MM, b: m.marginBottom * MM, l: m.marginLeft * MM }; };
  const U = marg(null);
  const repeat = toggleValue(settings, 'repeatSectionTitles');
  const rect = el => el.getBoundingClientRect();
  let pageNo = 1, m = marg(1), section = null;
  // 每页单独页边距：每页的元素装进一个 .pg 容器，容器带 page: pN（打印用 @page pN 定边距），
  // 预览里容器的左右外边距补出该页与统一值的差。用容器而不是给每个元素设 page，
  // 是因为双栏技能行这类行内块拿不到页名，页名一变打印就会多出空页。
  let box = page;
  const makeBox = () => {
    const w = document.createElement('div');
    w.className = 'pg';
    w.style.setProperty('page', 'p' + pageNo);
    w.style.marginLeft = (m.l - U.l) + 'px';
    w.style.marginRight = (m.r - U.r) + 'px';
    return w;
  };
  if (perPage) {
    page.style.paddingTop = m.t + 'px';
    box = makeBox();
    while (page.firstChild) box.appendChild(page.firstChild);
    page.appendChild(box);
  }
  let pageTop = rect(page).top + parseFloat(getComputedStyle(page).paddingTop);
  let fullH = pageH - m.t - m.b;   // 版心高度
  let H = fullH - 2;               // 留 2px 余量，宁可早换页，也别让打印多出一次自然断页
  const pageRect = rect(page);
  const newPage = el => {
    const gap = document.createElement('div');
    gap.className = 'page-gap';
    let next = null;
    const prev = m;
    pageNo++;
    m = marg(pageNo);
    if (perPage) {
      // 下一页的容器：间隔条放在容器里第一个（这样它也带下一页的页名，打印不会多出空页），
      // el 及其后面的元素搬进去
      next = makeBox();
      next.appendChild(gap);
      for (let n = el; n;) { const nx = n.nextSibling; next.appendChild(n); n = nx; }
      page.insertBefore(next, box.nextSibling);
    } else {
      page.insertBefore(gap, el);
    }
    const g = rect(gap);
    gap.style.marginLeft = -(g.left - pageRect.left) + 'px';      // 间隔条横跨整张纸
    gap.style.marginRight = -(pageRect.right - g.right) + 'px';
    const rest = Math.max(0, pageTop + fullH - rect(gap).top);    // 本页剩余空白
    gap.style.height = (rest + prev.b + PAGE_GAP_PX + m.t) + 'px';
    gap.style.setProperty('--gap-a', (rest + prev.b) + 'px');
    gap.style.setProperty('--gap-b', (rest + prev.b + PAGE_GAP_PX) + 'px');
    gap.dataset.page = pageNo;
    pageTop = rect(gap).bottom;
    fullH = pageH - m.t - m.b;
    H = fullH - 2;
    if (next) box = next;
    // 小节内部换页：下一页开头补一份小节标题（标题本身就是被挪走的元素时不用补）
    if (repeat && section && el !== section) {
      const copy = section.cloneNode(true);
      copy.classList.add('repeated');
      box.insertBefore(copy, el);
    }
  };
  // 可拆块 E 的拆分点：第一个放不下的最小单位；它若属于头部组（头部 + 第一条内容）则不拆
  const splitPoint = E => {
    const items = breakItems(E);
    let head = 0;
    while (head < items.length && items[head].matches(ENTRY_HEAD_SEL)) head++;
    const i = items.findIndex(x => rect(x).bottom - pageTop > H);
    return i > head ? items[i] : null;
  };
  let el = box.firstElementChild;
  while (el) {
    if (el.matches('h2.section-title')) section = el;
    const unit = [el];
    if (el.matches('h2.section-title') && el.nextElementSibling) unit.push(el.nextElementSibling);
    const lineTop = rect(unit[unit.length - 1]).top;
    for (let nx = unit[unit.length - 1].nextElementSibling; nx && Math.abs(rect(nx).top - lineTop) < 1; nx = nx.nextElementSibling) unit.push(nx);
    const bottom = () => Math.max(...unit.map(a => rect(a).bottom));
    if (bottom() - pageTop > H) {
      const last = unit[unit.length - 1];
      const x = last.hasAttribute('data-break') ? splitPoint(last) : null;
      if (x) splitAt(last, x);   // 前半段留在本页，后半段成为下一个顶层元素，下一轮处理
      else if (rect(el).top - parseFloat(getComputedStyle(el).marginTop) > pageTop + 1) newPage(el);
    }
    // 单个组比一页还高：打印会在它内部自然断开，跟着推进页起点，后面的分页仍然对得上
    const b = bottom();
    while (b - pageTop > fullH) { pageTop += fullH; pageNo++; }
    el = unit[unit.length - 1].nextElementSibling;
  }
  // 补齐最后一页，让预览末页也是整张纸（先挂上再量位置，最后一个元素的下外边距才算得对）
  const filler = document.createElement('div');
  filler.className = 'page-filler';
  page.appendChild(filler);   // 在最后一页容器之外：打印时 display: none
  filler.style.height = Math.max(0, pageTop + fullH - rect(filler).top) + 'px';
  if (perPage) page.style.paddingBottom = m.b + 'px';
  return pageNo;
}

