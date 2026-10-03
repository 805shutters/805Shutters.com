// Synthetic local browser only; no production account or provider.
export const supabase = {auth:{getSession:async()=>({data:{session:{access_token:'local-fixture'}}})}};
