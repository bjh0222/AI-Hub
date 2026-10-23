/**
 * ★ 六个平台的唯一真源（Single Source of Truth）★
 *
 * 任何组件都不得硬编码 URL —— 改地址只改这一个文件。
 *
 * ⚠️ 下面 6 个 url 是「依据记忆整理的候选官方入口」，不是官方文档抄来的，
 *    首次使用前请你自己点一遍核对；核对完成后把 lastVerified 改成当天日期。
 *    URL 失效是本项目最可能出问题的地方（见 docs/技术架构决策与风险评审.md §10）。
 *
 * 本项目只做「浏览器跳转到官方网页」这一件事：
 *   - 不调用任何模型 API
 *   - 不爬取网页、不解析页面内容
 *   - 不模拟登录、不注入脚本、不绕过任何平台限制
 */

export type PlatformId =
  | 'openai'
  | 'deepseek'
  | 'gemini'
  | 'qwen'
  | 'kimi'
  | 'zhipu'
  | 'doubao'
  | 'grok';

export interface Platform {
  /** 稳定标识，同时作为 CSS `data-brand` 属性值 */
  id: PlatformId;
  /** 展示名 */
  name: string;
  /** 厂商名（卡片上的小字） */
  vendor: string;
  /** 徽标字母（不依赖任何位图素材） */
  mark: string;
  /** 一句话定位，用于搜索与卡片副标题 */
  tagline: string;
  /** 官方对话网页入口（必须 https） */
  url: string;
  /** 仅用于展示与核对，不参与跳转 */
  host: string;
  /** 搜索别名（英文、缩写、常见误拼） */
  aliases: readonly string[];
  /** 拼音首字母，便于中文输入法下快速定位 */
  initials: readonly string[];
  /** 标签，用于搜索与视觉分组 */
  tags: readonly string[];
  /** 品牌识别色 CSS 变量名（见 globals.css） */
  brandVar: string;
  /** 徽标底色（品牌色 16% 混色预计算值，见设计系统 §1.6） */
  tintHex: string;
  /** 实心填充色 CSS 变量名（仅用于 ≤2 字符高对比标识） */
  fillVar: string;
  /** 上次人工核对入口地址的日期，格式 YYYY-MM-DD */
  lastVerified: string;
}

export const PLATFORMS: readonly Platform[] = [
  {
    id: 'openai',
    name: 'ChatGPT',
    vendor: 'OpenAI',
    mark: 'C',
    tagline: '综合对话与写作，通用性最强的默认选项。',
    url: 'https://chatgpt.com/',
    host: 'chatgpt.com',
    aliases: ['chatgpt', 'gpt', 'openai', 'chat gpt'],
    initials: ['c', 'g'],
    tags: ['通用对话', '写作'],
    brandVar: '--brand-openai',
    tintHex: '#183335',
    fillVar: '--fill-openai',
    lastVerified: '2026-10-09',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    vendor: '深度求索',
    mark: 'D',
    tagline: '推理与代码见长，中文语境下回答偏严谨。',
    url: 'https://chat.deepseek.com/',
    host: 'chat.deepseek.com',
    aliases: ['deepseek', 'deep seek', 'ds', '深度求索'],
    initials: ['ds', 'sds'],
    tags: ['推理', '代码'],
    brandVar: '--brand-deepseek',
    tintHex: '#222D41',
    fillVar: '--fill-deepseek',
    lastVerified: '2026-10-09',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    vendor: 'Google',
    mark: 'G',
    tagline: '多模态与长上下文处理，适合图文混合提问。',
    url: 'https://gemini.google.com/app',
    host: 'gemini.google.com',
    aliases: ['gemini', 'google', 'bard', '谷歌'],
    initials: ['gm', 'g'],
    tags: ['多模态', '长上下文'],
    brandVar: '--brand-gemini',
    tintHex: '#252F40',
    fillVar: '--fill-gemini',
    lastVerified: '2026-10-09',
  },
  {
    id: 'qwen',
    name: '通义千问',
    vendor: '阿里巴巴',
    mark: '千',
    tagline: '中文写作与办公场景顺手，国内直连速度稳定。',
    url: 'https://www.tongyi.com/',
    host: 'www.tongyi.com',
    aliases: ['qwen', 'tongyi', 'ty', '通义', '千问', '通义千问'],
    initials: ['tyqw', 'qw', 'ty'],
    tags: ['中文', '办公'],
    brandVar: '--brand-qwen',
    tintHex: '#292940',
    fillVar: '--fill-qwen',
    lastVerified: '2026-10-09',
  },
  {
    id: 'kimi',
    name: 'Kimi',
    vendor: '月之暗面',
    mark: 'K',
    tagline: '超长文本阅读与资料整理，丢长文档进去最省事。',
    url: 'https://kimi.moonshot.cn/',
    host: 'kimi.moonshot.cn',
    aliases: ['kimi', 'moonshot', '月之暗面'],
    initials: ['km', 'k'],
    tags: ['长文本', '中文'],
    brandVar: '--brand-kimi',
    tintHex: '#2D2F41',
    fillVar: '--fill-kimi',
    lastVerified: '2026-10-09',
  },
  {
    id: 'zhipu',
    name: '智谱清言',
    vendor: '智谱 AI',
    mark: '智',
    tagline: '中文理解与工具调用，适合结构化输出类任务。',
    url: 'https://chatglm.cn/',
    host: 'chatglm.cn',
    aliases: ['zhipu', 'chatglm', 'glm', '清言', '智谱', '智谱清言'],
    initials: ['zpqy', 'zq', 'glm'],
    tags: ['中文', '结构化'],
    brandVar: '--brand-zhipu',
    tintHex: '#202B41',
    fillVar: '--fill-zhipu',
    lastVerified: '2026-10-09',
  },
  {
    id: 'doubao',
    name: '豆包',
    vendor: '字节跳动',
    mark: '豆',
    tagline: '中文日常问答与写作，国内直连，回答偏口语化。',
    url: 'https://www.doubao.com/chat/',
    host: 'www.doubao.com',
    aliases: ['doubao', 'db', '豆包', '字节'],
    initials: ['db'],
    tags: ['中文', '日常'],
    brandVar: '--brand-doubao',
    tintHex: '#273045',
    fillVar: '--fill-doubao',
    lastVerified: '2026-10-09',
  },
  {
  id: 'grok',
  name: 'Grok',
  vendor: 'xAI',
  mark: 'X',                    
  tagline: '追求真相的实时对话与推理，接入 X 动态。',
  url: 'https://grok.com',      
  host: 'grok.com',             
  aliases: ['grok', 'xai', 'xAI'],
  initials: ['gr', 'gk'],
  tags: ['英文', '实时', '推理'],
  brandVar: '--brand-grok',
  tintHex: '#2A2438',          
  fillVar: '--fill-grok',
  lastVerified: '2026-10-15',  
  },
];

export const PLATFORM_BY_ID: Record<PlatformId, Platform> = PLATFORMS.reduce(
  (acc, platform) => {
    acc[platform.id] = platform;
    return acc;
  },
  {} as Record<PlatformId, Platform>,
);

export function platformUrl(id: PlatformId): string {
  return PLATFORM_BY_ID[id].url;
}
