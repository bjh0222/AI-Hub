# AI Hub 导航站 · Prompt 边栏改造 + 全站美化规格

> 依据实际代码编写：`src/app/globals.css`、`tailwind.config.ts`、`src/components/HubApp.tsx`、
> `PromptPanel.tsx`、`MultiOpenBar.tsx`、`ui/primitives.tsx`、`TopBar.tsx`、`PlatformCard.tsx`、
> `hooks/useHotkeys.ts`、`lib/storage/schema.ts`。所有类名/行号可直接定位。

---

## A. Prompt 边栏（PromptPanel Dialog → Collapsible Sidebar）

### A1. 形态决策

**推荐：≥lg 用右侧 docked 常驻面板（挤压主内容）；<lg 降级为底部弹层（见 A7）。**

理由（对准「用户常边看卡片边从库里点提示词」这个核心场景）：

1. overlay 的遮罩会拦截网格点击——用户每点一条提示词想顺手勾选卡片，都必须先关抽屉；docked 下网格始终可交互（勾选、收藏、多开一条龙不断）。
2. 桌面为主、单人自用：屏幕空间是自己的，常驻 320px 换「库始终在手边」是净收益；网格让出 320px 后 1400px 容器仍可维持 3~4 列，重排是浏览器原生 flex 重排，无跳变。
3. 现状 Dialog 正是要解决的痛点：全屏遮罩 + 焦点困住 + 「完成」才能回到卡片。

**关键数值**

| 项 | docked（推荐，≥lg） | overlay（备用/过渡期） |
|---|---|---|
| 宽度 | `320px`（lg）/ `336px`（xl） | `min(400px, 92vw)` |
| 宽度下限/上限 | 280px / 400px（仅写入 CSS 变量注释备将来开启拖拽，**当前不实现拖拽**） | — |
| 定位 | `fixed right-0 top-14 z-20 h-[calc(100vh-3.5rem)]`（贴 TopBar 下沿，随页面滚动的 sticky 语义由 fixed+全高实现） | `fixed right-0 top-0 z-40 h-dvh` |
| 背景 | `bg-surface-1` + `border-l border-border-subtle`（不透明贴边面板，无浮起语义，不加阴影） | `bg-surface-2 shadow-3` |
| 主内容让位 | main 加 `lg:mr-[320px] xl:mr-[336px]`（保留 `mx-auto max-w-container`，margin-right 固定后内容块贴齐边栏左侧，剩余空间留白） | 遮罩 `fixed inset-0 bg-[rgb(0_0_0/0.55)]`，点击遮罩=关闭，焦点困在面板内（同现有 Dialog 行为），`role="dialog" aria-modal="true"` |
| 层级 | z-20（低于 TopBar z-30 / MultiOpenBar z-30 / Dialog z-50） | z-40 |
| MultiOpenBar | `right` 同步让位（见 B4） | 不动 |
| a11y 角色 | `role="complementary" aria-label="提示词库"`，**不** aria-modal、**不**困焦点 | dialog + aria-modal + 焦点圈闭 |

> docked 的 `mx-auto` + `mr-[320px]` 组合：margin-left:auto 仍在，块在剩余空间内右对齐贴边栏。
> 若希望保持视觉居中，可改用 main 加 `lg:pr-[336px]`（padding 方案），但会让 1400px 盒子
> 相对视口居中而内容偏左——二选一，**默认实现取 margin 方案**。

**涉及文件**：新建 `src/components/PromptSidebar.tsx`（吸收 `PromptPanel.tsx` 的列表/置顶/编辑逻辑）；`HubApp.tsx` 改挂载点与布局。

---

### A2. 展开动画

**docked：width 过渡**（transform 无法挤压主内容）。为避免内容在过渡中被挤压闪烁，采用「外壳过渡 + 内容定宽」双 div 结构：

```html
<aside data-open="true" class="fixed right-0 top-14 z-20 hidden h-[calc(100vh-3.5rem)] overflow-hidden
       border-l border-border-subtle bg-surface-1 lg:block
       w-0 lg:data-[open=true]:w-[320px] xl:data-[open=true]:w-[336px]
       transition-[width] duration-slow ease-standard">
  <div class="flex h-full w-[320px] flex-col xl:w-[336px]"> ... </div>
</aside>
```

- 展开：`300ms`（`duration-slow`）+ `--ease-standard`（`ease-standard`）。
- 收起：`200ms`（`duration-base`）+ `--ease-exit`（`ease-exit`），收起更利落。
  （收起缓动需按 data-open 切换 transition-timing-function：`data-[open=false]:ease-exit data-[open=false]:duration-base`。）

**overlay：transform**。`translate-x-full → 0`，进 `200ms`（duration-base）+ `ease-emphasized`；出 `150ms`（duration-fast）+ `ease-exit`；遮罩 opacity `150ms`。

**`prefers-reduced-motion` 降级**：`globals.css` §5 的全局规则已把 `transition-property` 限制为
`color, background-color, border-color, opacity`——width/transform 过渡会自动退化为直接跳变，
**无需为边栏另写媒体查询**。两条纪律：

1. 边栏动画只能用 transition，不能用 CSS animation（keyframes 会被压到 0.01ms 导致闪一帧）。
2. 不做行条目 stagger 级联入场。

---

### A3. 边栏内部结构（自上而下）

容器：`flex h-full flex-col`；头部与摘要/按钮固定，列表区滚动。

1. **标题区**（`flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-3`）
   - 左：`text-sm font-semibold text-fg-1`「提示词库」+ `<span class="kbd">p</span>`（沿用 `.kbd`）。
   - 右：`IconButton`（`h-8 w-8`）`aria-label="关闭提示词库（Esc）"`。

2. **「当前提示词」摘要**（`mx-3 mt-3 rounded-md border border-border-subtle bg-surface-inset px-3 py-2`）
   - 上行：`text-[11px] text-fg-3`「当前提示词」。
   - 下行：`truncate text-sm text-fg-1`；为空时 `text-fg-3`「未选择 —— 点卡片直接打开」。
   - 右侧「取消选择」由文字按钮改为 `icon-btn h-6 w-6`（× 图标，`aria-label="取消当前提示词"`）——原 `btn btn-ghost px-2 py-1`「取消选择」在 320px 里与标题挤一行。
   - 摘要块不可点击（不做「滚动到该条目」，过度设计）。

3. **新建按钮**：`btn btn-primary mx-3 mt-2 h-9 w-[calc(100%-1.5rem)] justify-center`「新建提示词」。

4. **搜索/过滤输入框：要。** `mx-3 mt-2` + `<input class="input h-9">`，`placeholder="搜索提示词…"`，
   `aria-label="搜索提示词"`。行为：匹配 title+content+category；有过滤词时**命中分组强制展开**
   （临时覆盖折叠态，清空后恢复）。不引入 `/` 快捷键（与聚焦主输入框冲突）。

5. **编辑器**：原 `PromptEditor` 表单整块替换列表滚动区（`mode !== 'closed'` 时只渲染表单），
   顶部加 `btn btn-ghost`「← 返回」。**不要在边栏里再叠 Dialog**（层级爆炸）。

6. **分类手风琴**，分组顺序与数据源（贴合现有 `sortPromptsForDisplay` / `pinnedPromptIds`）：
   1. **置顶**（`pinnedPromptIds` 非空才渲染；任意来源，按置顶顺序）
   2. **我的提示词**（`source === 'user' || builtinId === null` 且未置顶；**不**再按分类拆组——单人自用条目少，分类以行内 badge 呈现）
   3. **内置模板按分类分组**：写作 / 编程 / 翻译 / 总结 / 学习（`PROMPT_CATEGORIES`）+「其他」兜底。

   **组头**：`<button type="button" class="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-surface-2">`
   - 折叠箭头：`ChevronRight` svg `h-3.5 w-3.5 shrink-0 text-fg-3 transition-transform duration-fast ease-standard`，展开 `rotate-90`、收起 `rotate-0`。
   - 标题：`text-xs font-medium text-fg-2`（不要用 `section-title` 的 uppercase——中文无效果）。
   - 计数徽标：`<span class="badge tabular-nums">{n}</span>`（沿用 `.badge`）。
   - 当前提示词标记：该组含当前提示词时，组头最右加 `h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500`
     （#4D9BFF；非文本 UI 组件色，on #141922 实算 **6.25:1** ✓ ≥3:1）。
   - **折叠态不显示首条预览**：320px 里箭头+标题+徽标已占过半，预览只能放 8~10 字、信息量≈0，
     且会让展开/收起时行高跳变。折叠态 = 箭头 + 标题 + 计数 + 当前圆点，仅此而已。

   **行条目**（取代原 divide-y 列表，圆角行更透气）：
   `group relative flex items-start gap-2 rounded-md px-2 py-2 hover:bg-surface-2`
   - 左列 `min-w-0 flex-1`：第一行 `truncate text-sm text-fg-1`，置顶项标题前内联 `<PinIcon class="h-3.5 w-3.5 text-warning">`；第二行 `truncate text-xs text-fg-3` = 预览（沿用现有 42 字截断）。
   - 分类 badge 只在「我的提示词」组显示（其他组组头即分类，行内不重复）。
   - 当前行：`bg-accent-tint` + 左侧 2px 标识
     `before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-0.5 before:rounded-full before:bg-accent-500`，
     且 hover 底色保持 `bg-accent-tint` 不再加深（蓝底不叠灰）。当前行隐藏主按钮（已是当前）。
   - **hover 动作重排**（原 4 个文字按钮在 320px 放不下）：
     - **主动作常驻化（hover/focus-within 显现）**：内置模板行 = `btn btn-primary h-6 shrink-0 px-2 text-xs`「用这个」；我的提示词行 = 同规格「设为当前」。
       类名：`opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-within:opacity-100`。
     - **次动作收进 ⋯ 菜单**：`icon-btn h-6 w-6`（MoreIcon，同样 hover 显现）→ 点击弹
       `<div role="menu" class="absolute right-1 top-8 z-10 w-36 rounded-md border border-border-subtle bg-surface-2 p-1 shadow-2">`，
       菜单项 `<button role="menuitem" class="flex h-8 w-full items-center rounded-sm px-3 text-left text-sm text-fg-1 hover:bg-surface-1-hover">`：
       置顶/取消置顶、编辑、删除（`text-danger`）。Esc / 点击外部 / 选中一项 关闭。
     - 为什么主动作不进菜单：边栏使命是「一眼一条、一点就用」，两段 hover 会把主路径变成 3 次点击。

---

### A4. 折叠手风琴的可访问性

- 组头：`<button type="button" aria-expanded={open} aria-controls="prompt-group-{id}">`；
  内容：`<ul id="prompt-group-{id}" role="list" hidden={!open}>`。
- **用 `hidden` 而非 height 动画**：flex 高度过渡在 reduced-motion 下退化尴尬且每次展开都要布局动画；
  直接显隐 + 箭头旋转过渡已足够，且收起组内容天然不可聚焦。
- 键盘：组头是原生 button（Enter/Space 原生触发）；Tab 顺序 = 组头 → 组内行主按钮 → ⋯ 按钮 → 下一组头。
  **不实现**方向键/Home/End 树形导航——这是 accordion 不是 treeview，WCAG 不要求。
- **折叠状态持久化：做。** 存 `settings.promptSidebarCollapsed: string[]`
  （组 id：`pinned` / `mine` / 五个内置分类名 / 其他分类名）。理由：单人自用每天想看的组是固定的，
  不记忆则每天重收一遍内置组；放 settings（而非独立 localStorage key）可随「设置与数据」导出/恢复迁移，
  与收藏、当前提示词同一条数据链路。

---

### A5. 边栏开合状态持久化

- `settings.promptSidebarOpen: boolean`，**默认 `false`**；`setSetting` 已有，零新机制。
- 放 settings 的取舍：
  - 得：跨标签页一致、随设置导出迁移、与折叠分组同一存储路径。
  - 失：「重置全部」会顺带收起边栏——单人自用可接受。
- **只在 ≥lg 应用记忆值**；<lg 的抽屉形态一律视为关闭、不记忆（用完即走，避免「手机上莫名多了个抽屉」）。
- 默认展开分组：`pinned`（有内容时）+ `mine`；内置 5 分类 + 其他 收起。
- 含当前提示词的组**首次渲染自动展开**（仅当该组 id 不在 `promptSidebarCollapsed` 里——用户手动收起后以持久化为准，不强制弹开）。

---

### A6. 与现有快捷键的协调

- `p`（`useHotkeys.ts:87` → `onTogglePrompts`）：语义从「开 Dialog」改为「切换边栏」，handler 名不变。
  现有 typing 让路（`useHotkeys.ts:64`）已保证在边栏搜索框打字时 `p` 不触发，无需改 hook。
- **必改**：`HubApp.tsx:421` 的 hotkeys enabled 条件
  `!showHelp && !showSettings && !showPrompts && manualCopy === null`
  → **去掉 `!showPrompts`**，改为 `!showHelp && !showSettings && manualCopy === null`。
  否则 docked 边栏一常开，全站快捷键（f/空格/数字组合）全部失效。
- **Esc 处理链**（`HubApp.tsx:394` onEscape 重排，优先级从上到下）：
  1. `outcome !== null` → 关结果面板（现状保留）
  2. 边栏 ⋯ 菜单开着 → 关菜单
  3. 边栏搜索框有字 → 清空搜索
  4. 边栏编辑器开着 → 返回列表
  5. 边栏开着 → 关边栏（焦点归还）
  6. `platformQuery` 有字 → 清空（现状保留）
  7. `selected` 非空 → 清空（现状保留）
  8. blur 主输入框（现状保留）
  > 关边栏排在清 platformQuery 之前：边栏是当前最上层交互上下文。
- **焦点管理**（复用 `primitives.tsx` Dialog 的 previousFocusRef 模式，建议抽成 `useFocusReturn` hook）：
  - 打开（`p` 或点当前提示词 chip）：记录 `document.activeElement`，焦点移入 aside 容器（容器 `tabIndex={-1}` + `ref.focus()`）。
  - 关闭：焦点归还原元素；原元素已从 DOM 移除时回退到当前提示词 chip。
  - docked 形态**不困焦点**、不 aria-modal（主内容必须保持可交互）；仅 overlay/<lg 抽屉形态做 Tab 圈闭 + `role="dialog" aria-modal="true"`。
- docked 与网格 roving tabindex 无冲突（网格焦点逻辑独立于边栏）。

---

### A7. 移动端（<lg）：底部弹层（bottom sheet），不做全宽侧抽屉

理由：提示词库是纵向长列表，底部弹层自带大滚动区 + 拇指可达；手机侧抽屉宽 92vw 与全屏无异还要处理滑动手势，实现量大收益小。

- 遮罩：`fixed inset-0 z-40 bg-[rgb(0_0_0/0.55)]`，点击关闭。
- 面板：`fixed inset-x-0 bottom-0 z-40 max-h-[72dvh] rounded-t-2xl border-t border-border-subtle bg-surface-2 shadow-3`
  （`rounded-t-2xl` = 24px，用足圆角档最大档）。
- 把手（纯视觉）：`mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong`
  （#58677D，非文本装饰，on #1B2230 ≈3.06:1 ✓ ≥3:1，沿用既有 token，不新增色值）。
- 动画：`translate-y-full → 0`，进 `200ms ease-emphasized` / 出 `150ms ease-exit`；reduced-motion 由全局规则兜底。
- 内容与桌面版完全复用（头部/摘要/搜索/手风琴），编辑器表单在 sheet 内滚动。
- **明确不做**：拖拽跟手下拉关闭、snap 高度档位、侧滑手势。

---

## B. 全站美化 pass（克制清单）

> 原则：只调层次与一致性，不推翻既有令牌。除下表列出的，不引入任何新色值。

| # | 改什么 | 怎么改 | 为什么值得 |
|---|---|---|---|
| B1 | `globals.css` `.card:hover`（:219） | 加 `box-shadow: var(--shadow-2); transform: translateY(-1px);`，并在 `.card` transition 列表补 `transform 150ms var(--ease-standard)`（box-shadow 已在列表中） | 现在 hover 只有底色+边框变化，同屏十几张卡片浮起感几乎为零；-1px + shadow-2 是最小浮起语言。reduced-motion 全局规则自动剥离 transform。**不加 scale、不加 glow**（glow 留给选中态） |
| B2 | `globals.css` `.card[data-selected='true']`（:223） | 加 `box-shadow: var(--glow-1)`（非文本装饰） | 选中目前只靠边框变蓝，多开勾选场景反馈弱；glow-1 是现有令牌、强度低。**禁用 glow-2/3 于卡片** |
| B3 | `TopBar.tsx` + 新边栏 | TopBar 全宽 glass 不动；边栏 `top-14` + `border-l border-border-subtle bg-surface-1`，**不用 glass** | `.glass` 同屏 ≤2 的预算已被 TopBar + MultiOpenBar 占满；边栏是不透明贴边面板无「悬浮」语义。把这条写进 globals.css §4 注释 |
| B4 | `MultiOpenBar.tsx:40` | `inset-x-0` → `left-0 right-[var(--sidebar-w,0px)]`；HubApp 根节点按 docked 状态设 `--sidebar-w: 320px/336px/0px`（或 Tailwind：`lg:data-[docked=true]:right-[320px] xl:data-[docked=true]:right-[336px]`），bar 加 `transition: right 300ms var(--ease-standard)` | 现在 bar 是全宽 fixed，边栏打开后玻璃带横穿边栏底部，层级混乱；让位后 bar 与主内容同域，转场与边栏 width 过渡同帧同缓动 |
| B5 | `globals.css` `.input:focus`（:280） | 新增 token `--focus-halo: rgb(77 155 255 / 0.15);`，`.input:focus` 加 `box-shadow: 0 0 0 3px var(--focus-halo);` | 现在 focus 只有边框 #58677D→#2563EB（on 卡片 3.41:1），太微弱；主输入框与边栏搜索框同屏时分不清焦点。halo 跟 `:focus`、outline 跟 `:focus-visible`，叠加是刻意的（鼠标点击也有 halo，键盘还有 outline 环）。非文本装饰 |
| B6 | `HubApp.tsx:552` 空态 | 卡片顶部加图标位：`<div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border-subtle bg-surface-inset text-fg-3">`（SearchIcon `h-5 w-5`），容器 `p-8` 保持 | 纯文字空态读起来像报错；图标位让它读作「正常但无结果」。零新色值 |
| B7 | 新增 `.badge-accent`；`PlatformCard.tsx:134` | `@layer components` 加 `.badge-accent { @apply bg-accent-tint text-accent-500; }`；把 `style={{ color: 'var(--accent-500)' }}` 的内联样式换成 `<span class="badge badge-accent">` | 消灭全站唯一一处内联样式色彩；badge 语义三态齐：默认（inset/fg-3）、accent（tint/#4D9BFF）、success（#34D399）。**对比度实算**：#4D9BFF on #1C2B41 = **5.06:1** ✓ ≥4.5；#34D399 on #1C2B41 = **7.42:1** ✓ |
| B8 | `main`（`HubApp.tsx:444`） | docked 让位的 `margin-right` 加 `transition: margin 300ms var(--ease-standard)`（与 B4 的 right 同帧同缓动） | 挤压过程连续，网格重排跟随同一节奏。**不做 FLIP、不做网格 item 级动画**（见「不要做」） |
| B9 | 边栏滚动区 | `overflow-y-auto overscroll-contain` | 防边栏滚到底带出整页滚动。全站滚动条样式已达标（globals §2），不再改 |
| B10 | `primitives.tsx:127` + globals.css | 新 token `--overlay-bg: rgb(0 0 0 / 0.55);`；Dialog 的 `bg-black/65` → `bg-[var(--overlay-bg)]`；边栏遮罩同值 | 两处遮罩一个值管全部；0.65→0.55 让 Dialog 下的页面隐约可见，深色主题下不那么死板。非文本装饰。⚠️ 有视觉变化，需走查 Settings/ShortcutsHelp 打开效果 |
| B11 | Toast / focus-visible / `.kbd` / `.chip` | **检查过，不改** | Toast top-68px 在 TopBar 下正确，边栏 docked 时居中落在主内容区无冲突；焦点环全局已统一 |

### 新色值汇总与对比度自检

| 值 | 用途 | 类型 | 底色 | 对比度 | 结论 |
|---|---|---|---|---|---|
| `rgb(77 155 255 / 0.15)` | 输入框 focus halo | 非文本装饰 | surface-inset 等 | — | ✓ 装饰豁免 |
| `#4D9BFF`（6px 圆点 / 2px 当前条） | 边栏当前提示词标识 | UI 组件色（WCAG 1.4.11） | #141922 | 6.25:1 | ✓ ≥3:1 |
| `#4D9BFF`（文本） | `.badge-accent` 文本 | 文本 | #1C2B41 | 5.06:1 | ✓ ≥4.5:1 |
| `rgb(0 0 0 / 0.55)` | 遮罩统一 token | 非文本装饰 | 页面 | — | ✓ 装饰豁免 |
| `#58677D`（把手） | 移动端 sheet 把手 | 非文本装饰 | #1B2230 | ≈3.06:1 | ✓ ≥3:1（沿用既有 token，不新增） |

文本一律复用既有三级 `#F2F6FC/#A9B4C6/#8A97AD`（设计系统已验算），无新文本色。

### 明确「不要做」（防过度设计）

1. **不给卡片/边栏加毛玻璃**——backdrop-filter 预算纪律（同屏 ≤2）已被 TopBar + MultiOpenBar 占满。
2. **不做网格 FLIP 重排动画、不做行条目 stagger 入场**——单人自用页面体量小，为此引入 framer-motion 得不偿失。
3. **不做边栏拖拽调宽、不做移动端拖拽跟手关闭**——两个断点宽度 + 简单滑入足够。
4. **不加暗色/亮色主题切换、不加新字号/字体档**。
5. **不新增发光档位**——glow 只允许 B2 的选中卡片用 glow-1；按钮/输入框/边栏一律不加。
6. **Toast 不加进度条/倒计时**。
7. **不改 TopBar 结构**——不往里塞提示词入口；当前提示词 chip「状态即入口」的现有设计是对的。
8. **手风琴不做 height 过渡**——`hidden` 显隐 + 箭头旋转足够，reduced-motion 友好、无布局动画成本。

---

## 落地文件清单

| 文件 | 动作 |
|---|---|
| `src/components/PromptSidebar.tsx` | **新建**（吸收 `PromptPanel.tsx` 全部业务逻辑：内置模板/我的提示词/置顶/编辑器/复制管线回调） |
| `src/components/PromptPanel.tsx` | 删除（逻辑迁入 PromptSidebar） |
| `src/components/HubApp.tsx` | 布局改 docked 挂载、hotkeys enabled 条件（:421）、Esc 链（:394）、焦点管理、`--sidebar-w` 注入 |
| `src/components/MultiOpenBar.tsx` | right 让位（:40，B4） |
| `src/components/ui/primitives.tsx` | Dialog 遮罩 token 化（:127，B10） |
| `src/app/globals.css` | `--focus-halo`/`--overlay-bg` token、`.card:hover`/`[data-selected]`（B1/B2）、`.input:focus`（B5）、`.badge-accent`（B7）、§4 注释补边栏 glass 禁用（B3） |
| `src/lib/storage/schema.ts` | `settings` 增 `promptSidebarOpen: boolean`、`promptSidebarCollapsed: string[]`（含默认值与迁移） |
