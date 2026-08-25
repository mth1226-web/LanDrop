// iPhone等のブラウザから直接アクセスするための簡易Web UI（Electron非依存、文字列を返すだけの純粋関数）
// ビルド不要のvanilla JSで、同じHTTPサーバーの/api/*エンドポイントをそのまま叩く

export function renderWebUiHtml(deviceName: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>LanDrop - ${escapeHtml(deviceName)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, 'Hiragino Sans', sans-serif; background: #14141c; color: #e8e8f0; }
  header { padding: 14px 16px; border-bottom: 1px solid #2a2a38; }
  header h1 { font-size: 16px; margin: 0 0 2px; }
  header p { font-size: 12px; color: #9090a8; margin: 0; word-break: break-all; }
  nav.breadcrumb { padding: 10px 16px; font-size: 13px; border-bottom: 1px solid #2a2a38; }
  nav.breadcrumb button { background: none; border: none; color: #cfd0ea; padding: 2px 4px; font-size: 13px; }
  nav.breadcrumb .sep { color: #5a5a70; margin: 0 2px; }
  .actions { display: flex; gap: 8px; padding: 10px 16px; }
  .actions button, .actions label { flex: 1; text-align: center; padding: 10px; border-radius: 8px; border: 1px solid #3a3a4c; background: #242432; color: #e8e8f0; font-size: 13px; }
  ul.entries { list-style: none; margin: 0; padding: 8px 16px 24px; }
  li.entry { display: flex; align-items: center; gap: 8px; padding: 10px 4px; border-bottom: 1px solid #22222e; }
  li.entry .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
  li.entry .size { font-size: 11px; color: #7a7a90; margin-right: 4px; }
  li.entry a.download { font-size: 12px; color: #5878e8; text-decoration: none; padding: 4px 8px; }
  p.empty { padding: 20px 16px; color: #7a7a90; font-size: 13px; }
  input[type=file] { display: none; }
</style>
</head>
<body>
<header>
  <h1>LanDrop</h1>
  <p id="peer-name">${escapeHtml(deviceName)}</p>
</header>
<nav class="breadcrumb" id="breadcrumb"></nav>
<div class="actions" id="actions" style="display:none;">
  <label for="file-input">アップロード</label>
  <input id="file-input" type="file" multiple />
  <button id="new-folder-btn">新しいフォルダ</button>
</div>
<ul class="entries" id="entries"></ul>

<script>
(function () {
  var currentPath = '';

  function joinPath(base, name) {
    return base ? base + '/' + name : name;
  }

  function parentPath(path) {
    var segs = path.split('/').filter(Boolean);
    segs.pop();
    return segs.join('/');
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  function renderBreadcrumb() {
    var el = document.getElementById('breadcrumb');
    el.innerHTML = '';
    var rootBtn = document.createElement('button');
    rootBtn.textContent = 'ホーム';
    rootBtn.onclick = function () { navigate(''); };
    el.appendChild(rootBtn);
    var segs = currentPath.split('/').filter(Boolean);
    segs.forEach(function (seg, i) {
      var sep = document.createElement('span');
      sep.className = 'sep';
      sep.textContent = '/';
      el.appendChild(sep);
      var btn = document.createElement('button');
      btn.textContent = seg;
      btn.onclick = function () { navigate(segs.slice(0, i + 1).join('/')); };
      el.appendChild(btn);
    });
  }

  function renderEntries(entries) {
    var el = document.getElementById('entries');
    el.innerHTML = '';
    if (entries.length === 0) {
      var p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'このフォルダは空です';
      el.appendChild(p);
      return;
    }
    entries.forEach(function (entry) {
      var li = document.createElement('li');
      li.className = 'entry';

      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = (entry.isDirectory ? '\\uD83D\\uDCC1 ' : '\\uD83D\\uDCC4 ') + entry.name;
      li.appendChild(name);

      if (entry.isDirectory) {
        li.onclick = function () { navigate(joinPath(currentPath, entry.name)); };
        li.style.cursor = 'pointer';
      } else {
        var size = document.createElement('span');
        size.className = 'size';
        size.textContent = formatBytes(entry.size);
        li.appendChild(size);

        var a = document.createElement('a');
        a.className = 'download';
        a.textContent = 'DL';
        a.href = '/api/download?path=' + encodeURIComponent(joinPath(currentPath, entry.name));
        li.appendChild(a);
      }
      el.appendChild(li);
    });
  }

  function navigate(path) {
    currentPath = path;
    document.getElementById('actions').style.display = path ? 'flex' : 'none';
    renderBreadcrumb();
    fetch('/api/browse?path=' + encodeURIComponent(path))
      .then(function (res) { return res.json(); })
      .then(function (data) { renderEntries(data.entries || []); })
      .catch(function () { renderEntries([]); });
  }

  document.getElementById('file-input').addEventListener('change', function (e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    var uploadNext = function () {
      if (files.length === 0) { navigate(currentPath); return; }
      var file = files.shift();
      fetch('/api/upload?path=' + encodeURIComponent(currentPath) + '&name=' + encodeURIComponent(file.name), {
        method: 'POST',
        body: file
      }).then(uploadNext).catch(uploadNext);
    };
    uploadNext();
    e.target.value = '';
  });

  document.getElementById('new-folder-btn').addEventListener('click', function () {
    var name = window.prompt('新しいフォルダ名');
    if (!name) return;
    fetch('/api/mkdir', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: currentPath, name: name })
    }).then(function () { navigate(currentPath); });
  });

  navigate('');
})();
</script>
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}
