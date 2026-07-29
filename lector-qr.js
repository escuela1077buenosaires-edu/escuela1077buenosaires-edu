(function () {
  var sessionKey = 'aieQr1077AccessToken';
  var sharedSessionKeys = [sessionKey, 'aiePortal1077AccessToken'];
  var accessToken = '';
  var config = null;
  var state = null;
  var activities = [];
  var thirdPartyActivities = [];
  var selectedPayload = null;
  var stream = null;
  var scanning = false;
  var detector = null;
  var scanCanvas = null;
  var qrProcessing = false;
  var jsQrTimer = null;
  var deferredInstallPrompt = null;
  var pendingQrData = null;
  var lastResultError = '';
  var resultSubmitting = false;
  var resultSubmitted = false;

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

  function setSendStatus(text, kind) {
    var box = $('qrSendStatus');
    if (!box) return;
    box.textContent = text || '';
    box.className = 'qr-send-status' + (kind ? ' ' + kind : '');
  }

  function syncSendButton() {
    var button = $('qrSendResult');
    if (!button) return;
    button.disabled = !selectedPayload || resultSubmitting || resultSubmitted;
  }

  function resetSubmissionState(clearStatus) {
    resultSubmitting = false;
    resultSubmitted = false;
    if (clearStatus !== false) setSendStatus('');
    syncSendButton();
  }

  function rpc(functionName, payload, callback, authenticated) {
    if (!window.AIE_RUNTIME || !window.AIE_RUNTIME.supabaseReady()) {
      window.setTimeout(function () {
        var message = window.AIE_RUNTIME ? window.AIE_RUNTIME.supabaseUnavailableMessage() : 'Falta configuracion de Base de Datos.';
        callback({ error: clean(message).replace(/Supabase/g, 'Base de Datos') });
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
      if (method === 'GET' && path.indexOf('/api/indice-alumnos') === 0) {
        return rpc('aie_1077_indice_alumnos', {
          p_buscar: '',
          p_titulo: '',
          p_area: '',
          p_archivo: '',
          p_grado: '',
          p_tipo: '',
          p_listar_todas: true
        }, callback, false);
      }
      if (method === 'GET' && path.indexOf('/api/lector-qr/actividades-terceros') === 0) {
        return rpc('aie_1077_actividades_terceros_listar', {
          p_buscar: '',
          p_titulo: '',
          p_area: '',
          p_recurso: '',
          p_grado: '',
          p_tipo: '',
          p_activo: true,
          p_disponible: true,
          p_listar_todas: true
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

  function persistentStorage() {
    try {
      return window.localStorage;
    } catch (err) {
      return null;
    }
  }

  function tokenExpired(token) {
    try {
      var parts = String(token || '').split('.');
      if (parts.length < 2) return true;
      var encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (encoded.length % 4) encoded += '=';
      var payload = JSON.parse(window.atob(encoded));
      var exp = Number(payload.exp || 0);
      return !exp || exp * 1000 < Date.now() + 30000;
    } catch (err) {
      return true;
    }
  }

  function saveToken(token) {
    var session = storage();
    var persistent = persistentStorage();
    sharedSessionKeys.forEach(function (key) {
      if (session) session.setItem(key, token);
      if (persistent) persistent.setItem(key, token);
    });
  }

  function captureTokenFromHash() {
    var hash = window.location.hash || '';
    if (hash.indexOf('access_token=') < 0) return false;
    var params = new URLSearchParams(hash.replace(/^#/, ''));
    var token = params.get('access_token') || '';
    if (!token) return false;
    accessToken = token;
    saveToken(token);
    if (window.history && window.history.replaceState) {
      var cleanPath = window.AIE_RUNTIME ? window.AIE_RUNTIME.currentPagePath('') : window.location.pathname;
      window.history.replaceState(null, '', cleanPath);
    }
    return true;
  }

  function loadStoredToken() {
    if (accessToken) return;
    var session = storage();
    var persistent = persistentStorage();
    sharedSessionKeys.some(function (key) {
      accessToken = session ? session.getItem(key) || '' : '';
      if (!accessToken && persistent) accessToken = persistent.getItem(key) || '';
      return !!accessToken;
    });
    if (accessToken && tokenExpired(accessToken)) {
      clearToken();
    } else if (accessToken) {
      saveToken(accessToken);
    }
  }

  function clearToken() {
    accessToken = '';
    var session = storage();
    var persistent = persistentStorage();
    sharedSessionKeys.forEach(function (key) {
      if (session) session.removeItem(key);
      if (persistent) persistent.removeItem(key);
    });
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
    login.disabled = !loginUrl() || !!(state && state.autorizado);
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

  function canUseThirdPartyActivities() {
    var profile = state && state.perfil || {};
    var permissions = profile.permisos || {};
    return profile.puede_usar_actividades_terceros === true ||
      profile.puede_gestionar_actividades_terceros === true ||
      permissions.puede_usar_actividades_terceros === true ||
      permissions.puede_gestionar_actividades_terceros === true;
  }

  function renderSelectOptions(select, list, emptyText) {
    select.innerHTML = '';
    if (!list.length) {
      var empty = document.createElement('option');
      empty.value = '';
      empty.textContent = emptyText;
      select.appendChild(empty);
      select.disabled = true;
      return;
    }
    var first = document.createElement('option');
    first.value = '';
    first.textContent = 'Sin seleccionar';
    select.appendChild(first);
    select.disabled = false;
    list.forEach(function (activity) {
      var option = document.createElement('option');
      option.value = activity.id;
      option.textContent = (activity.titulo || activity.codigo || activity.id) + ' - ' + activityMeta(activity);
      select.appendChild(option);
    });
  }

  function selectedSource() {
    var thirdRadio = $('qrSourceThird');
    return thirdRadio && thirdRadio.checked ? 'tercero' : 'propia';
  }

  function setSourceAvailability() {
    var source = selectedSource();
    var ownSelect = $('qrActivitySelect');
    var thirdSelect = $('qrThirdPartyActivitySelect');
    var ownRadio = $('qrSourceOwn');
    var thirdRadio = $('qrSourceThird');
    var allowed = !!(state && state.autorizado && canUseQr());
    var thirdAllowed = allowed && canUseThirdPartyActivities();
    if (source === 'tercero' && !thirdAllowed && ownRadio) {
      ownRadio.checked = true;
      source = 'propia';
    }
    if (ownRadio) ownRadio.disabled = !allowed;
    if (thirdRadio) thirdRadio.disabled = !thirdAllowed;
    if (source === 'propia') {
      if (thirdSelect) thirdSelect.value = '';
      if (ownSelect) ownSelect.disabled = !allowed || !activities.length;
      if (thirdSelect) thirdSelect.disabled = true;
    } else {
      if (ownSelect) ownSelect.value = '';
      if (ownSelect) ownSelect.disabled = true;
      if (thirdSelect) thirdSelect.disabled = !thirdAllowed || !thirdPartyActivities.length;
    }
  }

  function renderActivities() {
    var select = $('qrActivitySelect');
    var thirdSelect = $('qrThirdPartyActivitySelect');
    if (!select || !thirdSelect) return;
    if (!state || !state.autorizado || !canUseQr()) {
      var option = document.createElement('option');
      option.value = '';
      option.textContent = state && state.autorizado ? 'Sin permiso para lector QR' : 'Inicie sesion con cuenta autorizada';
      var thirdOption = option.cloneNode(true);
      select.innerHTML = '';
      thirdSelect.innerHTML = '';
      select.appendChild(option);
      thirdSelect.appendChild(thirdOption);
      select.disabled = true;
      thirdSelect.disabled = true;
      setSourceAvailability();
      return;
    }
    renderSelectOptions(select, activities, 'No hay actividades propias visibles');
    if (!canUseThirdPartyActivities()) {
      thirdSelect.innerHTML = '';
      var denied = document.createElement('option');
      denied.value = '';
      denied.textContent = 'Sin permiso para actividades de terceros';
      thirdSelect.appendChild(denied);
      thirdSelect.disabled = true;
      setSourceAvailability();
      return;
    }
    renderSelectOptions(thirdSelect, thirdPartyActivities, 'No hay actividades de terceros disponibles');
    setSourceAvailability();
  }

  function selectedActivity() {
    var select = $('qrActivitySelect');
    var thirdSelect = $('qrThirdPartyActivitySelect');
    var source = selectedSource();
    var id = select ? select.value : '';
    var thirdId = thirdSelect ? thirdSelect.value : '';
    if (source === 'propia') {
      for (var i = 0; i < activities.length; i++) {
        if (activities[i].id === id) return activities[i];
      }
      return null;
    }
    for (var j = 0; j < thirdPartyActivities.length; j++) {
      if (thirdPartyActivities[j].id === thirdId) return thirdPartyActivities[j];
    }
    return null;
  }

  function selectedActivityPayload(activity) {
    var payload = {};
    if (!activity) return payload;
    if (activity.origen === 'tercero') {
      payload.actividad_tercero_id = activity.id;
      payload.actividad_origen = 'tercero';
    } else {
      payload.actividad_id = activity.id;
      payload.actividad_origen = 'propia';
    }
    return payload;
  }

  function setActivityStatusAfterLoads() {
    var total = activities.length + thirdPartyActivities.length;
    setStatus(total
      ? 'Sesion autorizada. Actividades propias: ' + activities.length +
        '. Actividades de terceros: ' + thirdPartyActivities.length + '.'
      : 'No hay actividades disponibles para el lector QR.', !total);
  }

  function loadQrActivities() {
    api('GET', '/api/indice-alumnos?listar_todas=true', null, function (err, data) {
      if (err) {
        activities = [];
        renderActivities();
        setStatus(err.error || 'No se pudieron cargar actividades para el lector QR.', true);
      } else {
        activities = data && data.actividades || [];
      }
      renderActivities();
      if (!canUseThirdPartyActivities()) {
        setActivityStatusAfterLoads();
        return;
      }
      api('GET', '/api/lector-qr/actividades-terceros?listar_todas=true', null, function (thirdErr, thirdData) {
        if (thirdErr) {
          thirdPartyActivities = [];
          renderActivities();
          setStatus(thirdErr.error || 'No se pudieron cargar actividades de terceros.', true);
          return;
        }
        thirdPartyActivities = thirdData && thirdData.actividades || [];
        renderActivities();
        setActivityStatusAfterLoads();
      }, true);
    }, true);
  }

  function showCameraWarning(text) {
    var box = $('qrCameraWarning');
    if (!box) return;
    box.textContent = text || '';
    box.className = text ? 'portal-warning' : 'portal-warning hidden';
  }

  function createQrDetector() {
    if (!('BarcodeDetector' in window)) return null;
    try {
      detector = detector || new BarcodeDetector({ formats: ['qr_code'] });
      return detector;
    } catch (err) {
      return null;
    }
  }

  function hasJsQrDecoder() {
    return typeof window.jsQR === 'function';
  }

  function scheduleNativeScan() {
    if (scanning && detector && !qrProcessing) {
      window.requestAnimationFrame(scanLoop);
    }
  }

  function scheduleJsQrScan() {
    if (!scanning || !hasJsQrDecoder() || qrProcessing) return;
    window.clearTimeout(jsQrTimer);
    jsQrTimer = window.setTimeout(jsQrScanLoop, 160);
  }

  function acceptDetectedQr(rawValue) {
    if (!rawValue || qrProcessing) return false;
    var accepted = handleQrText(rawValue);
    if (accepted) {
      qrProcessing = true;
      scanning = false;
      window.clearTimeout(jsQrTimer);
    }
    return accepted;
  }

  function parseQrText(text) {
    var raw = String(text == null ? '' : text)
      .replace(/^\uFEFF/, '')
      .replace(/[\u200B-\u200D\u2060]/g, '')
      .trim();
    if (!raw) throw new Error('QR vacio.');

    var candidates = [raw];
    try {
      var decoded = decodeURIComponent(raw);
      if (decoded !== raw) candidates.push(decoded);
    } catch (decodeErr) {}

    candidates.slice().forEach(function (candidate) {
      var firstBrace = candidate.indexOf('{');
      var lastBrace = candidate.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        candidates.push(candidate.slice(firstBrace, lastBrace + 1));
      }
      try {
        var url = new URL(candidate);
        ['payload', 'data', 'qr', 'resultado'].forEach(function (key) {
          var value = url.searchParams.get(key);
          if (value) candidates.push(value);
        });
      } catch (urlErr) {}
    });

    for (var i = 0; i < candidates.length; i++) {
      try {
        return JSON.parse(candidates[i]);
      } catch (jsonErr) {}
    }

    var legacy = {};
    raw.split(/[\r\n;|]+/).forEach(function (part) {
      var match = part.match(/^\s*([^:=]+?)\s*[:=]\s*(.*?)\s*$/);
      if (!match) return;
      var key = match[1].toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '');
      var value = match[2];
      if (key === 'id' || key === 'idalumno' || key === 'alumno') legacy.id = value;
      else if (key === 'actividad' || key === 'titulo') legacy.tit = value;
      else if (key === 'tipo') legacy.tipo = value;
      else if (key === 'cantidad' || key === 'cant' || key === 'ejercicios' || key === 'cantidaddeejercicios') legacy.ej = value;
      else if (key === 'ok' || key === 'correctos' || key === 'correctas' || key === 'aciertos') legacy.pts = value;
      else if (key === 'err' || key === 'incorrectos' || key === 'incorrectas' || key === 'errores') legacy.err = value;
      else if (key === 'nota' || key === 'calificacion') legacy.nota = value;
      else if (key === 't/m' || key === 'tm' || key === 'tiempo' || key === 'minutos' || key === 'tiempominutos') legacy.m = value;
    });
    if (legacy.id && legacy.ej !== undefined && legacy.pts !== undefined &&
        legacy.err !== undefined && legacy.nota !== undefined && legacy.m !== undefined) {
      return legacy;
    }
    throw new Error('El QR fue detectado, pero su contenido no tiene un formato de resultados reconocido.');
  }

  function rememberRawQrText(text) {
    var input = $('qrManualText');
    if (input) input.value = String(text == null ? '' : text);
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
    if (!/^\d{1,2}$/.test(id)) throw new Error('ID de alumno debe tener 1 o 2 digitos.');
    return id;
  }

  function randomUuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return '';
  }

  function basePayloadFromQr(qr) {
    if (!canUseQr()) throw new Error('Su perfil no tiene permiso para usar el lector QR.');
    return {
      id_alumno: studentField(qr),
      tipo_actividad: qr.tipo || qr.tipo_actividad || '',
      titulo: qr.tit || qr.titulo || '',
      correctos: numberField(qr, ['pts', 'correctos', 'correctas', 'puntaje', 'ok', 'aciertos'], 'correctos'),
      incorrectos: numberField(qr, ['err', 'incorrectos', 'incorrectas', 'errores'], 'incorrectos'),
      cantidad_ejercicios: numberField(qr, ['ej', 'cantidad_ejercicios', 'total', 'cantidad', 'cant', 'ejercicios'], 'cantidad de ejercicios'),
      nota: numberField(qr, ['nota', 'n', 'calificacion'], 'nota'),
      tiempo_minutos: numberField(qr, ['m', 'tiempo_minutos', 'tiempoMinutos', 'minutos', 'tiempo', 'tm'], 'tiempo en minutos')
    };
  }

  function attachSelectedActivityPayload(base) {
    var activity = selectedActivity();
    if (!activity) {
      throw new Error('QR leido. Seleccione una actividad registrada antes de validar o enviar el resultado.');
    }
    return Object.assign(selectedActivityPayload(activity), base, {
      intento_id: randomUuid(),
      tipo_actividad: base.tipo_actividad || activity.tipo || '',
      titulo: base.titulo || activity.titulo || ''
    });
  }

  function resultPayloadFromQr(qr) {
    return attachSelectedActivityPayload(basePayloadFromQr(qr));
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
    if (!/^\d{1,2}$/.test(idAlumno)) throw new Error('ID de alumno debe tener 1 o 2 digitos.');
    var correctos = validateNumber(manualInputNumber('qrManualCorrect'), 'correctos', 0, 200, true);
    var incorrectos = validateNumber(manualInputNumber('qrManualIncorrect'), 'incorrectos', 0, 200, true);
    var total = validateNumber(manualInputNumber('qrManualTotal'), 'cantidad_ejercicios', 1, 200, true);
    var nota = Number(roundedGrade(correctos, total));
    if (correctos + incorrectos !== total) {
      throw new Error('correctos + incorrectos debe coincidir con cantidad_ejercicios.');
    }
    var gradeInput = $('qrManualGrade');
    if (gradeInput) gradeInput.value = roundedGrade(correctos, total);
    return Object.assign(selectedActivityPayload(activity), {
      intento_id: randomUuid(),
      id_alumno: idAlumno,
      tipo_actividad: activity.tipo || '',
      titulo: activity.titulo || '',
      correctos: correctos,
      incorrectos: incorrectos,
      cantidad_ejercicios: total,
      nota: nota,
      tiempo_minutos: validateNumber(manualInputNumber('qrManualMinutes'), 'tiempo_minutos', 0, 600, false)
    });
  }

  function validateResultPayload(payload) {
    var activityId = clean(payload.actividad_id);
    var thirdPartyActivityId = clean(payload.actividad_tercero_id);
    var ownValid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(activityId);
    var thirdValid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(thirdPartyActivityId);
    if ((ownValid ? 1 : 0) + (thirdValid ? 1 : 0) !== 1) {
      throw new Error('Seleccione una actividad propia o una actividad de terceros valida.');
    }
    var studentId = clean(payload.id_alumno);
    if (!/^\d{1,2}$/.test(studentId)) throw new Error('ID de alumno debe tener 1 o 2 digitos.');
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
        actividad_tercero_id: thirdPartyActivityId,
        actividad_origen: thirdValid ? 'tercero' : 'propia',
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
      box.textContent = 'Todavía no hay QR leído.';
      return;
    }
    var table = document.createElement('div');
    table.className = 'qr-result-table';
    var headers = ['ID', 'Actividad', 'Cant.', 'OK', 'Err.', 'Nota', 'T/m'];
    var values = [
      payload.id_alumno,
      payload.titulo || (selectedActivity() && selectedActivity().titulo) || payload.actividad_id || payload.actividad_tercero_id,
      payload.cantidad_ejercicios,
      payload.correctos,
      payload.incorrectos,
      payload.nota,
      payload.tiempo_minutos
    ];
    headers.forEach(function (header) {
      var cell = document.createElement('strong');
      cell.textContent = header;
      table.appendChild(cell);
    });
    values.forEach(function (value, index) {
      var cell = document.createElement('span');
      cell.className = index === 1 ? 'qr-result-activity' : '';
      cell.textContent = value == null || value === '' ? '-' : value;
      table.appendChild(cell);
    });
    box.appendChild(table);
    if (validated) {
      var ok = document.createElement('div');
      ok.className = 'result-ok';
      ok.textContent = 'Resultado validado localmente. Para guardarlo, presione Enviar Resultado a base de datos.';
      box.appendChild(ok);
    }
  }

  function handleQrText(text) {
    var payload;
    lastResultError = '';
    selectedPayload = null;
    resetSubmissionState();
    rememberRawQrText(text);
    try {
      pendingQrData = parseQrText(text);
      payload = attachSelectedActivityPayload(basePayloadFromQr(pendingQrData));
    } catch (err) {
      selectedPayload = null;
      syncSendButton();
      lastResultError = err.message || 'El contenido del QR no es válido.';
      if (pendingQrData) {
        try {
          renderResult(basePayloadFromQr(pendingQrData), false);
          stopCamera();
          setStatus(err.message, true);
          return true;
        } catch (renderErr) {
          renderResult(null);
        }
      } else {
        renderResult(null);
      }
      setStatus(err.message, true);
      return false;
    }
    api('POST', '/api/resultados/validar', payload, function (err) {
      if (err) {
        selectedPayload = null;
        syncSendButton();
        lastResultError = err.error || 'El resultado del QR no pasó la validación.';
        renderResult(payload, false);
        setStatus(lastResultError, true);
        return;
      }
      selectedPayload = payload;
      resetSubmissionState();
      pendingQrData = null;
      lastResultError = '';
      renderResult(payload, true);
      setStatus('QR leído y validado. Para guardarlo, presione Enviar Resultado a base de datos.');
      stopCamera();
    });
    return true;
  }

  function handleManualFields() {
    var payload;
    selectedPayload = null;
    resetSubmissionState();
    try {
      payload = resultPayloadFromManualFields();
    } catch (err) {
      selectedPayload = null;
      syncSendButton();
      renderResult(null);
      setStatus(err.message, true);
      return;
    }
    api('POST', '/api/resultados/validar', payload, function (err) {
      if (err) {
        selectedPayload = null;
        syncSendButton();
        renderResult(payload, false);
        setStatus(err.error || 'El resultado manual no paso la validacion.', true);
        return;
      }
      selectedPayload = payload;
      resetSubmissionState();
      renderResult(payload, true);
      setStatus('Resultado manual validado. Para guardarlo, presione Enviar Resultado a base de datos.');
      stopCamera();
    });
  }

  function startCamera() {
    if (!canUseQr()) {
      setStatus('Su perfil no tiene permiso para usar el lector QR.', true);
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showCameraWarning('Este navegador no permite acceso a cámara desde esta página. Use modo manual.');
      return;
    }
    var activeDetector = createQrDetector();
    var activeJsQr = hasJsQrDecoder();
    var warnings = [];
    if (!window.isSecureContext) {
      warnings.push('La cámara del teléfono requiere HTTPS o localhost. En HTTP por IP puede quedar bloqueada.');
    }
    if (!activeDetector && !activeJsQr) {
      warnings.push('Este navegador puede abrir la cámara, pero no tiene lector QR automático. Use el modo avanzado/manual o Chrome/Edge Android.');
    }
    showCameraWarning(warnings.join(' '));
    stopCamera();
    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' }
      },
      audio: false
    }).then(function (mediaStream) {
      stream = mediaStream;
      var video = $('qrVideo');
      video.srcObject = mediaStream;
      qrProcessing = false;
      var playPromise = video.play();
      scanning = !!(activeDetector || activeJsQr);
      setStatus(scanning
        ? 'Cámara activa. Apunte al QR del resumen final.'
        : 'Cámara activa, pero este navegador no decodifica QR automáticamente. Use modo manual o Chrome/Edge Android.',
        !scanning);
      var beginScanning = function () {
        if (activeDetector) scheduleNativeScan();
        if (activeJsQr) scheduleJsQrScan();
      };
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.then(beginScanning).catch(beginScanning);
      } else {
        beginScanning();
      }
    }).catch(function (err) {
      showCameraWarning('No se pudo abrir la cámara: ' + (err && err.message || 'permiso denegado') + '.');
      setStatus('No se pudo abrir la cámara. Revise permisos del navegador o use modo manual.', true);
    });
  }

  function scanLoop() {
    if (!scanning || !detector || qrProcessing) return;
    var video = $('qrVideo');
    if (!video || video.readyState < 2) {
      scheduleNativeScan();
      return;
    }
    detector.detect(video).then(function (codes) {
      if (codes && codes.length && codes[0].rawValue) {
        if (acceptDetectedQr(codes[0].rawValue)) return;
      }
      scheduleNativeScan();
    }).catch(function () {
      scheduleNativeScan();
    });
  }

  function decodeQrBinaryText(binaryData) {
    if (!binaryData || !binaryData.length) return '';
    var bytes = binaryData instanceof Uint8Array ? binaryData : new Uint8Array(binaryData);
    if (window.TextDecoder) {
      try {
        var utf8Text = new window.TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (utf8Text) return utf8Text;
      } catch (utf8Err) {}
      try {
        var latinText = new window.TextDecoder('windows-1252').decode(bytes);
        if (latinText) return latinText;
      } catch (latinErr) {}
    }
    var text = '';
    for (var i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
    return text;
  }

  function decodeVideoWithJsQr(video) {
    if (!hasJsQrDecoder() || !video || !video.videoWidth || !video.videoHeight) return '';
    scanCanvas = scanCanvas || document.createElement('canvas');
    var sourceWidth = video.videoWidth;
    var sourceHeight = video.videoHeight;
    var crops = [1, 0.78, 0.58];
    for (var i = 0; i < crops.length; i++) {
      var ratio = crops[i];
      var cropWidth = Math.max(1, Math.round(sourceWidth * ratio));
      var cropHeight = Math.max(1, Math.round(sourceHeight * ratio));
      var sourceX = Math.round((sourceWidth - cropWidth) / 2);
      var sourceY = Math.round((sourceHeight - cropHeight) / 2);
      var scale = Math.min(1, 960 / cropWidth);
      var width = Math.max(1, Math.round(cropWidth * scale));
      var height = Math.max(1, Math.round(cropHeight * scale));
      scanCanvas.width = width;
      scanCanvas.height = height;
      var context = scanCanvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(video, sourceX, sourceY, cropWidth, cropHeight, 0, 0, width, height);
      var image = context.getImageData(0, 0, width, height);
      var decoded = window.jsQR(image.data, width, height, { inversionAttempts: 'attemptBoth' });
      if (decoded) {
        var decodedText = String(decoded.data || '');
        if ((!decodedText || decodedText.indexOf('\uFFFD') >= 0) && decoded.binaryData) {
          decodedText = decodeQrBinaryText(decoded.binaryData);
        }
        if (decodedText) return decodedText;
      }
    }
    return '';
  }

  function jsQrScanLoop() {
    if (!scanning || !hasJsQrDecoder() || qrProcessing) return;
    var video = $('qrVideo');
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      scheduleJsQrScan();
      return;
    }
    try {
      var rawValue = decodeVideoWithJsQr(video);
      if (rawValue && acceptDetectedQr(rawValue)) return;
    } catch (err) {}
    scheduleJsQrScan();
  }

  function stopCamera() {
    scanning = false;
    qrProcessing = false;
    window.clearTimeout(jsQrTimer);
    jsQrTimer = null;
    if (stream) {
      stream.getTracks().forEach(function (track) { track.stop(); });
      stream = null;
    }
    var video = $('qrVideo');
    if (video) video.srcObject = null;
  }

  function sendResult() {
    if (resultSubmitting || resultSubmitted) return;
    if (!selectedPayload) {
      var missingMessage = lastResultError
        ? 'No se puede enviar: ' + lastResultError
        : 'No hay resultado validado para enviar.';
      setSendStatus(missingMessage, 'error');
      setStatus(missingMessage, true);
      return;
    }
    if (!accessToken) {
      setSendStatus('Debe iniciar sesión con una cuenta autorizada antes de enviar.', 'error');
      setStatus('Debe iniciar sesion con cuenta autorizada antes de enviar.', true);
      return;
    }
    if (!canUseQr()) {
      setSendStatus('Su perfil no tiene permiso para usar el lector QR.', 'error');
      setStatus('Su perfil no tiene permiso para usar el lector QR.', true);
      return;
    }
    resultSubmitting = true;
    syncSendButton();
    setSendStatus('Enviando resultado...', 'pending');
    api('POST', '/api/lector-qr/resultados', selectedPayload, function (err) {
      if (err) {
        var errorMessage = err.error || 'No se pudo registrar el resultado.';
        resultSubmitting = false;
        syncSendButton();
        setSendStatus(errorMessage, 'error');
        setStatus(errorMessage, true);
        return;
      }
      resultSubmitting = false;
      resultSubmitted = true;
      syncSendButton();
      renderResult(selectedPayload, false);
      setSendStatus('Resultado enviado y registrado. Presione Limpiar para cargar otro resultado.', 'success');
      setStatus('Resultado enviado y registrado.');
    }, true);
  }

  function loadState() {
    api('GET', '/api/portal-docente/estado', null, function (err, data) {
      if (err) {
        if (/jwt|token|expired|expir/i.test(err.error || err.message || '')) {
          clearToken();
        }
        state = null;
        activities = [];
        thirdPartyActivities = [];
        renderSession();
        renderActivities();
        setStatus(err.error || 'No se pudo validar la sesion.', true);
        return;
      }
      state = data || {};
      activities = [];
      thirdPartyActivities = [];
      renderSession();
      renderActivities();
      if (state.autorizado && canUseQr()) {
        setStatus('Cargando actividades visibles para el lector QR.');
        loadQrActivities();
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
      navigator.serviceWorker.register('lector-qr-sw.js', { scope: './' }).catch(function () {});
    }
  }

  function lectorUrl() {
    return window.location.origin + window.location.pathname + '?login=1';
  }

  function setInstallButtonState() {
    var button = $('qrInstallPwa');
    if (!button) return;
    button.disabled = !deferredInstallPrompt;
  }

  function installPwaShortcut() {
    if (!deferredInstallPrompt) {
      setStatus('Si el botón Instalar no está disponible, use el menú del navegador y Agregar a pantalla principal.');
      return;
    }
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(function () {
      deferredInstallPrompt = null;
      setInstallButtonState();
    });
  }

  function shareLectorLink() {
    var url = lectorUrl();
    if (navigator.share) {
      navigator.share({
        title: 'Lector QR Escuela 1077',
        text: 'Acceso al lector QR de resultados.',
        url: url
      }).catch(function () {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        setStatus('Enlace del lector copiado.');
      }).catch(function () {
        setStatus(url);
      });
      return;
    }
    setStatus(url);
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
      pendingQrData = null;
      resetSubmissionState();
      renderResult(null);
      loadConfig();
    };
    if ($('qrInstallPwa')) $('qrInstallPwa').onclick = installPwaShortcut;
    if ($('qrShareLink')) $('qrShareLink').onclick = shareLectorLink;
    $('qrStartCamera').onclick = startCamera;
    $('qrStopCamera').onclick = stopCamera;
    ['qrSourceOwn', 'qrSourceThird'].forEach(function (id) {
      var radio = $(id);
      if (!radio) return;
      radio.onchange = function () {
        selectedPayload = null;
        resetSubmissionState();
        renderResult(null);
        setSourceAvailability();
        if (pendingQrData) handleQrText(JSON.stringify(pendingQrData));
      };
    });
    $('qrActivitySelect').onchange = function () {
      var thirdSelect = $('qrThirdPartyActivitySelect');
      if (this.value && thirdSelect) thirdSelect.value = '';
      var ownRadio = $('qrSourceOwn');
      if (ownRadio) ownRadio.checked = true;
      setSourceAvailability();
      selectedPayload = null;
      resetSubmissionState();
      renderResult(null);
      if (pendingQrData) handleQrText(JSON.stringify(pendingQrData));
    };
    $('qrThirdPartyActivitySelect').onchange = function () {
      var ownSelect = $('qrActivitySelect');
      if (this.value && ownSelect) ownSelect.value = '';
      var thirdRadio = $('qrSourceThird');
      if (thirdRadio) thirdRadio.checked = true;
      setSourceAvailability();
      selectedPayload = null;
      resetSubmissionState();
      renderResult(null);
      if (pendingQrData) handleQrText(JSON.stringify(pendingQrData));
    };
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
      pendingQrData = null;
      lastResultError = '';
      resetSubmissionState();
      renderResult(null);
      setStatus('Resultado limpiado.');
    };
    window.addEventListener('beforeunload', stopCamera);
    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      deferredInstallPrompt = event;
      setInstallButtonState();
    });
    window.addEventListener('appinstalled', function () {
      deferredInstallPrompt = null;
      setInstallButtonState();
      setStatus('Acceso instalado en el teléfono.');
    });
  }

  bind();
  syncSendButton();
  registerServiceWorker();
  loadConfig();
}());
