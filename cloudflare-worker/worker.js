// Cloudflare Email Worker
// This runs on Cloudflare's edge and receives every email sent to @testinbox.icu
// It then forwards the email data to our API on Render

export default {
  async email(message, env, ctx) {
    try {
      // Get basic email info
      const to = message.to;
      const from = message.from;

      // Read the raw email body
      const rawEmail = await new Response(message.raw).text();

      // Extract subject from raw email headers
      const subjectMatch = rawEmail.match(/^Subject:\s*(.+)$/im);
      const subject = subjectMatch ? subjectMatch[1].trim() : '(no subject)';

      // Extract plain text body
      const body = extractBody(rawEmail);

      // Send to our API
      const response = await fetch(`${env.API_URL}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': env.WEBHOOK_SECRET,
        },
        body: JSON.stringify({ to, from, subject, body }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`API error: ${response.status} - ${text}`);
      } else {
        console.log(`Email delivered to ${to} successfully`);
      }

    } catch (error) {
      console.error('Worker error:', error.message);
    }
  },
};

// Extract plain text from raw email
function extractBody(rawEmail) {
  // Try to find plain text part
  const lines = rawEmail.split('\n');
  let inBody = false;
  let body = [];
  let foundBlankLine = false;

  for (const line of lines) {
    if (!foundBlankLine) {
      if (line.trim() === '') {
        foundBlankLine = true;
        inBody = true;
      }
      continue;
    }

    if (inBody) {
      // Skip MIME boundaries and headers
      if (line.startsWith('--') || line.match(/^Content-/i)) continue;
      body.push(line);
    }
  }

  return body.join('\n').trim() || rawEmail;
}
