// Fullscreen image lightbox with zoom + pan support.

const ZOOM_LEVELS = [1, 1.5, 2, 3];

let overlay: HTMLDivElement | null = null;
let currentZoomIdx = 0;
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let translate = { x: 0, y: 0 };

function applyTransform(img: HTMLImageElement): void {
  const scale = ZOOM_LEVELS[currentZoomIdx];
  img.style.transform = `translate(${translate.x}px, ${translate.y}px) scale(${scale})`;
}

function cleanup(): void {
  if (!overlay) return;
  overlay.remove();
  overlay = null;
  currentZoomIdx = 0;
  isDragging = false;
  translate = { x: 0, y: 0 };
  document.removeEventListener('keydown', onKeydown);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') cleanup();
}

function createButton(text: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  Object.assign(btn.style, {
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: '#e0e0e0',
    fontSize: '18px',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(4px)',
    transition: 'background 0.15s',
    lineHeight: '1',
  });
  btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.2)'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(255,255,255,0.1)'; });
  return btn;
}

export function openImageViewer(src: string, alt?: string): void {
  if (overlay) cleanup();

  overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(0,0,0,0.85)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '10000',
    opacity: '0',
    transition: 'opacity 0.2s ease',
  });

  // Image
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt ?? 'Image';
  Object.assign(img.style, {
    maxWidth: '90vw',
    maxHeight: '85vh',
    objectFit: 'contain',
    cursor: 'grab',
    transition: 'transform 0.15s ease',
    transformOrigin: 'center center',
    userSelect: 'none',
  });
  img.draggable = false;

  // Pan on drag (only when zoomed)
  img.addEventListener('mousedown', (e) => {
    if (currentZoomIdx === 0) return;
    e.preventDefault();
    isDragging = true;
    dragStart = { x: e.clientX - translate.x, y: e.clientY - translate.y };
    img.style.cursor = 'grabbing';
    img.style.transition = 'none';
  });

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    translate = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y };
    applyTransform(img);
  };

  const onMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    img.style.cursor = currentZoomIdx > 0 ? 'grab' : 'default';
    img.style.transition = 'transform 0.15s ease';
  };

  // Zoom with scroll wheel
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0 && currentZoomIdx < ZOOM_LEVELS.length - 1) {
      currentZoomIdx++;
    } else if (e.deltaY > 0 && currentZoomIdx > 0) {
      currentZoomIdx--;
      if (currentZoomIdx === 0) translate = { x: 0, y: 0 };
    }
    img.style.cursor = currentZoomIdx > 0 ? 'grab' : 'default';
    zoomLabel.textContent = `${ZOOM_LEVELS[currentZoomIdx]}x`;
    applyTransform(img);
  };

  // Controls bar
  const controls = document.createElement('div');
  Object.assign(controls.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '12px',
  });

  const zoomOut = createButton('\u2212', () => {
    if (currentZoomIdx > 0) {
      currentZoomIdx--;
      if (currentZoomIdx === 0) translate = { x: 0, y: 0 };
      img.style.cursor = currentZoomIdx > 0 ? 'grab' : 'default';
      zoomLabel.textContent = `${ZOOM_LEVELS[currentZoomIdx]}x`;
      applyTransform(img);
    }
  });

  const zoomLabel = document.createElement('span');
  zoomLabel.textContent = '1x';
  Object.assign(zoomLabel.style, {
    color: '#999',
    fontSize: '13px',
    minWidth: '32px',
    textAlign: 'center',
    userSelect: 'none',
  });

  const zoomIn = createButton('+', () => {
    if (currentZoomIdx < ZOOM_LEVELS.length - 1) {
      currentZoomIdx++;
      img.style.cursor = 'grab';
      zoomLabel.textContent = `${ZOOM_LEVELS[currentZoomIdx]}x`;
      applyTransform(img);
    }
  });

  controls.append(zoomOut, zoomLabel, zoomIn);

  // Caption
  const caption = document.createElement('div');
  caption.textContent = alt ?? 'Image';
  Object.assign(caption.style, {
    color: '#888',
    fontSize: '12px',
    marginTop: '6px',
    userSelect: 'none',
  });

  // Close button (top-right)
  const closeBtn = createButton('\u00D7', cleanup);
  Object.assign(closeBtn.style, {
    position: 'absolute',
    top: '16px',
    right: '16px',
    fontSize: '24px',
    width: '40px',
    height: '40px',
  });

  // Click outside image to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cleanup();
  });

  // Attach document-level listeners
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);

  // Clean up document listeners when overlay is removed
  const observer = new MutationObserver(() => {
    if (overlay && !document.body.contains(overlay)) {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true });

  overlay.addEventListener('wheel', onWheel, { passive: false });

  img.addEventListener('click', (e) => e.stopPropagation());

  overlay.append(closeBtn, img, controls, caption);
  document.body.appendChild(overlay);

  // Trigger fade-in
  requestAnimationFrame(() => {
    if (overlay) overlay.style.opacity = '1';
  });
}

export function closeImageViewer(): void {
  cleanup();
}
