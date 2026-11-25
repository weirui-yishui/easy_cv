# Easy CV 数据格式说明（供 AI / agent 阅读）

> 读完这份文档即可**读取、生成、用 JSON Patch 修改** Easy CV 的数据。
> 它与 `js/blocks.js` 中的 `BLOCK_TYPES` 保持一致；如果代码改了字段，请同步更新本文档。

---

## 1. 总览

应用的**全部数据是一个 JSON 对象**（下文叫「应用 JSON」）。它是：

- 本地草稿 `localStorage['easy_cv.draft']` 的内容；
- 菜单「导出 → 应用 JSON」生成的文件内容；
- Ctrl+S 保存的文件内容。

另有「严格 JSON Resume」格式用于生态兼容（导入/导出时自动转换），见 §6。

顶层结构：

```json
{
  "schemaVersion": 1,
  "theme": "classic",
  "meta": { "dateFormat": "MMM YYYY" },
  "blocks": [ /* 有序块数组，顺序 = CV 里的显示顺序 */ ]
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `schemaVersion` | number | 固定 `1` |
| `theme` | string | `"classic"`（衬线）/ `"modern"`（无衬线）——只决定默认字体；`settings.latinFont` / `cjkFont` 设置后覆盖它 |
| `accent` | string | 主题色，存为 `#RRGGBB`；解析器也接受 `#RGB`、`rgb(r,g,b)`（整数或百分比），统一归一化为 hex；独立于字体 |
| `meta.dateFormat` | string | `"MMM YYYY"`（显示 `Jun 2022`）或 `"YYYY-MM"`（显示 `2022-06`） |
| `meta.language` | string | 可选，`"en"`（默认）或 `"zh"`。决定自动小节标题：`en`→Education / Work Experience / Research Experience / Projects / Skills；`zh`→教育经历 / 工作经历 / 研究经历 / 项目 / 技能；`current=true` 的结束时间也显示「至今」（`en` 为 Present）。`custom` 块标题始终用 `title` 字段原文，不受此影响 |
| `settings` | object | 可选，排版设置，见 §1.1。缺省或为 `{}` 时用默认排版 |
| `blocks` | array | 块数组，见下 |

### 1.1 `settings` —— 排版设置（工具栏「排版 ▾」）

所有字段可选，只写想改的项，没写的用默认值。

**字体**（字符串，取值必须是下表的键，否则忽略；不写 = 跟随 `theme`）

| 字段 | 可选值 | 跟随主题时 |
|---|---|---|
| `latinFont` | `georgia` / `times` / `garamond` / `palatino` / `arial` / `calibri` / `system` | `classic`→`georgia`，`modern`→`arial` |
| `cjkFont` | `song`（宋体）/ `hei`（黑体）/ `kai`（楷体）/ `fangsong`（仿宋） | `classic`→`song`，`modern`→`hei` |

- 西文字体排在前面、中文字体排在后面：英文和数字用西文字体，汉字自动落到中文字体。
- 只写其中一个时，另一个取当前 `theme` 的默认值。
- 都是系统字体，每个选项列了 Windows / macOS / Linux 上的同类字体；电脑上一个都没装时浏览器会换成别的字体（例如 Garamond、Calibri 在 macOS 上通常没有）。打印出的 PDF 使用打印时那台电脑实际用到的字体。

**样式**

| 字段 | 类型 | 可选值 / 默认 | 作用 |
|---|---|---|---|
| `bulletStyle` | string | `circle` / `square` / `dash` / `arrow` / `check` / `none`；不写 = 实心圆 • | 所有要点列表的项目符号；`none` 同时取消缩进 |
| `showContactIcons` | boolean | 默认 `true` | `false` 时联系方式与链接前不显示图标（链接仍显示文字） |
| `accentDivider` | boolean | 默认 `false` | `true` 时小节标题下的分隔线用主题色（默认浅灰） |
| `skillsTwoColumns` | boolean | 默认 `false` | `true` 时技能行两两并排（每个 `skills` 块是一行）；内容长的行会在半栏内折行 |

- 非法取值（未知选项、非布尔）按默认处理。编辑器里改回默认值时会删掉该键，导出的 JSON 只保留改过的项。

**页面**

| 字段 | 类型 | 可选值 / 默认 | 作用 |
|---|---|---|---|
| `pageSize` | string | `letter`；不写 = A4 | 纸张尺寸（预览与打印） |
| `pagedPreview` | boolean | 默认 `false` | 分页预览：预览按纸张分成多页显示，打印时在同样的位置强制换页 |
| `repeatSectionTitles` | boolean | 默认 `false` | 一个小节跨页时，在下一页开头重复它的标题。**只在 `pagedPreview: true` 时生效** |
| `showPageNumbers` | boolean | 默认 `true` | 打印页码 |
| `pageNumberPosition` | string | `left` / `right`；不写 = 居中 | 页码位置（页面底部） |
| `pageNumberFormat` | string | `plain`（1）/ `zh`（第 1 页）/ `zhTotal`（第 1 页 / 共 3 页）/ `en`（Page 1 of 3）；不写 = `1 / 3` | 页码格式 |

- 分页预览按「纸高 − 上下页边距」逐个放置 header、小节标题、条目、技能行，会超出当前页的整块挪到下一页（打印时这些块本来就不拆开）；小节标题总是和它后面的第一块在同一页。开启后预览的页面内边距等于打印页边距。
- 单个条目比一页还高时无法整块挪动，打印会在条目内部断开，预览不显示这种断点。
- 页码印在下边距里，依赖浏览器对 `@page` 页边框的支持（Chrome / Edge 可以，Firefox 不打印页码）。

**头部**

| 字段 | 类型 | 可选值 / 默认 | 作用 |
|---|---|---|---|
| `headerAlign` | string | `center`；不写 = 左对齐 | 姓名、头衔、联系方式等居中。有照片时在照片左侧的区域内居中 |
| `photoOffsetX` / `photoOffsetY` | number（mm） | −20–20，默认 0 | 照片相对原位置左右 / 上下移动，不影响其他内容的位置 |

**尺寸**（数字；超出范围的值钳到边界，非数字的值忽略）

| 字段 | 单位 | 范围 | 默认 | 作用 |
|---|---|---|---|---|
| `fontSize` | pt | 8–14 | 10.5 | 基准字号，下面的分块字号都乘以它 |
| `lineHeight` | 倍 | 1–2 | 1.5 | 行距 |
| `sectionSpacing` | px | 0–40 | 15 | 小节标题上方的间距 |
| `nameScale` | × 基准 | 1–2.5 | 1.81（=19/10.5） | 姓名 |
| `sectionTitleScale` | × 基准 | 0.8–1.6 | 1 | 小节标题 |
| `contactScale` | × 基准 | 0.7–1.2 | 0.905（=9.5/10.5） | 联系方式、链接、自定义信息 |
| `entryTitleScale` | × 基准 | 0.8–1.4 | 1 | 条目标题（学校 / 职位 / 项目名） |
| `bodyScale` | × 基准 | 0.7–1.2 | 0.952（=10/10.5） | 正文：简介、描述、要点、技能行 |
| `marginTop` / `marginRight` / `marginBottom` / `marginLeft` | mm | 0–30 | 16 / 15 / 18 / 15 | 页边距。预览和打印 PDF 使用同一组值 |

- 头衔、机构、日期、成绩、标签这些辅助文字没有单独的倍率，跟随 `fontSize` 等比缩放。
- 页码印在下边距里；`marginBottom` 设得很小时页码可能贴边或被裁掉。
- 只要写了任意一个 `margin*`，四边都生效（没写的边取默认值）。完全不写 `margin*` 时，预览页面内边距为 14mm 15mm、打印为 16/15/18/15mm（加入本设置前的行为）。
- 严格 JSON Resume 格式没有排版字段，导出严格格式时 `settings` 不保留。
- 用 JSON Patch 修改：`settings` 不存在时，先 `{"op":"add","path":"/settings","value":{}}`，再改 `/settings/<字段>`（直接改子路径会报 path not found）。

```json
"settings": { "latinFont": "times", "cjkFont": "kai", "bulletStyle": "dash", "skillsTwoColumns": true, "fontSize": 11, "lineHeight": 1.3, "bodyScale": 1, "marginTop": 10, "marginBottom": 12 }
```

## 2. 块（Block）基础结构

```json
{
  "id": "b_ab12cd",
  "type": "work",
  "data": { },
  "visible": true,
  "collapsed": false
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 全局唯一，**不可变**。AI 新增块时需自己生成，如 `"b_" + 6 位随机` |
| `type` | string | 枚举，见 §3 |
| `data` | object | 该类型的字段集合，见 §3 |
| `visible` | boolean | 可选，默认 `true`；为 `false` 时该块不出现在预览/打印，但数据保留 |
| `collapsed` | boolean | 可选，仅编辑器折叠用，渲染可忽略，可不写 |

## 3. 块类型与 `data` 字段

字段类型说明：`text`=字符串；`month`=`"YYYY-MM"` 字符串（可空）；`textarea`=字符串（可含换行）；`bullets`=字符串数组（一项一条）；`tags`=字符串数组（chip，回车添加）；`list`=字符串数组（编辑器里每行一条可编辑）；`checkbox`=布尔；`links`=对象数组（见 header）；`details`=对象数组（见 header）；`photo`=图片 data URL 字符串（见 header）；`select`=固定枚举。

### 3.1 `header` —— 个人信息（渲染在顶部，无小节标题）

| 字段 | 类型 | 说明 | 示例 |
|---|---|---|---|
| `name` | text | 姓名 | `"林晓 (Xiao Lin)"` |
| `title` | text | 职位/头衔 | `"ML Engineer"` |
| `details` | details | 自定义键值信息（籍贯 / 政治面貌…），自由 DIY | 见下 |
| `email` | text | 邮箱 | `"x@example.com"` |
| `phone` | text | 电话 | `"+86 139 0000 0000"` |
| `location` | text | 所在地 | `"Shanghai, China"` |
| `summary` | textarea | 个人简介 | — |
| `showPhoto` | checkbox | 是否显示照片（默认 `false`） | `true` |
| `photo` | photo | 照片，JPEG data URL | `"data:image/jpeg;base64,/9j/4AAQ..."` |
| `links` | links | 链接数组 | 见下 |

**照片（`showPhoto` + `photo`）两个字段配合使用，对应三种状态：**

| `showPhoto` | `photo` | 渲染结果 |
|---|---|---|
| `false`（默认） | 任意 | 不渲染照片，版面与没有此功能时**完全一致** |
| `true` | `""` | 右上角渲染**虚线占位框**（内含灰字「照片」），**会被打印出来** |
| `true` | 合法 data URL | 右上角渲染照片 |

- 占位框是刻意的「你还没放照片」提醒，不做打印隐藏 —— 屏幕上看得见但纸上消失的话，提醒就失效了
- `photo` 只接受 `data:image/(png|jpeg|webp);base64,` 开头的字符串，其余（`http://`、本地路径、`javascript:` 等）一律按空处理
- 渲染尺寸固定 30mm × 40mm（3:4），用 `object-fit: cover` 居中裁切，所以**非 3:4 的照片不会失真，但边缘会被裁掉**。竖版 3:4 效果最佳
- 照片是自包含的 base64，**不要写文件路径**：本应用以 `file://` 双击运行为目标，路径在跨浏览器 / 跨机器时不可用
- AI / agent 通常不必读 `photo` 的值（很长）。要移除照片就把 `photo` 设为 `""`；要连占位框一起关掉，再把 `showPhoto` 设为 `false`

**自定义信息（`details`）** —— 自由键值对，渲染在**头衔之后、联系方式之前**：

```json
"details": [
  { "id": "d_a1", "label": "籍贯", "value": "江苏" },
  { "id": "d_a2", "label": "政治面貌", "value": "党员" }
]
```

- **没有内置类型** —— `label` 完全由用户自己填，不要预设「籍贯 / 政治面貌」这类枚举
- 渲染为 `名称：内容`，冒号跟随 `meta.language`（`zh`→`：`，`en`→`: `，与技能行同一套规则）
- **只填一半也正常**：只有 `label` 就只显示名称，只有 `value` 就只显示内容
- **空条目会被跳过**：`label` 与 `value` 都为空（含纯空白）的条目完全不渲染；整个数组都空时**不产生任何输出**，版面与没有此字段时一致
- 排版是流式的（`flex-wrap`），宽度不够时**整条一起换行**，不会在「名称：内容」中间断开。有照片时正文栏只有 142mm，条目多时注意这点

`links` 每项：

```json
{ "id": "l_ab12cd", "label": "", "icon": "github", "url": "https://github.com/xxx" }
```

- `icon` 枚举：`github` `linkedin` `scholar`（谷歌学术）`website` `orcid` `email` `phone` `location` `generic`
- `label`：显示文字，可空；空时渲染器用图标默认名（GitHub / LinkedIn / Google Scholar / Website / ORCID / Email / Phone / Location / Link）
- `url`：完整 URL（必填才显示）

### 3.2 `education` —— 教育经历（小节标题 Education）

| 字段 | 类型 | 说明 |
|---|---|---|
| `institution` | text | 学校 |
| `location` | text | 地点 |
| `degree` | text | 学位，如 `"PhD"` |
| `area` | text | 专业，如 `"Computer Science"`（渲染为 `PhD in Computer Science`） |
| `startDate` | month | 开始 |
| `endDate` | month | 结束；`current=true` 时应为空 |
| `current` | checkbox | 在读中 |
| `score` | text | GPA/成绩，可选 |
| `courses` | list | 课程列表（编辑器里每行一门，可编辑） |
| `highlights` | bullets | 亮点 |

### 3.3 `work` / `research` —— 工作经历 / 研究经历（小节标题 Work Experience / Research Experience）

`work` 用于公司/机构里的正式职位；`research` 用于研究项目/实验室经历（`position` 可填 "PhD Candidate / Research Assistant / 项目名" 等）。两者**字段完全相同**，仅小节标题不同：**Work Experience** / **Research Experience**。

> 迁移：2026-08 起旧的 `experience` 类型拆分为 `work` / `research`；导入旧数据时旧 `experience` 块自动迁移为 `research`。

| 字段 | 类型 | 说明 |
|---|---|---|
| `position` | text | 职位 / 项目 |
| `organization` | text | 公司/机构（或实验室） |
| `location` | text | 地点 |
| `startDate` | month | 开始 |
| `endDate` | month | 结束；`current=true` 时为空 |
| `current` | checkbox | 至今 |
| `url` | text | 链接，可选 |
| `summary` | textarea | 概述 |
| `highlights` | bullets | 职责/成果，每项一条 |

### 3.4 `projects` —— 项目（小节标题 Projects）

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | text | 项目名 |
| `url` | text | 链接，可选 |
| `description` | textarea | 描述 |
| `startDate` | month | 开始 |
| `endDate` | month | 结束；`current=true` 时为空 |
| `current` | checkbox | 进行中 |
| `roles` | tags | 角色 |
| `keywords` | tags | 关键词 |
| `highlights` | bullets | 亮点 |

### 3.5 `skills` —— 技能（小节标题 Skills）

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | text | 技能组名，如 `"Programming Languages"` |
| `keywords` | list | 技能项（字符串数组；编辑器里每行一条可编辑。**没有熟练度字段**，熟练度直接写进内容，如 `"Python (Advanced)"`） |

### 3.6 `custom` —— 自定义（字段完全继承 `work`/`research`，另加一个 `title` 小节标题）

`custom` 的 `data` 与 `work`/`research` 完全相同（`position`/`organization`/`location`/`startDate`/`endDate`/`current`/`url`/`summary`/`highlights`），**仅多一个 `title`**，渲染为小节标题。适合 awards / certifications / languages 等单条目场景。

| 字段 | 类型 | 说明 |
|---|---|---|
| `title` | text | 小节标题（唯一比 work/research 多的字段） |
| 其余字段 | — | 见 §3.3 |

> 旧格式（`subtitle`/`rightText`/`columns`/`body`）导入时自动迁移：`subtitle→position`，`body` 的 `- ` 行→`highlights`，其余行→`summary`。

## 4. 值格式约定（容易出错处）

1. **日期**一定是 `"YYYY-MM"` 字符串（如 `"2022-06"`）；`current=true` 时 `endDate` 写空字符串 `""`。
2. `bullets` / `list` / `tags` 都是字符串数组；空就写 `[]`。
3. `links` 必须每项有 `id`、`icon`、`url`。
4. 布尔字段 `current`、`visible` 为 `true`/`false`。
5. 不要把 `custom` 的 `body` 写成 HTML——只用它的轻量标记语法。

## 5. 用 JSON Patch 修改数据（AI 编辑方式）

应用内部 `StateStore.applyPatch()` 支持 **RFC 6902 子集**：`add` `replace` `remove` `move` `copy` `test`。
Patch 的**路径根是应用 JSON 对象本身**，一次提交一个 patch 数组（原子应用、自动进入撤销栈、可撤销）。

常见路径：

- 改某块的某字段：`/blocks/{index}/data/{field}`
- 改 links 里某项：`/blocks/{index}/data/links/{i}/url`
- 给 bullets 追加一条：`/blocks/{index}/data/highlights/-`
- 删数组中第 i 项：`/blocks/{index}/data/keywords/0`

示例 1 —— 把 header（第 0 块）的简介改短：

```json
[
  { "op": "replace", "path": "/blocks/0/data/summary", "value": "简短版简介。" }
]
```

示例 2 —— 给第 1 块 work 追加一条成果：

```json
[
  { "op": "add", "path": "/blocks/1/data/highlights/-", "value": "Led a team of 3 to ship feature X" }
]
```

示例 3 —— 新增一个 skills 块（追加到末尾）：

```json
[
  {
    "op": "add",
    "path": "/blocks/-",
    "value": {
      "id": "b_x1k2",
      "type": "skills",
      "data": { "name": "Tools", "keywords": ["Git", "Docker"] },
      "visible": true
    }
  }
]
```

> ⚠️ 字段名必须与 §3 完全一致；拼错会被当成新字段，渲染时不显示。不要改动已有块的 `id`。

## 6. 与 JSON Resume 的映射

`JSONResume.toStrict()` 把应用 JSON 转成 jsonresume.org 标准（已不再提供严格导出按钮，映射仍用于内部与导入兼容）：

| 块类型 | 应用字段 → | JSON Resume |
|---|---|---|
| `header` | `name`/`title`/`email`/`phone`/`location`/`summary` → | `basics.name` / `basics.label` / `basics.email` / `basics.phone` / `basics.location.city` / `basics.summary` |
| `header` | `showPhoto=true` 且 `photo` 合法 → | `basics.image`（照片，data URL） |
| `header.links` | `icon == "website"` → | `basics.url` |
| `header.links` | 其余 → | `basics.profiles[]`（`network`=label 或图标默认名，`url`） |
| `work` / `research` | → | `work[]`（`organization→name`，`position`，`endDate` 在 `current=true` 时为 null） |
| `education` | → | `education[]`（`degree→studyType`） |
| `projects` | → | `projects[]` |
| `skills` | → | `skills[]` |
| `custom` | 丢弃 | （严格导出不包含） |

「导入」时若 JSON 没有 `blocks` 字段，则按 `fromStrict()` 反向还原为块。

**照片在严格格式下是有损的**：JSON Resume 只有 `basics.image`（对应「有照片」），没有表达「要照片但还没传」的字段。所以往返一次后，`showPhoto:true` + `photo:""` 这个占位状态会退化成 `showPhoto:false`，虚线框消失。**应用自身的 JSON 格式（Ctrl+S / 导出）完整保留该状态**，只有走严格格式才会丢。

## 7. 渲染规则（AI 应知道的展示行为）

- **小节分组**：连续同类型块合并到一个小节标题下。有自动标题的类型：`education→Education`、`work→Work Experience`、`research→Research Experience`、`projects→Projects`、`skills→Skills`；`header` 与 `custom` 没有自动标题（`custom` 用自身 `title` 作标题）。
- **custom 标题合并**：连续多个 `custom` 块的 `title` 相同时，只渲染**一个**小节标题，其下依次列出各块内容（适合把多个同类条目放一个标题下）；`title` 不同或中间隔着其他类型时，各自独立出标题。空 `title` 不渲染标题。
- **日期显示**：由 `meta.dateFormat` 决定 `Jun 2022` 或 `2022-06`；`current=true` 显示 `开始 – Present`（`meta.language="zh"` 时为 `开始 – 至今`）。
- **中英标点**：`meta.language="zh"` 时，自动拼接用中文标点——技能/项目列表用 `：` 和 `，`（英文为 `: ` 和 `, `）；教育学位不加 "in"（如 `博士 机械工程`，英文为 `PhD in Mechanical Engineering`）。这些是渲染器拼的，数据里不要自己加标点。
- **加粗语法**：**所有自由文本字段**都支持 `**加粗**` → `<strong>` —— 姓名、头衔、自定义信息的名称/内容、邮箱/电话/所在地、链接标签、学位/专业/学校/成绩/课程、职位/机构、项目名/角色/关键词、技能组名/技能项、简介、职责、亮点。渲染器**先转义再套加粗**，所以加粗不放松任何转义（`**<img src=x>**` 只会得到字面量的尖括号）；`**` 之外的 HTML 标签一律按字面量显示。**URL（`href` / `src`）不做 markdown 处理** —— 往链接地址里塞 `<strong>` 没有意义。
- **自定义信息**：`details` 渲染在头衔与联系方式之间，流式排列（`flex-wrap`），每条 `名称：内容` 用 `white-space: nowrap` 保证整条不被拆行；空条目直接跳过，全空时不输出任何 DOM。
- **照片**：`showPhoto=true` 时 header 变为两列 —— 正文在左，30×40mm 照片框在右上角（3:4，`object-fit: cover`）；`showPhoto=true` 但 `photo` 为空时右上角渲染**会打印出来的**虚线占位框；`showPhoto` 为假（含老数据缺该键）时 header 版面与没有照片功能时**逐字节一致**。
- `visible:false` 的块在预览/打印中隐藏。
- 顺序即文档顺序：header 建议放最前；想让某小节出现在别的类型之间，就调整 `blocks` 数组顺序。

## 8. 完整最小示例

```json
{
  "schemaVersion": 1,
  "theme": "classic",
  "accent": "#1a3a5c",
  "meta": { "dateFormat": "MMM YYYY" },
  "blocks": [
    {
      "id": "b_a1",
      "type": "header",
      "data": {
        "name": "林晓 (Xiao Lin)",
        "title": "Machine Learning Engineer",
        "email": "xiao@example.com",
        "phone": "+86 139 0000 0000",
        "location": "Shanghai, China",
        "summary": "5+ years building LLM systems.",
        "links": [
          { "id": "l_a1", "label": "", "icon": "github", "url": "https://github.com/xiaolin" },
          { "id": "l_a2", "label": "", "icon": "scholar", "url": "https://scholar.google.com/citations?user=xiaolin" }
        ]
      }
    },
    {
      "id": "b_a2",
      "type": "work",
      "data": {
        "position": "Senior ML Engineer",
        "organization": "Alibaba Cloud",
        "location": "Hangzhou",
        "startDate": "2021-07",
        "endDate": "",
        "current": true,
        "url": "",
        "summary": "Leading retrieval team.",
        "highlights": ["Cut answer latency by 40%"]
      }
    }
  ]
}
```

## 9. 给 AI 的操作守则（建议写进 system prompt）

1. **读**：先调用 `read_cv` 拿到当前完整状态对象，再动手，不要凭空假设字段。
2. **改**：用 `patch_blocks` 一次提交一组 patch（原子 + 可撤销）；能一次改完就一次改完。
3. **校验**：字段名与 §3 严格一致；不改已有 `id`；新增块用唯一 `id`；日期用 `YYYY-MM`。
4. **未知**：内容缺信息时用 `ask_user` 澄清，不要编造事实。
5. **改完告知**：说明改了什么、改在哪个块，方便用户用撤销回退。
