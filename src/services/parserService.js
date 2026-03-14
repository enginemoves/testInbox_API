// Extracts OTP codes and smart verification links from email body

// ─── JUNK DOMAINS ───────────────────────────────────────────────────────────
// These are never verification links — tracking, social, CDN, analytics
const JUNK_DOMAINS = [
  'twitter.com', 'x.com', 'instagram.com', 'facebook.com', 'linkedin.com',
  'youtube.com', 'tiktok.com', 'pinterest.com', 'snapchat.com',
  'track.pstmrk.it', 'ea.pstmrk.it', 'pstmrk.it',
  'amazonaws.com', 'cloudfront.net', 'googleusercontent.com',
  'googletagmanager.com', 'google-analytics.com', 'doubleclick.net',
  'sendgrid.net', 'mailchimp.com', 'klaviyo.com', 'hubspot.com',
  'unsubscribe', 'list-unsubscribe', 'mailto:',
  'apple.com/legal', 'play.google.com',
];

// ─── MAGIC LINK PATTERNS ────────────────────────────────────────────────────
// URL patterns that strongly indicate a verification / magic link
const MAGIC_LINK_PATTERNS = [
  // Path-based signals
  /\/(verify|verification)/i,
  /\/(confirm|confirmation)/i,
  /\/(activate|activation)/i,
  /\/(reset|password-reset|forgot)/i,
  /\/(magic|magiclink|magic-link)/i,
  /\/(login|signin|sign-in|auth)/i,
  /\/(invite|invitation|accept)/i,
  /\/(onboard|setup|complete|finish)/i,
  /\/(click|go|action|redirect)/i,

  // Query param signals — token, code, key in the URL
  /[?&](token|t|key|k|code|c|hash|h|uid|user_id)=/i,
  /[?&](magic|link|verify|confirm|activate|reset)=/i,
];

// ─── HTML STRIPPER ──────────────────────────────────────────────────────────
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── OTP EXTRACTOR ──────────────────────────────────────────────────────────
// Detects codes that are 3 to 8 digits long
function extractOTP(text) {
  if (!text) return null;

  const cleanText = stripHtml(text);

  const otpPatterns = [
    // Explicit label + code (highest confidence)
    /(?:verification|confirm|otp|one.time|passcode|pin|security|access)\s*(?:code|is|:)[:\s]*(\d{3,8})/i,
    /your\s+(?:code|otp|pin|password)\s+(?:is|:)\s*(\d{3,8})/i,
    /(?:code|otp|pin)\s*(?:is|:)\s*(\d{3,8})/i,
    /enter\s+(?:code|otp|pin)[:\s]+(\d{3,8})/i,
    /use\s+(?:code|otp|this)[:\s]+(\d{3,8})/i,
    /(?:here\s+is|here's)\s+your\s+(?:code|otp)[:\s]*(\d{3,8})/i,

    // Standalone line — a line with ONLY 3-8 digits (very common in HTML emails)
    /^\s*(\d{3,8})\s*$/m,

    // Large isolated number — surrounded by spaces/newlines (fallback)
    /(?:^|\s)(\d{6})(?:\s|$)/m,   // 6-digit (most common OTP)
    /(?:^|\s)(\d{4})(?:\s|$)/m,   // 4-digit
    /(?:^|\s)(\d{8})(?:\s|$)/m,   // 8-digit
    /(?:^|\s)(\d{3})(?:\s|$)/m,   // 3-digit (less common but valid)
    /(?:^|\s)(\d{5})(?:\s|$)/m,   // 5-digit
    /(?:^|\s)(\d{7})(?:\s|$)/m,   // 7-digit
  ];

  for (const pattern of otpPatterns) {
    const match = cleanText.match(pattern);
    if (match) return match[1];
  }

  return null;
}

// ─── LINK CLASSIFIER ────────────────────────────────────────────────────────
function isJunkLink(url) {
  const lower = url.toLowerCase();
  return JUNK_DOMAINS.some(junk => lower.includes(junk));
}

function isMagicLink(url) {
  // Must be https
  if (!url.startsWith('https://')) return false;
  // Must not be junk
  if (isJunkLink(url)) return false;
  // Must match at least one magic link pattern
  return MAGIC_LINK_PATTERNS.some(pattern => pattern.test(url));
}

// ─── LINK EXTRACTOR ─────────────────────────────────────────────────────────
function extractLinks(text) {
  if (!text) return [];

  const urlPattern = /https?:\/\/[^\s"'<>)\]]+/g;
  const allLinks = text.match(urlPattern) || [];

  // Clean trailing punctuation
  const cleaned = allLinks.map(url => url.replace(/[.,;:!?=]+$/, ''));

  // First pass — only real magic/verification links
  const magicLinks = [...new Set(cleaned.filter(isMagicLink))];

  if (magicLinks.length > 0) return magicLinks;

  // Fallback — return all non-junk links if no magic links found
  const nonJunk = [...new Set(cleaned.filter(url => !isJunkLink(url)))];
  return nonJunk;
}

// ─── MAIN PARSER ────────────────────────────────────────────────────────────
function parseEmail(rawBody) {
  const otp = extractOTP(rawBody);
  const links = extractLinks(rawBody);

  return { otp, links };
}

module.exports = { parseEmail, extractOTP, extractLinks, stripHtml };
