(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function clean(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function findCard(title) {
    var cards = document.querySelectorAll('.portal-card');
    for (var i = 0; i < cards.length; i++) {
      var heading = cards[i].querySelector('h3');
      if (heading && clean(heading.textContent).toLowerCase() === title.toLowerCase()) {
        return cards[i];
      }
    }
    return null;
  }

  function isAdminSession() {
    var box = $('portalSessionBox');
    return !!(box && /\|\s*administrador\b/i.test(box.textContent || ''));
  }

  function updateClassSessionVisibility() {
    var card = $('portalClassSessionCard') || findCard('Sesion AIE');
    if (card) card.style.display = isAdminSession() ? '' : 'none';
  }

  function updateIndexHint() {
    var input = $('portalIndexVigenteHasta');
    if (!input || !input.parentNode || input.parentNode.querySelector('.portal-default-vigencia')) return;
    var hint = document.createElement('small');
    hint.className = 'portal-muted portal-default-vigencia';
    hint.textContent = 'Si queda vacio, se habilita por 90 minutos o hasta el fin del horario autorizado.';
    input.parentNode.appendChild(hint);
  }

  function updateStudentsFormVisibility() {
    var form = $('portalStudentForm');
    var status = $('portalStudentsStatus');
    if (!form || !status) return;
    var blocked = /no tiene permiso|sin sesion|inicie sesion/i.test(status.textContent || '');
    form.style.display = blocked ? 'none' : '';
  }

  function updateExportButton() {
    var button = $('portalResultsExport');
    if (button) button.textContent = 'Exportar para Excel';
  }

  function setResultsStatus(text, error) {
    var box = $('portalResultsStatus');
    if (!box) return;
    box.textContent = text || '';
    box.className = error ? 'portal-warning' : 'portal-muted';
  }

  function csvCell(value) {
    var text = String(value == null ? '' : value);
    if (/[",\r\n;]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function exportResultsFromDom() {
    var items = $('portalResultsList') ? $('portalResultsList').querySelectorAll('.portal-list-item') : [];
    if (!items.length) {
      setResultsStatus('No hay resultados cargados para exportar.', true);
      return;
    }
    var headers = ['alumno_id', 'nota', 'actividad', 'ejercicios', 'correctos', 'incorrectos', 'tiempo', 'fecha_y_datos'];
    var lines = [headers.join(';')];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var title = clean(item.querySelector('strong') ? item.querySelector('strong').textContent : '');
      var spans = item.querySelectorAll('span');
      var activity = clean(spans[0] ? spans[0].textContent.replace(/^Actividad:\s*/i, '') : '');
      var score = clean(spans[1] ? spans[1].textContent : '');
      var meta = clean(spans[2] ? spans[2].textContent : '');
      var alumno = title.replace(/\|.*$/, '').replace(/^Alumno\s*/i, '');
      var nota = (title.match(/Nota\s*([^|]+)/i) || [])[1] || '';
      var ejercicios = (score.match(/Ejercicios:\s*([^|]+)/i) || [])[1] || '';
      var correctos = (score.match(/Correctos:\s*([^|]+)/i) || [])[1] || '';
      var incorrectos = (score.match(/Incorrectos:\s*([^|]+)/i) || [])[1] || '';
      var tiempo = (score.match(/Tiempo:\s*(.+)$/i) || [])[1] || '';
      lines.push([alumno, nota, activity, ejercicios, correctos, incorrectos, tiempo, meta].map(csvCell).join(';'));
    }
    var blob = new Blob(['\ufeff' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'resultados-1077-excel.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 0);
    setResultsStatus('Archivo para Excel generado con ' + items.length + ' resultado(s).');
  }

  function applyFixes() {
    updateClassSessionVisibility();
    updateIndexHint();
    updateStudentsFormVisibility();
    updateExportButton();
  }

  document.addEventListener('click', function (event) {
    if (event.target && event.target.id === 'portalResultsExport') {
      event.preventDefault();
      event.stopImmediatePropagation();
      exportResultsFromDom();
    }
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyFixes);
  } else {
    applyFixes();
  }
  window.setInterval(applyFixes, 700);
}());
