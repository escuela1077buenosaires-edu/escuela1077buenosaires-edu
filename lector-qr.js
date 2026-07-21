(function () {
  var sessionKey = 'aieQr1077AccessToken';
  var accessToken = '';
  var config = null;
  var state = null;
  var activities = [];
  var selectedPayload = null;
  var stream = null;
  var scanning = false;
  var detector = null;

  function $(id) {
    return document.getElementById(id);
  }

  function clean(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function setStatus(text, error) {
    var box = $('qrReaderStatus');
    if (!box) return;
    box.textContent = text;
    box.className = error ? 'student-index-status closed' : 'student-index-status open';
  }

  function rpc(functionName, payload, callback, authenticated) {
    if (!window.AIE_RUNTIME || !window.AIE_RUNTIME.supabaseReady()) {
      window.setTimeout(function () {
        callback({ error: window.AIE_RUNTIME ? window.AIE_RUNTIME.supabaseUnavailableMessage() : 'Falta configuracion Supabase.' });
      }, 0);
      return true;
    }
    window.AIE_RUNTIME.supabaseRpc(functionName, payload || {}, authenticated ? accessToken : '', callback);
    return true;
  }

  function directApi(method, path, data, callback, authenticated) {
    try {
      if (method === 'GET' && path === '/api/portal-docente/config') {
        window.setTimeout(function () {
          callback(null, window.AIE_RUNTIME.publicPortalConfig());
        }, 0);
        return true;
      }
      if (method === 'GET' && path === '/api/portal-docente/estado') {
        return rpc('aie_1077_portal_estado', {}, callback, authenticated);
      }
      if (method === 'GET' && path.indexOf('/api/portal-docente/actividades') === 0) {
        return rpc('aie_1077_actividades_listar', {
          p_disponible: true
        }, callback, authenticated);
      }
      if (method === 'POST' && path === '/api/resultados/validar') {
        window.setTimeout(function () {
          try {
            callback(null, validateResultPayload(data || {}));
          } catch (err) {
            callback({ error: err.message || 'El resultado del QR no paso la validacion.' });
          }
        }, 0);
        return true;
      }
      if (method === 'POST' && path === '/api/lector-qr/resultados') {
        return rpc('aie_1077_registrar_resultado_qr', { p_payload: data || {} }, callback, authenticated);
      }
    } catch (err) {
      window.setTimeout(function () {
        callback({ error: err.message || 'No se pudo preparar la llamada RPC.' });
      }, 0);
      return true;
    }
    return false;
  }

  function api(method, path, data, callback, authenticated) {
    if (window.AIE_RUNTIME && !window.AIE_RUNTIME.canCallBackend(path)) {
      if (directApi(method, path, data, callback, authenticated)) return;
      window.setTimeout(function () { callback({ error: window.AIE_RUNTIME.backendUnavailableMessage() }); }, 0);
      return;
    }
    var xhr = new XMLHttpRequest();
    var requestUrl = window.AIE_RUNTIME ? window.AIE_RUNTIME.apiUrl(path) : path;
    xhr.open(method, requestUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
    if (authenticated && accessToken) {
      xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken);
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var body = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch (err) {
        body = { error: xhr.responseText || 'Respuesta invalida.' };
      }
      if (xhr.status >= 400) {
        callback(body || { error: 'Error HTTP ' + xhr.status });
        return;
      }
      callback(null, body);
    };
    xhr.send(data ? JSON.stringify(data) : null);
  }

  function storage() {
    try {
      return window.sessionStorage;
    } catch (err) {
      return null;
    }
  }

  function captureTokenFromHash() {
    var hash = window.location.hash || '';
    if (hash.indexOf('access_token=') < 0) return false;
    var params = new URLSearchParams(hash.replace(/^#/, ''));
    var token = params.get('access_token') || '';
    if (!token) return false;
    accessToken = token;
    var store = storage();
    if (store) store.setItem(sessionKey, token);
    if (window.history && window.history.replaceState) {
      var cleanPath = window.AIE_RUNTIME ? window.AIE_RUNTIME.currentPagePath('') : window.location.pathname;
      window.history.replaceState(null, '', cleanPath);
    }
    return true;
  }

  function loadStoredToken() {
    if (accessToken) return;
    var store = storage();
    accessToken = store ? store.getItem(sessionKey) || '' : '';
  }

  function clearToken() {
    accessToken = '';
    var store = storage();
    if (store) store.removeItem(sessionKey);
  }

  function loginUrl() {
    var supabase = config && config.supabase || {};
    if (!supabase.url || !supabase.loginGoogleListo) return '';
    var redirectTo = window.AIE_RUNTIME ? window.AIE_RUNTIME.currentPageUrl('') : window.location.origin + window.location.pathname;
    return supabase.url.replace(/\/+$/, '') + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(redirectTo);
  }

  function renderSession() {
    var box = $('qrSessionBox');
    var login = $('qrLoginGoogle');
    var logout = $('qrLogout');
    if (!box || !login || !logout) return;
    login.disabled = !loginUrl();
    logout.disabled = !accessToken;
    box.innerHTML = '';
    var profile = state && state.perfil;
    if (profile) {
      var name = document.createElement('strong');
      name.textContent = profile.nombre || profile.email;
      var detail = document.createElement('span');
      detail.textContent = profile.email + ' | ' + profile.rol;
      box.appendChild(name);
      box.appendChild(detail);
      return;
    }
    box.textContent = accessToken
      ? 'Sesion detectada, pendiente de autorizacion en Perfiles y roles.'
      : 'Sin sesion. Inicie sesion con una cuenta autorizada.';
  }

  function activityMeta(activity) {
    var parts = [];
    if (activity.grado) parts.push('Grado ' + activity.grado);
    if (activity.area) parts.push(activity.area);
    if (activity.tipo) parts.push('Tipo ' + activity.tipo);
    if (activity.estado) parts.push('Estado ' + activity.estado);
    parts.push(activity.disponible ? 'disponible' : 'no disponible');
    return parts.join(' | ');
  }

  function canUseQr() {
    var profile = state && state.perfil || {};
    var permissions = profile.permisos || {};
    return profile.puede_usar_lector_qr === true || permissions.puede_usar_lector_qr === true;
  }

  function renderActivities() {
    var select = $('qrActivitySelect');
    if (!select) return;
    select.innerHTML = '';
    if (!state || !state.autorizado || !canUseQr()) {
      var option = document.createElement('option');
      option.value = '';
      option.textContent = state && state.autorizado ? 'Sin permiso para lector QR' : 'Inicie sesion con cuenta autorizada';
      select.appendChild(option);
      select.disabled = true;
      return;
    }
    if (Array.isArray(state.actividades) && state.actividades.length) {
      activities = state.actividades;
    }
    if (!activities.length) {
      var empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'No hay actividades registradas';
      select.appendChild(empty);
      select.disabled = true;
      return;
    }
    select.disabled = false;
    activities.forEach(function (activity) {
      var option = document.createElement('option');
      option.value = activity.id;
      option.textContent = (activity.titulo || activity.codigo || activity.id) + ' - ' + activityMeta(activity);
      select.appendChild(option);
    });
  }

  function selectedActivity() {
    var select = $('qrActivitySelect');
    var id = select ? select.value : '';
    for (var i = 0; i < activities.length; i++) {
      if (activities[i].id === id) return activities[i];
    }
    return null;
  }

  function loadQrActivities() {
    api('GET', '/api/portal-docente/actividades?disponible=true', null, function (err, data) {
      if (err) {
        activities = [];
        renderActivities();
        setStatus(err.error || 'No se pudieron cargar actividades para el lector QR.', true);
        return;
      }
      activities = data && data.actividades || [];
      renderActivities();
      setStatus(activities.length
        ? 'Sesion autorizada. Seleccione actividad y lea QR.'
        : 'No hay actividades disponibles para el lector QR.', !activities.length);
    }, true);
  }

  function showCameraWarning(text) {
    var box = $('qrCameraWarning');
    if (!box) return;
    box.textContent = text || '';
    box.className = text ? 'portal-warning' : 'portal-warning hidden';
  }

  function parseQrText(text) {
    var raw = clean(text);
    if (!raw) throw new Error('QR vacio.');
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error('El QR no contiene JSON valido.');
    }
  }

  function numberField(payload, names, label) {
    for (var i = 0; i < names.length; i++) {
      if (payload[names[i]] !== undefined && payload[names[i]] !== null && payload[names[i]] !== '') {
        var number = Number(payload[names[i]]);
        if (Number.isFinite(number)) return number;
      }
    }
    throw new Error('Falta ' + label + ' valido.');
  }

  function studentField(payload) {
    var id = clean(payload.id || payload.id_alumno || payload.alumno || payload.alumno_id);
    if (!id) throw new Error('Falta ID de alumno en el QR.');
    return id;
  }

  function randomUuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return '';
  }

  function resultPayloadFromQr(qr) {
    if (!canUseQr()) throw new Error('Su perfil no tiene permiso para usar el lector QR.');
    var activity = selectedActivity();
    if (!activity) throw new Error('Seleccione una actividad antes de leer el QR.');
    return {
      actividad_id: activity.id,
      intento_id: randomUuid(),
      id_alumno: studentField(qr),
      tipo_actividad: qr.tipo || activity.tipo || '',
      titulo: qr.tit || qr.titulo || activity.titulo || '',
      correctos: numberField(qr, ['pts', 'correctos', 'correctas', 'puntaje'], 'correctos'),
      incorrectos: numberField(qr, ['err', 'incorrectos', 'incorrectas'], 'incorrectos'),
      cantidad_ejercicios: numberField(qr, ['ej', 'cantidad_ejercicios', 'total'], 'cantidad de ejercicios'),
      nota: numberField(qr, ['nota', 'n'], 'nota'),
      tiempo_minutos: numberField(qr, ['m', 'tiempo_minutos', 'tiempoMinutos'], 'tiempo en minutos')
    };
  }

  function validateNumber(value, label, min, max, integer) {
    var number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) {
      throw new Error(label + ' invalido.');
    }
    if (integer && Math.round(number) !== number) {
      throw new Error(label + ' debe ser entero.');
    }
    return number;
  }

  function manualInputNumber(id) {
    var input = $(id);
    return input ? clean(input.value) : '';
  }

  function roundedGrade(correctos, total) {
    var value = Math.round((correctos / total) * 10 * 100) / 100;
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  function syncManualGrade() {
    var totalText = manualInputNumber('qrManualTotal');
    var correctText = manualInputNumber('qrManualCorrect');
    var incorrectInput = $('qrManualIncorrect');
    var gradeInput = $('qrManualGrade');
    var total = Number(totalText);
    var correctos = Number(correctText);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(correctos) || correctos < 0) {
      if (gradeInput) gradeInput.value = '';
      return;
    }
    if (incorrectInput && !clean(incorrectInput.value) && correctos <= total) {
      incorrectInput.value = String(total - correctos);
    }
    if (gradeInput) {
      gradeInput.value = roundedGrade(correctos, total);
    }
  }

  function resultPayloadFromManualFields() {
    if (!canUseQr()) throw new Error('Su perfil no tiene permiso para usar el lector QR.');
    var activity = selectedActivity();
    if (!activity) throw new Error('Seleccione una actividad antes de cargar el resultado.');
    syncManualGrade();
    var idAlumno = clean($('qrManualStudent') && $('qrManualStudent').value);
    if (!idAlumno) throw new Error('Falta ID de alumno.');
    return {
      actividad_id: activity.id,
      intento_id: randomUuid(),
      id_alumno: idAlumno,
      tipo_actividad: activity.tipo || '',
      titulo: activity.titulo || '',
      correctos: validateNumber(manualInputNumber('qrManualCorrect'), 'correctos', 0, 200, true),
      incorrectos: validateNumber(manualInputNumber('qrManualIncorrect'), 'incorrectos', 0, 200, true),
      cantidad_ejercicios: validateNumber(manualInputNumber('qrManualTotal'), 'cantidad_ejercicios', 1, 200, true),
      nota: validateNumber(manualInputNumber('qrManualGrade'), 'nota', 0, 10, false),
      tiempo_minutos: validateNumber(manualInputNumber('qrManualMinutes'), 'tiempo_minutos', 0, 600, false)
    };
  }

  function validateResultPayload(payload) {
    var activityId = clean(payload.actividad_id);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(activityId)) {
      throw new Error('Falta actividad_id valido.');
    }
    var studentId = clean(payload.id_alumno);
    if (!studentId) throw new Error('Falta ID de alumno.');
    var total = validateNumber(payload.cantidad_ejercicios, 'cantidad_ejercicios', 1, 200, true);
    var correctos = validateNumber(payload.correctos, 'correctos', 0, 200, true);
    var incorrectos = validateNumber(payload.incorrectos, 'incorrectos', 0, 200, true);
    if (correctos + incorrectos !== total) {
      throw new Error('correctos + incorrectos debe coincidir con cantidad_ejercicios.');
    }
    var nota = validateNumber(payload.nota, 'nota', 0, 10, false);
    var expected = Math.round((correctos / total) * 10 * 100) / 100;
    if (Math.abs(nota - expected) > 0.011) {
      throw new Error('nota no coincide con correctos/cantidad_ejercicios.');
    }
    var minutes = validateNumber(payload.tiempo_minutos, 'tiempo_minutos', 0, 600, false);
    return {
      ok: true,
      resultado: {
        actividad_id: activityId,
        intento_id: payload.intento_id || '',
        id_alumno: studentId,
        cantidad_ejercicios: total,
        correctos: correctos,
        incorrectos: incorrectos,
        nota: nota,
        tiempo_minutos: minutes
      }
    };
  }

  function renderResult(payload, validated) {
    var box = $('qrResultBox');
    if (!box) return;
    box.innerHTML = '';
    if (!payload) {
      box.textContent = 'Todavia no hay QR leido.';
      return;
    }
    var rows = [
      ['Alumno', payload.id_alumno],
      ['Actividad', (selectedActivity() && selectedActivity().titulo) || payload.actividad_id],
      ['Ejercicios', payload.cantidad_ejercicios],
      ['Correctos', payload.correctos],
      ['Incorrectos', payload.incorrectos],
      ['Nota', payload.nota],
      ['Tiempo', payload.tiempo_minutos + ' minutos']
    ];
    rows.forEach(function (row) {
      var line = document.createElement('div');
      line.className = 'qr-result-row';
      line.innerHTML = '<strong></strong><span></span>';
      line.querySelector('strong').textContent = row[0];
      line.querySelector('span').textContent = row[1];
      box.appendChild(line);
    });
    if (validated) {
      var ok = document.createElement('div');
      ok.className = 'result-ok';
      ok.textContent = 'Resultado validado localmente. Listo para enviar.';
      box.appendChild(ok);
    }
  }

  function handleQrText(text) {
    var payload;
    try {
      payload = resultPayloadFromQr(parseQrText(text));
    } catch (err) {
      selectedPayload = null;
      renderResult(null);
      setStatus(err.message, true);
      return;
    }
    api('POST', '/api/resultados/validar', payload, function (err) {
      if (err) {
        selectedPayload = null;
        renderResult(payload, false);
        setStatus(err.error || 'El resultado del QR no paso la validacion.', true);
        return;
      }
      selectedPayload = payload;
      renderResult(payload, true);
      setStatus('QR leido y validado.');
      stopCamera();
    });
  }

  function handleManualFields() {
    var payload;
    try {
      payload = resultPayloadFromManualFields();
    } catch (err) {
      selectedPayload = null;
      renderResult(null);
      setStatus(err.message, true);
      return;
    }
    api('POST', '/api/resultados/validar', payload, function (err) {
      if (err) {
        selectedPayload = null;
        renderResult(payload, false);
        setStatus(err.error || 'El resultado manual no paso la validacion.', true);
        return;
      }
      selectedPayload = payload;
      renderResult(payload, true);
      setStatus('Resultado manual validado. Listo para enviar.');
      stopCamera();
    });
  }

  function startCamera() {
    if (!canUseQr()) {
      setStatus('Su perfil no tiene permiso para usar el lector QR.', true);
      return;
    }
    if (!selectedActivity()) {
      setStatus('Seleccione una actividad antes de iniciar la camara.', true);
      return;
    }
    if (!window.isSecureContext) {
      showCameraWarning('La camara del telefono requiere HTTPS o localhost. En HTTP por IP puede quedar bloqueada; use el modo manual o sirva esta PWA con HTTPS.');
    } else {
      showCameraWarning('');
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showCameraWarning('Este navegador no permite acceso a camara desde esta pagina. Use modo manual.');
      return;
    }
    if (!('BarcodeDetector' in window)) {
      showCameraWarning('Este navegador no tiene BarcodeDetector para leer QR. Use modo manual o Chrome/Edge Android.');
      return;
    }
    detector = detector || new BarcodeDetector({ formats: ['qr_code'] });
    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' }
      },
      audio: false
    }).then(function (mediaStream) {
      stream = mediaStream;
      var video = $('qrVideo');
      video.srcObject = mediaStream;
      video.play();
      scanning = true;
      setStatus('Camara activa. Apunte al QR del resumen final.');
      scanLoop();
    }).catch(function (err) {
      showCameraWarning('No se pudo abrir la camara: ' + (err && err.message || 'permiso denegado') + '.');
    });
  }

  function scanLoop() {
    if (!scanning || !detector) return;
    var video = $('qrVideo');
    if (!video || video.readyState < 2) {
      window.requestAnimationFrame(scanLoop);
      return;
    }
    detector.detect(video).then(function (codes) {
      if (codes && codes.length && codes[0].rawValue) {
        handleQrText(codes[0].rawValue);
        return;
      }
      window.requestAnimationFrame(scanLoop);
    }).catch(function () {
      window.requestAnimationFrame(scanLoop);
    });
  }

  function stopCamera() {
    scanning = false;
    if (stream) {
      stream.getTracks().forEach(function (track) { track.stop(); });
      stream = null;
    }
    var video = $('qrVideo');
    if (video) video.srcObject = null;
  }

  function sendResult() {
    if (!selectedPayload) {
      setStatus('No hay resultado validado para enviar.', true);
      return;
    }
    if (!accessToken) {
      setStatus('Debe iniciar sesion con cuenta autorizada antes de enviar.', true);
      return;
    }
    if (!canUseQr()) {
      setStatus('Su perfil no tiene permiso para usar el lector QR.', true);
      return;
    }
    api('POST', '/api/lector-qr/resultados', selectedPayload, function (err) {
      if (err) {
        setStatus(err.error || 'No se pudo registrar el resultado.', true);
        return;
      }
      setStatus('Resultado enviado y registrado.');
      selectedPayload = null;
      renderResult(null);
    }, true);
  }

  function loadState() {
    api('GET', '/api/portal-docente/estado', null, function (err, data) {
      if (err) {
        state = null;
        renderSession();
        renderActivities();
        setStatus(err.error || 'No se pudo validar la sesion.', true);
        return;
      }
      state = data || {};
      renderSession();
      renderActivities();
      if (state.autorizado && canUseQr()) {
        if (!activities.length) {
          setStatus('Cargando actividades para el lector QR.');
          loadQrActivities();
        } else {
          setStatus('Sesion autorizada. Seleccione actividad y lea QR.');
        }
      } else if (state.autorizado) {
        setStatus('Sesion autorizada, pero sin permiso para lector QR.', true);
      } else {
        setStatus('Inicie sesion con una cuenta autorizada.', true);
      }
    }, true);
  }

  function loadConfig() {
    captureTokenFromHash();
    loadStoredToken();
    api('GET', '/api/portal-docente/config', null, function (err, data) {
      if (err) {
        setStatus(err.error || 'No se pudo cargar configuracion.', true);
        return;
      }
      config = data;
      renderSession();
      loadState();
    });
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('aie-hub-sw.js', { scope: './' }).catch(function () {});
    }
  }

  function bind() {
    $('qrLoginGoogle').onclick = function () {
      var url = loginUrl();
      if (!url) {
        setStatus('Login Google no disponible.', true);
        return;
      }
      window.location.href = url;
    };
    $('qrLogout').onclick = function () {
      clearToken();
      stopCamera();
      selectedPayload = null;
      renderResult(null);
      loadConfig();
    };
    $('qrStartCamera').onclick = startCamera;
    $('qrStopCamera').onclick = stopCamera;
    $('qrReadManual').onclick = function () {
      handleQrText($('qrManualText').value);
    };
    $('qrReadManualFields').onclick = handleManualFields;
    ['qrManualTotal', 'qrManualCorrect', 'qrManualIncorrect'].forEach(function (id) {
      var input = $(id);
      if (input) input.oninput = syncManualGrade;
    });
    $('qrSendResult').onclick = sendResult;
    $('qrClearResult').onclick = function () {
      selectedPayload = null;
      renderResult(null);
      setStatus('Resultado limpiado.');
    };
    window.addEventListener('beforeunload', stopCamera);
  }

  bind();
  registerServiceWorker();
  loadConfig();
}());
