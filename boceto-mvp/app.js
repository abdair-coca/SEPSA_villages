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

    const technicianLocation = {
      latitude: -19.589366,
      longitude: -65.259119,
      accuracy: 8
    };

    const mapDomicilios = [
      { account: '1701603', meter: '14093786', owner: 'CHOQUE CONDOR NORMA', route: '002', order: 129, circuit: 'D-1182', address: 'SAN MIGUEL DE KHARI S/N', debt: '66.82', status: 'GENERADO', date: '27/08/2026 12:33', days: '9.21', cuc: 443794, latitude: -19.590104, longitude: -65.260398 },
      { account: '1702690', meter: '14093812', owner: 'CHOQUE DE BALCAZAR NORA', route: '002', order: 130, circuit: 'D-1182', address: 'SAN MIGUEL DE KHARI S/N', debt: '73.35', status: 'ANULADO', date: '27/08/2026 12:33', days: '9.21', cuc: 443797, latitude: -19.588912, longitude: -65.258647 },
      { account: '306040', meter: '240907792', owner: 'MUÑOZ PEDRO', route: '002', order: 129, circuit: 'D-1182', address: 'MOJOTORILLO S/N', debt: '94.34', status: 'GENERADO', date: '28/08/2026 09:15', days: '8.34', cuc: 443798, latitude: -19.589118, longitude: -65.258204 },
      { account: '306043', meter: '240907795', owner: 'CONDORI CONDORI ALEJANDRO', route: '002', order: 130, circuit: 'D-1182', address: 'MOJOTORILLO S/N', debt: '78.10', status: 'GENERADO', date: '28/08/2026 09:19', days: '8.33', cuc: 443799, latitude: -19.588521, longitude: -65.258941 },
      { account: '306051', meter: '240907804', owner: 'FLORES JUSTO', route: '002', order: 132, circuit: 'D-1182', address: 'CALLEJON CENTRAL S/N', debt: '45.20', status: 'GENERADO', date: '28/08/2026 09:24', days: '8.33', cuc: 443800, latitude: -19.588247, longitude: -65.259563 },
      { account: '306077', meter: '240907831', owner: 'MAMANI VILCA ROSA', route: '002', order: 134, circuit: 'D-1182', address: 'COMUNIDAD MOJOTORILLO', debt: '112.64', status: 'GENERADO', date: '28/08/2026 09:31', days: '8.32', cuc: 443801, latitude: -19.589742, longitude: -65.259816 },
      { account: '306084', meter: '240907846', owner: 'QUISPE CHOQUE JUAN', route: '002', order: 136, circuit: 'D-1182', address: 'CAMINO A LA ESCUELA S/N', debt: '58.76', status: 'GENERADO', date: '28/08/2026 09:37', days: '8.31', cuc: 443802, latitude: -19.590106, longitude: -65.259294 },
      { account: '306102', meter: '240907862', owner: 'VILLEGAS LLANQUE MARIA', route: '002', order: 138, circuit: 'D-1182', address: 'SECTOR LA PLAZA S/N', debt: '86.48', status: 'GENERADO', date: '28/08/2026 09:44', days: '8.31', cuc: 443803, latitude: -19.590321, longitude: -65.258581 },
      { account: '306119', meter: '240907879', owner: 'TICONA MENDOZA LUIS', route: '002', order: 140, circuit: 'D-1182', address: 'BARRIO NUEVO S/N', debt: '39.92', status: 'GENERADO', date: '28/08/2026 09:52', days: '8.30', cuc: 443804, latitude: -19.589937, longitude: -65.257944 },
      { account: '306141', meter: '240907901', owner: 'MOLLO MAMANI ELENA', route: '002', order: 142, circuit: 'D-1182', address: 'RUTA VECINAL 4 S/N', debt: '127.18', status: 'GENERADO', date: '28/08/2026 10:04', days: '8.29', cuc: 443805, latitude: -19.589291, longitude: -65.257626 },
      { account: '306158', meter: '240907918', owner: 'HUANCA CONDORI JULIO', route: '002', order: 144, circuit: 'D-1182', address: 'MOJOTORILLO S/N', debt: '52.36', status: 'GENERADO', date: '28/08/2026 10:11', days: '8.28', cuc: 443806, latitude: -19.588688, longitude: -65.257795 },
      { account: '306174', meter: '240907934', owner: 'PAREDES TORREZ GLORIA', route: '002', order: 146, circuit: 'D-1182', address: 'SECTOR CANCHA S/N', debt: '69.74', status: 'GENERADO', date: '28/08/2026 10:18', days: '8.28', cuc: 443807, latitude: -19.588183, longitude: -65.258356 }
    ];

    let fieldMap;
    let technicianMarker;

    // Alternar mapa en Bandeja y cargar cartografía satelital al abrirlo
    function toggleMapView() {
      const mapContainer = document.getElementById('map-container');
      const isOpening = mapContainer.style.display === 'none';
      mapContainer.style.display = isOpening ? 'block' : 'none';

      if (isOpening) {
        requestAnimationFrame(initializeFieldMap);
      }
    }

    function initializeFieldMap() {
      if (!window.L) {
        updateMapStatus('No se pudo cargar la imagen satelital. Revise la conexión.');
        return;
      }

      if (fieldMap) {
        fieldMap.invalidateSize();
        return;
      }

      fieldMap = L.map('map-simulator', {
        zoomControl: true,
        minZoom: 13,
        maxZoom: 19
      }).setView([technicianLocation.latitude, technicianLocation.longitude], 16);

      const satelliteLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          maxNativeZoom: 17,
          maxZoom: 19,
          attribution: 'Tiles &copy; Esri'
        }
      ).addTo(fieldMap);

      const labelsLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        {
          maxNativeZoom: 17,
          maxZoom: 19,
          opacity: 0.82,
          attribution: 'Labels &copy; Esri'
        }
      ).addTo(fieldMap);

      satelliteLayer.on('tileerror', () => updateMapStatus('No se pudo cargar la imagen satelital. Revise la conexión.'));
      L.control.layers({ 'Imagen satelital': satelliteLayer }, { 'Límites y lugares': labelsLayer }).addTo(fieldMap);

      technicianMarker = L.marker(
        [technicianLocation.latitude, technicianLocation.longitude],
        {
          icon: L.divIcon({
            className: 'field-user-marker-wrap',
            html: '<span class="field-user-marker"><i class="fa-solid fa-person"></i></span>',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          }),
          title: 'Ubicación del técnico'
        }
      ).addTo(fieldMap).bindPopup(
        `<strong>Ubicación del técnico</strong><br>Lat ${technicianLocation.latitude.toFixed(6)}<br>Lng ${technicianLocation.longitude.toFixed(6)}<br>Precisión: ${technicianLocation.accuracy} m`
      );

      const bounds = L.latLngBounds([[technicianLocation.latitude, technicianLocation.longitude]]);
      mapDomicilios.forEach(domicilio => {
        const markerColor = domicilio.status === 'ANULADO' ? '#6b7280' : '#c62828';
        const marker = L.circleMarker([domicilio.latitude, domicilio.longitude], {
          radius: 7,
          color: '#ffffff',
          weight: 2,
          fillColor: markerColor,
          fillOpacity: 0.95
        }).addTo(fieldMap);

        marker.bindPopup(`
          <div class="map-popup">
            <strong>Cuenta ${domicilio.account}</strong>
            <span>${domicilio.owner}</span>
            <span>Medidor ${domicilio.meter}</span>
            <span>Deuda: ${domicilio.debt} Bs · ${domicilio.status}</span>
            <button class="btn btn-primary btn-sm" onclick="openCorteDetail(${domicilio.cuc})">Ver ficha</button>
          </div>
        `);
        bounds.extend([domicilio.latitude, domicilio.longitude]);
      });

      fieldMap.fitBounds(bounds.pad(0.16), { maxZoom: 16 });
      updateMapStatus(`Ubicación del técnico · Lat ${technicianLocation.latitude.toFixed(6)}, Lng ${technicianLocation.longitude.toFixed(6)} · Precisión ${technicianLocation.accuracy} m`);
      setTimeout(() => fieldMap.invalidateSize(), 0);
    }

    function updateMapStatus(message) {
      const status = document.getElementById('map-location-status');
      status.innerHTML = `<i class="fa-solid fa-location-dot"></i><span>${message}</span>`;
    }

    function centrarMapaEnTecnico() {
      if (fieldMap && technicianMarker) {
        fieldMap.setView([technicianLocation.latitude, technicianLocation.longitude], 17, { animate: true });
        technicianMarker.openPopup();
      }
    }

    function renderCortesMapTable() {
      const tbody = document.getElementById('map-cortes-body');
      const generated = document.getElementById('map-generated-count');
      const visible = document.getElementById('map-visible-count');

      tbody.innerHTML = mapDomicilios.map(domicilio => {
        const isCancelled = domicilio.status === 'ANULADO';
        const badge = isCancelled
          ? '<span class="badge badge-warning map-status-cancelled">ANULADO</span>'
          : '<span class="badge badge-danger">GENERADO</span>';
        const actionClass = isCancelled ? 'btn-outline' : 'btn-danger';

        return `
          <tr>
            <td><strong>${domicilio.account}</strong><br><small class="text-muted">${domicilio.meter}</small></td>
            <td><button class="btn ${actionClass} btn-sm" onclick="openCorteDetail(${domicilio.cuc})"><i class="fa-solid fa-eye"></i> Ver corte</button></td>
            <td><span class="badge badge-info">R</span></td>
            <td>${badge}</td>
            <td>${domicilio.date}</td>
            <td><strong>${domicilio.days} días</strong></td>
            <td>${domicilio.debt} Bs</td>
            <td>-</td>
            <td><button class="btn ${actionClass} btn-sm" onclick="openCorteDetail(${domicilio.cuc})">Ver corte</button></td>
          </tr>
        `;
      }).join('');

      generated.textContent = mapDomicilios.filter(domicilio => domicilio.status === 'GENERADO').length;
      visible.textContent = mapDomicilios.length;
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

    // Mostrar ubicación de referencia sin pedir permisos del dispositivo
    function mostrarUbicacionEnFicha() {
      alert(`Ubicación del técnico: Lat ${technicianLocation.latitude.toFixed(6)}, Lng ${technicianLocation.longitude.toFixed(6)}`);
    }

    // Modal Corte Efectivo
    function abrirModalCorteEfectivo() {
      document.getElementById('modal-corte-efectivo').classList.add('active');
    }

    function guardarCorteEfectivo() {
      const lectura = document.getElementById('modal-lectura').value;
      const tipo = document.getElementById('modal-tipo-corte').value;

      if (!lectura) {
        alert("Debe ingresar la lectura del medidor al corte.");
        return;
      }

      alert(`¡Corte Efectivo Registrado con Éxito!\nTipo: ${tipo}\nLectura: ${lectura} kWh\nEstado actualizado a EJECUTADO.`);
      closeModal('modal-corte-efectivo');
      document.getElementById('corte-badge-estado').textContent = 'ESTADO: EJECUTADO';
      document.getElementById('corte-badge-estado').className = 'badge badge-warning';
    }

    // Dropzone Upload
    const MAX_PHOTO_MEGAPIXELS = 5;
    const PHOTO_JPEG_QUALITY = 0.78;
    let processedAttachment = null;

    function formatFileSize(bytes) {
      return bytes >= 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
        : `${(bytes / 1024).toFixed(1)} KB`;
    }

    function escapeHtml(value) {
      return value.replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[character]));
    }

    function getScaledPhotoSize(width, height) {
      const maxPixels = MAX_PHOTO_MEGAPIXELS * 1000000;
      const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)));

      return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale))
      };
    }

    function optimizePhoto(file) {
      return new Promise((resolve, reject) => {
        const imageUrl = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
          URL.revokeObjectURL(imageUrl);
          const size = getScaledPhotoSize(image.naturalWidth, image.naturalHeight);
          const canvas = document.createElement('canvas');
          canvas.width = size.width;
          canvas.height = size.height;
          const context = canvas.getContext('2d');
          if (!context) {
            reject(new Error('No se pudo preparar la fotografía.'));
            return;
          }
          context.drawImage(image, 0, 0, size.width, size.height);

          canvas.toBlob(blob => {
            if (!blob) {
              reject(new Error('No se pudo optimizar la fotografía.'));
              return;
            }

            resolve({
              file: new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }),
              original: file,
              width: size.width,
              height: size.height
            });
          }, 'image/jpeg', PHOTO_JPEG_QUALITY);
        };

        image.onerror = () => {
          URL.revokeObjectURL(imageUrl);
          reject(new Error('No se pudo leer la fotografía.'));
        };

        image.src = imageUrl;
      });
    }

    async function handleFileSelected(input) {
      if (!input.files.length) return;

      const file = input.files[0];
      const uploadList = document.getElementById('file-upload-list');
      uploadList.textContent = 'Optimizando fotografía...';

      if (!file.type.startsWith('image/')) {
        processedAttachment = file;
        uploadList.innerHTML = `
          <div style="background:#e8f5e9; padding:4px 8px; border-radius:4px; color:var(--success);">
            <i class="fa-solid fa-file-check"></i> Archivo listo: <strong>${escapeHtml(file.name)}</strong> (${formatFileSize(file.size)})
          </div>
        `;
        return;
      }

      try {
        const optimized = await optimizePhoto(file);
        processedAttachment = optimized.file;
        uploadList.innerHTML = `
          <div style="background:#e8f5e9; padding:4px 8px; border-radius:4px; color:var(--success);">
            <i class="fa-solid fa-file-check"></i> Foto optimizada: <strong>${escapeHtml(optimized.file.name)}</strong><br>
            <small>${optimized.width} × ${optimized.height} px · ${formatFileSize(file.size)} → ${formatFileSize(optimized.file.size)}</small>
          </div>
        `;
      } catch (error) {
        processedAttachment = file;
        uploadList.innerHTML = `
          <div style="background:#fff8e1; padding:4px 8px; border-radius:4px; color:#8a6d1d;">
            <i class="fa-solid fa-triangle-exclamation"></i> Se conservará la foto original: ${error.message}
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

    renderCortesMapTable();
