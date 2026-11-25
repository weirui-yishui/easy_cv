/* 冒烟测试（Node 环境，桩模拟浏览器）。运行：node test.js */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---- 浏览器桩 ---- */
const els = {};
function fakeEl() {
  const el = {
    innerHTML: '', value: '', checked: false, disabled: false, hidden: false,
    dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, appendChild() {}, focus() {}, scrollIntoView() {},
    scrollTop: 0, scrollHeight: 0,
    querySelector() { return fakeEl(); }, querySelectorAll() { return []; },
    closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, bottom: 0, right: 0, width: 0, height: 0 }; }
  };
  return el;
}
global.document = {
  querySelector(sel) { if (!els[sel]) els[sel] = fakeEl(); return els[sel]; },
  querySelectorAll() { return []; },
  addEventListener() {}, createElement() { return fakeEl(); },
  body: fakeEl()
};
global.window = { innerWidth: 1400, innerHeight: 900, print() {}, addEventListener() {} };
global.alert = (m) => { throw new Error('alert called: ' + m); };
global.localStorage = {
  _d: {},
  getItem(k) { return k in this._d ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; }
};
// FileReader 桩：同步喂回 JSON 内容（用于测试导入）
global.FileReader = function () {
  this.result = '';
  this.readAsText = function (file) {
    this.result = '{"schemaVersion":1,"theme":"classic","accent":"#1f3864","meta":{"dateFormat":"MMM YYYY"},"blocks":[]}';
    if (this.onload) this.onload();
  };
};

/* ---- 拼接全部模块 + 测试代码，一次性 eval（共享作用域） ---- */
const order = ['utils', 'photo', 'blocks', 'themes', 'store', 'render', 'editor', 'export', 'sample', 'boot'];
let code = '';
for (const f of order) code += '\n' + fs.readFileSync(path.join(__dirname, 'js', f + '.js'), 'utf8');

const tests = `
;(async () => {
  const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT FAIL: ' + msg); };

  // 1. 启动后预览渲染出示例 CV
  const preview = els['#preview-pane'].innerHTML;
  assert(preview.includes('Bowen Sha'), 'preview 应包含姓名');
  assert(preview.includes('Massachusetts Institute of Technology'), 'preview 应包含学校');
  assert(preview.includes('Research Experience'), 'preview 应有 Research Experience 标题');
  assert(preview.includes('Selected Publications'), 'preview 应有 Publications 标题');
  assert(preview.includes('cv-links'), 'preview 应包含链接行');
  assert(store.state.blocks.every(b => b.collapsed === true), '块默认折叠');

  // 1b. 迁移：旧 experience→research；旧 custom→继承 experience 字段
  localStorage.setItem('easy_cv.draft', JSON.stringify({ schemaVersion: 1, theme: 'classic', accent: '#1f3864', meta: { dateFormat: 'MMM YYYY' }, blocks: [
    { id: 'b_old1', type: 'experience', data: {}, visible: true },
    { id: 'b_old2', type: 'custom', data: { title: 'Awards', subtitle: 'Some Award', rightText: '2020', body: '- Won first prize' + String.fromCharCode(10) + '- Runner-up' }, visible: true }
  ] }));
  const migrated = loadInitial();
  assert(migrated.blocks[0].type === 'research', '旧 experience 迁移为 research');
  const mc = migrated.blocks[1];
  assert(mc.type === 'custom' && mc.data.position === 'Some Award', '旧 custom subtitle→position');
  assert(JSON.stringify(mc.data.highlights) === JSON.stringify(['Won first prize', 'Runner-up']), '旧 custom body -行→highlights');
  assert(mc.data.title === 'Awards', 'custom title 保留');
  localStorage.removeItem('easy_cv.draft');

  // HTML 转义生效：注入内容被转义，不出现原始标签
  const evil = '<img src=x onerror=alert(1)>';
  store.setField(store.state.blocks.find(b => b.type === 'header').id, 'title', evil);
  const pEsc = els['#preview-pane'].innerHTML;
  assert(pEsc.includes('&lt;img'), '注入被转义成实体');
  assert(!pEsc.includes('<img src=x onerror'), '不出现原始注入标签');
  store.undo();
  assert(store.state.blocks.find(b => b.type === 'header').data.title !== evil, 'undo 恢复标题');

  // 2. StateStore：添加 / 修改 / 排序 / 删除 / 撤销 / 重做
  const n0 = store.state.blocks.length;
  const nid = store.addBlock('skills');
  assert(store.state.blocks.length === n0 + 1, 'addBlock 数量+1');
  store.setField(nid, 'name', 'Test Skill');
  store.setField(nid, 'keywords', ['a', 'b']);
  assert(store.state.blocks.find(b => b.id === nid).data.name === 'Test Skill', 'setField 生效');
  store.moveBlock(nid, -1);
  assert(store.state.blocks.findIndex(b => b.id === nid) === n0 - 1, 'moveBlock 上移');
  store.undo();
  assert(store.state.blocks.findIndex(b => b.id === nid) === n0, 'undo 恢复位置');
  store.redo();
  assert(store.state.blocks.findIndex(b => b.id === nid) === n0 - 1, 'redo 重做位置');
  store.deleteBlock(nid);
  assert(store.state.blocks.length === n0, 'deleteBlock 数量恢复');

  // 3. JSON Patch
  JSONPatch.apply(store.state, { op: 'replace', path: '/blocks/0/data/name', value: 'PATCHED' });
  assert(store.state.blocks[0].data.name === 'PATCHED', 'JSONPatch replace');
  JSONPatch.apply(store.state, { op: 'add', path: '/blocks/0/data/links/-', value: { id: 'l_t', icon: 'github', label: '', url: 'https://x' } });
  assert(store.state.blocks[0].data.links.length > 0, 'JSONPatch add to array');
  store.undo(); // 撤销 patch（applyPatch 用的是 commit，这里直接 apply 不 commit，回滚到 undo 栈最顶层）

  // 4. JSON Resume 往返
  const strict = JSONResume.toStrict(store.state);
  assert(strict.basics && strict.basics.name === 'Bowen Sha', 'toStrict basics.name');
  assert(strict.work.length >= 2, 'toStrict work 数量');
  const back = JSONResume.fromStrict(strict);
  assert(Array.isArray(back.blocks) && back.blocks.length > 0, 'fromStrict 生成块');
  assert(back.blocks.some(b => b.type === 'header' && b.data.name.includes('Bowen')), 'fromStrict 保留姓名');

  // 5. 主题切换：经典 / 现代（无双栏）
  store.setState(deepClone(SAMPLE));
  store.setTheme('modern');
  assert(store.state.theme === 'modern', 'setTheme 生效');
  assert(els['#preview-pane'].innerHTML.includes('page modern'), 'modern 应用到预览');
  store.setTheme('classic');
  assert(store.state.theme === 'classic', '切回 classic');

  // 5b. 配色：parser 支持 hex/rgb，非法拒绝，随机为真随机
  assert(parseColor('#abc') === '#aabbcc', 'parseColor #RGB 展开');
  assert(parseColor('rgb(255, 0, 0)') === '#ff0000', 'parseColor rgb 整数');
  assert(parseColor('rgb(100%, 0%, 50%)') === '#ff0080', 'parseColor rgb 百分比');
  assert(parseColor('red') === null, 'parseColor 拒绝非法名');
  assert(store.setAccent('rgb(0, 128, 0)') === true, 'setAccent 接受 rgb');
  assert(store.state.accent === '#008000', 'rgb 归一化为 hex');
  assert(els['#preview-pane'].innerHTML.includes('--accent:#008000'), '预览应用 accent');
  assert(store.setAccent('red') === false, 'setAccent 拒绝非法色');
  assert(store.state.accent === '#008000', '非法色不改变状态');
  assert(isValidHex(randomAccent()) && isValidHex(randomAccent()), '随机配色是合法 hex');
  store.setAccent('#1f3864');

  // 5c. 自定义色块：添加 / 右键删除
  saveCustomColors(['#123456']);
  assert(getCustomColors().includes('#123456'), '自定义色保存');
  removeCustomColor('#123456');
  assert(!getCustomColors().includes('#123456'), '自定义色右键删除');

  // 5d. 自定义色块：修改（编辑模式替换）
  saveCustomColors(['#123456']);
  editingSwatch = '#123456';
  $('#accent-input').value = '#abcdef';
  addCustomColor();
  assert(getCustomColors().includes('#abcdef') && !getCustomColors().includes('#123456'), '编辑模式替换色块');
  assert(editingSwatch === null, '编辑模式结束');

  // 6. bullets 行编辑器（+ 添加 / 编辑 / 删除，类似添加链接）
  const expId = store.state.blocks.find(b => b.type === 'research').id;
  store.setField(expId, 'highlights', ['a', 'b']);
  addBullet(expId, 'highlights');
  assert(store.state.blocks.find(b => b.id === expId).data.highlights.length === 3, 'addBullet 添加空行');
  updateBullet(expId, 'highlights', 2, 'c');
  assert(store.state.blocks.find(b => b.id === expId).data.highlights[2] === 'c', 'updateBullet 更新');
  removeBullet(expId, 'highlights', 0);
  assert(store.state.blocks.find(b => b.id === expId).data.highlights[0] === 'b', 'removeBullet 删除');

  // 7. 数据不被 localStorage 污染
  assert(store.state.blocks.every(b => b.id && b.type), '所有块有 id 和 type');

  // 8. 导入新 JSON 后清空旧保存句柄（防止 Ctrl+S 写回旧文件覆盖真简历）
  savedFileHandle = { fake: 'old-handle' };
  importedFileName = null;
  importJSONFile({ name: 'imported-resume.JSON' });
  assert(importedFileName === 'imported-resume.json', '导入文件名规范化为 .json');
  assert(savedFileHandle === null, '导入后清空内存保存句柄');
  assert(store.state.blocks.length === 0, '导入替换当前状态');

  // 8b. 工具栏显示 Ctrl+S 保存目标（有句柄显文件名 / 无句柄提示另存为）
  savedFileHandle = { name: 'BowenSha-import.json', fake: true };
  await refreshSaveTarget();
  assert(els['#save-target'].textContent === '保存到 BowenSha-import.json', '有句柄时显示保存文件名');
  savedFileHandle = null;
  await refreshSaveTarget();
  assert(els['#save-target'].textContent.includes('另存为'), '无句柄时提示 Ctrl+S 另存为');

  // 9. 自定义块相同 title 自动合并（避免重复大标题）
  store.setState({
    schemaVersion: 1, theme: 'classic', accent: '#1f3864', meta: { dateFormat: 'MMM YYYY' },
    blocks: [
      { id: 'c1', type: 'custom', data: { title: 'Teaching', position: 'TA A', highlights: [] }, visible: true },
      { id: 'c2', type: 'custom', data: { title: 'Teaching', position: 'TA B', highlights: [] }, visible: true },
      { id: 'c3', type: 'custom', data: { title: 'Awards', position: 'Award 1', highlights: [] }, visible: true },
      { id: 'c4', type: 'custom', data: { title: '', position: 'No title', highlights: [] }, visible: true }
    ]
  });
  renderPreview(store.state);
  const ph9 = els['#preview-pane'].innerHTML;
  const h2Count = (ph9.match(/class="section-title"/g) || []).length;
  assert(h2Count === 2, '自定义块合并后标题数=2（Teaching+Awards），实际 ' + h2Count);
  assert((ph9.match(/section-title">Teaching</g) || []).length === 1, 'Teaching 只出现一次标题');
  assert(ph9.includes('TA A') && ph9.includes('TA B'), '同标题两个块内容都在');
  assert(ph9.includes('Award 1') && ph9.includes('No title'), '其他块内容都在');

  // 10. 技能块：无熟练度字段；keywords 用行式编辑（同职责 UI）
  const skId = store.addBlock('skills');
  const skBlk = store.state.blocks.find(b => b.id === skId);
  assert(!('level' in skBlk.data) && !('showLevel' in skBlk.data), '技能块默认无 level/showLevel');
  store.setField(skId, 'keywords', ['Python', 'C++']);
  const kwField = fieldHTML(skBlk, BLOCK_TYPES.skills.fields.find(f => f.key === 'keywords'));
  assert(kwField.includes('data-bl="0"') && kwField.includes('addbullet'), '技能项用行式编辑 UI（同职责）');
  store.setField(skId, 'name', 'Lang');
  renderPreview(store.state);
  const ph10 = els['#preview-pane'].innerHTML;
  assert(ph10.includes('Lang') && ph10.includes('Python, C++'), '技能组名与技能项渲染');

  // 11. 中英文切换：小节标题 + Present/至今 本地化
  store.setState(deepClone(SAMPLE));
  store.addBlock('projects'); // 补一个 projects 块，验证「项目」标题
  store.setLanguage('zh');
  assert(store.state.meta.language === 'zh', 'setLanguage 存入 meta.language');
  renderPreview(store.state);
  const zhP = els['#preview-pane'].innerHTML;
  assert(zhP.includes('教育经历') && zhP.includes('研究经历') && zhP.includes('项目') && zhP.includes('技能'), '中文小节标题渲染');
  assert(zhP.includes('至今'), '中文 current 显示至今');
  store.setLanguage('en');
  renderPreview(store.state);
  const enP = els['#preview-pane'].innerHTML;
  assert(enP.includes('Education') && enP.includes('Research Experience') && enP.includes('Projects') && enP.includes('Skills'), '英文小节标题渲染');
  assert(!enP.includes('教育经历'), '英文模式无中文标题');
  // 中英标点：技能冒号/分隔、教育 in
  assert(zhP.includes('</span>：Python，PyTorch'), '中文技能用：和，');
  assert(zhP.includes('PhD Chemistry') && !zhP.includes('PhD in Chemistry'), '中文教育不加 in');
  assert(enP.includes('</span>: Python, PyTorch'), '英文技能用: 和, ');
  assert(enP.includes('PhD in Chemistry'), '英文教育保留 in');

  // 12. 简历照片
  const tctx = {
    esc: escapeHTML, icon, inline: inlineMarkup, markup: renderLightMarkup,
    fmtDate: v => fmtDate(v, 'MMM YYYY'), range: (s, e, c) => rangeText(s, e, c, 'MMM YYYY', 'en'),
    lang: 'en', colon: ': ', list: ', '
  };

  // 12a. 最高优先级约束：未勾选「显示照片」时，输出与加照片功能之前逐字节一致
  assert(headerRender({ data: { name: 'A', title: 'B', summary: 'S', showPhoto: false } }, tctx)
    === '<header class="cv-header"><h1>A</h1><div class="cv-title">B</div><p class="cv-summary">S</p></header>',
    '未勾选：header 输出与加照片前逐字节一致');
  assert(!headerRender({ data: { name: 'A' } }, tctx).includes('cv-photo'),
    '老数据（根本没有 showPhoto 键）也不渲染照片');

  // 12b. 勾选但没照片 → 会打印出来的虚线占位框
  const emptyHtml = headerRender({ data: { name: 'A', showPhoto: true, photo: '' } }, tctx);
  assert(emptyHtml.includes('cv-photo-empty') && emptyHtml.includes('照片'), '勾选无照片 → 占位框 + 提示文字');
  assert(emptyHtml.includes('cv-header-main'), '勾选后正文包进 cv-header-main');

  // 12c. 勾选且有照片 → img
  const imgHtml = headerRender({ data: { name: 'A', showPhoto: true, photo: 'data:image/jpeg;base64,/9j/4AAQ' } }, tctx);
  assert(imgHtml.includes('<img class="cv-photo" src="data:image/jpeg;base64,/9j/4AAQ"'), '勾选有照片 → img.cv-photo');
  assert(!imgHtml.includes('cv-photo-empty'), '有照片时不出现占位框');

  // 12d. data URL 校验：只放行 canvas 产出的三种 base64 图片
  assert(isValidPhotoDataURL('data:image/jpeg;base64,/9j/4AAQSkZJRg==') === true, 'jpeg data URL 通过');
  assert(isValidPhotoDataURL('data:image/png;base64,iVBORw0KGgo=') === true, 'png data URL 通过');
  assert(isValidPhotoDataURL('data:image/webp;base64,UklGRh4A') === true, 'webp data URL 通过');
  assert(isValidPhotoDataURL('javascript:alert(1)') === false, '拒绝 javascript:');
  assert(isValidPhotoDataURL('data:image/svg+xml;base64,PHN2Zz4=') === false, '拒绝 svg');
  assert(isValidPhotoDataURL('http://x/a.jpg') === false, '拒绝 http URL');
  assert(isValidPhotoDataURL('C:\\Users\\me\\a.jpg') === false, '拒绝文件路径');
  assert(isValidPhotoDataURL('data:image/jpeg;base64,') === false, '拒绝空载荷');
  assert(isValidPhotoDataURL('') === false, '拒绝空串');
  assert(isValidPhotoDataURL(null) === false, '拒绝 null');
  assert(isValidPhotoDataURL(undefined) === false, '拒绝 undefined');
  assert(isValidPhotoDataURL(123) === false, '拒绝非字符串');

  // 12e. 编辑器 photo 字段：空态 / 有照片两副面孔
  const photoField = BLOCK_TYPES.header.fields.find(f => f.key === 'photo');
  const emptyField = fieldHTML({ data: { photo: '' } }, photoField);
  assert(emptyField.includes('未选择照片') && emptyField.includes('pick-photo'), '无照片：空态 + 选择按钮');
  assert(!emptyField.includes('clear-photo'), '无照片：不显示清除按钮');
  const filledField = fieldHTML({ data: { photo: 'data:image/jpeg;base64,/9j/4AAQ' } }, photoField);
  assert(filledField.includes('photo-thumb') && filledField.includes('clear-photo'), '有照片：缩略图 + 清除按钮');

  // 12f. 严格 JSON Resume 往返：有照片时 image 不丢
  const withPhoto = deepClone(SAMPLE);
  const wHdr = withPhoto.blocks.find(b => b.type === 'header');
  wHdr.data.showPhoto = true;
  wHdr.data.photo = 'data:image/jpeg;base64,/9j/4AAQ';
  const strictP = JSONResume.toStrict(withPhoto);
  assert(strictP.basics.image === 'data:image/jpeg;base64,/9j/4AAQ', 'toStrict 写入 basics.image');
  const backHdr = JSONResume.fromStrict(strictP).blocks.find(b => b.type === 'header');
  assert(backHdr.data.photo === 'data:image/jpeg;base64,/9j/4AAQ' && backHdr.data.showPhoto === true,
    '严格往返后有照片：photo / showPhoto 均不丢');

  // 12g. 已知有损：仅占位（无照片）在严格格式下退化为 false —— 断言退化，别日后误判成 bug
  const placeholder = deepClone(SAMPLE);
  const pHdr = placeholder.blocks.find(b => b.type === 'header');
  pHdr.data.showPhoto = true; pHdr.data.photo = '';
  const strict2 = JSONResume.toStrict(placeholder);
  assert(strict2.basics.image === undefined, '无照片时 toStrict 不写 image');
  assert(JSONResume.fromStrict(strict2).blocks.find(b => b.type === 'header').data.showPhoto === false,
    '仅占位状态严格往返后退化为 false（§8 记录的已知行为）');

  // 12h. 严格导入的 image 也要过校验
  const badStrict = JSONResume.fromStrict({ basics: { image: 'javascript:alert(1)' } }).blocks[0].data;
  assert(badStrict.photo === '' && badStrict.showPhoto === false, '严格导入拒绝非图片 image');
  assert(JSONResume.fromStrict({ basics: { name: 'N' } }).blocks[0].data.showPhoto === false, '无 image 时 showPhoto 默认 false');

  // 12i. 迁移：老 header 补默认值，非法 photo 清掉
  const oldHdr = { type: 'header', data: { name: 'Z' } };
  migrateBlock(oldHdr);
  assert(oldHdr.data.showPhoto === false && oldHdr.data.photo === '', 'migrateBlock 补 header 照片默认值');
  const badHdr = { type: 'header', data: { name: 'Z', photo: 'javascript:alert(1)' } };
  migrateBlock(badHdr);
  assert(badHdr.data.photo === '', 'migrateBlock 清掉非法 photo');

  // 12j. 清除照片不改变 showPhoto（回到虚线框，而不是关掉整个照片功能）
  store.setState(deepClone(SAMPLE));
  const cHdr = store.state.blocks.find(b => b.type === 'header');
  store.setField(cHdr.id, 'showPhoto', true);
  store.setField(cHdr.id, 'photo', 'data:image/jpeg;base64,/9j/4AAQ');
  store.setField(cHdr.id, 'photo', '');
  assert(store.state.blocks.find(b => b.id === cHdr.id).data.showPhoto === true, '清除照片后 showPhoto 仍为 true');
  renderPreview(store.state);
  assert(els['#preview-pane'].innerHTML.includes('cv-photo-empty'), '清除照片后预览回到虚线占位框');

  // 13. 自定义信息（籍贯 / 政治面貌…）
  const zhCtx = Object.assign({}, tctx, { lang: 'zh', colon: '：', list: '，' });

  // 13a. 位置：名 → 头衔 → 自定义信息 → 联系方式
  const dH = headerRender({ data: { name: 'N', title: 'T', details: [{ label: '籍贯', value: '江苏' }], email: 'e@x.com' } }, zhCtx);
  const iT = dH.indexOf('cv-title'), iD = dH.indexOf('cv-details'), iC = dH.indexOf('cv-contact');
  assert(iT > -1 && iD > iT && iC > iD, '顺序：头衔 → 自定义信息 → 联系方式');
  assert(dH.includes('<span class="dt">籍贯：江苏</span>'), '渲染为「名称：内容」');
  assert(!dH.includes('has-photo'), '没勾照片时仍是单列 header');

  // 13b. 冒号跟随语言（复用 ctx.colon，与技能行规则一致）
  assert(headerRender({ data: { details: [{ label: 'Hometown', value: 'Jiangsu' }] } }, tctx)
    .includes('<span class="dt">Hometown: Jiangsu</span>'), '英文用 ": " 冒号');

  // 13c. 只填一半也照常渲染
  assert(headerRender({ data: { details: [{ label: '党员', value: '' }] } }, zhCtx).includes('<span class="dt">党员</span>'),
    '只有名称：不补冒号，只渲染名称');
  assert(headerRender({ data: { details: [{ label: '', value: '江苏' }] } }, zhCtx).includes('<span class="dt">江苏</span>'),
    '只有内容：只渲染内容');

  // 13d. 无内容时不产生 cv-details（保证没填过时输出与改动前一致）
  assert(!headerRender({ data: { name: 'N', title: 'T', summary: 'S' } }, tctx).includes('cv-details'), '无 details 键：不渲染');
  assert(!headerRender({ data: { details: [] } }, tctx).includes('cv-details'), '空数组：不渲染');
  assert(!headerRender({ data: { details: [{ label: '', value: '' }] } }, tctx).includes('cv-details'), '全空条目：不渲染');
  assert(!headerRender({ data: { details: [{ label: '   ', value: '  ' }] } }, tctx).includes('cv-details'), '纯空白条目：不渲染');
  assert(!headerRender({ data: { details: [null] } }, tctx).includes('cv-details'), 'null 条目：不炸且不渲染');

  // 13e. 转义：手改 JSON 塞进的标签必须被转义
  const escD = headerRender({ data: { details: [{ label: '<b>x</b>', value: '<img src=x onerror=1>' }] } }, tctx);
  assert(escD.includes('&lt;b&gt;x&lt;/b&gt;') && !escD.includes('<b>x</b>'), '名称被转义');
  assert(!escD.includes('<img'), '内容里的标签被转义');

  // 13f. 编辑器：行结构与 links 同构（两个输入框 + ✕），另有「+ 添加信息」
  const dtField = BLOCK_TYPES.header.fields.find(f => f.key === 'details');
  const dtHTML = fieldHTML({ data: { details: [{ label: '籍贯', value: '江苏' }] } }, dtField);
  assert(dtHTML.includes('data-dt="label"') && dtHTML.includes('data-dt="value"'), '每行是 名称 + 内容 两个输入框');
  assert(dtHTML.includes('data-act="rmdetail"') && dtHTML.includes('data-act="adddetail"'), '有删除 ✕ 与「+ 添加信息」');
  assert(dtHTML.includes('value="籍贯"') && dtHTML.includes('value="江苏"'), '已填内容回填到输入框');
  assert(dtHTML.includes('class="detail-row"') && dtHTML.includes('class="details"'), 'DOM 结构同 links');

  // 13g. store：增 / 改 / 删
  store.setState(deepClone(SAMPLE));
  const dHdr = store.state.blocks.find(b => b.type === 'header');
  addDetailRow(dHdr.id);
  assert(store.state.blocks.find(b => b.id === dHdr.id).data.details.length === 1, 'addDetailRow 追加一行');
  updateDetail(dHdr.id, 0, 'label', '政治面貌');
  updateDetail(dHdr.id, 0, 'value', '党员');
  assert(store.state.blocks.find(b => b.id === dHdr.id).data.details[0].label === '政治面貌', 'updateDetail 改名称');
  store.setLanguage('zh');
  renderPreview(store.state);
  assert(els['#preview-pane'].innerHTML.includes('政治面貌：党员'), '改完预览即时反映（中文冒号）');
  removeDetailRow(dHdr.id, 0);
  assert(store.state.blocks.find(b => b.id === dHdr.id).data.details.length === 0, 'removeDetailRow 删除一行');

  // 13h. 新增 header 块默认带空 details 数组
  assert(Array.isArray(BLOCK_TYPES.header.defaults().details), 'header defaults 含 details 数组');

  // 14. markdown 加粗：所有自由文本字段都支持 **加粗**
  assert(headerRender({ data: { details: [{ label: '**籍贯**', value: '江苏' }] } }, tctx)
    .includes('<span class="dt"><strong>籍贯</strong>: 江苏</span>'), '自定义信息-名称支持加粗');
  assert(headerRender({ data: { details: [{ label: '籍贯', value: '**江苏**' }] } }, tctx)
    .includes('<span class="dt">籍贯: <strong>江苏</strong></span>'), '自定义信息-内容支持加粗');
  assert(headerRender({ data: { name: '**张三**' } }, tctx).includes('<h1><strong>张三</strong></h1>'), '姓名支持加粗');
  assert(headerRender({ data: { title: '**工程师**' } }, tctx).includes('<strong>工程师</strong>'), '头衔支持加粗');
  assert(headerRender({ data: { name: 'N', location: '**上海**' } }, tctx).includes('<strong>上海</strong>'), '所在地支持加粗');

  const skHtml = skillsRender({ data: { name: '**Lang**', keywords: ['**Python**'] } }, tctx);
  assert(skHtml.includes('<strong>Lang</strong>') && skHtml.includes('<strong>Python</strong>'), '技能组名与技能项支持加粗');

  const edHtml = educationRender({ data: { institution: '**MIT**', degree: 'PhD', area: '**Chem**' } }, tctx);
  assert(edHtml.includes('<strong>MIT</strong>') && edHtml.includes('<strong>Chem</strong>'), '学校与专业支持加粗');

  const exHtml = experienceRender({ data: { position: '**RA**', organization: '**Lab**' } }, tctx);
  assert(exHtml.includes('<strong>RA</strong>') && exHtml.includes('<strong>Lab</strong>'), '职位与机构支持加粗');

  // 14b. URL 属性值不套 markdown（往 href 里塞 <strong> 没有意义）
  const urlHtml = headerRender({ data: { name: 'N', links: [{ icon: 'github', label: 'GH', url: 'https://example.com/**a**' }] } }, tctx);
  assert(urlHtml.includes('href="https://example.com/**a**"'), 'href 保持字面量');
  assert(!urlHtml.includes('href="https://example.com/<strong>'), 'href 里不会出现 <strong>');

  // 14c. 加粗没有放松转义：** 之外的标签仍被转义，只有 strong 是「真的」
  const safeHtml = headerRender({ data: { name: '**<img src=x>**' } }, tctx);
  assert(safeHtml.includes('<strong>&lt;img src=x&gt;</strong>'), '** 内的标签被转义，只有 strong 生效');
  assert(!safeHtml.includes('<img'), '不产生真实的 img 标签');
  assert(!headerRender({ data: { name: '<b>x</b>' } }, tctx).includes('<b>x</b>'), '不加 ** 时标签照旧被转义');

  // 15. 排版设置（state.settings → .page 上的 CSS 变量 + 打印 @page）
  store.setState(deepClone(SAMPLE));
  renderPreview(store.state);
  const p15a = els['#preview-pane'].innerHTML;
  assert(p15a.includes('style="--accent:#1f3864">'), '无 settings：.page 只有 --accent，不输出排版变量');
  assert(els['#cv-page-style'].textContent === '', '无 settings：不覆盖默认 @page');

  assert(store.setSetting('fontSize', 12) === true, 'setSetting 接受合法值');
  assert(store.setSetting('lineHeight', '1.3') === true, 'setSetting 接受数字字符串（来自 input.value）');
  store.setSetting('nameScale', 1.6);
  const p15b = els['#preview-pane'].innerHTML;
  assert(p15b.includes('--fs-base:12pt') && p15b.includes('--lh:1.3') && p15b.includes('--s-name:1.6'), '已设置项输出为 CSS 变量');
  assert(!p15b.includes('--s-body') && !p15b.includes('--m-page'), '未设置项不输出');

  assert(store.setSetting('fontSize', 99) === true && store.state.settings.fontSize === 14, '超上限钳到 max');
  assert(store.setSetting('lineHeight', -5) === true && store.state.settings.lineHeight === 1, '低于下限钳到 min');
  assert(store.setSetting('fontSize', 'abc') === false && store.state.settings.fontSize === 14, '非数字拒绝且不改状态');
  assert(store.setSetting('fontSize', '') === false, '空串拒绝（清空数字框时不应变成 0）');
  assert(store.setSetting('nope', 1) === false, '未知键拒绝');

  // 拖动同一滑块合并为一步撤销
  store.setSetting('bodyScale', 0.9); store.setSetting('bodyScale', 0.85); store.setSetting('bodyScale', 0.8);
  store.undo();
  assert(!('bodyScale' in store.state.settings), '同一项连续修改一次撤销');

  // 页边距：设置任意一边 → 四边都输出（未设的用默认），预览 padding 与打印 @page 一致
  store.setSetting('marginTop', 10);
  assert(els['#preview-pane'].innerHTML.includes('--m-page:10mm 15mm 18mm 15mm'), '预览页边距四边齐全');
  assert(els['#cv-page-style'].textContent === '@page { margin: 10mm 15mm 18mm 15mm; }', '打印 @page 同步');

  // 手改 JSON / JSON Patch 塞进的非法值不会进入 style 属性
  store.state.settings.fontSize = '12pt;background:url(x)';
  store.state.settings.marginLeft = 'x';
  renderPreview(store.state);
  const p15c = els['#preview-pane'].innerHTML;
  assert(!p15c.includes('background') && !p15c.includes('--fs-base'), '非法 fontSize 被丢弃');
  assert(p15c.includes('--m-page:10mm 15mm 18mm 15mm'), '非法 marginLeft 回落默认值');

  store.resetSettings();
  assert(!('settings' in store.state), 'resetSettings 删除 settings');
  assert(els['#preview-pane'].innerHTML.includes('style="--accent:#1f3864">') && els['#cv-page-style'].textContent === '', '恢复默认后输出与未设置时一致');
  store.undo();
  assert(store.state.settings && store.state.settings.marginTop === 10, '恢复默认可撤销');

  // 默认倍率 × 基准字号 = 改动前的写死字号
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert(near(10.5 * settingValue(null, 'nameScale'), 19) && near(10.5 * settingValue(null, 'contactScale'), 9.5) && near(10.5 * settingValue(null, 'bodyScale'), 10), '默认倍率还原原字号');

  // 16. 中西文字体分开选（settings.latinFont / cjkFont）
  store.setState(deepClone(SAMPLE));
  renderPreview(store.state);
  assert(!els['#preview-pane'].innerHTML.includes('--body-font'), '未选字体：不输出字体变量（由 .page.classic 决定）');

  assert(store.setSetting('cjkFont', 'kai') === true, '选中文字体');
  const p16a = els['#preview-pane'].innerHTML;
  assert(p16a.includes("--body-font:Georgia, 'Times New Roman', 'Kaiti SC'"), '只选中文：西文取主题默认 Georgia，中文用楷体');
  assert(p16a.includes('--head-font:Georgia'), '标题字体同步');
  assert(/, serif">/.test(p16a), '通用族跟随西文字体（衬线）');

  store.setSetting('latinFont', 'arial');
  const p16b = els['#preview-pane'].innerHTML;
  assert(p16b.includes("--body-font:Arial, Helvetica, 'Liberation Sans', 'Kaiti SC'") && /, sans-serif">/.test(p16b), '西文 Arial + 中文楷体，通用族 sans-serif');
  assert(!/style="[^"]*"[^>]*'Kaiti/.test(p16b) && (p16b.match(/"/g) || []).length % 2 === 0, '字体栈不破坏 style 属性引号');

  store.setTheme('modern');
  store.setSetting('latinFont', '');
  assert(!('latinFont' in store.state.settings), "'' = 跟随主题，删除该键");
  assert(els['#preview-pane'].innerHTML.includes("--body-font:Arial, Helvetica, 'Liberation Sans', 'Kaiti SC'"), 'modern 主题下西文跟随主题 = Arial');

  assert(store.setSetting('cjkFont', 'comic') === false && store.state.settings.cjkFont === 'kai', '未知字体键拒绝且不改状态');
  store.state.settings.latinFont = "x';background:url(y)";
  renderPreview(store.state);
  assert(!els['#preview-pane'].innerHTML.includes('background'), '手改 JSON 的非法字体键被忽略');

  store.undo();
  assert(store.state.settings.latinFont === 'arial', '字体修改可撤销');
  store.resetSettings();
  assert(!els['#preview-pane'].innerHTML.includes('--body-font'), '恢复默认后回到主题字体');
  store.setTheme('classic');

  // 17. 样式开关：项目符号 / 联系方式图标 / 主题色分隔线 / 技能双栏
  store.setState(deepClone(SAMPLE));
  renderPreview(store.state);
  const p17a = els['#preview-pane'].innerHTML;
  assert(p17a.includes('<div class="page classic" style="--accent:#1f3864">'), '全默认：无额外 class、无额外变量');

  assert(store.setSetting('bulletStyle', 'dash') === true, '选项目符号');
  assert(els['#preview-pane'].innerHTML.includes("--bullet:'–  '") && !els['#preview-pane'].innerHTML.includes('--bullet-indent'), '短横：输出 --bullet，保留缩进');
  store.setSetting('bulletStyle', 'none');
  assert(els['#preview-pane'].innerHTML.includes('--bullet:none;--bullet-indent:0'), '无符号：取消缩进');
  assert(store.setSetting('bulletStyle', 'star') === false && store.state.settings.bulletStyle === 'none', '未知符号拒绝');
  store.setSetting('bulletStyle', '');
  assert(!('bulletStyle' in store.state.settings), "'' = 默认实心圆，删除该键");

  assert(store.setSetting('showContactIcons', false) === true, '关联系方式图标');
  assert(store.state.settings.showContactIcons === false && els['#preview-pane'].innerHTML.includes('class="page classic no-contact-icons"'), '关图标 → no-contact-icons');
  store.setSetting('showContactIcons', true);
  assert(!('showContactIcons' in store.state.settings), '改回默认值时删除该键');
  assert(store.setSetting('showContactIcons', 'false') === false, '勾选框只收布尔（字符串 "false" 拒绝）');

  store.setSetting('accentDivider', true);
  store.setSetting('skillsTwoColumns', true);
  assert(els['#preview-pane'].innerHTML.includes('class="page classic accent-divider skills-2col"'), '分隔线主题色 + 技能双栏 class');

  store.state.settings.accentDivider = 'yes';   // 手改 JSON 的非布尔值
  renderPreview(store.state);
  assert(!els['#preview-pane'].innerHTML.includes('accent-divider'), '非布尔值按默认处理');

  store.resetSettings();
  assert(els['#preview-pane'].innerHTML.includes('<div class="page classic" style="--accent:#1f3864">'), '恢复默认后清掉所有开关');

  // 18. 页面：纸张 / 页码 / 分页预览 / 头部对齐 / 照片偏移
  store.setState(deepClone(SAMPLE));
  assert(pageCSS(undefined) === '' && pageCSS({}) === '', '全默认：不覆盖 style.css 的 @page');

  store.setSetting('pageSize', 'letter');
  assert(els['#cv-page-style'].textContent === '@page { size: letter; }', 'Letter → @page size');
  assert(els['#preview-pane'].innerHTML.includes('--page-w:215.9mm;--page-h:279.4mm'), 'Letter → 预览纸张尺寸');
  assert(store.setSetting('pageSize', 'a3') === false, '未知纸张拒绝');
  store.setSetting('pageSize', '');

  store.setSetting('showPageNumbers', false);
  assert(els['#cv-page-style'].textContent === '@page { @bottom-center { content: none; } }', '关页码');
  store.setSetting('pageNumberFormat', 'zh');
  assert(els['#cv-page-style'].textContent === '@page { @bottom-center { content: none; } }', '关页码时格式不生效');
  store.setSetting('showPageNumbers', true);
  assert(els['#cv-page-style'].textContent === '@page { @bottom-center { content: "第 " counter(page) " 页"; color: #666; font-size: 9pt; } }', '页码格式：第 n 页（居中）');
  store.setSetting('pageNumberPosition', 'right');
  assert(els['#cv-page-style'].textContent === '@page { @bottom-center { content: none; } @bottom-right { content: "第 " counter(page) " 页"; color: #666; font-size: 9pt; } }', '页码右下：清掉居中的默认页码');
  store.setSetting('pageNumberFormat', '');
  assert(els['#cv-page-style'].textContent.includes('@bottom-right { content: counter(page) " / " counter(pages);'), '只改位置：格式沿用默认 1 / n');
  store.setSetting('marginTop', 10);
  assert(els['#cv-page-style'].textContent.startsWith('@page { margin: 10mm 15mm 18mm 15mm; @bottom-center'), '页边距与页码合并在一条 @page');
  store.resetSettings();

  // 分页预览：Node 桩里没有布局，paginatePreview 必须安全跳过；预览 padding 跟打印页边距对齐
  assert(paginatePreview(null, {}) === 0 && paginatePreview({}, {}) === 0, '没有真实 DOM 时 paginatePreview 不抛错');
  store.setSetting('pagedPreview', true);
  const p18 = els['#preview-pane'].innerHTML;
  assert(p18.includes('class="page classic paged"') && p18.includes('--m-page:16mm 15mm 18mm 15mm'), '分页预览：加 paged class，预览边距 = 打印边距');
  store.setSetting('repeatSectionTitles', true);
  assert(!els['#preview-pane'].innerHTML.includes('repeat'), '重复标题不加 class（只在分页时生效）');
  store.resetSettings();
  assert(!els['#preview-pane'].innerHTML.includes('--m-page'), '关分页预览且没设边距：不输出 --m-page');

  store.setSetting('headerAlign', 'center');
  store.setSetting('photoOffsetY', -3.5);
  const p18b = els['#preview-pane'].innerHTML;
  assert(p18b.includes('class="page classic header-center"') && p18b.includes('--photo-dy:-3.5mm'), '头部居中 + 照片偏移');
  store.setSetting('photoOffsetX', -99);
  assert(store.state.settings.photoOffsetX === -20, '照片偏移钳到 -20mm');
  store.resetSettings();

  // 面板：每个键都能生成一行，PANEL_LAYOUT 不漏项、不重复
  const panelKeys = PANEL_LAYOUT.flatMap(g => g.keys);
  const allKeys = LAYOUT_SETTINGS.map(d => d.key).concat(Object.keys(CHOICE_SETTINGS), TOGGLE_SETTINGS.map(t => t.key));
  assert(panelKeys.length === new Set(panelKeys).size, '面板键不重复');
  assert(allKeys.every(k => panelKeys.includes(k)) && panelKeys.every(k => allKeys.includes(k)), '面板覆盖全部设置项');
  assert(panelKeys.every(k => layoutRowHTML(k).includes('data-setting="' + k + '"')), '每个设置项都生成控件');

  // 19. 编辑器：Ctrl+B 加粗 / 拖动排序 / 显示隐藏 / 预览定位标记
  const tb = (v, a, b) => JSON.stringify(toggleBoldMarkup(v, a, b));
  assert(tb('abc def', 4, 7) === JSON.stringify({ value: 'abc **def**', start: 6, end: 9 }), '选中文字 → 加 **，选区仍框住原文字');
  assert(tb('abc **def**', 6, 9) === JSON.stringify({ value: 'abc def', start: 4, end: 7 }), '选区两侧是 ** → 去掉');
  assert(tb('abc **def**', 4, 11) === JSON.stringify({ value: 'abc def', start: 4, end: 7 }), '选区连 ** 一起选中 → 去掉');
  assert(tb('ab', 1, 1) === JSON.stringify({ value: 'a****b', start: 3, end: 3 }), '无选区 → 插入 **** 光标居中');
  assert(tb('**', 0, 2) === JSON.stringify({ value: '******', start: 2, end: 4 }), '只选中两个星号不算已加粗，照常包一层');
  assert(tb('x', 0, 1) === JSON.stringify({ value: '**x**', start: 2, end: 3 }), '选区在开头（前面不足两个字符）也正常');

  store.setState(deepClone(SAMPLE));
  const ids0 = store.state.blocks.map(b => b.id);
  store.moveBlockTo(ids0[0], 3);
  assert(store.state.blocks.map(b => b.id).join() === [ids0[1], ids0[2], ids0[0], ...ids0.slice(3)].join(), 'moveBlockTo 下移：插到原第 3 个之前');
  store.moveBlockTo(ids0[0], 0);
  assert(store.state.blocks.map(b => b.id).join() === ids0.join(), 'moveBlockTo 移回顶部');
  store.moveBlockTo(ids0[1], store.state.blocks.length);
  assert(store.state.blocks[store.state.blocks.length - 1].id === ids0[1], 'moveBlockTo 移到末尾');
  store.undo();
  assert(store.state.blocks.map(b => b.id).join() === ids0.join(), '拖动排序可撤销');

  const rid = store.state.blocks.find(b => b.type === 'research').id;
  store.setField(rid, 'highlights', ['a', 'b', 'c']);
  moveBullet(rid, 'highlights', 0, 3);
  assert(store.state.blocks.find(b => b.id === rid).data.highlights.join() === 'b,c,a', '要点拖到末尾');
  moveBullet(rid, 'highlights', 2, 0);
  assert(store.state.blocks.find(b => b.id === rid).data.highlights.join() === 'a,b,c', '要点拖到开头');

  store.toggleVisible(rid);
  assert(store.state.blocks.find(b => b.id === rid).visible === false, '隐藏块');
  assert(!els['#preview-pane'].innerHTML.includes('data-bid="' + rid + '"'), '隐藏的块不出现在预览');
  assert(blockCardHTML(store.state.blocks.find(b => b.id === rid)).includes('is-hidden'), '编辑器里标出已隐藏');
  store.toggleVisible(rid);
  assert(store.state.blocks.find(b => b.id === rid).visible === true, '重新显示');

  renderPreview(store.state);
  const p19 = els['#preview-pane'].innerHTML;
  assert(store.state.blocks.every(b => p19.includes('data-bid="' + b.id + '"')), '每个块的预览元素都带 data-bid');
  assert(p19.includes('<header data-bid="' + store.state.blocks[0].id + '" class="cv-header">'), 'data-bid 加在块最外层元素上');
  const evilId = { id: 'x" onclick="alert(1)', type: 'skills', data: { name: 'S', keywords: [] }, visible: true };
  assert(!renderSequence([evilId], tctx).includes('onclick="alert'), '块 id 被转义，不能注入属性');

  // 20. 栏目：项目经历 / 自定义版式 / 栏目模板 / 类型转换 / 小节标题改名
  store.setState(deepClone(SAMPLE));
  store.addBlock('projects');
  store.setLanguage('zh');
  assert(els['#preview-pane'].innerHTML.includes('section-title">项目经历<'), '中文小节标题：项目经历');
  assert(BLOCK_TYPES.projects.label === '项目经历', '添加菜单标签：项目经历');

  // 自定义块三种版式
  const cl = r => customRender({ data: r }, zhCtx);
  assert(cl({ title: 'T', position: 'P' }).includes('<h3>P</h3>'), '缺 layout 的旧 custom 按经历型渲染');
  assert(cl({ layout: 'list', items: ['**CET-6**', '', 'IELTS 7.5'] }) === '<section class="custom-block"><ul><li><strong>CET-6</strong></li><li>IELTS 7.5</li></ul></section>', '列表型：每行一条、空行跳过、支持加粗');
  assert(cl({ layout: 'text', content: '第一段' + String.fromCharCode(10, 10) + '第二段 <b>' }) === '<section class="custom-block"><p class="custom-text">第一段</p><p class="custom-text">第二段 &lt;b&gt;</p></section>', '段落型：换行分段、转义');
  assert(BLOCK_TYPES.custom.fieldsFor({ data: { layout: 'list' } }).map(f => f.key).join() === 'title,layout,items', '列表型编辑器字段');
  assert(BLOCK_TYPES.custom.fieldsFor({ data: { layout: 'text' } }).map(f => f.key).join() === 'title,layout,content', '段落型编辑器字段');
  assert(BLOCK_TYPES.custom.fieldsFor({ data: {} }).length === BLOCK_TYPES.custom.fields.length, '经历型显示全部字段');

  // 栏目模板（存浏览器，缺省为预设）
  localStorage.removeItem('easy_cv.sectionTemplates');
  assert(getSectionTemplates().length === SECTION_TEMPLATE_PRESETS.length, '没存过 → 预设');
  saveSectionTemplates([{ title: '  科研项目 ', en: 'Research Projects', layout: 'entry' }, { title: '', layout: 'list' }, { title: '爱好', layout: 'bogus' }]);
  assert(JSON.stringify(getSectionTemplates()) === JSON.stringify([{ title: '科研项目', en: 'Research Projects', layout: 'entry' }, { title: '爱好', en: '', layout: 'entry' }]), '保存时去空标题、修正非法版式');
  localStorage.setItem('easy_cv.sectionTemplates', '{bad json');
  assert(getSectionTemplates().length === SECTION_TEMPLATE_PRESETS.length, '存坏了 → 回退预设');
  saveSectionTemplates([{ title: '科研项目', en: 'Research Projects', layout: 'list' }]);
  const tplId = addBlockFromTemplate(0, null);
  const tplBlk = store.state.blocks.find(b => b.id === tplId);
  assert(tplBlk.type === 'custom' && tplBlk.data.title === '科研项目' && tplBlk.data.layout === 'list', '中文模式用中文标题建块');
  store.setLanguage('en');
  const tplId2 = addBlockFromTemplate(0, null);
  assert(store.state.blocks.find(b => b.id === tplId2).data.title === 'Research Projects', '英文模式用英文标题');
  localStorage.removeItem('easy_cv.sectionTemplates');

  // 类型转换：保留原数据，转回去可恢复
  store.setState(deepClone(SAMPLE));
  const wk = store.state.blocks.find(b => b.type === 'research');
  const orig = deepClone(wk.data);
  assert(store.convertBlock(wk.id, 'education') === true, '研究经历 → 教育经历');
  let cv = store.state.blocks.find(b => b.id === wk.id);
  assert(cv.type === 'education' && cv.data.degree === orig.position && cv.data.institution === orig.organization, '主标题→学位、机构→学校');
  assert(JSON.stringify(cv.data.highlights) === JSON.stringify(orig.highlights) && cv.data.startDate === orig.startDate, '要点、日期保留');
  store.convertBlock(wk.id, 'research');
  cv = store.state.blocks.find(b => b.id === wk.id);
  assert(['position', 'organization', 'summary', 'highlights', 'startDate', 'current'].every(k => JSON.stringify(cv.data[k]) === JSON.stringify(orig[k])), '转回原类型：内容原样恢复');

  store.convertBlock(wk.id, 'custom', 'text');
  cv = store.state.blocks.find(b => b.id === wk.id);
  assert(cv.data.layout === 'text' && cv.data.title === 'Research Experience', '转成自定义：小节标题取原类型标题');
  assert(cv.data.content.startsWith(orig.position + String.fromCharCode(10) + orig.organization) && cv.data.content.includes(orig.highlights[0]), '转段落型：标题、机构、要点并进正文，不丢内容');
  store.convertBlock(wk.id, 'custom', 'list');
  cv = store.state.blocks.find(b => b.id === wk.id);
  assert(cv.data.layout === 'list' && cv.data.items.length > 0, '段落型 → 列表型');
  store.undo();
  assert(customLayout(store.state.blocks.find(b => b.id === wk.id).data) === 'text', '撤销一步回到段落型');
  store.undo(); store.undo(); store.undo();
  assert((x => x.type === 'research' && JSON.stringify(x.data) === JSON.stringify(orig))(store.state.blocks.find(b => b.id === wk.id)), '四次转换全部撤销后与原块完全一致');
  assert(store.convertBlock(store.state.blocks[0].id, 'work') === false && store.state.blocks[0].type === 'header', '个人信息不能转换');
  assert(store.convertBlock(wk.id, 'nope') === false, '未知目标类型拒绝');

  // 小节标题改名
  store.setSectionTitle('education', '  教育背景 ');
  assert(store.state.meta.sectionTitles.education === '教育背景', '改名去首尾空格');
  assert(els['#preview-pane'].innerHTML.includes('section-title">教育背景<') && !els['#preview-pane'].innerHTML.includes('>Education<'), '预览使用改后的标题（不受语言影响）');
  store.setSectionTitle('education', '');
  assert(!('sectionTitles' in store.state.meta), '清空即恢复默认，空对象不留在 JSON 里');
  assert(sectionTitleFor('skills', { sectionTitles: { skills: 7 } }, 'zh') === '技能', '非字符串改名值被忽略');

  console.log('ALL SMOKE TESTS PASSED ✅  (' + store.state.blocks.length + ' blocks)');
})().catch(e => { console.error('FAIL ❌'); console.error(e.stack || e); process.exit(1); });
`;

eval(code + tests);
