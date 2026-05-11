export type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extremely_active';
export type Goal = 'lose_fat' | 'build_muscle' | 'maintain' | 'athletic_performance';

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extremely_active: 1.9,
};

export function calculateBMR(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  gender: 'male' | 'female'
): number {
  // Mifflin-St Jeor formula
  if (gender === 'male') return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + 5;
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears - 161;
}

export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);
}

export function calculateMacros(tdee: number, goal: Goal, weightKg: number) {
  const adjustedCalories =
    goal === 'lose_fat' ? tdee - 400
    : goal === 'build_muscle' ? tdee + 200
    : goal === 'athletic_performance' ? tdee + 100
    : tdee; // maintain

  const proteinG = Math.round(weightKg * 2.2);

  // Athletic performance gets higher carb allocation (50% vs 25% fat split)
  const fatPct = goal === 'athletic_performance' ? 0.20 : 0.25;
  const fatG = Math.round((adjustedCalories * fatPct) / 9);
  const carbsG = Math.round((adjustedCalories - proteinG * 4 - fatG * 9) / 4);

  return {
    calories: Math.max(adjustedCalories, 1200),
    proteinG: Math.max(proteinG, 50),
    carbsG: Math.max(carbsG, 0),
    fatG: Math.max(fatG, 20),
  };
}

export function getAgeFromDOB(dob: string): number {
  const [y, m, d] = dob.split('-').map(Number);
  const birth = new Date(y, m - 1, d); // local time, avoids UTC midnight timezone shift
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
