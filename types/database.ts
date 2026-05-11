export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          avatar_url: string | null;
          goal: 'lose_fat' | 'build_muscle' | 'maintain' | 'athletic_performance';
          gender: 'male' | 'female' | 'other' | null;
          date_of_birth: string | null;
          height_cm: number | null;
          weight_kg: number | null;
          activity_level: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extremely_active';
          selected_program: string;
          tdee: number | null;
          protein_g: number | null;
          carbs_g: number | null;
          fat_g: number | null;
          onboarding_complete: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      recovery_checkins: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          sleep_hours: number | null;
          sleep_quality: number | null;
          soreness: number | null;
          energy: number | null;
          stress: number | null;
          recovery_score: number | null;
          volume_modifier: number;
          notes: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['recovery_checkins']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['recovery_checkins']['Insert']>;
      };
      nutrition_logs: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
          food_name: string;
          brand: string | null;
          barcode: string | null;
          serving_size_g: number | null;
          calories: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          fiber_g: number | null;
          sugar_g: number | null;
          sodium_mg: number | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['nutrition_logs']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['nutrition_logs']['Insert']>;
      };
      water_logs: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          amount_ml: number;
          logged_at: string;
        };
        Insert: Omit<Database['public']['Tables']['water_logs']['Row'], 'id' | 'logged_at'> & {
          id?: string;
          logged_at?: string;
        };
        Update: Partial<Database['public']['Tables']['water_logs']['Insert']>;
      };
      workout_logs: {
        Row: {
          id: string;
          user_id: string;
          program_id: string;
          workout_name: string;
          date: string;
          started_at: string | null;
          completed_at: string | null;
          duration_minutes: number | null;
          total_volume_kg: number | null;
          average_rpe: number | null;
          notes: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['workout_logs']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['workout_logs']['Insert']>;
      };
      exercise_sets: {
        Row: {
          id: string;
          workout_log_id: string;
          user_id: string;
          exercise_name: string;
          set_number: number;
          reps: number | null;
          weight_kg: number | null;
          rpe: number | null;
          form_score: number | null;
          is_warmup: boolean;
          completed_at: string;
        };
        Insert: Omit<Database['public']['Tables']['exercise_sets']['Row'], 'id' | 'completed_at'> & {
          id?: string;
          completed_at?: string;
        };
        Update: Partial<Database['public']['Tables']['exercise_sets']['Insert']>;
      };
      measurements: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          weight_kg: number | null;
          body_fat_pct: number | null;
          chest_cm: number | null;
          waist_cm: number | null;
          hips_cm: number | null;
          arms_cm: number | null;
          thighs_cm: number | null;
          photo_url: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['measurements']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['measurements']['Insert']>;
      };
      personal_records: {
        Row: {
          id: string;
          user_id: string;
          exercise_name: string;
          weight_kg: number;
          reps: number;
          one_rep_max_kg: number | null;
          achieved_at: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['personal_records']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['personal_records']['Insert']>;
      };
      progression_suggestions: {
        Row: {
          id: string;
          user_id: string;
          exercise_name: string;
          current_weight_kg: number | null;
          suggested_weight_kg: number | null;
          reasoning: string | null;
          applied: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['progression_suggestions']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['progression_suggestions']['Insert']>;
      };
      user_achievements: {
        Row: {
          id: string;
          user_id: string;
          achievement_key: string;
          achieved_at: string;
        };
        Insert: Omit<Database['public']['Tables']['user_achievements']['Row'], 'id' | 'achieved_at'> & {
          id?: string;
          achieved_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_achievements']['Insert']>;
      };
      chat_messages: {
        Row: {
          id: string;
          user_id: string;
          persona: string;
          role: 'user' | 'assistant';
          content: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['chat_messages']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['chat_messages']['Insert']>;
      };
      wearable_data: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          steps: number | null;
          hrv_ms: number | null;
          resting_hr: number | null;
          sleep_hours: number | null;
          active_calories: number | null;
          source: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['wearable_data']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['wearable_data']['Insert']>;
      };
      form_sessions: {
        Row: {
          id: string;
          user_id: string;
          exercise_name: string;
          duration_seconds: number | null;
          average_form_score: number | null;
          key_issues: string[] | null;
          video_url: string | null;
          thumbnail_url: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['form_sessions']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['form_sessions']['Insert']>;
      };
    };
  };
}
