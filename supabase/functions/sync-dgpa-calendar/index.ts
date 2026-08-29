import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  selectDgpaResource,
  parseDgpaCalendarCsv,
  decodeDgpaBuffer,
  type DgpaDatasetMetadata,
} from '../_shared/dgpa-calendar/parser.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error: missing Supabase environment variables' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Verify caller authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized: 請先登入。' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceRoleKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })

    const { data: { user }, error: userError } = await authClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: 登入驗證無效或已過期。' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Parse and validate input year
    let body: any
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const year = Number(body?.year)
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      return new Response(JSON.stringify({ error: '請提供有效的西元年份 (1900-2100)。' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Fetch DGPA metadata from data.gov.tw dataset 14718
    const metadataUrl = 'https://data.gov.tw/api/v2/rest/dataset/14718'
    let metadata: DgpaDatasetMetadata
    try {
      const metaRes = await fetch(metadataUrl, {
        headers: { Accept: 'application/json' },
      })
      if (!metaRes.ok) {
        throw new Error(`Upstream metadata HTTP ${metaRes.status}`)
      }
      metadata = await metaRes.json()
    } catch (err: any) {
      return new Response(JSON.stringify({ error: `無法取得 DGPA dataset metadata: ${err.message}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. Select candidate resource for target ROC year
    let candidate
    try {
      candidate = selectDgpaResource(metadata, year)
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 5. Download DGPA CSV
    let csvBuffer: ArrayBuffer
    try {
      const csvRes = await fetch(candidate.resourceDownloadUrl)
      if (!csvRes.ok) {
        throw new Error(`Download HTTP ${csvRes.status}`)
      }
      csvBuffer = await csvRes.arrayBuffer()
    } catch (err: any) {
      return new Response(JSON.stringify({ error: `無法下載 DGPA CSV 資源: ${err.message}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 6. Decode CSV buffer according to metadata encoding
    const encoding = candidate.resourceCharacterEncoding || 'utf-8'
    const csvText = decodeDgpaBuffer(new Uint8Array(csvBuffer), encoding)

    // 7. Parse and validate full year
    let rows
    try {
      rows = parseDgpaCalendarCsv(csvText, year)
    } catch (err: any) {
      return new Response(JSON.stringify({ error: `DGPA CSV 格式或驗證失敗: ${err.message}` }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 8. Trusted DB write via privileged RPC using service role client
    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    })

    const fetchedAt = new Date().toISOString()
    const { data: insertedCount, error: rpcError } = await serviceClient.rpc('sync_dgpa_calendar_year', {
      target_year: year,
      p_source: candidate.resourceDownloadUrl,
      p_fetched_at: fetchedAt,
      rows,
    })

    if (rpcError) {
      return new Response(JSON.stringify({ error: `資料庫寫入失敗: ${rpcError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: insertedCount ?? rows.length,
        year,
        source: candidate.resourceDownloadUrl,
        fetched_at: fetchedAt,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `伺服器錯誤: ${err.message || '未知錯誤'}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
