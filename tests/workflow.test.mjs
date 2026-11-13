import assert from 'node:assert/strict';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

async function runTests() {
  console.log('1. Testing Health & Public Menu...');
  const health = await req('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.status, 'ok');

  const menuEn = await req('/api/menu-items?lang=en');
  assert.equal(menuEn.status, 200);
  assert.ok(menuEn.data.menu_items.length >= 8);

  const menuKm = await req('/api/menu-items?lang=km');
  assert.equal(menuKm.status, 200);
  assert.ok(menuKm.data.menu_items.some((m) => /[\u1780-\u17FF]/.test(m.name)), 'Khmer translation must render');

  console.log('2. Testing QR Security & Customer Session...');
  const badQr = await req('/api/tables/qr/invalid-fake-token');
  assert.equal(badQr.status, 404);

  const sesRes = await req('/api/customer/sessions', {
    method: 'POST',
    body: JSON.stringify({ qr_token: 'tbl-2-dineeasy-qr' }),
  });
  assert.equal(sesRes.status, 200);
  const sessionId = sesRes.data.session.session_id;
  assert.ok(sessionId > 0);

  console.log('3. Testing Server-Side Order Pricing, Validation & Idempotency...');
  const badQty = await req('/api/customer/orders', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, items: [{ menu_item_id: 1, quantity: 0 }] }),
  });
  assert.equal(badQty.status, 400);

  const idemKey = `test-idem-${Date.now()}`;
  const order1 = await req('/api/customer/orders', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      qr_token: 'tbl-2-dineeasy-qr',
      idempotency_key: idemKey,
      items: [{ menu_item_id: 1, quantity: 2 }],
    }),
  });
  assert.equal(order1.status, 201);
  const orderId = order1.data.order.order_id;
  assert.equal(Number(order1.data.order.total_amount), Number(menuEn.data.menu_items[0].price) * 2);

  // Repeat submission with same idempotency_key must deduplicate
  const orderDup = await req('/api/customer/orders', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      qr_token: 'tbl-2-dineeasy-qr',
      idempotency_key: idemKey,
      items: [{ menu_item_id: 1, quantity: 2 }],
    }),
  });
  assert.equal(orderDup.status, 200);
  assert.equal(orderDup.data.deduplicated, true);

  console.log('4. Testing RBAC & Authentication Security...');
  const unauthStaff = await req('/api/staff/orders');
  assert.equal(unauthStaff.status, 401);

  const badLogin = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'sokha', password: 'wrongpassword' }),
  });
  assert.equal(badLogin.status, 401);

  const staffLogin = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'sokha', password: 'staff123' }),
  });
  assert.equal(staffLogin.status, 200);
  const staffToken = staffLogin.data.token;

  const chefLogin = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'chef', password: 'chef123' }),
  });
  assert.equal(chefLogin.status, 200);
  const chefToken = chefLogin.data.token;

  const adminLogin = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'admin', password: 'admin123' }),
  });
  assert.equal(adminLogin.status, 200);
  const adminToken = adminLogin.data.token;

  // Staff cannot access admin routes
  const staffToAdmin = await req('/api/admin/dashboard', {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  assert.equal(staffToAdmin.status, 403);

  // Chef cannot access staff payment routes
  const chefToStaff = await req('/api/staff/payments/verify', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chefToken}` },
    body: JSON.stringify({ session_id: sessionId, method: 'khqr' }),
  });
  assert.equal(chefToStaff.status, 403);

  console.log('5. Testing Complete Order -> Confirm -> Cooking -> Ready -> Served -> KHQR Verify -> Receipt Workflow...');
  const confirm = await req(`/api/staff/orders/${orderId}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  assert.equal(confirm.status, 200);

  const cooking = await req(`/api/chef/orders/${orderId}/cooking`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${chefToken}` },
  });
  assert.equal(cooking.status, 200);

  const ready = await req(`/api/chef/orders/${orderId}/ready`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${chefToken}` },
  });
  assert.equal(ready.status, 200);

  const served = await req(`/api/staff/orders/${orderId}/served`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  assert.equal(served.status, 200);

  // Reject underpayment
  const underpay = await req('/api/staff/payments/verify', {
    method: 'POST',
    headers: { Authorization: `Bearer ${staffToken}` },
    body: JSON.stringify({ session_id: sessionId, method: 'khqr', received_amount: 1.0 }),
  });
  assert.equal(underpay.status, 400);

  const verifyPay = await req('/api/staff/payments/verify', {
    method: 'POST',
    headers: { Authorization: `Bearer ${staffToken}` },
    body: JSON.stringify({ session_id: sessionId, method: 'khqr', reference_note: 'Test ABA Ref #991' }),
  });
  assert.equal(verifyPay.status, 200);
  assert.ok(verifyPay.data.receipt_number.startsWith('RCP-'));
  assert.equal(verifyPay.data.session_closed, true);

  console.log('6. Testing Admin Dashboard & Reports...');
  const dash = await req('/api/admin/dashboard', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(dash.status, 200);
  assert.ok(dash.data.kpis.total_sales > 0);

  const reports = await req('/api/admin/reports', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(reports.status, 200);
  assert.ok(reports.data.item_performance.length > 0);

  console.log('ALL END-TO-END WORKFLOW & SECURITY TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
