(function () {
  var lastIndexData = null;

  function $(id) {
    return document.getElementById(id);
  }

  function text(value) {
    return String(value == null ? '' : value);
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

  function readFilters() {
    return {
      buscar: $('studentActivityFilterSearch') ? clean($('studentActivityFilterSearch').value) : '',
      area: $('studentActivityFilterArea') ? clean($('studentActivityFilterArea').value) : '',
      grado: $('studentActivityFilterGrade') ? clean($('studentActivityFilterGrade').value) : '',
      tipo: $('studentActivityFilterType') ? clean($('studentActivityFilterType').value) : ''
    };
  }

  function hasFilters(filters) {
    return Object.keys(filters || {}).some(function (key) {
      return !!filters[key];
    });
  }

  function requestIndex(filters, callback) {
    var input = filters || {};
    if (window.AIE_RUNTIME && !window.AIE_RUNTIME.canCallBackend('/api/indice-alumnos')) {
      if (window.AIE_RUNTIME.supabaseReady()) {
        window.AIE_RUNTIME.supabaseRpc('aie_1077_indice_alumnos', {
          p_buscar: input.buscar || '',
          p_area: input.area || '',
          p_grado: input.grado || '',
          p_tipo: input.tipo || '',
          p_listar_todas: input.listarTodas === true
        }, '', callback);
        return;
      }
      window.setTimeout(function () { callback({ error: window.AIE_RUNTIME.supabaseUnavailableMessage() }); }, 0);
      return;
    }
    var qs = query(input);
    var path = '/api/indice-alumnos';
    var xhr = new XMLHttpRequest();
    var requestUrl = window.AIE_RUNTIME ? window.AIE_RUNTIME.apiUrl('/api/indice-alumnos') : path;
    if (qs) requestUrl += (requestUrl.indexOf('?') >= 0 ? '&' : '?') + qs;
    xhr.open('GET', requestUrl, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var body = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch (err) {
        body = { error: 'Respuesta invalida del servidor.' };
      }
      if (xhr.status >= 400) {
        callback(body || { error: 'No se pudo cargar el indice.' });
        return;
      }
      callback(null, body);
    };
    xhr.send();
  }

  function activityMeta(activity) {
    var parts = [];
    if (activity.grado) parts.push('Grado ' + activity.grado);
    if (activity.area) parts.push(activity.area);
    if (activity.tipo) parts.push('Tipo ' + activity.tipo);
    if (activity.cantidadEjercicios) parts.push(activity.cantidadEjercicios + ' ejercicios');
    return parts.join(' | ');
  }

  function activityUrl(url) {
    var value = String(url || '#');
    if (value.charAt(0) === '/' && window.AIE_RUNTIME) {
      if (window.AIE_RUNTIME.canCallBackend(value)) {
        return window.AIE_RUNTIME.apiUrl(value);
      }
      var match = value.match(/^\/actividad\/([a-zA-Z0-9_-]{6,120})$/);
      var config = window.AIE_RUNTIME.getConfig();
      if (match && config.supabaseUrl) {
        return config.supabaseUrl
          + '/functions/v1/actividad-1077?codigo='
          + encodeURIComponent(match[1]);
      }
      return '#';
    }
    return value;
  }

  function isRemoteActivityUrl(url) {
    return /\/functions\/v1\/actividad-1077\?codigo=/.test(String(url || ''));
  }

  function showActivityLoadError(openedWindow, message) {
    var safeMessage = text(message) || 'No se pudo abrir la actividad.';
    if (!openedWindow || openedWindow.closed) {
      window.alert(safeMessage);
      return;
    }
    openedWindow.document.open();
    openedWindow.document.write(
      '<!doctype html><html lang="es"><head><meta charset="utf-8">'
      + '<title>Actividad no disponible</title></head>'
      + '<body style="font-family:Arial,sans-serif;padding:24px">'
      + '<h1>Actividad no disponible</h1><p>'
      + safeMessage.replace(/[&<>"']/g, function (character) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[character];
      })
      + '</p></body></html>'
    );
    openedWindow.document.close();
  }

  function openRemoteActivity(event, url) {
    event.preventDefault();
    var openedWindow = window.open('about:blank', '_blank');
    if (!openedWindow) {
      window.alert('El navegador bloqueo la pestaña de la actividad. Habilite las ventanas emergentes para este sitio.');
      return;
    }
    openedWindow.opener = null;
    openedWindow.document.write(
      '<!doctype html><html lang="es"><head><meta charset="utf-8">'
      + '<title>Abriendo actividad</title></head>'
      + '<body style="font-family:Arial,sans-serif;padding:24px">'
      + '<p>Abriendo actividad, espere un momento.</p></body></html>'
    );
    openedWindow.document.close();

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status < 200 || xhr.status >= 300 || !xhr.responseText) {
        showActivityLoadError(openedWindow, xhr.responseText || 'La actividad no esta habilitada en este momento.');
        return;
      }
      try {
        var blob = new Blob([xhr.responseText], { type: 'text/html;charset=utf-8' });
        var blobUrl = window.URL.createObjectURL(blob);
        openedWindow.location.replace(blobUrl);
        window.setTimeout(function () {
          window.URL.revokeObjectURL(blobUrl);
        }, 60000);
      } catch (error) {
        showActivityLoadError(openedWindow, 'El navegador no pudo preparar la actividad.');
      }
    };
    xhr.send();
  }

  function renderActivities(activities, searched) {
    var box = $('studentActivities');
    if (!box) return;
    box.innerHTML = '';
    if (!searched) {
      box.textContent = 'Cargando actividades disponibles.';
      return;
    }
    if (!activities || !activities.length) {
      box.textContent = 'No hay actividades disponibles para los filtros indicados.';
      return;
    }
    activities.forEach(function (activity) {
      var link = document.createElement('a');
      link.className = 'student-activity-card';
      link.href = activityUrl(activity.url);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      if (isRemoteActivityUrl(link.href)) {
        link.onclick = function (event) {
          openRemoteActivity(event, this.href);
        };
      }
      var title = document.createElement('strong');
      title.textContent = activity.titulo || activity.codigo || 'Actividad';
      var meta = document.createElement('span');
      meta.textContent = activityMeta(activity);
      link.appendChild(title);
      link.appendChild(meta);
      box.appendChild(link);
    });
  }

  function renderClosed(data) {
    $('studentIndexStatus').className = 'student-index-status closed';
    $('studentIndexStatus').textContent = 'Indice cerrado';
    $('studentIndexMessage').textContent = text(data && data.mensaje) || 'Las actividades no estan disponibles en este momento.';
    renderActivities([], false);
  }

  function renderOpen(data, searched) {
    $('studentIndexStatus').className = 'student-index-status open';
    $('studentIndexStatus').textContent = 'Indice habilitado';
    $('studentIndexMessage').textContent = text(data && data.mensaje) || 'Actividades disponibles para comenzar.';
    renderActivities(data && data.actividades || [], searched);
  }

  function loadIndex(searchRequested) {
    var filters = readFilters();
    var searched = hasFilters(filters);
    filters.listar_todas = !searched ? 'true' : '';
    filters.listarTodas = !searched;
    searched = searched || filters.listarTodas === true;
    requestIndex(filters, function (err, data) {
      if (err) {
        $('studentIndexStatus').className = 'student-index-status closed';
        $('studentIndexStatus').textContent = 'No disponible';
        $('studentIndexMessage').textContent = err.error || 'No se pudo cargar el indice.';
        renderActivities([], false);
        return;
      }
      lastIndexData = data || {};
      if (!data || data.indiceHabilitado !== true) {
        renderClosed(data);
        return;
      }
      renderOpen(data, searched);
    });
  }

  function bind() {
    if ($('studentActivitySearch')) {
      $('studentActivitySearch').onclick = function () {
        loadIndex(true);
      };
    }
    if ($('studentActivityClear')) {
      $('studentActivityClear').onclick = function () {
        if ($('studentActivityFilterSearch')) $('studentActivityFilterSearch').value = '';
        if ($('studentActivityFilterArea')) $('studentActivityFilterArea').value = '';
        if ($('studentActivityFilterGrade')) $('studentActivityFilterGrade').value = '';
        if ($('studentActivityFilterType')) $('studentActivityFilterType').value = '';
        loadIndex(false);
      };
    }
    var inputs = document.querySelectorAll('#studentIndexFilters input, #studentIndexFilters select');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].onkeydown = function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          loadIndex(true);
        }
      };
    }
  }

  bind();
  loadIndex(false);
}());
