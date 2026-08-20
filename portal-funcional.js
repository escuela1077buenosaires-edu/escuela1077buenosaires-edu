(function () {
  'use strict';

  var SESSION_KEY = 'aiePortalHub1077AccessToken';
  var PENDING_KEY = 'aiePortalHub1077PendingLogin';
  var ROLE_CONTEXT_KEY = 'aiePortal1077RoleContext';
  var state = {
    accessToken: '',
    profile: null,
    roles: [],
    activeRole: null,
    selecting: false
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

  function setHidden(element, hidden) {
    if (!element) return;
    element.classList.toggle('hub-hidden', hidden === true);
  }

  function setStatus(message, type) {
    var box = $('portalFunctionalStatus');
    if (!box) return;
    box.textContent = message;
    box.className = 'hub-status' + (type ? ' ' + type : '');
  }

  function roleLabel(role) {
    var value = clean(role).toLowerCase();
    if (value === 'administrador') return 'Administrador del Sistema';
    if (value === 'drt') return 'Docente DRT';
    if (value === 'docente') return 'Docente de Grado';
    if (value === 'directora') return 'Personal Directivo';
    if (value === 'supervisora') return 'Personal de Supervisi\u00f3n';
    return value || 'Funci\u00f3n';
  }

  function shiftLabel(shift) {
    var value = clean(shift).toLowerCase();
    if (value === 'manana') return 'Ma\u00f1ana';
    if (value === 'tarde') return 'Tarde';
    if (value === 'vespertino') return 'Vespertino';
    return '';
  }

  function daysLabel(days) {
    var values = (days || []).map(Number).filter(function (day) { return day >= 1 && day <= 7; });
    var names = { 1: 'lun.', 2: 'mar.', 3: 'mi\u00e9.', 4: 'jue.', 5: 'vie.', 6: 's\u00e1b.', 7: 'dom.' };
    if (values.join(',') === '1,2,3,4,5') return 'lunes a viernes';
    if (values.join(',') === '1,2,3,4,5,6,7') return 'todos los d\u00edas';
    return values.map(function (day) { return names[day]; }).join(', ');
  }

  function roleScheduleLabel(role) {
    var groups = {};
    var windows = Array.isArray(role && role.horarios) ? role.horarios : [];
    var heading = roleLabel(role && role.rol);
    var shift = shiftLabel(role && role.turno);
    windows.forEach(function (window) {
      var from = clean(window && window.desde).slice(0, 5);
      var to = clean(window && window.hasta).slice(0, 5);
      var key = from + '|' + to;
      if (!groups[key]) groups[key] = { from: from, to: to, days: [] };
      (window && window.dias || []).forEach(function (day) {
        if (groups[key].days.indexOf(Number(day)) < 0) groups[key].days.push(Number(day));
      });
    });
    var detail = Object.keys(groups).map(function (key) {
      var group = groups[key];
      group.days.sort(function (a, b) { return a - b; });
      return daysLabel(group.days) + ' de ' + group.from + ' a ' + group.to;
    }).join('; ');
    return heading + (shift ? ' (' + shift + ')' : '') + ': ' + (detail || 'sin restricci\u00f3n horaria');
  }

  function assignedSchedulesLabel() {
    return state.roles.map(roleScheduleLabel).join(' | ');
  }

  function targetSessionKey(target) {
    if (target === 'portal') return 'aiePortal1077AccessToken';
    if (target === 'qr') return 'aieQr1077AccessToken';
    if (target === 'solicitud') return 'aieSolicitud1077AccessToken';
    return '';
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
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  function loadToken() {
    var store = storage();
    if (!state.accessToken && store) state.accessToken = store.getItem(SESSION_KEY) || '';
  }

  function clearTokens() {
    var store = storage();
    state.accessToken = '';
    state.profile = null;
    state.roles = [];
    state.activeRole = null;
    if (!store) return;
    [SESSION_KEY, PENDING_KEY, ROLE_CONTEXT_KEY, 'aiePortal1077AccessToken', 'aieQr1077AccessToken', 'aieSolicitud1077AccessToken'].forEach(function (key) {
      store.removeItem(key);
    });
  }

  function rootCallbackUrl() {
    var path = window.location.pathname.replace(/portal-funcional\.html$/i, '');
    return window.location.origin + path;
  }

  function startLogin() {
    var runtime = window.AIE_RUNTIME;
    var store = storage();
    var url;
    if (!runtime || !runtime.supabaseReady()) {
      setStatus('El inicio de sesi\u00f3n no est\u00e1 configurado.', 'error');
      return;
    }
    if (store) store.setItem(PENDING_KEY, '1');
    url = runtime.supabaseLoginUrl(rootCallbackUrl());
    if (!url) {
      setStatus('No se pudo preparar el inicio de sesi\u00f3n.', 'error');
      return;
    }
    window.location.assign(url);
  }

  function rpc(name, payload) {
    return new Promise(function (resolve, reject) {
      window.AIE_RUNTIME.supabaseRpc(name, payload || {}, state.accessToken, function (error, body) {
        if (error) {
          reject(new Error(error.error || error.message || 'No se pudo validar la sesi\u00f3n.'));
          return;
        }
        resolve(body || {});
      });
    });
  }

  function permission(role, name) {
    if (!role) return false;
    if (clean(role.rol).toLowerCase() === 'administrador') return true;
    return !!(role.permisos && role.permisos[name] === true);
  }

  function addCard(options) {
    var grid = $('portalFunctionalCards');
    var link = document.createElement('a');
    var icon = document.createElement('div');
    var badge = document.createElement('small');
    var title = document.createElement('strong');
    var description = document.createElement('span');
    link.className = 'hub-card';
    link.href = options.href;
    icon.className = 'hub-icon';
    icon.textContent = options.icon;
    badge.textContent = options.badge || 'Autorizado';
    title.textContent = options.title;
    description.textContent = options.description || '';
    link.appendChild(icon);
    link.appendChild(badge);
    link.appendChild(title);
    if (options.description) link.appendChild(description);
    if (options.target) {
      link.addEventListener('click', function (event) {
        var store = storage();
        var key = targetSessionKey(options.target);
        event.preventDefault();
        if (store && key) store.setItem(key, state.accessToken);
        if (store && state.activeRole) store.setItem(ROLE_CONTEXT_KEY, clean(state.activeRole.rol).toLowerCase());
        window.location.assign(options.href);
      });
    } else if (/^https:/i.test(options.href)) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    grid.appendChild(link);
  }

  function renderCards() {
    var role = state.activeRole;
    var grid = $('portalFunctionalCards');
    var tools = $('portalFunctionalTools');
    var roleName;
    if (!grid || !role) {
      setHidden(tools, true);
      return;
    }
    grid.innerHTML = '';
    roleName = clean(role.rol).toLowerCase();

    if (!permission(role, 'puede_ver_portal_funcional')) {
      setHidden(tools, true);
      setStatus('La funci\u00f3n seleccionada no tiene habilitado el acceso al Portal Funcional.', 'warning');
      return;
    }

    if (['administrador', 'drt', 'directora', 'supervisora'].indexOf(roleName) >= 0) {
      addCard({
        icon: roleName === 'administrador' ? 'ADM' : roleName === 'drt' ? 'DRT' : roleName === 'directora' ? 'DIR' : 'SUP',
        title: roleLabel(roleName),
        description: 'Herramientas de gesti\u00f3n, seguimiento y control habilitadas para esta funci\u00f3n.',
        href: 'portal-docente.html?rol=' + encodeURIComponent(roleName),
        target: 'portal'
      });
    }

    if (permission(role, 'puede_solicitar_actividades')) {
      addCard({
        icon: 'SOL',
        title: 'Solicitud de Creaci\u00f3n de Actividades',
        description: 'Pedido de nuevas actividades educativas.',
        href: 'solicitud-actividad.html',
        target: 'solicitud'
      });
    }

    if (permission(role, 'puede_usar_lector_qr')) {
      addCard({
        icon: 'QR',
        title: 'Lector QR',
        description: 'Escaneo desde celular para registrar resultados en la Base de Datos.',
        href: 'lector-qr.html',
        target: 'qr'
      });
    }

    if (permission(role, 'puede_ver_indice_alumnos')) {
      addCard({
        icon: 'AL',
        title: 'Actividades habilitadas',
        description: '\u00cdndice de actividades que pueden ver los alumnos.',
        href: 'alumnos.html'
      });
    }

    addCard({
      icon: 'BLOG',
      title: 'Blog de la Escuela',
      description: 'Acceso a publicaciones educativas.',
      href: 'https://periodicoescuelabsas.blogspot.com/2025/05/como-crecen-las-plantas-alguna-vez-te.html'
    });
    addCard({
      icon: 'AYUDA',
      title: 'Ayuda - Resoluci\u00f3n de Actividades Eduten',
      description: 'Explicaciones de apoyo para resolver actividades.',
      href: 'https://escuela1077buenosaires-edu.github.io/explicaciones-1077/'
    });

    if (roleName === 'administrador') {
      addCard({
        icon: 'AIE',
        title: 'Administrador del Sistema',
        description: 'Funcionalidades locales reservadas al AIE.',
        href: 'http://localhost:3131/#admin'
      });
    }

    setHidden(tools, false);
  }

  function renderRoleSelector() {
    var select = $('portalFunctionalRole');
    var wrap = $('portalFunctionalRoleWrap');
    select.innerHTML = '';
    if (!state.activeRole && state.roles.length) {
      var placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Fuera del horario habilitado';
      placeholder.disabled = true;
      placeholder.selected = true;
      select.appendChild(placeholder);
    }
    state.roles.forEach(function (role) {
      var option = document.createElement('option');
      var shift = shiftLabel(role.turno);
      option.value = role.id;
      option.textContent = roleLabel(role.rol) + (shift ? ' - ' + shift : '') + (role.disponibleAhora ? '' : ' - fuera de horario');
      option.disabled = role.disponibleAhora !== true;
      option.selected = state.activeRole && role.id === state.activeRole.id;
      select.appendChild(option);
    });
    select.disabled = state.selecting || state.roles.filter(function (role) { return role.disponibleAhora === true; }).length < 2;
    setHidden(wrap, state.roles.length === 0);
  }

  function renderAuthenticated() {
    var role = state.activeRole;
    $('portalFunctionalLogin').disabled = true;
    $('portalFunctionalLogout').disabled = false;
    $('portalFunctionalName').textContent = clean(state.profile && state.profile.nombre) || 'Personal autorizado';
    $('portalFunctionalEmail').textContent = clean(state.profile && state.profile.email);
    $('portalFunctionalSchedule').textContent = role
      ? roleScheduleLabel(role)
      : 'Funciones y horarios asignados: ' + assignedSchedulesLabel() + '.';
    setHidden($('portalFunctionalSession'), false);
    renderRoleSelector();
    if (!role) {
      setStatus('Fuera del horario habilitado, no se ver\u00e1n las funcionalidades a las que tiene acceso.', 'warning');
      setHidden($('portalFunctionalTools'), true);
      return;
    }
    setStatus('Sesi\u00f3n autorizada como ' + roleLabel(role.rol) + '.', 'ok');
    renderCards();
  }

  function loadRoles() {
    setStatus('Validando cuenta, funciones, horario y permisos...', '');
    return rpc('aie_1077_roles_disponibles', {}).then(function (result) {
      var roles = Array.isArray(result.roles) ? result.roles : [];
      var available = roles.filter(function (role) { return role.disponibleAhora === true; });
      var selected = roles.find(function (role) { return role.seleccionado === true && role.disponibleAhora === true; });
      state.profile = { nombre: result.nombre || '', email: result.email || '' };
      state.roles = roles;
      state.activeRole = selected || available[0] || null;

      if (state.activeRole && !state.activeRole.permisos) {
        throw new Error('La actualizaci\u00f3n de permisos del Portal Funcional todav\u00eda no fue aplicada.');
      }

      if (state.activeRole && !state.activeRole.seleccionado) {
        return rpc('aie_1077_seleccionar_rol', { p_perfil_rol_id: state.activeRole.id }).then(function () {
          state.roles.forEach(function (role) { role.seleccionado = role.id === state.activeRole.id; });
          renderAuthenticated();
        });
      }
      renderAuthenticated();
      return null;
    }).catch(function (error) {
      state.profile = null;
      state.roles = [];
      state.activeRole = null;
      setStatus(error.message || 'La cuenta no est\u00e1 autorizada.', 'error');
      setHidden($('portalFunctionalSession'), true);
      setHidden($('portalFunctionalRoleWrap'), true);
      setHidden($('portalFunctionalTools'), true);
      $('portalFunctionalLogin').disabled = false;
      $('portalFunctionalLogout').disabled = false;
    });
  }

  function selectRole(roleId) {
    var role = state.roles.find(function (item) { return item.id === roleId; });
    if (!role || role.disponibleAhora !== true || state.selecting) return;
    state.selecting = true;
    renderRoleSelector();
    setStatus('Cambiando funci\u00f3n activa...', '');
    rpc('aie_1077_seleccionar_rol', { p_perfil_rol_id: role.id }).then(function () {
      state.activeRole = role;
      state.roles.forEach(function (item) { item.seleccionado = item.id === role.id; });
      state.selecting = false;
      renderAuthenticated();
    }).catch(function (error) {
      state.selecting = false;
      setStatus(error.message || 'No se pudo seleccionar la funci\u00f3n.', 'error');
      renderRoleSelector();
    });
  }

  function logout() {
    clearTokens();
    $('portalFunctionalLogin').disabled = false;
    $('portalFunctionalLogout').disabled = true;
    setHidden($('portalFunctionalSession'), true);
    setHidden($('portalFunctionalRoleWrap'), true);
    setHidden($('portalFunctionalTools'), true);
    setStatus('Sesi\u00f3n cerrada.', '');
  }

  function initCover() {
    var config = window.AIE_PUBLIC_CONFIG || {};
    var coverPath = config.imagenSuperior || '';
    var cover = $('hubCover');
    var image = $('hubCoverImage');
    if (!coverPath || !cover || !image) return;
    image.onload = function () { cover.classList.add('show'); cover.setAttribute('aria-hidden', 'false'); };
    image.onerror = function () { cover.classList.remove('show'); cover.setAttribute('aria-hidden', 'true'); };
    image.src = coverPath;
  }

  function wantsLogin() {
    try {
      return new URLSearchParams(window.location.search || '').get('login') === '1';
    } catch (error) {
      return false;
    }
  }

  function init() {
    initCover();
    captureToken();
    loadToken();
    $('portalFunctionalLogin').addEventListener('click', startLogin);
    $('portalFunctionalLogout').addEventListener('click', logout);
    $('portalFunctionalRole').addEventListener('change', function () { selectRole(this.value); });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('aie-hub-sw.js').catch(function () {});
    }

    if (state.accessToken) {
      loadRoles();
    } else if (wantsLogin()) {
      startLogin();
    }
  }

  init();
}());
