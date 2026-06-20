const API = 'http://localhost:4000/api';

// ---------------- view routing ----------------
const pillars = document.querySelectorAll('.pillar');
const views = document.querySelectorAll('.view');
pillars.forEach(p => p.addEventListener('click', () => {
  pillars.forEach(x => x.classList.remove('active'));
  p.classList.add('active');
  const target = p.dataset.view;
  views.forEach(v => v.classList.toggle('active', v.id === `view-${target}`));
  if (target === 'overview') loadOverview();
  if (target === 'customers') loadCustomers();
  if (target === 'orders') loadOrders();
}));

// ---------------- toast ----------------
function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------------- connection status ----------------
async function checkConnection() {
  const dot = document.getElementById('connDot');
  const text = document.getElementById('connText');
  try {
    const r = await fetch(`${API}/health`);
    if (!r.ok) throw new Error();
    dot.className = 'dot ok';
    text.textContent = 'vault connected';
  } catch {
    dot.className = 'dot bad';
    text.textContent = 'vault unreachable — start the backend (node server.js)';
  }
}

// ---------------- helpers ----------------
async function api(path, opts = {}) {
  const r = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (r.status === 204) return null;
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}
const fmtMoney = n => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = s => new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// ================= OVERVIEW =================
async function loadOverview() {
  try {
    const customers = await api('/customers');
    const orders = await api('/orders');
    document.getElementById('statCustomers').textContent = customers.length;
    document.getElementById('statOrders').textContent = orders.length;
    const revenue = orders.reduce((s, o) => s + (o.status !== 'cancelled' ? o.total : 0), 0);
    document.getElementById('statRevenue').textContent = fmtMoney(revenue);
    document.getElementById('statPending').textContent = orders.filter(o => o.status === 'pending').length;
  } catch (e) { toast(e.message, 'error'); }
}

// ================= CUSTOMERS =================
let customersCache = [];

async function loadCustomers() {
  const tbody = document.getElementById('customerRows');
  try {
    customersCache = await api('/customers');
    if (!customersCache.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No customers yet — create the first record.</td></tr>`;
      return;
    }
    tbody.innerHTML = customersCache.map(c => `
      <tr>
        <td class="mono">#${c.customer_id}</td>
        <td>${escapeHtml(c.name)}</td>
        <td class="mono">${escapeHtml(c.email)}</td>
        <td>${c.order_count}</td>
        <td>${fmtMoney(c.lifetime_value)}</td>
        <td class="mono">${fmtDate(c.created_at)}</td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" data-edit="${c.customer_id}">Edit</button>
            <button class="icon-btn danger" data-del="${c.customer_id}">Delete</button>
          </div>
        </td>
      </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Could not reach the vault API.</td></tr>`;
    toast(e.message, 'error');
  }
}

document.getElementById('customerRows').addEventListener('click', async (e) => {
  const editId = e.target.dataset.edit;
  const delId = e.target.dataset.del;
  if (editId) openCustomerModal(customersCache.find(c => String(c.customer_id) === editId));
  if (delId) {
    if (!confirm('Delete this customer? Their orders will be removed too (cascade).')) return;
    try {
      await api(`/customers/${delId}`, { method: 'DELETE' });
      toast('Customer deleted', 'success');
      loadCustomers();
    } catch (err) { toast(err.message, 'error'); }
  }
});

document.getElementById('btnNewCustomer').addEventListener('click', () => openCustomerModal());

function openCustomerModal(c) {
  document.getElementById('customerModalTitle').textContent = c ? 'Edit customer' : 'New customer';
  document.getElementById('customerId').value = c ? c.customer_id : '';
  document.getElementById('customerName').value = c ? c.name : '';
  document.getElementById('customerEmail').value = c ? c.email : '';
  document.getElementById('customerFormError').textContent = '';
  document.getElementById('customerModalOverlay').classList.add('open');
}

document.getElementById('customerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('customerId').value;
  const name = document.getElementById('customerName').value.trim();
  const email = document.getElementById('customerEmail').value.trim();
  const errBox = document.getElementById('customerFormError');
  errBox.textContent = '';
  try {
    if (id) {
      await api(`/customers/${id}`, { method: 'PUT', body: JSON.stringify({ name, email }) });
      toast('Customer updated', 'success');
    } else {
      await api('/customers', { method: 'POST', body: JSON.stringify({ name, email }) });
      toast('Customer created', 'success');
    }
    closeModals();
    loadCustomers();
  } catch (err) { errBox.textContent = err.message; }
});

// ================= ORDERS =================
async function loadOrders() {
  const tbody = document.getElementById('orderRows');
  try {
    const orders = await api('/orders');
    if (!customersCache.length) customersCache = await api('/customers');
    populateCustomerSelect();
    if (!orders.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No orders yet — create the first one.</td></tr>`;
      return;
    }
    tbody.innerHTML = orders.map(o => `
      <tr>
        <td class="mono">#${o.order_id}</td>
        <td>${escapeHtml(o.customer_name)}</td>
        <td>${escapeHtml(o.item)}</td>
        <td>${fmtMoney(o.total)}</td>
        <td><span class="badge ${o.status}">${o.status}</span></td>
        <td class="mono">${fmtDate(o.created_at)}</td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" data-edit='${JSON.stringify(o).replace(/'/g, "&#39;")}'>Edit</button>
            <button class="icon-btn danger" data-del="${o.order_id}">Delete</button>
          </div>
        </td>
      </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Could not reach the vault API.</td></tr>`;
    toast(e.message, 'error');
  }
}

function populateCustomerSelect() {
  const sel = document.getElementById('orderCustomer');
  sel.innerHTML = customersCache.map(c => `<option value="${c.customer_id}">${escapeHtml(c.name)} (#${c.customer_id})</option>`).join('');
}

document.getElementById('orderRows').addEventListener('click', async (e) => {
  const editPayload = e.target.dataset.edit;
  const delId = e.target.dataset.del;
  if (editPayload) openOrderModal(JSON.parse(editPayload.replace(/&#39;/g, "'")));
  if (delId) {
    if (!confirm('Delete this order?')) return;
    try {
      await api(`/orders/${delId}`, { method: 'DELETE' });
      toast('Order deleted', 'success');
      loadOrders();
    } catch (err) { toast(err.message, 'error'); }
  }
});

document.getElementById('btnNewOrder').addEventListener('click', async () => {
  if (!customersCache.length) customersCache = await api('/customers');
  if (!customersCache.length) { toast('Create a customer first', 'error'); return; }
  openOrderModal();
});

function openOrderModal(o) {
  document.getElementById('orderModalTitle').textContent = o ? 'Edit order' : 'New order';
  document.getElementById('orderId').value = o ? o.order_id : '';
  populateCustomerSelect();
  document.getElementById('orderCustomer').value = o ? o.customer_id : (customersCache[0] ? customersCache[0].customer_id : '');
  document.getElementById('orderCustomer').disabled = !!o; // FK fixed on edit
  document.getElementById('orderItem').value = o ? o.item : '';
  document.getElementById('orderTotal').value = o ? o.total : '';
  document.getElementById('orderStatus').value = o ? o.status : 'pending';
  document.getElementById('orderFormError').textContent = '';
  document.getElementById('orderModalOverlay').classList.add('open');
}

document.getElementById('orderForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('orderId').value;
  const customer_id = Number(document.getElementById('orderCustomer').value);
  const item = document.getElementById('orderItem').value.trim();
  const total = Number(document.getElementById('orderTotal').value);
  const status = document.getElementById('orderStatus').value;
  const errBox = document.getElementById('orderFormError');
  errBox.textContent = '';
  try {
    if (id) {
      await api(`/orders/${id}`, { method: 'PUT', body: JSON.stringify({ item, total, status }) });
      toast('Order updated', 'success');
    } else {
      await api('/orders', { method: 'POST', body: JSON.stringify({ customer_id, item, total, status }) });
      toast('Order created', 'success');
    }
    closeModals();
    loadOrders();
  } catch (err) { errBox.textContent = err.message; }
});

// ================= SHIELD (SQL injection demo) =================
document.getElementById('btnRunInjection').addEventListener('click', async () => {
  const input = document.getElementById('injectionInput').value;
  const box = document.getElementById('shieldResult');
  try {
    const res = await api('/security/test-injection', { method: 'POST', body: JSON.stringify({ email: input }) });
    box.className = `shield-result show ${res.matched ? 'matched' : 'safe'}`;
    box.textContent = `→ ${res.message}`;
  } catch (e) {
    box.className = 'shield-result show';
    box.textContent = e.message;
  }
});

// ================= modal close handlers =================
document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', closeModals));
document.querySelectorAll('.modal-overlay').forEach(ov => ov.addEventListener('click', (e) => {
  if (e.target === ov) closeModals();
}));
function closeModals() {
  document.querySelectorAll('.modal-overlay').forEach(ov => ov.classList.remove('open'));
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// Initial app bootstrap: connect to the backend and load the default view.
async function initApp() {
  checkConnection();
  await loadOverview();
  setInterval(checkConnection, 5000);
}

initApp();
