/**
 * Build a YouTube search URL for an exercise demonstration by a specific pro.
 *
 * Using a search URL (not a fixed video ID) means:
 * - No broken links when YouTube takes a video down
 * - Top results are always relevant — YouTube's algorithm surfaces the best
 *   match for "CBUM incline dumbbell press form" etc.
 * - We don't have to manually source and verify 100+ video IDs
 *
 * @example
 *   getProDemoUrl('Incline Dumbbell Press', 'cbum')
 *   // → "https://www.youtube.com/results?search_query=CBUM+Incline+Dumbbell+Press+form"
 */

const PRO_SEARCH_NAME: Record<string, string> = {
  cbum:        'Chris Bumstead',
  arnold:      'Arnold Schwarzenegger',
  nippard:     'Jeff Nippard',
  ct_fletcher: 'CT Fletcher',
  dr_mike:     'Dr Mike Israetel',
};

const PRO_DISPLAY: Record<string, string> = {
  cbum:        'CBUM',
  arnold:      'ARNOLD',
  nippard:     'NIPPARD',
  ct_fletcher: 'CT',
  dr_mike:     'DR MIKE',
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
  const pro = PRO_SEARCH_NAME[persona] ?? 'Jeff Nippard'; // safe default: evidence-based coach
  const query = encodeURIComponent(`${pro} ${exerciseName} form technique`);
  return `https://www.youtube.com/results?search_query=${query}`;
}

/** Short display label for the demo button — e.g. "WATCH CBUM DEMO". */
export function getProDemoLabel(persona: string): string {
  const display = PRO_DISPLAY[persona] ?? 'PRO';
  return `WATCH ${display} DEMO`;
}
