(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function text(value) {
    return String(value == null ? '' : value);
  }

  function requestIndex(callback) {
    if (window.AIE_RUNTIME && !window.AIE_RUNTIME.canCallBackend('/api/indice-alumnos')) {
      if (window.AIE_RUNTIME.supabaseReady()) {
        window.AIE_RUNTIME.supabaseRpc('aie_1077_indice_alumnos', {}, '', callback);
        return;
      }
      window.setTimeout(function () { callback({ error: window.AIE_RUNTIME.supabaseUnavailableMessage() }); }, 0);
      return;
    }
    var xhr = new XMLHttpRequest();
    var requestUrl = window.AIE_RUNTIME ? window.AIE_RUNTIME.apiUrl('/api/indice-alumnos') : '/api/indice-alumnos';
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
      if (!window.AIE_RUNTIME.canCallBackend(value)) return '#';
      return window.AIE_RUNTIME.apiUrl(value);
    }
    return value;
  }

  function renderActivities(activities) {
    var box = $('studentActivities');
    if (!box) return;
    box.innerHTML = '';
    if (!activities || !activities.length) {
      box.textContent = 'No hay actividades disponibles.';
      return;
    }
    activities.forEach(function (activity) {
      var link = document.createElement('a');
      link.className = 'student-activity-card';
      link.href = activityUrl(activity.url);
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
    renderActivities([]);
  }

  requestIndex(function (err, data) {
    if (err) {
      $('studentIndexStatus').className = 'student-index-status closed';
      $('studentIndexStatus').textContent = 'No disponible';
      $('studentIndexMessage').textContent = err.error || 'No se pudo cargar el indice.';
      renderActivities([]);
      return;
    }
    if (!data || data.indiceHabilitado !== true) {
      renderClosed(data);
      return;
    }
    $('studentIndexStatus').className = 'student-index-status open';
    $('studentIndexStatus').textContent = 'Indice habilitado';
    $('studentIndexMessage').textContent = text(data.mensaje) || 'Seleccione una actividad para comenzar.';
    renderActivities(data.actividades || []);
  });
}());
