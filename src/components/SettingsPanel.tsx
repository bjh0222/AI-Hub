'use client';

import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { Platform } from '@/data/platforms';
import { buildBackup, parseBackup } from '@/lib/storage/backup';
import type { HubState } from '@/lib/storage/schema';
import { downloadTextFile } from '@/lib/storage/store';
import { formatStamp } from '@/lib/utils/time';
import { DownloadIcon, InfoIcon, TrashIcon, UploadIcon } from './Icons';
import { Dialog } from './ui/primitives';

interface SettingsPanelProps {
  platforms: readonly Platform[];
  state: HubState;
  storageAvailable: boolean;
  onClose: () => void;
  onRestore: (next: HubState) => void;
  onClearRecents: () => void;
  onResetAll: () => void;
  onToggleShortcutHints: (value: boolean) => void;
}

export function SettingsPanel({
  platforms,
  state,
  storageAvailable,
  onClose,
  onRestore,
  onClearRecents,
  onResetAll,
  onToggleShortcutHints,
}: SettingsPanelProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState<'info' | 'danger'>('info');

  function handleExport() {
    const now = Date.now();
    const ok = downloadTextFile(`aihub-backup-${formatStamp(now)}.json`, buildBackup(state, now));
    setNoticeTone(ok ? 'info' : 'danger');
    setNotice(ok ? '备份文件已开始下载。' : '下载失败，请换个浏览器或手动复制数据。');
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;

    const text = await file.text();
    const result = parseBackup(text);

    if (!result.ok) {
      setNoticeTone('danger');
      setNotice(`导入失败：${result.error}`);
      return;
    }

    onRestore(result.state);
    setNoticeTone('info');
    setNotice(`已导入 ${result.favorites} 个收藏、${result.recents} 条最近使用记录。`);
  }

  function handleReset() {
    const confirmed = window.confirm('清空全部本地数据（收藏、最近使用、设置）？此操作不可撤销。');
    if (!confirmed) return;
    onResetAll();
    setNoticeTone('info');
    setNotice('本地数据已清空。');
  }

  function handleClearRecents() {
    onClearRecents();
    setNoticeTone('info');
    setNotice('最近使用记录已清空。');
  }

  return (
    <Dialog
      title="设置与数据"
      onClose={onClose}
      width="lg"
      footer={
        <button type="button" className="btn" onClick={onClose}>
          完成
        </button>
      }
    >
      <div className="space-y-5 text-sm">
        <section>
          <h3 className="section-title mb-2">本地数据</h3>
          <p className="text-fg-2">
            收藏与最近使用只存在这台浏览器的 localStorage（键名{' '}
            <code className="kbd">aihub:v1:state</code>），不上传任何数据，也不记录任何对话内容。
          </p>
          {storageAvailable ? null : (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-warning">
              <InfoIcon className="h-3.5 w-3.5" />
              当前浏览器禁用了本地存储，本次使用不会保留收藏与记录。
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={handleExport}>
              <DownloadIcon className="h-4 w-4" />
              导出备份
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              <UploadIcon className="h-4 w-4" />
              导入备份
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={handleImport}
              aria-label="选择备份文件"
            />
            <button type="button" className="btn" onClick={handleClearRecents}>
              清空最近使用
            </button>
            <button type="button" className="btn text-danger" onClick={handleReset}>
              <TrashIcon className="h-4 w-4" />
              清空全部数据
            </button>
          </div>

          {notice.length > 0 ? (
            <p
              role="status"
              className={`mt-2.5 text-xs ${noticeTone === 'danger' ? 'text-danger' : 'text-success'}`}
            >
              {notice}
            </p>
          ) : null}
        </section>

        <section>
          <h3 className="section-title mb-2">交互</h3>
          <label className="flex cursor-pointer items-center gap-2.5 text-fg-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent-500)]"
              checked={state.settings.showShortcutHints}
              onChange={(event) => onToggleShortcutHints(event.target.checked)}
            />
            在搜索框里显示快捷键提示（<span className="kbd">/</span>）
          </label>
          <p className="mt-2 text-xs text-fg-3">
            一键多开的默认行为：先自动打开 1 个，其余变成可点链接 + 「复制链接」兜底。
            这个策略是刻意的 —— 浏览器弹窗放行数量没有规范保证。
          </p>
        </section>

        <section>
          <h3 className="section-title mb-2">入口地址核对清单</h3>
          <p className="text-xs text-fg-3">
            这些地址是本项目最容易过期的部分。点开核对一遍，然后修改{' '}
            <code className="kbd">src/data/platforms.ts</code> 并更新 lastVerified。
          </p>
          <ul className="mt-2 divide-y divide-[var(--border-subtle)] rounded-md border border-border-subtle">
            {platforms.map((platform) => (
              <li key={platform.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate text-fg-1">{platform.name}</span>
                <a
                  href={platform.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 truncate text-xs text-accent-500 hover:text-accent-400"
                >
                  {platform.host}
                </a>
                <span className="shrink-0 text-[11px] text-fg-3">核对于 {platform.lastVerified}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="section-title mb-2">改密码</h3>
          <p className="text-fg-2">
            重新运行 <code className="kbd">npm run hash-password</code> 并把新哈希写进{' '}
            <code className="kbd">.env.local</code>，然后重启服务。
            会话密钥由密码派生，因此改密码会自动让所有已登录设备失效（这是特性，不是 bug）。
          </p>
        </section>
      </div>
    </Dialog>
  );
}
