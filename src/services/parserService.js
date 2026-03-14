// Extracts OTP codes and links from email body

function extractOTP(text) {
  if (!text) return null;

  // Match 4-8 digit number codes
  const otpPatterns = [
    /\b(\d{6})\b/,   // 6 digit OTP (most common)
    /\b(\d{4})\b/,   // 4 digit OTP
    /\b(\d{8})\b/,   // 8 digit OTP
    /code[:\s]+(\d{4,8})/i,
    /otp[:\s]+(\d{4,8})/i,
    /verification code[:\s]+(\d{4,8})/i,
    /your code is[:\s]+(\d{4,8})/i,
  ];

  for (const pattern of otpPatterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }

  return null;
}

function extractLinks(text) {
  if (!text) return [];

  const urlPattern = /https?:\/\/[^\s"'<>]+/g;
  const matches = text.match(urlPattern) || [];

  // Remove duplicates
  return [...new Set(matches)];
}

function parseEmail(rawBody) {
  const otp = extractOTP(rawBody);
  const links = extractLinks(rawBody);

  return { otp, links };
}

module.exports = { parseEmail, extractOTP, extractLinks };
