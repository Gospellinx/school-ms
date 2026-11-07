import { Activity, BarChart3, BookCheck, BookOpen, Bot, CalendarCheck, CalendarDays, ClipboardList, CreditCard, FileText, Globe, GraduationCap, LayoutDashboard, Library, LifeBuoy, MessageSquare, MonitorCheck, School, Settings, ShieldCheck, Sparkles, Target, UserCog, UserPlus, Users, Wallet, type LucideIcon } from "lucide-react";

export type Role = "super-admin" | "admin" | "teacher" | "student" | "parent";

export interface NavItem { label: string; href: string; icon: LucideIcon }

export interface RoleConfig {
  role: Role;
  title: string;
  menu: NavItem[];
}

const settings = (base: string): NavItem[] => [
  { label: "Account Settings", href: `${base}/settings`, icon: Settings },
  { label: "Help & FAQs", href: `${base}/help`, icon: LifeBuoy },
];

export const roles: Record<Role, RoleConfig> = {
  "super-admin": {
    role: "super-admin",
    title: "Super Admin",
    menu: [
      { label: "Dashboard", href: "/super-admin", icon: LayoutDashboard },
      { label: "Schools", href: "/super-admin/schools", icon: School },
      { label: "Billing", href: "/super-admin/billing", icon: CreditCard },
      { label: "Question Bank", href: "/super-admin/question-bank", icon: Library },
      { label: "Platform Users", href: "/super-admin/users", icon: UserCog },
    ],
  },
  admin: {
    role: "admin",
    title: "School Admin",
    menu: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
      { label: "Live Monitor", href: "/admin/live", icon: Activity },
      { label: "Exam Forecast", href: "/admin/forecast", icon: Target },
      { label: "Admissions", href: "/admin/admissions", icon: UserPlus },
      { label: "Website", href: "/admin/website", icon: Globe },
      { label: "Students", href: "/admin/students", icon: GraduationCap },
      { label: "Staff", href: "/admin/staff", icon: Users },
      { label: "Classes & Subjects", href: "/admin/classes", icon: BookOpen },
      { label: "Results", href: "/admin/results", icon: BarChart3 },
      { label: "Attendance", href: "/admin/attendance", icon: CalendarCheck },
      { label: "Fees", href: "/admin/fees", icon: Wallet },
      { label: "Messages", href: "/admin/messages", icon: MessageSquare },
      { label: "Knowledge Base", href: "/admin/knowledge", icon: Library },
      { label: "Lesson Notes", href: "/admin/lesson-notes", icon: BookCheck },
      { label: "AI Usage & Safety", href: "/admin/ai", icon: ShieldCheck },
    ],
  },
  teacher: {
    role: "teacher",
    title: "Teacher",
    menu: [
      { label: "Dashboard", href: "/teacher", icon: LayoutDashboard },
      { label: "Live Monitor", href: "/teacher/live", icon: Activity },
      { label: "Exam Forecast", href: "/teacher/forecast", icon: Target },
      { label: "My Classes", href: "/teacher/classes", icon: BookOpen },
      { label: "Score Entry", href: "/teacher/scores", icon: ClipboardList },
      { label: "Attendance", href: "/teacher/attendance", icon: CalendarCheck },
      { label: "CBT Tests", href: "/teacher/cbt", icon: MonitorCheck },
      { label: "Teaching Assistant", href: "/teacher/assistant", icon: Sparkles },
      { label: "Lesson Notes", href: "/teacher/lesson-notes", icon: BookCheck },
      { label: "Knowledge Base", href: "/teacher/knowledge", icon: Library },
      { label: "Timetable", href: "/teacher/timetable", icon: CalendarDays },
    ],
  },
  student: {
    role: "student",
    title: "Student",
    menu: [
      { label: "Dashboard", href: "/student", icon: LayoutDashboard },
      { label: "My Subjects", href: "/student/subjects", icon: BookOpen },
      { label: "AI Tutor", href: "/student/tutor", icon: Bot },
      { label: "Exam Prep", href: "/student/prep", icon: Target },
      { label: "CBT Tests", href: "/student/cbt", icon: MonitorCheck },
      { label: "My Results", href: "/student/results", icon: FileText },
      { label: "Timetable", href: "/student/timetable", icon: CalendarDays },
    ],
  },
  parent: {
    role: "parent",
    title: "Parent",
    menu: [
      { label: "Dashboard", href: "/parent", icon: LayoutDashboard },
      { label: "Results", href: "/parent/results", icon: FileText },
      { label: "Exam Forecast", href: "/parent/forecast", icon: Target },
      { label: "Fees & Payments", href: "/parent/fees", icon: Wallet },
      { label: "Attendance", href: "/parent/attendance", icon: CalendarCheck },
      { label: "Messages", href: "/parent/messages", icon: MessageSquare },
    ],
  },
};

export function settingsFor(role: Role) {
  return settings(`/${role}`);
}
