import { supabase } from '@/lib/supabase';
import type { ClaudeMessage } from './types';

async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  return data as T;
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
}

export async function getFormFeedback(
  exerciseName: string,
  detectedIssues: string[],
): Promise<FormFeedbackResponse> {
  return invokeFunction('form-feedback', { exerciseName, detectedIssues });
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
