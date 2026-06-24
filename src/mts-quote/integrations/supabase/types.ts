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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      account_specific_columns: {
        Row: {
          account_id: string | null
          column_name: string
          created_at: string | null
          data_type: string
          display_label: string
          display_order: number | null
          id: string
        }
        Insert: {
          account_id?: string | null
          column_name: string
          created_at?: string | null
          data_type: string
          display_label: string
          display_order?: number | null
          id?: string
        }
        Update: {
          account_id?: string | null
          column_name?: string
          created_at?: string | null
          data_type?: string
          display_label?: string
          display_order?: number | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_specific_columns_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_specific_fields: {
        Row: {
          account_id: string | null
          created_at: string | null
          data_type: string
          display_name: string
          field_name: string
          id: string
          show_on_card: boolean | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string | null
          data_type: string
          display_name: string
          field_name: string
          id?: string
          show_on_card?: boolean | null
        }
        Update: {
          account_id?: string | null
          created_at?: string | null
          data_type?: string
          display_name?: string
          field_name?: string
          id?: string
          show_on_card?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "account_specific_fields_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          created_at: string | null
          custom_url: string | null
          default_duration_minutes: number | null
          has_portal: boolean | null
          id: string
          name: string
          qb_billing_email: string | null
          qb_customer_id: string | null
          qb_customer_name: string | null
          receives_notifications: boolean | null
          service_notification_type: string | null
          webhook_events: string[] | null
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          created_at?: string | null
          custom_url?: string | null
          default_duration_minutes?: number | null
          has_portal?: boolean | null
          id?: string
          name: string
          qb_billing_email?: string | null
          qb_customer_id?: string | null
          qb_customer_name?: string | null
          receives_notifications?: boolean | null
          service_notification_type?: string | null
          webhook_events?: string[] | null
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          created_at?: string | null
          custom_url?: string | null
          default_duration_minutes?: number | null
          has_portal?: boolean | null
          id?: string
          name?: string
          qb_billing_email?: string | null
          qb_customer_id?: string | null
          qb_customer_name?: string | null
          receives_notifications?: boolean | null
          service_notification_type?: string | null
          webhook_events?: string[] | null
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      agent_ops_blocker_taxonomy: {
        Row: {
          auto_retriable: boolean
          blocker_code: string
          created_at: string
          description: string | null
          display_label: string
          severity: string
          suggested_action: string | null
        }
        Insert: {
          auto_retriable?: boolean
          blocker_code: string
          created_at?: string
          description?: string | null
          display_label: string
          severity?: string
          suggested_action?: string | null
        }
        Update: {
          auto_retriable?: boolean
          blocker_code?: string
          created_at?: string
          description?: string | null
          display_label?: string
          severity?: string
          suggested_action?: string | null
        }
        Relationships: []
      }
      agent_ops_registry: {
        Row: {
          account_id: string | null
          agent_id: string
          agent_type: string
          config_json: Json
          created_at: string
          default_model: string | null
          description: string | null
          display_name: string
          expected_cadence_minutes: number | null
          is_active: boolean
          is_pinned: boolean
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          agent_id: string
          agent_type?: string
          config_json?: Json
          created_at?: string
          default_model?: string | null
          description?: string | null
          display_name: string
          expected_cadence_minutes?: number | null
          is_active?: boolean
          is_pinned?: boolean
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          agent_id?: string
          agent_type?: string
          config_json?: Json
          created_at?: string
          default_model?: string | null
          description?: string | null
          display_name?: string
          expected_cadence_minutes?: number | null
          is_active?: boolean
          is_pinned?: boolean
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_ops_registry_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_ops_run_events: {
        Row: {
          agent_id: string
          event_id: string
          event_payload: Json
          event_type: string
          id: number
          occurred_at: string
          run_id: string
        }
        Insert: {
          agent_id: string
          event_id: string
          event_payload?: Json
          event_type: string
          id?: never
          occurred_at?: string
          run_id: string
        }
        Update: {
          agent_id?: string
          event_id?: string
          event_payload?: Json
          event_type?: string
          id?: never
          occurred_at?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_ops_run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_ops_runs"
            referencedColumns: ["run_id"]
          },
          {
            foreignKeyName: "agent_ops_run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "v_agent_ops_health_latest"
            referencedColumns: ["last_run_id"]
          },
          {
            foreignKeyName: "agent_ops_run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "v_agent_ops_webhook_failures"
            referencedColumns: ["correlated_run_id"]
          },
        ]
      }
      agent_ops_runs: {
        Row: {
          agent_id: string
          blocker_at: string | null
          blocker_code: string | null
          blocker_reason: string | null
          completion_status: string
          created_at: string
          duration_ms: number | null
          ended_at: string | null
          escalation_reason: string | null
          id: number
          ingested_via: string
          items_failed: number
          items_processed: number
          items_remaining: number
          items_skipped: number
          items_success: number
          model_used: string | null
          raw_output_json: Json | null
          run_id: string
          started_at: string
          trigger_type: string
          triggered_by: string | null
          updated_at: string
          webhooks_retry_count: number
          webhooks_sent_failed: number
          webhooks_sent_ok: number
          workflow_audit_id: string | null
          workflow_id: string | null
        }
        Insert: {
          agent_id: string
          blocker_at?: string | null
          blocker_code?: string | null
          blocker_reason?: string | null
          completion_status?: string
          created_at?: string
          duration_ms?: number | null
          ended_at?: string | null
          escalation_reason?: string | null
          id?: never
          ingested_via?: string
          items_failed?: number
          items_processed?: number
          items_remaining?: number
          items_skipped?: number
          items_success?: number
          model_used?: string | null
          raw_output_json?: Json | null
          run_id: string
          started_at: string
          trigger_type?: string
          triggered_by?: string | null
          updated_at?: string
          webhooks_retry_count?: number
          webhooks_sent_failed?: number
          webhooks_sent_ok?: number
          workflow_audit_id?: string | null
          workflow_id?: string | null
        }
        Update: {
          agent_id?: string
          blocker_at?: string | null
          blocker_code?: string | null
          blocker_reason?: string | null
          completion_status?: string
          created_at?: string
          duration_ms?: number | null
          ended_at?: string | null
          escalation_reason?: string | null
          id?: never
          ingested_via?: string
          items_failed?: number
          items_processed?: number
          items_remaining?: number
          items_skipped?: number
          items_success?: number
          model_used?: string | null
          raw_output_json?: Json | null
          run_id?: string
          started_at?: string
          trigger_type?: string
          triggered_by?: string | null
          updated_at?: string
          webhooks_retry_count?: number
          webhooks_sent_failed?: number
          webhooks_sent_ok?: number
          workflow_audit_id?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_ops_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_ops_registry"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_ops_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_ops_health_latest"
            referencedColumns: ["agent_id"]
          },
        ]
      }
      ai_agent_executions: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          ai_model: string | null
          confidence_score: number | null
          cost_estimate: number | null
          created_at: string | null
          error_message: string | null
          execution_time_ms: number | null
          id: string
          input_data: Json | null
          job_id: string | null
          output_data: Json | null
          prompt_sent: string | null
          raw_response: string | null
          status: string | null
          tokens_used: number | null
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          ai_model?: string | null
          confidence_score?: number | null
          cost_estimate?: number | null
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          input_data?: Json | null
          job_id?: string | null
          output_data?: Json | null
          prompt_sent?: string | null
          raw_response?: string | null
          status?: string | null
          tokens_used?: number | null
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          ai_model?: string | null
          confidence_score?: number | null
          cost_estimate?: number | null
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          input_data?: Json | null
          job_id?: string | null
          output_data?: Json | null
          prompt_sent?: string | null
          raw_response?: string | null
          status?: string | null
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_executions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_samples: {
        Row: {
          agent_id: string
          created_at: string | null
          description: string | null
          display_order: number | null
          expected_output: Json | null
          file_name: string
          file_type: string
          file_url: string
          id: string
          uploaded_by: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          expected_output?: Json | null
          file_name: string
          file_type?: string
          file_url: string
          id?: string
          uploaded_by?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          expected_output?: Json | null
          file_name?: string
          file_type?: string
          file_url?: string
          id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_samples_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_samples_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          account_id: string | null
          account_name: string | null
          active: boolean | null
          agent_name: string
          agent_type: string
          created_at: string | null
          created_by: string | null
          extraction_rules: Json | null
          id: string
          instructions: string
          is_verified: boolean | null
          last_modified_by: string | null
          system_prompt: string
          updated_at: string | null
          verified_at: string | null
          verified_notes: string | null
          version: number | null
        }
        Insert: {
          account_id?: string | null
          account_name?: string | null
          active?: boolean | null
          agent_name: string
          agent_type: string
          created_at?: string | null
          created_by?: string | null
          extraction_rules?: Json | null
          id?: string
          instructions: string
          is_verified?: boolean | null
          last_modified_by?: string | null
          system_prompt: string
          updated_at?: string | null
          verified_at?: string | null
          verified_notes?: string | null
          version?: number | null
        }
        Update: {
          account_id?: string | null
          account_name?: string | null
          active?: boolean | null
          agent_name?: string
          agent_type?: string
          created_at?: string | null
          created_by?: string | null
          extraction_rules?: Json | null
          id?: string
          instructions?: string
          is_verified?: boolean | null
          last_modified_by?: string | null
          system_prompt?: string
          updated_at?: string | null
          verified_at?: string | null
          verified_notes?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_last_modified_by_fkey"
            columns: ["last_modified_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      api_appointment_events: {
        Row: {
          detail: Json | null
          id: number
          job_id: string
          lane: string
          occurred_at: string
          received_at: string | null
          stage: string
          status: string | null
          trace_id: string | null
        }
        Insert: {
          detail?: Json | null
          id?: never
          job_id: string
          lane?: string
          occurred_at?: string
          received_at?: string | null
          stage: string
          status?: string | null
          trace_id?: string | null
        }
        Update: {
          detail?: Json | null
          id?: never
          job_id?: string
          lane?: string
          occurred_at?: string
          received_at?: string | null
          stage?: string
          status?: string | null
          trace_id?: string | null
        }
        Relationships: []
      }
      api_appointments: {
        Row: {
          assigned_to: string
          calendar_event_id: string | null
          created_at: string
          created_by: string
          customer_card_id: string
          customer_name: string
          end_window: string
          id: string
          job_id: string
          location: string
          notes: string | null
          start_window: string
          status: string
          terminal_state: string
          trace_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to: string
          calendar_event_id?: string | null
          created_at?: string
          created_by?: string
          customer_card_id: string
          customer_name: string
          end_window: string
          id?: string
          job_id: string
          location: string
          notes?: string | null
          start_window: string
          status?: string
          terminal_state?: string
          trace_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          calendar_event_id?: string | null
          created_at?: string
          created_by?: string
          customer_card_id?: string
          customer_name?: string
          end_window?: string
          id?: string
          job_id?: string
          location?: string
          notes?: string | null
          start_window?: string
          status?: string
          terminal_state?: string
          trace_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_date: string
          appointment_time: string
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
          google_event_id: string | null
          id: string
          monday_item_id: string | null
          notes: string | null
          service_type: string
          status: string
          updated_at: string
        }
        Insert: {
          appointment_date: string
          appointment_time: string
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone: string
          google_event_id?: string | null
          id?: string
          monday_item_id?: string | null
          notes?: string | null
          service_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_date?: string
          appointment_time?: string
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          google_event_id?: string | null
          id?: string
          monday_item_id?: string | null
          notes?: string | null
          service_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      arjays_dd_batches: {
        Row: {
          created_at: string
          email_id: string
          email_received_at: string | null
          email_subject: string | null
          error_count: number | null
          error_message: string | null
          id: string
          payment_date: string | null
          processed_count: number | null
          skipped_count: number | null
          status: string | null
          success_count: number | null
          total_amount: number | null
          total_line_items: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_id: string
          email_received_at?: string | null
          email_subject?: string | null
          error_count?: number | null
          error_message?: string | null
          id?: string
          payment_date?: string | null
          processed_count?: number | null
          skipped_count?: number | null
          status?: string | null
          success_count?: number | null
          total_amount?: number | null
          total_line_items?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_id?: string
          email_received_at?: string | null
          email_subject?: string | null
          error_count?: number | null
          error_message?: string | null
          id?: string
          payment_date?: string | null
          processed_count?: number | null
          skipped_count?: number | null
          status?: string | null
          success_count?: number | null
          total_amount?: number | null
          total_line_items?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      arjays_dd_line_items: {
        Row: {
          batch_id: string
          created_at: string
          customer_snippet: string | null
          error_message: string | null
          id: string
          invoice_document_id: string | null
          job_id: string | null
          job_number: string | null
          payment_amount: number | null
          qb_invoice_id: string | null
          qb_payment_id: string | null
          reference_number: string
          status: string | null
          updated_at: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          customer_snippet?: string | null
          error_message?: string | null
          id?: string
          invoice_document_id?: string | null
          job_id?: string | null
          job_number?: string | null
          payment_amount?: number | null
          qb_invoice_id?: string | null
          qb_payment_id?: string | null
          reference_number: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          customer_snippet?: string | null
          error_message?: string | null
          id?: string
          invoice_document_id?: string | null
          job_id?: string | null
          job_number?: string | null
          payment_amount?: number | null
          qb_invoice_id?: string | null
          qb_payment_id?: string | null
          reference_number?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "arjays_dd_line_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "arjays_dd_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      arjays_dd_payments: {
        Row: {
          ai_confidence_score: number | null
          amount_paid: number | null
          attachment_filename: string | null
          attachment_url: string | null
          created_at: string | null
          crm_error: string | null
          crm_sync_at: string | null
          crm_sync_status: string | null
          customer_name: string | null
          email_from: string
          email_received_at: string
          email_subject: string
          id: string
          issue_description: string | null
          issue_type: string | null
          job_id: string | null
          job_number: string | null
          payment_date: string | null
          quickbooks_error: string | null
          quickbooks_invoice_id: string | null
          quickbooks_payment_id: string | null
          quickbooks_sync_at: string | null
          quickbooks_sync_status: string | null
          reference_number: string | null
          resolution_notes: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          ai_confidence_score?: number | null
          amount_paid?: number | null
          attachment_filename?: string | null
          attachment_url?: string | null
          created_at?: string | null
          crm_error?: string | null
          crm_sync_at?: string | null
          crm_sync_status?: string | null
          customer_name?: string | null
          email_from: string
          email_received_at?: string
          email_subject: string
          id?: string
          issue_description?: string | null
          issue_type?: string | null
          job_id?: string | null
          job_number?: string | null
          payment_date?: string | null
          quickbooks_error?: string | null
          quickbooks_invoice_id?: string | null
          quickbooks_payment_id?: string | null
          quickbooks_sync_at?: string | null
          quickbooks_sync_status?: string | null
          reference_number?: string | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_confidence_score?: number | null
          amount_paid?: number | null
          attachment_filename?: string | null
          attachment_url?: string | null
          created_at?: string | null
          crm_error?: string | null
          crm_sync_at?: string | null
          crm_sync_status?: string | null
          customer_name?: string | null
          email_from?: string
          email_received_at?: string
          email_subject?: string
          id?: string
          issue_description?: string | null
          issue_type?: string | null
          job_id?: string | null
          job_number?: string | null
          payment_date?: string | null
          quickbooks_error?: string | null
          quickbooks_invoice_id?: string | null
          quickbooks_payment_id?: string | null
          quickbooks_sync_at?: string | null
          quickbooks_sync_status?: string | null
          reference_number?: string | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arjays_dd_payments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      arjays_dd_processing_log: {
        Row: {
          created_at: string | null
          details: Json | null
          id: string
          payment_id: string
          status: string
          step: string
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          id?: string
          payment_id: string
          status: string
          step: string
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          id?: string
          payment_id?: string
          status?: string
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "arjays_dd_processing_log_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "arjays_dd_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      arjays_remittance_batches: {
        Row: {
          check_ref_no: string | null
          created_at: string
          email_id: string
          email_received_at: string | null
          email_subject: string | null
          error_count: number | null
          error_message: string | null
          id: string
          no_match_count: number | null
          payment_date: string | null
          processed_count: number | null
          status: string | null
          success_count: number | null
          total_amount: number | null
          total_line_items: number | null
          updated_at: string
        }
        Insert: {
          check_ref_no?: string | null
          created_at?: string
          email_id: string
          email_received_at?: string | null
          email_subject?: string | null
          error_count?: number | null
          error_message?: string | null
          id?: string
          no_match_count?: number | null
          payment_date?: string | null
          processed_count?: number | null
          status?: string | null
          success_count?: number | null
          total_amount?: number | null
          total_line_items?: number | null
          updated_at?: string
        }
        Update: {
          check_ref_no?: string | null
          created_at?: string
          email_id?: string
          email_received_at?: string | null
          email_subject?: string | null
          error_count?: number | null
          error_message?: string | null
          id?: string
          no_match_count?: number | null
          payment_date?: string | null
          processed_count?: number | null
          status?: string | null
          success_count?: number | null
          total_amount?: number | null
          total_line_items?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      arjays_remittance_line_items: {
        Row: {
          batch_id: string
          created_at: string
          customer_snippet: string | null
          error_message: string | null
          id: string
          invoice_document_id: string | null
          job_id: string | null
          job_number: string | null
          payment_amount: number | null
          qb_invoice_id: string | null
          qb_payment_id: string | null
          reference_number: string
          status: string | null
          updated_at: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          customer_snippet?: string | null
          error_message?: string | null
          id?: string
          invoice_document_id?: string | null
          job_id?: string | null
          job_number?: string | null
          payment_amount?: number | null
          qb_invoice_id?: string | null
          qb_payment_id?: string | null
          reference_number: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          customer_snippet?: string | null
          error_message?: string | null
          id?: string
          invoice_document_id?: string | null
          job_id?: string | null
          job_number?: string | null
          payment_amount?: number | null
          qb_invoice_id?: string | null
          qb_payment_id?: string | null
          reference_number?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "arjays_remittance_line_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "arjays_remittance_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_blocks: {
        Row: {
          all_day: boolean | null
          block_type: string
          created_at: string
          created_by: string | null
          description: string | null
          end_datetime: string
          id: string
          installer_id: string | null
          is_recurring: boolean | null
          recurrence_rule: string | null
          start_datetime: string
          title: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean | null
          block_type: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_datetime: string
          id?: string
          installer_id?: string | null
          is_recurring?: boolean | null
          recurrence_rule?: string | null
          start_datetime: string
          title: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean | null
          block_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_datetime?: string
          id?: string
          installer_id?: string | null
          is_recurring?: boolean | null
          recurrence_rule?: string | null
          start_datetime?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_blocks_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          calendar_id: string
          event_end: string | null
          event_start: string | null
          event_title: string | null
          google_event_id: string
          id: string
          installer_id: string
          job_id: string
          last_updated_at: string | null
          synced_at: string | null
        }
        Insert: {
          calendar_id: string
          event_end?: string | null
          event_start?: string | null
          event_title?: string | null
          google_event_id: string
          id?: string
          installer_id: string
          job_id: string
          last_updated_at?: string | null
          synced_at?: string | null
        }
        Update: {
          calendar_id?: string
          event_end?: string | null
          event_start?: string | null
          event_title?: string | null
          google_event_id?: string
          id?: string
          installer_id?: string
          job_id?: string
          last_updated_at?: string | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_settings: {
        Row: {
          created_at: string | null
          default_view: string | null
          id: string
          show_weekends: boolean | null
          time_zone: string | null
          updated_at: string | null
          user_id: string | null
          week_starts_on: number | null
          working_hours_end: string | null
          working_hours_start: string | null
        }
        Insert: {
          created_at?: string | null
          default_view?: string | null
          id?: string
          show_weekends?: boolean | null
          time_zone?: string | null
          updated_at?: string | null
          user_id?: string | null
          week_starts_on?: number | null
          working_hours_end?: string | null
          working_hours_start?: string | null
        }
        Update: {
          created_at?: string | null
          default_view?: string | null
          id?: string
          show_weekends?: boolean | null
          time_zone?: string | null
          updated_at?: string | null
          user_id?: string | null
          week_starts_on?: number | null
          working_hours_end?: string | null
          working_hours_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          account_identified: string | null
          analysis: Json | null
          caller_name: string | null
          caller_phone: string | null
          conversation_id: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          metadata: Json | null
          routing_phone: string | null
          routing_reason: string | null
          routing_target: string | null
          transcript: Json | null
          transfer_status: string | null
        }
        Insert: {
          account_identified?: string | null
          analysis?: Json | null
          caller_name?: string | null
          caller_phone?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          metadata?: Json | null
          routing_phone?: string | null
          routing_reason?: string | null
          routing_target?: string | null
          transcript?: Json | null
          transfer_status?: string | null
        }
        Update: {
          account_identified?: string | null
          analysis?: Json | null
          caller_name?: string | null
          caller_phone?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          metadata?: Json | null
          routing_phone?: string | null
          routing_reason?: string | null
          routing_target?: string | null
          transcript?: Json | null
          transfer_status?: string | null
        }
        Relationships: []
      }
      call_routing_config: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      call_routing_contractors: {
        Row: {
          id: string
          is_active: boolean
          name: string
          phone: string | null
          slug: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          slug: string
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          slug?: string
        }
        Relationships: []
      }
      call_routing_rules: {
        Row: {
          account_id: string | null
          account_slug: string
          contacts: Json
          created_at: string
          default_route: string
          display_name: string
          id: string
          is_active: boolean
          keywords: string[]
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          account_slug: string
          contacts?: Json
          created_at?: string
          default_route?: string
          display_name: string
          id?: string
          is_active?: boolean
          keywords?: string[]
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          account_slug?: string
          contacts?: Json
          created_at?: string
          default_route?: string
          display_name?: string
          id?: string
          is_active?: boolean
          keywords?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_routing_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      card_layout_configurations: {
        Row: {
          account_id: string | null
          account_name: string | null
          created_at: string | null
          display_name: string
          fields: Json
          id: string
          job_type: string | null
          status_group: string
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          account_name?: string | null
          created_at?: string | null
          display_name: string
          fields?: Json
          id?: string
          job_type?: string | null
          status_group: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          account_name?: string | null
          created_at?: string | null
          display_name?: string
          fields?: Json
          id?: string
          job_type?: string | null
          status_group?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_layout_configurations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          created_at: string
          direction: string
          id: string
          message: string
          sender_name: string | null
          sender_phone: string
          twilio_sid: string | null
        }
        Insert: {
          created_at?: string
          direction: string
          id?: string
          message: string
          sender_name?: string | null
          sender_phone: string
          twilio_sid?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          id?: string
          message?: string
          sender_name?: string | null
          sender_phone?: string
          twilio_sid?: string | null
        }
        Relationships: []
      }
      column_configurations: {
        Row: {
          column_key: string
          custom_name: string | null
          data_type: string
          default_name: string
          description: string | null
          display_order: number | null
          id: string
          is_required: boolean | null
          is_system: boolean | null
          is_visible: boolean | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          column_key: string
          custom_name?: string | null
          data_type: string
          default_name: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_required?: boolean | null
          is_system?: boolean | null
          is_visible?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          column_key?: string
          custom_name?: string | null
          data_type?: string
          default_name?: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_required?: boolean | null
          is_system?: boolean | null
          is_visible?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      column_migration_log: {
        Row: {
          created_at: string | null
          id: string
          migrated_at: string | null
          migration_status: string | null
          new_universal_column_id: string | null
          old_column_name: string
          old_table_name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          migrated_at?: string | null
          migration_status?: string | null
          new_universal_column_id?: string | null
          old_column_name: string
          old_table_name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          migrated_at?: string | null
          migration_status?: string | null
          new_universal_column_id?: string | null
          old_column_name?: string
          old_table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "column_migration_log_new_universal_column_id_fkey"
            columns: ["new_universal_column_id"]
            isOneToOne: false
            referencedRelation: "universal_columns"
            referencedColumns: ["id"]
          },
        ]
      }
      comet_order_queue: {
        Row: {
          comet_order_id: string | null
          customer_name: string | null
          id: string
          job_id: string | null
          notes: string | null
          pdf_url: string | null
          priority: number | null
          processed_at: string | null
          queued_at: string | null
          source: string | null
          status: string
        }
        Insert: {
          comet_order_id?: string | null
          customer_name?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          pdf_url?: string | null
          priority?: number | null
          processed_at?: string | null
          queued_at?: string | null
          source?: string | null
          status?: string
        }
        Update: {
          comet_order_id?: string | null
          customer_name?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          pdf_url?: string | null
          priority?: number | null
          processed_at?: string | null
          queued_at?: string | null
          source?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "comet_order_queue_comet_order_id_fkey"
            columns: ["comet_order_id"]
            isOneToOne: false
            referencedRelation: "comet_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comet_order_queue_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      comet_orders: {
        Row: {
          comet_order_id: string | null
          created_at: string | null
          document_url: string
          error_message: string | null
          extracted_data: Json | null
          id: string
          job_id: string | null
          pdf_output_url: string | null
          processing_completed_at: string | null
          processing_started_at: string | null
          status: string
          total_sqft: number | null
          updated_at: string | null
        }
        Insert: {
          comet_order_id?: string | null
          created_at?: string | null
          document_url: string
          error_message?: string | null
          extracted_data?: Json | null
          id?: string
          job_id?: string | null
          pdf_output_url?: string | null
          processing_completed_at?: string | null
          processing_started_at?: string | null
          status?: string
          total_sqft?: number | null
          updated_at?: string | null
        }
        Update: {
          comet_order_id?: string | null
          created_at?: string | null
          document_url?: string
          error_message?: string | null
          extracted_data?: Json | null
          id?: string
          job_id?: string | null
          pdf_output_url?: string | null
          processing_completed_at?: string | null
          processing_started_at?: string | null
          status?: string
          total_sqft?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comet_orders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_payments: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          contractor_name: string
          created_at: string | null
          customer_name: string
          data_fee_per_job: number
          id: string
          installer_name: string | null
          invoice_amount: number
          is_checked_for_payment: boolean | null
          is_return_trip: boolean | null
          job_id: string | null
          job_number: string
          job_type: string
          mts_20_percent: number | null
          paid_100_percent: number | null
          paid_80_percent: number | null
          paid_amount: number
          payment_batch_id: string | null
          payment_date: string
          payment_period_end: string
          payment_period_start: string
          payment_status: string | null
          source_email_subject: string | null
          source_pdf_url: string | null
          updated_at: string | null
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          contractor_name: string
          created_at?: string | null
          customer_name: string
          data_fee_per_job?: number
          id?: string
          installer_name?: string | null
          invoice_amount: number
          is_checked_for_payment?: boolean | null
          is_return_trip?: boolean | null
          job_id?: string | null
          job_number: string
          job_type: string
          mts_20_percent?: number | null
          paid_100_percent?: number | null
          paid_80_percent?: number | null
          paid_amount: number
          payment_batch_id?: string | null
          payment_date: string
          payment_period_end: string
          payment_period_start: string
          payment_status?: string | null
          source_email_subject?: string | null
          source_pdf_url?: string | null
          updated_at?: string | null
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          contractor_name?: string
          created_at?: string | null
          customer_name?: string
          data_fee_per_job?: number
          id?: string
          installer_name?: string | null
          invoice_amount?: number
          is_checked_for_payment?: boolean | null
          is_return_trip?: boolean | null
          job_id?: string | null
          job_number?: string
          job_type?: string
          mts_20_percent?: number | null
          paid_100_percent?: number | null
          paid_80_percent?: number | null
          paid_amount?: number
          payment_batch_id?: string | null
          payment_date?: string
          payment_period_end?: string
          payment_period_start?: string
          payment_status?: string | null
          source_email_subject?: string | null
          source_pdf_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_payments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contractor_payments_batch"
            columns: ["payment_batch_id"]
            isOneToOne: false
            referencedRelation: "payment_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      contractors: {
        Row: {
          active: boolean | null
          color: string | null
          created_at: string | null
          custom_url: string | null
          default_percentage: number | null
          email: string | null
          has_portal: boolean | null
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          active?: boolean | null
          color?: string | null
          created_at?: string | null
          custom_url?: string | null
          default_percentage?: number | null
          email?: string | null
          has_portal?: boolean | null
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          active?: boolean | null
          color?: string | null
          created_at?: string | null
          custom_url?: string | null
          default_percentage?: number | null
          email?: string | null
          has_portal?: boolean | null
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      crm_email_inbox: {
        Row: {
          body: string | null
          from_address: string
          id: string
          linked_job_id: string | null
          read: boolean | null
          received_at: string | null
          subject: string | null
        }
        Insert: {
          body?: string | null
          from_address: string
          id?: string
          linked_job_id?: string | null
          read?: boolean | null
          received_at?: string | null
          subject?: string | null
        }
        Update: {
          body?: string | null
          from_address?: string
          id?: string
          linked_job_id?: string | null
          read?: boolean | null
          received_at?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_email_inbox_linked_job_id_fkey"
            columns: ["linked_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_invites: {
        Row: {
          accepted: boolean | null
          account_id: string | null
          created_at: string | null
          created_by: string | null
          email: string
          expires_at: string
          id: string
          installer_id: string | null
          role: Database["public"]["Enums"]["crm_user_role"]
          token: string
        }
        Insert: {
          accepted?: boolean | null
          account_id?: string | null
          created_at?: string | null
          created_by?: string | null
          email: string
          expires_at?: string
          id?: string
          installer_id?: string | null
          role: Database["public"]["Enums"]["crm_user_role"]
          token: string
        }
        Update: {
          accepted?: boolean | null
          account_id?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          installer_id?: string | null
          role?: Database["public"]["Enums"]["crm_user_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_invites_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_invites_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          id: string
          message: string
          notification_type:
            | Database["public"]["Enums"]["notification_type"]
            | null
          read: boolean | null
          title: string
          user_id: string | null
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          id?: string
          message: string
          notification_type?:
            | Database["public"]["Enums"]["notification_type"]
            | null
          read?: boolean | null
          title: string
          user_id?: string | null
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          id?: string
          message?: string
          notification_type?:
            | Database["public"]["Enums"]["notification_type"]
            | null
          read?: boolean | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sms_inbox: {
        Row: {
          delivery_status: string | null
          direction: Database["public"]["Enums"]["sms_direction"]
          error_code: string | null
          error_message: string | null
          from_number: string
          id: string
          linked_job_id: string | null
          message: string
          status_updated_at: string | null
          template_key: string | null
          timestamp: string | null
          to_number: string
          twilio_sid: string | null
          workflow_type: string | null
        }
        Insert: {
          delivery_status?: string | null
          direction: Database["public"]["Enums"]["sms_direction"]
          error_code?: string | null
          error_message?: string | null
          from_number: string
          id?: string
          linked_job_id?: string | null
          message: string
          status_updated_at?: string | null
          template_key?: string | null
          timestamp?: string | null
          to_number: string
          twilio_sid?: string | null
          workflow_type?: string | null
        }
        Update: {
          delivery_status?: string | null
          direction?: Database["public"]["Enums"]["sms_direction"]
          error_code?: string | null
          error_message?: string | null
          from_number?: string
          id?: string
          linked_job_id?: string | null
          message?: string
          status_updated_at?: string | null
          template_key?: string | null
          timestamp?: string | null
          to_number?: string
          twilio_sid?: string | null
          workflow_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_sms_inbox_linked_job_id_fkey"
            columns: ["linked_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_user_accounts: {
        Row: {
          account_id: string
          created_at: string | null
          crm_user_id: string
          id: string
        }
        Insert: {
          account_id: string
          created_at?: string | null
          crm_user_id: string
          id?: string
        }
        Update: {
          account_id?: string
          created_at?: string | null
          crm_user_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_user_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_user_accounts_crm_user_id_fkey"
            columns: ["crm_user_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_users: {
        Row: {
          account_id: string | null
          auth_user_id: string | null
          contractor_id: string | null
          created_at: string | null
          display_name: string | null
          email: string
          full_name: string | null
          id: string
          installer_id: string | null
          last_login: string | null
          phone: string | null
          role: Database["public"]["Enums"]["crm_user_role"]
        }
        Insert: {
          account_id?: string | null
          auth_user_id?: string | null
          contractor_id?: string | null
          created_at?: string | null
          display_name?: string | null
          email: string
          full_name?: string | null
          id?: string
          installer_id?: string | null
          last_login?: string | null
          phone?: string | null
          role: Database["public"]["Enums"]["crm_user_role"]
        }
        Update: {
          account_id?: string | null
          auth_user_id?: string | null
          contractor_id?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string
          full_name?: string | null
          id?: string
          installer_id?: string | null
          last_login?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["crm_user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "crm_users_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_users_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_users_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_documents: {
        Row: {
          created_at: string
          customer_name: string | null
          document_type: string | null
          document_url: string
          id: string
          job_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          customer_name?: string | null
          document_type?: string | null
          document_url: string
          id?: string
          job_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          customer_name?: string | null
          document_type?: string | null
          document_url?: string
          id?: string
          job_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_documents_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      delayed_actions: {
        Row: {
          action_type: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          execute_at: string
          id: string
          job_id: string
          metadata: Json | null
          status: string
        }
        Insert: {
          action_type: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          execute_at: string
          id?: string
          job_id: string
          metadata?: Json | null
          status?: string
        }
        Update: {
          action_type?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          execute_at?: string
          id?: string
          job_id?: string
          metadata?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "delayed_actions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_message_conversations: {
        Row: {
          created_at: string | null
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          user1_id: string
          user1_unread_count: number | null
          user2_id: string
          user2_unread_count: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          user1_id: string
          user1_unread_count?: number | null
          user2_id: string
          user2_unread_count?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          user1_id?: string
          user1_unread_count?: number | null
          user2_id?: string
          user2_unread_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "direct_message_conversations_user1_id_fkey"
            columns: ["user1_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_message_conversations_user2_id_fkey"
            columns: ["user2_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_messages: {
        Row: {
          conversation_id: string
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          sender_id: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          sender_id?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "direct_message_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      document_processing_queue: {
        Row: {
          account_id: string | null
          assigned_installer: string | null
          assigned_installer_reasoning: string | null
          calculated_duration_minutes: number | null
          created_at: string | null
          error_message: string | null
          estimated_completion_at: string | null
          id: string
          job_id: string | null
          line_items_count: number | null
          priority: number | null
          processed_by: string | null
          processed_documents: number | null
          progress_percentage: number | null
          session_id: string
          status: string | null
          total_documents: number | null
          updated_at: string | null
          workflow_data: Json | null
          workflow_stage: string | null
        }
        Insert: {
          account_id?: string | null
          assigned_installer?: string | null
          assigned_installer_reasoning?: string | null
          calculated_duration_minutes?: number | null
          created_at?: string | null
          error_message?: string | null
          estimated_completion_at?: string | null
          id?: string
          job_id?: string | null
          line_items_count?: number | null
          priority?: number | null
          processed_by?: string | null
          processed_documents?: number | null
          progress_percentage?: number | null
          session_id?: string
          status?: string | null
          total_documents?: number | null
          updated_at?: string | null
          workflow_data?: Json | null
          workflow_stage?: string | null
        }
        Update: {
          account_id?: string | null
          assigned_installer?: string | null
          assigned_installer_reasoning?: string | null
          calculated_duration_minutes?: number | null
          created_at?: string | null
          error_message?: string | null
          estimated_completion_at?: string | null
          id?: string
          job_id?: string | null
          line_items_count?: number | null
          priority?: number | null
          processed_by?: string | null
          processed_documents?: number | null
          progress_percentage?: number | null
          session_id?: string
          status?: string | null
          total_documents?: number | null
          updated_at?: string | null
          workflow_data?: Json | null
          workflow_stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_processing_queue_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_processing_queue_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          account_id: string | null
          account_name: string | null
          auto_process: boolean | null
          created_at: string | null
          default_status: string | null
          email_from_addresses: string[] | null
          email_has_attachments: boolean | null
          email_subject_contains: string[] | null
          extraction_pages: string | null
          fields_mapped: number | null
          id: string
          last_used_at: string | null
          name: string
          source_type: string | null
          status: string | null
          updated_at: string | null
          upload_bucket: string | null
        }
        Insert: {
          account_id?: string | null
          account_name?: string | null
          auto_process?: boolean | null
          created_at?: string | null
          default_status?: string | null
          email_from_addresses?: string[] | null
          email_has_attachments?: boolean | null
          email_subject_contains?: string[] | null
          extraction_pages?: string | null
          fields_mapped?: number | null
          id?: string
          last_used_at?: string | null
          name: string
          source_type?: string | null
          status?: string | null
          updated_at?: string | null
          upload_bucket?: string | null
        }
        Update: {
          account_id?: string | null
          account_name?: string | null
          auto_process?: boolean | null
          created_at?: string | null
          default_status?: string | null
          email_from_addresses?: string[] | null
          email_has_attachments?: boolean | null
          email_subject_contains?: string[] | null
          extraction_pages?: string | null
          fields_mapped?: number | null
          id?: string
          last_used_at?: string | null
          name?: string
          source_type?: string | null
          status?: string | null
          updated_at?: string | null
          upload_bucket?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      document_transfers: {
        Row: {
          created_at: string | null
          created_by: string | null
          direction: string
          document_id: string | null
          document_type: string | null
          error_message: string | null
          file_name: string
          id: string
          job_id: string | null
          partner_document_id: string | null
          partner_id: string | null
          partner_name: string | null
          status: string | null
          transferred_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          direction: string
          document_id?: string | null
          document_type?: string | null
          error_message?: string | null
          file_name: string
          id?: string
          job_id?: string | null
          partner_document_id?: string | null
          partner_id?: string | null
          partner_name?: string | null
          status?: string | null
          transferred_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          direction?: string
          document_id?: string | null
          document_type?: string | null
          error_message?: string | null
          file_name?: string
          id?: string
          job_id?: string | null
          partner_document_id?: string | null
          partner_id?: string | null
          partner_name?: string | null
          status?: string | null
          transferred_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_transfers_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "job_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_transfers_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_transfers_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      duration_configurations: {
        Row: {
          account_name: string | null
          add_on_times: Json
          base_time_per_item: number
          config_name: string
          created_at: string | null
          id: string
          minimum_duration: number
          notes: string | null
          rounding_increment: number
          updated_at: string | null
        }
        Insert: {
          account_name?: string | null
          add_on_times?: Json
          base_time_per_item?: number
          config_name: string
          created_at?: string | null
          id?: string
          minimum_duration?: number
          notes?: string | null
          rounding_increment?: number
          updated_at?: string | null
        }
        Update: {
          account_name?: string | null
          add_on_times?: Json
          base_time_per_item?: number
          config_name?: string
          created_at?: string | null
          id?: string
          minimum_duration?: number
          notes?: string | null
          rounding_increment?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      duration_settings: {
        Row: {
          account_id: string | null
          category_name: string
          category_type: string
          created_at: string | null
          custom_label: string | null
          danny_duration: number
          default_duration: number
          display_order: number
          id: string
          is_active: boolean | null
          kevin_duration: number
          match_keywords: string[] | null
          mike_duration: number
          stevie_duration: number
          tony_duration: number
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          category_name: string
          category_type: string
          created_at?: string | null
          custom_label?: string | null
          danny_duration?: number
          default_duration?: number
          display_order: number
          id?: string
          is_active?: boolean | null
          kevin_duration?: number
          match_keywords?: string[] | null
          mike_duration?: number
          stevie_duration?: number
          tony_duration?: number
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          category_name?: string
          category_type?: string
          created_at?: string | null
          custom_label?: string | null
          danny_duration?: number
          default_duration?: number
          display_order?: number
          id?: string
          is_active?: boolean | null
          kevin_duration?: number
          match_keywords?: string[] | null
          mike_duration?: number
          stevie_duration?: number
          tony_duration?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "duration_settings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_agent_settings: {
        Row: {
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_agent_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_categories: {
        Row: {
          active: boolean | null
          ai_hints: string | null
          auto_actionable: boolean | null
          category_key: string
          color: string | null
          created_at: string | null
          description: string | null
          display_name: string
          icon: string | null
          id: string
          priority: number | null
          requires_job_match: boolean | null
          suggested_action: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          ai_hints?: string | null
          auto_actionable?: boolean | null
          category_key: string
          color?: string | null
          created_at?: string | null
          description?: string | null
          display_name: string
          icon?: string | null
          id?: string
          priority?: number | null
          requires_job_match?: boolean | null
          suggested_action?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          ai_hints?: string | null
          auto_actionable?: boolean | null
          category_key?: string
          color?: string | null
          created_at?: string | null
          description?: string | null
          display_name?: string
          icon?: string | null
          id?: string
          priority?: number | null
          requires_job_match?: boolean | null
          suggested_action?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      email_feed_actions: {
        Row: {
          account_id: string | null
          action_type: string
          ai_summary: string | null
          created_at: string
          email_body: string | null
          email_queue_id: string | null
          email_subject: string | null
          id: string
          installer_phone: string | null
          installer_sms_responded_at: string | null
          installer_sms_response: string | null
          installer_sms_sent_at: string | null
          job_id: string | null
          received_at: string | null
          reply_sent_at: string | null
          resolved_at: string | null
          resolved_by: string | null
          sender_email: string | null
          sender_name: string | null
          status: string
          suggested_action: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          action_type?: string
          ai_summary?: string | null
          created_at?: string
          email_body?: string | null
          email_queue_id?: string | null
          email_subject?: string | null
          id?: string
          installer_phone?: string | null
          installer_sms_responded_at?: string | null
          installer_sms_response?: string | null
          installer_sms_sent_at?: string | null
          job_id?: string | null
          received_at?: string | null
          reply_sent_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sender_email?: string | null
          sender_name?: string | null
          status?: string
          suggested_action?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          action_type?: string
          ai_summary?: string | null
          created_at?: string
          email_body?: string | null
          email_queue_id?: string | null
          email_subject?: string | null
          id?: string
          installer_phone?: string | null
          installer_sms_responded_at?: string | null
          installer_sms_response?: string | null
          installer_sms_sent_at?: string | null
          job_id?: string | null
          received_at?: string | null
          reply_sent_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sender_email?: string | null
          sender_name?: string | null
          status?: string
          suggested_action?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_feed_actions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_feed_actions_email_queue_id_fkey"
            columns: ["email_queue_id"]
            isOneToOne: false
            referencedRelation: "email_processing_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_feed_actions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_feed_actions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_monitoring_rules: {
        Row: {
          account_id: string | null
          active: boolean | null
          ai_agent_id: string | null
          created_at: string | null
          from_email_addresses: string[] | null
          has_attachments: boolean | null
          id: string
          rule_name: string
          subject_contains: string[] | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          active?: boolean | null
          ai_agent_id?: string | null
          created_at?: string | null
          from_email_addresses?: string[] | null
          has_attachments?: boolean | null
          id?: string
          rule_name: string
          subject_contains?: string[] | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          active?: boolean | null
          ai_agent_id?: string | null
          created_at?: string | null
          from_email_addresses?: string[] | null
          has_attachments?: boolean | null
          id?: string
          rule_name?: string
          subject_contains?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_monitoring_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_monitoring_rules_ai_agent_id_fkey"
            columns: ["ai_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      email_processing_queue: {
        Row: {
          ai_reasoning: string | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          body: string | null
          body_preview: string | null
          category: string | null
          category_confidence: number | null
          created_at: string | null
          crm_actions_taken: Json | null
          draft_response: string | null
          draft_subject: string | null
          email_id: string
          error_message: string | null
          extracted_data: Json | null
          id: string
          job_match_confidence: number | null
          job_match_method: string | null
          linked_job_id: string | null
          processing_status: string | null
          received_at: string | null
          response_sent: boolean | null
          response_sent_at: string | null
          retry_count: number | null
          review_notes: string | null
          sender_email: string
          subject: string | null
          thread_id: string | null
          updated_at: string | null
        }
        Insert: {
          ai_reasoning?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          body?: string | null
          body_preview?: string | null
          category?: string | null
          category_confidence?: number | null
          created_at?: string | null
          crm_actions_taken?: Json | null
          draft_response?: string | null
          draft_subject?: string | null
          email_id: string
          error_message?: string | null
          extracted_data?: Json | null
          id?: string
          job_match_confidence?: number | null
          job_match_method?: string | null
          linked_job_id?: string | null
          processing_status?: string | null
          received_at?: string | null
          response_sent?: boolean | null
          response_sent_at?: string | null
          retry_count?: number | null
          review_notes?: string | null
          sender_email: string
          subject?: string | null
          thread_id?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_reasoning?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          body?: string | null
          body_preview?: string | null
          category?: string | null
          category_confidence?: number | null
          created_at?: string | null
          crm_actions_taken?: Json | null
          draft_response?: string | null
          draft_subject?: string | null
          email_id?: string
          error_message?: string | null
          extracted_data?: Json | null
          id?: string
          job_match_confidence?: number | null
          job_match_method?: string | null
          linked_job_id?: string | null
          processing_status?: string | null
          received_at?: string | null
          response_sent?: boolean | null
          response_sent_at?: string | null
          retry_count?: number | null
          review_notes?: string | null
          sender_email?: string
          subject?: string | null
          thread_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_processing_queue_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_processing_queue_linked_job_id_fkey"
            columns: ["linked_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_response_templates: {
        Row: {
          active: boolean | null
          ai_prompt: string | null
          body_template: string
          category_key: string | null
          created_at: string | null
          id: string
          subject_template: string | null
          template_name: string
          updated_at: string | null
          use_ai_generation: boolean | null
          variables: string[] | null
        }
        Insert: {
          active?: boolean | null
          ai_prompt?: string | null
          body_template: string
          category_key?: string | null
          created_at?: string | null
          id?: string
          subject_template?: string | null
          template_name: string
          updated_at?: string | null
          use_ai_generation?: boolean | null
          variables?: string[] | null
        }
        Update: {
          active?: boolean | null
          ai_prompt?: string | null
          body_template?: string
          category_key?: string | null
          created_at?: string | null
          id?: string
          subject_template?: string | null
          template_name?: string
          updated_at?: string | null
          use_ai_generation?: boolean | null
          variables?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "email_response_templates_category_key_fkey"
            columns: ["category_key"]
            isOneToOne: false
            referencedRelation: "email_categories"
            referencedColumns: ["category_key"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_template: string
          created_at: string
          id: string
          is_active: boolean
          subject_template: string
          template_type: string
          updated_at: string
        }
        Insert: {
          body_template: string
          created_at?: string
          id?: string
          is_active?: boolean
          subject_template: string
          template_type: string
          updated_at?: string
        }
        Update: {
          body_template?: string
          created_at?: string
          id?: string
          is_active?: boolean
          subject_template?: string
          template_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      extracted_data_fields: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          document_id: string | null
          field_name: string
          field_type: string | null
          field_value: string | null
          id: string
          is_verified: boolean | null
          original_value: string | null
          queue_id: string | null
          source_document_ids: string[] | null
          updated_at: string | null
          verified_at: string | null
          verified_by: string | null
          was_corrected: boolean | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          document_id?: string | null
          field_name: string
          field_type?: string | null
          field_value?: string | null
          id?: string
          is_verified?: boolean | null
          original_value?: string | null
          queue_id?: string | null
          source_document_ids?: string[] | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
          was_corrected?: boolean | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          document_id?: string | null
          field_name?: string
          field_type?: string | null
          field_value?: string | null
          id?: string
          is_verified?: boolean | null
          original_value?: string | null
          queue_id?: string | null
          source_document_ids?: string[] | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
          was_corrected?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "extracted_data_fields_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "processed_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracted_data_fields_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "document_processing_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_corrections: {
        Row: {
          corrected_by: string | null
          corrected_value: string | null
          correction_reason: string | null
          created_at: string | null
          field_id: string | null
          id: string
          original_value: string | null
        }
        Insert: {
          corrected_by?: string | null
          corrected_value?: string | null
          correction_reason?: string | null
          created_at?: string | null
          field_id?: string | null
          id?: string
          original_value?: string | null
        }
        Update: {
          corrected_by?: string | null
          corrected_value?: string | null
          correction_reason?: string | null
          created_at?: string | null
          field_id?: string | null
          id?: string
          original_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extraction_corrections_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "extracted_data_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_reports: {
        Row: {
          account_id: string | null
          browser_info: string | null
          created_at: string | null
          description: string
          id: string
          page_url: string | null
          report_type: string
          screenshot_urls: string[] | null
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          browser_info?: string | null
          created_at?: string | null
          description: string
          id?: string
          page_url?: string | null
          report_type: string
          screenshot_urls?: string[] | null
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          browser_info?: string | null
          created_at?: string | null
          description?: string
          id?: string
          page_url?: string | null
          report_type?: string
          screenshot_urls?: string[] | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_reports_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_push_log: {
        Row: {
          from_address: string | null
          history_id: string | null
          id: string
          message_id: string
          processed_at: string
          routed_to: string | null
          subject: string | null
        }
        Insert: {
          from_address?: string | null
          history_id?: string | null
          id?: string
          message_id: string
          processed_at?: string
          routed_to?: string | null
          subject?: string | null
        }
        Update: {
          from_address?: string | null
          history_id?: string | null
          id?: string
          message_id?: string
          processed_at?: string
          routed_to?: string | null
          subject?: string | null
        }
        Relationships: []
      }
      gmail_push_state: {
        Row: {
          created_at: string
          email_address: string
          id: string
          last_history_id: string | null
          updated_at: string
          watch_expiration: number | null
          watch_resource_id: string | null
        }
        Insert: {
          created_at?: string
          email_address: string
          id?: string
          last_history_id?: string | null
          updated_at?: string
          watch_expiration?: number | null
          watch_resource_id?: string | null
        }
        Update: {
          created_at?: string
          email_address?: string
          id?: string
          last_history_id?: string | null
          updated_at?: string
          watch_expiration?: number | null
          watch_resource_id?: string | null
        }
        Relationships: []
      }
      inbound_webhook_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          job_id: string | null
          job_number: string | null
          processed_at: string | null
          processing_status: string
          request_payload: Json
          signature_valid: boolean
          source_account_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          job_id?: string | null
          job_number?: string | null
          processed_at?: string | null
          processing_status?: string
          request_payload: Json
          signature_valid?: boolean
          source_account_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          job_id?: string | null
          job_number?: string | null
          processed_at?: string | null
          processing_status?: string
          request_payload?: Json
          signature_valid?: boolean
          source_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbound_webhook_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_webhook_logs_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      incomplete_reports: {
        Row: {
          created_at: string | null
          id: string
          installer_id: string | null
          job_id: string
          report_text: string
          resolved: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          installer_id?: string | null
          job_id: string
          report_text: string
          resolved?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: string
          installer_id?: string | null
          job_id?: string
          report_text?: string
          resolved?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "incomplete_reports_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomplete_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      installer_completion_details: {
        Row: {
          completed_at: string | null
          hard_surface_install: boolean | null
          id: string
          installer_id: string | null
          installer_notes: string | null
          job_id: string
          ladder_used: boolean | null
          products_cut: boolean | null
          takedown_removal: boolean | null
        }
        Insert: {
          completed_at?: string | null
          hard_surface_install?: boolean | null
          id?: string
          installer_id?: string | null
          installer_notes?: string | null
          job_id: string
          ladder_used?: boolean | null
          products_cut?: boolean | null
          takedown_removal?: boolean | null
        }
        Update: {
          completed_at?: string | null
          hard_surface_install?: boolean | null
          id?: string
          installer_id?: string | null
          installer_notes?: string | null
          job_id?: string
          ladder_used?: boolean | null
          products_cut?: boolean | null
          takedown_removal?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "installer_completion_details_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installer_completion_details_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      installer_qualification_logs: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          job_details: Json
          logic_type: string
          qualification_result: string
          reasoning_steps: Json
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          job_details: Json
          logic_type?: string
          qualification_result: string
          reasoning_steps: Json
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          job_details?: Json
          logic_type?: string
          qualification_result?: string
          reasoning_steps?: Json
        }
        Relationships: [
          {
            foreignKeyName: "installer_qualification_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      installer_qualification_rules: {
        Row: {
          account_id: string | null
          assigned_installer: string | null
          assigned_installers: string[] | null
          conditions: Json
          created_at: string | null
          id: string
          is_active: boolean | null
          requires_manual_review: boolean | null
          rule_name: string
          rule_order: number
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          assigned_installer?: string | null
          assigned_installers?: string[] | null
          conditions?: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          requires_manual_review?: boolean | null
          rule_name: string
          rule_order?: number
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          assigned_installer?: string | null
          assigned_installers?: string[] | null
          conditions?: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          requires_manual_review?: boolean | null
          rule_name?: string
          rule_order?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "installer_qualification_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      installers: {
        Row: {
          account_ids: string[] | null
          active: boolean | null
          color: string | null
          created_at: string | null
          email: string | null
          google_calendar_connected: boolean | null
          google_calendar_connected_at: string | null
          google_calendar_id: string | null
          google_refresh_token: string | null
          id: string
          is_technician: boolean | null
          name: string
          phone: string | null
          sick_days_remaining: number
          sick_days_used: number
          sick_year_start: string | null
          specialties: string[] | null
        }
        Insert: {
          account_ids?: string[] | null
          active?: boolean | null
          color?: string | null
          created_at?: string | null
          email?: string | null
          google_calendar_connected?: boolean | null
          google_calendar_connected_at?: string | null
          google_calendar_id?: string | null
          google_refresh_token?: string | null
          id?: string
          is_technician?: boolean | null
          name: string
          phone?: string | null
          sick_days_remaining?: number
          sick_days_used?: number
          sick_year_start?: string | null
          specialties?: string[] | null
        }
        Update: {
          account_ids?: string[] | null
          active?: boolean | null
          color?: string | null
          created_at?: string | null
          email?: string | null
          google_calendar_connected?: boolean | null
          google_calendar_connected_at?: string | null
          google_calendar_id?: string | null
          google_refresh_token?: string | null
          id?: string
          is_technician?: boolean | null
          name?: string
          phone?: string | null
          sick_days_remaining?: number
          sick_days_used?: number
          sick_year_start?: string | null
          specialties?: string[] | null
        }
        Relationships: []
      }
      internal_chat_conversations: {
        Row: {
          admin_unread_count: number | null
          created_at: string | null
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          participant_name: string
          participant_type: string
          participant_unread_count: number | null
          participant_user_id: string | null
        }
        Insert: {
          admin_unread_count?: number | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          participant_name: string
          participant_type: string
          participant_unread_count?: number | null
          participant_user_id?: string | null
        }
        Update: {
          admin_unread_count?: number | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          participant_name?: string
          participant_type?: string
          participant_unread_count?: number | null
          participant_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "internal_chat_conversations_participant_user_id_fkey"
            columns: ["participant_user_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_chat_messages: {
        Row: {
          conversation_id: string
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          sender_id: string | null
          sender_name: string
          sender_type: string
        }
        Insert: {
          conversation_id: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          sender_id?: string | null
          sender_name: string
          sender_type: string
        }
        Update: {
          conversation_id?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          sender_id?: string | null
          sender_name?: string
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "internal_chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          boxes_count: number | null
          from_section: string | null
          id: string
          job_id: string | null
          job_status_at_movement: string | null
          moved_at: string | null
          moved_by: string | null
          moved_by_name: string | null
          moved_by_role: string | null
          movement_type: string
          notes: string | null
          to_section: string | null
        }
        Insert: {
          boxes_count?: number | null
          from_section?: string | null
          id?: string
          job_id?: string | null
          job_status_at_movement?: string | null
          moved_at?: string | null
          moved_by?: string | null
          moved_by_name?: string | null
          moved_by_role?: string | null
          movement_type: string
          notes?: string | null
          to_section?: string | null
        }
        Update: {
          boxes_count?: number | null
          from_section?: string | null
          id?: string
          job_id?: string | null
          job_status_at_movement?: string | null
          moved_at?: string | null
          moved_by?: string | null
          moved_by_name?: string | null
          moved_by_role?: string | null
          movement_type?: string
          notes?: string | null
          to_section?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_notifications: {
        Row: {
          account_id: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          job_id: string
          message: string
          notification_type: string
          read_at: string | null
          title: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          job_id: string
          message: string
          notification_type: string
          read_at?: string | null
          title: string
        }
        Update: {
          account_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          job_id?: string
          message?: string
          notification_type?: string
          read_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_notifications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_updates: {
        Row: {
          created_at: string | null
          created_by: string | null
          customer_notified: boolean | null
          drapery_received: number | null
          id: string
          items_received: number | null
          job_id: string
          new_status: string
          notes: string | null
          notification_sent_at: string | null
          previous_status: string | null
          shades_blinds_received: number | null
          shutters_received: number | null
          update_type: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          customer_notified?: boolean | null
          drapery_received?: number | null
          id?: string
          items_received?: number | null
          job_id: string
          new_status: string
          notes?: string | null
          notification_sent_at?: string | null
          previous_status?: string | null
          shades_blinds_received?: number | null
          shutters_received?: number | null
          update_type: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          customer_notified?: boolean | null
          drapery_received?: number | null
          id?: string
          items_received?: number | null
          job_id?: string
          new_status?: string
          notes?: string | null
          notification_sent_at?: string | null
          previous_status?: string | null
          shades_blinds_received?: number | null
          shutters_received?: number | null
          update_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_updates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_approvals: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          customer_email: string | null
          id: string
          invoice_amount: number
          invoice_data: Json | null
          invoice_number: string
          job_id: string | null
          quickbooks_sync_status: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          customer_email?: string | null
          id?: string
          invoice_amount?: number
          invoice_data?: Json | null
          invoice_number: string
          job_id?: string | null
          quickbooks_sync_status?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          customer_email?: string | null
          id?: string
          invoice_amount?: number
          invoice_data?: Json | null
          invoice_number?: string
          job_id?: string | null
          quickbooks_sync_status?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_approvals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_approvals_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_documents: {
        Row: {
          account_id: string
          amount: number | null
          bill_to: string | null
          created_at: string
          customer_name: string | null
          dispute_reason: string | null
          dispute_resolved_at: string | null
          disputed_at: string | null
          file_name: string
          file_url: string
          id: string
          invoice_file_id: string | null
          invoice_state: string | null
          is_disputed: boolean | null
          is_paid: boolean | null
          job_id: string | null
          paid_at: string | null
          paid_folder: string | null
          payment_url: string | null
          qb_invoice_id: string | null
          qb_invoice_number: string
          received_at: string
          service_type: string | null
        }
        Insert: {
          account_id: string
          amount?: number | null
          bill_to?: string | null
          created_at?: string
          customer_name?: string | null
          dispute_reason?: string | null
          dispute_resolved_at?: string | null
          disputed_at?: string | null
          file_name: string
          file_url: string
          id?: string
          invoice_file_id?: string | null
          invoice_state?: string | null
          is_disputed?: boolean | null
          is_paid?: boolean | null
          job_id?: string | null
          paid_at?: string | null
          paid_folder?: string | null
          payment_url?: string | null
          qb_invoice_id?: string | null
          qb_invoice_number: string
          received_at?: string
          service_type?: string | null
        }
        Update: {
          account_id?: string
          amount?: number | null
          bill_to?: string | null
          created_at?: string
          customer_name?: string | null
          dispute_reason?: string | null
          dispute_resolved_at?: string | null
          disputed_at?: string | null
          file_name?: string
          file_url?: string
          id?: string
          invoice_file_id?: string | null
          invoice_state?: string | null
          is_disputed?: boolean | null
          is_paid?: boolean | null
          job_id?: string | null
          paid_at?: string | null
          paid_folder?: string | null
          payment_url?: string | null
          qb_invoice_id?: string | null
          qb_invoice_number?: string
          received_at?: string
          service_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_documents_invoice_file_id_fkey"
            columns: ["invoice_file_id"]
            isOneToOne: false
            referencedRelation: "invoice_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_documents_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_files: {
        Row: {
          account_id: string
          created_at: string | null
          file_name: string
          id: string
          week_end: string
          week_start: string
        }
        Insert: {
          account_id: string
          created_at?: string | null
          file_name: string
          id?: string
          week_end: string
          week_start: string
        }
        Update: {
          account_id?: string
          created_at?: string | null
          file_name?: string
          id?: string
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_files_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_pricing_config: {
        Row: {
          category: string
          created_at: string | null
          description: string
          display_order: number | null
          field_name: string | null
          id: string
          is_active: boolean | null
          price_type: string
          quickbooks_item_id: string | null
          quickbooks_item_name: string | null
          subcategory: string | null
          unit_price: number
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description: string
          display_order?: number | null
          field_name?: string | null
          id?: string
          is_active?: boolean | null
          price_type: string
          quickbooks_item_id?: string | null
          quickbooks_item_name?: string | null
          subcategory?: string | null
          unit_price?: number
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string
          display_order?: number | null
          field_name?: string | null
          id?: string
          is_active?: boolean | null
          price_type?: string
          quickbooks_item_id?: string | null
          quickbooks_item_name?: string | null
          subcategory?: string | null
          unit_price?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      job_actions: {
        Row: {
          action_type: string
          created_at: string | null
          details: Json | null
          id: string
          job_id: string
          performed_by: string | null
          performed_by_ai: boolean | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          details?: Json | null
          id?: string
          job_id: string
          performed_by?: string | null
          performed_by_ai?: boolean | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          job_id?: string
          performed_by?: string | null
          performed_by_ai?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "job_actions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_actions_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      job_breakdown: {
        Row: {
          assigned_at: string | null
          assigned_installer_id: string | null
          balance_amount: number | null
          cod_amount: number | null
          contract_number: string | null
          created_at: string | null
          customer_address: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          deposit_amount: number | null
          duration_calculated_at: string | null
          estimated_duration_minutes: number | null
          extraction_completed_at: string | null
          extraction_error: string | null
          extraction_status: string | null
          grand_total: number | null
          id: string
          job_id: string
          job_status: string
          job_type: string
          num_blinds_shades: number | null
          num_draperies: number | null
          num_hard_surface: number | null
          num_hubs: number | null
          num_ladders: number | null
          num_motorized: number | null
          num_outside_mount: number | null
          num_over_90_wide: number | null
          num_shutters: number | null
          num_takedowns: number | null
          shutters_sq_ft: number | null
          sidemark: string | null
          source: string
          updated_at: string | null
          vendor: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_installer_id?: string | null
          balance_amount?: number | null
          cod_amount?: number | null
          contract_number?: string | null
          created_at?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          deposit_amount?: number | null
          duration_calculated_at?: string | null
          estimated_duration_minutes?: number | null
          extraction_completed_at?: string | null
          extraction_error?: string | null
          extraction_status?: string | null
          grand_total?: number | null
          id?: string
          job_id: string
          job_status: string
          job_type: string
          num_blinds_shades?: number | null
          num_draperies?: number | null
          num_hard_surface?: number | null
          num_hubs?: number | null
          num_ladders?: number | null
          num_motorized?: number | null
          num_outside_mount?: number | null
          num_over_90_wide?: number | null
          num_shutters?: number | null
          num_takedowns?: number | null
          shutters_sq_ft?: number | null
          sidemark?: string | null
          source: string
          updated_at?: string | null
          vendor?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_installer_id?: string | null
          balance_amount?: number | null
          cod_amount?: number | null
          contract_number?: string | null
          created_at?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          deposit_amount?: number | null
          duration_calculated_at?: string | null
          estimated_duration_minutes?: number | null
          extraction_completed_at?: string | null
          extraction_error?: string | null
          extraction_status?: string | null
          grand_total?: number | null
          id?: string
          job_id?: string
          job_status?: string
          job_type?: string
          num_blinds_shades?: number | null
          num_draperies?: number | null
          num_hard_surface?: number | null
          num_hubs?: number | null
          num_ladders?: number | null
          num_motorized?: number | null
          num_outside_mount?: number | null
          num_over_90_wide?: number | null
          num_shutters?: number | null
          num_takedowns?: number | null
          shutters_sq_ft?: number | null
          sidemark?: string | null
          source?: string
          updated_at?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_breakdown_assigned_installer_id_fkey"
            columns: ["assigned_installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_breakdown_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_communication_reads: {
        Row: {
          id: string
          job_id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          job_id: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          job_id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_communication_reads_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_communications: {
        Row: {
          created_at: string | null
          id: string
          invoice_id: string | null
          job_id: string
          message_text: string
          message_type: Database["public"]["Enums"]["message_type"] | null
          sender_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          job_id: string
          message_text: string
          message_type?: Database["public"]["Enums"]["message_type"] | null
          sender_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          job_id?: string
          message_text?: string
          message_type?: Database["public"]["Enums"]["message_type"] | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_communications_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_communications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_communications_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      job_documents: {
        Row: {
          coc_reviewed: boolean | null
          coc_reviewed_at: string | null
          file_hash: string | null
          file_name: string
          file_type: Database["public"]["Enums"]["document_type"]
          file_url: string
          id: string
          job_id: string
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          coc_reviewed?: boolean | null
          coc_reviewed_at?: string | null
          file_hash?: string | null
          file_name: string
          file_type: Database["public"]["Enums"]["document_type"]
          file_url: string
          id?: string
          job_id: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          coc_reviewed?: boolean | null
          coc_reviewed_at?: string | null
          file_hash?: string | null
          file_name?: string
          file_type?: Database["public"]["Enums"]["document_type"]
          file_url?: string
          id?: string
          job_id?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_documents_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      job_line_items: {
        Row: {
          astragal_style: string | null
          button_catch: boolean | null
          cassette_type: string | null
          color: string | null
          color_code: string | null
          control_side: string | null
          created_at: string
          description: string
          divider_rail: string | null
          extraction_confidence: string | null
          extraction_notes: string | null
          frame_sides: number | null
          frame_type: string | null
          has_existing_treatments: boolean | null
          has_hub: boolean | null
          height: number | null
          hinge_color: string | null
          id: string
          is_hard_surface: boolean | null
          is_motorized: boolean | null
          is_over_90: boolean | null
          item_number: string | null
          job_id: string | null
          labor_each: number | null
          line_number: number
          list_price: number | null
          louver_size: string | null
          measure_order_number: string | null
          model: string | null
          mount_type: string | null
          opening_type: string | null
          operating_style: string | null
          overlap_direction: string | null
          panel_configuration: string | null
          panel_count: number | null
          panel_fold: string | null
          part_number: string | null
          price_each: number | null
          processing_queue_id: string | null
          product_type: string | null
          quantity: number
          requires_ladder: boolean | null
          requires_takedown: boolean | null
          room_name: string | null
          shutter_frame_type: string | null
          shutter_hinge_finish: string | null
          shutter_louver_size: string | null
          shutter_mount_sides: string | null
          shutter_number_of_sides: number | null
          shutter_panel_config: string | null
          shutter_panel_fold: string | null
          shutter_panel_quantity: number | null
          shutter_sill_options: string | null
          shutter_tilt_option: string | null
          shutter_tilt_rod: string | null
          shutter_type: string | null
          side_by_side: boolean | null
          side_by_side_match: string | null
          source: string | null
          special_instructions: string | null
          split_tilt: string | null
          square_footage: number | null
          subtotal: number | null
          tax_each: number | null
          tilt_control_type: string | null
          tilt_mechanism: string | null
          total: number
          unit_price: number | null
          valance_type: string | null
          width: number | null
          window_identifier: string | null
        }
        Insert: {
          astragal_style?: string | null
          button_catch?: boolean | null
          cassette_type?: string | null
          color?: string | null
          color_code?: string | null
          control_side?: string | null
          created_at?: string
          description: string
          divider_rail?: string | null
          extraction_confidence?: string | null
          extraction_notes?: string | null
          frame_sides?: number | null
          frame_type?: string | null
          has_existing_treatments?: boolean | null
          has_hub?: boolean | null
          height?: number | null
          hinge_color?: string | null
          id?: string
          is_hard_surface?: boolean | null
          is_motorized?: boolean | null
          is_over_90?: boolean | null
          item_number?: string | null
          job_id?: string | null
          labor_each?: number | null
          line_number: number
          list_price?: number | null
          louver_size?: string | null
          measure_order_number?: string | null
          model?: string | null
          mount_type?: string | null
          opening_type?: string | null
          operating_style?: string | null
          overlap_direction?: string | null
          panel_configuration?: string | null
          panel_count?: number | null
          panel_fold?: string | null
          part_number?: string | null
          price_each?: number | null
          processing_queue_id?: string | null
          product_type?: string | null
          quantity?: number
          requires_ladder?: boolean | null
          requires_takedown?: boolean | null
          room_name?: string | null
          shutter_frame_type?: string | null
          shutter_hinge_finish?: string | null
          shutter_louver_size?: string | null
          shutter_mount_sides?: string | null
          shutter_number_of_sides?: number | null
          shutter_panel_config?: string | null
          shutter_panel_fold?: string | null
          shutter_panel_quantity?: number | null
          shutter_sill_options?: string | null
          shutter_tilt_option?: string | null
          shutter_tilt_rod?: string | null
          shutter_type?: string | null
          side_by_side?: boolean | null
          side_by_side_match?: string | null
          source?: string | null
          special_instructions?: string | null
          split_tilt?: string | null
          square_footage?: number | null
          subtotal?: number | null
          tax_each?: number | null
          tilt_control_type?: string | null
          tilt_mechanism?: string | null
          total: number
          unit_price?: number | null
          valance_type?: string | null
          width?: number | null
          window_identifier?: string | null
        }
        Update: {
          astragal_style?: string | null
          button_catch?: boolean | null
          cassette_type?: string | null
          color?: string | null
          color_code?: string | null
          control_side?: string | null
          created_at?: string
          description?: string
          divider_rail?: string | null
          extraction_confidence?: string | null
          extraction_notes?: string | null
          frame_sides?: number | null
          frame_type?: string | null
          has_existing_treatments?: boolean | null
          has_hub?: boolean | null
          height?: number | null
          hinge_color?: string | null
          id?: string
          is_hard_surface?: boolean | null
          is_motorized?: boolean | null
          is_over_90?: boolean | null
          item_number?: string | null
          job_id?: string | null
          labor_each?: number | null
          line_number?: number
          list_price?: number | null
          louver_size?: string | null
          measure_order_number?: string | null
          model?: string | null
          mount_type?: string | null
          opening_type?: string | null
          operating_style?: string | null
          overlap_direction?: string | null
          panel_configuration?: string | null
          panel_count?: number | null
          panel_fold?: string | null
          part_number?: string | null
          price_each?: number | null
          processing_queue_id?: string | null
          product_type?: string | null
          quantity?: number
          requires_ladder?: boolean | null
          requires_takedown?: boolean | null
          room_name?: string | null
          shutter_frame_type?: string | null
          shutter_hinge_finish?: string | null
          shutter_louver_size?: string | null
          shutter_mount_sides?: string | null
          shutter_number_of_sides?: number | null
          shutter_panel_config?: string | null
          shutter_panel_fold?: string | null
          shutter_panel_quantity?: number | null
          shutter_sill_options?: string | null
          shutter_tilt_option?: string | null
          shutter_tilt_rod?: string | null
          shutter_type?: string | null
          side_by_side?: boolean | null
          side_by_side_match?: string | null
          source?: string | null
          special_instructions?: string | null
          split_tilt?: string | null
          square_footage?: number | null
          subtotal?: number | null
          tax_each?: number | null
          tilt_control_type?: string | null
          tilt_mechanism?: string | null
          total?: number
          unit_price?: number | null
          valance_type?: string | null
          width?: number | null
          window_identifier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_line_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_line_items_processing_queue_id_fkey"
            columns: ["processing_queue_id"]
            isOneToOne: false
            referencedRelation: "document_processing_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      job_photos: {
        Row: {
          caption: string | null
          id: string
          image_url: string
          job_id: string
          photo_category: Database["public"]["Enums"]["photo_category"] | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          id?: string
          image_url: string
          job_id: string
          photo_category?: Database["public"]["Enums"]["photo_category"] | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          id?: string
          image_url?: string
          job_id?: string
          photo_category?: Database["public"]["Enums"]["photo_category"] | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_photos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      job_processing_locks: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          job_id: string | null
          lock_key: string
          processing_status: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          job_id?: string | null
          lock_key: string
          processing_status?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          job_id?: string | null
          lock_key?: string
          processing_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_processing_locks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_reminders: {
        Row: {
          executed: boolean | null
          frequency: Database["public"]["Enums"]["reminder_frequency"] | null
          id: string
          job_id: string
          reminder_type: string
          trigger_time: string
        }
        Insert: {
          executed?: boolean | null
          frequency?: Database["public"]["Enums"]["reminder_frequency"] | null
          id?: string
          job_id: string
          reminder_type: string
          trigger_time: string
        }
        Update: {
          executed?: boolean | null
          frequency?: Database["public"]["Enums"]["reminder_frequency"] | null
          id?: string
          job_id?: string
          reminder_type?: string
          trigger_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_reminders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_special_charges: {
        Row: {
          charge_type: string
          created_at: string
          description: string | null
          id: string
          job_id: string
          quantity: number
          total: number
          unit_fee: number
        }
        Insert: {
          charge_type: string
          created_at?: string
          description?: string | null
          id?: string
          job_id: string
          quantity?: number
          total: number
          unit_fee: number
        }
        Update: {
          charge_type?: string
          created_at?: string
          description?: string | null
          id?: string
          job_id?: string
          quantity?: number
          total?: number
          unit_fee?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_special_charges_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          account_id: string | null
          actual_product_count: number | null
          additional_services_note: string | null
          ai_agent_used: string | null
          ai_confidence_score: number | null
          ai_processed_at: string | null
          ai_processing_status: string | null
          already_measured: boolean | null
          archived_at: string | null
          arjays_dd_payment_id: string | null
          arjays_payment_status: string | null
          assigned_installer: string[] | null
          assigned_type: string | null
          balance_amount: number | null
          balance_due: number | null
          base_labor: number | null
          calculated_duration_minutes: number | null
          canceled_at: string | null
          ceiling_mount: boolean | null
          cod_amount: number | null
          completed_at: string | null
          contacted_at: string | null
          contract_number: string | null
          contractor_id: string | null
          contractor_percentage: number | null
          created_at: string | null
          creation_method: string | null
          customer_address: string
          customer_email: string | null
          customer_name: string
          customer_name_normalized: string | null
          customer_phone: string | null
          customer_phone_normalized: string | null
          customer_po: string | null
          deadline: string | null
          deleted_at: string | null
          deleted_by: string | null
          deposit_amount: number | null
          document_path: string | null
          duplicated_at: string | null
          duplicated_from: string | null
          duration_breakdown: Json | null
          duration_danny_minutes: number | null
          duration_kevin_minutes: number | null
          duration_mike_minutes: number | null
          duration_minutes: number | null
          duration_stevie_minutes: number | null
          duration_tony_minutes: number | null
          email_type: string | null
          estimated_delivery_date: string | null
          estimated_ship_date: string | null
          expected_product_count: number | null
          first_available_date: string | null
          first_sms_sent_at: string | null
          flag_ceiling_mount: boolean | null
          flag_over_10_feet: boolean | null
          flag_shutter_removal: boolean | null
          flag_stairway: boolean | null
          flag_steel_concrete: boolean | null
          flag_takedowns: boolean | null
          flag_windows_over_20ft: boolean | null
          flat_rate_mileage_fee: number | null
          form_number: string | null
          gate_code: string | null
          grand_total: number | null
          hard_surface_count: number | null
          has_3db_hub: boolean | null
          has_additional_battery: boolean | null
          has_battery_charger: boolean | null
          has_hard_surface: boolean | null
          has_internet_hub: boolean | null
          has_misc_fees: boolean | null
          has_motorization: boolean | null
          has_remote_controls: boolean | null
          has_special_quote: boolean | null
          has_stairway: boolean | null
          high_ladder_count: number | null
          high_rise_or_ferry: boolean | null
          highlight_until: string | null
          hoa_approval_required: boolean | null
          hub_count: number | null
          id: string
          incomplete_reason: string | null
          install_address_normalized: string | null
          install_date_end: string | null
          install_date_range: string | null
          install_date_start: string | null
          installation_vendor: string | null
          installer_active_in_sf: boolean | null
          installer_code: string | null
          installer_cost_chart: number | null
          installer_ids: string[] | null
          installer_quote_amount: number | null
          inventory_blinds: number | null
          inventory_boxes: number | null
          inventory_pallets: number | null
          inventory_row: string | null
          inventory_section: string | null
          inventory_updated_at: string | null
          inventory_updated_by: string | null
          invoice_amount: number | null
          invoice_approval_id: string | null
          invoice_status: Database["public"]["Enums"]["invoice_status"] | null
          invoiced_at: string | null
          is_cod: boolean | null
          is_deleted: boolean | null
          is_new_arrival: boolean | null
          is_paid: boolean | null
          job_number: string
          job_type: Database["public"]["Enums"]["job_type"]
          jobsight_link: string | null
          labor_amount: number | null
          labor_po_number: string | null
          labor_summary: number | null
          labor_total: number | null
          ladder_count: number | null
          last_confirmation_sms_at: string | null
          last_sms_response: string | null
          last_sms_response_at: string | null
          last_sms_sent_at: string | null
          latitude: number | null
          lead_time: string | null
          line_item_count_mismatch: boolean | null
          line_items_detail: Json | null
          linked_tech_measure_id: string | null
          longitude: number | null
          lowes_check_date: string | null
          lowes_check_number: string | null
          lowes_has_discrepancy: boolean | null
          lowes_payment_amount: number | null
          lowes_payment_exception_amount: number | null
          lowes_payment_item_id: string | null
          lowes_payment_status: string | null
          mark_for: string | null
          material_labor_subtotal: number | null
          material_summary: number | null
          material_total: number | null
          measure_confirmation: string | null
          measure_status: string | null
          measure_submitted_at: string | null
          misc_fees_amount: number | null
          model_program: string | null
          mts_job_number: string | null
          must_be_tech:
            | Database["public"]["Enums"]["must_be_tech_option"]
            | null
          needs_document_download: boolean | null
          needs_mileage_pay: boolean | null
          new_arrival_at: string | null
          num_blinds_shades: number | null
          num_cut_downs: number | null
          num_draperies: number | null
          num_hard_surface: number | null
          num_items: number | null
          num_ladders: number | null
          num_outside_mount: number | null
          num_over_90_wide: number | null
          num_shutter_tracks: number | null
          num_shutters: number | null
          num_takedowns: number | null
          number_of_blinds_shades: number | null
          number_of_drapery: number | null
          number_of_miles: number | null
          number_of_motorized: number | null
          number_of_shutters: number | null
          number_of_windows_to_measure: number | null
          notes: string | null;
          on_hold_reason: string | null
          order_id: string | null
          order_verified: boolean | null
          order_verified_at: string | null
          order_verified_by: string | null
          ordered_date: string | null
          over_10_feet: boolean | null
          payment_amount: number | null
          payment_date: string | null
          payment_period_id: string | null
          payment_terms: string | null
          permanent_delete_at: string | null
          pickup_at_store: boolean | null
          portal_priority_requested: boolean | null
          portal_priority_requested_at: string | null
          product_location: string | null
          product_received_at: string | null
          product_type: Database["public"]["Enums"]["product_type"]
          project_number: string | null
          qb_invoice_id: string | null
          quantity_hard_surface: number | null
          quantity_high_windows_10_14ft: number | null
          quantity_high_windows_14_20ft: number | null
          quantity_outside_mount: number | null
          quantity_over_90_inches: number | null
          quote_date: string | null
          remeasure_needed: boolean | null
          remeasure_required: boolean | null
          requires_manual_review: boolean | null
          requires_phone_call: boolean | null
          retailer: string | null
          retailer_phone: string | null
          return_trip_type: string | null
          sales_order_number: string | null
          salesman: string | null
          salesperson: string | null
          salesperson_name: string | null
          scheduled_by: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          separate_valance_count: number | null
          service_level: string | null
          service_report_base_snapshot: Json | null
          service_report_data: Json | null
          service_report_final_snapshot: Json | null
          service_report_snapshot_version: number
          service_report_submitted_at: string | null
          service_report_template: string | null
          shutter_removal_quote: number | null
          shutter_track_count: number | null
          sidemark: string | null
          skylight_count: number | null
          sms_message_left_at: string | null
          sms_message_left_count: number | null
          specialty_shape_windows: number | null
          split_from_job_id: string | null
          split_to_job_ids: string[] | null
          springs_order: string | null
          square_footage: number | null
          status: Database["public"]["Enums"]["job_status"] | null
          status_changed_at: string | null
          steel_or_concrete: boolean | null
          store_number: string | null
          tallest_height: number | null
          tallest_window_feet: number | null
          tax_rate: number | null
          tax_summary: number | null
          tax_total: number | null
          technician_inventory_boxes: number | null
          technician_inventory_notes: string | null
          technician_inventory_section: string | null
          technician_inventory_updated_at: string | null
          technician_inventory_updated_by: string | null
          technician_notes: string | null
          total_products: number | null
          unit_number: string | null
          updated_at: string | null
          vendor: string | null
          vendor_name: string | null
          vn_form_number: string | null
          vn_quote_date: string | null
          vn_session_id: string | null
          windows_to_measure: number | null
          wo_number: string | null
          work_order_type: string | null
        }
        Insert: {
          account_id?: string | null
          actual_product_count?: number | null
          additional_services_note?: string | null
          ai_agent_used?: string | null
          ai_confidence_score?: number | null
          ai_processed_at?: string | null
          ai_processing_status?: string | null
          already_measured?: boolean | null
          archived_at?: string | null
          arjays_dd_payment_id?: string | null
          arjays_payment_status?: string | null
          assigned_installer?: string[] | null
          assigned_type?: string | null
          balance_amount?: number | null
          balance_due?: number | null
          base_labor?: number | null
          calculated_duration_minutes?: number | null
          canceled_at?: string | null
          ceiling_mount?: boolean | null
          cod_amount?: number | null
          completed_at?: string | null
          contacted_at?: string | null
          contract_number?: string | null
          contractor_id?: string | null
          contractor_percentage?: number | null
          created_at?: string | null
          creation_method?: string | null
          customer_address: string
          customer_email?: string | null
          customer_name: string
          customer_name_normalized?: string | null
          customer_phone?: string | null
          customer_phone_normalized?: string | null
          customer_po?: string | null
          deadline?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deposit_amount?: number | null
          document_path?: string | null
          duplicated_at?: string | null
          duplicated_from?: string | null
          duration_breakdown?: Json | null
          duration_danny_minutes?: number | null
          duration_kevin_minutes?: number | null
          duration_mike_minutes?: number | null
          duration_minutes?: number | null
          duration_stevie_minutes?: number | null
          duration_tony_minutes?: number | null
          email_type?: string | null
          estimated_delivery_date?: string | null
          estimated_ship_date?: string | null
          expected_product_count?: number | null
          first_available_date?: string | null
          first_sms_sent_at?: string | null
          flag_ceiling_mount?: boolean | null
          flag_over_10_feet?: boolean | null
          flag_shutter_removal?: boolean | null
          flag_stairway?: boolean | null
          flag_steel_concrete?: boolean | null
          flag_takedowns?: boolean | null
          flag_windows_over_20ft?: boolean | null
          flat_rate_mileage_fee?: number | null
          form_number?: string | null
          gate_code?: string | null
          grand_total?: number | null
          hard_surface_count?: number | null
          has_3db_hub?: boolean | null
          has_additional_battery?: boolean | null
          has_battery_charger?: boolean | null
          has_hard_surface?: boolean | null
          has_internet_hub?: boolean | null
          has_misc_fees?: boolean | null
          has_motorization?: boolean | null
          has_remote_controls?: boolean | null
          has_special_quote?: boolean | null
          has_stairway?: boolean | null
          high_ladder_count?: number | null
          high_rise_or_ferry?: boolean | null
          highlight_until?: string | null
          hoa_approval_required?: boolean | null
          hub_count?: number | null
          id?: string
          incomplete_reason?: string | null
          install_address_normalized?: string | null
          install_date_end?: string | null
          install_date_range?: string | null
          install_date_start?: string | null
          installation_vendor?: string | null
          installer_active_in_sf?: boolean | null
          installer_code?: string | null
          installer_cost_chart?: number | null
          installer_ids?: string[] | null
          installer_quote_amount?: number | null
          inventory_blinds?: number | null
          inventory_boxes?: number | null
          inventory_pallets?: number | null
          inventory_row?: string | null
          inventory_section?: string | null
          inventory_updated_at?: string | null
          inventory_updated_by?: string | null
          invoice_amount?: number | null
          invoice_approval_id?: string | null
          invoice_status?: Database["public"]["Enums"]["invoice_status"] | null
          invoiced_at?: string | null
          is_cod?: boolean | null
          is_deleted?: boolean | null
          is_new_arrival?: boolean | null
          is_paid?: boolean | null
          job_number: string
          job_type: Database["public"]["Enums"]["job_type"]
          jobsight_link?: string | null
          labor_amount?: number | null
          labor_po_number?: string | null
          labor_summary?: number | null
          labor_total?: number | null
          ladder_count?: number | null
          last_confirmation_sms_at?: string | null
          last_sms_response?: string | null
          last_sms_response_at?: string | null
          last_sms_sent_at?: string | null
          latitude?: number | null
          lead_time?: string | null
          line_item_count_mismatch?: boolean | null
          line_items_detail?: Json | null
          linked_tech_measure_id?: string | null
          longitude?: number | null
          lowes_check_date?: string | null
          lowes_check_number?: string | null
          lowes_has_discrepancy?: boolean | null
          lowes_payment_amount?: number | null
          lowes_payment_exception_amount?: number | null
          lowes_payment_item_id?: string | null
          lowes_payment_status?: string | null
          mark_for?: string | null
          material_labor_subtotal?: number | null
          material_summary?: number | null
          material_total?: number | null
          measure_confirmation?: string | null
          measure_status?: string | null
          measure_submitted_at?: string | null
          misc_fees_amount?: number | null
          model_program?: string | null
          mts_job_number?: string | null
          must_be_tech?:
            | Database["public"]["Enums"]["must_be_tech_option"]
            | null
          needs_document_download?: boolean | null
          needs_mileage_pay?: boolean | null
          new_arrival_at?: string | null
          num_blinds_shades?: number | null
          num_cut_downs?: number | null
          num_draperies?: number | null
          num_hard_surface?: number | null
          num_items?: number | null
          num_ladders?: number | null
          num_outside_mount?: number | null
          num_over_90_wide?: number | null
          num_shutter_tracks?: number | null
          num_shutters?: number | null
          num_takedowns?: number | null
          number_of_blinds_shades?: number | null
          number_of_drapery?: number | null
          number_of_miles?: number | null
          number_of_motorized?: number | null
          number_of_shutters?: number | null
          number_of_windows_to_measure?: number | null
          notes?: string | null;
          on_hold_reason?: string | null
          order_id?: string | null
          order_verified?: boolean | null
          order_verified_at?: string | null
          order_verified_by?: string | null
          ordered_date?: string | null
          over_10_feet?: boolean | null
          payment_amount?: number | null
          payment_date?: string | null
          payment_period_id?: string | null
          payment_terms?: string | null
          permanent_delete_at?: string | null
          pickup_at_store?: boolean | null
          portal_priority_requested?: boolean | null
          portal_priority_requested_at?: string | null
          product_location?: string | null
          product_received_at?: string | null
          product_type: Database["public"]["Enums"]["product_type"]
          project_number?: string | null
          qb_invoice_id?: string | null
          quantity_hard_surface?: number | null
          quantity_high_windows_10_14ft?: number | null
          quantity_high_windows_14_20ft?: number | null
          quantity_outside_mount?: number | null
          quantity_over_90_inches?: number | null
          quote_date?: string | null
          remeasure_needed?: boolean | null
          remeasure_required?: boolean | null
          requires_manual_review?: boolean | null
          requires_phone_call?: boolean | null
          retailer?: string | null
          retailer_phone?: string | null
          return_trip_type?: string | null
          sales_order_number?: string | null
          salesman?: string | null
          salesperson?: string | null
          salesperson_name?: string | null
          scheduled_by?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          separate_valance_count?: number | null
          service_level?: string | null
          service_report_base_snapshot?: Json | null
          service_report_data?: Json | null
          service_report_final_snapshot?: Json | null
          service_report_snapshot_version?: number
          service_report_submitted_at?: string | null
          service_report_template?: string | null
          shutter_removal_quote?: number | null
          shutter_track_count?: number | null
          sidemark?: string | null
          skylight_count?: number | null
          sms_message_left_at?: string | null
          sms_message_left_count?: number | null
          specialty_shape_windows?: number | null
          split_from_job_id?: string | null
          split_to_job_ids?: string[] | null
          springs_order?: string | null
          square_footage?: number | null
          status?: Database["public"]["Enums"]["job_status"] | null
          status_changed_at?: string | null
          steel_or_concrete?: boolean | null
          store_number?: string | null
          tallest_height?: number | null
          tallest_window_feet?: number | null
          tax_rate?: number | null
          tax_summary?: number | null
          tax_total?: number | null
          technician_inventory_boxes?: number | null
          technician_inventory_notes?: string | null
          technician_inventory_section?: string | null
          technician_inventory_updated_at?: string | null
          technician_inventory_updated_by?: string | null
          technician_notes?: string | null
          total_products?: number | null
          unit_number?: string | null
          updated_at?: string | null
          vendor?: string | null
          vendor_name?: string | null
          vn_form_number?: string | null
          vn_quote_date?: string | null
          vn_session_id?: string | null
          windows_to_measure?: number | null
          wo_number?: string | null
          work_order_type?: string | null
        }
        Update: {
          account_id?: string | null
          actual_product_count?: number | null
          additional_services_note?: string | null
          ai_agent_used?: string | null
          ai_confidence_score?: number | null
          ai_processed_at?: string | null
          ai_processing_status?: string | null
          already_measured?: boolean | null
          archived_at?: string | null
          arjays_dd_payment_id?: string | null
          arjays_payment_status?: string | null
          assigned_installer?: string[] | null
          assigned_type?: string | null
          balance_amount?: number | null
          balance_due?: number | null
          base_labor?: number | null
          calculated_duration_minutes?: number | null
          canceled_at?: string | null
          ceiling_mount?: boolean | null
          cod_amount?: number | null
          completed_at?: string | null
          contacted_at?: string | null
          contract_number?: string | null
          contractor_id?: string | null
          contractor_percentage?: number | null
          created_at?: string | null
          creation_method?: string | null
          customer_address?: string
          customer_email?: string | null
          customer_name?: string
          customer_name_normalized?: string | null
          customer_phone?: string | null
          customer_phone_normalized?: string | null
          customer_po?: string | null
          deadline?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deposit_amount?: number | null
          document_path?: string | null
          duplicated_at?: string | null
          duplicated_from?: string | null
          duration_breakdown?: Json | null
          duration_danny_minutes?: number | null
          duration_kevin_minutes?: number | null
          duration_mike_minutes?: number | null
          duration_minutes?: number | null
          duration_stevie_minutes?: number | null
          duration_tony_minutes?: number | null
          email_type?: string | null
          estimated_delivery_date?: string | null
          estimated_ship_date?: string | null
          expected_product_count?: number | null
          first_available_date?: string | null
          first_sms_sent_at?: string | null
          flag_ceiling_mount?: boolean | null
          flag_over_10_feet?: boolean | null
          flag_shutter_removal?: boolean | null
          flag_stairway?: boolean | null
          flag_steel_concrete?: boolean | null
          flag_takedowns?: boolean | null
          flag_windows_over_20ft?: boolean | null
          flat_rate_mileage_fee?: number | null
          form_number?: string | null
          gate_code?: string | null
          grand_total?: number | null
          hard_surface_count?: number | null
          has_3db_hub?: boolean | null
          has_additional_battery?: boolean | null
          has_battery_charger?: boolean | null
          has_hard_surface?: boolean | null
          has_internet_hub?: boolean | null
          has_misc_fees?: boolean | null
          has_motorization?: boolean | null
          has_remote_controls?: boolean | null
          has_special_quote?: boolean | null
          has_stairway?: boolean | null
          high_ladder_count?: number | null
          high_rise_or_ferry?: boolean | null
          highlight_until?: string | null
          hoa_approval_required?: boolean | null
          hub_count?: number | null
          id?: string
          incomplete_reason?: string | null
          install_address_normalized?: string | null
          install_date_end?: string | null
          install_date_range?: string | null
          install_date_start?: string | null
          installation_vendor?: string | null
          installer_active_in_sf?: boolean | null
          installer_code?: string | null
          installer_cost_chart?: number | null
          installer_ids?: string[] | null
          installer_quote_amount?: number | null
          inventory_blinds?: number | null
          inventory_boxes?: number | null
          inventory_pallets?: number | null
          inventory_row?: string | null
          inventory_section?: string | null
          inventory_updated_at?: string | null
          inventory_updated_by?: string | null
          invoice_amount?: number | null
          invoice_approval_id?: string | null
          invoice_status?: Database["public"]["Enums"]["invoice_status"] | null
          invoiced_at?: string | null
          is_cod?: boolean | null
          is_deleted?: boolean | null
          is_new_arrival?: boolean | null
          is_paid?: boolean | null
          job_number?: string
          job_type?: Database["public"]["Enums"]["job_type"]
          jobsight_link?: string | null
          labor_amount?: number | null
          labor_po_number?: string | null
          labor_summary?: number | null
          labor_total?: number | null
          ladder_count?: number | null
          last_confirmation_sms_at?: string | null
          last_sms_response?: string | null
          last_sms_response_at?: string | null
          last_sms_sent_at?: string | null
          latitude?: number | null
          lead_time?: string | null
          line_item_count_mismatch?: boolean | null
          line_items_detail?: Json | null
          linked_tech_measure_id?: string | null
          longitude?: number | null
          lowes_check_date?: string | null
          lowes_check_number?: string | null
          lowes_has_discrepancy?: boolean | null
          lowes_payment_amount?: number | null
          lowes_payment_exception_amount?: number | null
          lowes_payment_item_id?: string | null
          lowes_payment_status?: string | null
          mark_for?: string | null
          material_labor_subtotal?: number | null
          material_summary?: number | null
          material_total?: number | null
          measure_confirmation?: string | null
          measure_status?: string | null
          measure_submitted_at?: string | null
          misc_fees_amount?: number | null
          model_program?: string | null
          mts_job_number?: string | null
          must_be_tech?:
            | Database["public"]["Enums"]["must_be_tech_option"]
            | null
          needs_document_download?: boolean | null
          needs_mileage_pay?: boolean | null
          new_arrival_at?: string | null
          num_blinds_shades?: number | null
          num_cut_downs?: number | null
          num_draperies?: number | null
          num_hard_surface?: number | null
          num_items?: number | null
          num_ladders?: number | null
          num_outside_mount?: number | null
          num_over_90_wide?: number | null
          num_shutter_tracks?: number | null
          num_shutters?: number | null
          num_takedowns?: number | null
          number_of_blinds_shades?: number | null
          number_of_drapery?: number | null
          number_of_miles?: number | null
          number_of_motorized?: number | null
          number_of_shutters?: number | null
          number_of_windows_to_measure?: number | null
          notes?: string | null;
          on_hold_reason?: string | null
          order_id?: string | null
          order_verified?: boolean | null
          order_verified_at?: string | null
          order_verified_by?: string | null
          ordered_date?: string | null
          over_10_feet?: boolean | null
          payment_amount?: number | null
          payment_date?: string | null
          payment_period_id?: string | null
          payment_terms?: string | null
          permanent_delete_at?: string | null
          pickup_at_store?: boolean | null
          portal_priority_requested?: boolean | null
          portal_priority_requested_at?: string | null
          product_location?: string | null
          product_received_at?: string | null
          product_type?: Database["public"]["Enums"]["product_type"]
          project_number?: string | null
          qb_invoice_id?: string | null
          quantity_hard_surface?: number | null
          quantity_high_windows_10_14ft?: number | null
          quantity_high_windows_14_20ft?: number | null
          quantity_outside_mount?: number | null
          quantity_over_90_inches?: number | null
          quote_date?: string | null
          remeasure_needed?: boolean | null
          remeasure_required?: boolean | null
          requires_manual_review?: boolean | null
          requires_phone_call?: boolean | null
          retailer?: string | null
          retailer_phone?: string | null
          return_trip_type?: string | null
          sales_order_number?: string | null
          salesman?: string | null
          salesperson?: string | null
          salesperson_name?: string | null
          scheduled_by?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          separate_valance_count?: number | null
          service_level?: string | null
          service_report_base_snapshot?: Json | null
          service_report_data?: Json | null
          service_report_final_snapshot?: Json | null
          service_report_snapshot_version?: number
          service_report_submitted_at?: string | null
          service_report_template?: string | null
          shutter_removal_quote?: number | null
          shutter_track_count?: number | null
          sidemark?: string | null
          skylight_count?: number | null
          sms_message_left_at?: string | null
          sms_message_left_count?: number | null
          specialty_shape_windows?: number | null
          split_from_job_id?: string | null
          split_to_job_ids?: string[] | null
          springs_order?: string | null
          square_footage?: number | null
          status?: Database["public"]["Enums"]["job_status"] | null
          status_changed_at?: string | null
          steel_or_concrete?: boolean | null
          store_number?: string | null
          tallest_height?: number | null
          tallest_window_feet?: number | null
          tax_rate?: number | null
          tax_summary?: number | null
          tax_total?: number | null
          technician_inventory_boxes?: number | null
          technician_inventory_notes?: string | null
          technician_inventory_section?: string | null
          technician_inventory_updated_at?: string | null
          technician_inventory_updated_by?: string | null
          technician_notes?: string | null
          total_products?: number | null
          unit_number?: string | null
          updated_at?: string | null
          vendor?: string | null
          vendor_name?: string | null
          vn_form_number?: string | null
          vn_quote_date?: string | null
          vn_session_id?: string | null
          windows_to_measure?: number | null
          wo_number?: string | null
          work_order_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_arjays_dd_payment_id_fkey"
            columns: ["arjays_dd_payment_id"]
            isOneToOne: false
            referencedRelation: "arjays_dd_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_invoice_approval_id_fkey"
            columns: ["invoice_approval_id"]
            isOneToOne: false
            referencedRelation: "invoice_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_linked_tech_measure_id_fkey"
            columns: ["linked_tech_measure_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_payment_period_id_fkey"
            columns: ["payment_period_id"]
            isOneToOne: false
            referencedRelation: "payment_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_split_from_job_id_fkey"
            columns: ["split_from_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      lowes_payment_discrepancies: {
        Row: {
          contractor_name: string | null
          created_at: string | null
          custom_payment_amount: number | null
          customer_name: string | null
          difference: number
          expected_amount: number
          id: string
          invoice_number: string | null
          is_contractor_job: boolean | null
          job_id: string | null
          job_number: string | null
          paid_amount: number
          payment_item_id: string
          po_number: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          show_on_admin_dashboard: boolean | null
          show_on_contractor_dashboard: boolean | null
          status: string | null
        }
        Insert: {
          contractor_name?: string | null
          created_at?: string | null
          custom_payment_amount?: number | null
          customer_name?: string | null
          difference: number
          expected_amount: number
          id?: string
          invoice_number?: string | null
          is_contractor_job?: boolean | null
          job_id?: string | null
          job_number?: string | null
          paid_amount: number
          payment_item_id: string
          po_number: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          show_on_admin_dashboard?: boolean | null
          show_on_contractor_dashboard?: boolean | null
          status?: string | null
        }
        Update: {
          contractor_name?: string | null
          created_at?: string | null
          custom_payment_amount?: number | null
          customer_name?: string | null
          difference?: number
          expected_amount?: number
          id?: string
          invoice_number?: string | null
          is_contractor_job?: boolean | null
          job_id?: string | null
          job_number?: string | null
          paid_amount?: number
          payment_item_id?: string
          po_number?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          show_on_admin_dashboard?: boolean | null
          show_on_contractor_dashboard?: boolean | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lowes_payment_discrepancies_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lowes_payment_discrepancies_payment_item_id_fkey"
            columns: ["payment_item_id"]
            isOneToOne: false
            referencedRelation: "lowes_payment_items"
            referencedColumns: ["id"]
          },
        ]
      }
      lowes_payment_documents: {
        Row: {
          archived_pdf_url: string | null
          created_at: string | null
          discrepancy_jobs: number | null
          document_date: string | null
          document_type_recognized: boolean | null
          error_message: string | null
          id: string
          is_lowes_document: boolean | null
          matched_jobs: number | null
          original_filename: string
          pdf_url: string
          processed_at: string | null
          processed_by: string | null
          processing_status: string | null
          total_amount: number | null
          total_payments_count: number | null
          unmatched_jobs: number | null
          upload_date: string | null
        }
        Insert: {
          archived_pdf_url?: string | null
          created_at?: string | null
          discrepancy_jobs?: number | null
          document_date?: string | null
          document_type_recognized?: boolean | null
          error_message?: string | null
          id?: string
          is_lowes_document?: boolean | null
          matched_jobs?: number | null
          original_filename: string
          pdf_url: string
          processed_at?: string | null
          processed_by?: string | null
          processing_status?: string | null
          total_amount?: number | null
          total_payments_count?: number | null
          unmatched_jobs?: number | null
          upload_date?: string | null
        }
        Update: {
          archived_pdf_url?: string | null
          created_at?: string | null
          discrepancy_jobs?: number | null
          document_date?: string | null
          document_type_recognized?: boolean | null
          error_message?: string | null
          id?: string
          is_lowes_document?: boolean | null
          matched_jobs?: number | null
          original_filename?: string
          pdf_url?: string
          processed_at?: string | null
          processed_by?: string | null
          processing_status?: string | null
          total_amount?: number | null
          total_payments_count?: number | null
          unmatched_jobs?: number | null
          upload_date?: string | null
        }
        Relationships: []
      }
      lowes_payment_items: {
        Row: {
          amount_matches: boolean | null
          check_date: string | null
          check_number: string | null
          contractor_name: string | null
          created_at: string | null
          custom_payment_amount: number | null
          customer_name: string | null
          discrepancy_amount: number | null
          document_id: string
          expected_labor_amount: number | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          is_contractor_job: boolean | null
          job_id: string | null
          job_number: string | null
          match_found: boolean | null
          paid_amount: number
          po_number: string | null
          resolution_notes: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
          store_number: string | null
        }
        Insert: {
          amount_matches?: boolean | null
          check_date?: string | null
          check_number?: string | null
          contractor_name?: string | null
          created_at?: string | null
          custom_payment_amount?: number | null
          customer_name?: string | null
          discrepancy_amount?: number | null
          document_id: string
          expected_labor_amount?: number | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          is_contractor_job?: boolean | null
          job_id?: string | null
          job_number?: string | null
          match_found?: boolean | null
          paid_amount: number
          po_number?: string | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          store_number?: string | null
        }
        Update: {
          amount_matches?: boolean | null
          check_date?: string | null
          check_number?: string | null
          contractor_name?: string | null
          created_at?: string | null
          custom_payment_amount?: number | null
          customer_name?: string | null
          discrepancy_amount?: number | null
          document_id?: string
          expected_labor_amount?: number | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          is_contractor_job?: boolean | null
          job_id?: string | null
          job_number?: string | null
          match_found?: boolean | null
          paid_amount?: number
          po_number?: string | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          store_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lowes_payment_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "lowes_payment_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lowes_payment_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      lowes_stores: {
        Row: {
          address: string | null
          city: string | null
          contractor: string
          created_at: string | null
          id: string
          state: string | null
          store_number: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          contractor?: string
          created_at?: string | null
          id?: string
          state?: string | null
          store_number: string
        }
        Update: {
          address?: string | null
          city?: string | null
          contractor?: string
          created_at?: string | null
          id?: string
          state?: string | null
          store_number?: string
        }
        Relationships: []
      }
      lowes_unmatched_pr_payments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_job_id: string | null
          candidate_job_ids: string[] | null
          check_amount: number | null
          check_date: string | null
          check_number: string | null
          created_at: string | null
          discount: number | null
          document_id: string | null
          id: string
          invoice_amount: number | null
          invoice_date: string | null
          invoice_number: string
          status: string
          store_number: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_job_id?: string | null
          candidate_job_ids?: string[] | null
          check_amount?: number | null
          check_date?: string | null
          check_number?: string | null
          created_at?: string | null
          discount?: number | null
          document_id?: string | null
          id?: string
          invoice_amount?: number | null
          invoice_date?: string | null
          invoice_number: string
          status?: string
          store_number?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_job_id?: string | null
          candidate_job_ids?: string[] | null
          check_amount?: number | null
          check_date?: string | null
          check_number?: string | null
          created_at?: string | null
          discount?: number | null
          document_id?: string | null
          id?: string
          invoice_amount?: number | null
          invoice_date?: string | null
          invoice_number?: string
          status?: string
          store_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lowes_unmatched_pr_payments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lowes_unmatched_pr_payments_assigned_job_id_fkey"
            columns: ["assigned_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lowes_unmatched_pr_payments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "lowes_payment_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      lowes_webhook_inbox: {
        Row: {
          created_at: string
          dispatched: boolean
          dispatched_at: string | null
          event_id: string
          id: string
          job_id: string
          lane: string
          payload: Json
          received_at: string
          status: string
        }
        Insert: {
          created_at?: string
          dispatched?: boolean
          dispatched_at?: string | null
          event_id: string
          id?: string
          job_id: string
          lane: string
          payload?: Json
          received_at?: string
          status: string
        }
        Update: {
          created_at?: string
          dispatched?: boolean
          dispatched_at?: string | null
          event_id?: string
          id?: string
          job_id?: string
          lane?: string
          payload?: Json
          received_at?: string
          status?: string
        }
        Relationships: []
      }
      measure_forms: {
        Row: {
          created_at: string | null
          customer_name: string
          id: string
          job_id: string | null
          line_items: Json | null
          measure_address: string
          measure_notes: string | null
          per_stop_pay: number | null
          standard_qty: number | null
          status: string
          updated_at: string | null
          windows_to_measure: number | null
        }
        Insert: {
          created_at?: string | null
          customer_name: string
          id?: string
          job_id?: string | null
          line_items?: Json | null
          measure_address: string
          measure_notes?: string | null
          per_stop_pay?: number | null
          standard_qty?: number | null
          status?: string
          updated_at?: string | null
          windows_to_measure?: number | null
        }
        Update: {
          created_at?: string | null
          customer_name?: string
          id?: string
          job_id?: string | null
          line_items?: Json | null
          measure_address?: string
          measure_notes?: string | null
          per_stop_pay?: number | null
          standard_qty?: number | null
          status?: string
          updated_at?: string | null
          windows_to_measure?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "measure_forms_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      measure_tech_pre_assignments: {
        Row: {
          account_id: string | null
          assigned_at: string
          assigned_by_installer_id: string | null
          consumed: boolean
          consumed_by_job_id: string | null
          created_at: string
          customer_address: string | null
          customer_name: string
          expires_at: string
          id: string
          job_number: string | null
          measure_job_id: string | null
          must_be_tech:
            | Database["public"]["Enums"]["must_be_tech_option"]
            | null
        }
        Insert: {
          account_id?: string | null
          assigned_at?: string
          assigned_by_installer_id?: string | null
          consumed?: boolean
          consumed_by_job_id?: string | null
          created_at?: string
          customer_address?: string | null
          customer_name: string
          expires_at?: string
          id?: string
          job_number?: string | null
          measure_job_id?: string | null
          must_be_tech?:
            | Database["public"]["Enums"]["must_be_tech_option"]
            | null
        }
        Update: {
          account_id?: string | null
          assigned_at?: string
          assigned_by_installer_id?: string | null
          consumed?: boolean
          consumed_by_job_id?: string | null
          created_at?: string
          customer_address?: string | null
          customer_name?: string
          expires_at?: string
          id?: string
          job_number?: string | null
          measure_job_id?: string | null
          must_be_tech?:
            | Database["public"]["Enums"]["must_be_tech_option"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "measure_tech_pre_assignments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measure_tech_pre_assignments_assigned_by_installer_id_fkey"
            columns: ["assigned_by_installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measure_tech_pre_assignments_consumed_by_job_id_fkey"
            columns: ["consumed_by_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measure_tech_pre_assignments_measure_job_id_fkey"
            columns: ["measure_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_app_layout: {
        Row: {
          created_at: string
          element_order: Json
          id: string
          section_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          element_order?: Json
          id?: string
          section_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          element_order?: Json
          id?: string
          section_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      outbound_webhook_logs: {
        Row: {
          account_id: string | null
          created_at: string | null
          error_message: string | null
          event_type: string
          id: string
          idempotency_key: string | null
          job_id: string | null
          job_number: string | null
          reference_id: string | null
          request_payload: Json | null
          response_body: string | null
          response_status: number | null
          sent_at: string | null
          success: boolean | null
          webhook_url: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          idempotency_key?: string | null
          job_id?: string | null
          job_number?: string | null
          reference_id?: string | null
          request_payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          sent_at?: string | null
          success?: boolean | null
          webhook_url?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string | null
          job_id?: string | null
          job_number?: string | null
          reference_id?: string | null
          request_payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          sent_at?: string | null
          success?: boolean | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outbound_webhook_logs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_webhook_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_webhooks: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
          webhook_url: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
          webhook_url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
          webhook_url?: string
        }
        Relationships: []
      }
      payment_batch_items: {
        Row: {
          contractor_payment: number
          contractor_payment_id: string
          created_at: string | null
          customer_name: string
          id: string
          invoice_amount: number
          job_id: string | null
          job_number: string
          job_type: string
          payment_batch_id: string
        }
        Insert: {
          contractor_payment: number
          contractor_payment_id: string
          created_at?: string | null
          customer_name: string
          id?: string
          invoice_amount: number
          job_id?: string | null
          job_number: string
          job_type: string
          payment_batch_id: string
        }
        Update: {
          contractor_payment?: number
          contractor_payment_id?: string
          created_at?: string | null
          customer_name?: string
          id?: string
          invoice_amount?: number
          job_id?: string | null
          job_number?: string
          job_type?: string
          payment_batch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_batch_items_contractor_payment_id_fkey"
            columns: ["contractor_payment_id"]
            isOneToOne: false
            referencedRelation: "contractor_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_batch_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_batch_items_payment_batch_id_fkey"
            columns: ["payment_batch_id"]
            isOneToOne: false
            referencedRelation: "payment_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_batches: {
        Row: {
          batch_name: string
          contractor_name: string
          created_at: string | null
          created_by: string | null
          data_fee_total: number | null
          email_sent: boolean | null
          email_sent_at: string | null
          email_sent_to: string[] | null
          id: string
          installation_20_percent: number | null
          installation_80_percent: number | null
          installation_count: number | null
          non_installation_100_percent: number | null
          other_count: number | null
          payment_week_end: string
          payment_week_start: string
          return_trip_count: number | null
          status: string | null
          tech_measure_count: number | null
          total_check_amount: number | null
          total_invoice_amount: number | null
          total_jobs_count: number | null
          updated_at: string | null
        }
        Insert: {
          batch_name: string
          contractor_name: string
          created_at?: string | null
          created_by?: string | null
          data_fee_total?: number | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          email_sent_to?: string[] | null
          id?: string
          installation_20_percent?: number | null
          installation_80_percent?: number | null
          installation_count?: number | null
          non_installation_100_percent?: number | null
          other_count?: number | null
          payment_week_end: string
          payment_week_start: string
          return_trip_count?: number | null
          status?: string | null
          tech_measure_count?: number | null
          total_check_amount?: number | null
          total_invoice_amount?: number | null
          total_jobs_count?: number | null
          updated_at?: string | null
        }
        Update: {
          batch_name?: string
          contractor_name?: string
          created_at?: string | null
          created_by?: string | null
          data_fee_total?: number | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          email_sent_to?: string[] | null
          id?: string
          installation_20_percent?: number | null
          installation_80_percent?: number | null
          installation_count?: number | null
          non_installation_100_percent?: number | null
          other_count?: number | null
          payment_week_end?: string
          payment_week_start?: string
          return_trip_count?: number | null
          status?: string | null
          tech_measure_count?: number | null
          total_check_amount?: number | null
          total_invoice_amount?: number | null
          total_jobs_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      payment_periods: {
        Row: {
          contractor_name: string
          created_at: string | null
          id: string
          installation_count: number | null
          installation_total: number | null
          is_processed: boolean | null
          other_jobs_count: number | null
          other_jobs_total: number | null
          payment_date: string
          period_end: string
          period_start: string
          return_trip_count: number | null
          return_trip_total: number | null
          tech_measure_count: number | null
          tech_measure_total: number | null
          total_data_fees: number | null
          total_invoice_amount: number | null
          total_jobs_count: number | null
          total_mts_holdback: number | null
          total_paid_amount: number | null
          updated_at: string | null
        }
        Insert: {
          contractor_name: string
          created_at?: string | null
          id?: string
          installation_count?: number | null
          installation_total?: number | null
          is_processed?: boolean | null
          other_jobs_count?: number | null
          other_jobs_total?: number | null
          payment_date: string
          period_end: string
          period_start: string
          return_trip_count?: number | null
          return_trip_total?: number | null
          tech_measure_count?: number | null
          tech_measure_total?: number | null
          total_data_fees?: number | null
          total_invoice_amount?: number | null
          total_jobs_count?: number | null
          total_mts_holdback?: number | null
          total_paid_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          contractor_name?: string
          created_at?: string | null
          id?: string
          installation_count?: number | null
          installation_total?: number | null
          is_processed?: boolean | null
          other_jobs_count?: number | null
          other_jobs_total?: number | null
          payment_date?: string
          period_end?: string
          period_start?: string
          return_trip_count?: number | null
          return_trip_total?: number | null
          tech_measure_count?: number | null
          tech_measure_total?: number | null
          total_data_fees?: number | null
          total_invoice_amount?: number | null
          total_jobs_count?: number | null
          total_mts_holdback?: number | null
          total_paid_amount?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      pending_invoices: {
        Row: {
          account_id: string | null
          adjustments: Json | null
          base_charge: number | null
          calculation_notes: string | null
          created_at: string | null
          customer_name: string
          id: string
          invoiced_at: string | null
          job_id: string
          job_number: string
          job_type: string
          line_items: Json | null
          missing_data_reason: string | null
          missing_invoice_data: boolean | null
          product_type: string
          qb_invoice_id: string | null
          qb_invoice_number: string | null
          requires_review: boolean | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          subtotal: number | null
          total_amount: number | null
        }
        Insert: {
          account_id?: string | null
          adjustments?: Json | null
          base_charge?: number | null
          calculation_notes?: string | null
          created_at?: string | null
          customer_name: string
          id?: string
          invoiced_at?: string | null
          job_id: string
          job_number: string
          job_type: string
          line_items?: Json | null
          missing_data_reason?: string | null
          missing_invoice_data?: boolean | null
          product_type: string
          qb_invoice_id?: string | null
          qb_invoice_number?: string | null
          requires_review?: boolean | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          subtotal?: number | null
          total_amount?: number | null
        }
        Update: {
          account_id?: string | null
          adjustments?: Json | null
          base_charge?: number | null
          calculation_notes?: string | null
          created_at?: string | null
          customer_name?: string
          id?: string
          invoiced_at?: string | null
          job_id?: string
          job_number?: string
          job_type?: string
          line_items?: Json | null
          missing_data_reason?: string | null
          missing_invoice_data?: boolean | null
          product_type?: string
          qb_invoice_id?: string | null
          qb_invoice_number?: string | null
          requires_review?: boolean | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          subtotal?: number | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_invoices_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_invoices_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_invoices_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_notification_emails: {
        Row: {
          account_id: string
          created_at: string | null
          email: string
          id: string
          notify_on_called: boolean | null
          notify_on_complete: boolean | null
          notify_on_incomplete: boolean | null
          notify_on_scheduled: boolean | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          email: string
          id?: string
          notify_on_called?: boolean | null
          notify_on_complete?: boolean | null
          notify_on_incomplete?: boolean | null
          notify_on_scheduled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          email?: string
          id?: string
          notify_on_called?: boolean | null
          notify_on_complete?: boolean | null
          notify_on_incomplete?: boolean | null
          notify_on_scheduled?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_notification_emails_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_notification_settings: {
        Row: {
          account_id: string
          created_at: string
          email_notifications_enabled: boolean
          email_recipients: string[]
          id: string
          notify_on_called: boolean
          notify_on_complete: boolean
          notify_on_incomplete: boolean
          notify_on_scheduled: boolean
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          email_notifications_enabled?: boolean
          email_recipients?: string[]
          id?: string
          notify_on_called?: boolean
          notify_on_complete?: boolean
          notify_on_incomplete?: boolean
          notify_on_scheduled?: boolean
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          email_notifications_enabled?: boolean
          email_recipients?: string[]
          id?: string
          notify_on_called?: boolean
          notify_on_complete?: boolean
          notify_on_incomplete?: boolean
          notify_on_scheduled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_notification_settings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_update_completions: {
        Row: {
          completed_at: string
          completed_by: string | null
          id: string
          job_id: string
          portal_type: string
        }
        Insert: {
          completed_at?: string
          completed_by?: string | null
          id?: string
          job_id: string
          portal_type: string
        }
        Update: {
          completed_at?: string
          completed_by?: string | null
          id?: string
          job_id?: string
          portal_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_update_completions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_update_completions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_update_queue: {
        Row: {
          account_id: string
          assigned_installer: string[] | null
          attempts: number | null
          completed_at: string | null
          created_at: string | null
          customer_name: string | null
          error_message: string | null
          id: string
          job_id: string
          job_number: string | null
          portal_type: string
          processed_at: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          status: string | null
          updated_at: string | null
          wo_number: string | null
        }
        Insert: {
          account_id: string
          assigned_installer?: string[] | null
          attempts?: number | null
          completed_at?: string | null
          created_at?: string | null
          customer_name?: string | null
          error_message?: string | null
          id?: string
          job_id: string
          job_number?: string | null
          portal_type: string
          processed_at?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          status?: string | null
          updated_at?: string | null
          wo_number?: string | null
        }
        Update: {
          account_id?: string
          assigned_installer?: string[] | null
          attempts?: number | null
          completed_at?: string | null
          created_at?: string | null
          customer_name?: string | null
          error_message?: string | null
          id?: string
          job_id?: string
          job_number?: string | null
          portal_type?: string
          processed_at?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          status?: string | null
          updated_at?: string | null
          wo_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_update_queue_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_update_queue_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_documents: {
        Row: {
          created_at: string | null
          document_label: string | null
          error_message: string | null
          extracted_data: Json | null
          file_name: string
          file_size_bytes: number | null
          file_type: string
          file_url: string
          id: string
          job_id: string | null
          ocr_text: string | null
          processed_by: string | null
          processing_completed_at: string | null
          processing_started_at: string | null
          queue_id: string | null
          status: string | null
          template_id: string | null
        }
        Insert: {
          created_at?: string | null
          document_label?: string | null
          error_message?: string | null
          extracted_data?: Json | null
          file_name: string
          file_size_bytes?: number | null
          file_type: string
          file_url: string
          id?: string
          job_id?: string | null
          ocr_text?: string | null
          processed_by?: string | null
          processing_completed_at?: string | null
          processing_started_at?: string | null
          queue_id?: string | null
          status?: string | null
          template_id?: string | null
        }
        Update: {
          created_at?: string | null
          document_label?: string | null
          error_message?: string | null
          extracted_data?: Json | null
          file_name?: string
          file_size_bytes?: number | null
          file_type?: string
          file_url?: string
          id?: string
          job_id?: string | null
          ocr_text?: string | null
          processed_by?: string | null
          processing_completed_at?: string | null
          processing_started_at?: string | null
          queue_id?: string | null
          status?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_processed_documents_job"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_processed_documents_template"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processed_documents_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "document_processing_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_webhooks: {
        Row: {
          created_at: string | null
          id: number
          webhook_key: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          webhook_key: string
        }
        Update: {
          created_at?: string | null
          id?: number
          webhook_key?: string
        }
        Relationships: []
      }
      processing_queue: {
        Row: {
          account_id: string | null
          assigned_installer: string | null
          assigned_installer_reasoning: string | null
          calculated_duration_minutes: number | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          extracted_data: Json | null
          file_hash: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          job_id: string | null
          line_items_count: number | null
          priority: number | null
          progress: number | null
          progress_message: string | null
          session_id: string | null
          started_at: string | null
          status: string | null
          template_id: string | null
          template_name: string | null
          updated_at: string | null
          user_id: string | null
          workflow_data: Json | null
          workflow_stage: string | null
        }
        Insert: {
          account_id?: string | null
          assigned_installer?: string | null
          assigned_installer_reasoning?: string | null
          calculated_duration_minutes?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          extracted_data?: Json | null
          file_hash?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          job_id?: string | null
          line_items_count?: number | null
          priority?: number | null
          progress?: number | null
          progress_message?: string | null
          session_id?: string | null
          started_at?: string | null
          status?: string | null
          template_id?: string | null
          template_name?: string | null
          updated_at?: string | null
          user_id?: string | null
          workflow_data?: Json | null
          workflow_stage?: string | null
        }
        Update: {
          account_id?: string | null
          assigned_installer?: string | null
          assigned_installer_reasoning?: string | null
          calculated_duration_minutes?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          extracted_data?: Json | null
          file_hash?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          job_id?: string | null
          line_items_count?: number | null
          priority?: number | null
          progress?: number | null
          progress_message?: string | null
          session_id?: string | null
          started_at?: string | null
          status?: string | null
          template_id?: string | null
          template_name?: string | null
          updated_at?: string | null
          user_id?: string | null
          workflow_data?: Json | null
          workflow_stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processing_queue_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_queue_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_queue_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      product_name_mappings: {
        Row: {
          account_id: string | null
          created_at: string | null
          id: string
          mapped_category_name: string
          vendor_name: string | null
          vendor_product_name: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string | null
          id?: string
          mapped_category_name: string
          vendor_name?: string | null
          vendor_product_name: string
        }
        Update: {
          account_id?: string | null
          created_at?: string | null
          id?: string
          mapped_category_name?: string
          vendor_name?: string | null
          vendor_product_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_name_mappings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      quickbooks_items: {
        Row: {
          created_at: string | null
          description: string | null
          expense_account_ref_id: string | null
          expense_account_ref_name: string | null
          full_name: string | null
          id: string
          income_account_ref_id: string | null
          income_account_ref_name: string | null
          is_active: boolean | null
          is_taxable: boolean | null
          level: number | null
          name: string
          parent_ref_id: string | null
          parent_ref_name: string | null
          qb_created_at: string | null
          qb_item_id: string
          qb_updated_at: string | null
          rate_percent: number | null
          raw_qbo_data: Json | null
          sales_tax_code_ref_id: string | null
          sku: string | null
          sub_item: boolean | null
          sync_token: string | null
          synced_at: string | null
          type: string
          unit_price: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          expense_account_ref_id?: string | null
          expense_account_ref_name?: string | null
          full_name?: string | null
          id?: string
          income_account_ref_id?: string | null
          income_account_ref_name?: string | null
          is_active?: boolean | null
          is_taxable?: boolean | null
          level?: number | null
          name: string
          parent_ref_id?: string | null
          parent_ref_name?: string | null
          qb_created_at?: string | null
          qb_item_id: string
          qb_updated_at?: string | null
          rate_percent?: number | null
          raw_qbo_data?: Json | null
          sales_tax_code_ref_id?: string | null
          sku?: string | null
          sub_item?: boolean | null
          sync_token?: string | null
          synced_at?: string | null
          type?: string
          unit_price?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          expense_account_ref_id?: string | null
          expense_account_ref_name?: string | null
          full_name?: string | null
          id?: string
          income_account_ref_id?: string | null
          income_account_ref_name?: string | null
          is_active?: boolean | null
          is_taxable?: boolean | null
          level?: number | null
          name?: string
          parent_ref_id?: string | null
          parent_ref_name?: string | null
          qb_created_at?: string | null
          qb_item_id?: string
          qb_updated_at?: string | null
          rate_percent?: number | null
          raw_qbo_data?: Json | null
          sales_tax_code_ref_id?: string | null
          sku?: string | null
          sub_item?: boolean | null
          sync_token?: string | null
          synced_at?: string | null
          type?: string
          unit_price?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      quickbooks_oauth_tokens: {
        Row: {
          created_at: string
          environment: string
          id: string
          refresh_token: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          environment?: string
          id?: string
          refresh_token?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          environment?: string
          id?: string
          refresh_token?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quickbooks_sync_metadata: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          items_synced: number | null
          last_sync_at: string | null
          last_sync_status: string | null
          sync_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          items_synced?: number | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          sync_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          items_synced?: number | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          sync_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      repair_requests: {
        Row: {
          address: string | null
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
          description: string | null
          id: string
          monday_item_id: string | null
          photo_url: string | null
          repair_type: string
          status: string
          unit_code: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone: string
          description?: string | null
          id?: string
          monday_item_id?: string | null
          photo_url?: string | null
          repair_type: string
          status?: string
          unit_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          description?: string | null
          id?: string
          monday_item_id?: string | null
          photo_url?: string | null
          repair_type?: string
          status?: string
          unit_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      schedule_bookings: {
        Row: {
          booked_by_email: string | null
          booked_by_user_id: string | null
          created_at: string | null
          customer_address: string
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          customer_zip: string
          id: string
          installer_id: string | null
          installer_name: string | null
          latitude: number | null
          longitude: number | null
          notes: string | null
          scheduled_date: string
          scheduled_time_end: string
          scheduled_time_start: string
          source: string | null
          status: string | null
        }
        Insert: {
          booked_by_email?: string | null
          booked_by_user_id?: string | null
          created_at?: string | null
          customer_address: string
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          customer_zip: string
          id?: string
          installer_id?: string | null
          installer_name?: string | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          scheduled_date: string
          scheduled_time_end: string
          scheduled_time_start: string
          source?: string | null
          status?: string | null
        }
        Update: {
          booked_by_email?: string | null
          booked_by_user_id?: string | null
          created_at?: string | null
          customer_address?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          customer_zip?: string
          id?: string
          installer_id?: string | null
          installer_name?: string | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          scheduled_date?: string
          scheduled_time_end?: string
          scheduled_time_start?: string
          source?: string | null
          status?: string | null
        }
        Relationships: []
      }
      scheduling_tokens: {
        Row: {
          account_name: string | null
          additional_info: string | null
          booked_at: string | null
          booked_date: string | null
          booked_installer_id: string | null
          booked_installer_name: string | null
          booked_time: string | null
          created_at: string
          customer_address: string | null
          customer_name: string | null
          customer_phone: string | null
          deadline: string | null
          duration_minutes: number
          expires_at: string | null
          first_available_date: string | null
          id: string
          job_id: string
          job_type: string | null
          latitude: number | null
          longitude: number | null
          qualified_techs: Json
          status: string
          token: string
        }
        Insert: {
          account_name?: string | null
          additional_info?: string | null
          booked_at?: string | null
          booked_date?: string | null
          booked_installer_id?: string | null
          booked_installer_name?: string | null
          booked_time?: string | null
          created_at?: string
          customer_address?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          deadline?: string | null
          duration_minutes?: number
          expires_at?: string | null
          first_available_date?: string | null
          id?: string
          job_id: string
          job_type?: string | null
          latitude?: number | null
          longitude?: number | null
          qualified_techs?: Json
          status?: string
          token: string
        }
        Update: {
          account_name?: string | null
          additional_info?: string | null
          booked_at?: string | null
          booked_date?: string | null
          booked_installer_id?: string | null
          booked_installer_name?: string | null
          booked_time?: string | null
          created_at?: string
          customer_address?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          deadline?: string | null
          duration_minutes?: number
          expires_at?: string | null
          first_available_date?: string | null
          id?: string
          job_id?: string
          job_type?: string | null
          latitude?: number | null
          longitude?: number | null
          qualified_techs?: Json
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_tokens_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      service_pricing: {
        Row: {
          active: boolean
          additional_services_rate: number
          base_price: number
          created_at: string
          id: string
          price_per_cutdown: number
          price_per_hard_surface: number
          price_per_ladder: number
          price_per_motorized: number
          price_per_shutter: number
          price_per_takedown: number
          service_category: string | null
          service_description: string | null
          service_name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          additional_services_rate?: number
          base_price?: number
          created_at?: string
          id?: string
          price_per_cutdown?: number
          price_per_hard_surface?: number
          price_per_ladder?: number
          price_per_motorized?: number
          price_per_shutter?: number
          price_per_takedown?: number
          service_category?: string | null
          service_description?: string | null
          service_name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          additional_services_rate?: number
          base_price?: number
          created_at?: string
          id?: string
          price_per_cutdown?: number
          price_per_hard_surface?: number
          price_per_ladder?: number
          price_per_motorized?: number
          price_per_shutter?: number
          price_per_takedown?: number
          service_category?: string | null
          service_description?: string | null
          service_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      shutter_line_items: {
        Row: {
          color: string | null
          created_at: string
          divider_rail: string | null
          frame_sides: number | null
          frame_type: string | null
          hinge_finish: string | null
          id: string
          job_id: string
          louver_size: string | null
          measured_height: number | null
          measured_width: number | null
          measurement_type: string | null
          mount_type: string | null
          original_height: number | null
          original_width: number | null
          panel_fold: string | null
          panel_qty: number | null
          photos: string[] | null
          product_model: string | null
          room: string | null
          shutter_type: string | null
          t_post: string | null
          tilt_rod: string | null
          updated_at: string
          window_notes: string | null
          window_number: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          divider_rail?: string | null
          frame_sides?: number | null
          frame_type?: string | null
          hinge_finish?: string | null
          id?: string
          job_id: string
          louver_size?: string | null
          measured_height?: number | null
          measured_width?: number | null
          measurement_type?: string | null
          mount_type?: string | null
          original_height?: number | null
          original_width?: number | null
          panel_fold?: string | null
          panel_qty?: number | null
          photos?: string[] | null
          product_model?: string | null
          room?: string | null
          shutter_type?: string | null
          t_post?: string | null
          tilt_rod?: string | null
          updated_at?: string
          window_notes?: string | null
          window_number: number
        }
        Update: {
          color?: string | null
          created_at?: string
          divider_rail?: string | null
          frame_sides?: number | null
          frame_type?: string | null
          hinge_finish?: string | null
          id?: string
          job_id?: string
          louver_size?: string | null
          measured_height?: number | null
          measured_width?: number | null
          measurement_type?: string | null
          mount_type?: string | null
          original_height?: number | null
          original_width?: number | null
          panel_fold?: string | null
          panel_qty?: number | null
          photos?: string[] | null
          product_model?: string | null
          room?: string | null
          shutter_type?: string | null
          t_post?: string | null
          tilt_rod?: string | null
          updated_at?: string
          window_notes?: string | null
          window_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "shutter_line_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_conversation_messages: {
        Row: {
          created_at: string
          customer_phone: string | null
          direction: string
          id: string
          job_id: string | null
          message_text: string | null
          scheduling_request_id: string | null
          sent_by: string
        }
        Insert: {
          created_at?: string
          customer_phone?: string | null
          direction: string
          id?: string
          job_id?: string | null
          message_text?: string | null
          scheduling_request_id?: string | null
          sent_by: string
        }
        Update: {
          created_at?: string
          customer_phone?: string | null
          direction?: string
          id?: string
          job_id?: string | null
          message_text?: string | null
          scheduling_request_id?: string | null
          sent_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_conversation_messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_conversation_messages_scheduling_request_id_fkey"
            columns: ["scheduling_request_id"]
            isOneToOne: false
            referencedRelation: "sms_scheduling_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_scheduling_queue: {
        Row: {
          attempts: number | null
          created_at: string
          error_message: string | null
          id: string
          job_id: string
          max_attempts: number | null
          processed_at: string | null
          scheduled_send_at: string | null
          stagger_assigned: boolean | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_id: string
          max_attempts?: number | null
          processed_at?: string | null
          scheduled_send_at?: string | null
          stagger_assigned?: boolean | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_id?: string
          max_attempts?: number | null
          processed_at?: string | null
          scheduled_send_at?: string | null
          stagger_assigned?: boolean | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_scheduling_queue_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_scheduling_requests: {
        Row: {
          attempt_number: number | null
          booking_time_seconds: number | null
          booking_token: string | null
          booking_token_expires_at: string | null
          confirmed_at: string | null
          confirmed_option: string | null
          constraint_level: string | null
          created_at: string | null
          customer_name: string | null
          customer_phone: string
          customer_response: string | null
          deadline_ext_days: number | null
          expired_reason: string | null
          expires_at: string | null
          human_review_resolved_at: string | null
          human_review_status: string | null
          id: string
          installer_name: string | null
          installer_name_a: string | null
          installer_name_b: string | null
          installer_name_c: string | null
          installer_name_d: string | null
          installer_name_e: string | null
          installer_name_f: string | null
          job_id: string
          job_type: string | null
          message_sent: string | null
          notes: string | null
          option_a_date: string | null
          option_a_time: string | null
          option_b_date: string | null
          option_b_time: string | null
          option_c_date: string | null
          option_c_time: string | null
          option_count: number | null
          option_d_date: string | null
          option_d_time: string | null
          option_e_date: string | null
          option_e_time: string | null
          option_f_date: string | null
          option_f_time: string | null
          queued_for_review: boolean | null
          rejection_details: string | null
          rejection_reason:
            | Database["public"]["Enums"]["sms_rejection_reason"]
            | null
          requires_human_review: boolean | null
          response_received_at: string | null
          response_time_seconds: number | null
          search_radius_miles: number | null
          sent_at: string | null
          source_account: string | null
          status: string | null
          twilio_sid: string | null
          updated_at: string | null
        }
        Insert: {
          attempt_number?: number | null
          booking_time_seconds?: number | null
          booking_token?: string | null
          booking_token_expires_at?: string | null
          confirmed_at?: string | null
          confirmed_option?: string | null
          constraint_level?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone: string
          customer_response?: string | null
          deadline_ext_days?: number | null
          expired_reason?: string | null
          expires_at?: string | null
          human_review_resolved_at?: string | null
          human_review_status?: string | null
          id?: string
          installer_name?: string | null
          installer_name_a?: string | null
          installer_name_b?: string | null
          installer_name_c?: string | null
          installer_name_d?: string | null
          installer_name_e?: string | null
          installer_name_f?: string | null
          job_id: string
          job_type?: string | null
          message_sent?: string | null
          notes?: string | null
          option_a_date?: string | null
          option_a_time?: string | null
          option_b_date?: string | null
          option_b_time?: string | null
          option_c_date?: string | null
          option_c_time?: string | null
          option_count?: number | null
          option_d_date?: string | null
          option_d_time?: string | null
          option_e_date?: string | null
          option_e_time?: string | null
          option_f_date?: string | null
          option_f_time?: string | null
          queued_for_review?: boolean | null
          rejection_details?: string | null
          rejection_reason?:
            | Database["public"]["Enums"]["sms_rejection_reason"]
            | null
          requires_human_review?: boolean | null
          response_received_at?: string | null
          response_time_seconds?: number | null
          search_radius_miles?: number | null
          sent_at?: string | null
          source_account?: string | null
          status?: string | null
          twilio_sid?: string | null
          updated_at?: string | null
        }
        Update: {
          attempt_number?: number | null
          booking_time_seconds?: number | null
          booking_token?: string | null
          booking_token_expires_at?: string | null
          confirmed_at?: string | null
          confirmed_option?: string | null
          constraint_level?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string
          customer_response?: string | null
          deadline_ext_days?: number | null
          expired_reason?: string | null
          expires_at?: string | null
          human_review_resolved_at?: string | null
          human_review_status?: string | null
          id?: string
          installer_name?: string | null
          installer_name_a?: string | null
          installer_name_b?: string | null
          installer_name_c?: string | null
          installer_name_d?: string | null
          installer_name_e?: string | null
          installer_name_f?: string | null
          job_id?: string
          job_type?: string | null
          message_sent?: string | null
          notes?: string | null
          option_a_date?: string | null
          option_a_time?: string | null
          option_b_date?: string | null
          option_b_time?: string | null
          option_c_date?: string | null
          option_c_time?: string | null
          option_count?: number | null
          option_d_date?: string | null
          option_d_time?: string | null
          option_e_date?: string | null
          option_e_time?: string | null
          option_f_date?: string | null
          option_f_time?: string | null
          queued_for_review?: boolean | null
          rejection_details?: string | null
          rejection_reason?:
            | Database["public"]["Enums"]["sms_rejection_reason"]
            | null
          requires_human_review?: boolean | null
          response_received_at?: string | null
          response_time_seconds?: number | null
          search_radius_miles?: number | null
          sent_at?: string | null
          source_account?: string | null
          status?: string | null
          twilio_sid?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_scheduling_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_system: boolean | null
          linked_workflow_id: string | null
          placeholders: string[] | null
          sort_order: number | null
          template_body: string
          template_key: string
          template_name: string
          trigger_description: string | null
          updated_at: string | null
          variables_schema: Json | null
          workflow_type: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          linked_workflow_id?: string | null
          placeholders?: string[] | null
          sort_order?: number | null
          template_body: string
          template_key: string
          template_name: string
          trigger_description?: string | null
          updated_at?: string | null
          variables_schema?: Json | null
          workflow_type?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          linked_workflow_id?: string | null
          placeholders?: string[] | null
          sort_order?: number | null
          template_body?: string
          template_key?: string
          template_name?: string
          trigger_description?: string | null
          updated_at?: string | null
          variables_schema?: Json | null
          workflow_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_sms_templates_workflow"
            columns: ["linked_workflow_id"]
            isOneToOne: false
            referencedRelation: "sms_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_test_history: {
        Row: {
          created_at: string | null
          error_code: string | null
          error_message: string | null
          id: string
          response_data: Json | null
          success: boolean
          template_id: string | null
          template_key: string
          test_message: string | null
          test_phone: string | null
          test_type: string
          tested_by: string | null
          twilio_sid: string | null
        }
        Insert: {
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          response_data?: Json | null
          success?: boolean
          template_id?: string | null
          template_key: string
          test_message?: string | null
          test_phone?: string | null
          test_type: string
          tested_by?: string | null
          twilio_sid?: string | null
        }
        Update: {
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          response_data?: Json | null
          success?: boolean
          template_id?: string | null
          template_key?: string
          test_message?: string | null
          test_phone?: string | null
          test_type?: string
          tested_by?: string | null
          twilio_sid?: string | null
        }
        Relationships: []
      }
      sms_workflow_settings: {
        Row: {
          created_at: string
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      sms_workflows: {
        Row: {
          available_variables: Json | null
          created_at: string | null
          default_template_key: string | null
          description: string | null
          display_name: string
          edge_function: string | null
          id: string
          is_enabled: boolean | null
          sort_order: number | null
          trigger_details: string | null
          trigger_type: string
          updated_at: string | null
          workflow_key: string
        }
        Insert: {
          available_variables?: Json | null
          created_at?: string | null
          default_template_key?: string | null
          description?: string | null
          display_name: string
          edge_function?: string | null
          id?: string
          is_enabled?: boolean | null
          sort_order?: number | null
          trigger_details?: string | null
          trigger_type?: string
          updated_at?: string | null
          workflow_key: string
        }
        Update: {
          available_variables?: Json | null
          created_at?: string | null
          default_template_key?: string | null
          description?: string | null
          display_name?: string
          edge_function?: string | null
          id?: string
          is_enabled?: boolean | null
          sort_order?: number | null
          trigger_details?: string | null
          trigger_type?: string
          updated_at?: string | null
          workflow_key?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          description: string | null
          id: string
          setting_key: string
          setting_value: boolean
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: boolean
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: boolean
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      tech_auth_token_log: {
        Row: {
          created_at: string
          event_type: string
          id: string
          installer_id: string | null
          ip_address: string | null
          token_id: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          installer_id?: string | null
          ip_address?: string | null
          token_id?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          installer_id?: string | null
          ip_address?: string | null
          token_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tech_auth_token_log_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_auth_token_log_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tech_auth_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      tech_auth_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          installer_id: string
          label: string | null
          last_used_at: string | null
          revoked_at: string | null
          token_hash: string
          use_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          installer_id: string
          label?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash: string
          use_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          installer_id?: string
          label?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "tech_auth_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_auth_tokens_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
        ]
      }
      tech_workflow_state: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      technician_measures: {
        Row: {
          city: string | null
          converted_to_job_id: string | null
          created_at: string
          customer_address: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          email_sent: boolean | null
          email_sent_at: string | null
          id: string
          job_id: string | null
          measurements: Json | null
          notes: string | null
          number_of_windows: number | null
          product_type: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          special_instructions: string | null
          status: string
          submitted_by_installer_id: string | null
          submitted_by_name: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          converted_to_job_id?: string | null
          created_at?: string
          customer_address?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: string
          job_id?: string | null
          measurements?: Json | null
          notes?: string | null
          number_of_windows?: number | null
          product_type?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          special_instructions?: string | null
          status?: string
          submitted_by_installer_id?: string | null
          submitted_by_name?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          converted_to_job_id?: string | null
          created_at?: string
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: string
          job_id?: string | null
          measurements?: Json | null
          notes?: string | null
          number_of_windows?: number | null
          product_type?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          special_instructions?: string | null
          status?: string
          submitted_by_installer_id?: string | null
          submitted_by_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_measures_converted_to_job_id_fkey"
            columns: ["converted_to_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_measures_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_measures_submitted_by_installer_id_fkey"
            columns: ["submitted_by_installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
        ]
      }
      template_field_mappings: {
        Row: {
          account_specific_column_id: string | null
          column_type: string | null
          created_at: string | null
          display_order: number | null
          extraction_instructions: string | null
          id: string
          is_line_item_field: boolean | null
          new_column_label: string | null
          section: string | null
          source_field_name: string
          source_field_path: string | null
          target_field_name: string
          target_field_type: string | null
          template_id: string | null
          universal_column_id: string | null
        }
        Insert: {
          account_specific_column_id?: string | null
          column_type?: string | null
          created_at?: string | null
          display_order?: number | null
          extraction_instructions?: string | null
          id?: string
          is_line_item_field?: boolean | null
          new_column_label?: string | null
          section?: string | null
          source_field_name: string
          source_field_path?: string | null
          target_field_name: string
          target_field_type?: string | null
          template_id?: string | null
          universal_column_id?: string | null
        }
        Update: {
          account_specific_column_id?: string | null
          column_type?: string | null
          created_at?: string | null
          display_order?: number | null
          extraction_instructions?: string | null
          id?: string
          is_line_item_field?: boolean | null
          new_column_label?: string | null
          section?: string | null
          source_field_name?: string
          source_field_path?: string | null
          target_field_name?: string
          target_field_type?: string | null
          template_id?: string | null
          universal_column_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_field_mappings_account_specific_column_id_fkey"
            columns: ["account_specific_column_id"]
            isOneToOne: false
            referencedRelation: "account_specific_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_field_mappings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_field_mappings_universal_column_id_fkey"
            columns: ["universal_column_id"]
            isOneToOne: false
            referencedRelation: "universal_columns"
            referencedColumns: ["id"]
          },
        ]
      }
      territories: {
        Row: {
          created_at: string | null
          id: string
          installer_ids: string[] | null
          is_active: boolean | null
          notes: string | null
          region: string | null
          service_area: string | null
          territory_name: string
          updated_at: string | null
          zip_code: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          installer_ids?: string[] | null
          is_active?: boolean | null
          notes?: string | null
          region?: string | null
          service_area?: string | null
          territory_name: string
          updated_at?: string | null
          zip_code: string
        }
        Update: {
          created_at?: string | null
          id?: string
          installer_ids?: string[] | null
          is_active?: boolean | null
          notes?: string | null
          region?: string | null
          service_area?: string | null
          territory_name?: string
          updated_at?: string | null
          zip_code?: string
        }
        Relationships: []
      }
      three_day_blinds_payment_discrepancies: {
        Row: {
          created_at: string | null
          custom_payment_amount: number | null
          customer_name: string | null
          difference: number
          expected_amount: number
          id: string
          installer_name: string | null
          job_id: string | null
          job_number: string | null
          paid_amount: number
          payment_item_id: string
          purchase_order: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          custom_payment_amount?: number | null
          customer_name?: string | null
          difference: number
          expected_amount: number
          id?: string
          installer_name?: string | null
          job_id?: string | null
          job_number?: string | null
          paid_amount: number
          payment_item_id: string
          purchase_order?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          custom_payment_amount?: number | null
          customer_name?: string | null
          difference?: number
          expected_amount?: number
          id?: string
          installer_name?: string | null
          job_id?: string | null
          job_number?: string | null
          paid_amount?: number
          payment_item_id?: string
          purchase_order?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "three_day_blinds_payment_discrepancies_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "three_day_blinds_payment_discrepancies_payment_item_id_fkey"
            columns: ["payment_item_id"]
            isOneToOne: false
            referencedRelation: "three_day_blinds_payment_items"
            referencedColumns: ["id"]
          },
        ]
      }
      three_day_blinds_payment_documents: {
        Row: {
          created_at: string | null
          discrepancy_jobs: number | null
          document_type_recognized: boolean | null
          error_message: string | null
          grand_total: number | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          matched_jobs: number | null
          original_filename: string
          paid_jobs: number | null
          pdf_url: string | null
          period_end: string | null
          period_start: string | null
          processed_at: string | null
          processed_by: string | null
          processing_status: string | null
          total_payments_count: number | null
          unmatched_jobs: number | null
          upload_date: string | null
        }
        Insert: {
          created_at?: string | null
          discrepancy_jobs?: number | null
          document_type_recognized?: boolean | null
          error_message?: string | null
          grand_total?: number | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          matched_jobs?: number | null
          original_filename: string
          paid_jobs?: number | null
          pdf_url?: string | null
          period_end?: string | null
          period_start?: string | null
          processed_at?: string | null
          processed_by?: string | null
          processing_status?: string | null
          total_payments_count?: number | null
          unmatched_jobs?: number | null
          upload_date?: string | null
        }
        Update: {
          created_at?: string | null
          discrepancy_jobs?: number | null
          document_type_recognized?: boolean | null
          error_message?: string | null
          grand_total?: number | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          matched_jobs?: number | null
          original_filename?: string
          paid_jobs?: number | null
          pdf_url?: string | null
          period_end?: string | null
          period_start?: string | null
          processed_at?: string | null
          processed_by?: string | null
          processing_status?: string | null
          total_payments_count?: number | null
          unmatched_jobs?: number | null
          upload_date?: string | null
        }
        Relationships: []
      }
      three_day_blinds_payment_items: {
        Row: {
          amount_matches: boolean | null
          client_name: string | null
          created_at: string | null
          discrepancy_amount: number | null
          document_id: string
          expected_amount: number | null
          id: string
          install_date: string | null
          installer_name: string | null
          job_id: string | null
          job_number: string | null
          job_status: string | null
          match_found: boolean | null
          paid_amount: number
          purchase_order: string | null
          resolution_notes: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          sales_order: string | null
          service_type: string | null
          status: string | null
        }
        Insert: {
          amount_matches?: boolean | null
          client_name?: string | null
          created_at?: string | null
          discrepancy_amount?: number | null
          document_id: string
          expected_amount?: number | null
          id?: string
          install_date?: string | null
          installer_name?: string | null
          job_id?: string | null
          job_number?: string | null
          job_status?: string | null
          match_found?: boolean | null
          paid_amount: number
          purchase_order?: string | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          sales_order?: string | null
          service_type?: string | null
          status?: string | null
        }
        Update: {
          amount_matches?: boolean | null
          client_name?: string | null
          created_at?: string | null
          discrepancy_amount?: number | null
          document_id?: string
          expected_amount?: number | null
          id?: string
          install_date?: string | null
          installer_name?: string | null
          job_id?: string | null
          job_number?: string | null
          job_status?: string | null
          match_found?: boolean | null
          paid_amount?: number
          purchase_order?: string | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          sales_order?: string | null
          service_type?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "three_day_blinds_payment_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "three_day_blinds_payment_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "three_day_blinds_payment_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      three_db_measure_forms: {
        Row: {
          breakdown_completed_at: string | null
          breakdown_completed_by: string | null
          ceiling_height_ft: number | null
          created_at: string
          deposit_required: number | null
          discount_amount: number | null
          discount_reason: string | null
          disposal_fee: number | null
          disposal_required: boolean | null
          estimated_lead_time_days: number | null
          existing_automation: string | null
          existing_treatment_type: string | null
          gate_code: string | null
          grand_total: number | null
          has_children: boolean | null
          has_high_ceilings: boolean | null
          has_ladder_required: boolean | null
          has_pets: boolean | null
          has_power_nearby: boolean | null
          has_tile_floors: boolean | null
          has_wifi: boolean | null
          has_wood_floors: boolean | null
          id: string
          install_labor: number | null
          job_id: string
          ladder_height_needed: string | null
          line_items: Json | null
          measure_completed_at: string | null
          measure_completed_by: string | null
          measure_tech_name: string | null
          parking_notes: string | null
          removal_labor: number | null
          removal_required: boolean | null
          rush_fee: number | null
          site_access_notes: string | null
          site_contact_name: string | null
          site_contact_phone: string | null
          site_photos: Json | null
          special_order_notes: string | null
          status: string
          subtotal: number | null
          tax_amount: number | null
          tech_notes: string | null
          tech_recommendations: string | null
          updated_at: string
          wifi_strength: string | null
          windows: Json
        }
        Insert: {
          breakdown_completed_at?: string | null
          breakdown_completed_by?: string | null
          ceiling_height_ft?: number | null
          created_at?: string
          deposit_required?: number | null
          discount_amount?: number | null
          discount_reason?: string | null
          disposal_fee?: number | null
          disposal_required?: boolean | null
          estimated_lead_time_days?: number | null
          existing_automation?: string | null
          existing_treatment_type?: string | null
          gate_code?: string | null
          grand_total?: number | null
          has_children?: boolean | null
          has_high_ceilings?: boolean | null
          has_ladder_required?: boolean | null
          has_pets?: boolean | null
          has_power_nearby?: boolean | null
          has_tile_floors?: boolean | null
          has_wifi?: boolean | null
          has_wood_floors?: boolean | null
          id?: string
          install_labor?: number | null
          job_id: string
          ladder_height_needed?: string | null
          line_items?: Json | null
          measure_completed_at?: string | null
          measure_completed_by?: string | null
          measure_tech_name?: string | null
          parking_notes?: string | null
          removal_labor?: number | null
          removal_required?: boolean | null
          rush_fee?: number | null
          site_access_notes?: string | null
          site_contact_name?: string | null
          site_contact_phone?: string | null
          site_photos?: Json | null
          special_order_notes?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          tech_notes?: string | null
          tech_recommendations?: string | null
          updated_at?: string
          wifi_strength?: string | null
          windows?: Json
        }
        Update: {
          breakdown_completed_at?: string | null
          breakdown_completed_by?: string | null
          ceiling_height_ft?: number | null
          created_at?: string
          deposit_required?: number | null
          discount_amount?: number | null
          discount_reason?: string | null
          disposal_fee?: number | null
          disposal_required?: boolean | null
          estimated_lead_time_days?: number | null
          existing_automation?: string | null
          existing_treatment_type?: string | null
          gate_code?: string | null
          grand_total?: number | null
          has_children?: boolean | null
          has_high_ceilings?: boolean | null
          has_ladder_required?: boolean | null
          has_pets?: boolean | null
          has_power_nearby?: boolean | null
          has_tile_floors?: boolean | null
          has_wifi?: boolean | null
          has_wood_floors?: boolean | null
          id?: string
          install_labor?: number | null
          job_id?: string
          ladder_height_needed?: string | null
          line_items?: Json | null
          measure_completed_at?: string | null
          measure_completed_by?: string | null
          measure_tech_name?: string | null
          parking_notes?: string | null
          removal_labor?: number | null
          removal_required?: boolean | null
          rush_fee?: number | null
          site_access_notes?: string | null
          site_contact_name?: string | null
          site_contact_phone?: string | null
          site_photos?: Json | null
          special_order_notes?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          tech_notes?: string | null
          tech_recommendations?: string | null
          updated_at?: string
          wifi_strength?: string | null
          windows?: Json
        }
        Relationships: [
          {
            foreignKeyName: "three_db_measure_forms_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      time_off_requests: {
        Row: {
          created_at: string | null
          id: string
          installer_id: string
          notes: string | null
          request_date: string
          request_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          installer_id: string
          notes?: string | null
          request_date: string
          request_type: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          installer_id?: string
          notes?: string | null
          request_date?: string
          request_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_requests_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "installers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_items: {
        Row: {
          ai_suggested_file: string | null
          ai_triaged: boolean | null
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          file_category: string | null
          id: string
          job_id: string | null
          linked_entity_id: string | null
          linked_entity_type: string | null
          priority: string
          reminder_sent: boolean | null
          snoozed_until: string | null
          source: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          ai_suggested_file?: string | null
          ai_triaged?: boolean | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_category?: string | null
          id?: string
          job_id?: string | null
          linked_entity_id?: string | null
          linked_entity_type?: string | null
          priority?: string
          reminder_sent?: boolean | null
          snoozed_until?: string | null
          source?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          ai_suggested_file?: string | null
          ai_triaged?: boolean | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_category?: string | null
          id?: string
          job_id?: string | null
          linked_entity_id?: string | null
          linked_entity_type?: string | null
          priority?: string
          reminder_sent?: boolean | null
          snoozed_until?: string | null
          source?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_snooze_reminders: {
        Row: {
          created_at: string
          id: string
          is_sent: boolean
          remind_at: string
          reminder_type: string
          sent_at: string | null
          todo_item_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_sent?: boolean
          remind_at: string
          reminder_type?: string
          sent_at?: string | null
          todo_item_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_sent?: boolean
          remind_at?: string
          reminder_type?: string
          sent_at?: string | null
          todo_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_snooze_reminders_todo_item_id_fkey"
            columns: ["todo_item_id"]
            isOneToOne: false
            referencedRelation: "todo_items"
            referencedColumns: ["id"]
          },
        ]
      }
      universal_columns: {
        Row: {
          calculation_logic: string | null
          category: string
          column_name: string
          created_at: string | null
          data_type: string
          display_name: string
          display_order: number | null
          id: string
          is_auto_calculated: boolean | null
          is_locked: boolean | null
        }
        Insert: {
          calculation_logic?: string | null
          category: string
          column_name: string
          created_at?: string | null
          data_type: string
          display_name: string
          display_order?: number | null
          id?: string
          is_auto_calculated?: boolean | null
          is_locked?: boolean | null
        }
        Update: {
          calculation_logic?: string | null
          category?: string
          column_name?: string
          created_at?: string | null
          data_type?: string
          display_name?: string
          display_order?: number | null
          id?: string
          is_auto_calculated?: boolean | null
          is_locked?: boolean | null
        }
        Relationships: []
      }
      universal_fields: {
        Row: {
          add_to_duration_calculator: boolean | null
          category: string
          created_at: string | null
          data_type: string
          display_name: string
          field_name: string
          id: string
          show_on_card: boolean | null
        }
        Insert: {
          add_to_duration_calculator?: boolean | null
          category: string
          created_at?: string | null
          data_type: string
          display_name: string
          field_name: string
          id?: string
          show_on_card?: boolean | null
        }
        Update: {
          add_to_duration_calculator?: boolean | null
          category?: string
          created_at?: string | null
          data_type?: string
          display_name?: string
          field_name?: string
          id?: string
          show_on_card?: boolean | null
        }
        Relationships: []
      }
      user_mentions: {
        Row: {
          communication_id: string | null
          created_at: string | null
          id: string
          mentioned_user_id: string | null
          read: boolean | null
        }
        Insert: {
          communication_id?: string | null
          created_at?: string | null
          id?: string
          mentioned_user_id?: string | null
          read?: boolean | null
        }
        Update: {
          communication_id?: string | null
          created_at?: string | null
          id?: string
          mentioned_user_id?: string | null
          read?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "user_mentions_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "job_communications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vn_ai_parsing_log: {
        Row: {
          ai_model: string
          confidence_score: number | null
          created_at: string
          execution_time_ms: number | null
          id: string
          parsed_data: Json | null
          prompt_sent: string | null
          raw_response: string | null
          session_id: string
          tokens_used: number | null
          validation_errors: Json | null
        }
        Insert: {
          ai_model: string
          confidence_score?: number | null
          created_at?: string
          execution_time_ms?: number | null
          id?: string
          parsed_data?: Json | null
          prompt_sent?: string | null
          raw_response?: string | null
          session_id: string
          tokens_used?: number | null
          validation_errors?: Json | null
        }
        Update: {
          ai_model?: string
          confidence_score?: number | null
          created_at?: string
          execution_time_ms?: number | null
          id?: string
          parsed_data?: Json | null
          prompt_sent?: string | null
          raw_response?: string | null
          session_id?: string
          tokens_used?: number | null
          validation_errors?: Json | null
        }
        Relationships: []
      }
      vn_document_sets: {
        Row: {
          account_id: string | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          processed_by: string | null
          progress_percentage: number | null
          session_id: string
          status: string
        }
        Insert: {
          account_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          processed_by?: string | null
          progress_percentage?: number | null
          session_id?: string
          status?: string
        }
        Update: {
          account_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          processed_by?: string | null
          progress_percentage?: number | null
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "vn_document_sets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vn_document_sets_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      vn_document_uploads: {
        Row: {
          account_id: string | null
          document_type: string
          error_message: string | null
          extracted_data: Json | null
          extraction_status: string
          file_name: string
          file_url: string
          id: string
          processed_at: string | null
          session_id: string
          uploaded_at: string
        }
        Insert: {
          account_id?: string | null
          document_type: string
          error_message?: string | null
          extracted_data?: Json | null
          extraction_status?: string
          file_name: string
          file_url: string
          id?: string
          processed_at?: string | null
          session_id?: string
          uploaded_at?: string
        }
        Update: {
          account_id?: string | null
          document_type?: string
          error_message?: string | null
          extracted_data?: Json | null
          extraction_status?: string
          file_name?: string
          file_url?: string
          id?: string
          processed_at?: string | null
          session_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vn_document_uploads_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      vn_extracted_jobs: {
        Row: {
          confidence_scores: Json
          created_at: string | null
          discrepancies: Json | null
          document_set_id: string
          extracted_data: Json
          id: string
          job_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          confidence_scores?: Json
          created_at?: string | null
          discrepancies?: Json | null
          document_set_id: string
          extracted_data?: Json
          id?: string
          job_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          confidence_scores?: Json
          created_at?: string | null
          discrepancies?: Json | null
          document_set_id?: string
          extracted_data?: Json
          id?: string
          job_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vn_extracted_jobs_document_set_id_fkey"
            columns: ["document_set_id"]
            isOneToOne: false
            referencedRelation: "vn_document_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vn_extracted_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vn_extracted_jobs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      vn_field_corrections: {
        Row: {
          corrected_by: string | null
          corrected_value: string | null
          correction_reason: string | null
          created_at: string | null
          extracted_job_id: string
          field_name: string
          id: string
          original_value: string | null
        }
        Insert: {
          corrected_by?: string | null
          corrected_value?: string | null
          correction_reason?: string | null
          created_at?: string | null
          extracted_job_id: string
          field_name: string
          id?: string
          original_value?: string | null
        }
        Update: {
          corrected_by?: string | null
          corrected_value?: string | null
          correction_reason?: string | null
          created_at?: string | null
          extracted_job_id?: string
          field_name?: string
          id?: string
          original_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vn_field_corrections_corrected_by_fkey"
            columns: ["corrected_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vn_field_corrections_extracted_job_id_fkey"
            columns: ["extracted_job_id"]
            isOneToOne: false
            referencedRelation: "vn_extracted_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      vn_uploaded_documents: {
        Row: {
          created_at: string | null
          document_label: string | null
          document_set_id: string
          file_name: string
          file_size: number | null
          file_type: string
          file_url: string
          id: string
          ocr_text: string | null
          processing_status: string | null
          thumbnail_url: string | null
          upload_order: number
        }
        Insert: {
          created_at?: string | null
          document_label?: string | null
          document_set_id: string
          file_name: string
          file_size?: number | null
          file_type: string
          file_url: string
          id?: string
          ocr_text?: string | null
          processing_status?: string | null
          thumbnail_url?: string | null
          upload_order: number
        }
        Update: {
          created_at?: string | null
          document_label?: string | null
          document_set_id?: string
          file_name?: string
          file_size?: number | null
          file_type?: string
          file_url?: string
          id?: string
          ocr_text?: string | null
          processing_status?: string | null
          thumbnail_url?: string | null
          upload_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "vn_uploaded_documents_document_set_id_fkey"
            columns: ["document_set_id"]
            isOneToOne: false
            referencedRelation: "vn_document_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_agent_config: {
        Row: {
          agent_id: string | null
          agent_name: string
          created_at: string | null
          first_message: string | null
          id: string
          is_active: boolean | null
          language: string | null
          system_prompt: string | null
          updated_at: string | null
          voice_name: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string
          created_at?: string | null
          first_message?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          system_prompt?: string | null
          updated_at?: string | null
          voice_name?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_name?: string
          created_at?: string | null
          first_message?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          system_prompt?: string | null
          updated_at?: string | null
          voice_name?: string | null
        }
        Relationships: []
      }
      voice_conversations: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          duration_seconds: number | null
          ended_at: string | null
          error_message: string | null
          id: string
          jobs_created: string[] | null
          jobs_updated: string[] | null
          started_at: string | null
          status: string | null
          tool_calls: Json | null
          transcript: Json | null
          user_id: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          error_message?: string | null
          id?: string
          jobs_created?: string[] | null
          jobs_updated?: string[] | null
          started_at?: string | null
          status?: string | null
          tool_calls?: Json | null
          transcript?: Json | null
          user_id?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          error_message?: string | null
          id?: string
          jobs_created?: string[] | null
          jobs_updated?: string[] | null
          started_at?: string | null
          status?: string | null
          tool_calls?: Json | null
          transcript?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          account_id: string | null
          created_at: string | null
          error_message: string | null
          event_type: string
          final_status: string | null
          id: string
          job_id: string | null
          max_retries: number | null
          next_retry_at: string | null
          request_payload: Json | null
          response_body: string | null
          response_status: number | null
          retry_count: number | null
          success: boolean | null
          webhook_url: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type: string
          final_status?: string | null
          id?: string
          job_id?: string | null
          max_retries?: number | null
          next_retry_at?: string | null
          request_payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          retry_count?: number | null
          success?: boolean | null
          webhook_url: string
        }
        Update: {
          account_id?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string
          final_status?: string | null
          id?: string
          job_id?: string | null
          max_retries?: number | null
          next_retry_at?: string | null
          request_payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          retry_count?: number | null
          success?: boolean | null
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_3dayblinds: {
        Row: {
          case_number: string | null
          created_at: string | null
          id: string
          number_of_cornices: number | null
          number_of_remeasure_windows: number | null
          original_installer: string | null
          original_invoice: string | null
          repair_reason: string | null
          sales_order: string | null
          salesperson: string | null
          service_level: string | null
          sidemark: string | null
          work_order_id: string | null
          work_to_do: string | null
        }
        Insert: {
          case_number?: string | null
          created_at?: string | null
          id?: string
          number_of_cornices?: number | null
          number_of_remeasure_windows?: number | null
          original_installer?: string | null
          original_invoice?: string | null
          repair_reason?: string | null
          sales_order?: string | null
          salesperson?: string | null
          service_level?: string | null
          sidemark?: string | null
          work_order_id?: string | null
          work_to_do?: string | null
        }
        Update: {
          case_number?: string | null
          created_at?: string | null
          id?: string
          number_of_cornices?: number | null
          number_of_remeasure_windows?: number | null
          original_installer?: string | null
          original_invoice?: string | null
          repair_reason?: string | null
          sales_order?: string | null
          salesperson?: string | null
          service_level?: string | null
          sidemark?: string | null
          work_order_id?: string | null
          work_to_do?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_order_3dayblinds_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          account_id: string | null
          created_at: string | null
          customer: string
          deadline: string | null
          document_url: string | null
          duration: number | null
          first_available: string | null
          id: string
          is_express: boolean | null
          location: string | null
          number_of_blinds_shades: number | null
          number_of_drapery: number | null
          number_of_hard_surface: number | null
          number_of_hubs: number | null
          number_of_items: number | null
          number_of_ladders: number | null
          number_of_motorized: number | null
          number_of_shutter_tracks: number | null
          number_of_shutters: number | null
          number_of_skylights: number | null
          number_of_takedowns: number | null
          original_filename: string | null
          phone: string | null
          raw_extracted_data: Json | null
          scheduled_date_time: string | null
          status: string
          updated_at: string | null
          work_order_type: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string | null
          customer: string
          deadline?: string | null
          document_url?: string | null
          duration?: number | null
          first_available?: string | null
          id?: string
          is_express?: boolean | null
          location?: string | null
          number_of_blinds_shades?: number | null
          number_of_drapery?: number | null
          number_of_hard_surface?: number | null
          number_of_hubs?: number | null
          number_of_items?: number | null
          number_of_ladders?: number | null
          number_of_motorized?: number | null
          number_of_shutter_tracks?: number | null
          number_of_shutters?: number | null
          number_of_skylights?: number | null
          number_of_takedowns?: number | null
          original_filename?: string | null
          phone?: string | null
          raw_extracted_data?: Json | null
          scheduled_date_time?: string | null
          status: string
          updated_at?: string | null
          work_order_type: string
        }
        Update: {
          account_id?: string | null
          created_at?: string | null
          customer?: string
          deadline?: string | null
          document_url?: string | null
          duration?: number | null
          first_available?: string | null
          id?: string
          is_express?: boolean | null
          location?: string | null
          number_of_blinds_shades?: number | null
          number_of_drapery?: number | null
          number_of_hard_surface?: number | null
          number_of_hubs?: number | null
          number_of_items?: number | null
          number_of_ladders?: number | null
          number_of_motorized?: number | null
          number_of_shutter_tracks?: number | null
          number_of_shutters?: number | null
          number_of_skylights?: number | null
          number_of_takedowns?: number | null
          original_filename?: string | null
          phone?: string | null
          raw_extracted_data?: Json | null
          scheduled_date_time?: string | null
          status?: string
          updated_at?: string | null
          work_order_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_status: {
        Row: {
          account_id: string | null
          account_name: string | null
          category: string
          created_at: string
          error_count_24h: number
          id: string
          is_active: boolean
          is_verified: boolean | null
          last_error_message: string | null
          last_execution: string | null
          last_success: string | null
          status: string
          success_count_24h: number
          updated_at: string
          verified_at: string | null
          verified_notes: string | null
          workflow_key: string
          workflow_name: string
        }
        Insert: {
          account_id?: string | null
          account_name?: string | null
          category?: string
          created_at?: string
          error_count_24h?: number
          id?: string
          is_active?: boolean
          is_verified?: boolean | null
          last_error_message?: string | null
          last_execution?: string | null
          last_success?: string | null
          status?: string
          success_count_24h?: number
          updated_at?: string
          verified_at?: string | null
          verified_notes?: string | null
          workflow_key: string
          workflow_name: string
        }
        Update: {
          account_id?: string | null
          account_name?: string | null
          category?: string
          created_at?: string
          error_count_24h?: number
          id?: string
          is_active?: boolean
          is_verified?: boolean | null
          last_error_message?: string | null
          last_execution?: string | null
          last_success?: string | null
          status?: string
          success_count_24h?: number
          updated_at?: string
          verified_at?: string | null
          verified_notes?: string | null
          workflow_key?: string
          workflow_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_status_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      sms_monitoring_metrics: {
        Row: {
          avg_booking_time_sec: number | null
          avg_response_time_sec: number | null
          conflicts: number | null
          date: string | null
          median_response_time_sec: number | null
          rejected: number | null
          stale_responses: number | null
          success_rate_pct: number | null
          successful: number | null
          total_sent: number | null
          unavailable: number | null
        }
        Relationships: []
      }
      v_agent_ops_health_latest: {
        Row: {
          agent_id: string | null
          agent_type: string | null
          avg_duration_24h_ms: number | null
          default_model: string | null
          description: string | null
          display_name: string | null
          errors_24h: number | null
          errors_7d: number | null
          expected_cadence_minutes: number | null
          health_status: string | null
          is_active: boolean | null
          is_pinned: boolean | null
          items_failed_24h: number | null
          items_processed_24h: number | null
          last_blocker_code: string | null
          last_blocker_reason: string | null
          last_escalation_reason: string | null
          last_items_failed: number | null
          last_items_processed: number | null
          last_items_remaining: number | null
          last_items_success: number | null
          last_model_used: string | null
          last_run_at: string | null
          last_run_duration_ms: number | null
          last_run_ended_at: string | null
          last_run_id: string | null
          last_status: string | null
          last_trigger_type: string | null
          last_webhooks_failed: number | null
          last_webhooks_ok: number | null
          runs_24h: number | null
          runs_7d: number | null
          snapshot_at: string | null
          success_rate_24h: number | null
          success_rate_7d: number | null
          tags: string[] | null
          webhooks_failed_24h: number | null
          webhooks_failed_7d: number | null
        }
        Relationships: []
      }
      v_agent_ops_webhook_failures: {
        Row: {
          account_id: string | null
          correlated_agent_id: string | null
          correlated_agent_name: string | null
          correlated_run_id: string | null
          created_at: string | null
          error_message: string | null
          event_type: string | null
          job_id: string | null
          job_number: string | null
          reference_id: string | null
          response_status: number | null
          sent_at: string | null
          success: boolean | null
          webhook_log_id: string | null
          webhook_url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_ops_runs_agent_id_fkey"
            columns: ["correlated_agent_id"]
            isOneToOne: false
            referencedRelation: "agent_ops_registry"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_ops_runs_agent_id_fkey"
            columns: ["correlated_agent_id"]
            isOneToOne: false
            referencedRelation: "v_agent_ops_health_latest"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "outbound_webhook_logs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_webhook_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      advance_scheduling_dates_daily: { Args: never; Returns: number }
      book_appointment_atomic: {
        Args: {
          p_date: string
          p_duration_minutes?: number
          p_installer_id: string
          p_installer_name: string
          p_job_id: string
          p_time: string
        }
        Returns: Json
      }
      calculate_payment_breakdown: {
        Args: {
          p_invoice_amount: number
          p_is_return_trip?: boolean
          p_job_type: string
        }
        Returns: {
          contractor_payment: number
          data_fee_dollar: number
          installation_20: number
          installation_80: number
          non_installation_100: number
        }[]
      }
      claim_sms_request_atomic: {
        Args: { p_current_time: string; p_customer_phone: string }
        Returns: {
          customer_name: string
          id: string
          installer_name_a: string
          installer_name_b: string
          installer_name_c: string
          installer_name_d: string
          installer_name_e: string
          installer_name_f: string
          job_id: string
          job_type: string
          option_a_date: string
          option_a_time: string
          option_b_date: string
          option_b_time: string
          option_c_date: string
          option_c_time: string
          option_count: number
          option_d_date: string
          option_d_time: string
          option_e_date: string
          option_e_time: string
          option_f_date: string
          option_f_time: string
          sent_at: string
          status: string
        }[]
      }
      cleanup_expired_job_locks: { Args: never; Returns: number }
      cleanup_old_processed_webhooks: { Args: never; Returns: number }
      generate_3db_job_number: { Args: never; Returns: string }
      get_account_portal_by_url: {
        Args: { p_custom_url: string }
        Returns: {
          custom_url: string
          has_portal: boolean
          id: string
          name: string
        }[]
      }
      get_agent_ops_global_stats: { Args: never; Returns: Json }
      get_agent_ops_health: {
        Args: never
        Returns: {
          agent_id: string | null
          agent_type: string | null
          avg_duration_24h_ms: number | null
          default_model: string | null
          description: string | null
          display_name: string | null
          errors_24h: number | null
          errors_7d: number | null
          expected_cadence_minutes: number | null
          health_status: string | null
          is_active: boolean | null
          is_pinned: boolean | null
          items_failed_24h: number | null
          items_processed_24h: number | null
          last_blocker_code: string | null
          last_blocker_reason: string | null
          last_escalation_reason: string | null
          last_items_failed: number | null
          last_items_processed: number | null
          last_items_remaining: number | null
          last_items_success: number | null
          last_model_used: string | null
          last_run_at: string | null
          last_run_duration_ms: number | null
          last_run_ended_at: string | null
          last_run_id: string | null
          last_status: string | null
          last_trigger_type: string | null
          last_webhooks_failed: number | null
          last_webhooks_ok: number | null
          runs_24h: number | null
          runs_7d: number | null
          snapshot_at: string | null
          success_rate_24h: number | null
          success_rate_7d: number | null
          tags: string[] | null
          webhooks_failed_24h: number | null
          webhooks_failed_7d: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "v_agent_ops_health_latest"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_agent_ops_run_history: {
        Args: { p_agent_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          blocker_code: string
          blocker_reason: string
          completion_status: string
          duration_ms: number
          ended_at: string
          escalation_reason: string
          ingested_via: string
          items_failed: number
          items_processed: number
          items_remaining: number
          items_skipped: number
          items_success: number
          model_used: string
          run_id: string
          started_at: string
          total_count: number
          trigger_type: string
          triggered_by: string
          webhooks_sent_failed: number
          webhooks_sent_ok: number
        }[]
      }
      get_agent_ops_top_blockers: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          agents_affected: number
          blocker_code: string
          display_label: string
          last_occurred_at: string
          occurrences: number
          severity: string
          suggested_action: string
        }[]
      }
      get_agent_ops_webhook_failures: {
        Args: { p_hours?: number; p_limit?: number }
        Returns: {
          account_id: string
          correlated_agent_id: string
          correlated_agent_name: string
          correlated_run_id: string
          error_message: string
          event_type: string
          job_id: string
          job_number: string
          reference_id: string
          response_status: number
          sent_at: string
          webhook_log_id: string
          webhook_url: string
        }[]
      }
      get_contractor_portal_by_url: {
        Args: { p_custom_url: string }
        Returns: {
          active: boolean
          custom_url: string
          has_portal: boolean
          id: string
          name: string
        }[]
      }
      get_crm_user_account_id: { Args: { user_uuid: string }; Returns: string }
      get_crm_user_account_ids: {
        Args: { user_uuid: string }
        Returns: string[]
      }
      get_crm_user_contractor_id: {
        Args: { user_uuid: string }
        Returns: string
      }
      get_crm_user_installer_id: {
        Args: { user_uuid: string }
        Returns: string
      }
      get_crm_user_role: {
        Args: { user_uuid: string }
        Returns: Database["public"]["Enums"]["crm_user_role"]
      }
      get_current_crm_user_id: { Args: never; Returns: string }
      get_job_suggestions: {
        Args: {
          p_installer_id: string
          p_next_job_lat: number
          p_next_job_lng: number
          p_prev_job_lat: number
          p_prev_job_lng: number
          p_slot_end: string
          p_slot_start: string
        }
        Returns: {
          customer_address: string
          customer_lat: number
          customer_lng: number
          customer_name: string
          customer_phone: string
          distance_miles: number
          distance_score: number
          duration_fit_score: number
          duration_minutes: number
          job_id: string
          job_type: string
          notes: string
          priority: string
          priority_score: number
          product_type: string
          total_score: number
        }[]
      }
      get_max_numeric_job_number: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_sms_workflow_enabled: {
        Args: { workflow_key: string }
        Returns: boolean
      }
      link_auth_user_to_crm: {
        Args: { p_auth_user_id: string; p_email: string }
        Returns: Json
      }
      normalize_phone: { Args: { input_phone: string }; Returns: string }
      normalize_text: { Args: { input_text: string }; Returns: string }
      phone_digits: { Args: { phone: string }; Returns: string }
      refresh_agent_ops_health: { Args: never; Returns: undefined }
      refresh_agent_ops_snapshot: { Args: never; Returns: undefined }
      search_customers_by_name: {
        Args: { search_term: string }
        Returns: {
          account_id: string | null
          actual_product_count: number | null
          additional_services_note: string | null
          ai_agent_used: string | null
          ai_confidence_score: number | null
          ai_processed_at: string | null
          ai_processing_status: string | null
          already_measured: boolean | null
          archived_at: string | null
          arjays_dd_payment_id: string | null
          arjays_payment_status: string | null
          assigned_installer: string[] | null
          assigned_type: string | null
          balance_amount: number | null
          balance_due: number | null
          base_labor: number | null
          calculated_duration_minutes: number | null
          canceled_at: string | null
          ceiling_mount: boolean | null
          cod_amount: number | null
          completed_at: string | null
          contacted_at: string | null
          contract_number: string | null
          contractor_id: string | null
          contractor_percentage: number | null
          created_at: string | null
          creation_method: string | null
          customer_address: string
          customer_email: string | null
          customer_name: string
          customer_name_normalized: string | null
          customer_phone: string | null
          customer_phone_normalized: string | null
          customer_po: string | null
          deadline: string | null
          deleted_at: string | null
          deleted_by: string | null
          deposit_amount: number | null
          document_path: string | null
          duplicated_at: string | null
          duplicated_from: string | null
          duration_breakdown: Json | null
          duration_danny_minutes: number | null
          duration_kevin_minutes: number | null
          duration_mike_minutes: number | null
          duration_minutes: number | null
          duration_stevie_minutes: number | null
          duration_tony_minutes: number | null
          email_type: string | null
          estimated_delivery_date: string | null
          estimated_ship_date: string | null
          expected_product_count: number | null
          first_available_date: string | null
          first_sms_sent_at: string | null
          flag_ceiling_mount: boolean | null
          flag_over_10_feet: boolean | null
          flag_shutter_removal: boolean | null
          flag_stairway: boolean | null
          flag_steel_concrete: boolean | null
          flag_takedowns: boolean | null
          flag_windows_over_20ft: boolean | null
          flat_rate_mileage_fee: number | null
          form_number: string | null
          gate_code: string | null
          grand_total: number | null
          hard_surface_count: number | null
          has_3db_hub: boolean | null
          has_additional_battery: boolean | null
          has_battery_charger: boolean | null
          has_hard_surface: boolean | null
          has_internet_hub: boolean | null
          has_misc_fees: boolean | null
          has_motorization: boolean | null
          has_remote_controls: boolean | null
          has_special_quote: boolean | null
          has_stairway: boolean | null
          high_ladder_count: number | null
          high_rise_or_ferry: boolean | null
          highlight_until: string | null
          hoa_approval_required: boolean | null
          hub_count: number | null
          id: string
          incomplete_reason: string | null
          install_address_normalized: string | null
          install_date_end: string | null
          install_date_range: string | null
          install_date_start: string | null
          installation_vendor: string | null
          installer_active_in_sf: boolean | null
          installer_code: string | null
          installer_cost_chart: number | null
          installer_ids: string[] | null
          installer_quote_amount: number | null
          inventory_blinds: number | null
          inventory_boxes: number | null
          inventory_pallets: number | null
          inventory_row: string | null
          inventory_section: string | null
          inventory_updated_at: string | null
          inventory_updated_by: string | null
          invoice_amount: number | null
          invoice_approval_id: string | null
          invoice_status: Database["public"]["Enums"]["invoice_status"] | null
          invoiced_at: string | null
          is_cod: boolean | null
          is_deleted: boolean | null
          is_new_arrival: boolean | null
          is_paid: boolean | null
          job_number: string
          job_type: Database["public"]["Enums"]["job_type"]
          jobsight_link: string | null
          labor_amount: number | null
          labor_po_number: string | null
          labor_summary: number | null
          labor_total: number | null
          ladder_count: number | null
          last_confirmation_sms_at: string | null
          last_sms_response: string | null
          last_sms_response_at: string | null
          last_sms_sent_at: string | null
          latitude: number | null
          lead_time: string | null
          line_item_count_mismatch: boolean | null
          line_items_detail: Json | null
          linked_tech_measure_id: string | null
          longitude: number | null
          lowes_check_date: string | null
          lowes_check_number: string | null
          lowes_has_discrepancy: boolean | null
          lowes_payment_amount: number | null
          lowes_payment_exception_amount: number | null
          lowes_payment_item_id: string | null
          lowes_payment_status: string | null
          mark_for: string | null
          material_labor_subtotal: number | null
          material_summary: number | null
          material_total: number | null
          measure_confirmation: string | null
          measure_status: string | null
          measure_submitted_at: string | null
          misc_fees_amount: number | null
          model_program: string | null
          mts_job_number: string | null
          must_be_tech:
            | Database["public"]["Enums"]["must_be_tech_option"]
            | null
          needs_document_download: boolean | null
          needs_mileage_pay: boolean | null
          new_arrival_at: string | null
          num_blinds_shades: number | null
          num_cut_downs: number | null
          num_draperies: number | null
          num_hard_surface: number | null
          num_items: number | null
          num_ladders: number | null
          num_outside_mount: number | null
          num_over_90_wide: number | null
          num_shutter_tracks: number | null
          num_shutters: number | null
          num_takedowns: number | null
          number_of_blinds_shades: number | null
          number_of_drapery: number | null
          number_of_miles: number | null
          number_of_motorized: number | null
          number_of_shutters: number | null
          number_of_windows_to_measure: number | null
          on_hold_reason: string | null
          order_id: string | null
          order_verified: boolean | null
          order_verified_at: string | null
          order_verified_by: string | null
          ordered_date: string | null
          over_10_feet: boolean | null
          payment_amount: number | null
          payment_date: string | null
          payment_period_id: string | null
          payment_terms: string | null
          permanent_delete_at: string | null
          pickup_at_store: boolean | null
          portal_priority_requested: boolean | null
          portal_priority_requested_at: string | null
          product_location: string | null
          product_received_at: string | null
          product_type: Database["public"]["Enums"]["product_type"]
          project_number: string | null
          qb_invoice_id: string | null
          quantity_hard_surface: number | null
          quantity_high_windows_10_14ft: number | null
          quantity_high_windows_14_20ft: number | null
          quantity_outside_mount: number | null
          quantity_over_90_inches: number | null
          quote_date: string | null
          remeasure_needed: boolean | null
          remeasure_required: boolean | null
          requires_manual_review: boolean | null
          requires_phone_call: boolean | null
          retailer: string | null
          retailer_phone: string | null
          return_trip_type: string | null
          sales_order_number: string | null
          salesman: string | null
          salesperson: string | null
          salesperson_name: string | null
          scheduled_by: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          separate_valance_count: number | null
          service_level: string | null
          service_report_base_snapshot: Json | null
          service_report_data: Json | null
          service_report_final_snapshot: Json | null
          service_report_snapshot_version: number
          service_report_submitted_at: string | null
          service_report_template: string | null
          shutter_removal_quote: number | null
          shutter_track_count: number | null
          sidemark: string | null
          skylight_count: number | null
          sms_message_left_at: string | null
          sms_message_left_count: number | null
          specialty_shape_windows: number | null
          split_from_job_id: string | null
          split_to_job_ids: string[] | null
          springs_order: string | null
          square_footage: number | null
          status: Database["public"]["Enums"]["job_status"] | null
          status_changed_at: string | null
          steel_or_concrete: boolean | null
          store_number: string | null
          tallest_height: number | null
          tallest_window_feet: number | null
          tax_rate: number | null
          tax_summary: number | null
          tax_total: number | null
          technician_inventory_boxes: number | null
          technician_inventory_notes: string | null
          technician_inventory_section: string | null
          technician_inventory_updated_at: string | null
          technician_inventory_updated_by: string | null
          technician_notes: string | null
          total_products: number | null
          unit_number: string | null
          updated_at: string | null
          vendor: string | null
          vendor_name: string | null
          vn_form_number: string | null
          vn_quote_date: string | null
          vn_session_id: string | null
          windows_to_measure: number | null
          wo_number: string | null
          work_order_type: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_customers_for_inventory:
        | {
            Args: { result_limit?: number; search_term: string }
            Returns: {
              account_id: string
              customer_name: string
              id: string
              inventory_boxes: number
              inventory_pallets: number
              inventory_row: string
              inventory_section: string
              job_number: string
              match_rank: number
              mts_job_number: string
              number_of_blinds_shades: number
              number_of_drapery: number
              number_of_shutters: number
              product_type: string
              status: string
              store_number: string
              total_products: number
            }[]
          }
        | {
            Args: {
              account_filter_id?: string
              result_limit?: number
              search_term: string
            }
            Returns: {
              account_id: string
              account_name: string
              customer_name: string
              id: string
              inventory_boxes: number
              inventory_pallets: number
              inventory_row: string
              inventory_section: string
              job_number: string
              job_type: string
              match_rank: number
              mts_job_number: string
              number_of_blinds_shades: number
              number_of_drapery: number
              number_of_shutters: number
              product_type: string
              status: string
              store_number: string
              total_products: number
            }[]
          }
      search_jobs_by_phone: {
        Args: { job_status?: string; search_phone: string }
        Returns: {
          account_id: string
          calculated_duration_minutes: number
          customer_address: string
          customer_name: string
          customer_phone: string
          duration_minutes: number
          id: string
          job_number: string
          job_type: string
          latitude: number
          longitude: number
          must_be_tech: string
          status: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      upsert_agent_ops_run: {
        Args: {
          p_agent_id: string
          p_blocker_at?: string
          p_blocker_code?: string
          p_blocker_reason?: string
          p_completion_status?: string
          p_ended_at?: string
          p_escalation_reason?: string
          p_ingested_via?: string
          p_items_failed?: number
          p_items_processed?: number
          p_items_remaining?: number
          p_items_skipped?: number
          p_items_success?: number
          p_model_used?: string
          p_raw_output_json?: Json
          p_run_id: string
          p_started_at?: string
          p_trigger_type?: string
          p_triggered_by?: string
          p_webhooks_retry_count?: number
          p_webhooks_sent_failed?: number
          p_webhooks_sent_ok?: number
          p_workflow_audit_id?: string
          p_workflow_id?: string
        }
        Returns: {
          upserted_run_id: string
          was_insert: boolean
        }[]
      }
      validate_invite_token: { Args: { p_token: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "user"
      crm_user_role: "admin" | "installer" | "account" | "contractor"
      document_type:
        | "job_paperwork"
        | "photo"
        | "incomplete_report"
        | "invoice"
        | "signature_form"
      invoice_status:
        | "not_invoiced"
        | "invoiced"
        | "paid"
        | "pending_approval"
        | "no_charge"
        | "draft"
      job_status:
        | "approval_needed"
        | "ready_to_schedule"
        | "waiting_for_product"
        | "partial_product_received"
        | "all_product_received"
        | "message_left"
        | "job_on_hold"
        | "scheduled"
        | "incomplete"
        | "complete"
        | "billing"
        | "closed_archived"
        | "needs_paperwork"
        | "canceled"
        | "need_to_call"
        | "orders_to_place"
      job_type:
        | "installation"
        | "technical_measure"
        | "repair"
        | "inspection"
        | "rework"
        | "service_visit"
        | "return_trip"
        | "work_order"
        | "pickup"
      message_type:
        | "shared_chat"
        | "admin_only"
        | "staff_no_installer"
        | "system_notification"
      must_be_tech_option:
        | "danny_only"
        | "stevie_only"
        | "kevin_only"
        | "tony_only"
        | "kevin_tony"
        | "stevie_kevin_tony"
        | "stevie_kevin"
        | "danny_stevie"
        | "mike_only"
        | "danny_kevin"
        | "kevin_mike"
        | "danny_mike"
        | "danny_stevie_kevin"
      notification_type: "alert" | "reminder" | "error" | "info"
      photo_category: "job_site" | "incomplete_report" | "completion"
      product_type:
        | "shutters"
        | "blinds_shades"
        | "drapery"
        | "motorized_blinds_shades"
        | "shutters_and_blinds"
      reminder_frequency: "once" | "daily" | "escalating"
      sms_direction: "inbound" | "outbound"
      sms_rejection_reason:
        | "stale_response"
        | "conflict_detected"
        | "option_unavailable"
        | "proximity_failed"
        | "calendar_blocked"
        | "expired"
        | "customer_declined"
        | "invalid_response"
        | "other"
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
      app_role: ["admin", "user"],
      crm_user_role: ["admin", "installer", "account", "contractor"],
      document_type: [
        "job_paperwork",
        "photo",
        "incomplete_report",
        "invoice",
        "signature_form",
      ],
      invoice_status: [
        "not_invoiced",
        "invoiced",
        "paid",
        "pending_approval",
        "no_charge",
        "draft",
      ],
      job_status: [
        "approval_needed",
        "ready_to_schedule",
        "waiting_for_product",
        "partial_product_received",
        "all_product_received",
        "message_left",
        "job_on_hold",
        "scheduled",
        "incomplete",
        "complete",
        "billing",
        "closed_archived",
        "needs_paperwork",
        "canceled",
        "need_to_call",
        "orders_to_place",
      ],
      job_type: [
        "installation",
        "technical_measure",
        "repair",
        "inspection",
        "rework",
        "service_visit",
        "return_trip",
        "work_order",
        "pickup",
      ],
      message_type: [
        "shared_chat",
        "admin_only",
        "staff_no_installer",
        "system_notification",
      ],
      must_be_tech_option: [
        "danny_only",
        "stevie_only",
        "kevin_only",
        "tony_only",
        "kevin_tony",
        "stevie_kevin_tony",
        "stevie_kevin",
        "danny_stevie",
        "mike_only",
        "danny_kevin",
        "kevin_mike",
        "danny_mike",
        "danny_stevie_kevin",
      ],
      notification_type: ["alert", "reminder", "error", "info"],
      photo_category: ["job_site", "incomplete_report", "completion"],
      product_type: [
        "shutters",
        "blinds_shades",
        "drapery",
        "motorized_blinds_shades",
        "shutters_and_blinds",
      ],
      reminder_frequency: ["once", "daily", "escalating"],
      sms_direction: ["inbound", "outbound"],
      sms_rejection_reason: [
        "stale_response",
        "conflict_detected",
        "option_unavailable",
        "proximity_failed",
        "calendar_blocked",
        "expired",
        "customer_declined",
        "invalid_response",
        "other",
      ],
    },
  },
} as const
