/**
 * Bitform IFC → FRAG Converter
 * 
 * Converts IFC files to .frag format compatible with the Bitform 3D Viewer.
 * Uses @thatopen/components IfcLoader for parsing and FragmentsManager for export.
 */

import './converter.css';
import * as THREE from 'three';
import * as OBC from '@thatopen/components';

// ============================================
// State
// ============================================
let components = null;
let world = null;
let fragmentsManager = null;
let ifcLoader = null;
let selectedFile = null;
let convertedData = null; // Uint8Array of the exported .frag
let convertedFileName = null;
let startTime = 0;

// ============================================
// Boot
// ============================================
async function boot() {
    try {
        updateLoadingStatus('Inicializando motor de conversión...');
        updateLoadingProgress(10);

        // Initialize components
        components = new OBC.Components();
        const worlds = components.get(OBC.Worlds);
        world = worlds.create();

        updateLoadingProgress(30);
        updateLoadingStatus('Configurando escena 3D...');

        // Setup scene for preview
        const previewContainer = document.getElementById('preview-container');
        world.scene = new OBC.SimpleScene(components);
        world.renderer = new OBC.SimpleRenderer(components, previewContainer);
        world.camera = new OBC.SimpleCamera(components);

        components.init();
        world.scene.setup();
        world.camera.controls.setLookAt(12, 12, 12, 0, 0, 0);

        // Grid
        const grids = components.get(OBC.Grids);
        grids.create(world);

        updateLoadingProgress(50);
        updateLoadingStatus('Cargando motor IFC (web-ifc WASM)...');

        // Fragments Manager
        fragmentsManager = components.get(OBC.FragmentsManager);

        // IFC Loader
        ifcLoader = components.get(OBC.IfcLoader);
        await ifcLoader.setup();
        ifcLoader.settings.wasm = {
            path: 'https://unpkg.com/web-ifc@0.0.55/',
            absolute: true
        };

        updateLoadingProgress(90);
        updateLoadingStatus('Motor listo.');

        // Handle resize
        const resizeObserver = new ResizeObserver(() => {
            if (world.renderer) world.renderer.resize();
        });
        resizeObserver.observe(previewContainer);

        updateLoadingProgress(100);

        // Hide loading screen
        setTimeout(() => {
            const screen = document.getElementById('loading-screen');
            if (screen) {
                screen.classList.add('fade-out');
                setTimeout(() => { screen.style.display = 'none'; }, 600);
            }
        }, 300);

        // Setup UI
        setupUpload();
        setupActions();

        console.log('[Converter] Ready');

    } catch (error) {
        console.error('[Converter] Boot error:', error);
        updateLoadingStatus(`Error: ${error.message}`);
    }
}

// ============================================
// Loading Screen Helpers
// ============================================
function updateLoadingStatus(msg) {
    const el = document.getElementById('loading-status');
    if (el) el.textContent = msg;
}

function updateLoadingProgress(percent) {
    const bar = document.getElementById('loading-bar');
    if (bar) bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
}

// ============================================
// Upload / File Selection
// ============================================
function setupUpload() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('ifc-file-input');
    let dragCounter = 0;

    // Click to select
    uploadArea.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) onFileSelected(file);
        fileInput.value = '';
    });

    // Drag & Drop
    uploadArea.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            uploadArea.classList.remove('drag-over');
        }
    });

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        uploadArea.classList.remove('drag-over');

        const file = e.dataTransfer.files[0];
        if (file) {
            const ext = file.name.split('.').pop().toLowerCase();
            if (ext !== 'ifc') {
                showToast('Solo se aceptan archivos .ifc', 'error');
                return;
            }
            onFileSelected(file);
        }
    });

    // Remove file button
    document.getElementById('btn-remove-file')?.addEventListener('click', resetState);
}

function onFileSelected(file) {
    selectedFile = file;
    convertedData = null;

    // Show file info
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('file-size').textContent = formatFileSize(file.size);

    document.getElementById('upload-section').classList.add('hidden');
    document.getElementById('file-info-section').classList.remove('hidden');
    document.getElementById('action-section').classList.remove('hidden');
    document.getElementById('progress-section').classList.add('hidden');
    document.getElementById('result-section').classList.add('hidden');
    document.getElementById('error-section').classList.add('hidden');

    showToast(`Archivo "${file.name}" seleccionado`);
}

// ============================================
// Actions
// ============================================
function setupActions() {
    document.getElementById('btn-convert')?.addEventListener('click', startConversion);
    document.getElementById('btn-download')?.addEventListener('click', downloadFrag);
    document.getElementById('btn-preview')?.addEventListener('click', openInViewer);
    document.getElementById('btn-convert-another')?.addEventListener('click', resetState);
    document.getElementById('btn-retry')?.addEventListener('click', startConversion);
}

// ============================================
// Conversion Pipeline
// ============================================
async function startConversion() {
    if (!selectedFile) return;

    startTime = performance.now();

    // Show progress, hide other sections
    document.getElementById('action-section').classList.add('hidden');
    document.getElementById('result-section').classList.add('hidden');
    document.getElementById('error-section').classList.add('hidden');
    document.getElementById('progress-section').classList.remove('hidden');

    // Reset steps
    resetSteps();

    try {
        // Step 1: Read the IFC file
        setStepActive('step-read');
        updateProgressMessage('Leyendo archivo IFC...');
        updateConversionProgress(10);

        const arrayBuffer = await selectedFile.arrayBuffer();
        const ifcData = new Uint8Array(arrayBuffer);

        setStepComplete('step-read', `${formatFileSize(ifcData.length)} leídos`);
        updateConversionProgress(25);

        // Step 2: Parse geometry
        setStepActive('step-parse');
        updateProgressMessage('Parseando geometría IFC con web-ifc...');
        updateConversionProgress(30);

        // Clear previous models from scene
        clearScene();

        // Load IFC through the IfcLoader
        const model = await ifcLoader.load(ifcData);

        if (!model) {
            throw new Error('El IfcLoader no retornó un modelo válido');
        }

        // Add to scene for preview
        world.scene.three.add(model);

        setStepComplete('step-parse', 'Geometría procesada');
        updateConversionProgress(60);

        // Step 3: Convert to fragments format
        setStepActive('step-convert');
        updateProgressMessage('Convirtiendo a formato Fragments...');
        updateConversionProgress(70);

        // Count elements
        let totalElements = 0;
        let totalFragments = 0;
        fragmentsManager.groups.forEach((group) => {
            totalFragments++;
            totalElements += group.children?.length || 0;
            if (group.items) totalElements += group.items.length;
        });

        setStepComplete('step-convert', `${totalElements} elementos, ${totalFragments} fragmentos`);
        updateConversionProgress(80);

        // Step 4: Export to .frag binary
        setStepActive('step-export');
        updateProgressMessage('Exportando archivo .frag...');
        updateConversionProgress(85);

        // Export using FragmentsManager
        const exportedData = fragmentsManager.export(model);
        convertedData = exportedData;
        convertedFileName = selectedFile.name.replace(/\.ifc$/i, '.frag');

        setStepComplete('step-export', `${formatFileSize(exportedData.length)} generados`);
        updateConversionProgress(100);

        // Fit camera to model
        fitToModel(model);

        // Show preview overlay
        const previewOverlay = document.getElementById('preview-overlay');
        const previewEmpty = document.getElementById('preview-empty');
        if (previewOverlay) previewOverlay.classList.remove('hidden');
        if (previewEmpty) previewEmpty.classList.add('hidden');
        document.getElementById('preview-model-name').textContent = convertedFileName;

        // Show results
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
        showResults(ifcData.length, exportedData.length, totalElements, elapsed);

        showToast('¡Conversión completada exitosamente!');

    } catch (error) {
        console.error('[Converter] Error:', error);
        showError(error.message);
    }
}

// ============================================
// Progress UI
// ============================================
function resetSteps() {
    ['step-read', 'step-parse', 'step-convert', 'step-export'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('active', 'complete', 'error');
            el.querySelector('.step-status').textContent = 'Pendiente';
        }
    });
}

function setStepActive(stepId) {
    const el = document.getElementById(stepId);
    if (el) {
        el.classList.add('active');
        el.classList.remove('complete', 'error');
        el.querySelector('.step-status').textContent = 'En progreso...';
    }
}

function setStepComplete(stepId, statusText) {
    const el = document.getElementById(stepId);
    if (el) {
        el.classList.remove('active');
        el.classList.add('complete');
        el.querySelector('.step-status').textContent = statusText || 'Completado';
    }
}

function setStepError(stepId, statusText) {
    const el = document.getElementById(stepId);
    if (el) {
        el.classList.remove('active', 'complete');
        el.classList.add('error');
        el.querySelector('.step-status').textContent = statusText || 'Error';
    }
}

function updateConversionProgress(percent) {
    const bar = document.getElementById('conversion-progress');
    if (bar) bar.style.width = `${percent}%`;
}

function updateProgressMessage(msg) {
    const el = document.getElementById('progress-message');
    if (el) el.textContent = msg;
}

// ============================================
// Results
// ============================================
function showResults(originalSize, fragSize, elements, timeSeconds) {
    document.getElementById('progress-section').classList.add('hidden');
    document.getElementById('result-section').classList.remove('hidden');

    document.getElementById('result-original-size').textContent = formatFileSize(originalSize);
    document.getElementById('result-frag-size').textContent = formatFileSize(fragSize);

    const reduction = originalSize > 0
        ? ((1 - fragSize / originalSize) * 100).toFixed(1)
        : '0';
    const reductionEl = document.getElementById('result-reduction');
    reductionEl.textContent = `${reduction}%`;
    reductionEl.className = `stat-value ${parseFloat(reduction) > 0 ? 'stat-success' : 'stat-warning'}`;

    document.getElementById('result-elements').textContent = elements.toLocaleString();
    document.getElementById('result-time').textContent = `${timeSeconds}s`;
}

function showError(message) {
    document.getElementById('progress-section').classList.add('hidden');
    document.getElementById('error-section').classList.remove('hidden');
    document.getElementById('error-message').textContent = message;
}

// ============================================
// Download & Preview
// ============================================
function downloadFrag() {
    if (!convertedData || !convertedFileName) return;

    const blob = new Blob([convertedData], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = convertedFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Descargando "${convertedFileName}"`);
}

function openInViewer() {
    if (!convertedData || !convertedFileName) return;

    // Create a blob URL and open the viewer with it
    const blob = new Blob([convertedData], { type: 'application/octet-stream' });
    const blobUrl = URL.createObjectURL(blob);

    // Open the main viewer in a new tab with the model URL
    const viewerUrl = `/?model=${encodeURIComponent(blobUrl)}&name=${encodeURIComponent(convertedFileName)}`;
    window.open(viewerUrl, '_blank');
}

// ============================================
// Scene Helpers
// ============================================
function clearScene() {
    if (!world?.scene?.three) return;

    // Remove all fragment groups
    if (fragmentsManager) {
        // Dispose all existing models
        const groups = Array.from(fragmentsManager.groups.values());
        groups.forEach(group => {
            world.scene.three.remove(group);
        });
        fragmentsManager.dispose();
    }

    // Re-init fragments manager after dispose
    fragmentsManager = components.get(OBC.FragmentsManager);
}

function fitToModel(model) {
    if (!model || !world?.camera?.controls) return;

    const bbox = new THREE.Box3().setFromObject(model);
    if (bbox.isEmpty()) return;

    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 1.5;

    world.camera.controls.setLookAt(
        center.x + distance * 0.7,
        center.y + distance * 0.7,
        center.z + distance * 0.7,
        center.x,
        center.y,
        center.z,
        true
    );
}

// ============================================
// Reset
// ============================================
function resetState() {
    selectedFile = null;
    convertedData = null;
    convertedFileName = null;

    document.getElementById('upload-section').classList.remove('hidden');
    document.getElementById('file-info-section').classList.add('hidden');
    document.getElementById('action-section').classList.add('hidden');
    document.getElementById('progress-section').classList.add('hidden');
    document.getElementById('result-section').classList.add('hidden');
    document.getElementById('error-section').classList.add('hidden');

    // Reset preview
    document.getElementById('preview-overlay')?.classList.add('hidden');
    document.getElementById('preview-empty')?.classList.remove('hidden');

    clearScene();
}

// ============================================
// Utilities
// ============================================
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

let toastTimeout = null;
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-message');
    const iconEl = toast?.querySelector('.toast-icon');

    if (!toast || !msgEl) return;

    if (toastTimeout) clearTimeout(toastTimeout);

    msgEl.textContent = message;

    if (iconEl) {
        iconEl.className = type === 'error'
            ? 'fas fa-exclamation-circle toast-icon toast-error'
            : 'fas fa-check-circle toast-icon';
    }

    toast.classList.remove('toast-hidden');
    toastTimeout = setTimeout(() => {
        toast.classList.add('toast-hidden');
        toastTimeout = null;
    }, 3000);
}

// ============================================
// Start
// ============================================
document.addEventListener('DOMContentLoaded', boot);
