// Temporizador de Sesión de 6 minutos observado en el video
    let timeLeft = 377; // 6 min 17 seg
    const timerDisplay = document.getElementById('timer-display');
    setInterval(() => {
      if (timeLeft > 0) {
        timeLeft--;
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        timerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
    }, 1000);

    // Conmutador de Vistas / Pestañas
    function switchView(viewId) {
      document.querySelectorAll('.view-panel').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.switcher-btn').forEach(el => el.classList.remove('active'));
      document.getElementById(viewId).classList.add('active');

      const btnMap = {
        'view-dash': 0,
        'view-crear-orden': 1,
        'view-ver-cortes': 2,
        'view-corte-detail': 3,
        'view-kardex': 5
      };
      if (btnMap[viewId] !== undefined) {
        document.querySelectorAll('.switcher-btn')[btnMap[viewId]].classList.add('active');
      }
    }

    // Modal Control
    function closeModal(modalId) {
      document.getElementById(modalId).classList.remove('active');
    }

    // Filtros en cascada de Búsqueda
    function updateLocalidades() {
      const area = document.getElementById('f-area').value;
      const loc = document.getElementById('f-localidad');
      loc.innerHTML = area === 'B' 
        ? '<option value="002">002 - MOJOTORILLO</option>'
        : '<option value="001">001 - POTOSI CENTRAL</option>';
      updateRutas();
    }
    function updateRutas() {
      const loc = document.getElementById('f-localidad').value;
      const ruta = document.getElementById('f-ruta');
      ruta.innerHTML = loc === '002'
        ? '<option value="002">002 - MOJOTORILLO</option>'
        : '<option value="001">001 - RUTA CENTRAL</option>';
    }

    // Ejecutar Búsqueda de Morosos
    function ejecutarBusquedaMorosos() {
      const facturas = parseInt(document.getElementById('f-facturas').value);
      const tbody = document.getElementById('tabla-morosos-body');
      const count = document.getElementById('count-morosos');
      const btnCrear = document.getElementById('btn-crear-orden-masiva');

      if (facturas >= 3) {
        tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; padding: 20px; color: var(--text-muted);">0 resultados encontrados para 3 facturas vencidas en esta ruta.</td></tr>';
        count.textContent = '0';
        btnCrear.style.opacity = '0.5';
        btnCrear.disabled = true;
      } else {
        tbody.innerHTML = `
          <tr>
            <td>101 - 002</td>
            <td><span class="badge badge-info">R</span></td>
            <td><strong>306040</strong></td>
            <td>MUÑOZ PEDRO</td>
            <td>002</td>
            <td>129</td>
            <td>D-1182</td>
            <td>MOJOTORILLO S/N</td>
            <td>RS</td>
            <td>240907792 (WASION)</td>
            <td><span class="badge badge-danger">2</span></td>
            <td><strong>94.34</strong></td>
            <td><button class="btn btn-sm btn-outline" onclick="switchView('view-kardex'); buscarKardexReal();"><i class="fa-solid fa-receipt"></i> Ver Kardex</button></td>
          </tr>
          <tr>
            <td>101 - 002</td>
            <td><span class="badge badge-info">R</span></td>
            <td><strong>306043</strong></td>
            <td>CONDORI CONDORI ALEJANDRO</td>
            <td>002</td>
            <td>130</td>
            <td>D-1182</td>
            <td>MOJOTORILLO S/N</td>
            <td>RS</td>
            <td>240907795 (WASION)</td>
            <td><span class="badge badge-danger">2</span></td>
            <td><strong>78.10</strong></td>
            <td><button class="btn btn-sm btn-outline" onclick="switchView('view-kardex'); buscarKardexReal();"><i class="fa-solid fa-receipt"></i> Ver Kardex</button></td>
          </tr>
        `;
        count.textContent = '2';
        btnCrear.style.opacity = '1';
        btnCrear.disabled = false;
      }
    }

    // Emisión de Órdenes
    function triggerCrearOrdenLote() {
      if (confirm("¿Está seguro de generar órdenes de corte para los clientes morosos mostrados?")) {
        alert("¡Órdenes de corte generadas exitosamente con estado GENERADO!");
        switchView('view-ver-cortes');
      }
    }

    // Alternar mapa en Bandeja
    function toggleMapView() {
      const map = document.getElementById('map-container');
      map.style.display = map.style.display === 'none' ? 'block' : 'none';
    }

    // Cargar Detalle de Corte Activo vs Anulado
    function openCorteDetail(cucId) {
      switchView('view-corte-detail');
      const titleCuc = document.getElementById('corte-title-cuc');
      const badgeEstado = document.getElementById('corte-badge-estado');
      const bannerAnulado = document.getElementById('banner-anulado');
      const cardAction = document.getElementById('card-action-corte');
      const valCuenta = document.getElementById('corte-val-cuenta');
      const valMedidor = document.getElementById('corte-val-medidor');
      const valNombre = document.getElementById('corte-val-nombre');
      const valTotalDeuda = document.getElementById('corte-val-total-deuda');
      const tablaDeuda = document.getElementById('tabla-deuda-corte-body');

      titleCuc.textContent = `C.U.C.: ${cucId}`;

      if (cucId === 443797) {
        // Orden Anulada
        badgeEstado.textContent = 'ESTADO: ANULADO';
        badgeEstado.className = 'badge badge-warning';
        badgeEstado.style.background = '#e0e0e0';
        badgeEstado.style.color = '#424242';
        bannerAnulado.style.display = 'flex';
        cardAction.style.display = 'none';

        valCuenta.textContent = '1702690';
        valMedidor.textContent = '14093812';
        valNombre.textContent = 'CHOQUE DE BALCAZAR NORA';
        valTotalDeuda.textContent = 'Total: 73.35 Bs (PAGADO)';

        tablaDeuda.innerHTML = `
          <tr>
            <td>2026</td>
            <td>6</td>
            <td>27/06/2026 10:14</td>
            <td>24.10</td>
            <td><span class="badge badge-success">C</span></td>
            <td>FA_FACTURAS</td>
            <td>Pagado</td>
          </tr>
          <tr>
            <td>2026</td>
            <td>7</td>
            <td>27/07/2026 11:02</td>
            <td>24.90</td>
            <td><span class="badge badge-success">C</span></td>
            <td>FA_FACTURAS</td>
            <td>Pagado</td>
          </tr>
          <tr>
            <td>2026</td>
            <td>8</td>
            <td>27/08/2026 09:45</td>
            <td>24.35</td>
            <td><span class="badge badge-success">C</span></td>
            <td>FA_FACTURAS</td>
            <td>Pagado</td>
          </tr>
        `;
      } else {
        // Orden Activa (443794)
        badgeEstado.textContent = 'ESTADO: GENERADO';
        badgeEstado.className = 'badge badge-danger';
        bannerAnulado.style.display = 'none';
        cardAction.style.display = 'block';

        valCuenta.textContent = '1701603';
        valMedidor.textContent = '14093786';
        valNombre.textContent = 'CHOQUE CONDOR NORMA';
        valTotalDeuda.textContent = 'Total: 66.82 Bs';

        tablaDeuda.innerHTML = `
          <tr>
            <td>2026</td><td>6</td><td>27/06/2026 10:14</td><td>21.94</td>
            <td><span class="badge badge-danger">P</span></td><td>FA_FACTURAS</td><td>63</td>
          </tr>
          <tr>
            <td>2026</td><td>7</td><td>27/07/2026 11:02</td><td>22.64</td>
            <td><span class="badge badge-danger">P</span></td><td>FA_FACTURAS</td><td>31</td>
          </tr>
          <tr>
            <td>2026</td><td>8</td><td>27/08/2026 09:45</td><td>22.24</td>
            <td><span class="badge badge-danger">P</span></td><td>FA_FACTURAS</td><td>2</td>
          </tr>
        `;
      }
    }

    // Verificación de Permiso GPS en Ficha
    function verificarGPSPermiso() {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => alert(`Ubicación confirmada: Lat ${pos.coords.latitude.toFixed(6)}, Lng ${pos.coords.longitude.toFixed(6)}`),
          err => alert("Aviso: Permiso denegado o no disponible en navegador. Por favor habilite la ubicación.")
        );
      } else {
        alert("Geolocalización no soportada en este navegador.");
      }
    }

    // Modal Corte Efectivo
    function abrirModalCorteEfectivo() {
      document.getElementById('modal-corte-efectivo').classList.add('active');
    }

    function capturarGPSModal() {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            document.getElementById('modal-lat').value = pos.coords.latitude.toFixed(6);
            document.getElementById('modal-lng').value = pos.coords.longitude.toFixed(6);
          },
          err => {
            // Coordenadas reales de Betanzos/Potosí observadas en el video como fallback
            document.getElementById('modal-lat').value = "-19.589366";
            document.getElementById('modal-lng').value = "-65.259119";
            alert("Ubicación satelital fijada por fallback de estación: -19.589366, -65.259119");
          }
        );
      } else {
        document.getElementById('modal-lat').value = "-19.589366";
        document.getElementById('modal-lng').value = "-65.259119";
      }
    }

    function guardarCorteEfectivo() {
      const lat = document.getElementById('modal-lat').value;
      const lectura = document.getElementById('modal-lectura').value;
      const tipo = document.getElementById('modal-tipo-corte').value;
      const bypassCoords = document.getElementById('modal-bypass-coords').value;

      if (!lectura) {
        alert("Debe ingresar la lectura del medidor al corte.");
        return;
      }
      if (!lat && bypassCoords === 'NO') {
        alert("Debe capturar las coordenadas GPS o activar 'Saltar Control de Coordenadas'.");
        return;
      }

      alert(`¡Corte Efectivo Registrado con Éxito!\nTipo: ${tipo}\nLectura: ${lectura} kWh\nEstado actualizado a EJECUTADO.`);
      closeModal('modal-corte-efectivo');
      document.getElementById('corte-badge-estado').textContent = 'ESTADO: EJECUTADO';
      document.getElementById('corte-badge-estado').className = 'badge badge-warning';
    }

    // Dropzone Upload
    function handleFileSelected(input) {
      if (input.files.length > 0) {
        const file = input.files[0];
        document.getElementById('file-upload-list').innerHTML = `
          <div style="background:#e8f5e9; padding:4px 8px; border-radius:4px; color:var(--success);">
            <i class="fa-solid fa-file-check"></i> Archivo listo: <strong>${file.name}</strong> (${(file.size/1024).toFixed(1)} KB)
          </div>
        `;
      }
    }

    // Búsqueda en Kardex Comercial
    function buscarKardexReal() {
      const cuenta = document.getElementById('kardex-cuenta-input').value.trim();
      const nombre = document.getElementById('kardex-val-nombre');

      if (cuenta === '306040') {
        nombre.textContent = 'MUÑOZ PEDRO';
        // Disparar la alerta urgente de CI faltante que aparece en el video
        setTimeout(() => {
          document.getElementById('modal-alerta-kardex').classList.add('active');
        }, 200);
      } else if (cuenta === '1701603') {
        nombre.textContent = 'CHOQUE CONDOR NORMA';
      } else {
        nombre.textContent = 'CLIENTE REGISTRADO SEPSA';
      }
    }
