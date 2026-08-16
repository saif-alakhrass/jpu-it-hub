import { Icon } from '@/components/Icon';
import type { AdminTab } from '@/pages/AdminPage';

interface AdminTabsProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  pendingTotal: number;
  totalFiles: number;
}

export function AdminTabs({ activeTab, onTabChange, pendingTotal, totalFiles }: AdminTabsProps) {
  return (
    <div className="mb-5 flex gap-2 overflow-x-auto border-b border-white/5">
      <button
        onClick={() => onTabChange('overview')}
        className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold transition ${
          activeTab === 'overview' ? 'border-brand-500 text-brand-300' : 'border-transparent text-slate-400 hover:text-slate-200'
        }`}
      >
        <Icon name="BarChart3" className="h-4 w-4" />
        نظرة عامة
      </button>
      <button
        onClick={() => onTabChange('pending')}
        className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold transition ${
          activeTab === 'pending' ? 'border-accent-500 text-accent-400' : 'border-transparent text-slate-400 hover:text-slate-200'
        }`}
      >
        <Icon name="Clock" className="h-4 w-4" />
        قيد المراجعة ({pendingTotal})
      </button>
      <button
        onClick={() => onTabChange('files')}
        className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold transition ${
          activeTab === 'files' ? 'border-brand-500 text-brand-300' : 'border-transparent text-slate-400 hover:text-slate-200'
        }`}
      >
        <Icon name="FolderCog" className="h-4 w-4" />
        إدارة الملفات ({totalFiles})
      </button>
      <button
        onClick={() => onTabChange('subjects')}
        className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold transition ${
          activeTab === 'subjects' ? 'border-brand-500 text-brand-300' : 'border-transparent text-slate-400 hover:text-slate-200'
        }`}
      >
        <Icon name="BookOpen" className="h-4 w-4" />
        المواد
      </button>
      <button
        onClick={() => onTabChange('users')}
        className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold transition ${
          activeTab === 'users' ? 'border-brand-500 text-brand-300' : 'border-transparent text-slate-400 hover:text-slate-200'
        }`}
      >
        <Icon name="Users" className="h-4 w-4" />
        المستخدمين
      </button>
    </div>
  );
}