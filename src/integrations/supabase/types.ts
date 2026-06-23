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
          actor_id: string | null
          actor_name: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          created_at: string
          description: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          is_e2e: boolean
          title: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string
          description?: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          is_e2e?: boolean
          title: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string
          description?: string | null
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          is_e2e?: boolean
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
      bank_accounts: {
        Row: {
          account_holder: string | null
          account_number: string | null
          bank: string
          clabe: string | null
          created_at: string
          currency: string
          id: string
          initial_balance: number
          is_active: boolean
          is_default_collection: boolean
          last4: string | null
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          account_holder?: string | null
          account_number?: string | null
          bank: string
          clabe?: string | null
          created_at?: string
          currency?: string
          id?: string
          initial_balance?: number
          is_active?: boolean
          is_default_collection?: boolean
          last4?: string | null
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          account_holder?: string | null
          account_number?: string | null
          bank?: string
          clabe?: string | null
          created_at?: string
          currency?: string
          id?: string
          initial_balance?: number
          is_active?: boolean
          is_default_collection?: boolean
          last4?: string | null
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bank_statement_imports: {
        Row: {
          bank_account_id: string
          created_at: string
          file_name: string
          id: string
          imported_by: string | null
          lines_count: number
          period_end: string | null
          period_start: string | null
        }
        Insert: {
          bank_account_id: string
          created_at?: string
          file_name: string
          id?: string
          imported_by?: string | null
          lines_count?: number
          period_end?: string | null
          period_start?: string | null
        }
        Update: {
          bank_account_id?: string
          created_at?: string
          file_name?: string
          id?: string
          imported_by?: string | null
          lines_count?: number
          period_end?: string | null
          period_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_imports_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_lines: {
        Row: {
          bank_account_id: string
          created_at: string
          description: string
          hash: string
          id: string
          ignored_reason: string | null
          import_id: string
          match_score: number | null
          matched_at: string | null
          matched_by: string | null
          matched_payment_id: string | null
          matched_supplier_payment_id: string | null
          posted_date: string
          reference: string | null
          signed_amount: number
          status: Database["public"]["Enums"]["bank_line_status"]
          suggested_payment_id: string | null
          suggested_supplier_payment_id: string | null
          updated_at: string
        }
        Insert: {
          bank_account_id: string
          created_at?: string
          description?: string
          hash: string
          id?: string
          ignored_reason?: string | null
          import_id: string
          match_score?: number | null
          matched_at?: string | null
          matched_by?: string | null
          matched_payment_id?: string | null
          matched_supplier_payment_id?: string | null
          posted_date: string
          reference?: string | null
          signed_amount: number
          status?: Database["public"]["Enums"]["bank_line_status"]
          suggested_payment_id?: string | null
          suggested_supplier_payment_id?: string | null
          updated_at?: string
        }
        Update: {
          bank_account_id?: string
          created_at?: string
          description?: string
          hash?: string
          id?: string
          ignored_reason?: string | null
          import_id?: string
          match_score?: number | null
          matched_at?: string | null
          matched_by?: string | null
          matched_payment_id?: string | null
          matched_supplier_payment_id?: string | null
          posted_date?: string
          reference?: string | null
          signed_amount?: number
          status?: Database["public"]["Enums"]["bank_line_status"]
          suggested_payment_id?: string | null
          suggested_supplier_payment_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_lines_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_matched_payment_id_fkey"
            columns: ["matched_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_matched_supplier_payment_id_fkey"
            columns: ["matched_supplier_payment_id"]
            isOneToOne: false
            referencedRelation: "supplier_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_suggested_payment_id_fkey"
            columns: ["suggested_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_suggested_supplier_payment_id_fkey"
            columns: ["suggested_supplier_payment_id"]
            isOneToOne: false
            referencedRelation: "supplier_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_secrets: {
        Row: {
          created_at: string
          facturapi_live_key: string | null
          facturapi_test_key: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          facturapi_live_key?: string | null
          facturapi_test_key?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          facturapi_live_key?: string | null
          facturapi_test_key?: string | null
          id?: string
          updated_at?: string
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
          e2e_scope: string | null
          end_date: string
          forklift_id: string
          id: string
          is_e2e: boolean
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
          e2e_scope?: string | null
          end_date: string
          forklift_id: string
          id?: string
          is_e2e?: boolean
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
          e2e_scope?: string | null
          end_date?: string
          forklift_id?: string
          id?: string
          is_e2e?: boolean
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
          {
            foreignKeyName: "collection_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoices_with_balance"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_reminders_log: {
        Row: {
          email_status: string | null
          error_message: string | null
          id: string
          invoice_id: string
          recipient_email: string
          reminder_type: string
          sent_at: string
        }
        Insert: {
          email_status?: string | null
          error_message?: string | null
          id?: string
          invoice_id: string
          recipient_email: string
          reminder_type: string
          sent_at?: string
        }
        Update: {
          email_status?: string | null
          error_message?: string | null
          id?: string
          invoice_id?: string
          recipient_email?: string
          reminder_type?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_reminders_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_reminders_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoices_with_balance"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          allow_e2e_seed: boolean
          cash_initial_balance: number
          cash_safety_buffer: number
          created_at: string
          cxp_approval_threshold_mxn: number
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
          allow_e2e_seed?: boolean
          cash_initial_balance?: number
          cash_safety_buffer?: number
          created_at?: string
          cxp_approval_threshold_mxn?: number
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
          allow_e2e_seed?: boolean
          cash_initial_balance?: number
          cash_safety_buffer?: number
          created_at?: string
          cxp_approval_threshold_mxn?: number
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
      credit_notes: {
        Row: {
          cancellation_motive: string | null
          cancellation_reason: string | null
          cancellation_status: string
          cancelled_at: string | null
          cfdi_error_message: string | null
          cfdi_pdf_url: string | null
          cfdi_status: string
          cfdi_uuid: string | null
          cfdi_xml_url: string | null
          created_at: string
          created_by: string | null
          credit_note_number: string
          currency: string
          customer_id: string | null
          facturapi_invoice_id: string | null
          id: string
          invoice_id: string
          issued_at: string
          line_items: Json
          motive: string
          reason_text: string
          status: string
          substitution_uuid: string | null
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          updated_at: string
        }
        Insert: {
          cancellation_motive?: string | null
          cancellation_reason?: string | null
          cancellation_status?: string
          cancelled_at?: string | null
          cfdi_error_message?: string | null
          cfdi_pdf_url?: string | null
          cfdi_status?: string
          cfdi_uuid?: string | null
          cfdi_xml_url?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_number: string
          currency?: string
          customer_id?: string | null
          facturapi_invoice_id?: string | null
          id?: string
          invoice_id: string
          issued_at?: string
          line_items?: Json
          motive: string
          reason_text: string
          status?: string
          substitution_uuid?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Update: {
          cancellation_motive?: string | null
          cancellation_reason?: string | null
          cancellation_status?: string
          cancelled_at?: string | null
          cfdi_error_message?: string | null
          cfdi_pdf_url?: string | null
          cfdi_status?: string
          cfdi_uuid?: string | null
          cfdi_xml_url?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_number?: string
          currency?: string
          customer_id?: string | null
          facturapi_invoice_id?: string | null
          id?: string
          invoice_id?: string
          issued_at?: string
          line_items?: Json
          motive?: string
          reason_text?: string
          status?: string
          substitution_uuid?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoices_with_balance"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payment_intents: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          invoice_id: string
          proof_url: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sender_bank: string | null
          sender_last4: string | null
          status: Database["public"]["Enums"]["payment_intent_status"]
          tracking_key: string | null
          transfer_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          invoice_id: string
          proof_url?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_bank?: string | null
          sender_last4?: string | null
          status?: Database["public"]["Enums"]["payment_intent_status"]
          tracking_key?: string | null
          transfer_date: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          invoice_id?: string
          proof_url?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_bank?: string | null
          sender_last4?: string | null
          status?: Database["public"]["Enums"]["payment_intent_status"]
          tracking_key?: string | null
          transfer_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_payment_intents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_intents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_intents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoices_with_balance"
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
          e2e_scope: string | null
          email: string | null
          id: string
          is_e2e: boolean
          name: string
          notes: string | null
          phone: string | null
          razon_social: string | null
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
          e2e_scope?: string | null
          email?: string | null
          id?: string
          is_e2e?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          razon_social?: string | null
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
          e2e_scope?: string | null
          email?: string | null
          id?: string
          is_e2e?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          razon_social?: string | null
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
            foreignKeyName: "damage_records_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoices_with_balance"
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
          e2e_scope: string | null
          id: string
          is_e2e: boolean
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
          e2e_scope?: string | null
          id?: string
          is_e2e?: boolean
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
          e2e_scope?: string | null
          id?: string
          is_e2e?: boolean
          manufacturer?: string
          model?: string
          updated_at?: string
        }
        Relationships: []
      }
      feedback_reports: {
        Row: {
          admin_notes: string | null
          context_json: Json
          created_at: string
          description: string
          folio: string
          id: string
          module: string
          points_awarded: number
          reporter_id: string
          reporter_name: string | null
          reporter_type: string
          resolved_at: string | null
          screenshot_url: string | null
          severity: string | null
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          context_json?: Json
          created_at?: string
          description: string
          folio?: string
          id?: string
          module?: string
          points_awarded?: number
          reporter_id: string
          reporter_name?: string | null
          reporter_type: string
          resolved_at?: string | null
          screenshot_url?: string | null
          severity?: string | null
          status?: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          context_json?: Json
          created_at?: string
          description?: string
          folio?: string
          id?: string
          module?: string
          points_awarded?: number
          reporter_id?: string
          reporter_name?: string | null
          reporter_type?: string
          resolved_at?: string | null
          screenshot_url?: string | null
          severity?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      feedback_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          comment: string | null
          from_status: string | null
          id: string
          report_id: string
          to_status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          comment?: string | null
          from_status?: string | null
          id?: string
          report_id: string
          to_status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          comment?: string | null
          from_status?: string | null
          id?: string
          report_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_status_history_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "feedback_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      forklifts: {
        Row: {
          acquisition_cost: number | null
          capacity_kg: number | null
          created_at: string
          daily_rate: number | null
          e2e_scope: string | null
          fuel_type: string | null
          id: string
          image_url: string | null
          insurance_cost: number | null
          insurance_expiry: string | null
          insurance_policy_number: string | null
          insurance_provider: string | null
          is_e2e: boolean
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
          e2e_scope?: string | null
          fuel_type?: string | null
          id?: string
          image_url?: string | null
          insurance_cost?: number | null
          insurance_expiry?: string | null
          insurance_policy_number?: string | null
          insurance_provider?: string | null
          is_e2e?: boolean
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
          e2e_scope?: string | null
          fuel_type?: string | null
          id?: string
          image_url?: string | null
          insurance_cost?: number | null
          insurance_expiry?: string | null
          insurance_policy_number?: string | null
          insurance_provider?: string | null
          is_e2e?: boolean
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
      invoice_bookings: {
        Row: {
          booking_id: string
          created_at: string
          invoice_id: string
          line_index: number | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          invoice_id: string
          line_index?: number | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          invoice_id?: string
          line_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_bookings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_bookings_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_bookings_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoices_with_balance"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_number_settings: {
        Row: {
          id: string
          min_next_number: number
          updated_at: string
        }
        Insert: {
          id?: string
          min_next_number?: number
          updated_at?: string
        }
        Update: {
          id?: string
          min_next_number?: number
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          billing_period_end: string | null
          billing_period_start: string | null
          booking_id: string | null
          cancellation_motive: string | null
          cancellation_reason: string | null
          cancellation_status: string
          cancelled_at: string | null
          cfdi_error_message: string | null
          cfdi_pdf_url: string | null
          cfdi_status: string | null
          cfdi_uuid: string | null
          cfdi_xml: string | null
          cfdi_xml_url: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          due_date: string | null
          e2e_scope: string | null
          facturapi_invoice_id: string | null
          folio: string | null
          forma_pago: string | null
          id: string
          invoice_number: string
          is_e2e: boolean
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
          substitution_uuid: string | null
          subtotal: number
          tax_amount: number
          tax_rate: number
          tipo_cambio: number | null
          total: number
          updated_at: string
          uso_cfdi: string | null
        }
        Insert: {
          billing_period_end?: string | null
          billing_period_start?: string | null
          booking_id?: string | null
          cancellation_motive?: string | null
          cancellation_reason?: string | null
          cancellation_status?: string
          cancelled_at?: string | null
          cfdi_error_message?: string | null
          cfdi_pdf_url?: string | null
          cfdi_status?: string | null
          cfdi_uuid?: string | null
          cfdi_xml?: string | null
          cfdi_xml_url?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          due_date?: string | null
          e2e_scope?: string | null
          facturapi_invoice_id?: string | null
          folio?: string | null
          forma_pago?: string | null
          id?: string
          invoice_number: string
          is_e2e?: boolean
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
          substitution_uuid?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          tipo_cambio?: number | null
          total?: number
          updated_at?: string
          uso_cfdi?: string | null
        }
        Update: {
          billing_period_end?: string | null
          billing_period_start?: string | null
          booking_id?: string | null
          cancellation_motive?: string | null
          cancellation_reason?: string | null
          cancellation_status?: string
          cancelled_at?: string | null
          cfdi_error_message?: string | null
          cfdi_pdf_url?: string | null
          cfdi_status?: string | null
          cfdi_uuid?: string | null
          cfdi_xml?: string | null
          cfdi_xml_url?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          due_date?: string | null
          e2e_scope?: string | null
          facturapi_invoice_id?: string | null
          folio?: string | null
          forma_pago?: string | null
          id?: string
          invoice_number?: string
          is_e2e?: boolean
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
          substitution_uuid?: string | null
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
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          link: string | null
          message: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          message?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          message?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      operating_expenses: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          cfdi_uuid: string | null
          created_at: string
          description: string | null
          expense_date: string
          id: string
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          category: Database["public"]["Enums"]["expense_category"]
          cfdi_uuid?: string | null
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          cfdi_uuid?: string | null
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
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
          currency: string
          e2e_scope: string | null
          exchange_rate: number
          id: string
          installment_number: number | null
          invoice_id: string
          is_e2e: boolean
          notes: string | null
          payment_date: string
          payment_form_sat: string | null
          payment_method: string | null
          prior_balance: number | null
          reference_number: string | null
          rep_cancelled_at: string | null
          rep_cfdi_status: string
          rep_cfdi_uuid: string | null
          rep_error_message: string | null
          rep_facturapi_id: string | null
          rep_pdf_url: string | null
          rep_xml_url: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          e2e_scope?: string | null
          exchange_rate?: number
          id?: string
          installment_number?: number | null
          invoice_id: string
          is_e2e?: boolean
          notes?: string | null
          payment_date?: string
          payment_form_sat?: string | null
          payment_method?: string | null
          prior_balance?: number | null
          reference_number?: string | null
          rep_cancelled_at?: string | null
          rep_cfdi_status?: string
          rep_cfdi_uuid?: string | null
          rep_error_message?: string | null
          rep_facturapi_id?: string | null
          rep_pdf_url?: string | null
          rep_xml_url?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          e2e_scope?: string | null
          exchange_rate?: number
          id?: string
          installment_number?: number | null
          invoice_id?: string
          is_e2e?: boolean
          notes?: string | null
          payment_date?: string
          payment_form_sat?: string | null
          payment_method?: string | null
          prior_balance?: number | null
          reference_number?: string | null
          rep_cancelled_at?: string | null
          rep_cfdi_status?: string
          rep_cfdi_uuid?: string | null
          rep_error_message?: string | null
          rep_facturapi_id?: string | null
          rep_pdf_url?: string | null
          rep_xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoices_with_balance"
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
          closed_at: string | null
          company_name: string
          contact_person: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          deal_value: number | null
          email: string | null
          final_amount: number | null
          id: string
          lost_reason: string | null
          notes: string | null
          phone: string | null
          quote_id: string | null
          stage: string
          stage_order: number | null
          updated_at: string | null
        }
        Insert: {
          closed_at?: string | null
          company_name: string
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          deal_value?: number | null
          email?: string | null
          final_amount?: number | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          phone?: string | null
          quote_id?: string | null
          stage?: string
          stage_order?: number | null
          updated_at?: string | null
        }
        Update: {
          closed_at?: string | null
          company_name?: string
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          deal_value?: number | null
          email?: string | null
          final_amount?: number | null
          id?: string
          lost_reason?: string | null
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
          accepted_at: string | null
          accepted_by_user_id: string | null
          accepted_ip: string | null
          created_at: string
          currency: string
          customer_id: string | null
          customer_name: string | null
          e2e_scope: string | null
          end_date: string | null
          equipment_model_id: string | null
          forklift_id: string | null
          id: string
          is_e2e: boolean
          line_items: Json
          notes: string | null
          quote_number: string
          quote_type: string
          rejected_at: string | null
          rejection_reason: string | null
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
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          accepted_ip?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_name?: string | null
          e2e_scope?: string | null
          end_date?: string | null
          equipment_model_id?: string | null
          forklift_id?: string | null
          id?: string
          is_e2e?: boolean
          line_items?: Json
          notes?: string | null
          quote_number: string
          quote_type?: string
          rejected_at?: string | null
          rejection_reason?: string | null
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
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          accepted_ip?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_name?: string | null
          e2e_scope?: string | null
          end_date?: string | null
          equipment_model_id?: string | null
          forklift_id?: string | null
          id?: string
          is_e2e?: boolean
          line_items?: Json
          notes?: string | null
          quote_number?: string
          quote_type?: string
          rejected_at?: string | null
          rejection_reason?: string | null
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
      rate_limits: {
        Row: {
          bucket: string
          created_at: string
          id: number
          identifier: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: number
          identifier: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: number
          identifier?: string
        }
        Relationships: []
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
      supplier_bank_accounts: {
        Row: {
          account_holder: string
          account_number: string | null
          bank_name: string
          clabe: string | null
          created_at: string
          currency: string
          id: string
          is_primary: boolean
          notes: string | null
          supplier_id: string
          updated_at: string
        }
        Insert: {
          account_holder: string
          account_number?: string | null
          bank_name: string
          clabe?: string | null
          created_at?: string
          currency?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          supplier_id: string
          updated_at?: string
        }
        Update: {
          account_holder?: string
          account_number?: string | null
          bank_name?: string
          clabe?: string | null
          created_at?: string
          currency?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_bank_accounts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_bill_approvals: {
        Row: {
          action: string
          actor_id: string | null
          bill_id: string
          created_at: string
          id: string
          notes: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          bill_id: string
          created_at?: string
          id?: string
          notes?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          bill_id?: string
          created_at?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_bill_approvals_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "supplier_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_bills: {
        Row: {
          approval_notes: string | null
          approval_status: Database["public"]["Enums"]["supplier_bill_approval_status"]
          approved_at: string | null
          approved_by: string | null
          balance: number
          bill_number: string
          category: Database["public"]["Enums"]["expense_category"] | null
          cfdi_use: string | null
          cfdi_uuid: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          due_date: string | null
          exchange_rate: number
          folio: string | null
          id: string
          issue_date: string
          legacy_expense_id: string | null
          notes: string | null
          payment_form_sat: string | null
          payment_in_progress_at: string | null
          payment_method_sat: string | null
          pdf_url: string | null
          retention_isr: number
          retention_iva: number
          serie: string | null
          status: Database["public"]["Enums"]["supplier_bill_status"]
          subtotal: number
          supplier_id: string | null
          tax_amount: number
          total: number
          updated_at: string
          xml_url: string | null
        }
        Insert: {
          approval_notes?: string | null
          approval_status?: Database["public"]["Enums"]["supplier_bill_approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          balance?: number
          bill_number: string
          category?: Database["public"]["Enums"]["expense_category"] | null
          cfdi_use?: string | null
          cfdi_uuid?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          due_date?: string | null
          exchange_rate?: number
          folio?: string | null
          id?: string
          issue_date?: string
          legacy_expense_id?: string | null
          notes?: string | null
          payment_form_sat?: string | null
          payment_in_progress_at?: string | null
          payment_method_sat?: string | null
          pdf_url?: string | null
          retention_isr?: number
          retention_iva?: number
          serie?: string | null
          status?: Database["public"]["Enums"]["supplier_bill_status"]
          subtotal?: number
          supplier_id?: string | null
          tax_amount?: number
          total: number
          updated_at?: string
          xml_url?: string | null
        }
        Update: {
          approval_notes?: string | null
          approval_status?: Database["public"]["Enums"]["supplier_bill_approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          balance?: number
          bill_number?: string
          category?: Database["public"]["Enums"]["expense_category"] | null
          cfdi_use?: string | null
          cfdi_uuid?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          due_date?: string | null
          exchange_rate?: number
          folio?: string | null
          id?: string
          issue_date?: string
          legacy_expense_id?: string | null
          notes?: string | null
          payment_form_sat?: string | null
          payment_in_progress_at?: string | null
          payment_method_sat?: string | null
          pdf_url?: string | null
          retention_isr?: number
          retention_iva?: number
          serie?: string | null
          status?: Database["public"]["Enums"]["supplier_bill_status"]
          subtotal?: number
          supplier_id?: string | null
          tax_amount?: number
          total?: number
          updated_at?: string
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          name: string
          notes: string | null
          phone: string | null
          role: string | null
          supplier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          supplier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contacts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payment_batch_items: {
        Row: {
          account_holder: string | null
          account_number: string | null
          amount: number
          bank_name: string | null
          batch_id: string
          bill_id: string | null
          bill_number: string
          clabe: string | null
          concept: string | null
          created_at: string
          currency: string
          due_date: string | null
          id: string
          reference: string
          supplier_id: string | null
          supplier_name: string
          supplier_rfc: string | null
        }
        Insert: {
          account_holder?: string | null
          account_number?: string | null
          amount: number
          bank_name?: string | null
          batch_id: string
          bill_id?: string | null
          bill_number: string
          clabe?: string | null
          concept?: string | null
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          reference: string
          supplier_id?: string | null
          supplier_name: string
          supplier_rfc?: string | null
        }
        Update: {
          account_holder?: string | null
          account_number?: string | null
          amount?: number
          bank_name?: string | null
          batch_id?: string
          bill_id?: string | null
          bill_number?: string
          clabe?: string | null
          concept?: string | null
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          reference?: string
          supplier_id?: string | null
          supplier_name?: string
          supplier_rfc?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payment_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "supplier_payment_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payment_batch_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "supplier_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payment_batch_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payment_batches: {
        Row: {
          bill_count: number
          created_at: string
          currency: string
          exported_at: string
          exported_by: string | null
          id: string
          notes: string | null
          total_amount: number
        }
        Insert: {
          bill_count?: number
          created_at?: string
          currency?: string
          exported_at?: string
          exported_by?: string | null
          id?: string
          notes?: string | null
          total_amount?: number
        }
        Update: {
          bill_count?: number
          created_at?: string
          currency?: string
          exported_at?: string
          exported_by?: string | null
          id?: string
          notes?: string | null
          total_amount?: number
        }
        Relationships: []
      }
      supplier_payments: {
        Row: {
          amount: number
          bank_account: string | null
          bill_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
          receipt_url: string | null
          reference: string | null
          rep_cfdi_uuid: string | null
          rep_notes: string | null
          rep_pdf_url: string | null
          rep_received_at: string | null
          rep_required: boolean
          rep_status: string
          rep_uploaded_by: string | null
          rep_xml_url: string | null
        }
        Insert: {
          amount: number
          bank_account?: string | null
          bill_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          receipt_url?: string | null
          reference?: string | null
          rep_cfdi_uuid?: string | null
          rep_notes?: string | null
          rep_pdf_url?: string | null
          rep_received_at?: string | null
          rep_required?: boolean
          rep_status?: string
          rep_uploaded_by?: string | null
          rep_xml_url?: string | null
        }
        Update: {
          amount?: number
          bank_account?: string | null
          bill_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          receipt_url?: string | null
          reference?: string | null
          rep_cfdi_uuid?: string | null
          rep_notes?: string | null
          rep_pdf_url?: string | null
          rep_received_at?: string | null
          rep_required?: boolean
          rep_status?: string
          rep_uploaded_by?: string | null
          rep_xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "supplier_bills"
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
          default_payment_terms_days: number | null
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
          default_payment_terms_days?: number | null
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
          default_payment_terms_days?: number | null
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
      v_invoices_with_balance: {
        Row: {
          balance: number | null
          billing_period_end: string | null
          billing_period_start: string | null
          booking_id: string | null
          cancellation_motive: string | null
          cancellation_reason: string | null
          cancellation_status: string | null
          cancelled_at: string | null
          cfdi_error_message: string | null
          cfdi_pdf_url: string | null
          cfdi_status: string | null
          cfdi_uuid: string | null
          cfdi_xml: string | null
          cfdi_xml_url: string | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          due_date: string | null
          e2e_scope: string | null
          facturapi_invoice_id: string | null
          folio: string | null
          forma_pago: string | null
          id: string | null
          invoice_number: string | null
          is_e2e: boolean | null
          issued_at: string | null
          line_items: Json | null
          metodo_pago: string | null
          moneda: string | null
          notes: string | null
          paid_amount: number | null
          paid_at: string | null
          quote_id: string | null
          receptor_domicilio_fiscal_cp: string | null
          receptor_razon_social: string | null
          receptor_regimen_fiscal: string | null
          receptor_rfc: string | null
          serie: string | null
          status: string | null
          substitution_uuid: string | null
          subtotal: number | null
          tax_amount: number | null
          tax_rate: number | null
          tipo_cambio: number | null
          total: number | null
          updated_at: string | null
          uso_cfdi: string | null
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
    }
    Functions: {
      accept_quote_from_portal: {
        Args: { p_ip?: string; p_quote_id: string }
        Returns: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          accepted_ip: string | null
          created_at: string
          currency: string
          customer_id: string | null
          customer_name: string | null
          e2e_scope: string | null
          end_date: string | null
          equipment_model_id: string | null
          forklift_id: string | null
          id: string
          is_e2e: boolean
          line_items: Json
          notes: string | null
          quote_number: string
          quote_type: string
          rejected_at: string | null
          rejection_reason: string | null
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
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_supplier_bill: {
        Args: { p_bill_id: string; p_notes?: string }
        Returns: undefined
      }
      cancel_booking: { Args: { p_booking_id: string }; Returns: undefined }
      change_feedback_status: {
        Args: { _comment?: string; _new_status: string; _report_id: string }
        Returns: {
          admin_notes: string | null
          context_json: Json
          created_at: string
          description: string
          folio: string
          id: string
          module: string
          points_awarded: number
          reporter_id: string
          reporter_name: string | null
          reporter_type: string
          resolved_at: string | null
          screenshot_url: string | null
          severity: string | null
          status: string
          title: string
          type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "feedback_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_and_record_rate_limit: {
        Args: {
          _bucket: string
          _identifier: string
          _max_requests: number
          _window_seconds: number
        }
        Returns: boolean
      }
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
      confirm_bank_match: {
        Args: {
          p_line_id: string
          p_payment_id?: string
          p_supplier_payment_id?: string
        }
        Returns: undefined
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
      create_notification: {
        Args: {
          p_entity_id?: string
          p_entity_type?: string
          p_link?: string
          p_message?: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      create_supplier_payment_batch: {
        Args: { p_items: Json; p_notes?: string }
        Returns: string
      }
      delete_forklift: { Args: { p_forklift_id: string }; Returns: undefined }
      delete_quote_with_unassign: {
        Args: { p_quote_id: string }
        Returns: undefined
      }
      e2e_purge_all: { Args: never; Returns: Json }
      e2e_seed_portal_scenario: {
        Args: { p_portal_email: string; p_scope: string }
        Returns: Json
      }
      e2e_seed_scenario: { Args: { p_scope: string }; Returns: Json }
      e2e_teardown: { Args: { p_scope: string }; Returns: Json }
      generate_feedback_number: { Args: never; Returns: string }
      get_activity_metrics: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_available_forklifts: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          acquisition_cost: number | null
          capacity_kg: number | null
          created_at: string
          daily_rate: number | null
          e2e_scope: string | null
          fuel_type: string | null
          id: string
          image_url: string | null
          insurance_cost: number | null
          insurance_expiry: string | null
          insurance_policy_number: string | null
          insurance_provider: string | null
          is_e2e: boolean
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
      get_billing_secrets_status: {
        Args: never
        Returns: {
          has_live_key: boolean
          has_test_key: boolean
          id: string
        }[]
      }
      get_customer_forklifts_brief: {
        Args: never
        Returns: {
          id: string
          manufacturer: string
          model: string
          name: string
        }[]
      }
      get_customer_id_for_user: { Args: { p_user_id: string }; Returns: string }
      get_customer_profitability: {
        Args: { p_customer_id: string }
        Returns: Json
      }
      get_customer_summary: { Args: { p_customer_id: string }; Returns: Json }
      get_dashboard_stats: { Args: never; Returns: Json }
      get_feedback_leaderboard: {
        Args: { _period?: string }
        Returns: {
          accepted_reports: number
          reporter_id: string
          reporter_name: string
          resolved_reports: number
          total_points: number
          total_reports: number
        }[]
      }
      get_financial_kpis: { Args: never; Returns: Json }
      get_forklift_financials: {
        Args: { p_forklift_id: string }
        Returns: Json
      }
      get_income_statement: {
        Args: { p_basis?: string; p_end_date: string; p_start_date: string }
        Returns: Json
      }
      get_insurance_alerts: { Args: never; Returns: Json }
      get_mrr_detail: { Args: never; Returns: Json }
      get_portal_collection_account: {
        Args: never
        Returns: {
          account_holder: string
          account_number: string
          bank: string
          clabe: string
          currency: string
        }[]
      }
      get_portal_contracts: {
        Args: never
        Returns: {
          contract_number: string
          created_at: string
          customer_id: string
          end_date: string
          forklift_id: string
          id: string
          signed_at: string
          start_date: string
          status: string
          usage_location: string
        }[]
      }
      get_portal_invoices: {
        Args: never
        Returns: {
          billing_period_end: string
          billing_period_start: string
          cfdi_pdf_url: string
          cfdi_uuid: string
          customer_id: string
          due_date: string
          id: string
          invoice_number: string
          issued_at: string
          line_items: Json
          moneda: string
          paid_at: string
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
        }[]
      }
      get_public_branding: {
        Args: never
        Returns: {
          logo_url: string
          razon_social: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_supplier_rep_rejected: {
        Args: { p_notes: string; p_payment_id: string }
        Returns: undefined
      }
      match_bank_statement_lines: {
        Args: { p_import_id: string }
        Returns: {
          matched_count: number
          suggested_count: number
          unmatched_count: number
        }[]
      }
      next_booking_number: { Args: never; Returns: string }
      next_booking_number_e2e: { Args: never; Returns: string }
      next_contract_number: { Args: never; Returns: string }
      next_credit_note_number: { Args: never; Returns: string }
      next_delivery_number: { Args: never; Returns: string }
      next_inspection_number: { Args: never; Returns: string }
      next_invoice_number: { Args: never; Returns: string }
      next_invoice_number_e2e: { Args: never; Returns: string }
      next_quote_number: { Args: never; Returns: string }
      next_quote_number_e2e: { Args: never; Returns: string }
      next_supplier_bill_number: { Args: never; Returns: string }
      notify_admins: {
        Args: {
          p_entity_id?: string
          p_entity_type?: string
          p_link?: string
          p_message?: string
          p_title: string
          p_type: string
        }
        Returns: number
      }
      purge_e2e_data: { Args: never; Returns: Json }
      recalc_supplier_bill: { Args: { p_bill_id: string }; Returns: undefined }
      register_supplier_payment: {
        Args: {
          p_amount: number
          p_bank_account?: string
          p_bill_id: string
          p_notes?: string
          p_payment_date?: string
          p_payment_method?: string
          p_receipt_url?: string
          p_reference?: string
        }
        Returns: string
      }
      reject_quote_from_portal: {
        Args: { p_quote_id: string; p_reason: string }
        Returns: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          accepted_ip: string | null
          created_at: string
          currency: string
          customer_id: string | null
          customer_name: string | null
          e2e_scope: string | null
          end_date: string | null
          equipment_model_id: string | null
          forklift_id: string | null
          id: string
          is_e2e: boolean
          line_items: Json
          notes: string | null
          quote_number: string
          quote_type: string
          rejected_at: string | null
          rejection_reason: string | null
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
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_supplier_bill: {
        Args: { p_bill_id: string; p_notes: string }
        Returns: undefined
      }
      request_bill_reapproval: {
        Args: { p_bill_id: string; p_notes?: string }
        Returns: undefined
      }
      reset_supplier_rep_pending: {
        Args: { p_payment_id: string }
        Returns: undefined
      }
      revert_audit_log: { Args: { p_audit_log_id: string }; Returns: undefined }
      unmatch_bank_line: { Args: { p_line_id: string }; Returns: undefined }
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
      bank_line_status: "unmatched" | "suggested" | "matched" | "ignored"
      expense_category:
        | "renta"
        | "nomina"
        | "software"
        | "depreciacion"
        | "otro"
        | "costo_venta"
        | "caja_chica"
        | "publicidad"
      payment_intent_status: "pending_review" | "approved" | "rejected"
      supplier_bill_approval_status:
        | "not_required"
        | "pending"
        | "approved"
        | "rejected"
      supplier_bill_status:
        | "draft"
        | "pending"
        | "partial"
        | "paid"
        | "overdue"
        | "cancelled"
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
      bank_line_status: ["unmatched", "suggested", "matched", "ignored"],
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
      payment_intent_status: ["pending_review", "approved", "rejected"],
      supplier_bill_approval_status: [
        "not_required",
        "pending",
        "approved",
        "rejected",
      ],
      supplier_bill_status: [
        "draft",
        "pending",
        "partial",
        "paid",
        "overdue",
        "cancelled",
      ],
    },
  },
} as const
