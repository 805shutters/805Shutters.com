export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      sales_quotes: {
        Row: {
          id: string;
          quote_number: string;
          account_id: string;
          status: "draft" | "sent" | "sold" | "ordered" | "received" | "installed" | "archived";
          customer_name: string;
          customer_email: string | null;
          customer_phone: string | null;
          customer_address: string | null;
          appointment_date: string | null;
          installer_notes: string | null;
          product_cost: number | null;
          total_amount: number | null;
          profit_amount: number | null;
          deposit_paid: number | null;
          balance_paid: number | null;
          payment_method: string | null;
          customer_signature: string | null;
          customer_printed_name: string | null;
          signed_at: string | null;
          share_token: string | null;
          created_by: string | null;
          created_job_id: string | null;
          created_at: string | null;
          updated_at: string | null;
          quote_group_id: string | null;
          quote_letter: string;
          sent_at: string | null;
          ordered_at: string | null;
          received_at: string | null;
          installed_at: string | null;
          archived_at: string | null;
          sent_via: "email" | "sms" | "both" | null;
          manufacturer_order_ref: string | null;
          manufacturer_cost: number | null;
          manufacturer_name: "Onyx" | "Norman" | "Other" | null;
          sales_owner: "mike" | "jessica" | null;
          sales_owner_auth_user_id: string | null;
          sales_owner_set_at: string | null;
        };
        Insert: {
          id?: string;
          quote_number: string;
          account_id: string;
          status?: "draft" | "sent" | "sold" | "ordered" | "received" | "installed" | "archived";
          customer_name: string;
          customer_email?: string | null;
          customer_phone?: string | null;
          customer_address?: string | null;
          appointment_date?: string | null;
          installer_notes?: string | null;
          product_cost?: number | null;
          total_amount?: number | null;
          profit_amount?: number | null;
          deposit_paid?: number | null;
          balance_paid?: number | null;
          payment_method?: string | null;
          customer_signature?: string | null;
          customer_printed_name?: string | null;
          signed_at?: string | null;
          share_token?: string | null;
          created_by?: string | null;
          created_job_id?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          quote_group_id?: string | null;
          quote_letter?: string;
          sent_at?: string | null;
          ordered_at?: string | null;
          received_at?: string | null;
          installed_at?: string | null;
          archived_at?: string | null;
          sent_via?: "email" | "sms" | "both" | null;
          manufacturer_order_ref?: string | null;
          manufacturer_cost?: number | null;
          manufacturer_name?: "Onyx" | "Norman" | "Other" | null;
          sales_owner?: "mike" | "jessica" | null;
          sales_owner_auth_user_id?: string | null;
          sales_owner_set_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["sales_quotes"]["Insert"]>;
        Relationships: [];
      };
      sales_quote_line_items: {
        Row: {
          id: string;
          quote_id: string;
          room_name: string;
          product_type: string;
          width_whole: number;
          width_fraction: string;
          height_whole: number;
          height_fraction: string;
          quantity: number;
          sort_order: number;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          quote_id: string;
          room_name: string;
          product_type: string;
          width_whole: number;
          width_fraction?: string;
          height_whole: number;
          height_fraction?: string;
          quantity?: number;
          sort_order?: number;
          created_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["sales_quote_line_items"]["Insert"]>;
        Relationships: [];
      };
      sales_quote_designs: {
        Row: {
          id: string;
          line_item_id: string;
          variant: string;
          product_type: string | null;
          supplier: string | null;
          material: string | null;
          louver_size: string | null;
          tilt_type: string | null;
          hinge_color: string | null;
          panel_config: string | null;
          mount_type: string | null;
          shade_type: string | null;
          lift_system: string | null;
          valance: string | null;
          fabric: string | null;
          motor_type: string | null;
          remote_type: string | null;
          hard_surface_install: boolean | null;
          ladder_over_15ft: boolean | null;
          requires_takedown: boolean | null;
          unit_price: number | null;
          notes: string | null;
          options_json: Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          line_item_id: string;
          variant?: string;
          product_type?: string | null;
          supplier?: string | null;
          material?: string | null;
          louver_size?: string | null;
          tilt_type?: string | null;
          hinge_color?: string | null;
          panel_config?: string | null;
          mount_type?: string | null;
          shade_type?: string | null;
          lift_system?: string | null;
          valance?: string | null;
          fabric?: string | null;
          motor_type?: string | null;
          remote_type?: string | null;
          hard_surface_install?: boolean | null;
          ladder_over_15ft?: boolean | null;
          requires_takedown?: boolean | null;
          unit_price?: number | null;
          notes?: string | null;
          options_json?: Json | null;
          created_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["sales_quote_designs"]["Insert"]>;
        Relationships: [];
      };
      sales_quote_media: {
        Row: {
          id: string;
          quote_id: string;
          line_item_id: string | null;
          source: "manufacturer" | "uploaded" | "customer" | "job_site";
          image_url: string;
          title: string;
          caption: string | null;
          product_type: string | null;
          supplier: string | null;
          sort_order: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          quote_id: string;
          line_item_id?: string | null;
          source?: "manufacturer" | "uploaded" | "customer" | "job_site";
          image_url: string;
          title?: string;
          caption?: string | null;
          product_type?: string | null;
          supplier?: string | null;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sales_quote_media"]["Insert"]>;
        Relationships: [];
      };
      sales_805_appointments: {
        Row: {
          id: string;
          account_id: string;
          quote_id: string | null;
          customer_name: string;
          customer_phone: string | null;
          customer_phone_normalized: string | null;
          customer_address: string;
          appointment_date: string;
          start_time: string;
          end_time: string | null;
          assigned_to: "Mike" | "Jessica";
          status: "scheduled" | "completed" | "cancelled";
          notes: string | null;
          source: string;
          created_by: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id?: string;
          quote_id?: string | null;
          customer_name: string;
          customer_phone?: string | null;
          customer_phone_normalized?: string | null;
          customer_address: string;
          appointment_date: string;
          start_time: string;
          end_time?: string | null;
          assigned_to: "Mike" | "Jessica";
          status?: "scheduled" | "completed" | "cancelled";
          notes?: string | null;
          source?: string;
          created_by?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sales_805_appointments"]["Insert"]>;
        Relationships: [];
      };
      quote_order_agent_queue: {
        Row: {
          id: string;
          quote_id: string;
          account_id: string | null;
          request_type: "payload_dry_run" | "portal_draft";
          status: "queued" | "processing" | "completed" | "failed" | "cancelled";
          requested_by: string | null;
          requested_at: string;
          started_at: string | null;
          completed_at: string | null;
          workflow_run_id: string | null;
          screenshot_path: string | null;
          error_message: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          quote_id: string;
          account_id?: string | null;
          request_type?: "payload_dry_run" | "portal_draft";
          status?: "queued" | "processing" | "completed" | "failed" | "cancelled";
          requested_by?: string | null;
          requested_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          workflow_run_id?: string | null;
          screenshot_path?: string | null;
          error_message?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["quote_order_agent_queue"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      crm_users: {
        Row: {
          id: string;
          auth_user_id: string;
          email: string;
          display_name: string | null;
          full_name: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Functions: {
      next_quote_number: {
        Args: { account_prefix: string };
        Returns: string;
      };
      is_805_crm_user: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_805_sales_quote: {
        Args: { quote_id: string };
        Returns: boolean;
      };
      is_805_sales_quote_line_item: {
        Args: { line_item_id: string };
        Returns: boolean;
      };
    };
    Enums: Record<PropertyKey, never>;
    CompositeTypes: Record<PropertyKey, never>;
  };
};

type DefaultSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Insert: infer I }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Update: infer U }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;
