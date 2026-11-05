// Demo data only. Nothing here talks to the API yet.

export const school = {
  name: "Linx Demo College",
  motto: "Knowledge, Character, Service",
  address: "Plot 12, Karshi Road, Abuja FCT",
  session: "2025/2026",
  term: "First Term",
  phone: "0803 555 0142",
};

export const subjects = [
  "Mathematics", "English Language", "Physics", "Chemistry", "Biology",
  "Civic Education", "Economics", "Further Mathematics", "Computer Studies",
];

const first = ["Chiamaka", "Tobi", "Aisha", "Emeka", "Fatima", "Ifeoluwa", "Musa", "Ngozi", "David", "Zainab", "Kelechi", "Bolaji", "Hauwa", "Somto", "Temitope", "Yusuf"];
const last = ["Okafor", "Adeyemi", "Bello", "Nwosu", "Abubakar", "Ogunleye", "Ibrahim", "Eze", "Okon", "Lawal", "Obi", "Adebayo", "Danjuma", "Uche", "Afolabi", "Sani"];

export const students = first.map((f, i) => {
  const classes = ["SS 2 Gold", "SS 2 Gold", "SS 3 Gold", "JSS 3 Blue", "SS 1 Gold", "Primary 4"];
  const ca1 = 12 + ((i * 7) % 9);
  const ca2 = 11 + ((i * 5) % 10);
  const exam = 30 + ((i * 11) % 29);
  return {
    id: `LDC/${2021 + (i % 4)}/${String(101 + i).padStart(4, "0")}`,
    name: `${f} ${last[i]}`,
    gender: i % 2 === 0 ? "F" : "M",
    className: classes[i % classes.length]!,
    guardian: `${["Mr.", "Mrs.", "Dr.", "Alhaji"][i % 4]} ${last[i]}`,
    phone: `080${3 + (i % 6)} ${String(400 + i * 13).slice(0, 3)} ${String(1000 + i * 271).slice(0, 4)}`,
    feeStatus: (["Paid", "Part paid", "Owing", "Paid"] as const)[i % 4]!,
    attendance: 82 + ((i * 3) % 17),
    ca1, ca2, exam,
  };
});

export const staff = [
  { name: "Mr. Tunde Bakare", role: "Teacher", subject: "Mathematics", classes: "SS 2, SS 3, JSS 3", phone: "0803 222 1100", status: "Active" },
  { name: "Mrs. Folake Adeyemi", role: "Teacher", subject: "English Language", classes: "SS 1, SS 2", phone: "0805 111 2299", status: "Active" },
  { name: "Mr. Ibrahim Musa", role: "Teacher", subject: "Physics", classes: "SS 1, SS 2, SS 3", phone: "0806 984 1200", status: "Active" },
  { name: "Miss Grace Okon", role: "Class teacher", subject: "Primary 4", classes: "Primary 4", phone: "0809 765 4411", status: "Active" },
  { name: "Dr. Chinedu Obi", role: "Principal", subject: "Chemistry", classes: "SS 3", phone: "0802 333 9090", status: "Active" },
  { name: "Mrs. Hadiza Sani", role: "Bursar", subject: "—", classes: "—", phone: "0817 222 0303", status: "Active" },
  { name: "Mr. Kunle Lawal", role: "Teacher", subject: "Biology", classes: "SS 1, SS 2", phone: "0813 444 7766", status: "On leave" },
];

export const classes = [
  { name: "Nursery 2", section: "Nursery", students: 22, teacher: "Mrs. Joy Uche", subjects: 6 },
  { name: "Primary 4", section: "Primary", students: 31, teacher: "Miss Grace Okon", subjects: 10 },
  { name: "Primary 6", section: "Primary", students: 28, teacher: "Mr. Peter Danjuma", subjects: 10 },
  { name: "JSS 1 Blue", section: "Junior Secondary", students: 34, teacher: "Mrs. Amaka Nwosu", subjects: 14 },
  { name: "JSS 3 Blue", section: "Junior Secondary", students: 30, teacher: "Mr. Tunde Bakare", subjects: 14 },
  { name: "SS 1 Gold", section: "Senior Secondary", students: 27, teacher: "Mrs. Folake Adeyemi", subjects: 10 },
  { name: "SS 2 Gold", section: "Senior Secondary", students: 29, teacher: "Mr. Ibrahim Musa", subjects: 9 },
  { name: "SS 3 Gold", section: "Senior Secondary", students: 25, teacher: "Dr. Chinedu Obi", subjects: 9 },
];

export const schools = [
  { name: "Linx Demo College", city: "Abuja", plan: "Premium", students: 642, status: "Active", mrr: 321000, since: "Sep 2025" },
  { name: "Grace Heights Academy", city: "Abuja", plan: "Standard", students: 410, status: "Active", mrr: 164000, since: "Oct 2025" },
  { name: "Royal Crest Schools", city: "Lagos", plan: "Premium", students: 1120, status: "Active", mrr: 560000, since: "Jan 2026" },
  { name: "Bright Star Int'l School", city: "Port Harcourt", plan: "Standard", students: 385, status: "Trial", mrr: 0, since: "Oct 2026" },
  { name: "Unity Model College", city: "Kaduna", plan: "Basic", students: 290, status: "Active", mrr: 72500, since: "Mar 2026" },
  { name: "Excel Kiddies & College", city: "Lagos", plan: "Standard", students: 512, status: "Overdue", mrr: 204800, since: "Feb 2026" },
  { name: "Hilltop Christian Academy", city: "Jos", plan: "Basic", students: 220, status: "Trial", mrr: 0, since: "Nov 2026" },
  { name: "Al-Ameen Model School", city: "Kano", plan: "Standard", students: 455, status: "Pending", mrr: 0, since: "Nov 2026" },
];

export const feeItems = [
  { item: "Tuition", amount: 185000 },
  { item: "Development levy", amount: 25000 },
  { item: "ICT & CBT", amount: 15000 },
  { item: "Books & stationery", amount: 32000 },
  { item: "PTA levy", amount: 5000 },
];

export const payments = [
  { ref: "PSK-8F21K9", student: "Chiamaka Okafor", amount: 262000, method: "Card", date: "Nov 3, 2026", status: "Successful" },
  { ref: "PSK-7D11Q2", student: "Tobi Adeyemi", amount: 130000, method: "Bank transfer", date: "Nov 2, 2026", status: "Successful" },
  { ref: "PSK-6C90L7", student: "Aisha Bello", amount: 262000, method: "USSD", date: "Nov 1, 2026", status: "Successful" },
  { ref: "PSK-5B33Z1", student: "Emeka Nwosu", amount: 50000, method: "Card", date: "Oct 30, 2026", status: "Failed" },
  { ref: "PSK-4A72M5", student: "Fatima Abubakar", amount: 262000, method: "Bank transfer", date: "Oct 29, 2026", status: "Successful" },
];

export const messages = [
  { title: "Mid-term break notice", channel: "WhatsApp", audience: "All parents", sent: "Nov 4, 2026", delivered: 588, total: 602 },
  { title: "First term fees reminder", channel: "SMS", audience: "Owing parents", sent: "Nov 1, 2026", delivered: 141, total: 146 },
  { title: "PTA meeting, Saturday 10am", channel: "WhatsApp", audience: "All parents", sent: "Oct 28, 2026", delivered: 596, total: 602 },
  { title: "SS 3 mock exam timetable", channel: "SMS", audience: "SS 3 parents", sent: "Oct 25, 2026", delivered: 25, total: 25 },
];

export const schedule = [
  { time: "8:00 am", title: "Mathematics", sub: "SS 2 Gold · Room 4", tone: "brand" },
  { time: "9:20 am", title: "Physics practical", sub: "Lab 2 · Mr. Musa", tone: "orchid" },
  { time: "11:00 am", title: "English Language", sub: "SS 2 Gold · Room 4", tone: "brand" },
  { time: "1:00 pm", title: "CBT: Chemistry mock", sub: "ICT Hall · 40 questions", tone: "amber" },
] as const;

export const events = [
  { date: "Nov 12", title: "Mid-term break begins", tag: "Holiday" },
  { date: "Nov 20", title: "PTA general meeting", tag: "Meeting" },
  { date: "Dec 1", title: "First term exams start", tag: "Exams" },
  { date: "Dec 13", title: "Report cards released", tag: "Results" },
];

export const cbtQuestions = [
  {
    q: "If 2x + 5 = 17, what is the value of x?",
    options: ["5", "6", "7", "11"],
    answer: 1,
    topic: "Linear equations",
  },
  {
    q: "Which of these is a vector quantity?",
    options: ["Mass", "Speed", "Displacement", "Temperature"],
    answer: 2,
    topic: "Scalars and vectors",
  },
  {
    q: "Choose the word nearest in meaning to the underlined word: The man was 'adamant' about his decision.",
    options: ["Unsure", "Firm", "Happy", "Careless"],
    answer: 1,
    topic: "Lexis and structure",
  },
  {
    q: "The pH of a neutral solution at 25°C is",
    options: ["0", "1", "7", "14"],
    answer: 2,
    topic: "Acids, bases and salts",
  },
  {
    q: "Simplify: log₁₀ 1000",
    options: ["2", "3", "10", "100"],
    answer: 1,
    topic: "Logarithms",
  },
];

export const cbtTests = [
  { title: "WAEC Mathematics Mock 3", subject: "Mathematics", questions: 50, minutes: 60, due: "Nov 8", status: "Open", score: null as number | null },
  { title: "Physics: Motion & Forces", subject: "Physics", questions: 30, minutes: 40, due: "Nov 10", status: "Open", score: null },
  { title: "English Lexis Drill", subject: "English Language", questions: 40, minutes: 30, due: "Nov 1", status: "Done", score: 78 },
  { title: "Chemistry: Mole Concept", subject: "Chemistry", questions: 25, minutes: 30, due: "Oct 28", status: "Done", score: 64 },
];

export function grade(total: number) {
  if (total >= 75) return { g: "A1", remark: "Excellent" };
  if (total >= 70) return { g: "B2", remark: "Very good" };
  if (total >= 65) return { g: "B3", remark: "Good" };
  if (total >= 60) return { g: "C4", remark: "Credit" };
  if (total >= 55) return { g: "C5", remark: "Credit" };
  if (total >= 50) return { g: "C6", remark: "Credit" };
  if (total >= 45) return { g: "D7", remark: "Pass" };
  if (total >= 40) return { g: "E8", remark: "Pass" };
  return { g: "F9", remark: "Fail" };
}

export const reportCard = {
  student: "Chiamaka Okafor",
  admission: "LDC/2021/0101",
  className: "SS 2 Gold",
  position: "3rd",
  outOf: 29,
  average: 74.6,
  classAverage: 61.2,
  attendance: { present: 58, total: 62 },
  rows: [
    { subject: "Mathematics", ca1: 18, ca2: 17, exam: 52 },
    { subject: "English Language", ca1: 16, ca2: 15, exam: 44 },
    { subject: "Physics", ca1: 17, ca2: 18, exam: 48 },
    { subject: "Chemistry", ca1: 15, ca2: 14, exam: 41 },
    { subject: "Biology", ca1: 18, ca2: 16, exam: 47 },
    { subject: "Civic Education", ca1: 19, ca2: 18, exam: 50 },
    { subject: "Economics", ca1: 14, ca2: 16, exam: 39 },
    { subject: "Further Mathematics", ca1: 16, ca2: 15, exam: 45 },
    { subject: "Computer Studies", ca1: 19, ca2: 19, exam: 53 },
  ],
  teacherComment: "Chiamaka is focused and hardworking. She should give more time to Economics.",
  principalComment: "A very good result. Keep it up.",
  nextTermBegins: "January 12, 2027",
};
