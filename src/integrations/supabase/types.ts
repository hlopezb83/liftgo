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
      bookings: {
        Row: {
          created_at: string
          customer_contact: string | null
          customer_id: string | null
          customer_name: string | null
          end_date: string
          forklift_id: string
          id: string
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
          company: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      next_invoice_number: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
