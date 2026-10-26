import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

interface DueItem {
  kind: 'class' | 'meal' | 'test'
  item_key: string
  program?: string | null
  batch_year?: number | null
  title: string
  body: string
  url: string
  tag?: string
  meal_type?: string | null
}

interface SubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  failure_count: number
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const expectedCronSecret = Deno.env.get('CRON_SECRET') ?? ''

    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:shahalabbasv.dem2026@iimu.ac.in'

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY')
      return new Response(JSON.stringify({ error: 'Server VAPID keys not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ─── 1. Authentication Check (Cron Secret OR Admin JWT) ───────────
    const providedSecret = req.headers.get('x-cron-secret')
    let isCronAuth = Boolean(expectedCronSecret && providedSecret === expectedCronSecret)
    let callingAdminUser: any = null

    if (!isCronAuth) {
      const authHeader = req.headers.get('authorization')
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '').trim()
        const { data: userData, error: userErr } = await supabase.auth.getUser(token)
        if (!userErr && userData?.user) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userData.user.id)
            .maybeSingle()

          if (prof?.role === 'admin') {
            callingAdminUser = userData.user
          }
        }
      }
    }

    if (!isCronAuth && !callingAdminUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing x-cron-secret or Admin JWT' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const bodyJson = await req.json().catch(() => ({}))

    // ─── 2. Admin Test Mode ──────────────────────────────────────────
    if (bodyJson.mode === 'test') {
      const targetUserId = callingAdminUser?.id || bodyJson.user_id
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: 'Missing admin target user for test mode' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: adminSubs } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', targetUserId)

      if (!adminSubs || adminSubs.length === 0) {
        return new Response(
          JSON.stringify({
            message: 'No subscribed devices found for this account. Turn on reminders first.',
            sent: 0,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const testPayload = {
        title: "🔔 Test Reminder · What's Next",
        body: '24/7 background push notifications are configured and working on this device!',
        url: '/',
        tag: `test-reminder-${Date.now()}`,
      }

      let sentCount = 0
      for (const sub of adminSubs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(testPayload),
            { TTL: 300, urgency: 'high' }
          )
          sentCount++
          await supabase
            .from('push_subscriptions')
            .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
            .eq('id', sub.id)
        } catch (err: any) {
          console.error('Test push error:', err?.statusCode || err?.message)
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id)
          }
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Test notification sent to ${sentCount} device(s)`,
          sent: sentCount,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── 3. Standard Scheduled Batch Dispatch ─────────────────────────
    const dueItems: DueItem[] = Array.isArray(bodyJson.items) ? bodyJson.items : []
    if (dueItems.length === 0) {
      return new Response(JSON.stringify({ message: 'No items due', sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let totalSent = 0
    let totalFailed = 0
    let totalRemoved = 0

    for (const item of dueItems) {
      // Step A: Target audience
      let targetUserIds: string[] = []

      if (item.kind === 'class' && item.program && item.batch_year) {
        const { data: cohortUsers } = await supabase
          .from('profiles')
          .select('id')
          .ilike('program', item.program)
          .eq('batch_year', item.batch_year)

        targetUserIds = (cohortUsers || []).map((u) => u.id)
      } else {
        // Meals target all registered profiles
        const { data: allUsers } = await supabase.from('profiles').select('id')
        targetUserIds = (allUsers || []).map((u) => u.id)
      }

      if (targetUserIds.length === 0) continue

      // Step B: Filter by notification_prefs
      const { data: prefsList } = await supabase
        .from('notification_prefs')
        .select('user_id, classes, meals, meal_types')
        .in('user_id', targetUserIds)

      const prefsMap = new Map((prefsList || []).map((p) => [p.user_id, p]))

      const eligibleUserIds = targetUserIds.filter((userId) => {
        const pref = prefsMap.get(userId)
        if (!pref) return true // default is enabled

        if (item.kind === 'class') {
          return pref.classes !== false
        }
        if (item.kind === 'meal') {
          if (pref.meals === false) return false
          if (item.meal_type && Array.isArray(pref.meal_types)) {
            return pref.meal_types.includes(item.meal_type)
          }
          return true
        }
        return true
      })

      if (eligibleUserIds.length === 0) continue

      // Step C: Skip users who already received this notification (Deduplication)
      const { data: alreadySent } = await supabase
        .from('notifications_sent')
        .select('user_id')
        .eq('kind', item.kind)
        .eq('item_key', item.item_key)
        .in('user_id', eligibleUserIds)

      const alreadySentSet = new Set((alreadySent || []).map((s) => s.user_id))
      const pendingUserIds = eligibleUserIds.filter((id) => !alreadySentSet.has(id))

      if (pendingUserIds.length === 0) continue

      // Step D: Query subscriptions for pending users
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('*')
        .in('user_id', pendingUserIds)

      const activeSubs: SubscriptionRow[] = subs || []
      if (activeSubs.length === 0) continue

      const pushPayload = JSON.stringify({
        title: item.title,
        body: item.body,
        url: item.url,
        tag: item.tag || `${item.kind}-${item.item_key}`,
      })

      // Step E: Send in parallel batches of 50
      const BATCH_SIZE = 50
      for (let i = 0; i < activeSubs.length; i += BATCH_SIZE) {
        const batch = activeSubs.slice(i, i + BATCH_SIZE)

        const results = await Promise.allSettled(
          batch.map(async (sub) => {
            try {
              await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                pushPayload,
                { TTL: 300, urgency: 'high' }
              )
              return { status: 'fulfilled', sub }
            } catch (err: any) {
              return { status: 'rejected', sub, error: err }
            }
          })
        )

        for (const res of results) {
          if (res.status === 'fulfilled' && (res.value as any)?.status === 'fulfilled') {
            const sub = (res.value as any).sub
            totalSent++

            // Record in notifications_sent & update last_success_at
            await Promise.all([
              supabase.from('notifications_sent').upsert(
                { user_id: sub.user_id, kind: item.kind, item_key: item.item_key },
                { onConflict: 'user_id,kind,item_key' }
              ),
              supabase
                .from('push_subscriptions')
                .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
                .eq('id', sub.id),
            ])
          } else {
            const rejected = res.status === 'fulfilled' ? (res.value as any) : res
            const sub: SubscriptionRow = rejected.sub
            const err = rejected.error
            const statusCode = err?.statusCode

            totalFailed++

            if (statusCode === 404 || statusCode === 410) {
              // 404/410 Gone: Device unsubscribed or token expired
              await supabase.from('push_subscriptions').delete().eq('id', sub.id)
              totalRemoved++
            } else {
              const newFailureCount = (sub.failure_count || 0) + 1
              if (newFailureCount >= 5) {
                await supabase.from('push_subscriptions').delete().eq('id', sub.id)
                totalRemoved++
              } else {
                await supabase
                  .from('push_subscriptions')
                  .update({ failure_count: newFailureCount })
                  .eq('id', sub.id)
              }
            }
          }
        }
      }
    }

    console.log(`[send-reminders] due=${dueItems.length} sent=${totalSent} failed=${totalFailed} removed=${totalRemoved}`)

    return new Response(
      JSON.stringify({
        success: true,
        due_items: dueItems.length,
        sent: totalSent,
        failed: totalFailed,
        removed: totalRemoved,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('Fatal send-reminders error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
