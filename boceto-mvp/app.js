const supplies = [
  {
    id: 'elena', name: 'Elena Poma', account: 'CTA-1007', meter: 'MED-1007', meterBrand: 'Wasion', debt: '425.00', invoices: 8,
    area: 'C', locality: 'San Pedro', localityCode: '003', route: '004', circuit: 'D 1184', address: 'Barrio Nuevo 56, San Pedro', plan: 'Sin plan de pago', activeOrder: false, cuc: '57f28e2f…0456'
  },
  {
    id: 'pedro', name: 'Pedro Muñoz', account: 'CTA-1008', meter: 'MED-1008', meterBrand: 'Wasion', debt: '94.34', invoices: 2,
    area: 'B', locality: 'Mojotorillo', localityCode: '002', route: '002', circuit: 'D 1182', address: 'Mojotorillo s/n', plan: 'Sin plan de pago', activeOrder: false, cuc: '62a09c1d…91b0'
  },
  {
    id: 'norma', name: 'Norma Choque', account: 'CTA-1009', meter: 'MED-1009', meterBrand: 'Wasion', debt: '66.82', invoices: 3,
    area: 'B', locality: 'Mojotorillo', localityCode: '002', route: '002', circuit: 'D 1182', address: 'San Miguel de Khari s/n', plan: 'Sin plan de pago', activeOrder: true, orderTime: 'hoy a las 20:51', technician: 'Sin técnico asignado', cuc: '443794'
  }
];

let selectedSupply = supplies[0];
let order = { created: false, technician: '', originExisting: false };
let toastTimer;

function formatDebt(value) {
  return `Bs ${value}`;
}

function switchView(viewId) {
  document.querySelectorAll('.view-panel').forEach(panel => panel.classList.toggle('active', panel.id === viewId));
  document.querySelectorAll('.topnav-link').forEach(link => link.classList.toggle('active', link.dataset.view === viewId));
  if (viewId === 'view-dashboard') window.scrollTo({ top: 0, behavior: 'smooth' });
}

function runSearch(event) {
  if (event) event.preventDefault();
  const query = document.getElementById('supply-search').value.trim().toLowerCase();
  const area = document.getElementById('filter-area').value;
  const locality = document.getElementById('filter-locality').value;
  const route = document.getElementById('filter-route').value;
  const minimumInvoices = Number(document.getElementById('filter-invoices').value);
  const results = supplies.filter(supply => {
    const matchesQuery = !query || [supply.name, supply.account, supply.meter].some(value => value.toLowerCase().includes(query));
    return matchesQuery && (area === 'Todos' || supply.area === area) && (locality === 'Todos' || supply.locality === locality) && (route === 'Todos' || supply.route === route) && supply.invoices >= minimumInvoices;
  });
  renderSupplyList(results);
}

function renderSupplyList(results = supplies) {
  const list = document.getElementById('supply-list');
  const empty = document.getElementById('supply-empty');
  document.getElementById('result-count').textContent = `${results.length} disponibles`;
  empty.hidden = results.length !== 0;
  list.innerHTML = results.map(supply => `
    <button class="supply-card${supply.id === selectedSupply.id ? ' selected' : ''}" type="button" onclick="selectSupply('${supply.id}')" aria-pressed="${supply.id === selectedSupply.id}">
      <div><h3>${supply.name}</h3><p>Cuenta ${supply.account} · Medidor ${supply.meter}</p><p class="supply-location">${supply.locality} · Ruta ${supply.route}</p></div>
      <div class="supply-debt"><strong>${formatDebt(supply.debt)}</strong><span>${supply.invoices} facturas pendientes</span><span class="supply-action">Seleccionar</span></div>
      ${supply.id === selectedSupply.id ? '<span class="selected-badge">Seleccionado</span>' : ''}
    </button>`).join('');
}

function selectSupply(id) {
  selectedSupply = supplies.find(supply => supply.id === id) || supplies[0];
  order = { created: selectedSupply.activeOrder, technician: selectedSupply.technician === 'Sin técnico asignado' ? '' : (selectedSupply.technician || ''), originExisting: selectedSupply.activeOrder };
  renderSupplyList(getVisibleSupplies());
  renderSelectedSupply();
  updateWorkflow();
}

function getVisibleSupplies() {
  const query = document.getElementById('supply-search').value.trim().toLowerCase();
  const area = document.getElementById('filter-area').value;
  const locality = document.getElementById('filter-locality').value;
  const route = document.getElementById('filter-route').value;
  const minimumInvoices = Number(document.getElementById('filter-invoices').value);
  return supplies.filter(supply => (!query || [supply.name, supply.account, supply.meter].some(value => value.toLowerCase().includes(query))) && (area === 'Todos' || supply.area === area) && (locality === 'Todos' || supply.locality === locality) && (route === 'Todos' || supply.route === route) && supply.invoices >= minimumInvoices);
}

function renderSelectedSupply() {
  const supply = selectedSupply;
  const values = {
    'selected-title': supply.name, 'order-detail-title': `Orden de corte · ${supply.name}`, 'detail-account': supply.account, 'detail-meter': supply.meter, 'detail-meter-brand': supply.meterBrand,
    'detail-locality': supply.locality, 'detail-route': `Ruta ${supply.route}`, 'detail-address': supply.address, 'detail-area': `${supply.area} · ${supply.localityCode} ${supply.locality}`,
    'detail-circuit': supply.circuit, 'detail-debt': formatDebt(supply.debt), 'detail-invoices': `${supply.invoices} facturas pendientes`, 'detail-plan': supply.plan,
    'action-name': supply.name, 'action-debt': formatDebt(supply.debt), 'action-invoices': supply.invoices, 'action-meter': supply.meter,
    'detail-cuc': supply.cuc, 'active-order-cuc': supply.cuc, 'order-cuc': supply.cuc, 'order-name': supply.name, 'order-account': supply.account,
    'order-meter': supply.meter, 'order-debt': formatDebt(supply.debt), 'table-total': `Total ${formatDebt(supply.debt)}`, 'order-route': `${supply.route} · ${supply.locality}`,
    'order-address': supply.address.replace(', San Pedro', ''), 'additional-plan': supply.plan === 'Sin plan de pago' ? 'No' : 'Sí'
  };
  Object.entries(values).forEach(([id, value]) => { const element = document.getElementById(id); if (element) element.textContent = value; });
  const status = document.getElementById('supply-status');
  status.textContent = 'Activo';
  status.className = 'badge badge-success';
  const existingOrder = order.originExisting;
  const activeAlert = document.getElementById('active-order-alert');
  activeAlert.hidden = !existingOrder;
  if (existingOrder) document.getElementById('active-order-meta').textContent = `Creada ${supply.orderTime} · ${supply.technician}`;
  document.getElementById('order-action').hidden = existingOrder || order.created;
  document.getElementById('assignment-action').hidden = existingOrder || !order.created;
  document.getElementById('technician-select').value = order.technician;
  renderOrderDetail();
}

function createOrder() {
  order.created = true;
  order.technician = '';
  order.originExisting = false;
  selectedSupply.activeOrder = true;
  selectedSupply.orderTime = 'hoy a las 20:51';
  selectedSupply.technician = 'Sin técnico asignado';
  renderSelectedSupply();
  updateWorkflow();
  showToast('Orden creada correctamente. Selecciona un técnico para continuar.', 'success');
  document.getElementById('assignment-action').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function assignOrder() {
  const technician = document.getElementById('technician-select').value;
  if (!technician) { showToast('Selecciona un técnico antes de confirmar la asignación.', 'info'); return; }
  order.created = true;
  order.technician = technician;
  order.originExisting = false;
  selectedSupply.technician = technician;
  renderOrderDetail();
  updateWorkflow();
  document.getElementById('assignment-action').innerHTML = `<div class="action-copy"><span class="action-step success-step">Asignación confirmada</span><h3>Asignada a ${technician}</h3><p>La orden queda lista para la jornada técnica.</p></div><span class="badge badge-success">Sincronizada</span>`;
  showToast(`Orden asignada a ${technician}.`, 'success');
}

function renderOrderDetail() {
  const created = order.created || selectedSupply.activeOrder;
  document.getElementById('order-state-badge').textContent = created ? (order.technician ? 'Asignada' : 'Generada') : 'Pendiente de creación';
  document.getElementById('order-state-badge').className = `badge ${created ? 'badge-success' : 'badge-pending'}`;
  document.getElementById('order-detail-subtitle').textContent = created ? 'Registro creado desde el suministro seleccionado.' : 'Vista previa para revisar antes de crear la orden.';
  document.getElementById('order-created-meta').textContent = created ? 'Creada: 13 sep 2026 · 20:51' : 'Aún no creada';
  document.getElementById('order-technician').textContent = order.technician || 'Sin asignar';
  document.getElementById('order-status').textContent = created ? (order.technician ? 'Asignada' : 'Generada') : 'Pendiente';
  document.getElementById('activity-title').textContent = created ? 'Orden creada' : 'Suministro seleccionado';
  document.getElementById('activity-meta').textContent = created ? '13 sep 2026 · 20:51' : 'Listo para revisar y crear una orden';
}

function updateWorkflow() {
  const currentStep = selectedSupply.activeOrder ? (order.technician ? 4 : 3) : 1;
  document.querySelectorAll('.step').forEach(step => {
    const number = Number(step.dataset.step);
    step.classList.toggle('active', number === currentStep);
    step.classList.toggle('completed', number < currentStep);
  });
}

function toggleFilters() {
  const filters = document.getElementById('advanced-filters');
  const button = document.querySelector('.more-filters');
  filters.hidden = !filters.hidden;
  button.setAttribute('aria-expanded', String(!filters.hidden));
  button.innerHTML = filters.hidden ? 'Más filtros <span aria-hidden="true">+</span>' : 'Ocultar filtros <span aria-hidden="true">−</span>';
}

function copyTechnicalId(elementId, button) {
  const value = document.getElementById(elementId).textContent;
  if (navigator.clipboard) navigator.clipboard.writeText(value);
  const original = button.textContent;
  button.textContent = 'Copiado';
  setTimeout(() => { button.textContent = original; }, 1600);
}

function viewOrder() {
  document.getElementById('order-detail-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast('Detalle de orden abierto.', 'info');
}

function toggleAudit() {
  const details = document.getElementById('audit-details');
  details.hidden = !details.hidden;
}

function showToast(message, type) {
  const toast = document.getElementById('toast');
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast visible ${type}`;
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3600);
}

renderSupplyList();
renderSelectedSupply();
