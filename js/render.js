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
      const title = (SECTION_TITLES[lang] && SECTION_TITLES[lang][b.type]) || t.sectionTitle;
      html += '<h2 class="section-title">' + escapeHTML(title) + '</h2>';
    }
    if (b.type === 'custom') {
      // 自定义块：相同 title 自动合并为一个标题（仅连续块；隔其他类型则各自出标题）
      const title = (b.data.title || '').trim();
      if (title && title !== lastCustomTitle) html += '<h2 class="section-title">' + escapeHTML(title) + '</h2>';
      lastCustomTitle = title;
    } else {
      lastCustomTitle = null;
    }
    html += t.renderHTML(b, ctx);
    lastType = b.type;
  }
  return html;
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
    colon: zh ? '：' : ': ',   // 冒号（中/英）
    list: zh ? '，' : ', '     // 列表分隔符（中/英）
  };
  const accent = normalizeAccent(state.accent);
  const vars = layoutStyleVars(state.settings, themeKey);
  $('#preview-pane').innerHTML = '<div class="page ' + themeKey + layoutClasses(state.settings) + '" style="--accent:' + accent + vars + '">' + renderSequence(state.blocks, ctx) + '</div>';
  // 纸张 / 页边距 / 页码：@page 不能用 CSS 变量，改写 <head> 里的专用 <style>
  const pageStyle = $('#cv-page-style');
  if (pageStyle) pageStyle.textContent = pageCSS(state.settings);
  if (toggleValue(state.settings, 'pagedPreview')) paginatePreview($('#preview-pane').querySelector('.page'), state.settings);
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
