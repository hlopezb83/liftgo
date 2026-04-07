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
      audit_logs: {
        Row: {
          action: string
          changed_fields: string[] | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          changed_fields?: string[] | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          changed_fields?: string[] | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      booking_extensions: {
        Row: {
          booking_id: string
          created_at: string | null
          id: string
          new_end_date: string
          original_end_date: string
          reason: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string | null
          id?: string
          new_end_date: string
          original_end_date: string
          reason?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string | null
          id?: string
          new_end_date?: string
          original_end_date?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_extensions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booking_number: string
          created_at: string
          customer_contact: string | null
          customer_id: string | null
          customer_name: string | null
          end_date: string
          forklift_id: string
          id: string
          last_billed_date: string | null
          quote_id: string | null
          recurring_billing: boolean
          return_status: string | null
          site_contact_name: string | null
          site_contact_phone: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          booking_number: string
          created_at?: string
          customer_contact?: string | null
          customer_id?: string | null
          customer_name?: string | null
          end_date: string
          forklift_id: string
          id?: string
          last_billed_date?: string | null
          quote_id?: string | null
          recurring_billing?: boolean
          return_status?: string | null
          site_contact_name?: string | null
          site_contact_phone?: string | null
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          booking_number?: string
          created_at?: string
          customer_contact?: string | null
          customer_id?: string | null
          customer_name?: string | null
          end_date?: string
          forklift_id?: string
          id?: string
          last_billed_date?: string | null
          quote_id?: string | null
          recurring_billing?: boolean
          return_status?: string | null
          site_contact_name?: string | null
          site_contact_phone?: string | null
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
          {
            foreignKeyName: "bookings_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_notes: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          invoice_id: string
          next_followup_date: string | null
          note: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          invoice_id: string
          next_followup_date?: string | null
          note: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          invoice_id?: string
          next_followup_date?: string | null
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          created_at: string
          facturapi_mode: string | null
          id: string
          logo_url: string | null
          lugar_expedicion: string
          razon_social: string
          regimen_fiscal: string
          rfc: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          facturapi_mode?: string | null
          id?: string
          logo_url?: string | null
          lugar_expedicion: string
          razon_social: string
          regimen_fiscal: string
          rfc: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          facturapi_mode?: string | null
          id?: string
          logo_url?: string | null
          lugar_expedicion?: string
          razon_social?: string
          regimen_fiscal?: string
          rfc?: string
          updated_at?: string
        }
        Relationships: []
      }
      contract_templates: {
        Row: {
          body_text: string
          checklist_sections: Json | null
          clauses: Json | null
          created_at: string
          declarations_landlord: Json | null
          declarations_tenant: Json | null
          id: string
          intro_text: string | null
          is_default: boolean
          name: string
          pagare_text: string | null
          updated_at: string | null
        }
        Insert: {
          body_text: string
          checklist_sections?: Json | null
          clauses?: Json | null
          created_at?: string
          declarations_landlord?: Json | null
          declarations_tenant?: Json | null
          id?: string
          intro_text?: string | null
          is_default?: boolean
          name: string
          pagare_text?: string | null
          updated_at?: string | null
        }
        Update: {
          body_text?: string
          checklist_sections?: Json | null
          clauses?: Json | null
          created_at?: string
          declarations_landlord?: Json | null
          declarations_tenant?: Json | null
          id?: string
          intro_text?: string | null
          is_default?: boolean
          name?: string
          pagare_text?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      contracts: {
        Row: {
          booking_id: string | null
          contract_city: string | null
          contract_number: string
          created_at: string
          customer_id: string | null
          daily_rate: number | null
          deposit_amount: number | null
          end_date: string | null
          extra_hour_rate: number | null
          forklift_id: string | null
          id: string
          late_interest_rate: number | null
          max_hours_per_month: number | null
          monthly_rate: number | null
          notes: string | null
          payment_frequency: string | null
          signed_at: string | null
          signed_by: string | null
          start_date: string | null
          status: string
          terms_text: string | null
          updated_at: string
          usage_location: string | null
          weekly_rate: number | null
          witness_1: string | null
          witness_2: string | null
        }
        Insert: {
          booking_id?: string | null
          contract_city?: string | null
          contract_number: string
          created_at?: string
          customer_id?: string | null
          daily_rate?: number | null
          deposit_amount?: number | null
          end_date?: string | null
          extra_hour_rate?: number | null
          forklift_id?: string | null
          id?: string
          late_interest_rate?: number | null
          max_hours_per_month?: number | null
          monthly_rate?: number | null
          notes?: string | null
          payment_frequency?: string | null
          signed_at?: string | null
          signed_by?: string | null
          start_date?: string | null
          status?: string
          terms_text?: string | null
          updated_at?: string
          usage_location?: string | null
          weekly_rate?: number | null
          witness_1?: string | null
          witness_2?: string | null
        }
        Update: {
          booking_id?: string | null
          contract_city?: string | null
          contract_number?: string
          created_at?: string
          customer_id?: string | null
          daily_rate?: number | null
          deposit_amount?: number | null
          end_date?: string | null
          extra_hour_rate?: number | null
          forklift_id?: string | null
          id?: string
          late_interest_rate?: number | null
          max_hours_per_month?: number | null
          monthly_rate?: number | null
          notes?: string | null
          payment_frequency?: string | null
          signed_at?: string | null
          signed_by?: string | null
          start_date?: string | null
          status?: string
          terms_text?: string | null
          updated_at?: string
          usage_location?: string | null
          weekly_rate?: number | null
          witness_1?: string | null
          witness_2?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_forklift_id_fkey"
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
          domicilio_fiscal_cp: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          regimen_fiscal: string | null
          representante_legal: string | null
          rfc: string | null
          tax_id: string | null
          updated_at: string
          user_id: string | null
          uso_cfdi: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          billing_address?: string | null
          company?: string | null
          contact_person?: string | null
          created_at?: string
          domicilio_fiscal_cp?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          regimen_fiscal?: string | null
          representante_legal?: string | null
          rfc?: string | null
          tax_id?: string | null
          updated_at?: string
          user_id?: string | null
          uso_cfdi?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          billing_address?: string | null
          company?: string | null
          contact_person?: string | null
          created_at?: string
          domicilio_fiscal_cp?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          regimen_fiscal?: string | null
          representante_legal?: string | null
          rfc?: string | null
          tax_id?: string | null
          updated_at?: string
          user_id?: string | null
          uso_cfdi?: string | null
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
          charged_to_customer: boolean | null
          completed_at: string | null
          created_at: string
          delivery_number: string
          driver_name: string | null
          driver_phone: string | null
          forklift_id: string
          hours_reading: number | null
          id: string
          notes: string | null
          scheduled_date: string
          scheduled_time: string | null
          signature_base64: string | null
          status: string
          transport_cost: number | null
          type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          booking_id?: string | null
          charged_to_customer?: boolean | null
          completed_at?: string | null
          created_at?: string
          delivery_number: string
          driver_name?: string | null
          driver_phone?: string | null
          forklift_id: string
          hours_reading?: number | null
          id?: string
          notes?: string | null
          scheduled_date: string
          scheduled_time?: string | null
          signature_base64?: string | null
          status?: string
          transport_cost?: number | null
          type?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          booking_id?: string | null
          charged_to_customer?: boolean | null
          completed_at?: string | null
          created_at?: string
          delivery_number?: string
          driver_name?: string | null
          driver_phone?: string | null
          forklift_id?: string
          hours_reading?: number | null
          id?: string
          notes?: string | null
          scheduled_date?: string
          scheduled_time?: string | null
          signature_base64?: string | null
          status?: string
          transport_cost?: number | null
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
      drivers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          license_number: string | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          license_number?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          license_number?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      equipment_models: {
        Row: {
          created_at: string
          default_capacity_kg: number | null
          default_daily_rate: number | null
          default_fuel_type: string
          default_mast_height_m: number | null
          default_monthly_rate: number | null
          default_weekly_rate: number | null
          id: string
          manufacturer: string
          model: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_capacity_kg?: number | null
          default_daily_rate?: number | null
          default_fuel_type?: string
          default_mast_height_m?: number | null
          default_monthly_rate?: number | null
          default_weekly_rate?: number | null
          id?: string
          manufacturer: string
          model: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_capacity_kg?: number | null
          default_daily_rate?: number | null
          default_fuel_type?: string
          default_mast_height_m?: number | null
          default_monthly_rate?: number | null
          default_weekly_rate?: number | null
          id?: string
          manufacturer?: string
          model?: string
          updated_at?: string
        }
        Relationships: []
      }
      forklifts: {
        Row: {
          acquisition_cost: number | null
          capacity_kg: number | null
          created_at: string
          daily_rate: number | null
          fuel_type: string | null
          id: string
          image_url: string | null
          insurance_cost: number | null
          insurance_expiry: string | null
          insurance_policy_number: string | null
          insurance_provider: string | null
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
          acquisition_cost?: number | null
          capacity_kg?: number | null
          created_at?: string
          daily_rate?: number | null
          fuel_type?: string | null
          id?: string
          image_url?: string | null
          insurance_cost?: number | null
          insurance_expiry?: string | null
          insurance_policy_number?: string | null
          insurance_provider?: string | null
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
          acquisition_cost?: number | null
          capacity_kg?: number | null
          created_at?: string
          daily_rate?: number | null
          fuel_type?: string | null
          id?: string
          image_url?: string | null
          insurance_cost?: number | null
          insurance_expiry?: string | null
          insurance_policy_number?: string | null
          insurance_provider?: string | null
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
          cancellation_reason: string | null
          cancelled_at: string | null
          cfdi_status: string | null
          cfdi_uuid: string | null
          cfdi_xml: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          due_date: string | null
          facturapi_invoice_id: string | null
          folio: string | null
          forma_pago: string | null
          id: string
          invoice_number: string
          issued_at: string
          line_items: Json
          metodo_pago: string | null
          moneda: string | null
          notes: string | null
          paid_at: string | null
          quote_id: string | null
          receptor_domicilio_fiscal_cp: string | null
          receptor_razon_social: string | null
          receptor_regimen_fiscal: string | null
          receptor_rfc: string | null
          serie: string | null
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          tipo_cambio: number | null
          total: number
          updated_at: string
          uso_cfdi: string | null
        }
        Insert: {
          booking_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cfdi_status?: string | null
          cfdi_uuid?: string | null
          cfdi_xml?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          due_date?: string | null
          facturapi_invoice_id?: string | null
          folio?: string | null
          forma_pago?: string | null
          id?: string
          invoice_number: string
          issued_at?: string
          line_items?: Json
          metodo_pago?: string | null
          moneda?: string | null
          notes?: string | null
          paid_at?: string | null
          quote_id?: string | null
          receptor_domicilio_fiscal_cp?: string | null
          receptor_razon_social?: string | null
          receptor_regimen_fiscal?: string | null
          receptor_rfc?: string | null
          serie?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          tipo_cambio?: number | null
          total?: number
          updated_at?: string
          uso_cfdi?: string | null
        }
        Update: {
          booking_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cfdi_status?: string | null
          cfdi_uuid?: string | null
          cfdi_xml?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          due_date?: string | null
          facturapi_invoice_id?: string | null
          folio?: string | null
          forma_pago?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string
          line_items?: Json
          metodo_pago?: string | null
          moneda?: string | null
          notes?: string | null
          paid_at?: string | null
          quote_id?: string | null
          receptor_domicilio_fiscal_cp?: string | null
          receptor_razon_social?: string | null
          receptor_regimen_fiscal?: string | null
          receptor_rfc?: string | null
          serie?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          tipo_cambio?: number | null
          total?: number
          updated_at?: string
          uso_cfdi?: string | null
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
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
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
          supplier_id: string | null
          updated_at: string
          work_status: string
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
          supplier_id?: string | null
          updated_at?: string
          work_status?: string
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
          supplier_id?: string | null
          updated_at?: string
          work_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_logs_forklift_id_fkey"
            columns: ["forklift_id"]
            isOneToOne: false
            referencedRelation: "forklifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_logs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_parts: {
        Row: {
          cost_at_time: number
          created_at: string
          id: string
          maintenance_log_id: string
          part_id: string
          quantity_used: number
        }
        Insert: {
          cost_at_time?: number
          created_at?: string
          id?: string
          maintenance_log_id: string
          part_id: string
          quantity_used?: number
        }
        Update: {
          cost_at_time?: number
          created_at?: string
          id?: string
          maintenance_log_id?: string
          part_id?: string
          quantity_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_parts_maintenance_log_id_fkey"
            columns: ["maintenance_log_id"]
            isOneToOne: false
            referencedRelation: "maintenance_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_policies: {
        Row: {
          created_at: string
          description: string | null
          forklift_id: string
          id: string
          is_active: boolean
          last_generated_month: string | null
          monthly_cost: number
          provider_name: string
          service_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          forklift_id: string
          id?: string
          is_active?: boolean
          last_generated_month?: string | null
          monthly_cost?: number
          provider_name: string
          service_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          forklift_id?: string
          id?: string
          is_active?: boolean
          last_generated_month?: string | null
          monthly_cost?: number
          provider_name?: string
          service_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_policies_forklift_id_fkey"
            columns: ["forklift_id"]
            isOneToOne: true
            referencedRelation: "forklifts"
            referencedColumns: ["id"]
          },
        ]
      }
      mechanics: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          specialization: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          specialization?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          specialization?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      operating_expenses: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          description: string | null
          expense_date: string
          id: string
          is_recurring: boolean
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          is_recurring?: boolean
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          is_recurring?: boolean
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operating_expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_inventory: {
        Row: {
          category: string
          created_at: string
          id: string
          location: string | null
          min_stock_level: number
          name: string
          sku: string | null
          stock_quantity: number
          unit_cost: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          location?: string | null
          min_stock_level?: number
          name: string
          sku?: string | null
          stock_quantity?: number
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          location?: string | null
          min_stock_level?: number
          name?: string
          sku?: string | null
          stock_quantity?: number
          unit_cost?: number
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
          reference_number: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          reference_number?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prospects: {
        Row: {
          company_name: string
          contact_person: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          deal_value: number | null
          email: string | null
          id: string
          notes: string | null
          phone: string | null
          quote_id: string | null
          stage: string
          stage_order: number | null
          updated_at: string | null
        }
        Insert: {
          company_name: string
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          deal_value?: number | null
          email?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          quote_id?: string | null
          stage?: string
          stage_order?: number | null
          updated_at?: string | null
        }
        Update: {
          company_name?: string
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          deal_value?: number | null
          email?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          quote_id?: string | null
          stage?: string
          stage_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_assigned_forklifts: {
        Row: {
          created_at: string
          forklift_id: string
          id: string
          line_index: number
          quote_id: string
        }
        Insert: {
          created_at?: string
          forklift_id: string
          id?: string
          line_index?: number
          quote_id: string
        }
        Update: {
          created_at?: string
          forklift_id?: string
          id?: string
          line_index?: number
          quote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_assigned_forklifts_forklift_id_fkey"
            columns: ["forklift_id"]
            isOneToOne: true
            referencedRelation: "forklifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_assigned_forklifts_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string
          currency: string
          customer_id: string | null
          customer_name: string | null
          end_date: string | null
          equipment_model_id: string | null
          forklift_id: string | null
          id: string
          line_items: Json
          notes: string | null
          quote_number: string
          quote_type: string
          rental_meta: Json | null
          start_date: string | null
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
          currency?: string
          customer_id?: string | null
          customer_name?: string | null
          end_date?: string | null
          equipment_model_id?: string | null
          forklift_id?: string | null
          id?: string
          line_items?: Json
          notes?: string | null
          quote_number: string
          quote_type?: string
          rental_meta?: Json | null
          start_date?: string | null
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
          currency?: string
          customer_id?: string | null
          customer_name?: string | null
          end_date?: string | null
          equipment_model_id?: string | null
          forklift_id?: string | null
          id?: string
          line_items?: Json
          notes?: string | null
          quote_number?: string
          quote_type?: string
          rental_meta?: Json | null
          start_date?: string | null
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
            foreignKeyName: "quotes_equipment_model_id_fkey"
            columns: ["equipment_model_id"]
            isOneToOne: false
            referencedRelation: "equipment_models"
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
          inspection_number: string
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
          inspection_number: string
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
          inspection_number?: string
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
      role_permissions: {
        Row: {
          access_level: string
          created_at: string
          id: string
          module: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          access_level?: string
          created_at?: string
          id?: string
          module: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          access_level?: string
          created_at?: string
          id?: string
          module?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
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
      suppliers: {
        Row: {
          address: string | null
          category: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          regimen_fiscal: string | null
          rfc: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          regimen_fiscal?: string | null
          rfc?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          regimen_fiscal?: string | null
          rfc?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      user_manual: {
        Row: {
          content: Json
          generated_at: string | null
          id: string
          updated_at: string | null
          version: string
        }
        Insert: {
          content?: Json
          generated_at?: string | null
          id?: string
          updated_at?: string | null
          version?: string
        }
        Update: {
          content?: Json
          generated_at?: string | null
          id?: string
          updated_at?: string | null
          version?: string
        }
        Relationships: []
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
      complete_return_inspection:
        | {
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
        | {
            Args: {
              p_booking_id: string
              p_condition?: string
              p_damage_cost?: number
              p_damage_notes?: string
              p_forklift_id: string
              p_fuel_level?: string
              p_hours_used?: number
              p_inspected_at?: string
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
      get_available_forklifts: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          acquisition_cost: number | null
          capacity_kg: number | null
          created_at: string
          daily_rate: number | null
          fuel_type: string | null
          id: string
          image_url: string | null
          insurance_cost: number | null
          insurance_expiry: string | null
          insurance_policy_number: string | null
          insurance_provider: string | null
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
        }[]
        SetofOptions: {
          from: "*"
          to: "forklifts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_customer_id_for_user: { Args: { p_user_id: string }; Returns: string }
      get_customer_profitability: {
        Args: { p_customer_id: string }
        Returns: Json
      }
      get_dashboard_stats: { Args: never; Returns: Json }
      get_financial_kpis: { Args: never; Returns: Json }
      get_forklift_financials: {
        Args: { p_forklift_id: string }
        Returns: Json
      }
      get_mrr_detail: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_booking_number: { Args: never; Returns: string }
      next_contract_number: { Args: never; Returns: string }
      next_delivery_number: { Args: never; Returns: string }
      next_inspection_number: { Args: never; Returns: string }
      next_invoice_number: { Args: never; Returns: string }
      next_quote_number: { Args: never; Returns: string }
      revert_audit_log: { Args: { p_audit_log_id: string }; Returns: undefined }
    }
    Enums: {
      app_role:
        | "admin"
        | "dispatcher"
        | "mechanic"
        | "customer"
        | "administrativo"
        | "auditor"
        | "ventas"
      expense_category:
        | "renta"
        | "nomina"
        | "software"
        | "depreciacion"
        | "otro"
        | "costo_venta"
        | "caja_chica"
        | "publicidad"
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
      app_role: [
        "admin",
        "dispatcher",
        "mechanic",
        "customer",
        "administrativo",
        "auditor",
        "ventas",
      ],
      expense_category: [
        "renta",
        "nomina",
        "software",
        "depreciacion",
        "otro",
        "costo_venta",
        "caja_chica",
        "publicidad",
      ],
    },
  },
} as const
