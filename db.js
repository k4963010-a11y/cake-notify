// db.js
// 簡單的 JSON 檔案資料庫（不需要額外申請資料庫服務，最適合 50 筆左右的客戶資料）
// 注意：Render 免費方案在「重新部署程式碼」時，磁碟會被重置，資料可能會消失。
// 平常正常使用（不重新部署）不會有事，但建議定期到「設定與備份」頁按「匯出備份」存一份起來。

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'customers.json');

function ensureFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
}

function readAll() {
  ensureFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function writeAll(customers) {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(customers, null, 2), 'utf-8');
}

function genId() {
  return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function listCustomers() {
  return readAll();
}

function addCustomer({ name, phone, address, lat, lng }) {
  const customers = readAll();
  const customer = {
    id: genId(),
    name: name || '',
    phone: phone || '',
    address: address || '',
    lat: typeof lat === 'number' ? lat : null,
    lng: typeof lng === 'number' ? lng : null,
    lineUserId: null,
    createdAt: new Date().toISOString(),
  };
  customers.push(customer);
  writeAll(customers);
  return customer;
}

function updateCustomer(id, updates) {
  const customers = readAll();
  const idx = customers.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  customers[idx] = { ...customers[idx], ...updates };
  writeAll(customers);
  return customers[idx];
}

function deleteCustomer(id) {
  const customers = readAll();
  const next = customers.filter((c) => c.id !== id);
  writeAll(next);
  return next.length !== customers.length;
}

// 用手機號碼（完整或末三/四碼）比對客戶，用於 LINE 綁定
function findCustomersByPhoneFragment(fragment) {
  const customers = readAll();
  const digits = (fragment || '').replace(/\D/g, '');
  if (!digits || digits.length < 3) return [];
  return customers.filter((c) => {
    const phoneDigits = (c.phone || '').replace(/\D/g, '');
    if (!phoneDigits) return false;
    return phoneDigits === digits || phoneDigits.endsWith(digits) || digits.endsWith(phoneDigits.slice(-4));
  });
}

function bindLineUserId(customerId, lineUserId) {
  return updateCustomer(customerId, { lineUserId });
}

function findByLineUserId(lineUserId) {
  const customers = readAll();
  return customers.find((c) => c.lineUserId === lineUserId) || null;
}

module.exports = {
  DATA_FILE,
  listCustomers,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  findCustomersByPhoneFragment,
  bindLineUserId,
  findByLineUserId,
  readAll,
  writeAll,
};
