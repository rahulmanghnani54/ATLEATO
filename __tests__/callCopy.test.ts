/**
 * The coach-call copy used to live in three hand-maintained tables
 * (coachCallScheduler, notifeeCallScheduler, scarcityEngine). They drifted:
 * different casing for the same coach, and one body missing a clause. The
 * settings preview and the notification that actually rang disagreed.
 *
 * These assertions fail if anyone reintroduces a second source of truth.
 */
import { getCallCopy, incomingCallTitle } from '@/lib/coachCallScheduler';
import { getPersona, type PersonaId } from '@/lib/personaTheme';

const PERSONA_IDS: PersonaId[] = ['cbum', 'arnold', 'nippard', 'ct_fletcher', 'dr_mike'];

describe('coach call copy', () => {
  it('titles every persona from personaTheme.shortName, in one casing', () => {
    for (const id of PERSONA_IDS) {
      const persona = getPersona(id);
      for (const kind of ['wakeup', 'workout'] as const) {
        expect(getCallCopy(persona, kind).title).toBe(incomingCallTitle(persona));
        expect(getCallCopy(persona, kind).title).toContain(persona.shortName);
      }
    }
  });

  it('gives every persona a non-empty, distinct body per call kind', () => {
    for (const id of PERSONA_IDS) {
      const persona = getPersona(id);
      const wake = getCallCopy(persona, 'wakeup').body;
      const work = getCallCopy(persona, 'workout').body;
      expect(wake.length).toBeGreaterThan(0);
      expect(work.length).toBeGreaterThan(0);
      // A persona falling through to the cbum default would make these equal.
      expect(wake).not.toBe(work);
    }
  });
});
