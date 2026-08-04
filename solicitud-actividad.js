(function () {
  var SESSION_KEY = 'aieSolicitud1077AccessToken';
  var state = {
    accessToken: '',
    email: '',
    submitting: false
  };

  function $(id) {
    return document.getElementById(id);
  }

  function clean(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function storage() {
    try {
      return window.sessionStorage || window.localStorage;
    } catch (error) {
      return null;
    }
  }

  function setStatus(text, type) {
    var box = $('requestStatus');
    box.textContent = text;
    box.className = 'request-status ' + (type || '');
  }

  function captureToken() {
    var hash = window.location.hash || '';
    if (hash.indexOf('access_token=') < 0) return;
    var params = new URLSearchParams(hash.replace(/^#/, ''));
    var token = params.get('access_token') || '';
    if (!token) return;
    state.accessToken = token;
    var store = storage();
    if (store) store.setItem(SESSION_KEY, token);
    if (window.history && window.history.replaceState) {
      var path = window.AIE_RUNTIME
        ? window.AIE_RUNTIME.currentPagePath('')
        : window.location.pathname + window.location.search;
      window.history.replaceState(null, '', path);
    }
  }

  function loadToken() {
    if (state.accessToken) return;
    var store = storage();
    state.accessToken = store ? store.getItem(SESSION_KEY) || '' : '';
  }

  function clearToken() {
    state.accessToken = '';
    state.email = '';
    var store = storage();
    if (store) store.removeItem(SESSION_KEY);
  }

  function loginUrl() {
    if (!window.AIE_RUNTIME) return '';
    return window.AIE_RUNTIME.supabaseLoginUrl(window.AIE_RUNTIME.currentPageUrl(''));
  }

  function endpointUrl() {
    var config = window.AIE_RUNTIME && window.AIE_RUNTIME.getConfig();
    if (!config || !config.supabaseUrl) return '';
    return config.supabaseUrl + '/functions/v1/solicitudes-1077';
  }

  function api(action, payload) {
    var config = window.AIE_RUNTIME && window.AIE_RUNTIME.getConfig();
    var endpoint = endpointUrl();
    if (!endpoint || !config || !config.supabaseAnonKey) {
      return Promise.reject(new Error('El servicio de solicitudes no está configurado.'));
    }
    return fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: 'Bearer ' + state.accessToken,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        action: action,
        payload: payload || {},
        limit: 10
      })
    }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (body) {
        if (!response.ok || !body || body.ok === false) {
          var error = new Error(body && body.error || 'No se pudo completar la operación.');
          error.status = response.status;
          throw error;
        }
        return body;
      });
    });
  }

  function option(value, label, selected) {
    var item = document.createElement('option');
    item.value = value;
    item.textContent = label || value;
    if (selected) item.selected = true;
    return item;
  }

  function fillOptions(options) {
    var form = $('requestForm');
    var grade = form.elements.grado;
    var area = form.elements.area;
    grade.textContent = '';
    area.textContent = '';
    (options.grados || []).forEach(function (item) {
      grade.appendChild(option(item, item, item === '4'));
    });
    (options.areas || []).forEach(function (item) {
      area.appendChild(option(item, item));
    });
  }

  function renderRequests(rows) {
    var body = $('requestRows');
    body.textContent = '';
    if (!rows || !rows.length) {
      var emptyRow = document.createElement('tr');
      var emptyCell = document.createElement('td');
      emptyCell.colSpan = 6;
      emptyCell.textContent = 'Sin solicitudes para mostrar.';
      emptyRow.appendChild(emptyCell);
      body.appendChild(emptyRow);
      return;
    }
    rows.forEach(function (item) {
      var row = document.createElement('tr');
      [
        [item.fecha_local, item.hora_local].filter(Boolean).join(' - '),
        item.estado_gestion,
        item.funcion_solicitante,
        item.grado,
        item.area,
        item.tema_solicitado
      ].forEach(function (value) {
        var cell = document.createElement('td');
        cell.textContent = value || '';
        row.appendChild(cell);
      });
      body.appendChild(row);
    });
  }

  function setAuthenticated(authenticated) {
    $('requestFields').disabled = !authenticated;
    $('requestSubmit').disabled = !authenticated || state.submitting;
    $('requestReload').disabled = !authenticated || state.submitting;
    $('solicitudLoginGoogle').disabled = authenticated;
    $('solicitudLogoutGoogle').disabled = !authenticated;
    $('requestSessionText').textContent = authenticated
      ? state.email + ' | sesión Google autorizada'
      : 'Sin sesión iniciada.';
  }

  function handleAuthError(error) {
    if (error && error.status === 401) {
      clearToken();
      setAuthenticated(false);
      renderRequests([]);
      setStatus('La sesión venció. Inicie sesión nuevamente.', 'warn');
      return true;
    }
    return false;
  }

  function bootstrap() {
    if (!state.accessToken) {
      setAuthenticated(false);
      setStatus('Inicie sesión con Google para utilizar el formulario.', 'warn');
      return;
    }
    setStatus('Verificando sesión Google.', '');
    api('bootstrap').then(function (result) {
      state.email = clean(result.email).toLowerCase();
      $('requestForm').elements.correoDocente.value = state.email;
      fillOptions(result.opciones || {});
      renderRequests(result.solicitudes || []);
      setAuthenticated(true);
      setStatus('Sesión Google autorizada. El formulario está listo.', 'ok');
    }).catch(function (error) {
      if (handleAuthError(error)) return;
      setAuthenticated(false);
      setStatus(error.message || 'No se pudo preparar el formulario.', 'error');
    });
  }

  function formPayload() {
    var form = $('requestForm');
    return {
      correoDocente: state.email,
      docente: form.elements.docente.value,
      funcionSolicitante: form.elements.funcionSolicitante.value,
      turnoSolicitud: form.elements.turnoSolicitud.value,
      grado: form.elements.grado.value,
      area: form.elements.area.value,
      tema: form.elements.tema.value,
      requisitosDidacticos: form.elements.requisitosDidacticos.value,
      textoBaseDocente: form.elements.textoBaseDocente.value,
      observacionesDocente: form.elements.observacionesDocente.value
    };
  }

  function resetForm() {
    var form = $('requestForm');
    form.reset();
    form.elements.correoDocente.value = state.email;
    $('requestWordHelp').textContent = '0 / 700 palabras.';
  }

  $('solicitudLoginGoogle').addEventListener('click', function () {
    var url = loginUrl();
    if (!url) {
      setStatus('El inicio de sesión Google no está configurado.', 'error');
      return;
    }
    window.location.assign(url);
  });

  $('solicitudLogoutGoogle').addEventListener('click', function () {
    clearToken();
    setAuthenticated(false);
    renderRequests([]);
    setStatus('Sesión cerrada.', 'warn');
  });

  $('requestReload').addEventListener('click', function () {
    setStatus('Actualizando solicitudes.', '');
    api('list').then(function (result) {
      renderRequests(result.solicitudes || []);
      setStatus('Solicitudes actualizadas.', 'ok');
    }).catch(function (error) {
      if (handleAuthError(error)) return;
      setStatus(error.message || 'No se pudieron actualizar las solicitudes.', 'error');
    });
  });

  $('requestForm').elements.textoBaseDocente.addEventListener('input', function () {
    var text = clean(this.value);
    var count = text ? text.split(/\s+/).length : 0;
    $('requestWordHelp').textContent = count + ' / 700 palabras.';
  });

  $('requestForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (state.submitting || !state.accessToken) return;
    state.submitting = true;
    setAuthenticated(true);
    setStatus('Enviando solicitud.', '');
    api('create', formPayload()).then(function (result) {
      state.submitting = false;
      setAuthenticated(true);
      setStatus(result.mensaje || 'Solicitud registrada.', 'ok');
      resetForm();
      return api('list');
    }).then(function (result) {
      if (result) renderRequests(result.solicitudes || []);
    }).catch(function (error) {
      state.submitting = false;
      setAuthenticated(!!state.accessToken);
      if (handleAuthError(error)) return;
      setStatus(error.message || 'No se pudo registrar la solicitud.', 'error');
    });
  });

  captureToken();
  loadToken();
  setAuthenticated(false);
  bootstrap();
}());
