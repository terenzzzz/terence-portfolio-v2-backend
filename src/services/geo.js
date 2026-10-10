function isPrivateIp(ip) {
  if (!ip || ip === 'unknown' || ip === '::1') return true
  if (
    ip.startsWith('127.')
    || ip.startsWith('10.')
    || ip.startsWith('192.168.')
    || ip.startsWith('169.254.')
    || ip.startsWith('fc')
    || ip.startsWith('fd')
    || ip.startsWith('fe80')
  ) return true

  const match = ip.match(/^172\.(\d+)\./)
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31)
}

function addressFrom(geo) {
  return [geo.country, geo.regionName, geo.city, geo.district].filter(Boolean).join(' ')
}

export async function lookupGeo(ip) {
  if (isPrivateIp(ip)) {
    return { status: 'private', address: '本地或内网地址' }
  }

  const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=status,message,country,countryCode,regionName,city,district,zip,lat,lon,timezone,isp,org,as,query`
  const response = await fetch(url, { signal: AbortSignal.timeout(4000) })
  const data = await response.json().catch(() => null)

  if (!response.ok || data?.status !== 'success') {
    return {
      status: 'error',
      address: '',
      message: data?.message || `geo lookup failed (${response.status})`,
    }
  }

  return {
    status: 'ok',
    address: addressFrom(data),
    country: data.country || '',
    countryCode: data.countryCode || '',
    regionName: data.regionName || '',
    city: data.city || '',
    district: data.district || '',
    zip: data.zip || '',
    lat: data.lat ?? null,
    lon: data.lon ?? null,
    timezone: data.timezone || '',
    isp: data.isp || '',
    org: data.org || '',
    as: data.as || '',
  }
}
