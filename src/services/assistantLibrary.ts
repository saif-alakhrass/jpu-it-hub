import { supabase } from '@/lib/supabase';
import { getVisibleTabs, type Role, type FileTab } from '@/lib/types';

export async function fetchAssistantLibraryCounts(
  subjectId: string,
  role: Role | null,
) {
  const tabs = getVisibleTabs(role).filter((t) => t.key !== 'images');
  const entries = await Promise.all(
    tabs.map(async (tab) => {
      const { count, error } = await supabase
        .from('files')
        .select('id', { count: 'exact', head: true })
        .eq('subject_id', subjectId)
        .eq('status', 'approved')
        .eq('tab', tab.key);
      if (error) throw error;
      return [tab.key, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as Partial<Record<FileTab, number>>;
}
