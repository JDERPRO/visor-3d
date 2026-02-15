/**
 * Bitform 3D Viewer — Core Viewer Engine
 * 
 * Wrapper around @thatopen/components for initializing
 * and managing the 3D BIM viewer.
 */

import * as THREE from 'three';
import * as OBC from '@thatopen/components';

/**
 * Initialize the That Open Company viewer
 * @param {HTMLElement} container - DOM element for the viewer
 * @returns {Object} Viewer instance with all references
 */
export async function initViewer(container) {
    const components = new OBC.Components();
    const worlds = components.get(OBC.Worlds);
    const world = worlds.create();

    // Setup scene
    world.scene = new OBC.SimpleScene(components);
    world.renderer = new OBC.SimpleRenderer(components, container);
    world.camera = new OBC.SimpleCamera(components);

    components.init();

    // Setup scene defaults
    world.scene.setup();
    world.camera.controls.setLookAt(12, 12, 12, 0, 0, 0);

    // Grid
    const grids = components.get(OBC.Grids);
    const grid = grids.create(world);

    // Fragments Manager
    const fragmentsManager = components.get(OBC.FragmentsManager);

    // IFC Loader (for .ifc files)
    let ifcLoader = null;
    try {
        ifcLoader = components.get(OBC.IfcLoader);
        await ifcLoader.setup();
        ifcLoader.settings.wasm = {
            path: 'https://unpkg.com/web-ifc@0.0.55/',
            absolute: true
        };
        console.log('[Viewer] IfcLoader ready');
    } catch (e) {
        console.warn('[Viewer] IfcLoader not available:', e.message);
    }

    // Handle window resize
    const resizeObserver = new ResizeObserver(() => {
        if (world.renderer) {
            world.renderer.resize();
        }
    });
    resizeObserver.observe(container);

    // Expose viewer globally for debugging
    const viewer = {
        components,
        worlds,
        world,
        grid,
        fragmentsManager,
        ifcLoader,
        container,
        _resizeObserver: resizeObserver
    };
    window.__viewer = viewer;
    return viewer;
}

/**
 * Load a .frag model from a URL
 * @param {Object} viewer - Viewer instance from initViewer
 * @param {string} url - URL of the .frag file
 * @param {string} name - Display name for the model
 */
export async function loadModelFromUrl(viewer, url, name = 'Model') {
    const { fragmentsManager, world } = viewer;

    // Fetch the file
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: No se pudo descargar el modelo`);
    }

    const buffer = await response.arrayBuffer();
    const data = new Uint8Array(buffer);

    // Detect file type from URL
    const ext = url.split('?')[0].split('.').pop().toLowerCase();

    let model;
    if (ext === 'ifc') {
        // Use IFC Loader
        model = await loadModelFromIfc(viewer, data);
    } else {
        // Default: use FragmentsManager for .frag files
        model = fragmentsManager.load(data);
        addModelToScene(viewer, model);
        fitToModel(viewer, model);
        updateModelInfo(viewer, model);
    }

    return model;
}

/**
 * Load a .frag file from a local File object
 * @param {Object} viewer - Viewer instance from initViewer
 * @param {File} file - The File object
 */
export async function loadModelFromFile(viewer, file) {
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'ifc') {
        return await loadModelFromIfc(viewer, file);
    }

    // Default: treat as .frag
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);

    const { fragmentsManager } = viewer;
    const model = fragmentsManager.load(data);

    addModelToScene(viewer, model);
    fitToModel(viewer, model);
    updateModelInfo(viewer, model);

    return model;
}

/**
 * Load an IFC file using the IfcLoader component
 * @param {Object} viewer - Viewer instance from initViewer
 * @param {File|Uint8Array} fileOrBuffer - The File object or Uint8Array of the IFC data
 */
export async function loadModelFromIfc(viewer, fileOrBuffer) {
    const { ifcLoader, world } = viewer;

    if (!ifcLoader) {
        throw new Error('IfcLoader no disponible en esta versión');
    }

    let buffer;
    if (fileOrBuffer instanceof File) {
        buffer = await fileOrBuffer.arrayBuffer();
    } else {
        buffer = fileOrBuffer.buffer || fileOrBuffer;
    }

    const data = new Uint8Array(buffer);
    const model = await ifcLoader.load(data);

    if (model) {
        world.scene.three.add(model);
        console.log('[Viewer] IFC Model added. Children:', model.children.length);
        fitToModel(viewer, model);
        updateModelInfo(viewer, model);
    }

    return model;
}

/**
 * Add a loaded fragment model to the 3D scene
 */
function addModelToScene(viewer, model) {
    const { world, fragmentsManager } = viewer;

    if (!model) return;

    // Add to scene
    world.scene.three.add(model);
    console.log('[Viewer] Model added to scene. Children:', model.children.length);

    // If the model has no direct children, iterate fragment groups
    // and add them individually (compatibility with some .frag versions)
    if (model.children.length === 0 && fragmentsManager.groups.size > 0) {
        console.log('[Viewer] Re-adding fragment groups individually...');
        fragmentsManager.groups.forEach((group) => {
            if (!group.parent || group.parent !== world.scene.three) {
                world.scene.three.add(group);
            }
        });
    }
}

/**
 * Fit the camera to a specific model's bounding box
 */
function fitToModel(viewer, model) {
    const { world } = viewer;

    if (!model) return;

    // Calculate bounding box
    const bbox = new THREE.Box3().setFromObject(model);
    if (bbox.isEmpty()) {
        console.warn('[Viewer] Model bounding box is empty');
        return;
    }

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
        true // animate
    );
}

/**
 * Fit camera to all loaded models
 * @param {Object} viewer - Viewer instance
 */
export function fitModel(viewer) {
    if (!viewer) return;
    const { world, fragmentsManager } = viewer;

    // Create a global bounding box from all fragment groups
    const globalBox = new THREE.Box3();
    let hasContent = false;

    fragmentsManager.groups.forEach((group) => {
        const box = new THREE.Box3().setFromObject(group);
        if (!box.isEmpty()) {
            globalBox.union(box);
            hasContent = true;
        }
    });

    if (!hasContent) {
        // Fallback: fit to entire scene
        const sceneBox = new THREE.Box3().setFromObject(world.scene.three);
        if (sceneBox.isEmpty()) return;
        globalBox.copy(sceneBox);
    }

    const center = globalBox.getCenter(new THREE.Vector3());
    const size = globalBox.getSize(new THREE.Vector3());
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

/**
 * Update the model info overlay with element/fragment counts
 */
function updateModelInfo(viewer, model) {
    const { fragmentsManager } = viewer;

    const elementsEl = document.getElementById('info-elements');
    const fragmentsEl = document.getElementById('info-fragments');

    if (elementsEl) {
        let totalElements = 0;
        fragmentsManager.groups.forEach((group) => {
            if (group.items) {
                totalElements += group.items.length;
            }
            // Also count children
            totalElements += group.children?.length || 0;
        });
        elementsEl.textContent = totalElements.toLocaleString();
    }

    if (fragmentsEl) {
        fragmentsEl.textContent = fragmentsManager.groups.size.toLocaleString();
    }
}

/**
 * Cleanup the viewer
 */
export function disposeViewer(viewer) {
    if (!viewer) return;

    viewer._resizeObserver?.disconnect();
    viewer.components?.dispose();
}
