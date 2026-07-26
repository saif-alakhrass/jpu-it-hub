export type Role = 'admin' | 'trusted' | 'student';
export type FileTab = 'summaries' | 'exams' | 'images' | 'slides';
export type FileStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  full_name: string | null;
  role: Role;
  created_at: string;
  academic_year: string | null;
  department: string | null;
  credit_hours: number | null;
  bio: string | null;
}

export interface Subject {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  major: string;
  departments: string[];
  created_by: string | null;
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
  file_size: number | null;
  uploader_id: string;
  status: FileStatus;
  created_at: string;
  batch_id: string | null;
  uploader?: Profile | null;
  subject?: Subject | null;
}

export interface FileBatch {
  id: string;
  subject_id: string;
  tab: FileTab;
  title: string;
  uploader_id: string;
  status: FileStatus;
  file_count: number;
  created_at: string;
  files?: FileRow[];
  uploader?: Profile | null;
}

export const TABS: { key: FileTab; label: string; icon: string }[] = [
  { key: 'summaries', label: 'تلاخيص وشروحات', icon: 'FileText' },
  { key: 'exams', label: 'امتحانات وسنوات سابقة', icon: 'ClipboardList' },
  { key: 'images', label: 'صور ومسودات', icon: 'Image' },
  { key: 'slides', label: 'سلايدات وكتب', icon: 'Presentation' },
];

export const MAJORS = [
  'علم الحاسوب',
  'الأمن السيبراني',
];

export const ACADEMIC_YEARS = [
  'السنة الأولى',
  'السنة الثانية',
  'السنة الثالثة',
  'السنة الرابعة',
  'السنة الخامسة',
];

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  image_url: string;
  bio: string | null;
  sort_order: number;
  created_at: string;
}

export interface Bookmark {
  id: string;
  user_id: string;
  resource_id: string;
  folder_name: string;
  note: string | null;
  created_at: string;
}

export interface BookmarkWithFile extends Bookmark {
  file: FileRow | null;
}
