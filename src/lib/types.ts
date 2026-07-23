export type Role = 'admin' | 'trusted' | 'student';
export type FileTab = 'summaries' | 'exams' | 'images' | 'slides';
export type FileStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  full_name: string | null;
  role: Role;
  created_at: string;
}

export interface Subject {
  id: string;
  name: string;
  description: string | null;
  major: string;
  created_by: string;
  created_at: string;
}

export interface FileRow {
  id: string;
  subject_id: string;
  tab: FileTab;
  title: string;
  storage_path: string;
  file_url: string;
  file_type: string | null;
  uploader_id: string;
  status: FileStatus;
  created_at: string;
  uploader?: Profile | null;
  subject?: Subject | null;
}

export const TABS: { key: FileTab; label: string; icon: string }[] = [
  { key: 'summaries', label: 'تلاخيص وشروحات', icon: 'FileText' },
  { key: 'exams', label: 'امتحانات وسنوات سابقة', icon: 'ClipboardList' },
  { key: 'images', label: 'صور ومسودات', icon: 'Image' },
  { key: 'slides', label: 'سلايدات وكتب', icon: 'Presentation' },
];

export const MAJORS = [
  'عام',
  'برمجة وهندسة برمجيات',
  'شبكات وأمن معلومات',
  'ذكاء اصطناعي وعلوم بيانات',
  'أنظمة معلومات',
];
