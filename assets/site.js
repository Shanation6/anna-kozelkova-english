(() => {
  'use strict';

  const grid = document.getElementById('gallery-grid');
  const filters = document.getElementById('gallery-filters');
  const count = document.getElementById('gallery-count');
  const more = document.getElementById('gallery-more');
  const lightbox = document.getElementById('lightbox');
  const lightboxImage = document.getElementById('lightbox-image');
  const lightboxTitle = document.getElementById('lightbox-title');
  const lightboxDescription = document.getElementById('lightbox-description');
  const lightboxCategory = document.getElementById('lightbox-category');
  const lightboxPosition = document.getElementById('lightbox-position');
  let gallery = { categories: [], photos: [] };
  let activeFilter = 'featured';
  let expanded = false;
  let shownPhotos = [];
  let lightboxPhotos = [];
  let lightboxIndex = 0;
  let returnFocus = null;
  let touchStartX = 0;

  const photoUrl = (photo) => /^photos\/[a-zA-Z0-9._-]+\.(jpe?g|png|webp)$/i.test(photo.src || '') ? `./${photo.src}` : '';
  const sortedPhotos = () => gallery.photos.filter((photo) => !photo.hero && photoUrl(photo)).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const categoryName = (id) => gallery.categories.find((category) => category.id === id)?.name || 'Фотография';

  function createElement(tag, className, textValue) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (textValue != null) element.textContent = textValue;
    return element;
  }

  function renderFilters() {
    filters.replaceChildren();
    const choices = [
      { id: 'featured', name: 'Главное' },
      { id: 'all', name: 'Все фото' },
      ...gallery.categories.slice().sort((a, b) => a.sort_order - b.sort_order)
    ];
    for (const choice of choices) {
      const button = createElement('button', 'filter-chip', choice.name);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(activeFilter === choice.id));
      button.addEventListener('click', () => {
        activeFilter = choice.id;
        expanded = false;
        renderFilters();
        renderGallery();
      });
      filters.append(button);
    }
  }

  function makeCard(photo) {
    const article = createElement('article', 'gallery-card');
    const button = createElement('button', 'gallery-card-button');
    button.type = 'button';
    button.setAttribute('aria-label', `Открыть фото: ${photo.title || 'Фотография'}`);
    const imageWrap = createElement('span', 'gallery-image');
    const image = document.createElement('img');
    image.src = photoUrl(photo);
    image.alt = photo.alt || photo.title || 'Фотография Анны Козелковой';
    image.loading = 'lazy';
    image.decoding = 'async';
    imageWrap.append(image, createElement('span', 'gallery-expand', '↗'));
    const caption = createElement('span', 'gallery-caption');
    caption.append(
      createElement('small', '', categoryName(photo.category_id)),
      createElement('strong', '', photo.title || 'Фотография'),
      createElement('em', '', photo.description || '')
    );
    button.append(imageWrap, caption);
    button.addEventListener('click', () => openLightbox(photo.id, shownPhotos, button));
    article.append(button);
    return article;
  }

  function renderGallery() {
    const photos = sortedPhotos();
    const filtered = activeFilter === 'featured' ? photos.filter((photo) => photo.featured) :
      activeFilter === 'all' ? photos : photos.filter((photo) => photo.category_id === activeFilter);
    const limit = activeFilter === 'featured' && !expanded ? 12 : filtered.length;
    shownPhotos = filtered.slice(0, limit);
    grid.replaceChildren();
    if (!shownPhotos.length) grid.append(createElement('p', 'gallery-empty', 'В этой рубрике пока нет фотографий.'));
    else grid.append(...shownPhotos.map(makeCard));
    count.textContent = `${filtered.length} ${plural(filtered.length, 'фотография', 'фотографии', 'фотографий')}`;
    more.hidden = !(activeFilter === 'featured' && filtered.length > limit);
  }

  function plural(number, one, few, many) {
    const n = Math.abs(number) % 100;
    const n1 = n % 10;
    return n > 10 && n < 20 ? many : n1 > 1 && n1 < 5 ? few : n1 === 1 ? one : many;
  }

  function showLightboxPhoto() {
    const photo = lightboxPhotos[lightboxIndex];
    if (!photo) return;
    lightboxImage.src = photoUrl(photo);
    lightboxImage.alt = photo.alt || photo.title || 'Фотография';
    lightboxTitle.textContent = photo.title || 'Фотография';
    lightboxDescription.textContent = photo.description || '';
    lightboxCategory.textContent = categoryName(photo.category_id);
    lightboxPosition.textContent = `${lightboxIndex + 1} / ${lightboxPhotos.length}`;
  }

  function openLightbox(id, photos, trigger) {
    lightboxPhotos = photos;
    lightboxIndex = photos.findIndex((photo) => photo.id === id);
    if (lightboxIndex < 0) return;
    returnFocus = trigger || document.activeElement;
    showLightboxPhoto();
    lightbox.hidden = false;
    document.body.classList.add('lightbox-open');
    lightbox.querySelector('.lightbox-close').focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    lightboxImage.removeAttribute('src');
    document.body.classList.remove('lightbox-open');
    returnFocus?.focus();
  }

  function changePhoto(delta) {
    if (!lightboxPhotos.length) return;
    lightboxIndex = (lightboxIndex + delta + lightboxPhotos.length) % lightboxPhotos.length;
    showLightboxPhoto();
  }

  more.addEventListener('click', () => {
    expanded = true;
    renderGallery();
    more.hidden = true;
  });
  lightbox.querySelector('.lightbox-prev').addEventListener('click', () => changePhoto(-1));
  lightbox.querySelector('.lightbox-next').addEventListener('click', () => changePhoto(1));
  lightbox.querySelectorAll('[data-close-lightbox]').forEach((element) => element.addEventListener('click', closeLightbox));
  lightbox.addEventListener('touchstart', (event) => { touchStartX = event.changedTouches[0].screenX; }, { passive: true });
  lightbox.addEventListener('touchend', (event) => {
    const difference = event.changedTouches[0].screenX - touchStartX;
    if (Math.abs(difference) > 55) changePhoto(difference < 0 ? 1 : -1);
  }, { passive: true });
  document.addEventListener('keydown', (event) => {
    if (lightbox.hidden) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') changePhoto(-1);
    if (event.key === 'ArrowRight') changePhoto(1);
    if (event.key === 'Tab') {
      const buttons = [...lightbox.querySelectorAll('button')];
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  const menuToggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById('primary-nav');
  menuToggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'Закрыть меню' : 'Открыть меню');
  });
  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    nav.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Открыть меню');
  }));

  document.getElementById('current-year').textContent = new Date().getFullYear();
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.body.classList.add('js-ready');
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.08, rootMargin: '0px 0px 40px 0px' });
    document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
  }

  async function loadGallery() {
    try {
      const response = await fetch('./content/gallery.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      gallery = await response.json();
      if (!Array.isArray(gallery.photos) || !Array.isArray(gallery.categories)) throw new Error('Неверный формат галереи');
      renderFilters();
      renderGallery();
      document.querySelectorAll('.js-open-photo').forEach((button) => button.addEventListener('click', () => {
        const id = button.dataset.photoId;
        const photos = sortedPhotos();
        openLightbox(id, photos, button);
      }));
    } catch (error) {
      grid.replaceChildren();
      const message = createElement('p', 'gallery-error', 'Фотографии не загрузились. Обновите страницу, чтобы попробовать ещё раз.');
      grid.append(message);
      console.error('Gallery load failed:', error);
    }
  }
  loadGallery();
})();
