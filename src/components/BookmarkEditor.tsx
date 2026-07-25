import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { supabase } from '@/lib/supabase';
import type { Bookmark } from '@/lib/types';

interface BookmarkEditorProps {
  bookmark: Bookmark;
  existingFolders: string[];
  onClose: () => void;
  onSaved: () => void;
}

export function BookmarkEditor({ bookmark, existingFolders, onClose, onSaved }: BookmarkEditorProps) {
  const [folderName, setFolderName] = useState(bookmark.folder_name);
  const [note, setNote] = useState(bookmark.note ?? '');
  const [saving, setSaving] = useState(false);
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [newFolder, setNewFolder] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', handleClick), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  async function handleSave() {
    setSaving(true);
    const folder = showFolderInput && newFolder.trim() ? newFolder.trim() : folderName;
    const { error } = await supabase
      .from('bookmarks')
      .update({ folder_name: folder, note: note.trim() || null })
      .eq('id', bookmark.id);
    setSaving(false);
    if (error) return;
    onSaved();
    onClose();
  }

  return (
    <div ref={ref} className="absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 animate-scaleIn">
      <div className="card p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-sm font-bold text-slate-100">
            <Icon name="Bookmark" className="h-4 w-4 text-brand-400" />
            تعديل المحفوظ
          </h4>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-slate-200">
            <Icon name="X" className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-400">المجلد</label>
            {showFolderInput ? (
              <input
                autoFocus
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                placeholder="اسم المجلد الجديد..."
                className="input text-sm"
              />
            ) : (
              <div className="flex gap-1.5">
                <select
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  className="input text-sm flex-1"
                >
                  {existingFolders.includes(folderName) || (
                    <option value={folderName} className="bg-ink-900">{folderName}</option>
                  )}
                  {existingFolders.map((f) => (
                    <option key={f} value={f} className="bg-ink-900">{f}</option>
                  ))}
                  <option value="عام" className="bg-ink-900">عام</option>
                </select>
                <button
                  onClick={() => setShowFolderInput(true)}
                  className="btn-ghost shrink-0 px-2"
                  title="إنشاء مجلد جديد"
                >
                  <Icon name="Plus" className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-400">ملاحظة شخصية</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="أضف ملاحظة قصيرة..."
              className="input resize-none text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="btn-ghost text-sm">إلغاء</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
              {saving ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Save" className="h-4 w-4" />}
              حفظ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
