export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_feed: {
        Row: {
          created_at: string
          description: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          created_at: string
          customer_contact: string | null
          customer_id: string | null
          customer_name: string | null
          end_date: string
          forklift_id: string
          id: string
          last_billed_date: string | null
          recurring_billing: boolean
          return_status: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_contact?: string | null
          customer_id?: string | null
          customer_name?: string | null
          end_date: string
          forklift_id: string
          id?: string
          last_billed_date?: string | null
          recurring_billing?: boolean
          return_status?: string | null
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_contact?: string | null
          customer_id?: string | null
          customer_name?: string | null
          end_date?: string
          forklift_id?: string
          id?: string
          last_billed_date?: string | null
          recurring_billing?: boolean
          return_status?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_forklift_id_fkey"
            columns: ["forklift_id"]
            isOneToOne: false
            referencedRelation: "forklifts"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          billing_address: string | null
          company: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          tax_id: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          billing_address?: string | null
          company?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          billing_address?: string | null
          company?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      damage_records: {
        Row: {
          actual_cost: number | null
          booking_id: string | null
          created_at: string
          customer_id: string | null
          description: string
          estimated_cost: number | null
          forklift_id: string
          id: string
          inspection_id: string | null
          invoice_id: string | null
          maintenance_log_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          actual_cost?: number | null
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          description: string
          estimated_cost?: number | null
          forklift_id: string
          id?: string
          inspection_id?: string | null
          invoice_id?: string | null
          maintenance_log_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          actual_cost?: number | null
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          description?: string
          estimated_cost?: number | null
          forklift_id?: string
          id?: string
          inspection_id?: string | null
          invoice_id?: string | null
          maintenance_log_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "damage_records_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_records_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_records_forklift_id_fkey"
            columns: ["forklift_id"]
            isOneToOne: false
            referencedRelation: "forklifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_records_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "return_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_records_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_records_maintenance_log_id_fkey"
            columns: ["maintenance_log_id"]
            isOneToOne: false
            referencedRelation: "maintenance_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          address: string | null
          booking_id: string | null
          completed_at: string | null
          created_at: string
          driver_name: string | null
          driver_phone: string | null
          forklift_id: string
          id: string
          notes: string | null
          scheduled_date: string
          scheduled_time: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          booking_id?: string | null
          completed_at?: string | null
          created_at?: string
          driver_name?: string | null
          driver_phone?: string | null
          forklift_id: string
          id?: string
          notes?: string | null
          scheduled_date: string
          scheduled_time?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          booking_id?: string | null
          completed_at?: string | null
          created_at?: string
          driver_name?: string | null
          driver_phone?: string | null
          forklift_id?: string
          id?: string
          notes?: string | null
          scheduled_date?: string
          scheduled_time?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_forklift_id_fkey"
            columns: ["forklift_id"]
            isOneToOne: false
            referencedRelation: "forklifts"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      equipment_models: {
        Row: {
          created_at: string
          default_capacity_kg: number | null
          default_fuel_type: string
          default_mast_height_m: number | null
          id: string
          manufacturer: string
          model: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_capacity_kg?: number | null
          default_fuel_type?: string
          default_mast_height_m?: number | null
          id?: string
          manufacturer: string
          model: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_capacity_kg?: number | null
          default_fuel_type?: string
          default_mast_height_m?: number | null
          id?: string
          manufacturer?: string
          model?: string
          updated_at?: string
        }
        Relationships: []
      }
      forklifts: {
        Row: {
          capacity_kg: number | null
          created_at: string
          daily_rate: number | null
          fuel_type: string | null
          id: string
          image_url: string | null
          manufacturer: string | null
          mast_height_m: number | null
          model: string
          monthly_rate: number | null
          name: string
          notes: string | null
          serial_number: string | null
          status: string
          updated_at: string
          weekly_rate: number | null
          year: number | null
        }
        Insert: {
          capacity_kg?: number | null
          created_at?: string
          daily_rate?: number | null
          fuel_type?: string | null
          id?: string
          image_url?: string | null
          manufacturer?: string | null
          mast_height_m?: number | null
          model: string
          monthly_rate?: number | null
          name: string
          notes?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
          weekly_rate?: number | null
          year?: number | null
        }
        Update: {
          capacity_kg?: number | null
          created_at?: string
          daily_rate?: number | null
          fuel_type?: string | null
          id?: string
          image_url?: string | null
          manufacturer?: string | null
          mast_height_m?: number | null
          model?: string
          monthly_rate?: number | null
          name?: string
          notes?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
          weekly_rate?: number | null
          year?: number | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          booking_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          due_date: string | null
          id: string
          invoice_number: string
          issued_at: string
          line_items: Json
          notes: string | null
          paid_at: string | null
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          due_date?: string | null
          id?: string
          invoice_number: string
          issued_at?: string
          line_items?: Json
          notes?: string | null
          paid_at?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string
          line_items?: Json
          notes?: string | null
          paid_at?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_logs: {
        Row: {
          cost: number | null
          created_at: string
          description: string | null
          forklift_id: string
          id: string
          next_service_date: string | null
          performed_at: string
          performed_by: string | null
          service_type: string
          updated_at: string
        }
        Insert: {
          cost?: number | null
          created_at?: string
          description?: string | null
          forklift_id: string
          id?: string
          next_service_date?: string | null
          performed_at?: string
          performed_by?: string | null
          service_type: string
          updated_at?: string
        }
        Update: {
          cost?: number | null
          created_at?: string
          description?: string | null
          forklift_id?: string
          id?: string
          next_service_date?: string | null
          performed_at?: string
          performed_by?: string | null
          service_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_logs_forklift_id_fkey"
            columns: ["forklift_id"]
            isOneToOne: false
            referencedRelation: "forklifts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quotes: {
        Row: {
          created_at: string
          customer_id: string | null
          customer_name: string | null
          end_date: string
          forklift_id: string | null
          id: string
          line_items: Json
          notes: string | null
          quote_number: string
          start_date: string
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          end_date: string
          forklift_id?: string | null
          id?: string
          line_items?: Json
          notes?: string | null
          quote_number: string
          start_date: string
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          end_date?: string
          forklift_id?: string | null
          id?: string
          line_items?: Json
          notes?: string | null
          quote_number?: string
          start_date?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_forklift_id_fkey"
            columns: ["forklift_id"]
            isOneToOne: false
            referencedRelation: "forklifts"
            referencedColumns: ["id"]
          },
        ]
      }
      return_inspections: {
        Row: {
          booking_id: string
          condition: string
          created_at: string
          damage_cost: number | null
          damage_notes: string | null
          forklift_id: string
          fuel_level: string | null
          hours_used: number | null
          id: string
          inspected_at: string
          inspected_by: string | null
        }
        Insert: {
          booking_id: string
          condition?: string
          created_at?: string
          damage_cost?: number | null
          damage_notes?: string | null
          forklift_id: string
          fuel_level?: string | null
          hours_used?: number | null
          id?: string
          inspected_at?: string
          inspected_by?: string | null
        }
        Update: {
          booking_id?: string
          condition?: string
          created_at?: string
          damage_cost?: number | null
          damage_notes?: string | null
          forklift_id?: string
          fuel_level?: string | null
          hours_used?: number | null
          id?: string
          inspected_at?: string
          inspected_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_inspections_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_inspections_forklift_id_fkey"
            columns: ["forklift_id"]
            isOneToOne: false
            referencedRelation: "forklifts"
            referencedColumns: ["id"]
          },
        ]
      }
      status_logs: {
        Row: {
          changed_at: string
          forklift_id: string
          from_status: string | null
          id: string
          note: string | null
          to_status: string
        }
        Insert: {
          changed_at?: string
          forklift_id: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status: string
        }
        Update: {
          changed_at?: string
          forklift_id?: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_logs_forklift_id_fkey"
            columns: ["forklift_id"]
            isOneToOne: false
            referencedRelation: "forklifts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_booking: { Args: { p_booking_id: string }; Returns: undefined }
      complete_return_inspection: {
        Args: {
          p_booking_id: string
          p_condition?: string
          p_damage_cost?: number
          p_damage_notes?: string
          p_forklift_id: string
          p_fuel_level?: string
          p_hours_used?: number
          p_inspected_by?: string
        }
        Returns: string
      }
      create_booking: {
        Args: {
          p_customer_contact?: string
          p_customer_id?: string
          p_customer_name?: string
          p_end_date?: string
          p_forklift_id: string
          p_recurring_billing?: boolean
          p_start_date?: string
        }
        Returns: string
      }
      delete_forklift: { Args: { p_forklift_id: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_invoice_number: { Args: never; Returns: string }
      next_quote_number: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "admin" | "dispatcher" | "mechanic"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "dispatcher", "mechanic"],
    },
  },
} as const
