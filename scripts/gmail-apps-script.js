/**
 * Google Apps Script: Auto-Ingest Emails to "What's Next" Ingestion Pipeline
 *
 * Setup Instructions:
 * 1. Open Google Apps Script (https://script.google.com)
 * 2. Create a new project named "WhatsNext-Email-Ingest"
 * 3. Paste this code into Code.gs
 * 4. Configure Project Settings > Script Properties:
 *    - SUPABASE_URL: e.g. https://xyzcompany.supabase.co
 *    - SUPABASE_SERVICE_ROLE_KEY: <your-service-role-key> or SUPABASE_ANON_KEY
 *    - WEBHOOK_SECRET: <your-shared-secret>
 * 5. Set up a Time-driven Trigger:
 *    - Run processWhatsNextEmails every 15 minutes
 */

function processWhatsNextEmails() {
  const props = PropertiesService.getScriptProperties().getProperties()
  const SUPABASE_URL = props.SUPABASE_URL
  const SERVICE_KEY = props.SUPABASE_SERVICE_ROLE_KEY || props.SUPABASE_ANON_KEY
  const WEBHOOK_SECRET = props.WEBHOOK_SECRET || ''

  if (!SUPABASE_URL || !SERVICE_KEY) {
    Logger.log('Supabase credentials not configured in Script Properties.')
    return
  }

  // Label configuration
  const WATCH_LABEL = 'WhatsNext'
  const PROCESSED_LABEL = 'WhatsNext/Processed'

  let watchLabel = GmailApp.getUserLabelByName(WATCH_LABEL)
  if (!watchLabel) {
    watchLabel = GmailApp.createLabel(WATCH_LABEL)
  }

  let processedLabel = GmailApp.getUserLabelByName(PROCESSED_LABEL)
  if (!processedLabel) {
    processedLabel = GmailApp.createLabel(PROCESSED_LABEL)
  }

  // Search for threads with WATCH_LABEL that do not have PROCESSED_LABEL
  const query = `label:${WATCH_LABEL} -label:${PROCESSED_LABEL}`
  const threads = GmailApp.search(query, 0, 20)

  Logger.log(`Found ${threads.length} unread threads matching query: ${query}`)

  for (let i = 0; i < threads.length; i++) {
    const thread = threads[i]
    const messages = thread.getMessages()

    for (let j = 0; j < messages.length; j++) {
      const msg = messages[j]
      const messageId = msg.getId()
      const subject = msg.getSubject()
      const from = msg.getFrom()
      const date = msg.getDate().toISOString()
      const body = msg.getPlainBody()

      // Payload to send to Supabase Edge Function or Table
      const payload = {
        message_id: messageId,
        subject: subject,
        from: from,
        date: date,
        raw_text: `Subject: ${subject}\nFrom: ${from}\nDate: ${date}\nMessage-ID: ${messageId}\n\n${body}`,
        secret: WEBHOOK_SECRET,
      }

      try {
        const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/ingest-email`
        const options = {
          method: 'post',
          contentType: 'application/json',
          headers: {
            Authorization: `Bearer ${SERVICE_KEY}`,
            apikey: SERVICE_KEY,
            'x-webhook-secret': WEBHOOK_SECRET,
          },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
        }

        const res = UrlFetchApp.fetch(edgeFunctionUrl, options)
        const responseCode = res.getResponseCode()
        const responseText = res.getContentText()

        Logger.log(`Message ${messageId} sent. Response (${responseCode}): ${responseText}`)

        if (responseCode >= 200 && responseCode < 300) {
          // Success
        } else {
          Logger.log(`Warning: Edge function returned status ${responseCode}`)
        }
      } catch (err) {
        Logger.log(`Error sending message ${messageId}: ${err.toString()}`)
      }
    }

    // Mark entire thread processed
    thread.addLabel(processedLabel)
    thread.removeLabel(watchLabel)
  }
}
