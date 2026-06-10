/**
 * Build a YouTube search URL for an exercise demonstration by a specific pro.
 *
 * Using a search URL (not a fixed video ID) means:
 * - No broken links when YouTube takes a video down
 * - Top results are always relevant — YouTube's algorithm surfaces the best
 *   match for "THE SCULPTOR incline dumbbell press form" etc.
 * - We don't have to manually source and verify 100+ video IDs
 *
 * @example
 *   getProDemoUrl('Incline Dumbbell Press', 'cbum')
 *   // → "https://www.youtube.com/results?search_query=THE SCULPTOR+Incline+Dumbbell+Press+form"
 */

const PRO_SEARCH_NAME: Record<string, string> = {
  cbum:        'The Sculptor',
  arnold:      'The Monument',
  nippard:     'The Analyst',
  ct_fletcher: 'The Commander',
  dr_mike:     'The Architect',
};

const PRO_DISPLAY: Record<string, string> = {
  cbum:        'THE SCULPTOR',
  arnold:      'THE MONUMENT',
  nippard:     'THE ANALYST',
  ct_fletcher: 'CT',
  dr_mike:     'THE ARCHITECT',
};

/** Map any program-id (e.g. "cbum_evolved", "dr_mike_mav") to a persona key. */
export function programIdToPersona(programId: string | null | undefined): string {
  const pid = (programId ?? '').toLowerCase();
  if (pid.startsWith('cbum'))        return 'cbum';
  if (pid.startsWith('arnold'))      return 'arnold';
  if (pid.startsWith('nippard'))     return 'nippard';
  if (pid.startsWith('ct_fletcher') || pid.startsWith('ct_')) return 'ct_fletcher';
  if (pid.startsWith('dr_mike'))     return 'dr_mike';
  return 'cbum';
}

/** Build a YouTube search URL for "<Pro's full name> <exercise> form". */
export function getProDemoUrl(exerciseName: string, persona: string): string {
  const pro = PRO_SEARCH_NAME[persona] ?? 'The Analyst'; // safe default: evidence-based coach
  const query = encodeURIComponent(`${pro} ${exerciseName} form technique`);
  return `https://www.youtube.com/results?search_query=${query}`;
}

/** Short display label for the demo button — e.g. "WATCH THE SCULPTOR DEMO". */
export function getProDemoLabel(persona: string): string {
  const display = PRO_DISPLAY[persona] ?? 'PRO';
  return `WATCH ${display} DEMO`;
}
