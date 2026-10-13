/** Connection RPC types for the checked-in BRIX Supabase migration. */
export type SupabaseDatabase = {
  public: {
    Tables: Record<string, never>
    Views: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
    Functions: {
      brix_put_connection: {
        Args: {
          target_user_id: string
          ciphertext: string
          masked_label: string
        }
        Returns: string
      }
      brix_get_connection: {
        Args: { target_user_id: string; target_connection_id?: string | null }
        Returns: { id: string; encrypted_credentials: string }[]
      }
      brix_disconnect_connection: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      brix_connection_status: {
        Args: Record<string, never>
        Returns: { key_label: string; created_at: string }[]
      }
    }
  }
}
