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

// 允许跨域，等同于 Python 中的 @cross_origin()
app.use('*', cors())

// ========= 新增的 GET 路由，防止浏览器访问直接报 404 =========
app.get('/', (c) => {
  return c.json({ 
    status: "OK", 
    message: "Cloudflare Worker 卫星 API 运行正常！",
    instructions: "请使用 POST 请求访问 /lol, /pass, /doppler 接口。"
  })
})
// =========================================================

/**
 * 接口 1: /lol - 缓存读写 (等效于 Redis 操作)
 */
app.post('/lol', async (c) => {
  const body = await c.req.json()
  const func = body.func || 0
  const uuid = body.uuid || crypto.randomUUID()
  let cache = body.cache || ''

  if (func === 0) {
    // 写入 KV，600秒过期
    await c.env.CACHE_KV.put(uuid, cache, { expirationTtl: 600 })
  } else {
    // 读取 KV
    const stored = await c.env.CACHE_KV.get(uuid)
    if (stored !== null) {
      cache = stored
    }
  }
  return c.json({ code: 200, uuid: uuid, cache: cache })
})

/**
 * 接口 2: /pass - 计算未来两天的过境点
 */
app.post('/pass', async (c) => {
  const body = await c.req.json()
  const { sat_line_1, sat_line_2, lat, lng, alt, tz = "Asia/Shanghai" } = body

  const satrec = satellite.twoline2satrec(sat_line_1, sat_line_2)
  const observerGd = {
    longitude: satellite.degreesToRadians(Number(lng)),
    latitude: satellite.degreesToRadians(Number(lat)),
    height: Number(alt) / 1000 // satellite.js 使用 km 作为单位
  }

  const passTimes = []
  const departureTimes =[]
  let isAbove = false

  const now = dayjs().utc()
  const endTime = now.add(2, 'day')

  // 每分钟步进，寻找高度角 > 0 的窗口
  for (let t = now; t.isBefore(endTime); t = t.add(1, 'minute')) {
    const date = t.toDate()
    const posVel = satellite.propagate(satrec, date)
    
    if (!posVel.position) continue

    const gmst = satellite.gstime(date)
    const posEcf = satellite.eciToEcf(posVel.position, gmst)
    const lookAngles = satellite.ecfToLookAngles(observerGd, posEcf)
    const elevation = satellite.radiansToDegrees(lookAngles.elevation)

    if (elevation > 0 && !isAbove) {
      isAbove = true
      passTimes.push(t.tz(tz).format('YYYY-MM-DD HH:mm:ss'))
    } else if (elevation <= 0 && isAbove) {
      isAbove = false
      departureTimes.push(t.tz(tz).format('YYYY-MM-DD HH:mm:ss'))
    }
  }

  return c.json({
    code: 200,
    pass_times: passTimes,
    departure_times: departureTimes
  })
})

/**
 * 辅助函数: 计算距离变化率并推算多普勒频移
 */
function getDopplerShift(satrec, observerGd, date, txHz, rxHz) {
  // 利用前后 0.1 秒做差分估算接近速度 (Range Rate)
  const d1 = new Date(date.getTime() - 100)
  const d2 = new Date(date.getTime() + 100)
  const p1 = satellite.propagate(satrec, d1)
  const p2 = satellite.propagate(satrec, d2)
  
  let rangeRate = 0 // 单位 km/s
  if (p1.position && p2.position) {
    const r1 = satellite.ecfToLookAngles(observerGd, satellite.eciToEcf(p1.position, satellite.gstime(d1))).rangeSat
    const r2 = satellite.ecfToLookAngles(observerGd, satellite.eciToEcf(p2.position, satellite.gstime(d2))).rangeSat
    rangeRate = (r2 - r1) / 0.2
  }

  const C = 299792.458 // 光速 km/s
  const upShift = (rangeRate / C) * txHz
  const downShift = -(rangeRate / C) * rxHz

  return [Math.round(upShift), Math.round(downShift)]
}

/**
 * 接口 3: /doppler - 逐秒推演过多普勒频移
 */
app.post('/doppler', async (c) => {
  const body = await c.req.json()
  const { sat_line_1, sat_line_2, lat, lng, alt, tx, rx, pass_time, departure_time, tz = "Asia/Shanghai" } = body

  const satrec = satellite.twoline2satrec(sat_line_1, sat_line_2)
  const observerGd = {
    longitude: satellite.degreesToRadians(Number(lng)),
    latitude: satellite.degreesToRadians(Number(lat)),
    height: Number(alt) / 1000
  }

  // 解析时间字符串为 dayjs 对象
  let passDate = dayjs.tz(pass_time, "YYYY-MM-DD HH:mm:ss", tz).utc()
  const depDate = dayjs.tz(departure_time, "YYYY-MM-DD HH:mm:ss", tz).utc()

  const txHz = Number(tx) * 1000000
  const rxHz = Number(rx) * 1000000

  const shift_array =[]
  
  // 逐秒循环推演
  let currentTime = passDate
  while (currentTime.isBefore(depDate) || currentTime.isSame(depDate)) {
    const date = currentTime.toDate()
    
    // 计算当前的频移
    const [upShift, downShift] = getDopplerShift(satrec, observerGd, date, txHz, rxHz)
    
    shift_array.push([upShift, downShift])
    currentTime = currentTime.add(1, 'second')
  }

  return c.json({ code: 200, shift_array: shift_array })
})

// 导出 Worker 实例
export default app