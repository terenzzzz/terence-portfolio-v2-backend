const hits = new Map()

function prune(windowMs) {
  const now = Date.now()
  for (const [ip, pushedAt] of hits) {
    if (now - pushedAt >= windowMs) hits.delete(ip)
  }
}

export function peekVisit(ip, windowMs) {
  const pushedAt = hits.get(ip)
  if (!pushedAt) return { allowed: true, retryAfter: 0 }

  const elapsed = Date.now() - pushedAt
  if (elapsed >= windowMs) {
    hits.delete(ip)
    return { allowed: true, retryAfter: 0 }
  }

  return {
    allowed: false,
    retryAfter: Math.ceil((windowMs - elapsed) / 1000),
  }
}

export function rememberVisit(ip) {
  hits.set(ip, Date.now())
}

export function startVisitLimiterCleanup(windowMs) {
  const timer = setInterval(() => prune(windowMs), 10 * 60 * 1000)
  timer.unref()
}
