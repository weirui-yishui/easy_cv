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
const LAYOUT_GROUPS = ['字号与行距', '分块字号（× 基准字号）', '页边距'];
const LAYOUT_SETTINGS = [
  { key: 'fontSize',          group: 0, label: '基准字号', unit: 'pt', min: 8,   max: 14,  step: 0.5,  def: 10.5,      cssVar: '--fs-base',     css: v => v + 'pt' },
  { key: 'lineHeight',        group: 0, label: '行距',     unit: '',   min: 1,   max: 2,   step: 0.05, def: 1.5,       cssVar: '--lh',          css: v => String(v) },
  { key: 'sectionSpacing',    group: 0, label: '小节间距', unit: 'px', min: 0,   max: 40,  step: 1,    def: 15,        cssVar: '--section-gap', css: v => v + 'px' },
  { key: 'nameScale',         group: 1, label: '姓名',     unit: '×',  min: 1,   max: 2.5, step: 0.05, def: 19 / 10.5, cssVar: '--s-name',      css: v => String(v) },
  { key: 'sectionTitleScale', group: 1, label: '小节标题', unit: '×',  min: 0.8, max: 1.6, step: 0.05, def: 1,         cssVar: '--s-section',   css: v => String(v) },
  { key: 'contactScale',      group: 1, label: '联系方式', unit: '×',  min: 0.7, max: 1.2, step: 0.05, def: 9.5 / 10.5, cssVar: '--s-contact',  css: v => String(v) },
  { key: 'entryTitleScale',   group: 1, label: '条目标题', unit: '×',  min: 0.8, max: 1.4, step: 0.05, def: 1,         cssVar: '--s-entry',     css: v => String(v) },
  { key: 'bodyScale',         group: 1, label: '正文',     unit: '×',  min: 0.7, max: 1.2, step: 0.05, def: 10 / 10.5, cssVar: '--s-body',      css: v => String(v) },
  { key: 'marginTop',         group: 2, label: '上',       unit: 'mm', min: 0,   max: 30,  step: 1,    def: 16 },
  { key: 'marginRight',       group: 2, label: '右',       unit: 'mm', min: 0,   max: 30,  step: 1,    def: 15 },
  { key: 'marginBottom',      group: 2, label: '下',       unit: 'mm', min: 0,   max: 30,  step: 1,    def: 18 },
  { key: 'marginLeft',        group: 2, label: '左',       unit: 'mm', min: 0,   max: 30,  step: 1,    def: 15 }
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
function isFontSetting(key) { return Object.prototype.hasOwnProperty.call(FONT_SETTINGS, key); }
// 已设置且合法的字体键，否则 null
function fontChoice(settings, key) {
  const v = settings && settings[key];
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(FONT_SETTINGS[key].options, v) ? v : null;
}
// 两项都没设置 → ''（交给 .page.classic / .page.modern 的 CSS）；设置了任一项 → 另一项取主题默认
function fontFamilyCSS(settings, themeKey) {
  const lat = fontChoice(settings, 'latinFont'), cjk = fontChoice(settings, 'cjkFont');
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
  for (const d of LAYOUT_SETTINGS) {
    if (!d.cssVar) continue;
    const v = clampSetting(d.key, settings[d.key]);
    if (v !== null) s += ';' + d.cssVar + ':' + d.css(v);
  }
  if (hasMarginSettings(settings)) {
    s += ';--m-page:' + MARGIN_KEYS.map(k => settingValue(settings, k) + 'mm').join(' ');
  }
  return s;
}
// 打印用 @page 规则：设置过页边距才输出，否则用 style.css 里的默认 @page
function pageMarginCSS(settings) {
  if (!hasMarginSettings(settings)) return '';
  return '@page { margin: ' + MARGIN_KEYS.map(k => settingValue(settings, k) + 'mm').join(' ') + '; }';
}
