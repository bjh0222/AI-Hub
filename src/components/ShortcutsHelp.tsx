'use client';

import { Dialog, Kbd } from './ui/primitives';

const SHORTCUTS: Array<{ keys: string[]; description: string }> = [
  { keys: ['/'], description: '聚焦提示词输入框（主输入框）' },
  { keys: ['s'], description: '展开 / 收起平台搜索（收起即清空）' },
  { keys: ['Enter'], description: '平台搜索时：打开结果里的第一个' },
  { keys: ['p'], description: '打开 / 关闭提示词库' },
  { keys: ['1', '…', '9'], description: '载入第 N 个组合；再按同一数字直接打开' },
  { keys: ['Esc'], description: '逐级收手：清搜索词 → 清选择 → 取消聚焦' },
  { keys: ['↑', '↓', '←', '→'], description: '在卡片间移动（按整行跳）' },
  { keys: ['Home', 'End'], description: '跳到第一张 / 最后一张卡片' },
  { keys: ['Enter'], description: '打开当前聚焦的卡片' },
  { keys: ['f'], description: '收藏 / 取消收藏当前卡片' },
  { keys: ['Space'], description: '把当前卡片加入 / 移出多开选择' },
  { keys: ['Ctrl', 'Enter'], description: '打开选中的全部（尽力连开，被拦的给链接）' },
  { keys: ['?'], description: '打开 / 关闭本说明' },
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      title="快捷键"
      onClose={onClose}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          知道了
        </button>
      }
    >
      <ul className="space-y-2.5">
        {SHORTCUTS.map((item) => (
          <li key={item.description} className="flex items-center justify-between gap-4">
            <span className="text-sm text-fg-2">{item.description}</span>
            <span className="flex shrink-0 items-center gap-1">
              {item.keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-fg-3">
        输入框聚焦时，单键快捷键会让路（否则没法正常打字）；Ctrl/Cmd + 数字不会被拦截，避免和浏览器切换标签页打架。
      </p>
    </Dialog>
  );
}
