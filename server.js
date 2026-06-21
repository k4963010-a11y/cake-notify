// server.js
// 蛋糕店路過通知系統 - 主程式
require('dotenv').config();

const express = require('express');
const path = require('path');
const db = require('./db');
const geo = require('./geo');
const line = require('./line');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// ---------- 1. LINE Webhook（必須放在 express.json() 之前，因為需要原始 body 來驗證簽章） ----------
app.post(
  '/webhook',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    // 先回 200，避免 LINE 重送；驗證失敗也回 200 但不處理內容
    const signature = req.headers['x-line-signature'];
    const rawBody = req.body; // Buffer

    if (!line.verifySignature(rawBody, signature)) {
      console.warn('LINE webhook 簽章驗證失敗');
      return res.status(200).end();
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf-8'));
    } catch (e) {
      return res.status(200).end();
    }

    const events = payload.events || [];
    for (const event of events) {
      try {
        await handleLineEvent(event);
      } catch (err) {
        console.error('處理 LINE 事件時發生錯誤：', err);
      }
    }
    res.status(200).end();
  }
);

async function handleLineEvent(event) {
  const userId = event.source && event.source.userId;
  if (!userId) return;

  if (event.type === 'follow') {
    await line.replyMessage(
      event.replyToken,
      '謝謝您加入好友！😊\n為了之後「路過順道通知」服務，麻煩您回覆您留給店家的「手機末3碼」完成綁定，謝謝～'
    );
    return;
  }

  if (event.type === 'message' && event.message && event.message.type === 'text') {
    const text = event.message.text.trim();

    // 已經綁定過就不用重複處理
    const already = db.findByLineUserId(userId);
    if (already) {
      return; // 已綁定的人傳訊息，先不自動回覆，避免打擾（之後可依需求擴充客服功能）
    }

    const matches = db.findCustomersByPhoneFragment(text);
    if (matches.length === 1) {
      db.bindLineUserId(matches[0].id, userId);
      await line.replyMessage(
        event.replyToken,
        `✅ ${matches[0].name || '您'} 您好，已完成綁定！之後我們經過附近時會通知您 🍰`
      );
    } else if (matches.length > 1) {
      await line.replyMessage(
        event.replyToken,
        '查到多筆符合的資料，麻煩提供完整手機號碼以利確認，謝謝！'
      );
    } else {
      await line.replyMessage(
        event.replyToken,
        '沒有找到符合的資料，麻煩確認一下手機號碼是否與留給店家的相同，或直接輸入完整手機號碼試試看。'
      );
    }
  }
}

// ---------- 2. 一般 API 都需要密碼驗證（簡單版本，用 Basic Auth） ----------
app.use(express.json({ limit: '2mb' }));

function requireAuth(req, res, next) {
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: '伺服器尚未設定 ADMIN_PASSWORD，請先在環境變數中設定' });
  }
  const auth = req.headers.authorization || '';
  const [scheme, encoded] = auth.split(' ');
  if (scheme !== 'Basic' || !encoded) {
    res.set('WWW-Authenticate', 'Basic realm="cake-notify"');
    return res.status(401).json({ error: '需要登入' });
  }
  const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  const [, password] = decoded.split(':');
  if (password !== ADMIN_PASSWORD) {
    res.set('WWW-Authenticate', 'Basic realm="cake-notify"');
    return res.status(401).json({ error: '密碼錯誤' });
  }
  next();
}

app.use(['/', '/app.js', '/style.css', '/api'], requireAuth);
app.use(express.static(path.join(__dirname, 'public')));

// ---------- 3. 客戶管理 API ----------
app.get('/api/customers', (req, res) => {
  res.json(db.listCustomers());
});

app.post('/api/customers', async (req, res) => {
  const { name, phone, address } = req.body;
  if (!address) return res.status(400).json({ error: '請填寫地址' });

  let lat = null;
  let lng = null;
  try {
    const geocoded = await geo.geocodeAddress(address);
    if (geocoded) {
      lat = geocoded.lat;
      lng = geocoded.lng;
    }
  } catch (e) {
    console.warn('地址轉換失敗：', e.message);
  }

  const customer = db.addCustomer({ name, phone, address, lat, lng });
  res.json({ ...customer, geocoded: lat !== null });
});

// 批次匯入：每行一筆，格式「姓名,電話,地址」
app.post('/api/customers/bulk', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: '請貼上要匯入的名單' });

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const results = [];
  for (const line2 of lines) {
    const parts = line2.split(/[,，\t]/).map((p) => p.trim());
    const [name, phone, address] = parts;
    if (!address) {
      results.push({ line: line2, ok: false, reason: '缺少地址欄位' });
      continue;
    }
    let lat = null;
    let lng = null;
    try {
      const geocoded = await geo.geocodeAddress(address);
      if (geocoded) {
        lat = geocoded.lat;
        lng = geocoded.lng;
      }
    } catch (e) {
      // 忽略，繼續處理下一筆
    }
    const customer = db.addCustomer({ name, phone, address, lat, lng });
    results.push({ line: line2, ok: true, geocoded: lat !== null, customer });
  }
  res.json({ results });
});

app.put('/api/customers/:id', async (req, res) => {
  const { id } = req.params;
  const updates = { ...req.body };

  // 如果地址有改，重新轉換座標
  if (updates.address) {
    try {
      const geocoded = await geo.geocodeAddress(updates.address);
      if (geocoded) {
        updates.lat = geocoded.lat;
        updates.lng = geocoded.lng;
      }
    } catch (e) {
      // 忽略
    }
  }

  const updated = db.updateCustomer(id, updates);
  if (!updated) return res.status(404).json({ error: '找不到這位客戶' });
  res.json(updated);
});

app.delete('/api/customers/:id', (req, res) => {
  const ok = db.deleteCustomer(req.params.id);
  if (!ok) return res.status(404).json({ error: '找不到這位客戶' });
  res.json({ ok: true });
});

// 重新嘗試地址轉座標（手動觸發）
app.post('/api/customers/:id/regeocode', async (req, res) => {
  const customers = db.listCustomers();
  const customer = customers.find((c) => c.id === req.params.id);
  if (!customer) return res.status(404).json({ error: '找不到這位客戶' });
  try {
    const geocoded = await geo.geocodeAddress(customer.address);
    if (!geocoded) return res.status(404).json({ error: '查不到這個地址，請確認地址是否正確' });
    const updated = db.updateCustomer(customer.id, { lat: geocoded.lat, lng: geocoded.lng });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- 4. 地址轉座標（單筆，給「今天路線」輸入用） ----------
app.post('/api/geocode', async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: '請提供地址' });
  try {
    const result = await geo.geocodeAddress(address);
    if (!result) return res.status(404).json({ error: `查不到「${address}」這個地址，請確認地址是否正確` });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- 5. 計算今天路線附近的客戶 ----------
app.post('/api/route/match', async (req, res) => {
  const { stops, radiusKm } = req.body;
  if (!stops || !Array.isArray(stops) || stops.length === 0) {
    return res.status(400).json({ error: '請至少輸入一個今天的外送地點' });
  }

  const routePoints = [];
  const geocodeErrors = [];
  for (const address of stops) {
    if (!address || !address.trim()) continue;
    try {
      const result = await geo.geocodeAddress(address.trim());
      if (result) {
        routePoints.push({ address: address.trim(), lat: result.lat, lng: result.lng });
      } else {
        geocodeErrors.push(address.trim());
      }
    } catch (e) {
      geocodeErrors.push(address.trim());
    }
  }

  if (routePoints.length === 0) {
    return res.status(400).json({ error: '所有地址都查不到座標，請確認地址是否正確', geocodeErrors });
  }

  const radius = typeof radiusKm === 'number' ? radiusKm : 3;
  const customers = db.listCustomers().filter((c) => typeof c.lat === 'number' && typeof c.lng === 'number');

  const matched = customers
    .map((c) => {
      const distanceKm = geo.pointToRouteKm({ lat: c.lat, lng: c.lng }, routePoints);
      return { ...c, distanceKm: Math.round(distanceKm * 100) / 100 };
    })
    .filter((c) => c.distanceKm <= radius)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const noCoordCount = db.listCustomers().length - customers.length;

  res.json({
    routePoints,
    geocodeErrors,
    matched,
    noCoordCount,
  });
});

// ---------- 6. 發送今日通知 ----------
app.post('/api/send', async (req, res) => {
  const { customerIds, message } = req.body;
  if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
    return res.status(400).json({ error: '沒有選擇要通知的客戶' });
  }
  if (!message || !message.trim()) {
    return res.status(400).json({ error: '請輸入通知訊息內容' });
  }

  const all = db.listCustomers();
  const targets = all.filter((c) => customerIds.includes(c.id));
  const withLine = targets.filter((c) => c.lineUserId);
  const withoutLine = targets.filter((c) => !c.lineUserId);

  try {
    if (withLine.length > 0) {
      await line.multicastMessage(
        withLine.map((c) => c.lineUserId),
        message.trim()
      );
    }
    res.json({
      sentCount: withLine.length,
      skipped: withoutLine.map((c) => ({ id: c.id, name: c.name, phone: c.phone })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- 7. 第一次邀請所有 LINE 好友完成綁定（廣播，不需要知道 userId） ----------
app.post('/api/broadcast-bind-invite', async (req, res) => {
  const { message } = req.body;
  const text =
    message ||
    '【蛋糕店通知】之後我們經過您附近送貨時，會主動傳訊息問您要不要順便帶蛋糕喔！\n為了讓系統知道是您，麻煩回覆「您的手機末3碼」完成綁定，謝謝您 🍰';
  try {
    await line.broadcastMessage(text);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- 8. 備份與還原 ----------
app.get('/api/export', (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="cake-notify-backup.json"');
  res.json(db.listCustomers());
});

app.post('/api/import', (req, res) => {
  const { customers } = req.body;
  if (!Array.isArray(customers)) {
    return res.status(400).json({ error: '備份檔格式不正確' });
  }
  db.writeAll(customers);
  res.json({ ok: true, count: customers.length });
});

app.listen(PORT, () => {
  console.log(`蛋糕店通知系統已啟動，監聽 port ${PORT}`);
});
