function formatDevice(visitor) {
  const { client, clientHints } = visitor
  const platform = clientHints.platform || client.platform
  const size = client.screenWidth && client.screenHeight
    ? `${client.screenWidth}×${client.screenHeight}`
    : ''
  return [platform, size, client.language].filter(Boolean).join(' · ')
}

export async function pushVisit({ visitor, geo }) {
  const key = process.env.BARK_KEY
  if (!key) {
    throw new Error('BARK_KEY is not set')
  }

  const base = (process.env.BARK_API || 'https://api.day.app').replace(/\/$/, '')
  const time = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
  const device = formatDevice(visitor)
  const coords = geo?.lat != null && geo?.lon != null ? `${geo.lat}, ${geo.lon}` : ''

  const lines = [
    `时间 ${time}`,
    `IP ${visitor.ip || '未知'}`,
    geo?.address ? `位置 ${geo.address}` : '',
    coords ? `坐标 ${coords}` : '',
    geo?.isp ? `网络 ${geo.isp}` : '',
    visitor.path ? `页面 ${visitor.path}` : '',
    visitor.referrer ? `来源 ${visitor.referrer}` : '',
    device ? `设备 ${device}` : '',
  ].filter(Boolean)

  const response = await fetch(`${base}/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      title: 'terenzzzz.cn来访',
      body: lines.join('\n'),
      group: 'terenzzzz.cn来访',
      icon: 'https://terenzzzz.cn/logo.png',
    }),
    signal: AbortSignal.timeout(8000),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.code !== 200) {
    const message = payload?.message || `Bark responded ${response.status}`
    throw new Error(message)
  }

  return payload
}
