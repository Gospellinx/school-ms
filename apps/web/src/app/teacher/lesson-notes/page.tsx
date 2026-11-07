"use client";
import { PageHeader } from "@/components/shell/page-header";
import { LessonBookPage } from "@/components/pages/lesson-book";

export default function Page() {
  return (
    <>
      <PageHeader title="Lesson Notes" subtitle="Your notes and plans for the term, checked against the scheme of work. Print it for inspection." />
      <LessonBookPage />
    </>
  );
}
