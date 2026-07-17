(function () {
  function getConfig() {
    var config = window.AIE_PUBLIC_CONFIG || {};
    return {
      backendBaseUrl: String(config.backendBaseUrl || '').replace(/\/+$/, ''),
      githubPagesBasePath: String(config.githubPagesBasePath || ''),
      supabaseUrl: String(config.supabaseUrl || '').replace(/\/+$/, ''),
      supabaseAnonKey: String(config.supabaseAnonKey || ''),
      schoolId: String(config.schoolId || '1077')
    };
  }

  function isLocalOrigin() {
    var host = String(window.location.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '';
  }

  function requiresBackend(path) {
    return /^\/(api|actividad)(\/|$)/.test(String(path || ''));
  }

  function canCallBackend(path) {
    var config = getConfig();
    return !requiresBackend(path) || !!config.backendBaseUrl || isLocalOrigin();
  }

  function backendUnavailableMessage() {
    return 'Esta accion requiere un backend HTTPS publico configurado en AIE_PUBLIC_BACKEND_BASE_URL_1077. Portal, indice y lector QR pueden operar con Supabase Auth/RPC directo.';
  }

  function supabaseReady() {
    var config = getConfig();
    return !!(config.supabaseUrl && config.supabaseAnonKey);
  }

  function supabaseUnavailableMessage() {
    return 'Falta configuracion publica Supabase para usar esta pagina sin backend local.';
  }

  function errorFromSupabaseBody(body, fallback) {
    if (!body) return { error: fallback || 'No se pudo completar la operacion en Supabase.' };
    if (body.error) return body;
    if (body.message) {
      body.error = body.message;
      return body;
    }
    body.error = fallback || 'No se pudo completar la operacion en Supabase.';
    return body;
  }

  function supabaseLoginUrl(redirectTo) {
    var config = getConfig();
    if (!supabaseReady()) return '';
    return config.supabaseUrl + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(redirectTo || currentPageUrl(''));
  }

  function supabaseRequest(method, path, data, accessToken, callback) {
    var config = getConfig();
    if (!supabaseReady()) {
      window.setTimeout(function () {
        callback({ error: supabaseUnavailableMessage() });
      }, 0);
      return;
    }
    var xhr = new XMLHttpRequest();
    var apiPath = String(path || '').charAt(0) === '/' ? path : '/' + path;
    xhr.open(method, config.supabaseUrl + apiPath, true);
    xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
    xhr.setRequestHeader('apikey', config.supabaseAnonKey);
    xhr.setRequestHeader('Authorization', 'Bearer ' + (accessToken || config.supabaseAnonKey));
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var body = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch (err) {
        body = { error: xhr.responseText || 'Respuesta invalida de Supabase.' };
      }
      if (xhr.status >= 400) {
        callback(errorFromSupabaseBody(body, 'Error Supabase HTTP ' + xhr.status));
        return;
      }
      callback(null, body);
    };
    xhr.send(data ? JSON.stringify(data) : null);
  }

  function supabaseRpc(functionName, payload, accessToken, callback) {
    supabaseRequest('POST', '/rest/v1/rpc/' + encodeURIComponent(functionName), payload || {}, accessToken, callback);
  }

  function publicPortalConfig() {
    var config = getConfig();
    var ready = supabaseReady();
    return {
      escuela: {
        id: config.schoolId || '1077',
        numero: config.schoolId || '1077',
        nombre: 'Escuela ' + (config.schoolId || '1077')
      },
      supabase: {
        url: config.supabaseUrl,
        anonKeyConfigurada: !!config.supabaseAnonKey,
        serviceRoleConfigurada: false,
        loginGoogleListo: ready,
        backendListo: ready,
        sesionesAieObligatorias: false
      },
      rolesPermitidos: ['administrador', 'drt', 'directora', 'supervisora'],
      bloqueantes: ready ? [] : [supabaseUnavailableMessage()]
    };
  }

  function apiUrl(path) {
    var value = String(path || '');
    if (/^https?:\/\//i.test(value)) return value;
    var config = getConfig();
    if (!config.backendBaseUrl) return value;
    return config.backendBaseUrl + (value.charAt(0) === '/' ? value : '/' + value);
  }

  function cleanSearchForAuth() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      params.delete('login');
      params.delete('rol');
      params.delete('v');
      var text = params.toString();
      return text ? '?' + text : '';
    } catch (err) {
      return '';
    }
  }

  function currentPageUrl(hash) {
    return window.location.origin + window.location.pathname + cleanSearchForAuth() + (hash || '');
  }

  function currentPagePath(hash) {
    return window.location.pathname + cleanSearchForAuth() + (hash || '');
  }

  window.AIE_RUNTIME = {
    getConfig: getConfig,
    apiUrl: apiUrl,
    backendUnavailableMessage: backendUnavailableMessage,
    canCallBackend: canCallBackend,
    currentPageUrl: currentPageUrl,
    currentPagePath: currentPagePath,
    errorFromSupabaseBody: errorFromSupabaseBody,
    publicPortalConfig: publicPortalConfig,
    supabaseLoginUrl: supabaseLoginUrl,
    supabaseReady: supabaseReady,
    supabaseRequest: supabaseRequest,
    supabaseRpc: supabaseRpc,
    supabaseUnavailableMessage: supabaseUnavailableMessage
  };
}());
