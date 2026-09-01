/* ============================================================
   SEPSA · Prototipo cobranza — app.js
   Vanilla JS modular: datos, dominio, store, sync, UI.
   Diseñado para migrar a React + TypeScript + PWA + IndexedDB.
   ============================================================ */

/* ---------- Utilidades ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const MESES_NOMBRE = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function fmtBs(centavos) {
  return "Bs " + (centavos / 100).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function mesLabel(m) { return `${MESES_NOMBRE[m.mes - 1]} ${m.anio}`; }

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function uid() {
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

/* ---------- Datos: semilla ---------- */
const TECNICO = "Carlos";
const ZONA = "Villa Esperanza · Ruta 3";
const MONTO_MENSUAL_CENTAVOS = 4000; // Bs 40

// Genera los N meses más recientes hasta el mes de referencia (orden: más antiguo primero)
function generarMeses(n, ref = { anio: 2026, mes: 9 }) {
  const lista = [];
  let { anio, mes } = ref;
  for (let i = 0; i < n; i++) {
    lista.push({ anio, mes, montoCentavos: MONTO_MENSUAL_CENTAVOS });
    mes--;
    if (mes === 0) { mes = 12; anio--; }
  }
  return lista.reverse();
}

function seedDomicilios() {
  return [
    { id: "d001", codigo: "001283", nombre: "Juan Pérez", direccion: "Calle Principal s/n", localidad: "Villa Esperanza", medidor: "M-2291", visitado: false, meses: generarMeses(21) },
    { id: "d002", codigo: "001284", nombre: "María López", direccion: "Av. Los Cedros", localidad: "Villa Esperanza", medidor: "M-2317", visitado: true, meses: generarMeses(3) },
    { id: "d003", codigo: "001285", nombre: "Pedro Flores", direccion: "Camino al Río", localidad: "Villa Esperanza", medidor: "M-2410", visitado: false, meses: [] },
    { id: "d004", codigo: "001290", nombre: "Ana Gutiérrez", direccion: "Pasaje El Sol", localidad: "Villa Esperanza", medidor: "M-2402", visitado: false, meses: generarMeses(10) },
    { id: "d005", codigo: "001296", nombre: "Carlos Rojas", direccion: "Calle La Paz", localidad: "Comunidad Los Andes", medidor: "M-2433", visitado: false, meses: generarMeses(2) },
    { id: "d006", codigo: "001301", nombre: "Rosa Mamani", direccion: "Barrio Central", localidad: "Comunidad Los Andes", medidor: "M-2441", visitado: true, meses: [] },
    { id: "d007", codigo: "001305", nombre: "Luis Choque", direccion: "Camino Viejo km 2", localidad: "Comunidad Los Andes", medidor: "M-2450", visitado: false, meses: generarMeses(15) },
    { id: "d008", codigo: "001310", nombre: "Julia Quispe", direccion: "Calle 8 de Marzo", localidad: "San Miguel", medidor: "M-2462", visitado: false, meses: generarMeses(6) },
    { id: "d009", codigo: "001315", nombre: "René Villca", direccion: "Comunidad Chullpa", localidad: "San Miguel", medidor: "M-2471", visitado: false, meses: [] },
    { id: "d010", codigo: "001318", nombre: "Sonia Apaza", direccion: "Barrio Nuevo", localidad: "San Miguel", medidor: "M-2478", visitado: true, meses: generarMeses(4) },
    { id: "d011", codigo: "001322", nombre: "Marcelo Condori", direccion: "Camino a La Hoyada", localidad: "San Miguel", medidor: "M-2485", visitado: false, meses: generarMeses(12) },
    { id: "d012", codigo: "001328", nombre: "Carmen Huanca", direccion: "Calle 25 de Mayo", localidad: "Villa Esperanza", medidor: "M-2490", visitado: false, meses: [] },
  ];
}

/* ---------- Dominio: reglas de cobro (lógica reutilizable, no solo UI) ---------- */
const Dominio = {
  // Cantidad entera válida: >= 0, <= meses pendientes
  cantidadValida(cantidad, meses) {
    return Number.isInteger(cantidad) && cantidad >= 0 && cantidad <= meses.length;
  },

  // Los meses a pagar SIEMPRE son los más antiguos primero
  seleccionarMeses(meses, cantidad) {
    if (!this.cantidadValida(cantidad, meses)) return null;
    return meses.slice(0, cantidad);
  },

  totalCentavos(mesesSeleccionados) {
    return mesesSeleccionados.reduce((sum, m) => sum + m.montoCentavos, 0);
  },

  // Deuda actualizada tras pago: quitar meses pagados
  aplicarPago(domicilio, mesesPagados) {
    const pagadosKey = new Set(mesesPagados.map(m => `${m.anio}-${m.mes}`));
    const restantes = domicilio.meses.filter(m => !pagadosKey.has(`${m.anio}-${m.mes}`));
    return { ...domicilio, meses: restantes };
  },

  // Estado derivado del domicilio
  estadoDomicilio(domicilio) {
    if (domicilio.meses.length === 0) return "al-dia";
    if (domicilio.visitado) return "visitado";
    return "pendiente";
  },
};

/* ---------- Store: IndexedDB con fallback localStorage ---------- */
const Store = {
  DB_NAME: "sepsa-prototype",
  DB_VER: 1,
  db: null,

  async init() {
    try {
      if (window.indexedDB) {
        this.db = await new Promise((resolve, reject) => {
          const req = indexedDB.open(this.DB_NAME, this.DB_VER);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains("domicilios")) db.createObjectStore("domicilios", { keyPath: "id" });
            if (!db.objectStoreNames.contains("cobros")) db.createObjectStore("cobros", { keyPath: "id" });
            if (!db.objectStoreNames.contains("cola")) db.createObjectStore("cola", { keyPath: "id" });
            if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        return;
      }
    } catch (e) {
      console.warn("IndexedDB no disponible, uso localStorage", e);
    }
    this.db = null;
  },

  async idbPut(storeName, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async idbGetAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async save(domicilios, cobros, cola, lastSync) {
    if (this.db) {
      await this.idbPut("meta", { key: "lastSync", value: lastSync });
      await this.idbPut("meta", { key: "tecnicos", value: TECNICO });
      const cl = await this.idbGetAll("domicilios");
      for (const d of domicilios) await this.idbPut("domicilios", d);
      for (const c of cobros) await this.idbPut("cobros", c);
      for (const q of cola) await this.idbPut("cola", q);
      // limpiar cola eliminada (operaciones sync completadas fuera de la cola)
      const oldCola = await this.idbGetAll("cola");
      for (const oc of oldCola) {
        if (!cola.some(q => q.id === oc.id)) {
          await new Promise((resolve, reject) => {
            const tx = this.db.transaction("cola", "readwrite");
            tx.objectStore("cola").delete(oc.id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
        }
      }
      return;
    }
    // localStorage fallback
    localStorage.setItem("sepsa.domicilios", JSON.stringify(domicilios));
    localStorage.setItem("sepsa.cobros", JSON.stringify(cobros));
    localStorage.setItem("sepsa.cola", JSON.stringify(cola));
    localStorage.setItem("sepsa.lastSync", lastSync);
  },

  async load() {
    if (this.db) {
      const domicilios = await this.idbGetAll("domicilios");
      const cobros = await this.idbGetAll("cobros");
      const cola = await this.idbGetAll("cola");
      const metas = await this.idbGetAll("meta");
      const lastSync = (metas.find(m => m.key === "lastSync") || {}).value || "";
      return { domicilios, cobros, cola, lastSync };
    }
    return {
      domicilios: JSON.parse(localStorage.getItem("sepsa.domicilios") || "null"),
      cobros: JSON.parse(localStorage.getItem("sepsa.cobros") || "null"),
      cola: JSON.parse(localStorage.getItem("sepsa.cola") || "null"),
      lastSync: localStorage.getItem("sepsa.lastSync") || "",
    };
  },

  async reset() {
    if (this.db) {
      const stores = ["domicilios", "cobros", "cola", "meta"];
      for (const s of stores) {
        await new Promise((resolve, reject) => {
          const tx = this.db.transaction(s, "readwrite");
          tx.objectStore(s).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
      return;
    }
    localStorage.removeItem("sepsa.domicilios");
    localStorage.removeItem("sepsa.cobros");
    localStorage.removeItem("sepsa.cola");
    localStorage.removeItem("sepsa.lastSync");
  },
};

/* ---------- Estado global de la app ---------- */
const App = {
  tecnico: TECNICO,
  zona: ZONA,
  online: true,
  syncing: false,
  domicilios: [],
  cobros: [],
  cola: [],
  lastSync: "",
  screen: "inicio",
  currentDomicilioId: null,
  cobranzaCantidad: 1,
  lastRecibo: null,

  /* ---- Getters de estado ---- */
  pendientes() { return this.cola.filter(q => q.estado !== "synced").length; },
  visitadosHoy() { return this.domicilios.filter(d => d.visitado).length; },
  deudores() { return this.domicilios.filter(d => d.meses.length > 0).length; },
  montoCobradoHoy() { return this.cobros.reduce((s, c) => s + c.totalCentavos, 0); },

  domicilio(id) { return this.domicilios.find(d => d.id === id); },

  /* ---- Operaciones de dominio aplicadas ---- */
  registrarVisita(id, observacion) {
    const d = this.domicilio(id);
    if (!d) return;
    d.visitado = true;
    d.observacionUltima = observacion || "";
    this.cola.push({
      id: uid(), tipo: "visita", estado: "pending", intentos: 0,
      payload: { domicilioId: id, observacion: d.observacionUltima, fecha: hoyISO(), tecnico: this.tecnico },
    });
    this.persistir();
  },

  registrarCobro(id, mesesPagados) {
    const d = this.domicilio(id);
    if (!d) return;
    const total = Dominio.totalCentavos(mesesPagados);
    const comprobanteId = this.generarComprobanteId();
    const cobro = {
      id: uid(), domicilioId: id, tecnico: this.tecnico,
      mesesPagados, cantidadMeses: mesesPagados.length, totalCentavos: total,
      metodo: "Efectivo", fecha: hoyISO(), comprobanteId,
      sync: this.online ? "synced" : "pending",
    };
    // Deuda local se actualiza INMEDIATAMENTE
    const actualizado = Dominio.aplicarPago(d, mesesPagados);
    const idx = this.domicilios.findIndex(x => x.id === id);
    this.domicilios[idx] = { ...d, ...actualizado, visitado: true };
    this.cobros.push(cobro);
    if (!this.online) {
      this.cola.push({
        id: uid(), tipo: "cobro", estado: "pending", intentos: 0, payload: { cobroId: cobro.id },
      });
    }
    this.lastRecibo = cobro;
    this.persistir();
  },

  generarComprobanteId() {
    const fecha = hoyISO().replace(/-/g, "");
    const seq = String(this.cobros.length + 1).padStart(6, "0");
    return `CP-${fecha}-${seq}`;
  },

  persistir() {
    Store.save(this.domicilios, this.cobros, this.cola, this.lastSync);
    UI.renderAll();
  },

  async restaurar() {
    await Store.init();
    const data = await Store.load();
    if (data.domicilios) this.domicilios = data.domicilios;
    if (data.cobros) this.cobros = data.cobros;
    if (data.cola) this.cola = data.cola;
    if (data.lastSync) this.lastSync = data.lastSync;
    if (!this.domicilios.length) {
      this.domicilios = seedDomicilios();
      this.lastSync = "Hoy, 08:42";
      this.persistir();
    }
  },

  async restablecer() {
    await Store.reset();
    this.domicilios = seedDomicilios();
    this.cobros = [];
    this.cola = [];
    this.lastSync = "Hoy, 08:42";
    this.online = true;
    $("#offline-toggle").checked = false;
    this.persistir();
  },
};

/* ---------- Sync simulada ---------- */
const Sync = {
  showModal() { $("#modal-sync").classList.remove("hidden"); },

  hideModal() {
    setTimeout(() => $("#modal-sync").classList.add("hidden"), 700);
  },

  async run() {
    if (App.syncing) return;
    App.syncing = true;
    this.showModal();
    const pendientes = App.cola.filter(q => q.estado !== "synced");
    const total = pendientes.length;
    const title = $("#sync-title");
    const bar = $("#sync-bar");
    const status = $("#sync-status");

    if (total === 0) {
      title.textContent = "Sincronización completada";
      bar.style.width = "100%";
      status.textContent = "No hay cambios pendientes.";
      App.lastSync = "Hoy · " + new Date().toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });
      $("#sync-last").textContent = App.lastSync;
      App.persistir();
      this.hideModal();
      App.syncing = false;
      App.renderAll();
      return;
    }

    title.textContent = "Sincronizando cambios…";
    let done = 0;
    for (const q of pendientes) {
      q.estado = "syncing";
      App.persistir();
      await new Promise(r => setTimeout(r, 500)); // simular latencia
      if (q.tipo === "cobro") {
        const cobro = App.cobros.find(c => c.id === q.payload.cobroId);
        if (cobro) cobro.sync = "synced";
      }
      q.estado = "synced";
      done++;
      const pct = Math.round((done / total) * 100);
      bar.style.width = pct + "%";
      status.textContent = `${done} de ${total} cambios sincronizados`;
      App.persistir();
      await new Promise(r => setTimeout(r, 300));
    }

    // Retirar operaciones completadas de la cola
    App.cola = App.cola.filter(q => q.estado !== "synced");

    title.textContent = "✓ Sincronización completada";
    status.textContent = `${total} cambios sincronizados`;
    bar.style.width = "100%";
    App.lastSync = "Hoy · " + new Date().toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });
    $("#sync-last").textContent = App.lastSync;
    App.syncing = false;
    App.persistir();
    this.hideModal();
    App.renderAll();
  },

  // Falla una operación simulada (para demostrar reintento sin pérdida)
  simularFallo() {
    const pend = App.cola.filter(q => q.estado !== "synced");
    if (!pend.length) return;
    pend[0].estado = "failed";
    pend[0].intentos++;
    App.persistir();
    App.renderAll();
  },
};

/* ---------- Router / UI ---------- */
const UI = {
  screens: {
    inicio: "screen-inicio",
    domicilios: "screen-domicilios",
    detalle: "screen-detalle",
    cobranza: "screen-cobranza",
    pago: "screen-pago",
    comprobante: "screen-comprobante",
    cobros: "screen-cobros",
    mas: "screen-mas",
  },

  titles: {
    inicio: "SEPSA",
    domicilios: "Domicilios",
    detalle: "Domicilio",
    cobranza: "Cobrar",
    pago: "Pago",
    comprobante: "Comprobante",
    cobros: "Cobros",
    mas: "Más",
  },

  show(screen) {
    App.screen = screen;
    $$(".screen").forEach(s => s.classList.remove("active"));
    $("#" + this.screens[screen]).classList.add("active");
    $("#app-title").textContent = this.titles[screen];
    $("#btn-back").classList.toggle("hidden", !["detalle", "cobranza", "pago", "comprobante"].includes(screen));
    $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.nav === screen));
    if (screen === "detalle" && App.currentDomicilioId) this.renderDetalle();
    if (screen === "cobranza") this.renderCobranza();
    if (screen === "pago" && App.lastRecibo) this.renderPago();
    if (screen === "comprobante" && App.lastRecibo) this.renderComprobante();
  },

  renderAll() {
    this.renderConn();
    this.renderInicio();
    this.renderDomicilios();
    this.renderCobros();
    this.renderMas();
    if (App.currentDomicilioId) {
      if (App.screen === "detalle") this.renderDetalle();
      if (App.screen === "cobranza") this.renderCobranza();
      if (App.screen === "pago") this.renderPago();
      if (App.screen === "comprobante") this.renderComprobante();
    }
  },

  renderConn() {
    const ok = App.online;
    $("#conn-dot").className = "dot " + (ok ? "green" : "orange");
    $("#conn-text").textContent = ok ? "Sincronizado" : "Sin conexión";
    $("#conn-card-dot").className = "dot " + (ok ? "green" : "orange");
    $("#conn-card-text").textContent = ok ? "🟢 Sincronizado" : "🟠 Sin conexión · trabajando localmente";
    $("#offline-hint").classList.toggle("hidden", ok);
    $("#offline-banner").classList.toggle("hidden", ok);
    const pend = App.pendientes();
    $("#pending-banner").classList.toggle("hidden", ok || pend === 0);
    $("#pending-count").textContent = pend;
  },

  renderInicio() {
    const hora = new Date().getHours();
    const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
    $("#greeting").textContent = `${saludo}, ${App.tecnico}`;
    $("#zone").textContent = App.zona;
    $("#stat-asignados").textContent = App.domicilios.length;
    $("#stat-visitados").textContent = App.visitadosHoy();
    $("#stat-pendientes").textContent = App.deudores();
    $("#stat-cobros").textContent = App.cobros.length;
    $("#stat-monto").textContent = fmtBs(App.montoCobradoHoy());
    $("#last-sync-text").textContent = App.lastSync || "—";
  },

  renderDomicilios() {
    const q = ($("#search-input").value || "").trim().toLowerCase();
    const filtro = (document.querySelector(".filter-chip.active") || {}).dataset?.filter || "todos";
    const list = $("#domicilio-list");
    list.innerHTML = "";
    let count = 0;
    for (const d of App.domicilios) {
      const matchQ = !q || d.nombre.toLowerCase().includes(q) || d.codigo.includes(q);
      const est = Dominio.estadoDomicilio(d);
      const matchF = filtro === "todos" || est === filtro;
      if (!matchQ || !matchF) continue;
      count++;
      const li = document.createElement("li");
      li.className = "domicilio-item estado-" + est;
      li.dataset.id = d.id;
      li.innerHTML = `
        <div class="dom-top">
          <div>
            <div class="dom-nombre">${d.nombre}</div>
            <div class="dom-codigo">Código ${d.codigo}</div>
            <div class="dom-localidad">${d.localidad}</div>
          </div>
          <span class="dom-badge badge-${est}">${est === "al-dia" ? "🟢 Al día" : est === "visitado" ? "🟡 Visitado" : "🔴 Pendiente"}</span>
        </div>
        <div class="dom-bottom">
          <span class="dom-meses">${d.meses.length} ${d.meses.length === 1 ? "mes" : "meses"} pendientes</span>
          <span class="dom-deuda">${fmtBs(Dominio.totalCentavos(d.meses))}</span>
        </div>`;
      list.appendChild(li);
    }
    $("#empty-state").classList.toggle("hidden", count > 0);
  },

  renderDetalle() {
    const d = App.domicilio(App.currentDomicilioId);
    if (!d) return;
    const est = Dominio.estadoDomicilio(d);
    $("#det-nombre").textContent = d.nombre;
    $("#det-codigo").textContent = d.codigo;
    $("#det-direccion").textContent = d.direccion;
    $("#det-localidad").textContent = d.localidad;
    $("#det-medidor").textContent = d.medidor;
    $("#det-estado").textContent = est === "al-dia" ? "🟢 Al día" : est === "visitado" ? "🟡 Visitado" : "🔴 Pendiente";
    $("#det-meses").textContent = d.meses.length === 0 ? "Sin deuda" : `${d.meses.length} meses`;
    $("#det-deuda").textContent = fmtBs(Dominio.totalCentavos(d.meses));

    const ul = $("#det-meses-list");
    ul.innerHTML = "";
    if (d.meses.length === 0) {
      ul.innerHTML = '<li class="meses-item"><span class="muted">Este domicilio no tiene meses pendientes.</span></li>';
    } else {
      for (const m of d.meses) {
        const li = document.createElement("li");
        li.className = "meses-item";
        li.innerHTML = `<span>${mesLabel(m)}</span><strong>${fmtBs(m.montoCentavos)}</strong>`;
        ul.appendChild(li);
      }
    }
    $("#btn-cobrar").disabled = d.meses.length === 0;
  },

  renderCobranza() {
    const d = App.domicilio(App.currentDomicilioId);
    if (!d) return;
    $("#cob-nombre").textContent = d.nombre;
    $("#cob-codigo").textContent = d.codigo;
    $("#cob-meses").textContent = `${d.meses.length} meses`;
    $("#cob-deuda").textContent = fmtBs(Dominio.totalCentavos(d.meses));

    const max = d.meses.length;
    if (App.cobranzaCantidad > max) App.cobranzaCantidad = max;
    if (App.cobranzaCantidad < 1) App.cobranzaCantidad = 1;

    $("#cob-cantidad").textContent = App.cobranzaCantidad;
    $("#step-minus").disabled = App.cobranzaCantidad <= 1;
    $("#step-plus").disabled = App.cobranzaCantidad >= max;

    const seleccion = Dominio.seleccionarMeses(d.meses, App.cobranzaCantidad) || [];
    const ul = $("#cob-meses-list");
    ul.innerHTML = "";
    for (const m of seleccion) {
      const li = document.createElement("li");
      li.className = "meses-item";
      li.innerHTML = `<span>${mesLabel(m)}</span><strong>${fmtBs(m.montoCentavos)}</strong>`;
      ul.appendChild(li);
    }
    const total = Dominio.totalCentavos(seleccion);
    $("#cob-total-meses").textContent = `${seleccion.length} ${seleccion.length === 1 ? "mes" : "meses"}`;
    $("#cob-total").textContent = fmtBs(total);
    $("#btn-continuar-cobro").textContent = `COBRAR ${fmtBs(total)}`;
  },

  renderPago() {
    const c = App.lastRecibo;
    if (!c) return;
    const d = App.domicilio(c.domicilioId);
    $("#pago-nombre").textContent = d ? d.nombre : "—";
    $("#pago-meses").textContent = `${c.cantidadMeses} meses`;
    $("#pago-total").textContent = fmtBs(c.totalCentavos);
    const restante = d ? Dominio.totalCentavos(d.meses) : 0;
    $("#pago-restante").textContent = `${d ? d.meses.length : 0} meses · ${fmtBs(restante)}`;
    $("#pago-estado").textContent = App.online ? "✓ Sincronizado" : "🕐 Pendiente de sincronización";
  },

  renderComprobante() {
    const c = App.lastRecibo;
    if (!c) return;
    const d = App.domicilio(c.domicilioId);
    $("#rec-cliente").textContent = d ? d.nombre : "—";
    $("#rec-codigo").textContent = d ? d.codigo : "—";
    $("#rec-meses").textContent = c.mesesPagados.map(mesLabel).join(", ");
    $("#rec-total").textContent = fmtBs(c.totalCentavos);
    $("#rec-tecnico").textContent = c.tecnico;
    $("#rec-fecha").textContent = c.fecha.split("-").reverse().join("/");
    $("#rec-estado").textContent = c.sync === "synced" ? "Registrado" : "Registrado sin conexión";
    $("#rec-id").textContent = c.comprobanteId;
  },

  renderCobros() {
    const list = $("#cobros-list");
    list.innerHTML = "";
    if (App.cobros.length === 0) {
      $("#cobros-empty").classList.remove("hidden");
      return;
    }
    $("#cobros-empty").classList.add("hidden");
    const byFecha = [...App.cobros].sort((a, b) => b.fecha.localeCompare(a.fecha));
    for (const c of byFecha) {
      const d = App.domicilio(c.domicilioId);
      const li = document.createElement("li");
      li.className = "cobro-item";
      const syncOk = c.sync === "synced";
      li.innerHTML = `
        <div class="cobro-top">
          <span class="cobro-nombre">${d ? d.nombre : "—"}</span>
          <span class="cobro-sync ${syncOk ? "sync-ok" : "sync-pend"}">${syncOk ? "✓ Sincronizado" : "🕐 Pendiente"}</span>
        </div>
        <div class="cobro-meta">
          <span>${c.cantidadMeses} ${c.cantidadMeses === 1 ? "mes" : "meses"}</span>
          <span class="cobro-total">${fmtBs(c.totalCentavos)}</span>
          <span>${c.comprobanteId}</span>
        </div>`;
      list.appendChild(li);
    }
  },

  renderMas() {
    $("#mas-conn-desc").textContent = App.online
      ? "Actívalo para simular que trabajas sin Internet."
      : "Modo offline activo. La app sigue funcionando localmente.";
    $("#mas-last-sync").textContent = App.lastSync || "—";
  },

  showModal(el) { el.classList.remove("hidden"); },
  hideModal(el) { el.classList.add("hidden"); },

  toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
  },
};

/* ---------- Bindings de eventos ---------- */
function bindEvents() {
  // Navegación inferior
  $$(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => UI.show(btn.dataset.nav));
  });

  // Volver
  $("#btn-back").addEventListener("click", () => UI.show("domicilios"));

  // Búsqueda y filtros
  $("#search-input").addEventListener("input", () => UI.renderDomicilios());
  $$(".filter-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      $$(".filter-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      UI.renderDomicilios();
    });
  });

  // Selección de domicilio
  $("#domicilio-list").addEventListener("click", (e) => {
    const item = e.target.closest(".domicilio-item");
    if (!item) return;
    App.currentDomicilioId = item.dataset.id;
    UI.show("detalle");
  });

  // Registrar visita
  $("#btn-visita").addEventListener("click", () => {
    const d = App.domicilio(App.currentDomicilioId);
    if (!d) return;
    $("#visita-nombre").textContent = d.nombre;
    $("#visita-codigo").textContent = d.codigo;
    $("#visita-obs").value = "";
    UI.showModal($("#modal-visita"));
  });
  $("#visita-cancelar").addEventListener("click", () => UI.hideModal($("#modal-visita")));
  $("#visita-guardar").addEventListener("click", () => {
    App.registrarVisita(App.currentDomicilioId, $("#visita-obs").value);
    UI.hideModal($("#modal-visita"));
    UI.show("detalle");
    UI.toast("✓ Visita registrada" + (App.online ? "" : " · se guardará offline"));
  });

  // Cobranza
  $("#btn-cobrar").addEventListener("click", () => {
    App.cobranzaCantidad = 1;
    UI.show("cobranza");
  });
  $("#step-minus").addEventListener("click", () => {
    if (App.cobranzaCantidad > 1) { App.cobranzaCantidad--; UI.renderCobranza(); }
  });
  $("#step-plus").addEventListener("click", () => {
    const d = App.domicilio(App.currentDomicilioId);
    if (d && App.cobranzaCantidad < d.meses.length) { App.cobranzaCantidad++; UI.renderCobranza(); }
  });

  // Confirmar cobro
  $("#btn-continuar-cobro").addEventListener("click", () => {
    const d = App.domicilio(App.currentDomicilioId);
    if (!d) return;
    const seleccion = Dominio.seleccionarMeses(d.meses, App.cobranzaCantidad);
    if (!seleccion) return;
    $("#conf-cliente").textContent = d.nombre;
    $("#conf-meses").textContent = seleccion.map(mesLabel).join(", ");
    $("#conf-cantidad").textContent = seleccion.length === 1 ? "1 mes" : `${seleccion.length} meses`;
    $("#conf-total").textContent = fmtBs(Dominio.totalCentavos(seleccion));
    UI.showModal($("#modal-confirmar"));
  });
  $("#conf-cancelar").addEventListener("click", () => UI.hideModal($("#modal-confirmar")));
  $("#conf-aceptar").addEventListener("click", () => {
    const d = App.domicilio(App.currentDomicilioId);
    const seleccion = Dominio.seleccionarMeses(d.meses, App.cobranzaCantidad);
    App.registrarCobro(d.id, seleccion);
    UI.hideModal($("#modal-confirmar"));
    UI.show("pago");
  });

  // Pago registrado
  $("#btn-finalizar").addEventListener("click", () => {
    App.currentDomicilioId = null;
    UI.show("domicilios");
  });
  $("#btn-ver-comprobante").addEventListener("click", () => UI.show("comprobante"));

  // Comprobante (simulado)
  $("#btn-compartir").addEventListener("click", () => UI.toast("Compartir (simulado)"));
  $("#btn-guardar").addEventListener("click", () => UI.toast("Comprobante guardado (simulado)"));

  // Más
  $("#offline-toggle").addEventListener("change", (e) => {
    App.online = !e.target.checked;
    UI.renderAll();
    if (App.online) {
      Sync.run();
    } else {
      UI.toast("Modo offline activado · trabajando localmente");
    }
  });
  $("#btn-sync-manual").addEventListener("click", () => Sync.run());
  $("#btn-reiniciar").addEventListener("click", async () => {
    if (confirm("¿Restablecer los datos de ejemplo? Se perderán los cambios.")) {
      await App.restablecer();
      App.currentDomicilioId = null;
      UI.show("inicio");
      UI.toast("Datos de ejemplo restablecidos");
    }
  });
}

/* ---------- Arranque ---------- */
(async function init() {
  bindEvents();
  await App.restaurar();
  UI.renderAll();
  UI.show("inicio");
  window.App = App; // accesible para pruebas en consola
})();