import { dbEnabled, getVisits } from '../db/client.js'
import { botMatch } from './bot.js'

const TIMEZONE = 'Asia/Shanghai'

function unquote(value) {
  return String(value || '').replace(/^["']|["']$/g, '')
}

function shortProvince(regionName) {
  return String(regionName || '')
    .replace(/特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市/g, '')
    .trim()
}

function areaRows(rows) {
  const counts = new Map()
  for (const row of rows) {
    const code = row._id?.countryCode || ''
    const regionName = row._id?.regionName || ''
    const country = row._id?.country || ''
    let key = ''
    let item = null
    if (code === 'CN') {
      const name = shortProvince(regionName)
      if (!name) continue
      key = `province:${name}`
      item = { name, count: row.count, code: 'CN', level: 'province' }
    } else if (code === 'HK' || code === 'MO' || code === 'TW') {
      const name = code === 'HK' ? '香港' : code === 'MO' ? '澳门' : '台湾'
      key = `province:${name}`
      item = { name, count: row.count, code, level: 'province' }
    } else if (code) {
      key = `country:${code}`
      item = { name: country || code, count: row.count, code, level: 'country' }
    }
    if (!item) continue
    const prev = counts.get(key)
    if (prev) prev.count += item.count
    else counts.set(key, { ...item })
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)
}

function shanghaiToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function addDays(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

function fillDays(rows, days) {
  const counts = new Map(rows.map((row) => [row.date, row]))
  const today = shanghaiToday()
  const series = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = addDays(today, -offset)
    const row = counts.get(date)
    series.push({
      date,
      count: row?.count || 0,
      visitors: row?.visitors || 0,
    })
  }
  return series
}

export async function getVisitStats() {
  if (!dbEnabled || !getVisits()) {
    return null
  }

  const visits = getVisits()
  const human = {
    path: { $ne: '/status' },
    $nor: [botMatch],
  }

  const [summary] = await visits.aggregate([
    { $match: human },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              ips: { $addToSet: '$ip' },
            },
          },
        ],
        byDay: [
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                  timezone: TIMEZONE,
                },
              },
              count: { $sum: 1 },
              ips: { $addToSet: '$ip' },
            },
          },
          {
            $project: {
              _id: 0,
              date: '$_id',
              count: 1,
              visitors: { $size: '$ips' },
            },
          },
        ],
        byPath: [
          { $group: { _id: { $ifNull: ['$path', '/'] }, count: { $sum: 1 } } },
          { $project: { _id: 0, path: '$_id', count: 1 } },
          { $sort: { count: -1 } },
          { $limit: 12 },
        ],
        byLocation: [
          {
            $group: {
              _id: { $ifNull: ['$geo.address', '未知'] },
              count: { $sum: 1 },
              lat: { $avg: '$geo.lat' },
              lon: { $avg: '$geo.lon' },
            },
          },
          { $project: { _id: 0, address: '$_id', count: 1, lat: 1, lon: 1 } },
          { $sort: { count: -1 } },
          { $limit: 40 },
        ],
        byProvince: [
          {
            $group: {
              _id: {
                countryCode: { $ifNull: ['$geo.countryCode', ''] },
                country: { $ifNull: ['$geo.country', ''] },
                regionName: { $ifNull: ['$geo.regionName', ''] },
              },
              count: { $sum: 1 },
            },
          },
        ],
      },
    },
  ]).toArray()

  const byDay = fillDays(summary?.byDay || [], 14)
  const totals = summary?.totals?.[0]
  const sumSince = (days) => byDay.slice(-days).reduce((sum, row) => sum + row.count, 0)

  const recentDocs = await visits
    .find(human, {
      projection: {
        createdAt: 1,
        sessionId: 1,
        path: 1,
        ip: 1,
        referrer: 1,
        userAgent: 1,
        pushed: 1,
        'geo.address': 1,
        'client.language': 1,
        'client.platform': 1,
        'client.timezone': 1,
        'clientHints.platform': 1,
      },
    })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray()

  return {
    total: totals?.total || 0,
    uniqueVisitors: totals?.ips?.length || 0,
    today: byDay.at(-1)?.count || 0,
    last7Days: sumSince(7),
    last14Days: sumSince(14),
    bots: await visits.countDocuments(botMatch),
    byDay,
    byPath: summary?.byPath || [],
    byLocation: summary?.byLocation || [],
    byProvince: areaRows(summary?.byProvince || []),
    recent: groupTrails(recentDocs),
  }
}

function groupTrails(docs) {
  const groups = new Map()
  for (const item of docs) {
    const key = item.sessionId || String(item._id)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }

  return [...groups.values()]
    .map((items) => {
      const ordered = [...items].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      const first = ordered[0]
      const last = ordered.at(-1)
      const located = ordered.find((item) => item.geo?.address)
      return {
        id: first.sessionId || String(first._id),
        startedAt: first.createdAt,
        endedAt: last.createdAt,
        ip: last.ip || '',
        address: located?.geo?.address || '',
        referrer: first.referrer || '',
        language: last.client?.language || '',
        platform: unquote(last.clientHints?.platform || last.client?.platform || ''),
        timezone: last.client?.timezone || '',
        steps: ordered.map((item) => ({
          path: item.path || '/',
          createdAt: item.createdAt,
        })),
      }
    })
    .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))
}
