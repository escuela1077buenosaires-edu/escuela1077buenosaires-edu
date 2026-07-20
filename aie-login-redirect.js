(function () {
  var PARAM_NAME = 'login';
  var RETRY_MS = 250;
  var MAX_RETRIES = 40;

  function wantsLogin() {
    try {
      return new URLSearchParams(window.location.search || '').get(PARAM_NAME) === '1';
    } catch (err) {
      return false;
    }
  }

  function hasAuthHash() {
    return (window.location.hash || '').indexOf('access_token=') >= 0;
  }

  function pageTarget() {
    if (document.getElementById('portalLoginGoogle')) {
      return { buttonId: 'portalLoginGoogle', sessionKey: 'aiePortal1077AccessToken' };
    }
    if (document.getElementById('qrLoginGoogle')) {
      return { buttonId: 'qrLoginGoogle', sessionKey: 'aieQr1077AccessToken' };
    }
    return null;
  }

  function hasStoredToken(sessionKey) {
    try {
      return !!(sessionKey && window.sessionStorage && window.sessionStorage.getItem(sessionKey));
    } catch (err) {
      return false;
    }
  }

  function normalizeRole(value) {
    var role = String(value == null ? '' : value).replace(/\s+/g, ' ').trim().toLowerCase();
    if (role === 'directivo' || role === 'directora' || role === 'director') return 'directora';
    if (role === 'supervision' || role === 'supervisor' || role === 'supervisora') return 'supervisora';
    if (role === 'drt') return 'drt';
    if (role === 'administrador') return 'administrador';
    return '';
  }

  function persistRoleContext() {
    try {
      var role = normalizeRole(new URLSearchParams(window.location.search || '').get('rol') || '');
      if (role && window.sessionStorage) {
        window.sessionStorage.setItem('aiePortal1077RoleContext', role);
      }
    } catch (err) {
      return;
    }
  }

  function cleanLoginParam() {
    if (!window.history || !window.history.replaceState) return;
    try {
      var url = new URL(window.location.href);
      url.searchParams.delete(PARAM_NAME);
      url.searchParams.delete('rol');
      url.searchParams.delete('v');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (err) {
      return;
    }
  }

  function clickWhenReady(target, tries) {
    var button = document.getElementById(target.buttonId);
    if (button && !button.disabled) {
      cleanLoginParam();
      button.click();
      return;
    }
    if (tries >= MAX_RETRIES) return;
    window.setTimeout(function () {
      clickWhenReady(target, tries + 1);
    }, RETRY_MS);
  }

  function start() {
    if (!wantsLogin() || hasAuthHash()) return;
    var target = pageTarget();
    if (!target) return;
    persistRoleContext();
    if (hasStoredToken(target.sessionKey)) {
      cleanLoginParam();
      return;
    }
    clickWhenReady(target, 0);
  }

  start();
}());
