// line.js
// LINE Messaging API 的輔助函式：驗證 webhook 簽章、推播訊息

const crypto = require('crypto');

const LINE_API_BASE = 'https://api.line.me/v2/bot';

function getChannelSecret() {
  return process.env.LINE_CHANNEL_SECRET || '';
}

function getAccessToken() {
  return process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
}

// 驗證 LINE 傳來的 webhook 請求是不是真的（防止有人偽造請求亂打你的 webhook）
function verifySignature(rawBody, signatureHeader) {
  const secret = getChannelSecret();
  if (!secret || !signatureHeader) return false;
  const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  return hash === signatureHeader;
}

async function callLineApi(pathname, body) {
  const res = await fetch(`${LINE_API_BASE}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LINE API 錯誤 (${res.status})：${text}`);
  }
  // LINE 成功時通常回傳空物件
  return res.status === 200 ? {} : null;
}

// 回覆訊息（用在 webhook 收到訊息時的即時回覆，不限流量、不用算在推播額度內）
async function replyMessage(replyToken, text) {
  return callLineApi('/message/reply', {
    replyToken,
    messages: [{ type: 'text', text }],
  });
}

// 多人推播：一次傳送同一則訊息給多個已綁定的 LINE userId（最多 500 人，這裡用不到那麼多）
async function multicastMessage(userIds, text) {
  if (!userIds || userIds.length === 0) return { sent: 0 };
  const chunks = [];
  for (let i = 0; i < userIds.length; i += 500) {
    chunks.push(userIds.slice(i, i + 500));
  }
  for (const chunk of chunks) {
    await callLineApi('/message/multicast', {
      to: chunk,
      messages: [{ type: 'text', text }],
    });
  }
  return { sent: userIds.length };
}

// 廣播：傳送給「所有」目前已加好友的人（不需要知道 userId），用於第一次邀請大家完成綁定
async function broadcastMessage(text) {
  return callLineApi('/message/broadcast', {
    messages: [{ type: 'text', text }],
  });
}

module.exports = {
  verifySignature,
  replyMessage,
  multicastMessage,
  broadcastMessage,
};
