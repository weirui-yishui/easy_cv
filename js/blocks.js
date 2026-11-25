/* Easy CV — 块类型注册表 + 预览渲染函数 */
'use strict';

function headerRender(b, ctx) {
  const d = b.data, esc = ctx.esc;
  const contact = [];
  // 约定：显示文字用 ctx.inline（先转义再套 **加粗**，是 esc 的严格超集）；
  //       href / src 这类属性值仍用 esc —— 往 URL 里塞 <strong> 没有意义。
  if (d.email) contact.push('<a href="mailto:' + esc(d.email) + '">' + ctx.icon('email') + ctx.inline(d.email) + '</a>');
  if (d.phone) contact.push('<span>' + ctx.icon('phone') + ctx.inline(d.phone) + '</span>');
  if (d.location) contact.push('<span>' + ctx.icon('location') + ctx.inline(d.location) + '</span>');
  const links = (d.links || []).filter(l => l.url)
    .map(l => '<a class="cv-link" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + ctx.icon(l.icon) + ctx.inline(l.label || ICON_LABELS[l.icon] || 'Link') + '</a>')
    .join('');
  // 自定义信息（如「籍贯：江苏」）：流式排列，整项不拆行。
  // 先 trim 再过滤 —— 否则纯空白条目会渲染出一个空的 .cv-details 行。
  const details = (d.details || [])
    .map(x => ({ k: String((x && x.label) || '').trim(), v: String((x && x.value) || '').trim() }))
    .filter(x => x.k || x.v)
    .map(x => '<span class="dt">' + (x.k && x.v ? ctx.inline(x.k) + ctx.colon + ctx.inline(x.v) : ctx.inline(x.k || x.v)) + '</span>')
    .join('');
  const body = (d.name ? '<h1>' + ctx.inline(d.name) + '</h1>' : '')
    + (d.title ? '<div class="cv-title">' + ctx.inline(d.title) + '</div>' : '')
    + (details ? '<div class="cv-details">' + details + '</div>' : '')
    + (contact.length ? '<div class="cv-contact">' + contact.join('') + '</div>' : '')
    + (links ? '<div class="cv-links">' + links + '</div>' : '')
    + (d.summary ? '<p class="cv-summary">' + ctx.inline(d.summary) + '</p>' : '');

  // 未勾选「显示照片」：不进入两列布局，走与没有照片功能时同一条拼接路径
  //（不是靠 CSS 恰好没变化）。body 里各字段仍各自按「有没有内容」决定是否输出。
  if (!d.showPhoto) return '<header class="cv-header">' + body + '</header>';

  // photo 经校验后直接插入，不做 escapeHTML：base64 字母表是 A-Za-z0-9+/=，
  // 不含 & < > " '，转义对它是恒等操作；校验已保证字符串形状。
  const photo = isValidPhotoDataURL(d.photo)
    ? '<img class="cv-photo" src="' + d.photo + '" alt="">'
    : '<div class="cv-photo cv-photo-empty">照片</div>';
  return '<header class="cv-header has-photo">'
    + '<div class="cv-header-main">' + body + '</div>'
    + photo
    + '</header>';
}
function educationRender(b, ctx) {
  const d = b.data;   // 本函数所有字段都是显示文字，统一走 ctx.inline（内含转义）
  // 英文用 "PhD in Mechanical Engineering"；中文不用 in，直接拼接
  const head = ctx.lang === 'zh'
    ? [d.degree, d.area].filter(Boolean).join(' ')
    : [d.degree, d.area ? 'in ' + d.area : ''].filter(Boolean).join(' ');
  const org = [d.institution, d.location].filter(Boolean).join(' · ');
  const hs = (d.highlights || []).filter(Boolean);
  return '<div class="entry">'
    + '<div class="entry-head">'
    + (head ? '<h3>' + ctx.inline(head) + '</h3>' : '')
    + '<div class="dates">' + ctx.range(d.startDate, d.endDate, d.current) + '</div>'
    + '</div>'
    + (org ? '<div class="org">' + ctx.inline(org) + '</div>' : '')
    + (d.score ? '<p class="score">GPA' + ctx.colon + ctx.inline(d.score) + '</p>' : '')
    + ((d.courses || []).length ? '<div class="tags-line">' + d.courses.map(c => '<span class="ptag">' + ctx.inline(c) + '</span>').join('') + '</div>' : '')
    + (hs.length ? '<ul>' + hs.map(h => '<li>' + ctx.inline(h) + '</li>').join('') + '</ul>' : '')
    + '</div>';
}
function experienceRender(b, ctx) {
  const d = b.data, esc = ctx.esc;
  const org = [d.organization, d.location].filter(Boolean).join(' · ');
  const hs = (d.highlights || []).filter(Boolean);
  return '<div class="entry">'
    + '<div class="entry-head">'
    + (d.position ? '<h3>' + ctx.inline(d.position) + '</h3>' : '')
    + '<div class="dates">' + ctx.range(d.startDate, d.endDate, d.current) + '</div>'
    + '</div>'
    + (org ? '<div class="org">' + ctx.inline(org) + (d.url ? ' · <a href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(d.url) + '</a>' : '') + '</div>' : '')
    + (d.summary ? '<p>' + ctx.inline(d.summary) + '</p>' : '')
    + (hs.length ? '<ul>' + hs.map(h => '<li>' + ctx.inline(h) + '</li>').join('') + '</ul>' : '')
    + '</div>';
}
function projectsRender(b, ctx) {
  const d = b.data, esc = ctx.esc;
  const hs = (d.highlights || []).filter(Boolean);
  return '<div class="entry">'
    + '<div class="entry-head">'
    + (d.name ? '<h3>' + ctx.inline(d.name) + '</h3>' : '')
    + '<div class="dates">' + ctx.range(d.startDate, d.endDate, d.current) + '</div>'
    + '</div>'
    + ((d.roles || []).length ? '<div class="org">' + d.roles.map(ctx.inline).join(ctx.list) + '</div>' : '')
    + (d.description ? '<p>' + ctx.inline(d.description) + '</p>' : '')
    + (d.url ? '<div class="org"><a href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(d.url) + '</a></div>' : '')
    + ((d.keywords || []).length ? '<div class="tags-line">' + d.keywords.map(k => '<span class="ptag">' + ctx.inline(k) + '</span>').join('') + '</div>' : '')
    + (hs.length ? '<ul>' + hs.map(h => '<li>' + ctx.inline(h) + '</li>').join('') + '</ul>' : '')
    + '</div>';
}
function skillsRender(b, ctx) {
  const d = b.data;   // 同 educationRender：全是显示文字，走 ctx.inline
  return '<div class="skill-row"><span class="skill-name">' + ctx.inline(d.name) + '</span>'
    + ((d.keywords || []).length ? ctx.colon + d.keywords.map(ctx.inline).join(ctx.list) : '')
    + '</div>';
}
function customRender(b, ctx) {
  // 标题由 renderSequence 统一输出（相同 title 自动合并），这里只渲染内容。
  // 版式：entry = 经历型（同工作经历）；list = 列表型（每行一条要点）；text = 段落型（自我评价等，换行保留）
  const d = b.data;
  const layout = customLayout(d);
  if (layout === 'list') {
    const items = (d.items || []).filter(Boolean);
    return '<section class="custom-block">' + (items.length ? '<ul>' + items.map(x => '<li>' + ctx.inline(x) + '</li>').join('') + '</ul>' : '') + '</section>';
  }
  if (layout === 'text') {
    const paras = String(d.content || '').split('\n').map(x => x.trim()).filter(Boolean);
    return '<section class="custom-block">' + paras.map(x => '<p class="custom-text">' + ctx.inline(x) + '</p>').join('') + '</section>';
  }
  return '<section class="custom-block">' + experienceRender(b, ctx) + '</section>';
}
const CUSTOM_LAYOUTS = { entry: '经历型（职位 / 机构 / 时间 / 要点）', list: '列表型（每行一条）', text: '段落型（大段文字）' };
function customLayout(d) { return d && CUSTOM_LAYOUTS[d.layout] ? d.layout : 'entry'; }

/* 自动小节标题的多语言映射（zh 与「+」添加菜单的中文标签一致） */
const SECTION_TITLES = {
  en: { education: 'Education', work: 'Work Experience', research: 'Research Experience', projects: 'Projects', skills: 'Skills' },
  zh: { education: '教育经历', work: '工作经历', research: '研究经历', projects: '项目经历', skills: '技能' }
};

const BLOCK_TYPES = {
  header: {
    key: 'header', label: '个人信息', icon: 'user', sectionTitle: null,
    defaults: () => ({ name: '', title: '', details: [], email: '', phone: '', location: '', summary: '', links: [], showPhoto: false, photo: '' }),
    fields: [
      { key: 'name', label: '姓名', type: 'text' },
      { key: 'title', label: '职位 / 头衔', type: 'text' },
      { key: 'details', label: '自定义信息（如 籍贯 / 政治面貌）', type: 'details' },
      { key: 'email', label: '邮箱', type: 'email' },
      { key: 'phone', label: '电话', type: 'text' },
      { key: 'location', label: '所在地', type: 'text' },
      { key: 'summary', label: '个人简介', type: 'textarea' },
      { key: 'showPhoto', label: '显示照片', type: 'checkbox' },
      { key: 'photo', label: '照片（3:4 竖版最佳）', type: 'photo' },
      { key: 'links', label: '链接（谷歌学术 / GitHub / 领英等）', type: 'links' }
    ],
    renderHTML: headerRender
  },
  education: {
    key: 'education', label: '教育经历', icon: 'education', sectionTitle: 'Education',
    defaults: () => ({ institution: '', location: '', degree: '', area: '', startDate: '', endDate: '', current: false, score: '', courses: [], highlights: [] }),
    fields: [
      { key: 'institution', label: '学校', type: 'text' },
      { key: 'degree', label: '学位', type: 'text' },
      { key: 'area', label: '专业', type: 'text' },
      { key: 'location', label: '地点', type: 'text' },
      { key: 'startDate', label: '开始', type: 'month', inline: true },
      { key: 'endDate', label: '结束', type: 'month', inline: true },
      { key: 'current', label: '在读中', type: 'checkbox' },
      { key: 'score', label: 'GPA / 成绩', type: 'text' },
      { key: 'courses', label: '课程（每行一门）', type: 'bullets' },
      { key: 'highlights', label: '亮点', type: 'bullets' }
    ],
    renderHTML: educationRender
  },
  work: {
    key: 'work', label: '工作经历', icon: 'briefcase', sectionTitle: 'Work Experience',
    defaults: () => ({ organization: '', position: '', location: '', startDate: '', endDate: '', current: false, summary: '', highlights: [], url: '' }),
    fields: [
      { key: 'position', label: '职位', type: 'text' },
      { key: 'organization', label: '公司 / 机构', type: 'text' },
      { key: 'location', label: '地点', type: 'text' },
      { key: 'startDate', label: '开始', type: 'month', inline: true },
      { key: 'endDate', label: '结束', type: 'month', inline: true },
      { key: 'current', label: '至今在职', type: 'checkbox' },
      { key: 'url', label: '链接', type: 'url' },
      { key: 'summary', label: '概述', type: 'textarea' },
      { key: 'highlights', label: '职责 / 成果', type: 'bullets' }
    ],
    renderHTML: experienceRender
  },
  research: {
    key: 'research', label: '研究经历', icon: 'flask', sectionTitle: 'Research Experience',
    defaults: () => ({ organization: '', position: '', location: '', startDate: '', endDate: '', current: false, summary: '', highlights: [], url: '' }),
    fields: [
      { key: 'position', label: '职位 / 项目', type: 'text' },
      { key: 'organization', label: '机构 / 实验室', type: 'text' },
      { key: 'location', label: '地点', type: 'text' },
      { key: 'startDate', label: '开始', type: 'month', inline: true },
      { key: 'endDate', label: '结束', type: 'month', inline: true },
      { key: 'current', label: '至今', type: 'checkbox' },
      { key: 'url', label: '链接', type: 'url' },
      { key: 'summary', label: '概述', type: 'textarea' },
      { key: 'highlights', label: '职责 / 成果', type: 'bullets' }
    ],
    renderHTML: experienceRender
  },
  projects: {
    key: 'projects', label: '项目经历', icon: 'folder', sectionTitle: 'Projects',
    defaults: () => ({ name: '', url: '', description: '', startDate: '', endDate: '', current: false, keywords: [], roles: [], highlights: [] }),
    fields: [
      { key: 'name', label: '项目名', type: 'text' },
      { key: 'url', label: '链接', type: 'url' },
      { key: 'startDate', label: '开始', type: 'month', inline: true },
      { key: 'endDate', label: '结束', type: 'month', inline: true },
      { key: 'current', label: '进行中', type: 'checkbox' },
      { key: 'roles', label: '角色（回车添加）', type: 'tags' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'keywords', label: '关键词', type: 'tags' },
      { key: 'highlights', label: '亮点', type: 'bullets' }
    ],
    renderHTML: projectsRender
  },
  skills: {
    key: 'skills', label: '技能', icon: 'zap', sectionTitle: 'Skills',
    defaults: () => ({ name: '', keywords: [] }),
    fields: [
      { key: 'name', label: '技能组名', type: 'text' },
      { key: 'keywords', label: '技能（每行一条，熟练度直接写进内容，如 "Python (Advanced)"）', type: 'bullets' }
    ],
    renderHTML: skillsRender
  },
  custom: {
    key: 'custom', label: '自定义', icon: 'grid', sectionTitle: null,
    defaults: () => ({ title: '', layout: 'entry', position: '', organization: '', location: '', startDate: '', endDate: '', current: false, url: '', summary: '', highlights: [], items: [], content: '' }),
    // 编辑器按版式显示不同字段（renderFields 优先用 fieldsFor）
    fieldsFor(b) {
      const head = this.fields.slice(0, 2);
      const layout = customLayout(b.data);
      if (layout === 'list') return head.concat([{ key: 'items', label: '条目（每行一条，支持 **加粗**）', type: 'bullets' }]);
      if (layout === 'text') return head.concat([{ key: 'content', label: '内容（换行即分段）', type: 'textarea' }]);
      return this.fields;
    },
    fields: [
      { key: 'title', label: '标题（小节标题）', type: 'text' },
      { key: 'layout', label: '版式', type: 'select', options: Object.keys(CUSTOM_LAYOUTS).map(k => ({ v: k, l: CUSTOM_LAYOUTS[k] })) },
      { key: 'position', label: '职位 / 项目', type: 'text' },
      { key: 'organization', label: '公司 / 机构', type: 'text' },
      { key: 'location', label: '地点', type: 'text' },
      { key: 'startDate', label: '开始', type: 'month', inline: true },
      { key: 'endDate', label: '结束', type: 'month', inline: true },
      { key: 'current', label: '至今', type: 'checkbox' },
      { key: 'url', label: '链接', type: 'url' },
      { key: 'summary', label: '概述', type: 'textarea' },
      { key: 'highlights', label: '职责 / 成果', type: 'bullets' }
    ],
    renderHTML: customRender
  }
};

const BlockRegistry = {
  get(t) { return BLOCK_TYPES[t] || null; },
  make(t) { const def = BLOCK_TYPES[t] || BLOCK_TYPES.custom; return { id: uid('b'), type: def.key, data: def.defaults(), visible: true }; }
};

function blockSummary(b) {
  const d = b.data;
  switch (b.type) {
    case 'header': return d.title || '';
    case 'education': return [d.degree, d.institution].filter(Boolean).join(' · ');
    case 'work':
    case 'research':
    case 'experience': return (d.position || '') + (d.organization ? ' @ ' + d.organization : '');
    case 'projects': return d.name || '';
    case 'skills': return d.name || '';
    case 'custom': return d.title || '';
    default: return '';
  }
}

/* ---- 栏目模板（「+」菜单里的预置栏目，可在「管理栏目」里增删；列表存浏览器） ----
 * 模板只用来新建块：新块是一个 custom 块，自己记着 title 和 layout，所以删模板不影响已写好的内容。 */
const SECTION_TEMPLATE_PRESETS = [
  { title: '实习经历', en: 'Internships',           layout: 'entry' },
  { title: '校园经历', en: 'Campus Involvement',    layout: 'entry' },
  { title: '志愿服务', en: 'Volunteering',          layout: 'entry' },
  { title: '获奖荣誉', en: 'Honors & Awards',       layout: 'entry' },
  { title: '论文发表', en: 'Publications',          layout: 'list' },
  { title: '证书资质', en: 'Certifications',        layout: 'list' },
  { title: '语言能力', en: 'Languages',             layout: 'list' },
  { title: '兴趣爱好', en: 'Interests',             layout: 'list' },
  { title: '自我评价', en: 'Summary',               layout: 'text' }
];

/* ---- 块类型转换（「⋯ → 转换为」） ----
 * 各类型的「主标题 / 机构 / 概述 / 要点」字段名不同，先读成统一的四项再写进目标类型；
 * 原数据整体保留在 data 里（渲染器忽略不认识的键），转回原类型时没被改过的内容原样恢复。
 * 地点、起止时间、在读/至今、链接各类型同名，直接沿用。header 不参与转换。 */
const CONVERT_KEYS = {
  education: { primary: 'degree',   org: 'institution', summary: null,          list: 'highlights' },
  work:      { primary: 'position', org: 'organization', summary: 'summary',    list: 'highlights' },
  research:  { primary: 'position', org: 'organization', summary: 'summary',    list: 'highlights' },
  projects:  { primary: 'name',     org: null,           summary: 'description', list: 'highlights' },
  skills:    { primary: 'name',     org: null,           summary: null,          list: 'keywords' }
};
function convertKeysFor(type, data) {
  if (type !== 'custom') return CONVERT_KEYS[type] || null;
  const layout = customLayout(data);
  if (layout === 'list') return { primary: null, org: null, summary: null, list: 'items' };
  if (layout === 'text') return { primary: null, org: null, summary: 'content', list: null };
  return CONVERT_KEYS.work;
}
// 返回新的 data（不修改传入的块）。toType 为 'custom' 时 layout 指定版式。
function convertBlockData(b, toType, layout, sectionTitle) {
  const from = convertKeysFor(b.type, b.data);
  const target = BLOCK_TYPES[toType];
  if (!from || !target || toType === 'header') return null;
  const data = Object.assign(target.defaults(), deepClone(b.data));
  if (toType === 'custom') {
    data.layout = CUSTOM_LAYOUTS[layout] ? layout : 'entry';
    if (!String(data.title || '').trim()) data.title = sectionTitle || '';
  }
  const to = convertKeysFor(toType, data);
  const val = k => (k && from[k] ? b.data[from[k]] : undefined);
  // 主标题：教育的「学位 + 专业」合成一项；转成教育时写进学位
  let primary = val('primary');
  if (b.type === 'education' && b.data.area) primary = [b.data.degree, b.data.area].filter(Boolean).join(' ');
  let list = val('list'), summary = val('summary');
  // 转成段落型 / 列表型时，不让主标题、机构、要点凭空消失：并进可显示的那一项
  if (to.list === null && to.summary) {
    summary = [primary, val('org'), summary].concat(list || []).filter(Boolean).join('\n');
  } else if (to.primary === null && to.list) {
    list = [[primary, val('org')].filter(Boolean).join(' · ')].concat(summary ? [summary] : [], list || []).filter(Boolean);
  }
  if (to.primary && primary !== undefined) data[to.primary] = primary;
  if (to.org && val('org') !== undefined) data[to.org] = val('org');
  if (to.summary && summary !== undefined) data[to.summary] = summary;
  if (to.list && list !== undefined) data[to.list] = Array.isArray(list) ? list.slice() : [];
  return data;
}
