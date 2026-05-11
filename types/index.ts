export type Goal = 'lose_fat' | 'build_muscle' | 'maintain' | 'athletic_performance';
export type Gender = 'male' | 'female' | 'other';
export type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extremely_active';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type ExpertPersona = 'arnold' | 'cbum' | 'nippard' | 'ct_fletcher' | 'dr_mike';

export interface UserProfile {
  id: string;
  fullName: string;
  goal: Goal;
  gender: Gender;
  dateOfBirth: string;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  selectedProgram: string;
  tdee: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  onboardingComplete: boolean;
}

export interface NutritionLog {
  id: string;
  userId: string;
  date: string;
  mealType: MealType;
  foodName: string;
  brand?: string;
  barcode?: string;
  servingSizeG: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface WorkoutLog {
  id: string;
  userId: string;
  programId: string;
  workoutName: string;
  date: string;
  startedAt?: string;
  completedAt?: string;
  durationMinutes?: number;
  totalVolumeKg?: number;
  averageRpe?: number;
}

export interface ExerciseSet {
  id: string;
  workoutLogId: string;
  exerciseName: string;
  setNumber: number;
  reps?: number;
  weightKg?: number;
  rpe?: number;
  formScore?: number;
  isWarmup: boolean;
}

export interface RecoveryCheckin {
  id: string;
  userId: string;
  date: string;
  sleepHours: number;
  sleepQuality: number;
  soreness: number;
  energy: number;
  stress: number;
  recoveryScore: number;
  volumeModifier: number;
}

export interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  barcode?: string;
  calories100g: number;
  protein100g: number;
  carbs100g: number;
  fat100g: number;
  fiber100g?: number;
  servingSizeG: number;
}
