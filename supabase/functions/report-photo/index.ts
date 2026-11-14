import { createClient } from '@supabase/supabase-js'
import { createReportPhotoHandler } from './handler.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
if (!supabaseUrl || !anonKey) throw new Error('Supabase runtime configuration is missing')

const allowedOrigin = Deno.env.get('PHASE2_ALLOWED_ORIGIN') ?? 'http://localhost:5173'

Deno.serve(createReportPhotoHandler({
  origin: allowedOrigin,
  authenticate: async (token) => {
    const client = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: userData, error: userError } = await client.auth.getUser(token)
    if (userError || !userData.user) return null
    const { data: eligible, error: memberError } = await client.rpc('is_ashoka_member')
    if (memberError || eligible !== true) return null
    return {
      id: userData.user.id,
      store: async (path, bytes) => {
        const { error } = await client.storage.from('report-photos').upload(path, bytes, {
          contentType: 'image/jpeg', cacheControl: '60', upsert: false,
        })
        if (error) throw error
      },
      register: async (reportId, path, width, height, bytes) => {
        const { error } = await client.rpc('add_report_photo', {
          p_report_id: reportId, p_object_path: path, p_width: width, p_height: height, p_bytes: bytes,
        })
        if (error) throw error
      },
      remove: async (path) => {
        const { error } = await client.storage.from('report-photos').remove([path])
        if (error) throw error
      },
    }
  },
}))
