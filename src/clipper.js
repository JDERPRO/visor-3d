/**
 * Bitform 3D Viewer — Clipping Planes Module
 *
 * Provides section cuts along the X, Y, Z axes using THREE.js clipping planes.
 * Each axis has an independent toggle and slider to control the cut position.
 */

import * as THREE from 'three';

// ============================================
// State
// ============================================
const AXES = [
    {
        key: 'x',
        label: 'X',
        color: '#ef4444',       // Red
        colorHex: 0xef4444,
        normal: new THREE.Vector3(-1, 0, 0),
        icon: 'fa-arrows-alt-h',
    },
    {
        key: 'y',
        label: 'Y',
        color: '#22c55e',       // Green
        colorHex: 0x22c55e,
        normal: new THREE.Vector3(0, -1, 0),
        icon: 'fa-arrows-alt-v',
    },
    {
        key: 'z',
        label: 'Z',
        color: '#3b82f6',       // Blue
        colorHex: 0x3b82f6,
        normal: new THREE.Vector3(0, 0, -1),
        icon: 'fa-compress-alt',
    },
];

let clipPlanes = {};      // { x: THREE.Plane, y: THREE.Plane, z: THREE.Plane }
let planeHelpers = {};    // { x: THREE.PlaneHelper, ... }
let activeAxes = {};      // { x: false, y: false, z: false }
let ranges = {};          // { x: { min, max }, y: {}, z: {} }
let viewerRef = null;
let isInitialized = false;

// ============================================
// Initialize
// ============================================
export function initClipper(viewer) {
    viewerRef = viewer;
    const renderer = viewer.world.renderer.three;

    // Enable clipping on the renderer
    renderer.localClippingEnabled = true;

    // Create clipping planes for each axis
    for (const axis of AXES) {
        const plane = new THREE.Plane(axis.normal.clone(), 0);
        clipPlanes[axis.key] = plane;
        activeAxes[axis.key] = false;
        ranges[axis.key] = { min: -50, max: 50 };
    }

    isInitialized = true;
    console.log('[Clipper] Initialized');
}

// ============================================
// Update bounding box ranges from loaded model
// ============================================
export function updateClipperRanges(viewer) {
    if (!isInitialized) return;

    const { world, fragmentsManager } = viewer || viewerRef;
    const globalBox = new THREE.Box3();
    let hasContent = false;

    // Gather bounding box from all objects in the scene
    fragmentsManager.groups.forEach((group) => {
        const box = new THREE.Box3().setFromObject(group);
        if (!box.isEmpty()) {
            globalBox.union(box);
            hasContent = true;
        }
    });

    if (!hasContent) {
        const sceneBox = new THREE.Box3().setFromObject(world.scene.three);
        if (!sceneBox.isEmpty()) {
            globalBox.copy(sceneBox);
            hasContent = true;
        }
    }

    if (!hasContent) return;

    const min = globalBox.min;
    const max = globalBox.max;
    const padding = 0.5; // Small padding beyond the model

    ranges.x = { min: min.x - padding, max: max.x + padding };
    ranges.y = { min: min.y - padding, max: max.y + padding };
    ranges.z = { min: min.z - padding, max: max.z + padding };

    // Update slider ranges in the UI
    for (const axis of AXES) {
        const slider = document.getElementById(`clip-slider-${axis.key}`);
        if (slider) {
            const r = ranges[axis.key];
            slider.min = r.min;
            slider.max = r.max;
            slider.step = ((r.max - r.min) / 200).toFixed(4);
            slider.value = r.max; // Start fully open
        }
        const valEl = document.getElementById(`clip-val-${axis.key}`);
        if (valEl) valEl.textContent = ranges[axis.key].max.toFixed(1);
    }

    // Reset planes to fully open
    for (const axis of AXES) {
        clipPlanes[axis.key].constant = ranges[axis.key].max;
    }

    console.log('[Clipper] Ranges updated:', ranges);
}

// ============================================
// Toggle an axis on/off
// ============================================
export function toggleAxis(axisKey, enable) {
    if (!isInitialized) return;

    activeAxes[axisKey] = enable !== undefined ? enable : !activeAxes[axisKey];

    applyClipping();

    // Show/hide plane helper
    const scene = viewerRef.world.scene.three;
    if (activeAxes[axisKey]) {
        if (!planeHelpers[axisKey]) {
            const axisConfig = AXES.find(a => a.key === axisKey);
            const size = getMaxModelSize();
            const helper = new THREE.PlaneHelper(clipPlanes[axisKey], size * 1.5, axisConfig.colorHex);
            helper.name = `clip-helper-${axisKey}`;
            helper.material.opacity = 0.15;
            helper.material.transparent = true;
            planeHelpers[axisKey] = helper;
        }
        if (!planeHelpers[axisKey].parent) {
            scene.add(planeHelpers[axisKey]);
        }
        planeHelpers[axisKey].visible = true;
    } else {
        if (planeHelpers[axisKey]) {
            planeHelpers[axisKey].visible = false;
        }
    }
}

// ============================================
// Set the position for an axis clipping plane
// ============================================
export function setClipPosition(axisKey, value) {
    if (!isInitialized || !clipPlanes[axisKey]) return;

    clipPlanes[axisKey].constant = value;

    // Update plane helper if it exists
    if (planeHelpers[axisKey]) {
        planeHelpers[axisKey].updateMatrixWorld(true);
    }
}

// ============================================
// Apply clipping planes to all meshes
// ============================================
function applyClipping() {
    if (!viewerRef) return;

    // Collect active clip planes
    const activePlanes = AXES
        .filter(a => activeAxes[a.key])
        .map(a => clipPlanes[a.key]);

    // Apply to renderer
    const renderer = viewerRef.world.renderer.three;
    renderer.clippingPlanes = activePlanes;

    // Also apply to all materials in the scene
    viewerRef.world.scene.three.traverse((child) => {
        if (child.isMesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(mat => {
                mat.clippingPlanes = activePlanes.length > 0 ? activePlanes : null;
                mat.clipShadows = true;
                mat.needsUpdate = true;
            });
        }
    });
}

// ============================================
// Reset all clipping planes
// ============================================
export function resetClipper() {
    for (const axis of AXES) {
        activeAxes[axis.key] = false;
        clipPlanes[axis.key].constant = ranges[axis.key].max;

        if (planeHelpers[axis.key]) {
            planeHelpers[axis.key].visible = false;
        }

        // Reset UI
        const slider = document.getElementById(`clip-slider-${axis.key}`);
        const toggle = document.getElementById(`clip-toggle-${axis.key}`);
        const valEl = document.getElementById(`clip-val-${axis.key}`);
        const flipBtn = document.getElementById(`clip-flip-${axis.key}`);

        if (slider) { slider.value = ranges[axis.key].max; slider.disabled = true; }
        if (toggle) toggle.classList.remove('active');
        if (valEl) valEl.textContent = ranges[axis.key].max.toFixed(1);
        if (flipBtn) flipBtn.disabled = true;
    }

    applyClipping();
}

// ============================================
// Get whether any axis is active
// ============================================
export function isClipperActive() {
    return AXES.some(a => activeAxes[a.key]);
}

// ============================================
// Flip a clipping plane direction
// ============================================
export function flipAxis(axisKey) {
    if (!clipPlanes[axisKey]) return;
    clipPlanes[axisKey].normal.negate();
    applyClipping();
}

// ============================================
// Utility
// ============================================
function getMaxModelSize() {
    const sizeX = ranges.x.max - ranges.x.min;
    const sizeY = ranges.y.max - ranges.y.min;
    const sizeZ = ranges.z.max - ranges.z.min;
    return Math.max(sizeX, sizeY, sizeZ, 20);
}

// ============================================
// Build Clipping Panel UI
// ============================================
export function buildClipperPanel() {
    const panel = document.getElementById('clip-panel');
    if (!panel) return;

    let html = '';

    for (const axis of AXES) {
        const r = ranges[axis.key];
        html += `
        <div class="clip-axis" data-axis="${axis.key}">
            <div class="clip-axis-header">
                <button class="clip-toggle" id="clip-toggle-${axis.key}" title="Activar corte ${axis.label}">
                    <span class="clip-axis-badge" style="background:${axis.color}">${axis.label}</span>
                </button>
                <div class="clip-slider-wrap">
                    <input type="range"
                        class="clip-slider"
                        id="clip-slider-${axis.key}"
                        min="${r.min}"
                        max="${r.max}"
                        step="${((r.max - r.min) / 200).toFixed(4)}"
                        value="${r.max}"
                        disabled
                    />
                </div>
                <span class="clip-val" id="clip-val-${axis.key}">${r.max.toFixed(1)}</span>
                <button class="clip-flip" id="clip-flip-${axis.key}" title="Invertir dirección" disabled>
                    <i class="fas fa-exchange-alt"></i>
                </button>
            </div>
        </div>
        `;
    }

    html += `
        <div class="clip-actions">
            <button class="clip-reset-btn" id="clip-reset" title="Restablecer cortes">
                <i class="fas fa-undo"></i> Restablecer
            </button>
        </div>
    `;

    panel.innerHTML = html;

    // Wire up events
    for (const axis of AXES) {
        const toggle = document.getElementById(`clip-toggle-${axis.key}`);
        const slider = document.getElementById(`clip-slider-${axis.key}`);
        const valEl = document.getElementById(`clip-val-${axis.key}`);
        const flipBtn = document.getElementById(`clip-flip-${axis.key}`);

        toggle?.addEventListener('click', () => {
            const isActive = !activeAxes[axis.key];
            toggleAxis(axis.key, isActive);
            toggle.classList.toggle('active', isActive);
            slider.disabled = !isActive;
            flipBtn.disabled = !isActive;
        });

        slider?.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            setClipPosition(axis.key, val);
            if (valEl) valEl.textContent = val.toFixed(1);
        });

        flipBtn?.addEventListener('click', () => {
            flipAxis(axis.key);

            // Swap slider direction visually by swapping min/max
            const curMin = parseFloat(slider.min);
            const curMax = parseFloat(slider.max);
            slider.min = -curMax;
            slider.max = -curMin;
            slider.value = -parseFloat(slider.value);
            const newVal = parseFloat(slider.value);
            setClipPosition(axis.key, newVal);
            if (valEl) valEl.textContent = newVal.toFixed(1);
        });
    }

    document.getElementById('clip-reset')?.addEventListener('click', () => {
        resetClipper();
    });
}

export { AXES };
