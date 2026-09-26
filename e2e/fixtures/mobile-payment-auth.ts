// Local browser fixture only. No real account or provider is used.
export const getSupabaseBrowserClient = () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'local-fixture' } } }) } });
