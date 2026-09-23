(() => {
  'use strict';
  const REPO = 'Shanation6/anna-kozelkova-english';
  const API = `https://api.github.com/repos/${REPO}`;
  const protectedPaths = new Set(['photos/510bcf.jpg', 'photos/65716464.jpg', 'photos/66241908.jpg', 'photos/70413564.webp', 'photos/63522350.jpg', 'photos/63519086.jpg']);
  const $ = (selector) => document.querySelector(selector);
  let token = '';
  let gallery = null;
  let pendingUploads = new Map();
  let removedPaths = new Set();
  let dirty = false;

  const photoUrl = (photo) => photo.preview || (/^photos\/[a-zA-Z0-9._-]+\.(jpe?g|png|webp)$/i.test(photo.src || '') ? `../${photo.src}` : '');
  function setMessage(selector, message, type = '') {
    const element = $(selector);
    element.textContent = message;
    element.className = `message ${type}`.trim();
  }
  function markDirty() { dirty = true; setMessage('#save-message', 'Есть неопубликованные изменения.'); }
  function categoryName(id) { return gallery.categories.find((category) => category.id === id)?.name || 'Без рубрики'; }
  function sortedPhotos() { return gallery.photos.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)); }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function input(type, value, maxLength) {
    const element = document.createElement('input');
    element.type = type;
    if (value != null) element.value = value;
    if (maxLength) element.maxLength = maxLength;
    return element;
  }
  function field(labelText, control) {
    const wrapper = el('div', 'field');
    const label = el('label', '', labelText);
    label.append(control);
    wrapper.append(label);
    return wrapper;
  }
  function categorySelect(value) {
    const select = document.createElement('select');
    for (const category of gallery.categories.slice().sort((a, b) => a.sort_order - b.sort_order)) {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      select.append(option);
    }
    select.value = value || gallery.categories[0]?.id || '';
    return select;
  }
  function safeError(error) {
    if (error.status === 401 || error.status === 403) return 'Нет доступа к репозиторию. Проверьте срок действия токена и право Contents: Read and write.';
    if (error.status === 409 || error.status === 422) return 'Репозиторий изменился во время редактирования. Обновите данные и повторите публикацию.';
    return error.message || 'Не удалось выполнить запрос GitHub.';
  }
  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store'
    });
    if (!response.ok) {
      let message = `GitHub: HTTP ${response.status}`;
      try { message = (await response.json()).message || message; } catch { /* ignore */ }
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  function decodeBase64(value) {
    const bytes = Uint8Array.from(atob(value.replace(/\s/g, '')), (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  function escapePath(path) { return path.split('/').map(encodeURIComponent).join('/'); }

  async function connect(event) {
    event.preventDefault();
    const button = $('#connect-form button');
    token = $('#token').value.trim();
    button.disabled = true;
    setMessage('#connect-message', 'Проверяем доступ…');
    try {
      const data = await request(`/contents/${escapePath('content/gallery.json')}`);
      const parsed = JSON.parse(decodeBase64(data.content));
      if (!Array.isArray(parsed.photos) || !Array.isArray(parsed.categories)) throw new Error('Файл галереи имеет неверный формат.');
      gallery = parsed;
      $('#token').value = '';
      $('#editor').hidden = false;
      $('#connection-status').textContent = 'Подключено';
      $('#connection-status').classList.add('connected');
      setMessage('#connect-message', 'Доступ открыт.', 'success');
      renderAll();
      $('#editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      token = '';
      setMessage('#connect-message', safeError(error), 'error');
    } finally { button.disabled = false; }
  }

  function renderFilterOptions() {
    const filter = $('#photo-filter');
    const previous = filter.value || 'all';
    filter.replaceChildren();
    for (const item of [{ id: 'all', name: 'Все фотографии' }, ...gallery.categories]) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      filter.append(option);
    }
    filter.value = [...filter.options].some((option) => option.value === previous) ? previous : 'all';
  }

  function renderCategories() {
    const list = $('#category-list');
    list.replaceChildren();
    for (const category of gallery.categories.slice().sort((a, b) => a.sort_order - b.sort_order)) {
      const row = el('div', 'category-row');
      const name = input('text', category.name, 50);
      name.setAttribute('aria-label', `Название рубрики ${category.name}`);
      name.addEventListener('input', () => {
        category.name = name.value;
        markDirty();
        renderFilterOptions();
      });
      const remove = el('button', 'small-button danger', '×');
      remove.type = 'button';
      remove.title = 'Удалить рубрику';
      remove.setAttribute('aria-label', `Удалить рубрику ${category.name}`);
      remove.addEventListener('click', () => {
        if (gallery.photos.some((photo) => photo.category_id === category.id)) {
          setMessage('#save-message', 'Сначала перенесите фотографии из этой рубрики в другую.', 'error');
          return;
        }
        gallery.categories = gallery.categories.filter((item) => item.id !== category.id);
        markDirty();
        renderAll();
      });
      row.append(name, remove);
      list.append(row);
    }
  }

  function renderPhotos() {
    const list = $('#photo-list');
    const active = $('#photo-filter').value;
    const photos = sortedPhotos().filter((photo) => active === 'all' || photo.category_id === active);
    $('#editor-count').textContent = `${gallery.photos.length} фотографий в ${gallery.categories.length} рубриках`;
    list.replaceChildren();
    if (!photos.length) { list.append(el('p', '', 'В этой рубрике пока нет фотографий.')); return; }
    for (const photo of photos) {
      const card = el('article', 'photo-editor');
      const image = document.createElement('img');
      image.src = photoUrl(photo);
      image.alt = photo.alt || photo.title || 'Фото';
      image.loading = 'lazy';
      const fields = el('div', 'photo-fields');
      const title = input('text', photo.title || '', 120);
      title.addEventListener('input', () => { photo.title = title.value; markDirty(); });
      const description = document.createElement('textarea');
      description.value = photo.description || '';
      description.maxLength = 250;
      description.addEventListener('input', () => { photo.description = description.value; markDirty(); });
      const alt = input('text', photo.alt || '', 180);
      alt.addEventListener('input', () => { photo.alt = alt.value; markDirty(); });
      const category = categorySelect(photo.category_id);
      category.addEventListener('change', () => { photo.category_id = category.value; markDirty(); renderPhotos(); });
      const grid = el('div', 'photo-fields-grid');
      grid.append(field('Подпись', title), field('Рубрика', category), field('Описание', description), field('Текст для доступности', alt));
      const featured = input('checkbox');
      featured.checked = Boolean(photo.featured);
      featured.addEventListener('change', () => { photo.featured = featured.checked; markDirty(); });
      const checkbox = el('label', 'checkbox', 'Показывать в «Главном»');
      checkbox.prepend(featured);
      const buttons = el('div', 'minor-actions');
      for (const [label, delta] of [['↑ Выше', -1], ['↓ Ниже', 1]]) {
        const button = el('button', 'small-button', label);
        button.type = 'button';
        button.addEventListener('click', () => {
          const ordered = sortedPhotos();
          const index = ordered.findIndex((item) => item.id === photo.id);
          const next = index + delta;
          if (next < 0 || next >= ordered.length) return;
          [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
          ordered.forEach((item, position) => { item.sort_order = position; });
          markDirty();
          renderPhotos();
        });
        buttons.append(button);
      }
      const replaceInput = document.createElement('input');
      replaceInput.type = 'file';
      replaceInput.accept = 'image/jpeg,image/png,image/webp';
      replaceInput.hidden = true;
      replaceInput.addEventListener('change', () => {
        const file = replaceInput.files[0];
        if (!file) return;
        const targetExtension = photo.src.split('.').pop().toLowerCase().replace('jpeg', 'jpg');
        const fileExtension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
        if (!fileExtension || fileExtension !== targetExtension || file.size > 5 * 1024 * 1024) {
          setMessage('#save-message', `Для замены нужен файл ${targetExtension.toUpperCase()} размером до 5 МБ.`, 'error');
          replaceInput.value = '';
          return;
        }
        if (photo.preview) URL.revokeObjectURL(photo.preview);
        photo.preview = URL.createObjectURL(file);
        pendingUploads.set(photo.src, file);
        image.src = photo.preview;
        markDirty();
        replaceInput.value = '';
      });
      const replace = el('button', 'small-button', 'Заменить фото');
      replace.type = 'button';
      replace.addEventListener('click', () => replaceInput.click());
      buttons.append(replace, replaceInput);
      const remove = el('button', 'small-button danger', 'Удалить');
      remove.type = 'button';
      const isProtected = protectedPaths.has(photo.src);
      if (isProtected) { remove.disabled = true; remove.title = 'Это фото используется в блоке сайта'; }
      remove.addEventListener('click', () => {
        if (!confirm(`Удалить фотографию «${photo.title || 'Без названия'}»?`)) return;
        gallery.photos = gallery.photos.filter((item) => item.id !== photo.id);
        if (pendingUploads.has(photo.src)) {
          URL.revokeObjectURL(photo.preview);
          pendingUploads.delete(photo.src);
        } else if (!gallery.photos.some((item) => item.src === photo.src)) removedPaths.add(photo.src);
        markDirty();
        renderPhotos();
      });
      buttons.append(remove);
      const controls = el('div', 'photo-controls');
      controls.append(checkbox, buttons);
      fields.append(grid, controls);
      card.append(image, fields);
      list.append(card);
    }
  }
  function renderAll() {
    renderFilterOptions();
    renderCategories();
    $('#upload-category').replaceChildren(...[...categorySelect().options].map((option) => option.cloneNode(true)));
    renderPhotos();
  }

  function addCategory(event) {
    event.preventDefault();
    const name = $('#new-category').value.trim();
    if (!name) return;
    if (gallery.categories.some((item) => item.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'))) {
      setMessage('#save-message', 'Рубрика с таким названием уже есть.', 'error');
      return;
    }
    gallery.categories.push({ id: `category-${Date.now().toString(36)}`, name, sort_order: gallery.categories.length });
    $('#new-category').value = '';
    markDirty();
    renderAll();
  }

  function addPhoto() {
    const file = $('#upload-file').files[0];
    const title = $('#upload-title').value.trim();
    const category = $('#upload-category').value;
    if (!file) { setMessage('#save-message', 'Сначала выберите фотографию.', 'error'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setMessage('#save-message', 'Нужен JPG, PNG или WebP размером до 5 МБ.', 'error'); return;
    }
    if (!title) { setMessage('#save-message', 'Добавьте подпись к фотографии.', 'error'); return; }
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
    const id = `photo-${crypto.randomUUID()}`;
    const src = `photos/${id}.${extension}`;
    const preview = URL.createObjectURL(file);
    gallery.photos.push({ id, src, title, description: '', category_id: category, alt: title, sort_order: Math.max(0, ...gallery.photos.map((item) => item.sort_order || 0)) + 1, featured: true, preview });
    pendingUploads.set(src, file);
    $('#upload-file').value = '';
    $('#upload-title').value = '';
    $('#upload-label').textContent = 'Выбрать JPG, PNG или WebP';
    markDirty();
    renderPhotos();
    $('#photo-list').lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function readBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('Не удалось прочитать изображение.'));
      reader.readAsDataURL(file);
    });
  }
  function validGallery() {
    if (!gallery.categories.length) throw new Error('Нужна хотя бы одна рубрика.');
    if (gallery.categories.some((item) => !item.name.trim())) throw new Error('У всех рубрик должны быть названия.');
    if (gallery.photos.some((photo) => !photo.title.trim() || !gallery.categories.some((item) => item.id === photo.category_id))) throw new Error('Проверьте подписи и рубрики фотографий.');
  }

  async function save() {
    if (!dirty) { setMessage('#save-message', 'Изменений пока нет.'); return; }
    const button = $('#save');
    button.disabled = true;
    setMessage('#save-message', 'Сохраняем в GitHub…');
    try {
      validGallery();
      const ref = await request('/git/ref/heads/main');
      const headSha = ref.object.sha;
      const head = await request(`/git/commits/${headSha}`);
      const treeEntries = [];
      for (const [path, file] of pendingUploads) {
        const blob = await request('/git/blobs', { method: 'POST', body: { content: await readBase64(file), encoding: 'base64' } });
        treeEntries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
      }
      for (const path of removedPaths) treeEntries.push({ path, mode: '100644', type: 'blob', sha: null });
      const cleanGallery = JSON.parse(JSON.stringify(gallery, (key, value) => key === 'preview' ? undefined : value));
      treeEntries.push({ path: 'content/gallery.json', mode: '100644', type: 'blob', content: `${JSON.stringify(cleanGallery, null, 2)}\n` });
      const tree = await request('/git/trees', { method: 'POST', body: { base_tree: head.tree.sha, tree: treeEntries } });
      const commit = await request('/git/commits', { method: 'POST', body: { message: 'Update photo gallery from admin', tree: tree.sha, parents: [headSha] } });
      await request('/git/refs/heads/main', { method: 'PATCH', body: { sha: commit.sha, force: false } });
      for (const photo of gallery.photos) if (photo.preview) {
        URL.revokeObjectURL(photo.preview);
        delete photo.preview;
      }
      pendingUploads = new Map();
      removedPaths = new Set();
      dirty = false;
      renderPhotos();
      setMessage('#save-message', 'Опубликовано в GitHub. Сайт обновится после сборки Pages, обычно через несколько минут.', 'success');
    } catch (error) { setMessage('#save-message', safeError(error), 'error'); }
    finally { button.disabled = false; }
  }

  $('#connect-form').addEventListener('submit', connect);
  $('#disconnect').addEventListener('click', () => { token = ''; gallery = null; $('#editor').hidden = true; $('#connection-status').textContent = 'Не подключено'; $('#connection-status').classList.remove('connected'); setMessage('#connect-message', 'Отключено.'); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  $('#photo-filter').addEventListener('change', renderPhotos);
  $('#add-category-form').addEventListener('submit', addCategory);
  $('#add-photo').addEventListener('click', addPhoto);
  $('#upload-file').addEventListener('change', () => { $('#upload-label').textContent = $('#upload-file').files[0]?.name || 'Выбрать JPG, PNG или WebP'; });
  $('#save').addEventListener('click', save);
  window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
})();
