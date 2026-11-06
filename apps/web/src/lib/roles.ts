import {
  LayoutDashboard, School, CreditCard, Library, LifeBuoy, Settings, Users, GraduationCap, BookOpen,
  ClipboardList, CalendarCheck, Wallet, MessageSquare, FileText, Sparkles, MonitorCheck, CalendarDays,
  UserCog, BarChart3, type LucideIcon,
} from "lucide-react";

export type Role = "super-admin" | "admin" | "teacher" | "student" | "parent";

export interface NavItem { label: string; href: string; icon: LucideIcon; badge?: number }

export interface RoleConfig {
  role: Role;
  title: string;
  user: { name: string; email: string; subtitle: string };
  menu: NavItem[];
  groupLabel: string;
  group: { label: string; tag: string; tone: string }[];
}

const settings = (base: string): NavItem[] => [
  { label: "Account Settings", href: `${base}/settings`, icon: Settings },
  { label: "Help & FAQs", href: `${base}/help`, icon: LifeBuoy },
];

export const roles: Record<Role, RoleConfig> = {
  "super-admin": {
    role: "super-admin",
    title: "Super Admin",
    user: { name: "Gospel Ocheni", email: "gospel@linxschool.ng", subtitle: "Super admin" },
    menu: [
      { label: "Dashboard", href: "/super-admin", icon: LayoutDashboard },
      { label: "Schools", href: "/super-admin/schools", icon: School, badge: 3 },
      { label: "Billing", href: "/super-admin/billing", icon: CreditCard },
      { label: "Question Bank", href: "/super-admin/question-bank", icon: Library },
      { label: "Platform Users", href: "/super-admin/users", icon: UserCog },
    ],
    groupLabel: "Regions",
    group: [
      { label: "FCT Abuja", tag: "AB", tone: "bg-brand-600" },
      { label: "Lagos", tag: "LA", tone: "bg-orange-500" },
      { label: "Rivers", tag: "RV", tone: "bg-emerald-500" },
    ],
  },
  admin: {
    role: "admin",
    title: "School Admin",
    user: { name: "Mrs. Ngozi Eze", email: "admin@linxdemo.sch.ng", subtitle: "School admin" },
    menu: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
      { label: "Students", href: "/admin/students", icon: GraduationCap },
      { label: "Staff", href: "/admin/staff", icon: Users },
      { label: "Classes & Subjects", href: "/admin/classes", icon: BookOpen },
      { label: "Results", href: "/admin/results", icon: BarChart3, badge: 2 },
      { label: "Attendance", href: "/admin/attendance", icon: CalendarCheck },
      { label: "Fees", href: "/admin/fees", icon: Wallet },
      { label: "Messages", href: "/admin/messages", icon: MessageSquare },
    ],
    groupLabel: "Sections",
    group: [
      { label: "Nursery", tag: "NU", tone: "bg-orchid-400" },
      { label: "Primary", tag: "PR", tone: "bg-orange-500" },
      { label: "Junior Secondary", tag: "JS", tone: "bg-emerald-500" },
      { label: "Senior Secondary", tag: "SS", tone: "bg-brand-600" },
    ],
  },
  teacher: {
    role: "teacher",
    title: "Teacher",
    user: { name: "Mr. Tunde Bakare", email: "t.bakare@linxdemo.sch.ng", subtitle: "Mathematics teacher" },
    menu: [
      { label: "Dashboard", href: "/teacher", icon: LayoutDashboard },
      { label: "My Classes", href: "/teacher/classes", icon: BookOpen },
      { label: "Score Entry", href: "/teacher/scores", icon: ClipboardList, badge: 2 },
      { label: "Attendance", href: "/teacher/attendance", icon: CalendarCheck },
      { label: "CBT Tests", href: "/teacher/cbt", icon: MonitorCheck },
      { label: "Timetable", href: "/teacher/timetable", icon: CalendarDays },
    ],
    groupLabel: "My Classes",
    group: [
      { label: "SS 2 Gold", tag: "S2", tone: "bg-brand-600" },
      { label: "SS 3 Gold", tag: "S3", tone: "bg-orange-500" },
      { label: "JSS 3 Blue", tag: "J3", tone: "bg-emerald-500" },
    ],
  },
  student: {
    role: "student",
    title: "Student",
    user: { name: "Chiamaka Okafor", email: "chiamaka.o@linxdemo.sch.ng", subtitle: "SS 2 Gold" },
    menu: [
      { label: "Dashboard", href: "/student", icon: LayoutDashboard },
      { label: "My Subjects", href: "/student/subjects", icon: BookOpen, badge: 2 },
      { label: "AI Exam Prep", href: "/student/prep", icon: Sparkles },
      { label: "CBT Tests", href: "/student/cbt", icon: MonitorCheck },
      { label: "My Results", href: "/student/results", icon: FileText },
      { label: "Timetable", href: "/student/timetable", icon: CalendarDays },
    ],
    groupLabel: "Study Groups",
    group: [
      { label: "Physics Squad", tag: "PH", tone: "bg-brand-600" },
      { label: "WAEC Maths Club", tag: "MA", tone: "bg-orange-500" },
    ],
  },
  parent: {
    role: "parent",
    title: "Parent",
    user: { name: "Mr. Emeka Okafor", email: "emeka.okafor@gmail.com", subtitle: "Parent · 2 children" },
    menu: [
      { label: "Dashboard", href: "/parent", icon: LayoutDashboard },
      { label: "Results", href: "/parent/results", icon: FileText, badge: 1 },
      { label: "Fees & Payments", href: "/parent/fees", icon: Wallet },
      { label: "Attendance", href: "/parent/attendance", icon: CalendarCheck },
      { label: "Messages", href: "/parent/messages", icon: MessageSquare },
    ],
    groupLabel: "My Children",
    group: [
      { label: "Chiamaka · SS 2 Gold", tag: "CO", tone: "bg-brand-600" },
      { label: "Obinna · Primary 4", tag: "OO", tone: "bg-orange-500" },
    ],
  },
};

export function settingsFor(role: Role) {
  return settings(role === "super-admin" ? "/super-admin" : `/${role}`);
}

export const roleOrder: Role[] = ["super-admin", "admin", "teacher", "student", "parent"];
