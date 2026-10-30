'use strict';
const $ = s => document.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const mobile = matchMedia('(max-width:650px)');
const film = $('.hero-video'), track = $('.hero-scroll-track');
const slider = $('#story-position'), retry = $('#retry-story');
const titles = ['Metal in Motion', 'A World of Silk', 'Silver Orbit', 'Silk Passage', 'Liquid Light'];
let chapters = [], starts = [], sourceProgress = 0;
let frames = 996, target = 0, ready = false, queued = false, enabled = !reduced.matches;
let pendingSource = '', objectURL = '', downloadController, loading = false, loadGeneration = 0;
// Fully buffer the active film so seeking does not depend on CDN byte-range responses.
async function ensureFilm() {
  if (ready || loading || !pendingSource || !retry.hidden) return;
  const generation = loadGeneration;
  const controller = new AbortController(); downloadController = controller;
  loading = true; retry.hidden = true;
  const status = $('#load-status'); status.textContent = 'Loading motion…';
  try {
    const response = await fetch(pendingSource, {signal: controller.signal, credentials: 'same-origin'});
    if (!response.ok) throw new Error(`Video request failed (${response.status})`);
    if (/text\/html/i.test(response.headers.get('Content-Type') || '')) throw new Error('Video response was a page');
    let blob;
    if (response.body?.getReader) {
      const reader = response.body.getReader(), chunks = [];
      const total = Number(response.headers.get('Content-Length')); let received = 0;
      while (true) {
        const {done, value} = await reader.read(); if (done) break;
        chunks.push(value); received += value.byteLength;
        if (generation !== loadGeneration) return;
        status.textContent = total > 0 ? `Loading motion… ${Math.min(100,Math.round(received / total * 100))}%` : `Loading motion… ${(received / 1048576).toFixed(1)} MB`;
      }
      blob = new Blob(chunks, {type:'video/mp4'});
    } else blob = new Blob([await response.arrayBuffer()], {type:'video/mp4'});
    if (generation !== loadGeneration) return;
    if (blob.size < 1024) throw new Error('Video response was empty');
    objectURL = URL.createObjectURL(blob);
    film.src = objectURL; film.preload = 'auto'; film.load();
    status.textContent = 'Preparing motion…';
  } catch (error) {
    if (generation !== loadGeneration || error.name === 'AbortError') return;
    ready = false; retry.hidden = false;
    status.textContent = 'Motion could not load. Select Retry to try again.';
  } finally { if (generation === loadGeneration) loading = false; }
}
function queue() { if (!queued) { queued = true; requestAnimationFrame(render); } }
function render() {
  queued = false;
  slider.value = target;
  $('#story-counter').textContent = `FRAME ${String(target + 1).padStart(4, '0')} / ${frames}`;
  const chapter = Math.max(0, starts.findLastIndex(time => target / 24 >= time));
  $('#story-chapter').textContent = `${String(chapter + 1).padStart(2,'0')} / ${chapters[chapter]}`;
  const copy = $('.hero-copy');
  const opacity = Math.max(0, 1 - Math.max(0,target - 24) / 48);
  copy.style.opacity = opacity;
  $('.shade').style.opacity = opacity;
  slider.setAttribute('aria-valuetext', `${chapters[chapter]}, frame ${target + 1} of ${frames}`);
  copy.inert = target >= 72;
  copy.setAttribute('aria-hidden', String(target >= 72));
  // The latest desired frame wins; never issue overlapping seeks.
  if (ready && !film.seeking && Math.abs(film.currentTime - target / 24) > 1 / 96) film.currentTime = target / 24;
}
function setFrame(n, syncScroll = false) {
  target = Math.max(0, Math.min(frames - 1, Math.round(n)));
  if (syncScroll) ensureFilm();
  if (syncScroll && enabled) {
    const distance = track.offsetHeight - innerHeight;
    window.scrollTo({top:track.offsetTop + target / (frames - 1) * distance, behavior:'instant'});
  }
  queue();
}
function fromScroll() {
  if (!enabled || $('#viewer').open) return;
  if (scrollY > track.offsetTop && scrollY < track.offsetTop + track.offsetHeight) ensureFilm();
  const distance = track.offsetHeight - innerHeight;
  if (distance > 0) setFrame((scrollY - track.offsetTop) / distance * (frames - 1));
}
function loadFilm() {
  loadGeneration++; downloadController?.abort(); loading = false;
  film.removeAttribute('src'); film.load();
  if (objectURL) { URL.revokeObjectURL(objectURL); objectURL = ''; }
  sourceProgress = target / Math.max(1, frames - 1);
  chapters = mobile.matches ? titles : [titles[0], 'Through the Fold', ...titles.slice(1)];
  starts = mobile.matches ? [0,7.5,15,22.5,30] : [0,3.5,11,18.5,26,33.5];
  film.poster = `assets/materials/${mobile.matches ? 'P' : 'L'}01.jpg`;
  ready = false; retry.hidden = true;
  pendingSource = `assets/materials-${mobile.matches ? 'mobile' : 'desktop'}.mp4`;
  frames = mobile.matches ? 912 : 996; slider.max = frames - 1;
  target = Math.round(sourceProgress * (frames - 1));
  $('#load-status').textContent = enabled ? 'Scroll or select Enter my world to start motion' : 'Still mode · select Enable scroll journey for motion';
  if (enabled && !navigator.connection?.saveData) ensureFilm();
  queue();
}
film.addEventListener('play', () => film.pause());
film.addEventListener('loadeddata', () => { frames = Math.round(film.duration * 24); slider.max = frames - 1; ready = true; $('#load-status').textContent = ''; setFrame(target); if (enabled) fromScroll(); });
film.addEventListener('seeked', queue);
film.addEventListener('error', () => { if (!film.getAttribute('src')) return; ready = false; retry.hidden = false; $('#load-status').textContent = 'The film could not load. Select Retry to try again.'; });
retry.onclick = loadFilm;
mobile.addEventListener('change', loadFilm);
addEventListener('scroll', fromScroll, {passive:true});
addEventListener('resize', fromScroll);
slider.oninput = () => setFrame(Number(slider.value), true);
$('#story-prev').onclick = () => setFrame(target - 1, true);
$('#story-next').onclick = () => setFrame(target + 1, true);
function motionMode() {
  document.body.classList.toggle('motion-off', !enabled);
  $('#motion-toggle').textContent = enabled ? 'Use still experience' : 'Enable scroll journey';
  $('#motion-toggle').setAttribute('aria-pressed', String(enabled));
}
$('#motion-toggle').onclick = () => { enabled = !enabled; motionMode(); if (enabled) { ensureFilm(); setFrame(target, true); } };
reduced.addEventListener('change', () => { enabled = !reduced.matches; motionMode(); });
$('.circle-link').onclick = e => { e.preventDefault(); enabled = true; motionMode(); ensureFilm(); setFrame(96,true); slider.focus({preventScroll:true}); };
const menu = $('.menu-toggle'), nav = $('#main-nav');
menu.onclick = () => { const open = !nav.classList.contains('open'); nav.classList.toggle('open',open); menu.setAttribute('aria-expanded',String(open)); };
nav.querySelectorAll('a').forEach(a => a.onclick = () => { nav.classList.remove('open'); menu.setAttribute('aria-expanded','false'); });
// Filters apply only to selected work, never to the material collection.
 document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => {
  document.querySelectorAll('[data-filter]').forEach(b => { b.classList.toggle('active',b === button); b.setAttribute('aria-pressed',String(b === button)); });
  document.querySelectorAll('.work-grid .work-card').forEach(c => c.hidden = button.dataset.filter !== 'all' && c.dataset.category !== button.dataset.filter);
});
const viewer = $('#viewer'), content = $('#viewer-content');
let collection = [], index = 0, opener;
function showMedia() {
  const card = collection[index];
  $('#viewer-title').textContent = card.dataset.title;
  const isVideo = card.dataset.media === 'video';
  const media = document.createElement(isVideo ? 'video' : 'img');
  media.src = mobile.matches && card.dataset.mobileSrc ? card.dataset.mobileSrc : card.dataset.src;
  if (isVideo) { media.controls = true; media.playsInline = true; media.preload = 'metadata'; media.poster = card.querySelector('img')?.currentSrc || card.querySelector('video')?.poster || 'assets/ribbon.jpg'; }
  else media.alt = card.querySelector('img')?.alt || card.dataset.title;
  media.onerror = () => { const note = document.createElement('p'); note.textContent = 'This media could not load. Close and reopen to retry.'; content.append(note); };
  content.replaceChildren(media);
  $('#viewer-position').textContent = `${index + 1} / ${collection.length}`;
  $('#viewer-prev').disabled = index === 0;
  $('#viewer-next').disabled = index === collection.length - 1;
}
function move(n) { index = Math.max(0, Math.min(collection.length - 1, index + n)); showMedia(); }
document.querySelectorAll('.work-card').forEach(card => card.onclick = () => {
  opener = card;
  collection = [...document.querySelectorAll(card.classList.contains('narrative-card') ? '.narrative-card' : '.work-grid .work-card:not([hidden])')];
  index = collection.indexOf(card); showMedia(); viewer.showModal(); document.body.style.overflow = 'hidden';
});
$('#viewer-prev').onclick = () => move(-1); $('#viewer-next').onclick = () => move(1);
$('#close-viewer').onclick = () => viewer.close();
viewer.addEventListener('close', () => { content.replaceChildren(); document.body.style.overflow = ''; opener?.focus({preventScroll:true}); });
viewer.addEventListener('click', e => { if(e.target === viewer && (e.clientX < viewer.getBoundingClientRect().left || e.clientX > viewer.getBoundingClientRect().right)) viewer.close(); });
addEventListener('keydown', e => {
  if(viewer.open) { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {e.preventDefault();move(e.key === 'ArrowLeft' ? -1 : 1);} return; }
  if (e.key === 'Escape') { nav.classList.remove('open'); menu.setAttribute('aria-expanded','false'); }
  if (['INPUT','BUTTON','A','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;
  const rect = $('.hero').getBoundingClientRect();
  if(rect.top <= 0 && rect.bottom >= innerHeight && ['ArrowDown','ArrowRight','ArrowUp','ArrowLeft'].includes(e.key)) {
    e.preventDefault();setFrame(target + (['ArrowUp','ArrowLeft'].includes(e.key) ? -1 : 1),true);
  }
});
// Native scrolling handles wheel and touch, including leaving and re-entering the film.
// Reduced motion keeps the static hero; deliberate slider/button input still works.
motionMode();loadFilm();queue();
