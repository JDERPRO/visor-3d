/**
 * Bitform 3D Viewer — Selection & Properties
 * 
 * Handles element picking via raycasting, visual highlighting,
 * and extracting IFC properties from fragment groups.
 */

import * as THREE from 'three';
import * as OBC from '@thatopen/components';

// ============================================
// State
// ============================================
let raycaster = null;
let mouse = new THREE.Vector2();
let highlightMaterial = null;
let selectedMesh = null;
let originalMaterials = new Map();
let onSelectCallback = null;

// Debounce for hover
let hoverTimeout = null;

/**
 * Initialize the selection system
 * @param {Object} viewer - Viewer instance from initViewer
 * @param {Function} onSelect - Callback when an element is selected
 */
export function initSelection(viewer, onSelect) {
    const { world, container } = viewer;

    raycaster = new THREE.Raycaster();
    // Set raycaster precision for mesh detection
    raycaster.params.Mesh = { threshold: 0.1 };

    onSelectCallback = onSelect;

    // Create highlight material
    highlightMaterial = new THREE.MeshStandardMaterial({
        color: 0x00e5ff,
        emissive: 0x00e5ff,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
    });

    // Track mouse press to distinguish click vs drag (orbit)
    let mouseDownPos = null;
    let mouseDownTime = 0;

    const canvas = container.querySelector('canvas') || container;

    canvas.addEventListener('pointerdown', (e) => {
        mouseDownPos = { x: e.clientX, y: e.clientY };
        mouseDownTime = performance.now();
    });

    canvas.addEventListener('pointerup', (event) => {
        if (!mouseDownPos) return;

        const dx = event.clientX - mouseDownPos.x;
        const dy = event.clientY - mouseDownPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const elapsed = performance.now() - mouseDownTime;

        mouseDownPos = null;

        // Only treat as a click if the mouse didn't move much and wasn't held long
        // (to avoid triggering selection during orbit/pan)
        if (dist < 5 && elapsed < 400) {
            handleClick(event, viewer);
        }
    });

    // Double-click to deselect
    canvas.addEventListener('dblclick', () => {
        clearSelection(viewer);
        if (onSelectCallback) onSelectCallback(null);
    });

    console.log('[Selection] Initialized');
}

/**
 * Check if a mesh is a grid or helper object
 */
function isGridOrHelper(obj) {
    if (!obj) return false;
    if (obj.isGridHelper || obj.isHelper) return true;
    // OBC grid uses a mesh with a specific name/structure
    const name = (obj.name || '').toLowerCase();
    if (name === 'grid' || name.includes('grid') || name.includes('helper')) return true;
    // Check parent hierarchy
    let parent = obj.parent;
    while (parent) {
        if (parent.isGridHelper || parent.isHelper) return true;
        const pName = (parent.name || '').toLowerCase();
        if (pName === 'grid' || pName.includes('gridhelper')) return true;
        // OBC SimpleGrid wraps in a group with a specific structure
        if (parent.constructor?.name === 'SimpleGrid') return true;
        parent = parent.parent;
    }
    // Check if it's a large flat plane (typical of grids)
    if (obj.geometry) {
        const posAttr = obj.geometry.attributes?.position;
        if (posAttr && posAttr.count <= 6) {
            // Possibly a simple quad/plane
            const mat = obj.material;
            if (mat && mat.type === 'ShaderMaterial') return true;
        }
    }
    return false;
}

/**
 * Handle click events on the 3D scene
 */
function handleClick(event, viewer) {
    const { world, container } = viewer;

    // Use the renderer's DOM element (canvas) for accurate coordinates
    const canvas = world.renderer?.three?.domElement || container.querySelector('canvas') || container;
    const rect = canvas.getBoundingClientRect();

    // Calculate normalized device coordinates
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Cast ray from camera — SimpleCamera wraps a THREE camera
    const camera = world.camera.three;
    raycaster.setFromCamera(mouse, camera);

    // Find all intersectable meshes in the scene (skip grids/helpers)
    const meshes = [];
    world.scene.three.traverse((child) => {
        if (child.isMesh && child.visible) {
            // Skip grid planes and helpers
            if (isGridOrHelper(child)) return;
            meshes.push(child);
        }
    });

    const intersects = raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
        // Find first model mesh hit (skip any remaining grid-like objects)
        let hit = null;
        let mesh = null;
        for (const inters of intersects) {
            if (!isGridOrHelper(inters.object)) {
                hit = inters;
                mesh = inters.object;
                break;
            }
        }
        if (!hit || !mesh) return;

        // Find the parent fragment group
        const fragmentGroup = findFragmentGroup(mesh);

        // Highlight the selected mesh
        highlightElement(mesh, viewer);

        // Extract properties
        const props = extractProperties(mesh, fragmentGroup, hit, viewer);

        if (onSelectCallback) {
            onSelectCallback(props);
        }
    }
}

/**
 * Walk up the scene hierarchy to find a FragmentsGroup parent
 */
function findFragmentGroup(mesh) {
    let current = mesh;
    while (current) {
        // FragmentsGroup from @thatopen/fragments has specific markers
        if (current.isGroup && (current.ifcMetadata || current.items || current.uuid)) {
            // Check if it looks like a fragments group
            if (current.children?.length > 0 && current.children.some(c => c.isMesh)) {
                return current;
            }
        }
        current = current.parent;
    }
    return null;
}

/**
 * Highlight the selected element
 */
function highlightElement(mesh, viewer) {
    // Clear previous highlight
    clearHighlight();

    // Store original material(s)
    if (Array.isArray(mesh.material)) {
        originalMaterials.set(mesh.uuid, mesh.material.map(m => m));
        mesh.material = mesh.material.map(() => highlightMaterial);
    } else {
        originalMaterials.set(mesh.uuid, mesh.material);
        mesh.material = highlightMaterial;
    }

    selectedMesh = mesh;
}

/**
 * Clear highlighting from previously selected mesh
 */
function clearHighlight() {
    if (selectedMesh && originalMaterials.has(selectedMesh.uuid)) {
        selectedMesh.material = originalMaterials.get(selectedMesh.uuid);
        originalMaterials.delete(selectedMesh.uuid);
    }
    selectedMesh = null;
}

/**
 * Clear selection entirely
 */
export function clearSelection(viewer) {
    clearHighlight();
}

/**
 * Map IFC type code to human-readable name
 * Common type codes from web-ifc
 */
const IFC_TYPE_MAP = {
    // Building elements
    3588315303: 'IfcWall',
    1529196076: 'IfcSlab',
    843113511: 'IfcColumn',
    753842376: 'IfcBeam',
    395920057: 'IfcDoor',
    3304561284: 'IfcWindow',
    2262370178: 'IfcRailing',
    331165859: 'IfcStairFlight',
    338393293: 'IfcStair',
    1687234759: 'IfcPlate',
    1281925730: 'IfcCovering',
    2979338954: 'IfcBuildingElementProxy',
    // Spatial
    4031249490: 'IfcSite',
    4146886087: 'IfcBuilding',
    3124254112: 'IfcBuildingStorey',
    3856911033: 'IfcSpace',
    // MEP
    1051757585: 'IfcFurnishingElement',
    263784265: 'IfcFurniture',
    900683007: 'IfcFooting',
    2391383451: 'IfcCurtainWall',
    1073191201: 'IfcMember',
    // Other common
    2188021234: 'IfcFlowTerminal',
    3512223829: 'IfcWallStandardCase',
    1095909175: 'IfcProduct',
    180925521: 'IfcSIUnit',
    2624227202: 'IfcLocalPlacement',
    1040185647: 'IfcMaterialLayerSetUsage',
    3303938423: 'IfcMaterialLayerSet',
    248100487: 'IfcMaterialLayer',
    1959218052: 'IfcCartesianPoint',
    3113134337: 'IfcShapeRepresentation',
};

function getIfcTypeName(typeCode) {
    return IFC_TYPE_MAP[typeCode] || null;
}

/**
 * Extract properties from a selected mesh/fragment
 */
function extractProperties(mesh, fragmentGroup, hit, viewer) {
    const { fragmentsManager } = viewer;

    const props = {
        general: {},
        geometry: {},
        material: {},
        ifc: {},
        position: {}
    };

    // ---- General Info ----
    props.general['Nombre'] = mesh.name || '(sin nombre)';
    props.general['ID'] = mesh.uuid.substring(0, 8);
    props.general['Tipo'] = mesh.type || 'Mesh';

    if (mesh.geometry) {
        const geo = mesh.geometry;
        const vertexCount = geo.attributes?.position?.count || 0;
        const indexCount = geo.index?.count || 0;
        const triangles = indexCount ? indexCount / 3 : vertexCount / 3;

        props.geometry['Vértices'] = vertexCount.toLocaleString();
        props.geometry['Triángulos'] = Math.floor(triangles).toLocaleString();

        // Bounding box
        if (!geo.boundingBox) geo.computeBoundingBox();
        if (geo.boundingBox) {
            const size = new THREE.Vector3();
            geo.boundingBox.getSize(size);
            props.geometry['Ancho (X)'] = size.x.toFixed(3) + ' m';
            props.geometry['Alto (Y)'] = size.y.toFixed(3) + ' m';
            props.geometry['Profundidad (Z)'] = size.z.toFixed(3) + ' m';
        }
    }

    // ---- Position ----
    if (hit.point) {
        props.position['X'] = hit.point.x.toFixed(3);
        props.position['Y'] = hit.point.y.toFixed(3);
        props.position['Z'] = hit.point.z.toFixed(3);
    }

    if (hit.faceIndex !== undefined) {
        props.position['Cara'] = hit.faceIndex.toLocaleString();
    }

    props.position['Distancia'] = hit.distance.toFixed(2) + ' m';

    // ---- Material Info ----
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (mat && mat !== highlightMaterial) {
        props.material['Tipo Material'] = mat.type || 'Unknown';
        if (mat.color) {
            props.material['Color'] = '#' + mat.color.getHexString();
        }
        if (mat.opacity !== undefined && mat.opacity < 1) {
            props.material['Opacidad'] = (mat.opacity * 100).toFixed(0) + '%';
        }
        if (mat.transparent) {
            props.material['Transparente'] = 'Sí';
        }
    }

    // ---- IFC Properties ----
    // Useful IFC attributes to display
    const USEFUL_IFC_KEYS = new Set([
        'Name', 'Description', 'ObjectType', 'Tag', 'GlobalId',
        'LongName', 'PredefinedType', 'OverallHeight', 'OverallWidth',
        'NumberOfRiser', 'NumberOfTreads', 'RiserHeight', 'TreadLength',
        'NominalValue', 'Area', 'Volume', 'GrossArea', 'NetArea',
        'GrossSideArea', 'NetSideArea', 'GrossVolume', 'NetVolume',
        'Width', 'Height', 'Depth', 'Length', 'Perimeter',
        'TotalThickness', 'NominalDiameter', 'CrossSectionArea',
        'FireRating', 'ThermalTransmittance', 'LoadBearing',
        'IsExternal', 'Reference', 'Status', 'Phase',
    ]);

    // Keys to skip (internal/technical)
    const SKIP_IFC_KEYS = new Set([
        'expressID', 'type', 'LengthExponent', 'MassExponent', 'TimeExponent',
        'ElectricCurrentExponent', 'ThermodynamicTemperatureExponent',
        'AmountOfSubstanceExponent', 'LuminousIntensityExponent',
        'ParameterTakesPrecedence', 'Sizeable', 'Exponent',
        'Dimensions', 'UnitType', 'Prefix', 'ConversionFactor',
        'ValueComponent', 'UnitComponent', 'OwnerHistory',
        'RepresentationContexts', 'UnitsInContext',
    ]);

    try {
        if (fragmentsManager && fragmentsManager.groups) {
            fragmentsManager.groups.forEach((group) => {
                // Check if mesh belongs to this group
                let belongsToGroup = false;
                group.traverse((child) => {
                    if (child === mesh) belongsToGroup = true;
                });

                if (belongsToGroup) {
                    // Get group-level info
                    if (group.ifcMetadata?.name) props.ifc['Nombre IFC'] = group.ifcMetadata.name;
                    if (group.ifcMetadata?.schema) props.ifc['Schema'] = group.ifcMetadata.schema;

                    // Try to get properties from group data
                    if (group.getLocalProperties) {
                        try {
                            const allProps = group.getLocalProperties();
                            if (!allProps) return;

                            // Find the expressID for this mesh
                            // Fragments store items with expressIDs
                            let expressID = null;

                            // Method 1: direct property on mesh
                            if (mesh.expressID !== undefined) {
                                expressID = mesh.expressID;
                            }

                            // Method 2: check fragment items
                            if (!expressID && group.items) {
                                for (const [fragID, ids] of group.items) {
                                    if (ids && ids.size > 0) {
                                        // For now, try to find a matching fragment
                                        for (const frag of group.children) {
                                            if (frag === mesh && ids.size > 0) {
                                                expressID = [...ids][0];
                                                break;
                                            }
                                        }
                                    }
                                }
                            }

                            // Method 3: find which fragment this mesh is, and get its expressIDs
                            if (!expressID) {
                                // Each child mesh in a FragmentsGroup is a "Fragment"
                                // that can contain multiple IFC elements
                                const fragIndex = group.children.indexOf(mesh);
                                if (fragIndex >= 0 && group.items) {
                                    const itemEntries = [...group.items.entries()];
                                    if (fragIndex < itemEntries.length) {
                                        const [, ids] = itemEntries[fragIndex];
                                        if (ids && ids.size > 0) {
                                            expressID = [...ids][0];
                                        }
                                    }
                                }
                            }

                            if (expressID) {
                                props.ifc['expressID'] = expressID;

                                // Get the element properties
                                const itemProps = allProps[expressID];
                                if (itemProps) {
                                    // Extract useful IFC attributes
                                    for (const [key, val] of Object.entries(itemProps)) {
                                        if (SKIP_IFC_KEYS.has(key)) continue;

                                        let displayVal = null;
                                        if (val === null || val === undefined) continue;

                                        if (typeof val === 'object' && val !== null) {
                                            if (val.value !== undefined) {
                                                displayVal = val.value;
                                            } else if (val.type !== undefined && val.Name?.value) {
                                                displayVal = val.Name.value;
                                            }
                                        } else {
                                            displayVal = val;
                                        }

                                        if (displayVal !== null && displayVal !== undefined && displayVal !== '') {
                                            props.ifc[key] = String(displayVal);
                                        }
                                    }
                                }

                                // Try to determine IFC type from the type code
                                if (itemProps?.type) {
                                    const ifcType = getIfcTypeName(itemProps.type);
                                    if (ifcType) {
                                        props.ifc['Categoría IFC'] = ifcType;
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn('[Selection] Error reading fragment properties:', e);
                        }
                    }
                }
            });
        }
    } catch (e) {
        console.warn('[Selection] Error reading fragment data:', e);
    }

    // Clean up empty sections
    for (const key of Object.keys(props)) {
        if (Object.keys(props[key]).length === 0) {
            delete props[key];
        }
    }

    return props;
}

/**
 * Render properties to the panel
 * @param {Object|null} props - Properties object or null to clear
 */
export function renderProperties(props) {
    const content = document.getElementById('properties-content');
    if (!content) return;

    if (!props) {
        content.innerHTML = `
            <div class="empty-panel">
                <i class="fas fa-mouse-pointer"></i>
                <p>Selecciona un elemento del modelo para ver sus propiedades</p>
            </div>
        `;
        return;
    }

    const sectionNames = {
        general: { label: 'General', icon: 'fas fa-cube' },
        ifc: { label: 'IFC', icon: 'fas fa-building' },
        geometry: { label: 'Geometría', icon: 'fas fa-shapes' },
        position: { label: 'Punto de intersección', icon: 'fas fa-crosshairs' },
        material: { label: 'Material', icon: 'fas fa-palette' },
    };

    let html = '';

    for (const [sectionKey, sectionData] of Object.entries(props)) {
        const meta = sectionNames[sectionKey] || { label: sectionKey, icon: 'fas fa-tag' };
        const entries = Object.entries(sectionData);
        if (entries.length === 0) continue;

        html += `<div class="prop-group">`;
        html += `<div class="prop-group-title"><i class="${meta.icon}" style="margin-right: 6px;"></i>${meta.label}</div>`;

        for (const [key, value] of entries) {
            // Special rendering for color values
            let displayValue = String(value);
            if (key === 'Color' && displayValue.startsWith('#')) {
                displayValue = `<span style="display: inline-flex; align-items: center; gap: 6px;">
                    <span style="width: 12px; height: 12px; border-radius: 2px; background: ${displayValue}; border: 1px solid rgba(255,255,255,0.2); display: inline-block;"></span>
                    ${displayValue}
                </span>`;
            }

            html += `<div class="prop-item">`;
            html += `<span class="prop-key">${key}</span>`;
            html += `<span class="prop-val">${displayValue}</span>`;
            html += `</div>`;
        }

        html += `</div>`;
    }

    content.innerHTML = html;
}
