(function () {
  var sessionKey = 'aiePortal1077AccessToken';
  var DEFAULT_INDEX_MINUTES = 90;
  var portal = {
    config: null,
    state: null,
    accessToken: '',
    actividades: [],
    activityControls: {},
    activityListAll: false,
    alumnosApoyo: [],
    resultados: [],
    resultFilters: {
      alumno: '',
      alumnoNombre: '',
      actividad: '',
      archivo: '',
      area: '',
      grado: '',
      tipo: '',
      desde: '',
      hasta: '',
      limit: '50'
    },
    studentAction: '',
    studentFilters: {
      idAlumno: '',
      apellido: '',
      nombre: '',
      grado: '',
      turno: '',
      division: '',
      activo: ''
    },
    activityFilters: {
      titulo: '',
      area: '',
      archivo: '',
      grado: '',
      tipo: '',
      disponible: ''
    }
  };

  function $(id) {
    return document.getElementById(id);
  }

  function clean(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function normalizeSearch(value) {
    var text = clean(value).toLowerCase();
    try {
      text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (err) {
      // Navegadores viejos pueden no soportar normalize; se conserva el texto limpio.
    }
    return text.replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function searchMatches(haystack, needle) {
    var search = normalizeSearch(needle);
    if (!search) return true;
    var text = normalizeSearch(haystack);
    if (text.indexOf(search) >= 0) return true;
    var compactText = text.replace(/\s+/g, '');
    var compactSearch = search.replace(/\s+/g, '');
    return !!compactSearch && compactText.indexOf(compactSearch) >= 0;
  }

  function query(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (key) {
      if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
        parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
      }
    });
    return parts.join('&');
  }

  function splitPath(path) {
    var raw = String(path || '');
    var index = raw.indexOf('?');
    return {
      pathname: index >= 0 ? raw.slice(0, index) : raw,
      params: new URLSearchParams(index >= 0 ? raw.slice(index + 1) : '')
    };
  }

  function boolValue(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  function isAdminState(state) {
    return !!(state && state.perfil && state.perfil.rol === 'administrador');
  }

  function timestampForRpc(value) {
    var text = clean(value);
    if (!text) return null;
    var date = new Date(text);
    if (Number.isNaN(date.getTime())) throw new Error('Fecha y hora invalida.');
    return date.toISOString();
  }

  function rpc(functionName, payload, callback, authenticated) {
    if (!window.AIE_RUNTIME || !window.AIE_RUNTIME.supabaseReady()) {
      window.setTimeout(function () {
        callback({ error: window.AIE_RUNTIME ? window.AIE_RUNTIME.supabaseUnavailableMessage() : 'Falta configuracion Supabase.' });
      }, 0);
      return true;
    }
    window.AIE_RUNTIME.supabaseRpc(functionName, payload || {}, authenticated ? portal.accessToken : '', callback);
    return true;
  }

  function directApi(method, path, data, callback, authenticated) {
    var parsed = splitPath(path);
    var pathname = parsed.pathname;
    var match;
    try {
      if (method === 'GET' && pathname === '/api/portal-docente/config') {
        window.setTimeout(function () {
          callback(null, window.AIE_RUNTIME.publicPortalConfig());
        }, 0);
        return true;
      }
      if (method === 'GET' && pathname === '/api/portal-docente/estado') {
        return rpc('aie_1077_portal_estado', {}, callback, authenticated);
      }
      if (method === 'GET' && pathname === '/api/portal-docente/actividades') {
        return rpc('aie_1077_actividades_listar', {
          p_titulo: parsed.params.get('titulo') || '',
          p_area: parsed.params.get('area') || '',
          p_archivo: parsed.params.get('archivo') || '',
          p_grado: parsed.params.get('grado') || '',
          p_tipo: parsed.params.get('tipo') || '',
          p_disponible: parsed.params.get('disponible') === 'true'
            ? true
            : parsed.params.get('disponible') === 'false' ? false : null,
          p_listar_todas: parsed.params.get('listar_todas') === 'true'
        }, callback, authenticated);
      }
      if (method === 'POST' && pathname === '/api/portal-docente/sesion') {
        return rpc('aie_1077_registrar_sesion', {}, callback, authenticated);
      }
      if (method === 'POST' && pathname === '/api/portal-docente/indice') {
        return rpc('aie_1077_cambiar_indice', {
          p_habilitado: boolValue(data && data.habilitado),
          p_mensaje: data && data.mensaje || '',
          p_vigente_hasta: timestampForRpc(data && (data.vigenteHasta || data.vigente_hasta)),
          p_motivo: data && data.motivo || ''
        }, callback, authenticated);
      }
      if (method === 'POST' && pathname === '/api/portal-docente/sesion-aie') {
        return rpc('aie_1077_sesion_aie_abrir', {
          p_duracion_minutos: Number(data && (data.duracionMinutos || data.duracion_minutos) || 90),
          p_motivo: data && data.motivo || ''
        }, callback, authenticated);
      }
      if (method === 'DELETE' && pathname === '/api/portal-docente/sesion-aie') {
        return rpc('aie_1077_sesion_aie_cerrar', {
          p_motivo: data && data.motivo || ''
        }, callback, authenticated);
      }
      match = pathname.match(/^\/api\/portal-docente\/actividades\/([^\/]+)$/);
      if (method === 'POST' && match) {
        return rpc('aie_1077_cambiar_actividad', {
          p_actividad_id: decodeURIComponent(match[1]),
          p_disponible: boolValue(data && data.disponible),
          p_visible_desde: timestampForRpc(data && (data.visibleDesde || data.visible_desde)),
          p_visible_hasta: timestampForRpc(data && (data.visibleHasta || data.visible_hasta))
        }, callback, authenticated);
      }
      if (method === 'GET' && pathname === '/api/portal-docente/resultados') {
        return rpc('aie_1077_resultados_recientes', {
          p_id_alumno: parsed.params.get('alumno') || parsed.params.get('id_alumno') || '',
          p_limite: Number(parsed.params.get('limit') || 50)
        }, callback, authenticated);
      }
      if (method === 'GET' && pathname === '/api/portal-docente/alumnos-apoyo') {
        return rpc('aie_1077_alumnos_apoyo_listar', {
          p_id_alumno: parsed.params.get('id_alumno') || parsed.params.get('idAlumno') || '',
          p_apellido: parsed.params.get('apellido') || '',
          p_nombre: parsed.params.get('nombre') || '',
          p_grado: parsed.params.get('grado') || '',
          p_turno: parsed.params.get('turno') || '',
          p_division: parsed.params.get('division') || '',
          p_activo: parsed.params.get('activo') === 'true'
            ? true
            : parsed.params.get('activo') === 'false' ? false : null
        }, callback, authenticated);
      }
      if (method === 'POST' && pathname === '/api/portal-docente/alumnos-apoyo') {
        return rpc('aie_1077_alumnos_apoyo_guardar', {
          p_id: null,
          p_alumno: data || {}
        }, callback, authenticated);
      }
      match = pathname.match(/^\/api\/portal-docente\/alumnos-apoyo\/([^\/]+)$/);
      if (match && method === 'PATCH') {
        return rpc('aie_1077_alumnos_apoyo_guardar', {
          p_id: decodeURIComponent(match[1]),
          p_alumno: data || {}
        }, callback, authenticated);
      }
      if (match && method === 'DELETE') {
        return rpc('aie_1077_alumnos_apoyo_desactivar', {
          p_id: decodeURIComponent(match[1])
        }, callback, authenticated);
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
    if (authenticated && portal.accessToken) {
      xhr.setRequestHeader('Authorization', 'Bearer ' + portal.accessToken);
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

  function setStatus(text, error) {
    var box = $('teacherPortalStatus');
    if (!box) return;
    box.textContent = text;
    box.className = error ? 'admin-status publication-state-fallida' : 'admin-status';
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
    portal.accessToken = token;
    var store = storage();
    if (store) store.setItem(sessionKey, token);
    if (window.history && window.history.replaceState) {
      var cleanPath = window.AIE_RUNTIME ? window.AIE_RUNTIME.currentPagePath('') : window.location.pathname;
      window.history.replaceState(null, '', cleanPath);
    }
    return true;
  }

  function loadStoredToken() {
    if (portal.accessToken) return;
    var store = storage();
    portal.accessToken = store ? store.getItem(sessionKey) || '' : '';
  }

  function clearToken() {
    portal.accessToken = '';
    var store = storage();
    if (store) store.removeItem(sessionKey);
  }

  function loginUrl() {
    var supabase = portal.config && portal.config.supabase || {};
    if (!supabase.url || !supabase.loginGoogleListo) return '';
    var redirectTo = window.AIE_RUNTIME ? window.AIE_RUNTIME.currentPageUrl('') : window.location.origin + window.location.pathname;
    return supabase.url.replace(/\/+$/, '') + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(redirectTo);
  }

  function portalDate(value) {
    if (!value) return '';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return padDatePart(date.getDate()) + '/' +
      padDatePart(date.getMonth() + 1) + '/' +
      date.getFullYear() + ' - ' +
      padDatePart(date.getHours()) + ':' +
      padDatePart(date.getMinutes());
  }

  function padDatePart(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function dateInputValue(value) {
    if (!value) return '';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.getFullYear() + '-' +
      padDatePart(date.getMonth() + 1) + '-' +
      padDatePart(date.getDate()) + 'T' +
      padDatePart(date.getHours()) + ':' +
      padDatePart(date.getMinutes());
  }

  function valueOrDash(value) {
    var text = clean(value);
    return text || '-';
  }

  function fileNameFromPath(value) {
    var text = clean(value).replace(/\\/g, '/');
    if (!text) return '';
    var parts = text.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : text;
  }

  function activityFileName(activity) {
    return clean(activity && (
      activity.archivoOriginal ||
      activity.archivo_original ||
      activity.nombreArchivo ||
      activity.nombre_archivo ||
      activity.archivoNombre ||
      activity.archivo_nombre ||
      activity.archivo
    )) ||
      fileNameFromPath(activity && activity.storagePath) ||
      fileNameFromPath(activity && activity.storage_path);
  }

  function activityFileBaseName(activity) {
    return clean(activityFileName(activity)).replace(/\.html?$/i, '');
  }

  function activityFileSearchText(activity) {
    return [
      activityFileName(activity),
      activityFileBaseName(activity),
      activity && activity.archivoNombre,
      activity && activity.archivo_nombre,
      activity && activity.nombreArchivo,
      activity && activity.nombre_archivo,
      activity && activity.storagePath,
      activity && activity.storage_path
    ].map(clean).filter(Boolean).join(' ');
  }

  function activityDisplayTitle(activity) {
    var title = clean(activity && activity.titulo);
    var type = clean(activity && activity.tipo).toUpperCase();
    if (title && /^[AB]$/.test(type)) {
      title = title.replace(new RegExp('\\s*[-–—]?\\s*Tipo\\s+' + type + '\\s*$', 'i'), '').trim();
    }
    return title || clean(activity && (activity.codigo || activity.id));
  }

  function activityStateCell(activity) {
    var div = document.createElement('div');
    var state = clean(activity && activity.estado);
    var published = /^publicad[ao]$/i.test(state);
    div.className = 'portal-cell-status';
    div.title = state || 'Estado';
    var marker = document.createElement('span');
    marker.className = published ? 'portal-state-check portal-state-check-ok' : 'portal-state-check';
    marker.textContent = published ? '✓' : '';
    div.appendChild(marker);
    return div;
  }

  function resultDateText(result) {
    var dateText = clean(result && result.fechaLocal);
    var timeText = clean(result && result.horaLocal).slice(0, 5);
    if (dateText) {
      var parts = dateText.split('-');
      if (parts.length === 3) dateText = parts[2] + '/' + parts[1] + '/' + parts[0];
    } else if (result && result.registradoEn) {
      return portalDate(result.registradoEn);
    }
    return [dateText, timeText].filter(Boolean).join(' - ');
  }

  function cell(className, text, title) {
    var div = document.createElement('div');
    div.className = className || '';
    div.textContent = text == null ? '' : String(text);
    if (title) div.title = title;
    return div;
  }

  function headerCell(text, title) {
    return cell('portal-table-header', text, title);
  }

  function permission(state, key) {
    var profile = state && state.perfil || {};
    var permissions = profile.permisos || {};
    return profile[key] === true || permissions[key] === true;
  }

  function permissionAny(state, keys) {
    return (keys || []).some(function (key) {
      return permission(state, key);
    });
  }

  function portalHasAnyPermission(state, permissionsText) {
    var keys = clean(permissionsText).split(/\s+/).filter(Boolean);
    if (!keys.length) return true;
    if (isAdminState(state)) return true;
    return state && state.autorizado && permissionAny(state, keys);
  }

  function setHidden(element, hidden) {
    if (!element) return;
    if (hidden) {
      element.classList.add('hidden');
    } else {
      element.classList.remove('hidden');
    }
  }

  function actionIcon(name) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'action-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var paths = {
      edit: ['M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4z', 'M13.5 6.5l4 4'],
      deactivate: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M7 7l10 10'],
      search: ['M10 18a8 8 0 1 1 5.3-14A8 8 0 0 1 10 18z', 'M15 15l5 5'],
      open: ['M14 3h7v7', 'M21 3l-9 9', 'M5 5h6', 'M5 5v14h14v-6'],
      save: ['M5 3h12l2 2v16H5V3z', 'M8 3v6h8V3', 'M8 17h8v4', 'M10 6h4']
    };
    (paths[name] || paths.edit).forEach(function (d) {
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    });
    return svg;
  }

  function iconButton(kind, label, className, onClick) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = className || 'portal-icon-button secondary';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.appendChild(actionIcon(kind));
    button.onclick = onClick;
    return button;
  }

  function updatePortalFeatureVisibility(state) {
    var authorized = state && state.autorizado;
    var blocks = document.querySelectorAll('[data-portal-any]');
    for (var i = 0; i < blocks.length; i++) {
      setHidden(blocks[i], !portalHasAnyPermission(state, blocks[i].getAttribute('data-portal-any')));
    }
    var adminOnly = document.querySelectorAll('[data-portal-admin-only]');
    for (var j = 0; j < adminOnly.length; j++) {
      setHidden(adminOnly[j], !(authorized && isAdminState(state)));
    }
    renderPermissionSummary(state);
  }

  function renderPermissionSummary(state) {
    var box = $('portalPermissionSummary');
    if (!box) return;
    if (!(state && state.autorizado && state.perfil)) {
      box.textContent = 'Inicie sesión con Google para ver las funcionalidades habilitadas.';
      box.className = 'portal-permission-summary';
      return;
    }
    box.textContent = 'Los permisos para acceder a las diversas funcionalidades del sistema y ejecutarlas han sido establecidos acorde al rol. En caso de necesitar ampliación o restricción de permisos, comunicarse con el AIE: Profe. Bruno.';
    box.className = 'portal-permission-summary';
  }

  function indexStateBadge(enabled, adminBlocked) {
    var span = document.createElement('span');
    span.className = 'portal-index-state-title ' + (enabled && !adminBlocked ? 'portal-index-state-open' : 'portal-index-state-blocked');
    span.textContent = enabled && !adminBlocked ? 'Índice habilitado' : 'Índice bloqueado';
    return span;
  }

  function indexSinceDate(control, enabled, adminBlocked) {
    if (adminBlocked) return control.bloqueoAdminEn || control.actualizadoEn || '';
    return enabled
      ? control.habilitadoEn || control.actualizadoEn || ''
      : control.deshabilitadoEn || control.actualizadoEn || '';
  }

  function classSessionBadge(classSession) {
    classSession = classSession || {};
    var active = classSession.activo === true;
    var span = document.createElement('span');
    span.className = active ? 'publication-state publication-state-publicada' : 'publication-state publication-state-fallida';
    span.textContent = classSession.requerido === false
      ? 'Control preparado'
      : classSession.soportado === false
      ? 'Migración pendiente'
      : active ? 'Sesión AIE activa' : 'Sin sesión AIE';
    return span;
  }

  function activityBadge(activity) {
    var span = document.createElement('span');
    var visible = activity && activity.visibleAhora === true;
    span.className = visible ? 'publication-state publication-state-publicada' : 'publication-state publication-state-pendiente';
    span.textContent = visible ? 'Visible para alumnos' : 'No visible';
    return span;
  }

  function renderSession(state) {
    var box = $('portalSessionBox');
    var login = $('portalLoginGoogle');
    var logout = $('portalLogout');
    if (!box || !login || !logout) return;
    var config = state && state.configuracion || portal.config || {};
    var supabase = config.supabase || {};
    login.disabled = !loginUrl() || !!portal.accessToken;
    logout.disabled = !portal.accessToken;
    box.innerHTML = '';
    if (state && state.perfil) {
      var profile = document.createElement('div');
      profile.className = 'portal-session-profile';
      var name = document.createElement('strong');
      name.textContent = state.perfil.nombre || state.perfil.email;
      var detail = document.createElement('span');
      detail.textContent = state.perfil.email + ' | ' + state.perfil.rol;
      profile.appendChild(name);
      profile.appendChild(detail);
      box.appendChild(profile);
      return;
    }
    var lines = [];
    lines.push(portal.accessToken ? 'Sesión local detectada, pendiente de autorización.' : 'Sin sesión docente.');
    lines.push(supabase.loginGoogleListo ? 'Login Google preparado.' : 'Falta anon/publishable key para habilitar Google.');
    lines.push('Roles permitidos: ' + ((config.rolesPermitidos || []).join(', ') || 'sin datos') + '.');
    box.textContent = lines.join(' ');
  }

  function renderIndex(state) {
    var box = $('portalIndexState');
    var since = $('portalIndexVigenteDesde');
    var until = $('portalIndexVigenteHasta');
    var enable = $('portalEnableIndex');
    var disable = $('portalDisableIndex');
    if (!box || !since || !until || !enable || !disable) return;
    var control = state && state.control || {};
    var admin = isAdminState(state);
    var enabled = control.habilitado === true;
    var adminBlocked = control.bloqueoAdminActivo === true;
    var canChange = !adminBlocked && state && state.autorizado &&
      (admin || permission(state, 'puede_habilitar_indice')) &&
      state.configuracion && state.configuracion.supabase.backendListo;
    box.innerHTML = '';
    box.appendChild(indexStateBadge(enabled, adminBlocked));

    var dateGrid = document.createElement('div');
    dateGrid.className = 'portal-index-state-grid';
    [
      { label: 'F. Desde', value: portalDate(indexSinceDate(control, enabled, adminBlocked)) || '-' },
      { label: 'F. Hasta', value: enabled ? (portalDate(control.vigenteHasta) || '-') : '-' }
    ].forEach(function (item) {
      var cell = document.createElement('div');
      var label = document.createElement('span');
      var value = document.createElement('strong');
      label.textContent = item.label;
      value.textContent = item.value;
      cell.appendChild(label);
      cell.appendChild(value);
      dateGrid.appendChild(cell);
    });
    box.appendChild(dateGrid);

    if (adminBlocked && control.bloqueoAdminMotivo) {
      var blocked = document.createElement('div');
      blocked.className = 'portal-warning';
      blocked.textContent = 'Motivo: ' + control.bloqueoAdminMotivo;
      box.appendChild(blocked);
    }
    if (control.vencido) {
      var expired = document.createElement('div');
      expired.className = admin ? 'portal-muted' : 'portal-warning';
      expired.textContent = admin
        ? 'La habilitación para alumnos está vencida; puede habilitarla nuevamente.'
        : 'La habilitación está vencida.';
      box.appendChild(expired);
    }
    if (control.actualizadoEn) {
      var updated = document.createElement('div');
      updated.className = 'portal-muted';
      updated.textContent = 'Actualizado: ' + portalDate(control.actualizadoEn);
      box.appendChild(updated);
    }
    since.value = '';
    until.value = enabled ? dateInputValue(control.vigenteHasta) : '';
    enable.disabled = !canChange || enabled;
    disable.disabled = !canChange || !enabled;
  }

  function renderClassSession(state) {
    var card = $('portalClassSessionCard');
    var box = $('portalClassSessionState');
    var start = $('portalStartClassSession');
    var close = $('portalCloseClassSession');
    var role = state && state.perfil && state.perfil.rol || '';
    var visible = role === 'administrador';
    if (card) card.style.display = visible ? '' : 'none';
    if (!visible) return;
    if (!box || !start || !close) return;
    var classSession = state && state.sesionAie || {};
    var session = classSession.sesion || {};
    var active = classSession.activo === true;
    var allowed = state && state.autorizado && permission(state, 'puede_habilitar_indice') &&
      state.configuracion && state.configuracion.supabase.backendListo &&
      classSession.requerido === true && classSession.soportado !== false;
    box.innerHTML = '';
    box.appendChild(classSessionBadge(classSession));
    var detail = document.createElement('div');
    detail.className = 'portal-detail';
    detail.textContent = classSession.mensaje || 'La sesión AIE limita el índice de alumnos durante una clase.';
    box.appendChild(detail);
    if (session.abiertaPorEmail) {
      var owner = document.createElement('div');
      owner.className = 'portal-muted';
      owner.textContent = 'Abierta por: ' + session.abiertaPorEmail + ' | Hasta: ' + (portalDate(session.vigenteHasta) || '-');
      box.appendChild(owner);
    }
    if (classSession.soportado === false) {
      var pending = document.createElement('div');
      pending.className = 'portal-warning';
      pending.textContent = 'Falta aplicar la migración de sesiones AIE en Supabase.';
      box.appendChild(pending);
    } else if (classSession.requerido === false) {
      var inactive = document.createElement('div');
      inactive.className = 'portal-muted';
      inactive.textContent = 'Para exigir sesiones, aplicar la migración y activar sesionesAieObligatorias.';
      box.appendChild(inactive);
    }
    start.disabled = !allowed;
    close.disabled = !allowed || !active;
  }

  function activityTableRow(state, activity) {
    var row = document.createElement('div');
    row.className = 'portal-table-row portal-activity-row';
    var canModify = state && state.autorizado && permissionAny(state, ['puede_habilitar_actividades', 'puede_bloquear_actividades']);

    var available = document.createElement('select');
    available.value = activity.disponible === true ? 'true' : 'false';
    available.disabled = !canModify;
    var yes = document.createElement('option');
    yes.value = 'true';
    yes.textContent = 'SI';
    var no = document.createElement('option');
    no.value = 'false';
    no.textContent = 'NO';
    available.appendChild(yes);
    available.appendChild(no);

    var from = document.createElement('input');
    from.type = 'datetime-local';
    from.value = dateInputValue(activity.visibleDesde);
    from.disabled = !canModify;

    var until = document.createElement('input');
    until.type = 'datetime-local';
    until.value = dateInputValue(activity.visibleHasta);
    until.disabled = !canModify;

    var save = document.createElement('button');
    save.type = 'button';
    save.className = 'portal-save-button compact-button';
    save.setAttribute('aria-label', 'Guardar disponibilidad');
    save.title = 'Guardar disponibilidad';
    save.appendChild(actionIcon('save'));
    save.disabled = !canModify;
    save.onclick = function () {
      saveActivity(activity, available.value === 'true', from.value, until.value);
    };
    portal.activityControls[activity.id] = {
      activity: activity,
      available: available,
      from: from,
      until: until,
      save: save
    };

    var fullFileName = activityFileName(activity);
    var fileBaseName = activityFileBaseName(activity);
    row.appendChild(cell('portal-cell-title', valueOrDash(activityDisplayTitle(activity))));
    row.appendChild(cell('', valueOrDash(activity.area)));
    row.appendChild(cell('portal-cell-compact', valueOrDash(activity.grado)));
    row.appendChild(cell('portal-cell-compact', valueOrDash(activity.tipo)));
    row.appendChild(activityStateCell(activity));
    var availableCell = document.createElement('div');
    availableCell.className = 'portal-editable-cell portal-editable-available';
    availableCell.appendChild(available);
    row.appendChild(availableCell);
    var fromCell = document.createElement('div');
    fromCell.className = 'portal-editable-cell portal-editable-date';
    fromCell.appendChild(from);
    row.appendChild(fromCell);
    var untilCell = document.createElement('div');
    untilCell.className = 'portal-editable-cell portal-editable-date';
    untilCell.appendChild(until);
    row.appendChild(untilCell);
    row.appendChild(cell('portal-cell-file', valueOrDash(fileBaseName), fullFileName));
    var actions = document.createElement('div');
    actions.className = 'portal-row-actions';
    actions.appendChild(save);
    row.appendChild(actions);
    return row;
  }

  function readActivityFilters() {
    portal.activityFilters = {
      titulo: $('portalActivityFilterTitle') ? clean($('portalActivityFilterTitle').value).toLowerCase() : '',
      area: $('portalActivityFilterArea') ? clean($('portalActivityFilterArea').value).toLowerCase() : '',
      archivo: $('portalActivityFilterFile') ? clean($('portalActivityFilterFile').value).toLowerCase() : '',
      grado: $('portalActivityFilterGrade') ? clean($('portalActivityFilterGrade').value) : '',
      tipo: $('portalActivityFilterType') ? clean($('portalActivityFilterType').value) : '',
      disponible: $('portalActivityFilterAvailable') ? clean($('portalActivityFilterAvailable').value) : ''
    };
    return portal.activityFilters;
  }

  function clearActivityFilters() {
    portal.activityListAll = false;
    portal.activityFilters = { titulo: '', area: '', archivo: '', grado: '', tipo: '', disponible: '' };
    if ($('portalActivityFilterTitle')) $('portalActivityFilterTitle').value = '';
    if ($('portalActivityFilterArea')) $('portalActivityFilterArea').value = '';
    if ($('portalActivityFilterFile')) $('portalActivityFilterFile').value = '';
    if ($('portalActivityFilterGrade')) $('portalActivityFilterGrade').value = '';
    if ($('portalActivityFilterType')) $('portalActivityFilterType').value = '';
    if ($('portalActivityFilterAvailable')) $('portalActivityFilterAvailable').value = '';
  }

  function hasActivitySearchFilters(filters) {
    return Object.keys(filters || {}).some(function (key) {
      return filters[key] !== undefined && filters[key] !== null && filters[key] !== '';
    });
  }

  function activitySearchQuery(filters, listAll) {
    var input = filters || {};
    return query({
      titulo: input.titulo || '',
      area: input.area || '',
      archivo: input.archivo || '',
      grado: input.grado || '',
      tipo: input.tipo || '',
      disponible: input.disponible || '',
      listar_todas: listAll ? 'true' : ''
    });
  }

  function filteredActivities(list) {
    var filters = portal.activityFilters || {};
    return (list || []).filter(function (activity) {
      if (filters.titulo && !searchMatches(activityDisplayTitle(activity), filters.titulo)) return false;
      if (filters.area && clean(activity.area).toLowerCase() !== filters.area) return false;
      if (filters.archivo && !searchMatches(activityFileSearchText(activity), filters.archivo)) return false;
      if (filters.grado && String(activity.grado || '') !== filters.grado) return false;
      if (filters.tipo && String(activity.tipo || '').toUpperCase() !== filters.tipo.toUpperCase()) return false;
      if (filters.disponible === 'true' && activity.disponible !== true) return false;
      if (filters.disponible === 'false' && activity.disponible === true) return false;
      return true;
    });
  }

  function activityPublicUrl(activity) {
    if (!(activity && activity.codigo)) return '';
    return 'alumnos.html#actividad=' + encodeURIComponent(activity.codigo);
  }

  function renderActivities(state) {
    var box = $('portalActivities');
    if (!box) return;
    box.innerHTML = '';
    var allowed = state && state.autorizado && portalHasAnyPermission(state, 'puede_visualizar_actividades puede_probar_actividades puede_habilitar_actividades puede_bloquear_actividades');
    if (!allowed) {
      portal.activityControls = {};
      box.textContent = state && state.autorizado ? 'Sin permiso para visualizar actividades.' : 'Inicie sesion para ver actividades.';
      return;
    }
    var filters = portal.activityFilters || {};
    if (!hasActivitySearchFilters(filters) && portal.activityListAll !== true) {
      portal.activityControls = {};
      box.textContent = 'Complete al menos un filtro y presione Buscar.';
      return;
    }
    var list = portal.actividades || [];
    if (!list.length) {
      portal.activityControls = {};
      box.textContent = state && state.autorizado
        ? 'No hay actividades registradas para los filtros seleccionados.'
        : 'Indice cerrado o sin sesion autorizada. No se listan actividades para alumnos.';
      return;
    }
    portal.activityControls = {};
    var table = document.createElement('div');
    table.className = 'portal-table portal-activity-table';
    [
      { text: 'Título' },
      { text: 'Área' },
      { text: 'G', title: 'Grado' },
      { text: 'T', title: 'Tipo' },
      { text: 'EST.', title: 'Estado' },
      { text: 'DISP.', title: 'Disponible' },
      { text: 'Visible desde' },
      { text: 'Visible hasta' },
      { text: 'Archivo' },
      { text: 'ACC.', title: 'Acciones' }
    ].forEach(function (header) {
      table.appendChild(headerCell(header.text, header.title));
    });
    list.forEach(function (activity) {
      table.appendChild(activityTableRow(state, activity));
    });
    box.appendChild(table);
  }

  function renderAccessLog(state) {
    var box = $('portalAccessLog');
    if (!box) return;
    box.innerHTML = '';
    var list = state && state.accesosRecientes || [];
    if (!list.length) {
      box.textContent = state && state.autorizado ? 'Sin accesos recientes.' : 'Los accesos se muestran solo con sesion autorizada.';
      return;
    }
    list.forEach(function (entry) {
      var item = document.createElement('div');
      item.className = 'portal-list-item';
      var title = document.createElement('strong');
      title.textContent = entry.email + ' | ' + entry.rol + ' | ' + entry.evento;
      var meta = document.createElement('span');
      meta.textContent = [entry.fecha_local, entry.dia_nombre, entry.hora_local, entry.detalle].filter(Boolean).join(' | ');
      item.appendChild(title);
      item.appendChild(meta);
      box.appendChild(item);
    });
  }

  function renderInterfaces(state) {
    var card = $('portalInterfacesCard');
    var portalLink = $('portalLinkPortal');
    var qr = $('portalLinkQr');
    var index = $('portalLinkIndice');
    var topQr = $('portalTopQr');
    var topIndex = $('portalTopIndice');
    var canQr = isAdminState(state) || permission(state, 'puede_usar_lector_qr');
    var canIndex = isAdminState(state) || permission(state, 'puede_ver_indice_alumnos');
    var canPortal = isAdminState(state) || permission(state, 'puede_ver_portal_funcional');
    setHidden(portalLink, !(state && state.autorizado && canPortal));
    setHidden(qr, !(state && state.autorizado && canQr));
    setHidden(index, !(state && state.autorizado && canIndex));
    setHidden(topQr, !(state && state.autorizado && canQr));
    setHidden(topIndex, !(state && state.autorizado && canIndex));
    if (card && state && state.autorizado && !canPortal && !canQr && !canIndex && !isAdminState(state)) {
      setHidden(card, true);
    }
  }

  function setResultsStatus(text, error) {
    var box = $('portalResultsStatus');
    if (!box) return;
    box.textContent = text || '';
    box.className = error ? 'portal-warning' : 'portal-muted';
  }

  function resultMeta(result) {
    var parts = [];
    if (result.fechaLocal) parts.push(result.fechaLocal);
    if (result.diaNombre) parts.push(result.diaNombre);
    if (result.horaLocal) parts.push(result.horaLocal);
    if (result.grado) parts.push('Grado ' + result.grado);
    if (result.area) parts.push(result.area);
    if (result.tipoActividad) parts.push('Tipo ' + result.tipoActividad);
    return parts.join(' | ');
  }

  function readResultFilters() {
    portal.resultFilters = {
      alumno: $('portalResultsStudentFilter') ? clean($('portalResultsStudentFilter').value) : '',
      alumnoNombre: $('portalResultsStudentNameFilter') ? clean($('portalResultsStudentNameFilter').value).toLowerCase() : '',
      actividad: $('portalResultsActivityFilter') ? clean($('portalResultsActivityFilter').value).toLowerCase() : '',
      archivo: $('portalResultsFileFilter') ? clean($('portalResultsFileFilter').value).toLowerCase() : '',
      area: $('portalResultsAreaFilter') ? clean($('portalResultsAreaFilter').value).toLowerCase() : '',
      grado: $('portalResultsGradeFilter') ? clean($('portalResultsGradeFilter').value) : '',
      tipo: $('portalResultsTypeFilter') ? clean($('portalResultsTypeFilter').value).toUpperCase() : '',
      desde: $('portalResultsFromFilter') ? clean($('portalResultsFromFilter').value) : '',
      hasta: $('portalResultsToFilter') ? clean($('portalResultsToFilter').value) : '',
      limit: $('portalResultsLimit') ? $('portalResultsLimit').value : '50'
    };
    return portal.resultFilters;
  }

  function resultActivityText(result) {
    return clean(result && (result.actividadTitulo || result.actividadCodigo || result.actividadId)) || '-';
  }

  function resultStudentText(result) {
    return clean(result && (
      result.alumnoNombreCompleto ||
      [result.alumnoApellido, result.alumnoNombre].filter(Boolean).join(' ')
    )) || '-';
  }

  function resultFileText(result) {
    return clean(result && (
      result.archivoNombre ||
      result.archivo ||
      result.nombreArchivo ||
      result.archivo_nombre
    )) || '-';
  }

  function filteredResults(list) {
    var filters = portal.resultFilters || {};
    return (list || []).filter(function (result) {
      var activity = resultActivityText(result).toLowerCase();
      var student = resultStudentText(result).toLowerCase();
      var file = resultFileText(result).toLowerCase();
      var date = clean(result.fechaLocal);
      if (filters.alumno && clean(result.alumnoId).toLowerCase().indexOf(filters.alumno.toLowerCase()) < 0) return false;
      if (filters.alumnoNombre && student.indexOf(filters.alumnoNombre) < 0) return false;
      if (filters.actividad && activity.indexOf(filters.actividad) < 0) return false;
      if (filters.archivo && file.indexOf(filters.archivo) < 0) return false;
      if (filters.area && clean(result.area).toLowerCase() !== filters.area) return false;
      if (filters.grado && String(result.grado || '') !== filters.grado) return false;
      if (filters.tipo && String(result.tipoActividad || '').toUpperCase() !== filters.tipo) return false;
      if (filters.desde && date && date < filters.desde) return false;
      if (filters.hasta && date && date > filters.hasta) return false;
      return true;
    });
  }

  function resultTableRow(result) {
    var row = document.createElement('div');
    row.className = 'portal-table-row portal-result-row';
    row.appendChild(cell('portal-cell-date', valueOrDash(resultDateText(result))));
    row.appendChild(cell('portal-cell-student', valueOrDash(result.alumnoId)));
    row.appendChild(cell('portal-cell-student-name', resultStudentText(result)));
    row.appendChild(cell('portal-cell-title', resultActivityText(result)));
    row.appendChild(cell('portal-cell-file', resultFileText(result)));
    row.appendChild(cell('', valueOrDash(result.area)));
    row.appendChild(cell('portal-cell-compact', valueOrDash(result.grado)));
    row.appendChild(cell('portal-cell-compact', valueOrDash(result.tipoActividad)));
    row.appendChild(cell('portal-cell-compact', valueOrDash(result.cantidadEjercicios)));
    row.appendChild(cell('portal-cell-ok', valueOrDash(result.correctos)));
    row.appendChild(cell('portal-cell-bad', valueOrDash(result.incorrectos)));
    row.appendChild(cell('portal-cell-compact', valueOrDash(result.nota)));
    row.appendChild(cell('portal-cell-compact', result.tiempoMinutos == null ? '-' : result.tiempoMinutos));
    return row;
  }

  function renderResults(state, results) {
    var box = $('portalResultsList');
    var allowed = state && state.autorizado && permission(state, 'puede_ver_resultados');
    var exportButton = $('portalResultsExport');
    if (!box) return;
    box.innerHTML = '';
    if (!allowed) {
      if (exportButton) exportButton.disabled = true;
      setResultsStatus(state && state.autorizado
        ? 'Su perfil no tiene permiso para ver resultados.'
        : 'Inicie sesion para ver resultados.', true);
      box.textContent = state && state.autorizado ? 'Sin permiso de resultados.' : 'Sin sesion autorizada.';
      return;
    }
    var list = filteredResults(results || portal.resultados || []);
    if (exportButton) exportButton.disabled = !permission(state, 'puede_exportar_resultados') || !list.length;
    setResultsStatus('Resultados listados - Cantidad: ' + list.length);
    if (!list.length) {
      box.textContent = 'No hay resultados registrados.';
      return;
    }
    var table = document.createElement('div');
    table.className = 'portal-table portal-result-table';
    ['Fecha', 'ID', 'Apellido y Nombres', 'Actividad', 'Archivo', 'Area', 'G', 'T', 'Cant.', 'OK', 'Err.', 'Nota', 'T/m'].forEach(function (title) {
      table.appendChild(headerCell(title));
    });
    list.forEach(function (result) {
      table.appendChild(resultTableRow(result));
    });
    box.appendChild(table);
  }

  function csvCell(value) {
    var text = String(value == null ? '' : value);
    if (/[",\r\n;]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function exportResultsCsv() {
    if (!permission(portal.state || {}, 'puede_exportar_resultados')) {
      setResultsStatus('Su perfil no tiene permiso para exportar resultados.', true);
      return;
    }
    var list = filteredResults(portal.resultados || []);
    if (!list.length) {
      setResultsStatus('No hay resultados cargados para exportar.', true);
      return;
    }
    var headers = [
      'alumno_id',
      'apellido_y_nombres',
      'actividad',
      'archivo',
      'grado',
      'area',
      'tipo',
      'cantidad_ejercicios',
      'correctos',
      'incorrectos',
      'nota',
      'tiempo_minutos',
      'fecha',
      'dia',
      'hora'
    ];
    var lines = [headers.join(';')];
    list.forEach(function (result) {
      lines.push([
        result.alumnoId,
        resultStudentText(result),
        result.actividadTitulo || result.actividadCodigo || result.actividadId,
        resultFileText(result),
        result.grado,
        result.area,
        result.tipoActividad,
        result.cantidadEjercicios,
        result.correctos,
        result.incorrectos,
        result.nota,
        result.tiempoMinutos,
        result.fechaLocal,
        result.diaNombre,
        result.horaLocal
      ].map(csvCell).join(';'));
    });
    var blob = new Blob(['\ufeff' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'resultados-1077-excel.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 0);
    setResultsStatus('Archivo para Excel generado con ' + list.length + ' resultado(s).');
  }

  function loadResults() {
    var state = portal.state || {};
    if (!state.autorizado || !permission(state, 'puede_ver_resultados')) {
      renderResults(state, []);
      return;
    }
    var filters = readResultFilters();
    var qs = query({ alumno: filters.alumno, limit: filters.limit });
    api('GET', '/api/portal-docente/resultados' + (qs ? '?' + qs : ''), null, function (err, data) {
      if (err) {
        portal.resultados = [];
        renderResults(state, []);
        setResultsStatus(err.error || 'No se pudieron cargar resultados.', true);
        return;
      }
      portal.resultados = data && data.resultados || [];
      renderResults(state, portal.resultados);
    }, true);
  }

  function setStudentsStatus(text, error) {
    var box = $('portalStudentsStatus');
    if (!box) return;
    box.textContent = text || '';
    box.className = error ? 'portal-warning' : 'portal-muted';
  }

  function studentControls() {
    return [
      $('portalStudentId'),
      $('portalStudentCode'),
      $('portalStudentName'),
      $('portalStudentLastName'),
      $('portalStudentGrade'),
      $('portalStudentDivision'),
      $('portalStudentShift'),
      $('portalStudentActive'),
      $('portalStudentNotes'),
      $('portalStudentSave'),
      $('portalStudentCancel')
    ].filter(Boolean);
  }

  function setStudentFormEnabled(enabled) {
    studentControls().forEach(function (control) {
      control.disabled = !enabled;
    });
  }

  function clearStudentForm() {
    if ($('portalStudentId')) $('portalStudentId').value = '';
    if ($('portalStudentCode')) $('portalStudentCode').value = '';
    if ($('portalStudentName')) $('portalStudentName').value = '';
    if ($('portalStudentLastName')) $('portalStudentLastName').value = '';
    if ($('portalStudentGrade')) $('portalStudentGrade').value = '';
    if ($('portalStudentDivision')) $('portalStudentDivision').value = '';
    if ($('portalStudentShift')) $('portalStudentShift').value = '';
    if ($('portalStudentActive')) $('portalStudentActive').checked = true;
    if ($('portalStudentNotes')) $('portalStudentNotes').value = '';
  }

  function setStudentMode(mode) {
    portal.studentAction = mode || '';
    var form = $('portalStudentForm');
    var filters = $('portalStudentFilters');
    var newButton = $('portalStudentActionNew');
    var searchButton = $('portalStudentActionSearch');
    setHidden(form, !(mode === 'alta' || mode === 'editar'));
    setHidden(filters, mode !== 'buscar');
    if (newButton) newButton.className = mode === 'alta' ? 'active' : '';
    if (searchButton) searchButton.className = mode === 'buscar' ? 'secondary active' : 'secondary';
  }

  function readStudentFilters() {
    portal.studentFilters = {
      idAlumno: $('portalStudentFilterCode') ? clean($('portalStudentFilterCode').value).toLowerCase() : '',
      apellido: $('portalStudentFilterLastName') ? clean($('portalStudentFilterLastName').value).toLowerCase() : '',
      nombre: $('portalStudentFilterName') ? clean($('portalStudentFilterName').value).toLowerCase() : '',
      grado: $('portalStudentFilterGrade') ? clean($('portalStudentFilterGrade').value) : '',
      turno: $('portalStudentFilterShift') ? clean($('portalStudentFilterShift').value) : '',
      division: $('portalStudentFilterDivision') ? clean($('portalStudentFilterDivision').value).toUpperCase() : '',
      activo: $('portalStudentFilterActive') ? clean($('portalStudentFilterActive').value) : ''
    };
    return portal.studentFilters;
  }

  function hasStudentSearchFilters(filters) {
    return Object.keys(filters || {}).some(function (key) {
      return !!filters[key];
    });
  }

  function studentSearchQuery(filters) {
    return query({
      id_alumno: filters && filters.idAlumno,
      apellido: filters && filters.apellido,
      nombre: filters && filters.nombre,
      grado: filters && filters.grado,
      turno: filters && filters.turno,
      division: filters && filters.division,
      activo: filters && filters.activo
    });
  }

  function filteredStudents(list) {
    var filters = portal.studentFilters || {};
    return (list || []).filter(function (student) {
      if (filters.idAlumno && clean(student.idAlumno).toLowerCase().indexOf(filters.idAlumno) < 0) return false;
      if (filters.apellido && clean(student.apellido).toLowerCase().indexOf(filters.apellido) < 0) return false;
      if (filters.nombre && clean(student.nombre).toLowerCase().indexOf(filters.nombre) < 0) return false;
      if (filters.grado && String(student.grado || '') !== filters.grado) return false;
      if (filters.turno && String(student.turno || '') !== filters.turno) return false;
      if (filters.division && String(student.division || '').toUpperCase() !== filters.division) return false;
      if (filters.activo === 'true' && student.activo !== true) return false;
      if (filters.activo === 'false' && student.activo === true) return false;
      return true;
    });
  }

  function studentPayload() {
    return {
      id_alumno: $('portalStudentCode') ? clean($('portalStudentCode').value) : '',
      nombre: $('portalStudentName') ? clean($('portalStudentName').value) : '',
      apellido: $('portalStudentLastName') ? clean($('portalStudentLastName').value) : '',
      grado: $('portalStudentGrade') ? $('portalStudentGrade').value : '',
      division: $('portalStudentDivision') ? clean($('portalStudentDivision').value).toUpperCase() : '',
      turno: $('portalStudentShift') ? $('portalStudentShift').value : '',
      activo: $('portalStudentActive') ? $('portalStudentActive').checked : true,
      observaciones: $('portalStudentNotes') ? clean($('portalStudentNotes').value) : ''
    };
  }

  function fillStudentForm(student) {
    if (!student) {
      clearStudentForm();
      return;
    }
    if ($('portalStudentId')) $('portalStudentId').value = student.id || '';
    if ($('portalStudentCode')) $('portalStudentCode').value = student.idAlumno || '';
    if ($('portalStudentName')) $('portalStudentName').value = student.nombre || '';
    if ($('portalStudentLastName')) $('portalStudentLastName').value = student.apellido || '';
    if ($('portalStudentGrade')) $('portalStudentGrade').value = student.grado || '';
    if ($('portalStudentDivision')) $('portalStudentDivision').value = student.division || '';
    if ($('portalStudentShift')) $('portalStudentShift').value = student.turno || '';
    if ($('portalStudentActive')) $('portalStudentActive').checked = student.activo === true;
    if ($('portalStudentNotes')) $('portalStudentNotes').value = student.observaciones || '';
  }

  function studentTableRow(student, canEdit, canDeactivate) {
    var row = document.createElement('div');
    row.className = 'portal-table-row portal-student-row';
    row.appendChild(cell('portal-cell-student', valueOrDash(student.idAlumno)));
    row.appendChild(cell('', valueOrDash(student.apellido)));
    row.appendChild(cell('', valueOrDash(student.nombre)));
    row.appendChild(cell('portal-cell-compact', valueOrDash(student.grado)));
    row.appendChild(cell('portal-cell-compact', valueOrDash(student.division)));
    row.appendChild(cell('', valueOrDash(student.turno)));
    row.appendChild(cell('portal-cell-compact', student.activo ? 'SI' : 'NO'));
    row.appendChild(cell('portal-cell-created', valueOrDash(
      (student.creadoPorEmail || 'sin dato') +
      (student.creadoPorRol ? ' | ' + student.creadoPorRol : '') +
      (student.creadoEn ? ' | ' + portalDate(student.creadoEn) : '')
    )));
    var actions = document.createElement('div');
    actions.className = 'portal-row-actions';
    if (canEdit) {
      actions.appendChild(iconButton('edit', 'Editar alumno', 'portal-icon-button secondary', function () {
        setStudentMode('editar');
        fillStudentForm(student);
      }));
    }
    if (student.activo && canDeactivate) {
      actions.appendChild(iconButton('deactivate', 'Desactivar alumno', 'portal-icon-button danger', function () {
        deactivateStudent(student);
      }));
    }
    row.appendChild(actions);
    return row;
  }

  function renderStudents(state, students) {
    var listBox = $('portalStudentsList');
    var form = $('portalStudentForm');
    var allowed = state && state.autorizado && permission(state, 'puede_gestionar_alumnos');
    var canAdd = state && state.autorizado && permission(state, 'puede_agregar_alumnos');
    var canEdit = state && state.autorizado && permission(state, 'puede_editar_alumnos');
    var canDeactivate = state && state.autorizado && permission(state, 'puede_desactivar_alumnos');
    if ($('portalStudentActionNew')) $('portalStudentActionNew').disabled = !canAdd;
    if ($('portalStudentActionSearch')) $('portalStudentActionSearch').disabled = !allowed;
    if ($('portalStudentListar')) $('portalStudentListar').disabled = !allowed;
    if (!listBox) return;
    listBox.innerHTML = '';
    if (form) setHidden(form, !(portal.studentAction === 'alta' || portal.studentAction === 'editar') || !(canAdd || canEdit));
    setStudentFormEnabled(canAdd || canEdit);
    if (!allowed) {
      clearStudentForm();
      setStudentsStatus(state && state.autorizado
        ? 'Su perfil no tiene permiso para gestionar alumnos de apoyo.'
        : 'Inicie sesion para gestionar alumnos de apoyo.', true);
      listBox.textContent = state && state.autorizado ? 'Sin permiso de gestion de alumnos.' : 'Sin sesion autorizada.';
      return;
    }
    var list = filteredStudents(students || portal.alumnosApoyo || []);
    if (portal.studentAction === 'buscar' && !hasStudentSearchFilters(portal.studentFilters || {})) {
      setStudentsStatus('Complete al menos un filtro y presione Listar.');
      listBox.textContent = 'Sin listado cargado.';
      return;
    }
    setStudentsStatus(portal.studentAction === 'buscar'
      ? 'Listado de alumnos - Cantidad: ' + list.length
      : 'Seleccione Altas para cargar o Buscar para consultar alumnos.');
    if (!list.length) {
      listBox.textContent = portal.studentAction === 'buscar' ? 'No hay alumnos para los filtros seleccionados.' : 'Sin listado cargado.';
      return;
    }
    var table = document.createElement('div');
    table.className = 'portal-table portal-student-table';
    ['ID alumno', 'Apellido', 'Nombres', 'G', 'Div.', 'Turno', 'Activo', 'Alta', 'Acciones'].forEach(function (title) {
      table.appendChild(headerCell(title));
    });
    list.forEach(function (student) {
      table.appendChild(studentTableRow(student, canEdit, canDeactivate));
    });
    listBox.appendChild(table);
  }

  function loadStudents() {
    var state = portal.state || {};
    if (!state.autorizado || !permission(state, 'puede_gestionar_alumnos')) {
      renderStudents(state, []);
      return;
    }
    var filters = portal.studentFilters || {};
    if (!hasStudentSearchFilters(filters)) {
      portal.alumnosApoyo = [];
      renderStudents(state, []);
      setStudentsStatus('Complete al menos un filtro y presione Listar.');
      return;
    }
    var qs = studentSearchQuery(filters);
    api('GET', '/api/portal-docente/alumnos-apoyo' + (qs ? '?' + qs : ''), null, function (err, data) {
      if (err) {
        portal.alumnosApoyo = [];
        renderStudents(state, []);
        setStudentsStatus(err.error || 'No se pudieron cargar alumnos de apoyo.', true);
        return;
      }
      portal.alumnosApoyo = data && data.alumnos || [];
      renderStudents(state, portal.alumnosApoyo);
    }, true);
  }

  function loadActivities(listAllRequested) {
    var state = portal.state || {};
    var allowed = state && state.autorizado && portalHasAnyPermission(state, 'puede_visualizar_actividades puede_probar_actividades puede_habilitar_actividades puede_bloquear_actividades');
    if (!allowed) {
      portal.actividades = [];
      renderActivities(state);
      return;
    }
    var filters = portal.activityFilters || {};
    var hasFilters = hasActivitySearchFilters(filters);
    portal.activityListAll = !hasFilters && listAllRequested === true;
    if (!hasFilters && portal.activityListAll !== true) {
      portal.actividades = [];
      renderActivities(state);
      return;
    }
    var box = $('portalActivities');
    if (box) {
      box.innerHTML = '';
      box.textContent = 'Buscando actividades...';
    }
    var qs = activitySearchQuery(filters, portal.activityListAll === true);
    api('GET', '/api/portal-docente/actividades' + (qs ? '?' + qs : ''), null, function (err, data) {
      if (err) {
        portal.actividades = [];
        renderActivities(state);
        setStatus(err.error || 'No se pudieron cargar actividades.', true);
        return;
      }
      portal.actividades = data && data.actividades || [];
      renderActivities(state);
    }, true);
  }

  function renderState(state) {
    portal.state = state || {};
    var config = state && state.configuracion || portal.config || {};
    updatePortalFeatureVisibility(state);
    renderSession(state);
    renderIndex(state);
    renderClassSession(state);
    renderActivities(state);
    renderAccessLog(state);
    renderResults(state, portal.resultados || []);
    renderStudents(state, portal.alumnosApoyo || []);
    renderInterfaces(state);
    if (!state || state.ok === false) {
      setStatus((state && state.error) || 'Portal docente bloqueado por configuracion pendiente.', true);
      return;
    }
    if (state.autorizado) {
      setStatus('Sesion autorizada. Se muestran solo las funcionalidades habilitadas para su rol.');
    } else if (portal.accessToken) {
      setStatus('Sesion pendiente de autorizacion: verifique que el Gmail exista en Perfiles y roles.', true);
    } else if (config.supabase && config.supabase.loginGoogleListo) {
      setStatus('Login Google listo. Inicie sesion con una cuenta autorizada.');
    } else {
      setStatus('Falta configurar anon/publishable key para probar login con Google.', true);
    }
  }

  function loadPortal() {
    setStatus('Cargando portal');
    var tokenCaptured = captureTokenFromHash();
    loadStoredToken();
    api('GET', '/api/portal-docente/config', null, function (configErr, configData) {
      if (configErr) {
        setStatus(configErr.error || 'No se pudo cargar configuracion del portal.', true);
        return;
      }
      portal.config = configData;
      if (tokenCaptured && portal.accessToken) {
        api('POST', '/api/portal-docente/sesion', {}, function (sessionErr) {
          if (sessionErr) {
            setStatus(sessionErr.error || 'No se pudo registrar el acceso del personal.', true);
          }
        }, true);
      }
      api('GET', '/api/portal-docente/estado', null, function (stateErr, stateData) {
        if (stateErr) {
          renderState({
            ok: false,
            configuracion: configData,
            control: {},
            actividades: [],
            accesosRecientes: [],
            error: stateErr.error || 'No se pudo leer estado del portal.'
          });
          return;
        }
        renderState(stateData);
      }, true);
    });
  }

  function login() {
    var url = loginUrl();
    if (!url) {
      setStatus('No se puede iniciar sesion: falta anon/publishable key o URL Supabase.', true);
      return;
    }
    window.location.href = url;
  }

  function logout() {
    clearToken();
    loadPortal();
  }

  function toggleIndex(enabled) {
    var state = portal.state || {};
    var admin = isAdminState(state);
    if (!state.autorizado) {
      setStatus('Debe iniciar sesion con una cuenta autorizada para cambiar el indice.', true);
      return;
    }
    if (!admin && !permission(state, 'puede_habilitar_indice')) {
      setStatus('Su perfil no tiene permiso para cambiar el indice.', true);
      return;
    }
    if (state.control && state.control.bloqueoAdminActivo === true) {
      setStatus('La Habilitacion del Indice de Actividades esta bloqueada por el AIE.', true);
      return;
    }
    enabled = enabled === true;
    var sinceValue = $('portalIndexVigenteDesde') ? $('portalIndexVigenteDesde').value : '';
    if (enabled && sinceValue) {
      var parsedSince = new Date(sinceValue);
      if (Number.isNaN(parsedSince.getTime())) {
        setStatus('F. Desde no tiene una fecha valida.', true);
        return;
      }
      if (parsedSince.getTime() > Date.now() + 60000) {
        setStatus('F. Desde futuro todavia no esta disponible: deje el campo vacio para habilitar desde este momento.', true);
        return;
      }
    }
    setStatus(enabled ? 'Habilitando indice' : 'Deshabilitando indice');
    api('POST', '/api/portal-docente/indice', {
      habilitado: enabled,
      mensaje: enabled ? 'Indice habilitado por personal autorizado.' : 'Indice deshabilitado.',
      vigenteHasta: $('portalIndexVigenteHasta') ? $('portalIndexVigenteHasta').value : '',
      motivo: enabled ? 'Habilitacion desde portal docente publico.' : 'Deshabilitacion desde portal docente publico.'
    }, function (err, data) {
      if (err) {
        setStatus(err.error || 'No se pudo cambiar el indice.', true);
        return;
      }
      renderState(data);
    }, true);
  }

  function startClassSession() {
    var state = portal.state || {};
    if (!state.autorizado || !permission(state, 'puede_habilitar_indice')) {
      setStatus('Su perfil no tiene permiso para abrir sesiones AIE.', true);
      return;
    }
    setStatus('Abriendo sesion AIE');
    api('POST', '/api/portal-docente/sesion-aie', {
      duracionMinutos: $('portalClassSessionDuration') ? $('portalClassSessionDuration').value : '90',
      motivo: $('portalClassSessionReason') ? $('portalClassSessionReason').value : ''
    }, function (err, data) {
      if (err) {
        setStatus(err.error || 'No se pudo abrir la sesion AIE.', true);
        return;
      }
      renderState(data);
      setStatus('Sesion AIE abierta.');
    }, true);
  }

  function closeClassSession() {
    var state = portal.state || {};
    if (!state.autorizado || !permission(state, 'puede_habilitar_indice')) {
      setStatus('Su perfil no tiene permiso para cerrar sesiones AIE.', true);
      return;
    }
    if (!window.confirm('Cerrar la sesion AIE activa?')) return;
    setStatus('Cerrando sesion AIE');
    api('DELETE', '/api/portal-docente/sesion-aie', {
      motivo: $('portalClassSessionReason') ? $('portalClassSessionReason').value : ''
    }, function (err, data) {
      if (err) {
        setStatus(err.error || 'No se pudo cerrar la sesion AIE.', true);
        return;
      }
      renderState(data);
      setStatus('Sesion AIE cerrada.');
    }, true);
  }

  function saveActivity(activity, available, visibleDesde, visibleHasta) {
    var state = portal.state || {};
    var requiredPermission = available ? 'puede_habilitar_actividades' : 'puede_bloquear_actividades';
    if (!state.autorizado || !permission(state, requiredPermission)) {
      setStatus('Su perfil no tiene permiso para modificar actividades.', true);
      return;
    }
    setStatus('Actualizando actividad');
    api('POST', '/api/portal-docente/actividades/' + encodeURIComponent(activity.id), {
      disponible: available === true,
      visibleDesde: visibleDesde || '',
      visibleHasta: visibleHasta || ''
    }, function (err, data) {
      if (err) {
        setStatus(err.error || 'No se pudo actualizar la actividad.', true);
        return;
      }
      renderState(data);
      if (hasActivitySearchFilters(portal.activityFilters || {}) || portal.activityListAll === true) {
        loadActivities(portal.activityListAll === true);
      }
      setStatus('Actividad actualizada correctamente.');
    }, true);
  }

  function setActivityControlsDisabled(disabled) {
    Object.keys(portal.activityControls || {}).forEach(function (id) {
      var control = portal.activityControls[id];
      if (!control) return;
      if (control.available) control.available.disabled = disabled;
      if (control.from) control.from.disabled = disabled;
      if (control.until) control.until.disabled = disabled;
      if (control.save) control.save.disabled = disabled;
    });
    if ($('portalActivitiesUpdateIndex')) $('portalActivitiesUpdateIndex').disabled = disabled;
  }

  function updateIndexFromVisibleActivities() {
    var state = portal.state || {};
    if (!state.autorizado) {
      setStatus('Debe iniciar sesión para actualizar el índice.', true);
      return;
    }
    var controls = Object.keys(portal.activityControls || {}).map(function (id) {
      return portal.activityControls[id];
    }).filter(Boolean);
    if (!controls.length) {
      setStatus('No hay actividades listadas para actualizar.', true);
      return;
    }
    var missingPermission = controls.some(function (control) {
      var available = control.available && control.available.value === 'true';
      var requiredPermission = available ? 'puede_habilitar_actividades' : 'puede_bloquear_actividades';
      return !permission(state, requiredPermission);
    });
    if (missingPermission) {
      setStatus('Su perfil no tiene permisos suficientes para habilitar o bloquear todas las actividades listadas.', true);
      return;
    }
    if (!window.confirm('Actualizar el índice con todas las actividades listadas?')) return;

    var total = controls.length;
    setActivityControlsDisabled(true);
    setStatus('Actualizando índice de actividades');

    function finish(ok, message) {
      setActivityControlsDisabled(false);
      if (!ok) {
        setStatus(message || 'No se pudo actualizar el índice.', true);
        return;
      }
      setStatus('Índice actualizado correctamente. Actividades procesadas: ' + total + '.');
      if (hasActivitySearchFilters(portal.activityFilters || {}) || portal.activityListAll === true) {
        loadActivities(portal.activityListAll === true);
      }
    }

    function next(index) {
      if (index >= controls.length) {
        finish(true);
        return;
      }
      var control = controls[index];
      var activity = control.activity || {};
      var available = control.available && control.available.value === 'true';
      setStatus('Actualizando índice de actividades (' + (index + 1) + '/' + total + ')');
      api('POST', '/api/portal-docente/actividades/' + encodeURIComponent(activity.id), {
        disponible: available,
        visibleDesde: control.from ? control.from.value || '' : '',
        visibleHasta: control.until ? control.until.value || '' : ''
      }, function (err) {
        if (err) {
          finish(false, err.error || 'No se pudo actualizar: ' + (activity.titulo || 'actividad') + '.');
          return;
        }
        next(index + 1);
      }, true);
    }

    next(0);
  }

  function saveStudent(event) {
    event.preventDefault();
    var state = portal.state || {};
    var id = $('portalStudentId') ? $('portalStudentId').value : '';
    var requiredPermission = id ? 'puede_editar_alumnos' : 'puede_agregar_alumnos';
    if (!state.autorizado || !permission(state, requiredPermission)) {
      setStudentsStatus('Su perfil no tiene permiso para guardar alumnos.', true);
      return;
    }
    var method = id ? 'PATCH' : 'POST';
    var path = '/api/portal-docente/alumnos-apoyo' + (id ? '/' + encodeURIComponent(id) : '');
    setStatus('Guardando alumno');
    api(method, path, studentPayload(), function (err) {
      if (err) {
        setStudentsStatus(err.error || 'No se pudo guardar el alumno.', true);
        return;
      }
      clearStudentForm();
      setStudentMode('buscar');
      if (hasStudentSearchFilters(portal.studentFilters || {})) {
        loadStudents();
      } else {
        portal.alumnosApoyo = [];
        renderStudents(portal.state || {}, []);
        setStudentsStatus('Alumno guardado correctamente. Use Buscar y Listar con filtro para consultarlo.');
      }
      setStatus('Activo');
    }, true);
  }

  function deactivateStudent(student) {
    if (!student || !student.id) return;
    if (!permission(portal.state || {}, 'puede_desactivar_alumnos')) {
      setStudentsStatus('Su perfil no tiene permiso para desactivar alumnos.', true);
      return;
    }
    if (!window.confirm('Desactivar alumno ' + (student.idAlumno || '') + '?')) return;
    setStatus('Desactivando alumno');
    api('DELETE', '/api/portal-docente/alumnos-apoyo/' + encodeURIComponent(student.id), null, function (err) {
      if (err) {
        setStudentsStatus(err.error || 'No se pudo desactivar el alumno.', true);
        return;
      }
      setStudentMode('buscar');
      if (hasStudentSearchFilters(portal.studentFilters || {})) {
        loadStudents();
      } else {
        portal.alumnosApoyo = [];
        renderStudents(portal.state || {}, []);
        setStudentsStatus('Alumno desactivado. Use Buscar y Listar con filtro para consultar alumnos.');
      }
      setStatus('Activo');
    }, true);
  }

  function bind() {
    if ($('portalLoginGoogle')) $('portalLoginGoogle').onclick = login;
    if ($('portalLogout')) $('portalLogout').onclick = logout;
    if ($('portalEnableIndex')) $('portalEnableIndex').onclick = function () { toggleIndex(true); };
    if ($('portalDisableIndex')) $('portalDisableIndex').onclick = function () { toggleIndex(false); };
    if ($('portalStartClassSession')) $('portalStartClassSession').onclick = startClassSession;
    if ($('portalCloseClassSession')) $('portalCloseClassSession').onclick = closeClassSession;
    if ($('teacherPortalRefresh')) $('teacherPortalRefresh').onclick = loadPortal;
    if ($('portalStudentForm')) $('portalStudentForm').onsubmit = saveStudent;
    if ($('portalResultsApply')) {
      $('portalResultsApply').innerHTML = '';
      $('portalResultsApply').classList.add('portal-search-icon-button');
      $('portalResultsApply').setAttribute('aria-label', 'Filtrar resultados');
      $('portalResultsApply').title = 'Filtrar resultados';
      $('portalResultsApply').appendChild(actionIcon('search'));
      $('portalResultsApply').onclick = loadResults;
    }
    if ($('portalResultsExport')) $('portalResultsExport').onclick = exportResultsCsv;
    if ($('portalActivitiesSearch')) {
      $('portalActivitiesSearch').innerHTML = '';
      $('portalActivitiesSearch').classList.add('portal-search-icon-button');
      $('portalActivitiesSearch').setAttribute('aria-label', 'Buscar');
      $('portalActivitiesSearch').title = 'Buscar';
      $('portalActivitiesSearch').appendChild(actionIcon('search'));
      $('portalActivitiesSearch').onclick = function () {
        readActivityFilters();
        loadActivities(true);
      };
    }
    if ($('portalActivitiesClear')) {
      $('portalActivitiesClear').onclick = function () {
        clearActivityFilters();
        portal.actividades = [];
        portal.activityControls = {};
        renderActivities(portal.state || {});
      };
    }
    if ($('portalActivitiesUpdateIndex')) {
      $('portalActivitiesUpdateIndex').onclick = updateIndexFromVisibleActivities;
    }
    if ($('portalStudentActionNew')) {
      $('portalStudentActionNew').onclick = function () {
        clearStudentForm();
        setStudentMode('alta');
        renderStudents(portal.state || {}, portal.alumnosApoyo || []);
        setStudentsStatus('Alta de alumno.');
      };
    }
    if ($('portalStudentActionSearch')) {
      $('portalStudentActionSearch').onclick = function () {
        setStudentMode('buscar');
        portal.alumnosApoyo = [];
        renderStudents(portal.state || {}, []);
        setStudentsStatus('Complete al menos un filtro y presione Listar.');
      };
    }
    if ($('portalStudentListar')) {
      $('portalStudentListar').onclick = function () {
        setStudentMode('buscar');
        readStudentFilters();
        loadStudents();
      };
    }
    var studentFilterInputs = document.querySelectorAll('#portalStudentFilters input, #portalStudentFilters select');
    for (var studentFilterIndex = 0; studentFilterIndex < studentFilterInputs.length; studentFilterIndex++) {
      studentFilterInputs[studentFilterIndex].onkeydown = function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          setStudentMode('buscar');
          readStudentFilters();
          loadStudents();
        }
      };
    }
    var activityFilterInputs = document.querySelectorAll('#portalActivityFilters input, #portalActivityFilters select');
    for (var activityFilterIndex = 0; activityFilterIndex < activityFilterInputs.length; activityFilterIndex++) {
      activityFilterInputs[activityFilterIndex].onkeydown = function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          readActivityFilters();
          loadActivities(true);
        }
      };
    }
    var resultFilterInputs = document.querySelectorAll('.portal-results-controls input, .portal-results-controls select');
    for (var resultFilterIndex = 0; resultFilterIndex < resultFilterInputs.length; resultFilterIndex++) {
      resultFilterInputs[resultFilterIndex].onkeydown = function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          loadResults();
        }
      };
    }
    if ($('portalStudentCancel')) {
      $('portalStudentCancel').onclick = function () {
        clearStudentForm();
        setStudentMode('');
        portal.alumnosApoyo = [];
        renderStudents(portal.state || {}, []);
        setStudentsStatus('Operacion cancelada.');
      };
    }
  }

  bind();
  loadPortal();
}());
