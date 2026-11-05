import { BASIC_SCALE, DEFAULT_COMPONENTS, WAEC_SCALE } from '@school-ms/core';

/** Sections every new school starts with. Schools can rename them or change grading later. */
export const DEFAULT_SECTIONS = [
  { name: 'Nursery', kind: 'nursery', gradingScale: BASIC_SCALE, components: DEFAULT_COMPONENTS, sortOrder: 1 },
  { name: 'Primary', kind: 'primary', gradingScale: BASIC_SCALE, components: DEFAULT_COMPONENTS, sortOrder: 2 },
  { name: 'Junior Secondary', kind: 'junior_secondary', gradingScale: BASIC_SCALE, components: DEFAULT_COMPONENTS, sortOrder: 3 },
  { name: 'Senior Secondary', kind: 'senior_secondary', gradingScale: WAEC_SCALE, components: DEFAULT_COMPONENTS, sortOrder: 4 },
] as const;
