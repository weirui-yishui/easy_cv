/* Easy CV — 字体主题 + 配色预设 */
'use strict';

// 字体主题只决定排版（衬线 / 无衬线）；主题色由 state.accent 单独控制
const THEMES = {
  classic: { label: '经典（衬线）' },
  modern:  { label: '现代（无衬线）' }
};

// 5 个专业简历配色（来自调研：藏青/青绿/墨绿/酒红/深紫）
const ACCENT_PRESETS = [
  { hex: '#1F3864', name: '藏青' },
  { hex: '#168F8B', name: '青绿' },
  { hex: '#1E4D2B', name: '墨绿' },
  { hex: '#6E1F2E', name: '酒红' },
  { hex: '#4A2C5A', name: '深紫' }
];

const DEFAULT_ACCENT = '#1f3864';

/* ---- 排版设置（state.settings） ----
 * 每项对应 .page 上的一个 CSS 变量。state.settings 里没有的键不输出变量，
 * 由 css/style.css 里的默认值兜底，所以没调过排版的简历渲染结果不变。
 * 分块字号是相对 fontSize 的倍率：改基准字号整体等比缩放，也能单独调某块。 */
const LAYOUT_SETTINGS = [
  { key: 'fontSize',          label: '基准字号', unit: 'pt', min: 8,   max: 14,  step: 0.5,  def: 10.5,      cssVar: '--fs-base',     css: v => v + 'pt' },
  { key: 'lineHeight',        label: '行距',     unit: '',   min: 1,   max: 2,   step: 0.05, def: 1.5,       cssVar: '--lh',          css: v => String(v) },
  { key: 'sectionSpacing',    label: '小节间距', unit: 'px', min: 0,   max: 40,  step: 1,    def: 15,        cssVar: '--section-gap', css: v => v + 'px' },
  { key: 'nameScale',         label: '姓名',     unit: '×',  min: 1,   max: 2.5, step: 0.05, def: 19 / 10.5, cssVar: '--s-name',      css: v => String(v) },
  { key: 'sectionTitleScale', label: '小节标题', unit: '×',  min: 0.8, max: 1.6, step: 0.05, def: 1,         cssVar: '--s-section',   css: v => String(v) },
  { key: 'contactScale',      label: '联系方式', unit: '×',  min: 0.7, max: 1.2, step: 0.05, def: 9.5 / 10.5, cssVar: '--s-contact',  css: v => String(v) },
  { key: 'entryTitleScale',   label: '条目标题', unit: '×',  min: 0.8, max: 1.4, step: 0.05, def: 1,         cssVar: '--s-entry',     css: v => String(v) },
  { key: 'bodyScale',         label: '正文',     unit: '×',  min: 0.7, max: 1.2, step: 0.05, def: 10 / 10.5, cssVar: '--s-body',      css: v => String(v) },
  { key: 'marginTop',         label: '上',       unit: 'mm', min: 0,   max: 30,  step: 1,    def: 16 },
  { key: 'marginRight',       label: '右',       unit: 'mm', min: 0,   max: 30,  step: 1,    def: 15 },
  { key: 'marginBottom',      label: '下',       unit: 'mm', min: 0,   max: 30,  step: 1,    def: 18 },
  { key: 'marginLeft',        label: '左',       unit: 'mm', min: 0,   max: 30,  step: 1,    def: 15 },
  { key: 'photoWidth',        label: '照片宽度', unit: 'mm', min: 15,  max: 60,  step: 1,    def: 30,        cssVar: '--photo-w',     css: v => v + 'mm' },
  { key: 'photoOffsetX',      label: '照片左右', unit: 'mm', min: -20, max: 20,  step: 0.5,  def: 0,         cssVar: '--photo-dx',    css: v => v + 'mm' },
  { key: 'photoOffsetY',      label: '照片上下', unit: 'mm', min: -20, max: 20,  step: 0.5,  def: 0,         cssVar: '--photo-dy',    css: v => v + 'mm' }
];
const MARGIN_KEYS = ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'];

/* ---- 中西文字体（state.settings.latinFont / cjkFont） ----
 * 都是系统字体栈（离线 file:// 也能用）：每项列出 Windows / macOS / Linux 上的同类字体，装了哪个用哪个。
 * font-family = 西文栈, 中文栈, 通用族：西文字体不含汉字，汉字自动落到中文栈。
 * 未设置时跟随 theme（classic = Georgia + 宋体，modern = Arial + 黑体），旧数据渲染不变。
 * 栈里只用单引号：它会被拼进 style="..." 属性。 */
const FONT_SETTINGS = {
  latinFont: {
    label: '西文字体',
    options: {
      georgia:  { label: 'Georgia（衬线）',      stack: "Georgia, 'Times New Roman'",                               generic: 'serif' },
      times:    { label: 'Times New Roman',      stack: "'Times New Roman', Times, 'Liberation Serif'",             generic: 'serif' },
      garamond: { label: 'Garamond',             stack: "Garamond, 'EB Garamond', 'Adobe Garamond Pro'",            generic: 'serif' },
      palatino: { label: 'Palatino',             stack: "'Palatino Linotype', Palatino, 'Book Antiqua', 'TeX Gyre Pagella'", generic: 'serif' },
      arial:    { label: 'Arial（无衬线）',       stack: "Arial, Helvetica, 'Liberation Sans'",                      generic: 'sans-serif' },
      calibri:  { label: 'Calibri',              stack: 'Calibri, Carlito',                                         generic: 'sans-serif' },
      system:   { label: '系统无衬线（Segoe / SF）', stack: "'Segoe UI', -apple-system, 'Helvetica Neue', Roboto",   generic: 'sans-serif' }
    }
  },
  cjkFont: {
    label: '中文字体',
    options: {
      song:     { label: '宋体', stack: "'Songti SC', STSong, SimSun, 'Noto Serif CJK SC', 'Noto Serif SC', 'Source Han Serif SC'" },
      hei:      { label: '黑体', stack: "'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC', 'Source Han Sans SC', 'WenQuanYi Zen Hei'" },
      kai:      { label: '楷体', stack: "'Kaiti SC', STKaiti, KaiTi, 'AR PL UKai CN'" },
      fangsong: { label: '仿宋', stack: "STFangsong, FangSong, 'FangSong_GB2312'" }
    }
  }
};
const THEME_FONTS = { classic: { latinFont: 'georgia', cjkFont: 'song' }, modern: { latinFont: 'arial', cjkFont: 'hei' } };

/* ---- 样式开关 ----
 * 项目符号：'' / 未设置 = 默认实心圆 •（浏览器 disc）。css 值会拼进 style 属性，只用单引号。 */
const BULLET_STYLES = {
  circle: { label: '◦ 空心圆', css: 'circle' },
  square: { label: '▪ 方块',   css: 'square' },
  dash:   { label: '– 短横',   css: "'–  '" },
  arrow:  { label: '› 箭头',   css: "'›  '" },
  check:  { label: '✓ 对勾',   css: "'✓  '" },
  none:   { label: '无（不缩进）', css: 'none' }
};
// 下拉框类设置（值是字符串枚举；'' = 删除该键 = 默认）
const CHOICE_SETTINGS = Object.assign({}, FONT_SETTINGS, {
  bulletStyle: { label: '项目符号', defaultLabel: '• 实心圆（默认）', options: BULLET_STYLES },
  pageSize: { label: '纸张', defaultLabel: 'A4（210×297mm）', options: { letter: { label: 'Letter（216×279mm）' } } },
  pageNumberPosition: { label: '页码位置', defaultLabel: '居中', options: { left: { label: '左下' }, right: { label: '右下' } } },
  // css = @page 页边框的 content 值（写进 <style> 文本，不进 style 属性，可用双引号）
  pageNumberFormat: { label: '页码格式', defaultLabel: '1 / 3', options: {
    plain:   { label: '1',               css: 'counter(page)' },
    zh:      { label: '第 1 页',          css: '"第 " counter(page) " 页"' },
    zhTotal: { label: '第 1 页 / 共 3 页', css: '"第 " counter(page) " 页 / 共 " counter(pages) " 页"' },
    en:      { label: 'Page 1 of 3',     css: '"Page " counter(page) " of " counter(pages)' }
  } },
  headerAlign: { label: '头部对齐', defaultLabel: '左对齐', options: { center: { label: '居中' } } },
  // css = 高 / 宽；照片按宽度 × 这个比例定高，object-fit: cover 居中裁切
  photoRatio: { label: '照片比例', defaultLabel: '3:4（默认）', options: {
    r57:    { label: '5:7（一寸 / 二寸照）', css: '7 / 5' },
    r23:    { label: '2:3',                css: '3 / 2' },
    square: { label: '1:1',                css: '1' }
  } }
});
const PAGE_SIZES = { a4: { w: 210, h: 297, css: 'A4' }, letter: { w: 215.9, h: 279.4, css: 'letter' } };
const DEFAULT_PAGE_NUMBER_CSS = 'counter(page) " / " counter(pages)';   // 与 style.css 的默认 @page 一致
function pageSizeOf(settings) { return PAGE_SIZES[choiceValue(settings, 'pageSize') || 'a4']; }
// 勾选框类设置：值与 def 不同时给 .page 加 cls
const TOGGLE_SETTINGS = [
  { key: 'showContactIcons', label: '联系方式与链接显示图标', def: true,  cls: 'no-contact-icons' },
  { key: 'accentDivider',    label: '小节分隔线用主题色',     def: false, cls: 'accent-divider' },
  { key: 'skillsTwoColumns', label: '技能分两栏排列',         def: false, cls: 'skills-2col' },
  { key: 'pagedPreview',        label: '分页预览', def: false, cls: 'paged' },
  { key: 'repeatSectionTitles', label: '跨页重复小节标题',     def: false, cls: null },
  { key: 'showPageNumbers',     label: '打印页码',                                     def: true,  cls: null }
];
// 面板分组与顺序（键的类型由所在表决定：TOGGLE / CHOICE / LAYOUT）
const PANEL_LAYOUT = [
  { title: '字体',                  keys: ['latinFont', 'cjkFont'] },
  { title: '字号与行距',            keys: ['fontSize', 'lineHeight', 'sectionSpacing'] },
  { title: '分块字号（× 基准字号）', keys: ['nameScale', 'sectionTitleScale', 'contactScale', 'entryTitleScale', 'bodyScale'] },
  { title: '页边距',                keys: ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'] },
  { title: '页面',                  keys: ['pageSize', 'pagedPreview', 'repeatSectionTitles', 'showPageNumbers', 'pageNumberPosition', 'pageNumberFormat'] },
  { title: '头部',                  keys: ['headerAlign', 'photoWidth', 'photoRatio', 'photoOffsetX', 'photoOffsetY'] },
  { title: '样式',                  keys: ['bulletStyle', 'showContactIcons', 'accentDivider', 'skillsTwoColumns'] }
];
const hasOwnKey = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function isChoiceSetting(key) { return hasOwnKey(CHOICE_SETTINGS, key); }
function toggleDef(key) { return TOGGLE_SETTINGS.find(t => t.key === key) || null; }
// 已设置且合法的选项键，否则 null
function choiceValue(settings, key) {
  const v = settings && settings[key];
  return typeof v === 'string' && hasOwnKey(CHOICE_SETTINGS[key].options, v) ? v : null;
}
// 勾选框当前值（未设置 / 非布尔 → 默认）
function toggleValue(settings, key) {
  const v = settings && settings[key];
  return typeof v === 'boolean' ? v : toggleDef(key).def;
}
// .page 上追加的 class 串（开头带空格；全是默认时为 ''）
function layoutClasses(settings) {
  return TOGGLE_SETTINGS.filter(t => t.cls && toggleValue(settings, t.key) !== t.def).map(t => ' ' + t.cls).join('')
    + (choiceValue(settings, 'headerAlign') === 'center' ? ' header-center' : '');
}
// 两项都没设置 → ''（交给 .page.classic / .page.modern 的 CSS）；设置了任一项 → 另一项取主题默认
function fontFamilyCSS(settings, themeKey) {
  const lat = choiceValue(settings, 'latinFont'), cjk = choiceValue(settings, 'cjkFont');
  if (!lat && !cjk) return '';
  const base = THEME_FONTS[themeKey] || THEME_FONTS.classic;
  const L = FONT_SETTINGS.latinFont.options[lat || base.latinFont];
  const C = FONT_SETTINGS.cjkFont.options[cjk || base.cjkFont];
  return L.stack + ', ' + C.stack + ', ' + L.generic;
}
function layoutDef(key) { return LAYOUT_SETTINGS.find(d => d.key === key) || null; }

// 校验 + 钳位；非法返回 null。设置值会拼进 style 属性，只放行有限数字
function clampSetting(key, value) {
  const d = layoutDef(key);
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!d || typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.min(d.max, Math.max(d.min, n));
}
// 当前生效值（未设置 / 非法 → 默认值）
function settingValue(settings, key) {
  const v = settings ? clampSetting(key, settings[key]) : null;
  return v === null ? layoutDef(key).def : v;
}
function hasMarginSettings(settings) {
  return !!settings && MARGIN_KEYS.some(k => clampSetting(k, settings[k]) !== null);
}
// .page 的内联 CSS 变量串（只含已设置的项）
function layoutStyleVars(settings, themeKey) {
  let s = '';
  if (!settings) return s;
  const ff = fontFamilyCSS(settings, themeKey);
  if (ff) s += ';--body-font:' + ff + ';--head-font:' + ff;
  const ratio = choiceValue(settings, 'photoRatio');
  if (ratio) s += ';--photo-hr:' + CHOICE_SETTINGS.photoRatio.options[ratio].css;
  const bullet = choiceValue(settings, 'bulletStyle');
  if (bullet) s += ';--bullet:' + BULLET_STYLES[bullet].css + (bullet === 'none' ? ';--bullet-indent:0' : '');
  for (const d of LAYOUT_SETTINGS) {
    if (!d.cssVar) continue;
    const v = clampSetting(d.key, settings[d.key]);
    if (v !== null) s += ';' + d.cssVar + ':' + d.css(v);
  }
  // 分页预览要按打印的版心分页，所以即使没设过页边距也让预览 padding = 打印页边距
  if (hasMarginSettings(settings) || toggleValue(settings, 'pagedPreview')) {
    s += ';--m-page:' + MARGIN_KEYS.map(k => settingValue(settings, k) + 'mm').join(' ');
  }
  if (choiceValue(settings, 'pageSize')) {
    const ps = pageSizeOf(settings);
    s += ';--page-w:' + ps.w + 'mm;--page-h:' + ps.h + 'mm';
  }
  return s;
}
// 打印用 @page 规则（写进 #cv-page-style）：只输出与 style.css 默认 @page 不同的部分；全默认时为 ''
function pageCSS(settings) {
  const parts = [];
  if (choiceValue(settings, 'pageSize')) parts.push('size: ' + pageSizeOf(settings).css + ';');
  if (hasMarginSettings(settings)) parts.push('margin: ' + MARGIN_KEYS.map(k => settingValue(settings, k) + 'mm').join(' ') + ';');
  const pos = choiceValue(settings, 'pageNumberPosition'), fmt = choiceValue(settings, 'pageNumberFormat');
  if (!toggleValue(settings, 'showPageNumbers')) {
    parts.push('@bottom-center { content: none; }');
  } else if (pos || fmt) {
    const content = fmt ? CHOICE_SETTINGS.pageNumberFormat.options[fmt].css : DEFAULT_PAGE_NUMBER_CSS;
    if (pos) parts.push('@bottom-center { content: none; }');
    parts.push('@bottom-' + (pos || 'center') + ' { content: ' + content + '; color: #666; font-size: 9pt; }');
  }
  return parts.length ? '@page { ' + parts.join(' ') + ' }' : '';
}
