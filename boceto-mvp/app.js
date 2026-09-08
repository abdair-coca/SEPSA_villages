/**
 * SEPSA - Sistema de Cortes y Reconexiones
 * Prototipo Interactivo en Memoria Volátil (P-01 a P-05)
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. ESTADO GLOBAL EN MEMORIA (STORE VOLÁTIL)
  // =========================================================================

  const store = {
    usuario: {
      id: 680,
      ci: '10577452',
      nombre: 'JOSUE DANIEL QUINTANILLA TABOADA',
      email: 'josue.quintanilla@sepsa.com.bo',
      telefono: '+591 72409703'
    },
    temporizadorSegundos: 378, // 6 min 18 seg
    vistaActiva: 'dashboard',
    ordenSeleccionadaCUC: 443794,

    // Datos observados en búsqueda P-02 (/orden/create)
    morososMojotorillo: [
      {
        cuenta: 306040,
        titular: 'MUÑOZ PEDRO',
        regionalLocalidad: '101 - 002',
        habilitante: 'R',
        ruta: '002',
        orden: 129,
        circuito: 'D-1182',
        direccion: 'MOJOTORILLO S/N',
        estado: 'A',
        tarifa: 'RS',
        medidor: '240907792 WASION',
        facturasVencidas30d: 2,
        totalPendiente: 66.82
      },
      {
        cuenta: 306043,
        titular: 'FLORES JUSTO',
        regionalLocalidad: '101 - 002',
        habilitante: 'R',
        ruta: '002',
        orden: 132,
        circuito: 'D-1182',
        direccion: 'MOJOTORILLO S/N',
        estado: 'A',
        tarifa: 'RS',
        medidor: '240907795 WASION',
        facturasVencidas30d: 2,
        totalPendiente: 45.20
      }
    ],

    // Desglose de planillas mensuales FA_FACTURAS (Tabla T-03)
    deudasPorCuenta: {
      306040: [
        { periodo: 6, anio: 2026, fecha: '2026-06-15', monto: 21.94, estado: 'P', origen: 'FA_FACTURAS', diasMora: 84 },
        { periodo: 7, anio: 2026, fecha: '2026-07-15', monto: 22.44, estado: 'P', origen: 'FA_FACTURAS', diasMora: 54 },
        { periodo: 8, anio: 2026, fecha: '2026-08-15', monto: 22.44, estado: 'P', origen: 'FA_FACTURAS', diasMora: 23 }
      ],
      306043: [
        { periodo: 6, anio: 2026, fecha: '2026-06-15', monto: 22.60, estado: 'P', origen: 'FA_FACTURAS', diasMora: 84 },
        { periodo: 7, anio: 2026, fecha: '2026-07-15', monto: 22.60, estado: 'P', origen: 'FA_FACTURAS', diasMora: 54 }
      ],
      1702690: [
        { periodo: 6, anio: 2026, fecha: '2026-06-15', monto: 44.20, estado: 'C', origen: 'FA_FACTURAS', diasMora: 84 },
        { periodo: 7, anio: 2026, fecha: '2026-07-15', monto: 44.20, estado: 'C', origen: 'FA_FACTURAS', diasMora: 54 }
      ]
    },

    // 46 Órdenes de corte iniciales en Bandeja P-03
    ordenesCorte: []
  };

  // Inicializar 46 órdenes fieles al video
  function initMockOrdenes() {
    const baseDate = new Date(2026, 7, 27, 12, 33, 0); // 27/08/2026 12:33

    // Orden 1: Cuenta 306040 activa en video (CUC 443794)
    store.ordenesCorte.push({
      cuc: 443794,
      cuenta: 306040,
      medidor: '240907792',
      marca: 'WASION',
      titular: 'MUÑOZ PEDRO',
      hab: 'R',
      estado: 'GENERADO',
      fechaGeneracion: '27/08/2026 12:33:00',
      timestampGen: baseDate.getTime(),
      deudaTope: 66.82,
      tecnico: 'JOSUE DANIEL QUINTANILLA TABOADA',
      direccion: 'MOJOTORILLO S/N',
      telefono: '61635733',
      circuito: 'D-1182',
      tarifa: 'RS',
      ejecucion: null,
      motivoAnulacion: null
    });

    // Orden 2: Cuenta 1702690 anulada en video (CUC 443797)
    store.ordenesCorte.push({
      cuc: 443797,
      cuenta: 1702690,
      medidor: '221009296',
      marca: 'WASION',
      titular: 'QUISPE CARLOS',
      hab: 'R',
      estado: 'ANULADO',
      fechaGeneracion: '26/08/2026 10:15:00',
      timestampGen: baseDate.getTime() - 86400000,
      deudaTope: 88.40,
      tecnico: 'SIN_ASIGNAR',
      direccion: 'BETANZOS - C. BOLIVAR 45',
      telefono: '71829304',
      circuito: 'D-1182',
      tarifa: 'RS',
      ejecucion: null,
      motivoAnulacion: 'Anulado ya que pago parte o la totalidad de facturas vencidas, Fecha de pago: 02-09-2026 16:20:13'
    });

    // Generar 44 órdenes adicionales para completar los 46 registros observados
    for (let i = 3; i <= 46; i++) {
      const offsetHours = (i * 4.8);
      const genTime = new Date(baseDate.getTime() - offsetHours * 3600000);
      const cucNum = 443700 + i;
      const cuentaNum = 1701600 + i;
      const medidorNum = '22100' + (1000 + i);

      store.ordenesCorte.push({
        cuc: cucNum,
        cuenta: cuentaNum,
        medidor: medidorNum,
        marca: (i % 2 === 0 ? 'WASION' : 'ACTARIS'),
        titular: 'CLIENTE TITULAR ' + i,
        hab: 'R',
        estado: 'GENERADO',
        fechaGeneracion: formatDate(genTime),
        timestampGen: genTime.getTime(),
        deudaTope: parseFloat((35.50 + (i * 3.75)).toFixed(2)),
        tecnico: (i % 3 === 0 ? 'JOSUE DANIEL QUINTANILLA TABOADA' : 'SIN_ASIGNAR'),
        direccion: 'ZONA CENTRAL - CALLE ' + i,
        telefono: '7240' + (1000 + i),
        circuito: 'D-1182',
        tarifa: 'RS',
        ejecucion: null,
        motivoAnulacion: null
      });
    }
  }

  function formatDate(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function formatDaysElapsed(timestamp) {
    // Calculado respecto a la fecha simulada del video (05/09/2026)
    const simulatedNow = new Date(2026, 8, 5, 17, 35, 0).getTime();
    const diffMs = simulatedNow - timestamp;
    const days = diffMs / (1000 * 60 * 60 * 24);
    return Math.max(0.5, days).toFixed(2) + ' días';
  }

  // =========================================================================
  // 2. MOTOR DE NAVEGACIÓN SPA
  // =========================================================================

  const viewLabels = {
    dashboard: 'P-01: Dashboard Principal',
    busqueda: 'P-02: Búsqueda de Morosidad (/orden/create)',
    bandeja: 'P-03: Bandeja de Cortes (/verCortes)',
    ficha: 'P-04: Ficha Integral de Corte'
  };

  function navigateTo(viewId, params) {
    store.vistaActiva = viewId;

    // Actualizar secciones visibles
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    const activeSec = document.getElementById('view-' + viewId);
    if (activeSec) activeSec.classList.add('active');

    // Actualizar botones del subnav
    document.querySelectorAll('.subnav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewId);
    });

    // Actualizar breadcrumb
    const indicator = document.getElementById('view-indicator');
    if (indicator) indicator.textContent = viewLabels[viewId] || 'SEPSA';

    // Renders específicos
    if (viewId === 'busqueda') {
      renderBusqueda();
    } else if (viewId === 'bandeja') {
      renderBandeja();
    } else if (viewId === 'ficha') {
      const cuc = params && params.cuc ? params.cuc : store.ordenSeleccionadaCUC;
      renderFicha(cuc);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // =========================================================================
  // 3. TEMPORIZADOR REGRESIVO DE SESIÓN (P-01)
  // =========================================================================

  function startSessionTimer() {
    const timerText = document.getElementById('timer-text');
    setInterval(() => {
      if (store.temporizadorSegundos > 0) {
        store.temporizadorSegundos--;
      } else {
        store.temporizadorSegundos = 378; // Reiniciar ciclo
      }
      const min = Math.floor(store.temporizadorSegundos / 60);
      const sec = store.temporizadorSegundos % 60;
      if (timerText) {
        timerText.textContent = `${min} min ${String(sec).padStart(2, '0')} seg`;
      }
    }, 1000);
  }

  // =========================================================================
  // 4. RENDERIZADORES DE PANTALLAS
  // =========================================================================

  // --- P-02: Búsqueda de Morosos ---
  function renderBusqueda() {
    const tbody = document.getElementById('tbody-morosos');
    const countSpan = document.getElementById('count-morosos');
    const btnCrear = document.getElementById('btn-crear-lote');
    if (!tbody) return;

    tbody.innerHTML = '';
    store.morososMojotorillo.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${item.regionalLocalidad}</strong></td>
        <td>${item.habilitante}</td>
        <td><a href="#" class="btn-link-action text-primary" data-cuenta="${item.cuenta}">${item.cuenta}</a></td>
        <td><strong>${item.titular}</strong></td>
        <td>${item.ruta}</td>
        <td>${item.orden}</td>
        <td>${item.circuito}</td>
        <td>${item.direccion}</td>
        <td><span class="badge badge-success">${item.estado}</span></td>
        <td>${item.tarifa}</td>
        <td>${item.medidor}</td>
        <td style="text-align:center;"><strong>${item.facturasVencidas30d}</strong></td>
        <td><strong style="color:var(--color-danger);">${item.totalPendiente.toFixed(2)} Bs</strong></td>
        <td>
          <button class="btn btn-sm btn-outline btn-ver-kardex-row" data-cuenta="${item.cuenta}">Ver Kardex</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    if (countSpan) countSpan.textContent = store.morososMojotorillo.length;
    if (btnCrear) btnCrear.disabled = false;
  }

  // --- P-03: Bandeja de Cortes ---
  function renderBandeja() {
    const tbody = document.getElementById('tbody-bandeja');
    const totalCount = document.getElementById('bandeja-total-count');
    const subnavCount = document.getElementById('subnav-count');
    if (!tbody) return;

    const searchTerm = (document.getElementById('bandeja-search-cuenta')?.value || '').trim().toLowerCase();
    const filterTecnico = document.getElementById('bandeja-filter-tecnico')?.value || '';

    // Filtrar lista
    const filtered = store.ordenesCorte.filter(ord => {
      const matchSearch = !searchTerm ||
        String(ord.cuenta).toLowerCase().includes(searchTerm) ||
        String(ord.medidor).toLowerCase().includes(searchTerm) ||
        String(ord.titular).toLowerCase().includes(searchTerm) ||
        String(ord.cuc).toLowerCase().includes(searchTerm);

      const matchTec = !filterTecnico || ord.tecnico === filterTecnico;
      return matchSearch && matchTec;
    });

    tbody.innerHTML = '';
    filtered.forEach(ord => {
      const badgeClass = ord.estado === 'GENERADO' ? 'badge-danger' : (ord.estado === 'EJECUTADO' ? 'badge-success' : 'badge-warning');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <strong>Cta: ${ord.cuenta}</strong><br>
          <small class="text-muted">Med: ${ord.medidor} (${ord.marca})</small>
        </td>
        <td>${ord.hab}</td>
        <td><span class="badge ${badgeClass}">${ord.estado}</span></td>
        <td>${ord.fechaGeneracion}</td>
        <td>${formatDaysElapsed(ord.timestampGen)}</td>
        <td><strong style="color:var(--color-danger);">${ord.deudaTope.toFixed(2)} Bs</strong></td>
        <td>${ord.tecnico === 'SIN_ASIGNAR' ? '<span class="text-muted">—</span>' : ord.tecnico}</td>
        <td>
          <button class="btn btn-sm btn-primary btn-ver-corte" data-cuc="${ord.cuc}">Ver corte</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    if (totalCount) totalCount.textContent = store.ordenesCorte.length;
    if (subnavCount) subnavCount.textContent = store.ordenesCorte.length;
  }

  // --- P-04: Ficha Integral de Corte ---
  function renderFicha(cuc) {
    store.ordenSeleccionadaCUC = cuc;
    const ord = store.ordenesCorte.find(o => o.cuc === cuc) || store.ordenesCorte[0];
    if (!ord) return;

    // Encabezado
    document.getElementById('ficha-cuc').textContent = ord.cuc;
    const badge = document.getElementById('ficha-status-badge');
    badge.textContent = 'ESTADO: ' + ord.estado;
    badge.className = 'badge badge-lg ' + (ord.estado === 'GENERADO' ? 'badge-danger' : (ord.estado === 'EJECUTADO' ? 'badge-success' : 'badge-warning'));

    // Motivo Anulación (BR-003)
    const cancelBox = document.getElementById('box-cancel-reason');
    const cancelText = document.getElementById('text-cancel-reason');
    const btnCut = document.getElementById('btn-open-modal-corte');
    const btnSimPay = document.getElementById('btn-sim-pago-concurrente');

    if (ord.estado === 'ANULADO') {
      cancelBox.classList.remove('hidden');
      cancelText.textContent = ord.motivoAnulacion || 'Anulado ya que pago parte o la totalidad de facturas vencidas';
      btnCut.disabled = true;
      btnCut.title = 'No se puede cortar un suministro anulado por pago en ventanilla';
      btnSimPay.disabled = true;
    } else if (ord.estado === 'EJECUTADO') {
      cancelBox.classList.add('hidden');
      btnCut.disabled = true;
      btnCut.textContent = '✓ Corte ya ejecutado';
      btnSimPay.disabled = true;
    } else {
      cancelBox.classList.add('hidden');
      btnCut.disabled = false;
      btnCut.textContent = '✂ Registrar corte efectivo';
      btnCut.title = '';
      btnSimPay.disabled = false;
    }

    // Datos del suministro
    document.getElementById('ficha-cuenta').textContent = ord.cuenta;
    document.getElementById('ficha-titular').textContent = ord.titular;
    document.getElementById('ficha-medidor').textContent = `${ord.medidor} (${ord.marca})`;
    document.getElementById('ficha-direccion').textContent = ord.direccion;
    document.getElementById('ficha-telefono').textContent = ord.telefono || 'No registrado';
    document.getElementById('ficha-circuito').textContent = ord.circuito;
    document.getElementById('ficha-tarifa').textContent = ord.tarifa;

    // Detalle de Deuda FA_FACTURAS (Tabla T-03)
    const tbodyDeuda = document.getElementById('tbody-deuda');
    const deudas = store.deudasPorCuenta[ord.cuenta] || [
      { periodo: 6, anio: 2026, fecha: '2026-06-15', monto: ord.deudaTope / 2, estado: ord.estado === 'ANULADO' ? 'C' : 'P', origen: 'FA_FACTURAS', diasMora: 63 },
      { periodo: 7, anio: 2026, fecha: '2026-07-15', monto: ord.deudaTope / 2, estado: ord.estado === 'ANULADO' ? 'C' : 'P', origen: 'FA_FACTURAS', diasMora: 31 }
    ];

    tbodyDeuda.innerHTML = '';
    let sum = 0;
    deudas.forEach(d => {
      sum += d.monto;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${d.periodo}</strong></td>
        <td>${d.anio}</td>
        <td>${d.fecha}</td>
        <td><strong>${d.monto.toFixed(2)} Bs</strong></td>
        <td><span class=\"badge ${d.estado === 'P' ? 'badge-danger' : 'badge-success'}\">${d.estado === 'P' ? 'P (Pendiente)' : 'C (Cancelado)'}</span></td>
        <td>${d.origen}</td>
        <td>${d.diasMora} días</td>
      `;
      tbodyDeuda.appendChild(tr);
    });

    document.getElementById('ficha-total-deuda').textContent = `${sum.toFixed(2)} Bs`;

    // Panel de Auditoría
    const auditDetails = document.getElementById('ficha-audit-execution-details');
    if (ord.ejecucion) {
      auditDetails.className = '';
      auditDetails.innerHTML = `
        <div style=\"background: var(--bg-surface-alt); padding: 12px; border-radius: 6px; border: 1px solid var(--border-color);\">
          <p><strong>Tipo de Corte Aplicado:</strong> ${ord.ejecucion.tipo}</p>
          <p><strong>Lectura Final Registrada:</strong> ${ord.ejecucion.lectura} kWh</p>
          <p><strong>Coordenadas GPS:</strong> ${ord.ejecucion.lat}, ${ord.ejecucion.lng} ${ord.ejecucion.saltarCoords ? '<span class=\"badge badge-warning\">(Bypass GPS activado)</span>' : ''}</p>
          <p><strong>Fotografías:</strong> ${ord.ejecucion.saltarFotos ? '<span class=\"badge badge-warning\">(Bypass Fotos activado)</span>' : 'Evidencias fotográficas adjuntas'}</p>
          <p><strong>Técnico Ejecutor:</strong> ${ord.ejecucion.tecnico}</p>
          <p><strong>Fecha/Hora de Ejecución:</strong> ${ord.ejecucion.fecha}</p>
        </div>
      `;
    } else {
      auditDetails.className = 'empty-hint';
      auditDetails.textContent = 'Sin corte ejecutado aún.';
    }
  }

  // =========================================================================
  // 5. MODAL DE CORTE EN CAMPO (P-05) Y ACCIONES OPERATIVAS
  // =========================================================================

  function openModalCorte() {
    const ord = store.ordenesCorte.find(o => o.cuc === store.ordenSeleccionadaCUC);
    if (!ord || ord.estado === 'ANULADO') {
      showToast('⚠️ No es posible cortar una orden anulada.');
      return;
    }
    document.getElementById('modal-lat').value = '';
    document.getElementById('modal-lng').value = '';
    document.getElementById('modal-telefono').value = ord.telefono || '';
    document.getElementById('modal-saltar-fotos').value = 'NO';
    document.getElementById('modal-saltar-coords').value = 'NO';
    document.getElementById('modal-corte-backdrop').classList.remove('hidden');
  }

  function closeModalCorte() {
    document.getElementById('modal-corte-backdrop').classList.add('hidden');
  }

  function submitCorte() {
    const ord = store.ordenesCorte.find(o => o.cuc === store.ordenSeleccionadaCUC);
    if (!ord) return;

    const lat = document.getElementById('modal-lat').value.trim();
    const lng = document.getElementById('modal-lng').value.trim();
    const tipo = document.getElementById('modal-tipo-corte').value;
    const lectura = document.getElementById('modal-lectura').value.trim();
    const saltarFotos = document.getElementById('modal-saltar-fotos').value === 'SI';
    const saltarCoords = document.getElementById('modal-saltar-coords').value === 'SI';
    const medidoresCercanos = document.getElementById('modal-medidores-cercanos').value;

    // Validación BR-004: Obligatoriedad de Coordenadas con Excepción
    if (!saltarCoords && (!lat || !lng)) {
      alert('Error de Validación (BR-004):\nDebe capturar las coordenadas GPS pulsando "Obtener ubicación" o activar explícitamente "¿Saltar Control de Coordenadas?".');
      return;
    }

    // Validación Lectura Numérica
    if (!lectura || isNaN(lectura)) {
      alert('Error de Validación:\nDebe registrar la lectura numérica acumulada del medidor en kWh.');
      return;
    }

    // Persistir ejecución
    ord.estado = 'EJECUTADO';
    ord.ejecucion = {
      tipo: tipo,
      lectura: parseFloat(lectura),
      lat: lat || '-19.589366 (Estimada)',
      lng: lng || '-65.259119 (Estimada)',
      saltarFotos: saltarFotos,
      saltarCoords: saltarCoords,
      medidoresCercanos: medidoresCercanos,
      tecnico: store.usuario.nombre,
      fecha: formatDate(new Date())
    };

    closeModalCorte();
    renderFicha(ord.cuc);
    showToast(`✓ Corte efectivo registrado con éxito (Lectura: ${lectura} kWh). Orden EJECUTADA.`);
  }

  // Simulación BR-003: Anulación Concurrente por Pago en Caja
  function simularPagoConcurrente() {
    const ord = store.ordenesCorte.find(o => o.cuc === store.ordenSeleccionadaCUC);
    if (!ord) return;

    if (ord.estado === 'EJECUTADO') {
      alert('Aviso: El corte ya fue ejecutado materialmente en campo. Corresponde iniciar el trámite de Reconexión / Reposición.');
      return;
    }

    const timestamp = formatDate(new Date());
    ord.estado = 'ANULADO';
    ord.motivoAnulacion = `Anulado ya que pago parte o la totalidad de facturas vencidas, Fecha de pago: ${timestamp}`;

    // Marcar deudas como pagadas (estado C)
    if (store.deudasPorCuenta[ord.cuenta]) {
      store.deudasPorCuenta[ord.cuenta].forEach(d => d.estado = 'C');
    }

    renderFicha(ord.cuc);
    showToast('⚡ BR-003: Pago recibido en cobranzas. Orden de corte ANULADA automáticamente.');
  }

  // Emisión Masiva de Lote (P-02 -> P-03)
  function emitirLoteCorte() {
    let creadas = 0;
    store.morososMojotorillo.forEach(moroso => {
      // Verificar si ya existe orden para esta cuenta
      const existe = store.ordenesCorte.some(o => o.cuenta === moroso.cuenta && o.estado === 'GENERADO');
      if (!existe) {
        const nextCUC = 443800 + store.ordenesCorte.length;
        store.ordenesCorte.unshift({
          cuc: nextCUC,
          cuenta: moroso.cuenta,
          medidor: moroso.medidor.split(' ')[0],
          marca: moroso.medidor.split(' ')[1] || 'WASION',
          titular: moroso.titular,
          hab: moroso.habilitante,
          estado: 'GENERADO',
          fechaGeneracion: formatDate(new Date()),
          timestampGen: Date.now(),
          deudaTope: moroso.totalPendiente,
          tecnico: store.usuario.nombre,
          direccion: moroso.direccion,
          telefono: '61635733',
          circuito: moroso.circuito,
          tarifa: moroso.tarifa,
          ejecucion: null,
          motivoAnulacion: null
        });
        creadas++;
      }
    });

    showToast(`✓ Se emitieron ${creadas} nuevas órdenes de corte en estado GENERADO.`);
    navigateTo('bandeja');
  }

  // Toast Helper
  let toastTimeout;
  function showToast(msg) {
    const toast = document.getElementById('toast-msg');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, 4500);
  }

  // =========================================================================
  // 6. EVENT LISTENERS Y VINCULACIONES
  // =========================================================================

  function bindEvents() {
    // Subnav tabs
    document.querySelectorAll('.subnav-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.currentTarget.dataset.view;
        navigateTo(view);
      });
    });

    // Brand click -> Dashboard
    document.getElementById('nav-brand')?.addEventListener('click', () => navigateTo('dashboard'));

    // Dashboard action cards
    document.getElementById('card-go-bandeja')?.addEventListener('click', () => navigateTo('bandeja'));
    document.getElementById('card-go-busqueda')?.addEventListener('click', () => navigateTo('busqueda'));
    document.getElementById('card-go-nexo')?.addEventListener('click', () => {
      showToast('ℹ️ Redirigiendo a NEXO Operaciones en Terreno (P-07)...');
    });
    document.getElementById('card-go-reposiciones')?.addEventListener('click', () => {
      showToast('ℹ️ Módulo de Reposiciones y Reconversiones (BR-007).');
    });

    // Actualizar teléfono
    document.getElementById('btn-update-phone')?.addEventListener('click', () => {
      const input = document.getElementById('input-new-phone');
      if (input && input.value.trim()) {
        store.usuario.telefono = '+591 ' + input.value.trim();
        document.getElementById('user-card-tel').textContent = store.usuario.telefono;
        input.value = '';
        showToast('✓ Número telefónico actualizado correctamente.');
      }
    });

    // P-02: Búsqueda y creación de lote
    document.getElementById('btn-search-morosos')?.addEventListener('click', () => {
      renderBusqueda();
      showToast('✓ Consulta ejecutada: 2 suministros superan el umbral de 2 facturas > 30 días.');
    });

    document.getElementById('btn-crear-lote')?.addEventListener('click', emitirLoteCorte);

    // Click en tabla P-02 para ver Kardex
    document.getElementById('tbody-morosos')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-ver-kardex-row') || e.target.dataset.cuenta) {
        e.preventDefault();
        const cuenta = e.target.dataset.cuenta || '306040';
        showToast(`🔍 Abriendo Kardex Comercial para la cuenta ${cuenta} (P-06)...`);
      }
    });

    // P-03: Bandeja de cortes
    document.getElementById('bandeja-search-cuenta')?.addEventListener('input', renderBandeja);
    document.getElementById('bandeja-filter-tecnico')?.addEventListener('change', renderBandeja);
    document.getElementById('btn-clear-bandeja-filters')?.addEventListener('click', () => {
      const search = document.getElementById('bandeja-search-cuenta');
      const tec = document.getElementById('bandeja-filter-tecnico');
      if (search) search.value = '';
      if (tec) tec.value = '';
      renderBandeja();
    });

    document.getElementById('btn-refresh-bandeja')?.addEventListener('click', () => {
      renderBandeja();
      showToast('✓ Bandeja actualizada.');
    });

    document.getElementById('btn-toggle-map-view')?.addEventListener('click', () => {
      showToast('🗺 Conmutando a visualización espacial (QField / Capas morosos)...');
    });

    // Click en botón "Ver corte" de la tabla P-03
    document.getElementById('tbody-bandeja')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-ver-corte');
      if (btn) {
        const cuc = parseInt(btn.dataset.cuc, 10);
        navigateTo('ficha', { cuc: cuc });
      }
    });

    // P-04: Ficha de corte
    document.getElementById('btn-back-to-bandeja')?.addEventListener('click', () => navigateTo('bandeja'));
    document.getElementById('btn-ficha-kardex')?.addEventListener('click', () => {
      showToast('🔍 Abriendo Kardex de cobros para cuenta ' + document.getElementById('ficha-cuenta').textContent);
    });
    document.getElementById('btn-sim-pago-concurrente')?.addEventListener('click', simularPagoConcurrente);
    document.getElementById('btn-open-modal-corte')?.addEventListener('click', openModalCorte);

    // Auditoría tabs en P-04
    document.querySelectorAll('.audit-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.audit-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.audit-tab-content').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const tabId = e.currentTarget.dataset.tab;
        const targetContent = document.getElementById('tab-' + tabId);
        if (targetContent) targetContent.classList.add('active');
      });
    });

    // P-05: Modal de corte
    document.getElementById('btn-close-modal-corte')?.addEventListener('click', closeModalCorte);
    document.getElementById('btn-cancel-modal-corte')?.addEventListener('click', closeModalCorte);
    document.getElementById('btn-confirm-modal-corte')?.addEventListener('click', submitCorte);

    document.getElementById('btn-get-gps')?.addEventListener('click', () => {
      // Coordenadas reales de Betanzos/Potosí observadas en catastro
      document.getElementById('modal-lat').value = '-19.589366';
      document.getElementById('modal-lng').value = '-65.259119';
      showToast('📍 Coordenadas GPS capturadas exitosamente: -19.589366, -65.259119');
    });

    // Botón refresco global y tema
    document.getElementById('btn-refresh-global')?.addEventListener('click', () => {
      showToast('🔄 Sesión sincronizada con servidor.');
    });

    document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
      showToast('🌙 Modo visual actualizado.');
    });
  }

  // =========================================================================
  // 7. ARRANQUE DEL APLICATIVO
  // =========================================================================

  document.addEventListener('DOMContentLoaded', () => {
    initMockOrdenes();
    bindEvents();
    startSessionTimer();
    navigateTo('dashboard');
    console.log('[SEPSA] Prototipo Operativo inicializado en memoria volátil.');
  });

})();
