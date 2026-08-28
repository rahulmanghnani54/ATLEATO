/**
 * TDEE / macros drive every calorie target the app shows. A NaN here renders as
 * an empty ring and a silently broken nutrition tab; a wrong number is advice the
 * user acts on. Known inputs are pinned to hand-computed outputs so a change to
 * the formula has to be deliberate.
 */
import {
  calculateBMR,
  calculateMacros,
  calculateTDEE,
  getAgeFromDOB,
  type ActivityLevel,
  type Goal,
} from '@/lib/tdee';

const ACTIVITY: ActivityLevel[] = [
  'sedentary',
  'lightly_active',
  'moderately_active',
  'very_active',
  'extremely_active',
];

const GOALS: Goal[] = ['lose_fat', 'build_muscle', 'maintain', 'athletic_performance'];

describe('calculateBMR — Mifflin-St Jeor', () => {
  it('male 80kg / 180cm / 30y = 1780', () => {
    // 10*80 + 6.25*180 - 5*30 + 5
    expect(calculateBMR(80, 180, 30, 'male')).toBe(1780);
  });

  it('female 60kg / 165cm / 28y = 1330.25', () => {
    // 10*60 + 6.25*165 - 5*28 - 161
    expect(calculateBMR(60, 165, 28, 'female')).toBeCloseTo(1330.25, 5);
  });

  it('the female constant is 166 kcal below the male one at identical inputs', () => {
    expect(calculateBMR(80, 180, 30, 'male') - calculateBMR(80, 180, 30, 'female')).toBe(166);
  });

  it('rises with weight and height, falls with age', () => {
    const base = calculateBMR(80, 180, 30, 'male');
    expect(calculateBMR(90, 180, 30, 'male')).toBeGreaterThan(base);
    expect(calculateBMR(80, 190, 30, 'male')).toBeGreaterThan(base);
    expect(calculateBMR(80, 180, 40, 'male')).toBeLessThan(base);
  });
});

describe('calculateTDEE', () => {
  it('applies the sedentary multiplier and rounds', () => {
    expect(calculateTDEE(1780, 'sedentary')).toBe(2136); // 1780 * 1.2
  });

  it('applies the moderately-active multiplier and rounds', () => {
    expect(calculateTDEE(1780, 'moderately_active')).toBe(2759); // 1780 * 1.55
  });

  it('is monotonic across the activity scale', () => {
    const values = ACTIVITY.map((a) => calculateTDEE(1780, a));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it('always returns a whole number', () => {
    for (const a of ACTIVITY) expect(Number.isInteger(calculateTDEE(1783.4, a))).toBe(true);
  });
});

describe('calculateMacros — known case', () => {
  it('2759 kcal / lose_fat / 80kg', () => {
    const m = calculateMacros(2759, 'lose_fat', 80);
    expect(m.calories).toBe(2359); // 400 kcal deficit
    expect(m.proteinG).toBe(176); // 2.2 g/kg
    expect(m.fatG).toBe(66); // 25% of calories / 9
    expect(m.carbsG).toBe(265); // remainder / 4
  });

  it('macro grams reconcile with the calorie target for a normal profile', () => {
    const m = calculateMacros(2759, 'lose_fat', 80);
    const fromMacros = m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9;
    expect(Math.abs(fromMacros - m.calories)).toBeLessThanOrEqual(4); // rounding only
  });

  it('goal shifts calories in the documented direction', () => {
    const tdee = 2500;
    expect(calculateMacros(tdee, 'maintain', 80).calories).toBe(2500);
    expect(calculateMacros(tdee, 'lose_fat', 80).calories).toBe(2100);
    expect(calculateMacros(tdee, 'build_muscle', 80).calories).toBe(2700);
    expect(calculateMacros(tdee, 'athletic_performance', 80).calories).toBe(2600);
  });

  it('athletic_performance trades fat for carbs at the same calories', () => {
    const athletic = calculateMacros(2600, 'athletic_performance', 80);
    const maintain = calculateMacros(2600, 'maintain', 80);
    expect(athletic.fatG).toBeLessThan(maintain.fatG);
    expect(athletic.carbsG).toBeGreaterThan(maintain.carbsG);
  });

  it('protein scales with bodyweight', () => {
    expect(calculateMacros(2500, 'maintain', 100).proteinG).toBe(220);
    expect(calculateMacros(2500, 'maintain', 60).proteinG).toBe(132);
  });
});

describe('calculateMacros — floors hold', () => {
  it('never prescribes a starvation target', () => {
    expect(calculateMacros(800, 'lose_fat', 50).calories).toBeGreaterThanOrEqual(1200);
  });

  it('never prescribes below 50g protein or 20g fat, and never negative carbs', () => {
    const m = calculateMacros(600, 'lose_fat', 5);
    expect(m.proteinG).toBeGreaterThanOrEqual(50);
    expect(m.fatG).toBeGreaterThanOrEqual(20);
    expect(m.carbsG).toBeGreaterThanOrEqual(0);
  });
});

describe('boundaries — nothing may render as NaN or Infinity', () => {
  const finiteMacros = (tdee: number, goal: Goal, weight: number) => {
    const m = calculateMacros(tdee, goal, weight);
    for (const v of [m.calories, m.proteinG, m.carbsG, m.fatG]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    return m;
  };

  it('zero weight still yields a finite, non-negative plan', () => {
    const bmr = calculateBMR(0, 180, 30, 'male');
    expect(Number.isFinite(bmr)).toBe(true);
    const tdee = calculateTDEE(bmr, 'sedentary');
    expect(Number.isFinite(tdee)).toBe(true);
    const m = finiteMacros(tdee, 'lose_fat', 0);
    expect(m.calories).toBeGreaterThanOrEqual(1200);
    expect(m.carbsG).toBeGreaterThanOrEqual(0);
  });

  it('zero across the board does not divide by zero', () => {
    const bmr = calculateBMR(0, 0, 0, 'female');
    expect(Number.isFinite(bmr)).toBe(true);
    finiteMacros(calculateTDEE(bmr, 'sedentary'), 'maintain', 0);
  });

  it('an absurd height stays finite rather than overflowing', () => {
    const bmr = calculateBMR(80, 100_000, 30, 'male');
    expect(Number.isFinite(bmr)).toBe(true);
    for (const a of ACTIVITY) expect(Number.isFinite(calculateTDEE(bmr, a))).toBe(true);
    for (const g of GOALS) finiteMacros(calculateTDEE(bmr, 'sedentary'), g, 80);
  });

  it('an absurd weight stays finite', () => {
    const bmr = calculateBMR(100_000, 180, 30, 'male');
    expect(Number.isFinite(bmr)).toBe(true);
    finiteMacros(calculateTDEE(bmr, 'extremely_active'), 'build_muscle', 100_000);
  });

  it('every goal x activity combination is finite for a normal profile', () => {
    const bmr = calculateBMR(72, 170, 34, 'female');
    for (const a of ACTIVITY) {
      for (const g of GOALS) finiteMacros(calculateTDEE(bmr, a), g, 72);
    }
  });
});

describe('getAgeFromDOB', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Local noon, so the assertions cannot straddle a UTC day boundary.
    jest.setSystemTime(new Date(2026, 7, 26, 12, 0, 0));
  });
  afterEach(() => jest.useRealTimers());

  it('counts a birthday that already passed this year', () => {
    expect(getAgeFromDOB('1996-05-01')).toBe(30);
  });

  it('does not count a birthday still to come this year', () => {
    expect(getAgeFromDOB('1996-12-01')).toBe(29);
  });

  it('counts the birthday on the day itself', () => {
    expect(getAgeFromDOB('1996-08-26')).toBe(30);
  });

  it('does not count a birthday one day away', () => {
    expect(getAgeFromDOB('1996-08-27')).toBe(29);
  });

  it('handles a leap-day birth without going fractional', () => {
    expect(Number.isInteger(getAgeFromDOB('2000-02-29'))).toBe(true);
  });
});
