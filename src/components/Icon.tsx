import {
  FileText, ClipboardList, Image as ImageIcon, Presentation,
  Search, Plus, Upload, Check, X, Trash2, Shield, ShieldCheck,
  GraduationCap, Menu, LogOut, Home, ChevronLeft, File, Download,
  Clock, AlertCircle, Eye, UserCog, ArrowLeft, Loader2, BookOpen,
  Filter, Sparkles, Users, FolderOpen, Lock,
  Telescope, Rocket, Gift, Target, Layers, Zap, Quote, Code,
  Github, Linkedin, Mail, User, Info,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const map: Record<string, LucideIcon> = {
  FileText, ClipboardList, Image: ImageIcon, Presentation,
  Search, Plus, Upload, Check, X, Trash2, Shield, ShieldCheck,
  GraduationCap, Menu, LogOut, Home, ChevronLeft, File, Download,
  Clock, AlertCircle, Eye, UserCog, ArrowLeft, Loader2, BookOpen,
  Filter, Sparkles, Users, FolderOpen, Lock,
  Telescope, Rocket, Gift, Target, Layers, Zap, Quote, Code,
  Github, Linkedin, Mail, User, Info,
};

export function Icon({ name, className }: { name: string; className?: string }) {
  const C = map[name] ?? File;
  return <C className={className} />;
}
