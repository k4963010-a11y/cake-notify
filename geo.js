// geo.js
// 地理位置相關工具：地址轉座標（geocoding）、點到路線的距離計算

const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// 兩點之間的距離（公里），用 Haversine 公式
function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

// 把經緯度投影成局部平面座標（公里），用路線的平均緯度當基準
// 適合用在幾公里範圍內的距離計算，誤差很小
function projectToPlane(lat, lng, refLat) {
  const x = toRad(lng) * Math.cos(toRad(refLat)) * EARTH_RADIUS_KM;
  const y = toRad(lat) * EARTH_RADIUS_KM;
  return { x, y };
}

// 點到「線段」的最短距離（公里）
function pointToSegmentKm(point, segStart, segEnd, refLat) {
  const p = projectToPlane(point.lat, point.lng, refLat);
  const a = projectToPlane(segStart.lat, segStart.lng, refLat);
  const b = projectToPlane(segEnd.lat, segEnd.lng, refLat);

  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;

  const abLenSq = abx * abx + aby * aby;
  let t = abLenSq === 0 ? 0 : (apx * abx + apy * aby) / abLenSq;
  t = Math.max(0, Math.min(1, t));

  const closestX = a.x + abx * t;
  const closestY = a.y + aby * t;

  const dx = p.x - closestX;
  const dy = p.y - closestY;
  return Math.sqrt(dx * dx + dy * dy);
}

// 點到「整條路線」（多個點依序連成的折線）的最短距離（公里）
function pointToRouteKm(point, routePoints) {
  if (!routePoints || routePoints.length === 0) return Infinity;
  if (routePoints.length === 1) {
    return haversineKm(point.lat, point.lng, routePoints[0].lat, routePoints[0].lng);
  }
  const refLat = routePoints.reduce((sum, p) => sum + p.lat, 0) / routePoints.length;
  let min = Infinity;
  for (let i = 0; i < routePoints.length - 1; i++) {
    const d = pointToSegmentKm(point, routePoints[i], routePoints[i + 1], refLat);
    if (d < min) min = d;
  }
  return min;
}

// 用 OpenStreetMap 的 Nominatim 服務做地址轉座標（免費、不需要金鑰）
// 使用限制：請勿短時間內大量呼叫（官方建議每秒不超過 1 次），這裡每次呼叫間會自動間隔
let lastGeocodeAt = 0;
async function geocodeAddress(address) {
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - lastGeocodeAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeocodeAt = Date.now();

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=tw&q=${encodeURIComponent(
    address
  )}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'cake-notify-system/1.0 (small bakery delivery notification tool)',
      'Accept-Language': 'zh-TW',
    },
  });
  if (!res.ok) {
    throw new Error(`地址轉換服務錯誤：${res.status}`);
  }
  const data = await res.json();
  if (!data || data.length === 0) {
    return null;
  }
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
}

module.exports = {
  haversineKm,
  pointToRouteKm,
  geocodeAddress,
};
