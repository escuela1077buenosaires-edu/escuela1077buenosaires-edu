(function () {
  var sessionKey = 'aiePortal1077AccessToken';
  var DEFAULT_INDEX_MINUTES = 90;
  var portal = {
    config: null,
    state: null,
    accessToken: '',
    alumnosApoyo: [],
    resultados: [],
    studentAction: '',
    studentFilters: {
      idAlumno: '',
      apellido: '',
      nombre: '',
      grado: '',
      turno: '',
      division: ''
    },
    activityFilters: {
      titulo: '',
      area: '',
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

  function isDefaultUnauthorizedMessage(value) {
    var text = clean(value).toLowerCase();
    return text.indexOf('no estas autorizado') >= 0 && text.indexOf('profe jose') >= 0;
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
        return rpc('aie_1077_alumnos_apoyo_listar', {}, callback, authenticated);
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
    return date.toLocaleString();
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
      open: ['M14 3h7v7', 'M21 3l-9 9', 'M5 5h6', 'M5 5v14h14v-6']
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
      box.textContent = 'Inicie sesion con Google para ver las funcionalidades habilitadas.';
      box.className = 'portal-permission-summary';
      return;
    }
    var groups = [
      ['Alumnos', ['puede_agregar_alumnos', 'puede_editar_alumnos', 'puede_desactivar_alumnos', 'puede_eliminar_alumnos', 'puede_gestionar_alumnos']],
      ['Actividades', ['puede_visualizar_actividades', 'puede_probar_actividades', 'puede_habilitar_actividades', 'puede_bloquear_actividades', 'puede_habilitar_indice']],
      ['Resultados', ['puede_ver_resultados', 'puede_exportar_resultados', 'puede_ver_analiticas_generales', 'puede_ver_analiticas_alumno']],
      ['Interfaces', ['puede_usar_lector_qr', 'puede_ver_indice_alumnos', 'puede_ver_portal_funcional']]
    ];
    var enabled = groups.filter(function (group) {
      return isAdminState(state) || permissionAny(state, group[1]);
    }).map(function (group) {
      return group[0];
    });
    box.textContent = (state.perfil.rol === 'drt' ? 'Panel DRT' : 'Panel por permisos') + ': ' + (enabled.join(' | ') || 'sin funcionalidades habilitadas');
    box.className = 'portal-permission-summary';
  }

  function stateBadge(enabled) {
    var span = document.createElement('span');
    span.className = enabled ? 'publication-state publication-state-publicada' : 'publication-state publication-state-fallida';
    span.textContent = enabled ? 'Indice habilitado' : 'Indice cerrado';
    return span;
  }

  function classSessionBadge(classSession) {
    classSession = classSession || {};
    var active = classSession.activo === true;
    var span = document.createElement('span');
    span.className = active ? 'publication-state publication-state-publicada' : 'publication-state publication-state-fallida';
    span.textContent = classSession.requerido === false
      ? 'Control preparado'
      : classSession.soportado === false
      ? 'Migracion pendiente'
      : active ? 'Sesion AIE activa' : 'Sin sesion AIE';
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
    login.disabled = !loginUrl();
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
      var permissions = document.createElement('span');
      permissions.textContent = 'Permisos: ' + Object.keys(state.perfil.permisos || {}).filter(function (key) {
        return state.perfil.permisos[key] === true;
      }).join(', ');
      box.appendChild(permissions);
      return;
    }
    var lines = [];
    lines.push(portal.accessToken ? 'Sesion local detectada, pendiente de autorizacion.' : 'Sin sesion docente.');
    lines.push(supabase.loginGoogleListo ? 'Login Google preparado.' : 'Falta anon/publishable key para habilitar Google.');
    lines.push('Roles permitidos: ' + ((config.rolesPermitidos || []).join(', ') || 'sin datos') + '.');
    box.textContent = lines.join(' ');
  }

  function renderIndex(state) {
    var box = $('portalIndexState');
    var message = $('portalIndexMessage');
    var until = $('portalIndexVigenteHasta');
    var toggle = $('portalToggleIndex');
    if (!box || !message || !until || !toggle) return;
    var control = state && state.control || {};
    var admin = isAdminState(state);
    var enabled = control.habilitado === true;
    var adminBlocked = control.bloqueoAdminActivo === true;
    box.innerHTML = '';
    box.appendChild(stateBadge(enabled));
    var detail = document.createElement('div');
    detail.className = 'portal-detail';
    detail.textContent = adminBlocked
      ? 'La Habilitacion del Indice de Actividades esta bloqueada por el AIE.'
      : enabled
      ? 'Los alumnos pueden ver el indice mientras no venza la fecha configurada.'
      : admin
        ? 'El indice esta cerrado para alumnos. Su perfil administrador puede habilitarlo sin restriccion horaria.'
        : 'Los alumnos no deben ver el indice de actividades.';
    box.appendChild(detail);
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
        ? 'La habilitacion para alumnos esta vencida; puede habilitarla nuevamente.'
        : 'La habilitacion esta vencida.';
      box.appendChild(expired);
    }
    if (control.actualizadoEn) {
      var updated = document.createElement('div');
      updated.className = 'portal-muted';
      updated.textContent = 'Actualizado: ' + portalDate(control.actualizadoEn);
      box.appendChild(updated);
    }
    message.value = admin && isDefaultUnauthorizedMessage(control.mensaje) ? '' : control.mensaje || '';
    message.placeholder = admin
      ? 'Mensaje visible para alumnos o perfiles sin acceso.'
      : 'Mensaje breve para docentes/alumnos.';
    until.value = enabled ? dateInputValue(control.vigenteHasta) : '';
    toggle.textContent = enabled ? 'Deshabilitar indice' : 'Habilitar indice';
    toggle.disabled = adminBlocked || !(state && state.autorizado && (admin || permission(state, 'puede_habilitar_indice')) && state.configuracion && state.configuracion.supabase.backendListo);
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
    detail.textContent = classSession.mensaje || 'La sesion AIE limita el indice de alumnos durante una clase.';
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
      pending.textContent = 'Falta aplicar la migracion de sesiones AIE en Supabase.';
      box.appendChild(pending);
    } else if (classSession.requerido === false) {
      var inactive = document.createElement('div');
      inactive.className = 'portal-muted';
      inactive.textContent = 'Para exigir sesiones, aplicar la migracion y activar sesionesAieObligatorias.';
      box.appendChild(inactive);
    }
    start.disabled = !allowed;
    close.disabled = !allowed || !active;
  }

  function activityControls(activity) {
    var controls = document.createElement('div');
    controls.className = 'portal-activity-controls';
    var availableLabel = document.createElement('label');
    var available = document.createElement('input');
    available.type = 'checkbox';
    available.checked = activity.disponible === true;
    availableLabel.appendChild(available);
    availableLabel.appendChild(document.createTextNode(' Disponible para alumnos'));
    controls.appendChild(availableLabel);

    var fromLabel = document.createElement('label');
    fromLabel.textContent = 'Visible desde';
    var from = document.createElement('input');
    from.type = 'datetime-local';
    from.value = dateInputValue(activity.visibleDesde);
    fromLabel.appendChild(from);
    controls.appendChild(fromLabel);

    var untilLabel = document.createElement('label');
    untilLabel.textContent = 'Visible hasta';
    var until = document.createElement('input');
    until.type = 'datetime-local';
    until.value = dateInputValue(activity.visibleHasta);
    untilLabel.appendChild(until);
    controls.appendChild(untilLabel);

    var save = document.createElement('button');
    save.type = 'button';
    save.className = 'secondary compact-button';
    save.textContent = 'Guardar disponibilidad';
    save.onclick = function () {
      saveActivity(activity, available.checked, from.value, until.value);
    };
    controls.appendChild(save);
    return controls;
  }

  function readActivityFilters() {
    portal.activityFilters = {
      titulo: $('portalActivityFilterTitle') ? clean($('portalActivityFilterTitle').value).toLowerCase() : '',
      area: $('portalActivityFilterArea') ? clean($('portalActivityFilterArea').value).toLowerCase() : '',
      grado: $('portalActivityFilterGrade') ? clean($('portalActivityFilterGrade').value) : '',
      tipo: $('portalActivityFilterType') ? clean($('portalActivityFilterType').value) : '',
      disponible: $('portalActivityFilterAvailable') ? clean($('portalActivityFilterAvailable').value) : ''
    };
    return portal.activityFilters;
  }

  function clearActivityFilters() {
    portal.activityFilters = { titulo: '', area: '', grado: '', tipo: '', disponible: '' };
    if ($('portalActivityFilterTitle')) $('portalActivityFilterTitle').value = '';
    if ($('portalActivityFilterArea')) $('portalActivityFilterArea').value = '';
    if ($('portalActivityFilterGrade')) $('portalActivityFilterGrade').value = '';
    if ($('portalActivityFilterType')) $('portalActivityFilterType').value = '';
    if ($('portalActivityFilterAvailable')) $('portalActivityFilterAvailable').value = '';
  }

  function filteredActivities(list) {
    var filters = portal.activityFilters || {};
    return (list || []).filter(function (activity) {
      if (filters.titulo && clean(activity.titulo).toLowerCase().indexOf(filters.titulo) < 0) return false;
      if (filters.area && clean(activity.area).toLowerCase().indexOf(filters.area) < 0) return false;
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
      box.textContent = state && state.autorizado ? 'Sin permiso para visualizar actividades.' : 'Inicie sesion para ver actividades.';
      return;
    }
    var list = filteredActivities(state && state.actividades || []);
    if (!list.length) {
      box.textContent = state && state.autorizado
        ? 'No hay actividades registradas para los filtros seleccionados.'
        : 'Indice cerrado o sin sesion autorizada. No se listan actividades para alumnos.';
      return;
    }
    list.forEach(function (activity) {
      var item = document.createElement('div');
      item.className = 'portal-list-item';
      var title = document.createElement('strong');
      title.textContent = activity.titulo || activity.codigo || activity.id;
      var meta = document.createElement('span');
      meta.textContent = 'Grado ' + activity.grado + ' | ' + activity.area + ' | Tipo ' + activity.tipo + ' | Estado ' + activity.estado;
      var availability = document.createElement('span');
      availability.textContent = 'Disponible: ' + (activity.disponible ? 'si' : 'no') +
        ' | Desde: ' + (portalDate(activity.visibleDesde) || 'sin fecha') +
        ' | Hasta: ' + (portalDate(activity.visibleHasta) || 'sin fecha');
      item.appendChild(title);
      item.appendChild(activityBadge(activity));
      item.appendChild(meta);
      item.appendChild(availability);
      var actions = document.createElement('div');
      actions.className = 'portal-row-actions';
      var url = activityPublicUrl(activity);
      if (url && state && state.autorizado && permission(state, 'puede_probar_actividades')) {
        actions.appendChild(iconButton('open', 'Probar actividad', 'portal-icon-button secondary', function () {
          window.open(url, '_blank', 'noopener');
        }));
      }
      if (state && state.autorizado && permissionAny(state, ['puede_habilitar_actividades', 'puede_bloquear_actividades'])) {
        item.appendChild(activityControls(activity));
      }
      if (actions.childNodes.length) item.appendChild(actions);
      box.appendChild(item);
    });
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
    var list = results || portal.resultados || [];
    if (exportButton) exportButton.disabled = !permission(state, 'puede_exportar_resultados') || !list.length;
    setResultsStatus('Ultimos ' + list.length + ' resultado(s) registrados.');
    if (!list.length) {
      box.textContent = 'No hay resultados registrados.';
      return;
    }
    list.forEach(function (result) {
      var item = document.createElement('div');
      item.className = 'portal-list-item';
      var title = document.createElement('strong');
      title.textContent = 'Alumno ' + (result.alumnoId || '-') + ' | Nota ' + (result.nota == null ? '-' : result.nota);
      var activity = document.createElement('span');
      activity.textContent = 'Actividad: ' + (result.actividadTitulo || result.actividadCodigo || result.actividadId || '-');
      var score = document.createElement('span');
      score.textContent = 'Ejercicios: ' + (result.cantidadEjercicios || '-') +
        ' | Correctos: ' + result.correctos +
        ' | Incorrectos: ' + result.incorrectos +
        ' | Tiempo: ' + (result.tiempoMinutos == null ? '-' : result.tiempoMinutos + ' min');
      var meta = document.createElement('span');
      meta.textContent = resultMeta(result);
      item.appendChild(title);
      item.appendChild(activity);
      item.appendChild(score);
      item.appendChild(meta);
      box.appendChild(item);
    });
  }

  function resultFilters() {
    return {
      alumno: $('portalResultsStudentFilter') ? clean($('portalResultsStudentFilter').value) : '',
      limit: $('portalResultsLimit') ? $('portalResultsLimit').value : '50'
    };
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
    var list = portal.resultados || [];
    if (!list.length) {
      setResultsStatus('No hay resultados cargados para exportar.', true);
      return;
    }
    var headers = [
      'alumno_id',
      'actividad',
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
        result.actividadTitulo || result.actividadCodigo || result.actividadId,
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
    var qs = query(resultFilters());
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
      division: $('portalStudentFilterDivision') ? clean($('portalStudentFilterDivision').value).toUpperCase() : ''
    };
    return portal.studentFilters;
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
    setStudentsStatus(portal.studentAction === 'buscar'
      ? 'Listado de alumnos - Cantidad: ' + list.length
      : 'Seleccione Altas para cargar o Buscar para consultar alumnos.');
    if (!list.length) {
      listBox.textContent = portal.studentAction === 'buscar' ? 'No hay alumnos para los filtros seleccionados.' : 'Sin listado cargado.';
      return;
    }
    list.forEach(function (student) {
      var item = document.createElement('div');
      item.className = 'portal-list-item';
      var title = document.createElement('strong');
      title.textContent = (student.idAlumno || '') + ' | ' + [student.apellido, student.nombre].filter(Boolean).join(', ');
      var meta = document.createElement('span');
      meta.textContent = 'Grado ' + (student.grado || '-') + ' | Division ' + (student.division || '-') + ' | Turno ' + (student.turno || '-') + ' | ' + (student.activo ? 'activo' : 'inactivo');
      item.appendChild(title);
      item.appendChild(meta);
      var created = document.createElement('span');
      created.className = 'portal-created-by';
      created.textContent = 'Alta: ' +
        (student.creadoPorEmail || 'sin dato') +
        (student.creadoPorRol ? ' | ' + student.creadoPorRol : '') +
        (student.creadoEn ? ' | ' + portalDate(student.creadoEn) : '');
      item.appendChild(created);
      if (student.observaciones) {
        var notes = document.createElement('span');
        notes.textContent = student.observaciones;
        item.appendChild(notes);
      }
      var actions = document.createElement('div');
      actions.className = 'portal-actions';
      if (canEdit) {
        var edit = iconButton('edit', 'Editar alumno', 'portal-icon-button secondary', function () {
          setStudentMode('editar');
          fillStudentForm(student);
        });
        actions.appendChild(edit);
      }
      if (student.activo && canDeactivate) {
        var deactivate = iconButton('deactivate', 'Desactivar alumno', 'portal-icon-button danger', function () {
          deactivateStudent(student);
        });
        actions.appendChild(deactivate);
      }
      item.appendChild(actions);
      listBox.appendChild(item);
    });
  }

  function loadStudents() {
    var state = portal.state || {};
    if (!state.autorizado || !permission(state, 'puede_gestionar_alumnos')) {
      renderStudents(state, []);
      return;
    }
    api('GET', '/api/portal-docente/alumnos-apoyo', null, function (err, data) {
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

  function toggleIndex() {
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
    var enabled = !(state.control && state.control.habilitado === true);
    setStatus(enabled ? 'Habilitando indice' : 'Deshabilitando indice');
    api('POST', '/api/portal-docente/indice', {
      habilitado: enabled,
      mensaje: $('portalIndexMessage') ? $('portalIndexMessage').value : '',
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
      setStatus('Actividad actualizada correctamente.');
    }, true);
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
      setStudentsStatus('Alumno guardado correctamente.');
      setStudentMode('buscar');
      loadStudents();
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
      setStudentsStatus('Alumno desactivado.');
      setStudentMode('buscar');
      loadStudents();
      setStatus('Activo');
    }, true);
  }

  function bind() {
    if ($('portalLoginGoogle')) $('portalLoginGoogle').onclick = login;
    if ($('portalLogout')) $('portalLogout').onclick = logout;
    if ($('portalToggleIndex')) $('portalToggleIndex').onclick = toggleIndex;
    if ($('portalStartClassSession')) $('portalStartClassSession').onclick = startClassSession;
    if ($('portalCloseClassSession')) $('portalCloseClassSession').onclick = closeClassSession;
    if ($('teacherPortalRefresh')) $('teacherPortalRefresh').onclick = loadPortal;
    if ($('portalStudentForm')) $('portalStudentForm').onsubmit = saveStudent;
    if ($('portalResultsApply')) $('portalResultsApply').onclick = loadResults;
    if ($('portalResultsExport')) $('portalResultsExport').onclick = exportResultsCsv;
    if ($('portalActivitiesSearch')) {
      $('portalActivitiesSearch').onclick = function () {
        readActivityFilters();
        renderActivities(portal.state || {});
      };
    }
    if ($('portalActivitiesClear')) {
      $('portalActivitiesClear').onclick = function () {
        clearActivityFilters();
        renderActivities(portal.state || {});
      };
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
        readStudentFilters();
        loadStudents();
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
          renderActivities(portal.state || {});
        }
      };
    }
    if ($('portalStudentCancel')) {
      $('portalStudentCancel').onclick = function () {
        clearStudentForm();
        setStudentMode('alta');
        setStudentsStatus('Alta de alumno.');
      };
    }
  }

  bind();
  loadPortal();
}());
