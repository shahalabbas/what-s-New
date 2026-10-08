import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const expectedSecret = Deno.env.get('INGEST_WEBHOOK_SECRET') ?? ''

    const providedSecret = req.headers.get('x-webhook-secret')
    if (expectedSecret && providedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid webhook secret' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const payload = await req.json()
    const { message_id, subject, from, date, raw_text } = payload

    if (!raw_text) {
      return new Response(JSON.stringify({ error: 'Missing raw_text in body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Deduplicate by message_id
    if (message_id) {
      const { data: existingItem } = await supabase
        .from('ingest_items')
        .select('id')
        .eq('message_id', message_id)
        .maybeSingle()

      if (existingItem) {
        return new Response(JSON.stringify({ message: 'Item already ingested', item_id: existingItem.id }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // 2. Create or find an email batch
    let batchId: string | null = null
    const { data: batch } = await supabase
      .from('ingest_batches')
      .insert({
        kind: 'email',
        source: 'gmail',
        status: 'pending_review',
        summary: { subject: subject || 'Automated Gmail Ingest' },
      })
      .select('id')
      .single()

    if (batch) {
      batchId = batch.id
    }

    // 3. Rule-based item type and prefill extraction
    const lower = (raw_text + ' ' + (subject || '')).toLowerCase()
    let itemType = 'notice'
    if (lower.includes('placement') || lower.includes('ppt') || lower.includes('shortlist') || lower.includes('interview')) {
      itemType = 'placement_event'
    } else if (lower.includes('assignment') || lower.includes('homework') || lower.includes('due date')) {
      itemType = 'assignment'
    } else if (lower.includes('project') || lower.includes('capstone') || lower.includes('deliverable')) {
      itemType = 'project'
    } else if (lower.includes('meeting') || lower.includes('townhall') || lower.includes('committee')) {
      itemType = 'meeting'
    }

    const prefill = {
      title: subject || raw_text.slice(0, 60),
      description: raw_text,
      itemType,
      receivedAt: date || new Date().toISOString(),
      from: from || 'unknown',
    }

    // 4. Insert into ingest_items
    const { data: item, error: insertError } = await supabase
      .from('ingest_items')
      .insert({
        batch_id: batchId,
        message_id: message_id || null,
        raw_text: raw_text,
        raw_meta: { subject, from, date, message_id },
        prefill: prefill,
        item_type: itemType,
        status: 'pending',
      })
      .select()
      .single()

    if (insertError) {
      throw insertError
    }

    return new Response(JSON.stringify({ success: true, item_id: item.id, item_type: itemType }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
