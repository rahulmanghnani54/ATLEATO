import { supabase } from '@/lib/supabase';
import type { ClaudeMessage } from './types';

const TIMEOUT_MS = 30_000;

async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out. Please try again.')), TIMEOUT_MS)
  );
  const invokePromise = supabase.functions.invoke(name, { body }).then(({ data, error }) => {
    if (error) throw error;
    return data as T;
  });
  return Promise.race([invokePromise, timeoutPromise]);
}

export interface ChatResponse {
  reply: string;
  persona: string;
}

export async function aiCoachChat(
  persona: string,
  message: string,
  conversationHistory: ClaudeMessage[] = [],
): Promise<ChatResponse> {
  return invokeFunction('ai-coach-chat', { persona, message, conversationHistory });
}

export interface WorkoutAnalysis {
  analysis: string;
  workoutLogId: string;
}

export async function analyzeWorkout(workoutLogId: string): Promise<WorkoutAnalysis> {
  return invokeFunction('analyze-workout', { workoutLogId });
}

export interface NutritionAdviceResponse {
  advice: string;
  date: string;
  totals: { totalCalories: number; totalProtein: number; totalCarbs: number; totalFat: number };
}

export async function getNutritionAdvice(date?: string): Promise<NutritionAdviceResponse> {
  return invokeFunction('nutrition-advice', { date });
}

export interface MealPlanResponse {
  mealPlan: string;
  targets: { calories: number; protein: number; carbs: number; fat: number };
}

export async function generateMealPlan(preferences?: string, mealsPerDay?: number): Promise<MealPlanResponse> {
  return invokeFunction('generate-meal-plan', { preferences, mealsPerDay });
}

export interface FormFeedbackResponse {
  feedback: string;
  exerciseName: string;
  persona: string;
}

export async function getFormFeedback(
  exerciseName: string,
  detectedIssues: string[],
  persona: string,
  angles: Record<string, number>,
): Promise<FormFeedbackResponse> {
  return invokeFunction('form-feedback', { exerciseName, detectedIssues, persona, angles });
}

export interface RecoveryPlanResponse {
  plan: string;
  stats?: { avgScore: number; avgSleep: number; avgStress: number; avgSoreness: number; daysLogged: number };
}

export async function getRecoveryPlan(): Promise<RecoveryPlanResponse> {
  return invokeFunction('recovery-plan', {});
}

export interface WeeklySummaryResponse {
  summary: string;
  stats: {
    workoutCount: number;
    totalVolume: number;
    avgCalories: number;
    avgProtein: number;
    avgRecovery: number;
    avgSleep: number;
    nutritionDays: number;
  };
}

export async function getWeeklySummary(): Promise<WeeklySummaryResponse> {
  return invokeFunction('weekly-summary', {});
}

export interface PhysiqueScores {
  fullness: number;
  leanness: number;
  symmetry: number;
}

export interface PhysiqueSingleResponse extends PhysiqueScores {
  narrative: string;
}

export interface PhysiqueCompareResponse {
  scoresA: PhysiqueScores;
  scoresB: PhysiqueScores;
  narrative: string;
}

export async function analyzePhysiqueSingle(
  persona: string,
  frontImageBase64: string,
  sideImageBase64?: string,
  backImageBase64?: string,
): Promise<PhysiqueSingleResponse> {
  return invokeFunction('analyze-physique', {
    mode: 'single',
    persona,
    frontImageBase64,
    sideImageBase64,
    backImageBase64,
  });
}

export async function analyzePhysiqueCompare(
  persona: string,
  checkinAImages: { front?: string; side?: string; back?: string },
  checkinBImages: { front?: string; side?: string; back?: string },
  checkinADate: string,
  checkinBDate: string,
): Promise<PhysiqueCompareResponse> {
  return invokeFunction('analyze-physique', {
    mode: 'compare',
    persona,
    checkinAImages,
    checkinBImages,
    checkinADate,
    checkinBDate,
  });
}
