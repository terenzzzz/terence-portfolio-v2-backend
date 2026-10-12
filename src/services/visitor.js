function text(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .trim()
    .slice(0, max)
}

function numberOrNull(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function stringList(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => text(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

export function clientIp(req) {
  return (req.ip || req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '')
}

function sessionId(value) {
  return text(value, 80).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
}

export function readVisitor(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {}

  return {
    sessionId: sessionId(body.sessionId),
    ip: clientIp(req),
    forwardedFor: text(req.get('x-forwarded-for'), 400),
    path: text(body.path || req.query.path, 200),
    title: text(body.title, 200),
    referrer: text(body.referrer || req.get('referer'), 500),
    origin: text(req.get('origin'), 200),
    host: text(req.get('host'), 200),
    userAgent: text(req.get('user-agent'), 500),
    acceptLanguage: text(req.get('accept-language'), 200),
    clientHints: {
      ua: text(req.get('sec-ch-ua'), 300),
      mobile: text(req.get('sec-ch-ua-mobile'), 20),
      platform: text(req.get('sec-ch-ua-platform'), 80),
      model: text(req.get('sec-ch-ua-model'), 80),
    },
    client: {
      language: text(body.language, 40),
      languages: stringList(body.languages, 8, 40),
      timezone: text(body.timezone, 80),
      platform: text(body.platform, 80),
      vendor: text(body.vendor, 80),
      screenWidth: numberOrNull(body.screenWidth),
      screenHeight: numberOrNull(body.screenHeight),
      viewportWidth: numberOrNull(body.viewportWidth),
      viewportHeight: numberOrNull(body.viewportHeight),
      devicePixelRatio: numberOrNull(body.devicePixelRatio),
      hardwareConcurrency: numberOrNull(body.hardwareConcurrency),
      deviceMemory: numberOrNull(body.deviceMemory),
      maxTouchPoints: numberOrNull(body.maxTouchPoints),
      cookieEnabled: typeof body.cookieEnabled === 'boolean' ? body.cookieEnabled : null,
    },
  }
}
