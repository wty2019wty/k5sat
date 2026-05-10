import { Hono } from 'hono'
import { cors } from 'hono/cors'
import * as satellite from 'satellite.js'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import customParseFormat from 'dayjs/plugin/customParseFormat'

// 启用相关的时间处理插件
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)

const app = new Hono()

// 允许跨域
app.use('*', cors())

// 健康检查
app.get('/', (c) => {
  return c.json({
    status: "OK",
    message: "Cloudflare Worker 卫星 API 运行正常！",
    instructions: "请使用 POST 请求访问 /lol, /pass, /doppler 接口。"
  })
})

// ====================== 1. 缓存接口 ======================
app.post('/lol', async (c) => {
  const body = await c.req.json()
  const func = body.func || 0
  const uuid = body.uuid || crypto.randomUUID()
  let cache = body.cache || ''

  if (func === 0) {
    await c.env.CACHE_KV.put(uuid, cache, { expirationTtl: 600 })
  } else {
    const stored = await c.env.CACHE_KV.get(uuid)
    if (stored !== null) {
      cache = stored
    }
  }
  return c.json({ code: 200, uuid, cache })
})

// ====================== 工具函数：计算高度角 ======================
function getElevation(satrec, observerGd, date) {
  const posVel = satellite.propagate(satrec, date)
  if (!posVel.position) return null
  const gmst = satellite.gstime(date)
  const posEcf = satellite.eciToEcf(posVel.position, gmst)
  const lookAngles = satellite.ecfToLookAngles(observerGd, posEcf)
  return satellite.radiansToDegrees(lookAngles.elevation)
}

// ====================== 过境预测（二分法高精度） ======================
app.post('/pass', async (c) => {
  try {
    const body = await c.req.json()
    const { sat_line_1, sat_line_2, lat, lng, alt, tz = "Asia/Shanghai" } = body

    const satrec = satellite.twoline2satrec(sat_line_1, sat_line_2)
    const observerGd = {
      longitude: satellite.degreesToRadians(Number(lng)),
      latitude: satellite.degreesToRadians(Number(lat)),
    height: Number(alt) / 1000 // satellite.js 使用 km 作为单位
    }

    const passTimes = []
    const departureTimes = []
    let isAbove = false
    const HORIZON = 0 // 地平线高度角

    const now = dayjs().utc()
    const endTime = now.add(2, 'day')

    // 第一步：先粗扫，找到过境的大致区间（秒级步进）
    const passCandidates = []
    let prevElevation = getElevation(satrec, observerGd, now.toDate())

    for (let t = now; t.isBefore(endTime); t = t.add(1, 'second')) {
      const currentDate = t.toDate()
      const currentElevation = getElevation(satrec, observerGd, currentDate)
      if (currentElevation === null) continue

      // 上升沿：从地平线以下到以上
      if (!isAbove && prevElevation <= HORIZON && currentElevation > HORIZON) {
        passCandidates.push({ type: 'rise', start: t.subtract(1, 'second'), end: t })
        isAbove = true
      }
      // 下降沿：从地平线以上到以下
      else if (isAbove && prevElevation > HORIZON && currentElevation <= HORIZON) {
        passCandidates.push({ type: 'set', start: t.subtract(1, 'second'), end: t })
        isAbove = false
      }

      prevElevation = currentElevation
    }

    // 第二步：对每个候选区间，用二分法精修到误差 < 1 秒
    for (const candidate of passCandidates) {
      let left = candidate.start.toDate()
      let right = candidate.end.toDate()

      // 二分法迭代，最多10次，足够收敛到1秒以内
      for (let i = 0; i < 10; i++) {
        const mid = new Date((left.getTime() + right.getTime()) / 2)
        const e = getElevation(satrec, observerGd, mid)
        if (e === null) break

        if (candidate.type === 'rise') {
          if (e > HORIZON) right = mid
          else left = mid
        } else {
          if (e > HORIZON) left = mid
          else right = mid
        }
      }

      const refinedTime = new Date((left.getTime() + right.getTime()) / 2)
      const formatted = dayjs(refinedTime).tz(tz).format('YYYY-MM-DD HH:mm:ss')

      if (candidate.type === 'rise') passTimes.push(formatted)
      else departureTimes.push(formatted)
    }

    return c.json({
      code: 200,
      pass_times: passTimes,
      departure_times: departureTimes
    })
  } catch (e) {
    return c.json({ code: 500, error: e.message }, 500)
  }
})

// ====================== 多普勒计算（保留1位小数） ======================
function getDopplerShift(satrec, observerGd, date, txHz, rxHz) {
  const C = 299792.458

  // 保持 0.1 秒差分不变
  const d1 = new Date(date.getTime() - 100)
  const d2 = new Date(date.getTime() + 100)

  const p1 = satellite.propagate(satrec, d1)
  const p2 = satellite.propagate(satrec, d2)

  if (!p1.position || !p2.position) return [0.0, 0.0]

  const gmst1 = satellite.gstime(d1)
  const gmst2 = satellite.gstime(d2)
  const ecf1 = satellite.eciToEcf(p1.position, gmst1)
  const ecf2 = satellite.eciToEcf(p2.position, gmst2)

  const look1 = satellite.ecfToLookAngles(observerGd, ecf1)
  const look2 = satellite.ecfToLookAngles(observerGd, ecf2)

  const rangeRate = (look2.rangeSat - look1.rangeSat) / 0.2

  const upShift = (rangeRate / C) * txHz
  const downShift = -(rangeRate / C) * rxHz

  return [
    parseFloat(upShift.toFixed(1)),
    parseFloat(downShift.toFixed(1))
  ]
}

// ====================== 多普勒接口 ======================
app.post('/doppler', async (c) => {
  try {
    const body = await c.req.json()
    const { sat_line_1, sat_line_2, lat, lng, alt, tx, rx, pass_time, departure_time, tz = "Asia/Shanghai" } = body

    const satrec = satellite.twoline2satrec(sat_line_1, sat_line_2)
    const observerGd = {
      longitude: satellite.degreesToRadians(Number(lng)),
      latitude: satellite.degreesToRadians(Number(lat)),
      height: Number(alt) / 1000
    }

    const passDate = dayjs.tz(pass_time, "YYYY-MM-DD HH:mm:ss", tz).utc()
    const depDate = dayjs.tz(departure_time, "YYYY-MM-DD HH:mm:ss", tz).utc()

    const txHz = Number(tx) * 1000000
    const rxHz = Number(rx) * 1000000
    const shift_array = []

    let currentTime = passDate
    while (currentTime.isBefore(depDate) || currentTime.isSame(depDate)) {
      const date = currentTime.toDate()
      const [upShift, downShift] = getDopplerShift(satrec, observerGd, date, txHz, rxHz)
      shift_array.push([upShift, downShift])
      currentTime = currentTime.add(1, 'second')
    }

    return c.json({ code: 200, shift_array })
  } catch (e) {
    return c.json({ code: 500, error: e.message }, 500)
  }
})

export default app