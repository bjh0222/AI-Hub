/**
 * 内置提示词模板（只读数据源）。
 *
 * 模型决策（docs/方案书 §12）：模板不进 localStorage、不参与迁移与清洗；
 * 「应用模板 = 复制一份进用户库存」，副本记录 builtinId 仅用于角标与「已添加」判断，
 * 此后副本与模板互不影响 —— 不做「模板更新自动同步副本」。
 *
 * 内容只是起点，用户应按自己的场景修改；不收集任何使用数据。
 */

export interface PromptTemplate {
  /** 稳定 id，形如 tpl-<分类>-<序号> */
  id: string;
  title: string;
  category: string;
  description: string;
  content: string;
}

export const PROMPT_CATEGORIES = ['写作', '编程', '翻译', '总结', '学习'] as const;

export const BUILTIN_TEMPLATES: readonly PromptTemplate[] = [
  {
    id: 'tpl-writing-polish',
    title: '中文润色',
    category: '写作',
    description: '保持原意，改掉翻译腔与口水话',
    content:
      '请润色下面这段中文：保持原意与语气，去掉翻译腔、重复和口水话，\n把长句拆顺，专业术语保持准确。直接给出润色后的全文，不要解释改动。\n\n---\n（把文字粘在这里）',
  },
  {
    id: 'tpl-writing-email',
    title: '工作邮件',
    category: '写作',
    description: '把要点整理成一封得体的工作邮件',
    content:
      '帮我把下面几个要点写成一篇工作邮件：语气专业、克制，先说结论再说细节，\n结尾给出明确的下一步。收件人是同事。直接输出邮件正文。\n\n要点：\n1. （填写）\n2. （填写）',
  },
  {
    id: 'tpl-code-review',
    title: '代码审查',
    category: '编程',
    description: '从正确性、边界、可读性三方面审查代码',
    content:
      '请审查下面的代码：先给结论（能不能直接用），再按「正确性 / 边界条件 / 可读性」\n三部分列出问题，每条给出修改建议或示例代码。不要泛泛而谈。\n\n```\n（把代码粘在这里）\n```',
  },
  {
    id: 'tpl-code-explain',
    title: '解释代码',
    category: '编程',
    description: '逐段解释一段代码在做什么',
    content:
      '请解释下面这段代码：先一句话说明它整体在做什么，再逐段解释关键逻辑，\n最后指出两个最容易被误解的细节。假设我熟悉编程但不熟悉这段代码。\n\n```\n（把代码粘在这里）\n```',
  },
  {
    id: 'tpl-translate-cn',
    title: '英译中',
    category: '翻译',
    description: '自然、准确的中文翻译，保留术语原文',
    content:
      '把下面的英文翻译成中文：译文要自然、符合中文表达习惯，不要逐词直译；\n专业术语首次出现时保留英文原文并括注。直接给出译文。\n\n---\n（把英文粘在这里）',
  },
  {
    id: 'tpl-translate-en',
    title: '中译英',
    category: '翻译',
    description: '地道、简洁的英文翻译，标注两种译法',
    content:
      '把下面的中文翻译成英文：给出一个「地道版」和一个「直译版」。\n地道版要自然简洁，适合写进邮件或文档。\n\n---\n（把中文粘在这里）',
  },
  {
    id: 'tpl-summarize-doc',
    title: '长文总结',
    category: '总结',
    description: '把长文压缩成一页要点',
    content:
      '请总结下面的内容：先给 3 句话的版本，再给分点详细版（每点一行）。\n保留数字、结论与例外情况，不要编造原文没有的信息。\n\n---\n（把内容粘在这里）',
  },
  {
    id: 'tpl-summarize-meeting',
    title: '会议纪要',
    category: '总结',
    description: '把聊天记录/录音稿整理成纪要',
    content:
      '把下面的会议记录整理成纪要：按「结论 / 待办（负责人+期限）/ 遗留问题」三部分输出，\n待办用列表。信息缺失的地方标【待补充】，不要猜。\n\n---\n（把记录粘在这里）',
  },
  {
    id: 'tpl-learn-concept',
    title: '概念速成',
    category: '学习',
    description: '用类比 + 最小例子讲清一个概念',
    content:
      '我想快速理解「（填概念）」：先用一个生活类比解释，再给一个最小可运行的例子，\n最后列出三个最常见的误解。不要教科书式的定义堆砌。',
  },
  {
    id: 'tpl-learn-plan',
    title: '学习计划',
    category: '学习',
    description: '按周拆解的学习路径，含检验标准',
    content:
      '我要学会「（填主题）」，每周可投入（填小时数）小时，目前水平是（填现状）。\n请给出按周拆解的学习计划：每周有明确产出物和检验标准，并指出哪一步最容易放弃、怎么应对。',
  },
];
