/**
 * Bitform 3D Viewer — Main Entry Point
 * 
 * Visor BIM 3D independiente usando @thatopen/components.
 * Diseñado para funcionar standalone o embebido via iframe.
 * 
 * Comunicación con la web GAS:
 * - Query params: ?model=URL_DEL_MODELO&name=NOMBRE
 * - postMessage: { type: 'load-model', url: '...', name: '...' }
 */

import './style.css';
import { initViewer, loadModelFromUrl, loadModelFromFile, loadModelFromIfc, fitModel, disposeViewer } from './viewer.js';
import { showToast, setLoadingStatus, setLoadingProgress, hideLoadingScreen } from './ui.js';
import { initSelection, renderProperties, clearSelection } from './selection.js';
import { initClipper, updateClipperRanges, buildClipperPanel, resetClipper } from './clipper.js';

// ============================================
// State
// ============================================
let viewerInstance = null;
let isModelLoaded = false;

// ============================================
// Boot
// ============================================
async function boot() {
  try {
    setLoadingStatus('Inicializando motor 3D...');
    setLoadingProgress(20);

    // Init the viewer engine
    viewerInstance = await initViewer(document.getElementById('viewer-container'));
    setLoadingProgress(60);
    setLoadingStatus('Motor listo. Buscando modelo...');

    // Check for model from URL params
    const params = new URLSearchParams(window.location.search);
    const modelUrl = params.get('model');
    const modelName = params.get('name') || 'Modelo';

    if (modelUrl) {
      setLoadingStatus(`Cargando: ${modelName}...`);
      setLoadingProgress(70);
      await loadModelFromUrl(viewerInstance, modelUrl, modelName);
      isModelLoaded = true;
      onModelLoaded(modelName);
    } else {
      setLoadingProgress(100);
      hideLoadingScreen();
    }

    // Setup all UI interactions
    setupToolbar();
    setupDragAndDrop();
    setupFileInput();
    setupKeyboardShortcuts();
    listenForMessages();

    // Setup element selection (raycasting + properties)
    initSelection(viewerInstance, (props) => {
      renderProperties(props);

      // Auto-open properties panel when something is selected
      const panel = document.getElementById('properties-panel');
      const btnProps = document.getElementById('btn-properties');
      if (props && panel) {
        panel.classList.add('panel-open');
        if (btnProps) btnProps.classList.add('active');
      }
    });

    // Setup clipping planes
    initClipper(viewerInstance);

  } catch (error) {
    console.error('Boot error:', error);
    setLoadingStatus(`Error: ${error.message}`);
  }
}

// ============================================
// Model Loaded Handler
// ============================================
function onModelLoaded(name) {
  isModelLoaded = true;
  setLoadingProgress(100);

  // Hide empty state
  const emptyState = document.getElementById('empty-state');
  if (emptyState) emptyState.classList.add('hidden');

  // Show model info
  const modelInfo = document.getElementById('model-info');
  if (modelInfo) modelInfo.classList.remove('hidden');

  // Update model name
  const modelNameEl = document.getElementById('model-name');
  if (modelNameEl) modelNameEl.textContent = name;

  hideLoadingScreen();
  showToast(`Modelo "${name}" cargado correctamente`);

  // Update clipping ranges for the loaded model
  updateClipperRanges(viewerInstance);
  buildClipperPanel();
}

// ============================================
// Toolbar
// ============================================
function setupToolbar() {
  // Fit / Encuadrar
  document.getElementById('btn-fit')?.addEventListener('click', () => {
    if (viewerInstance) {
      fitModel(viewerInstance);
      showToast('Vista encuadrada');
    }
  });

  // Grid toggle
  const btnGrid = document.getElementById('btn-grid');
  btnGrid?.addEventListener('click', () => {
    if (viewerInstance?.grid) {
      const isVisible = viewerInstance.grid.visible;
      viewerInstance.grid.visible = !isVisible;
      btnGrid.classList.toggle('active', !isVisible);
      showToast(isVisible ? 'Grid oculto' : 'Grid visible');
    }
  });
  // Grid starts active
  if (btnGrid) btnGrid.classList.add('active');

  // View buttons
  const views = {
    'btn-front': { pos: [0, 0, 30], target: [0, 0, 0] },
    'btn-top': { pos: [0, 30, 0], target: [0, 0, 0] },
    'btn-right': { pos: [30, 0, 0], target: [0, 0, 0] },
    'btn-iso': { pos: [20, 20, 20], target: [0, 0, 0] },
  };

  for (const [id, view] of Object.entries(views)) {
    document.getElementById(id)?.addEventListener('click', () => {
      if (viewerInstance?.world?.camera?.controls) {
        viewerInstance.world.camera.controls.setLookAt(
          ...view.pos, ...view.target, true
        );
      }
    });
  }

  // Properties panel toggle
  const btnProps = document.getElementById('btn-properties');
  const propsPanel = document.getElementById('properties-panel');
  const btnCloseProps = document.getElementById('btn-close-properties');

  btnProps?.addEventListener('click', () => {
    propsPanel.classList.toggle('panel-open');
    btnProps.classList.toggle('active', propsPanel.classList.contains('panel-open'));
  });

  btnCloseProps?.addEventListener('click', () => {
    propsPanel.classList.remove('panel-open');
    btnProps?.classList.remove('active');
  });

  // Clipping panel toggle
  const btnClip = document.getElementById('btn-clip');
  const clipPanel = document.getElementById('clip-panel');

  btnClip?.addEventListener('click', () => {
    clipPanel.classList.toggle('clip-open');
    btnClip.classList.toggle('active', clipPanel.classList.contains('clip-open'));
  });

  // Fullscreen
  document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  });

  // Demo model
  document.getElementById('btn-demo-model')?.addEventListener('click', async () => {
    showToast('Cargando modelo demo...');
    // Load a public sample FRAG model
    // For now, this is a placeholder — you can replace with your own hosted model
    const demoUrl = '/school_arq.frag';
    try {
      await loadModelFromUrl(viewerInstance, demoUrl, 'Demo Model');
      onModelLoaded('Demo Model');
    } catch (e) {
      showToast('Error cargando demo: ' + e.message);
    }
  });
}

// ============================================
// Drag & Drop
// ============================================
function setupDragAndDrop() {
  const wrapper = document.getElementById('viewer-wrapper');
  const dropZone = document.getElementById('drop-zone');

  let dragCounter = 0;

  wrapper.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    dropZone.classList.remove('hidden');
  });

  wrapper.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dropZone.classList.add('hidden');
    }
  });

  wrapper.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  wrapper.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropZone.classList.add('hidden');

    const file = e.dataTransfer.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['frag', 'ifc'].includes(ext)) {
      showToast('Formato no soportado. Usa .frag o .ifc');
      return;
    }

    try {
      showToast(`Cargando ${file.name}...`);
      await loadModelFromFile(viewerInstance, file);
      onModelLoaded(file.name);
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  });
}

// ============================================
// File Input
// ============================================
function setupFileInput() {
  const input = document.getElementById('file-input');
  input?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      showToast(`Cargando ${file.name}...`);
      await loadModelFromFile(viewerInstance, file);
      onModelLoaded(file.name);
    } catch (err) {
      showToast('Error: ' + err.message);
    }

    // Reset input so same file can be loaded again
    input.value = '';
  });
}

// ============================================
// Keyboard Shortcuts
// ============================================
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // F — Fit model
    if (e.key === 'f' || e.key === 'F') {
      if (viewerInstance) fitModel(viewerInstance);
    }
    // G — Toggle grid
    if (e.key === 'g' || e.key === 'G') {
      document.getElementById('btn-grid')?.click();
    }
    // Escape — Close panels & clear selection
    if (e.key === 'Escape') {
      document.getElementById('properties-panel')?.classList.remove('panel-open');
      document.getElementById('btn-properties')?.classList.remove('active');
      document.getElementById('clip-panel')?.classList.remove('clip-open');
      document.getElementById('btn-clip')?.classList.remove('active');
      if (viewerInstance) {
        clearSelection(viewerInstance);
        renderProperties(null);
      }
    }
    // P — Toggle properties
    if (e.key === 'p' || e.key === 'P') {
      document.getElementById('btn-properties')?.click();
    }
  });
}

// ============================================
// PostMessage API (for iframe communication)
// ============================================
function listenForMessages() {
  window.addEventListener('message', async (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    switch (data.type) {
      case 'load-model':
        if (data.url) {
          try {
            showToast(`Cargando modelo...`);
            await loadModelFromUrl(viewerInstance, data.url, data.name || 'Modelo');
            onModelLoaded(data.name || 'Modelo');
            // Notify parent that model is loaded
            event.source?.postMessage({ type: 'model-loaded', success: true }, '*');
          } catch (err) {
            event.source?.postMessage({ type: 'model-loaded', success: false, error: err.message }, '*');
          }
        }
        break;

      case 'load-model-base64':
        if (data.base64) {
          try {
            showToast('Procesando modelo...');
            const raw = atob(data.base64);
            const array = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) {
              array[i] = raw.charCodeAt(i);
            }
            const blob = new Blob([array]);
            const file = new File([blob], data.name || 'model.frag');
            await loadModelFromFile(viewerInstance, file);
            onModelLoaded(data.name || 'model.frag');
            event.source?.postMessage({ type: 'model-loaded', success: true }, '*');
          } catch (err) {
            event.source?.postMessage({ type: 'model-loaded', success: false, error: err.message }, '*');
          }
        }
        break;

      case 'fit-model':
        fitModel(viewerInstance);
        break;

      case 'load-demo':
        // Trigger the demo button logic
        document.getElementById('btn-demo-model')?.click();
        break;
    }
  });
}

// ============================================
// Start
// ============================================
document.addEventListener('DOMContentLoaded', boot);
