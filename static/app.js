// App.js - Main application logic and UI handlers

let board;
let canvas, ctx;
let cellSize = 40;
let scriptRunning = false;
let scriptInterval = null;
let showLabels = true;
let showGlues = true;
let gluesActivated = true;
let gluesDuringMotion = true;
let quickAddMode = false;
let quickDeleteMode = false;
let isCtrlPressed = false;
let undoHistory = [];
const MAX_UNDO_HISTORY = 50;

// Tile palette system
let tilePalette = [];
let selectedPaletteIndex = -1;

// Zoom and pan variables
let zoom = 1.0;
let panX = 0;
let panY = 0;
// Allow zooming far enough out to see a full 1000x1000 board at once.
const MIN_ZOOM = 0.01;
const MAX_ZOOM = 5.0;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let selectMode = false;
let selectionDragStart = null;
let selectionDragCurrent = null;
let selectedTiles = new Set();
let copiedSelection = [];
let lastHoverGrid = null;
let selectionOrigin = null;
let selectionMoveStart = null;
let selectionMoveOffset = null;

// Performance optimization variables
let performanceMode = false;
let renderTimeout = null;
let lastRenderTime = 0;
const RENDER_THROTTLE = 16; // ~60fps
let mouseMoveTimeout = null;
let offscreenCanvas = null;
let offscreenCtx = null;
const baseCellSize = 40;
let useColorBatching = false;

// Initialize the application
function init() {
    canvas = document.getElementById('board-canvas');
    ctx = canvas.getContext('2d');
    
    // Create initial board
    const width = parseInt(document.getElementById('board-width').value);
    const height = parseInt(document.getElementById('board-height').value);
    board = new Board(height, width);
    
    // Set canvas size
    resizeCanvas();

    // Setup event listeners
    setupEventListeners();

    // Draw initial board, centered in the viewport
    centerBoardHandler();
    
    // Initialize tile palette
    renderTilePalette();
    
    // Update info
    updateInfo();
}

// The canvas is a fixed-size viewport (it fills the canvas panel) rather than
// being sized to the whole board. The board is drawn into it via pan/zoom with
// viewport culling, so an arbitrarily large board (e.g. 1000x1000) never needs
// an impossibly large canvas.
function resizeCanvas() {
    const panel = document.querySelector('.canvas-panel');
    const statusEl = document.getElementById('canvas-status');
    // Reserve space for panel padding (10px), canvas border (3px) and the
    // status bar shown beneath the canvas.
    const statusReserve = (statusEl ? statusEl.offsetHeight : 20) + 30;
    const width = Math.floor(panel.clientWidth - 26);
    const height = Math.floor(panel.clientHeight - 26 - statusReserve);
    canvas.width = Math.max(320, width);
    canvas.height = Math.max(320, height);
}

function setupEventListeners() {
    // Settings panel controls
    document.getElementById('close-settings').addEventListener('click', () => {
        document.getElementById('control-panel').classList.add('hidden');
        document.querySelector('.main-content').classList.add('controls-hidden');
        document.getElementById('open-settings').style.display = 'block';
        // The panel width animates over 0.3s; re-measure once it settles.
        setTimeout(() => { resizeCanvas(); drawBoard(); }, 320);
    });

    document.getElementById('open-settings').addEventListener('click', () => {
        document.getElementById('control-panel').classList.remove('hidden');
        document.querySelector('.main-content').classList.remove('controls-hidden');
        document.getElementById('open-settings').style.display = 'none';
        setTimeout(() => { resizeCanvas(); drawBoard(); }, 320);
    });

    // Keep the canvas viewport in sync with the window size.
    window.addEventListener('resize', () => {
        resizeCanvas();
        drawBoard();
    });
    
    // Board controls
    document.getElementById('resize-board').addEventListener('click', resizeBoardHandler);
    document.getElementById('clear-board').addEventListener('click', clearBoardHandler);
    document.getElementById('show-labels').addEventListener('change', (e) => {
        showLabels = e.target.checked;
        drawBoard();
    });
    document.getElementById('show-glues').addEventListener('change', (e) => {
        showGlues = e.target.checked;
        drawBoard();
    });
    document.getElementById('performance-mode').addEventListener('change', (e) => {
        performanceMode = e.target.checked;
        console.log('Performance mode:', performanceMode ? 'enabled' : 'disabled');
        drawBoard();
    });
    
    // Factory mode toggle
    document.getElementById('factory-mode').addEventListener('change', (e) => {
        FACTORYMODE = e.target.checked;
        console.log('Factory mode:', FACTORYMODE ? 'enabled' : 'disabled');
    });

    // Glue During Motion toggle
    document.getElementById('glue-during-motion').addEventListener('change', (e) => {
        gluesDuringMotion = e.target.checked;
        console.log('Glue during motion:', gluesDuringMotion ? 'enabled' : 'disabled');
    });
    
    // Tile controls
    document.getElementById('toggle-add-mode').addEventListener('click', toggleAddMode);
    document.getElementById('toggle-delete-mode').addEventListener('click', toggleDeleteMode);
    
    // Keyboard controls for Ctrl key and shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey) {
            isCtrlPressed = true;
            
            // Ctrl+A to toggle add mode
            if (e.key === 'a' || e.key === 'A') {
                e.preventDefault();
                toggleAddMode();
            }
            // Ctrl+D to toggle delete mode
            if (e.key === 'd' || e.key === 'D') {
                e.preventDefault();
                toggleDeleteMode();
            }
            // Ctrl+Z for undo
            if (e.key === 'z' || e.key === 'Z') {
                e.preventDefault();
                undoAction();
            }
            // Ctrl+C / Ctrl+V to copy and paste the selection
            // (ignored while typing in a text field so normal copy/paste still works)
            const typingInField = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
            if ((e.key === 'c' || e.key === 'C') && !typingInField) {
                e.preventDefault();
                copySelectionHandler();
            }
            if ((e.key === 'v' || e.key === 'V') && !typingInField) {
                e.preventDefault();
                pasteSelectionHandler();
            }
        }
    });
    
    document.addEventListener('keyup', (e) => {
        if (!e.ctrlKey) {
            isCtrlPressed = false;
        }
    });
    
    // Script preset selector
    document.getElementById('script-preset').addEventListener('change', (e) => {
        const preset = e.target.value;
        if (preset) {
            document.getElementById('script-input').value = preset;
        }
    });
    
    // Movement buttons
    document.querySelectorAll('.dir-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const direction = e.target.dataset.dir;
            tumbleDirection(direction);
        });
    });
    
    // Keyboard controls (WASD)
    document.addEventListener('keydown', handleKeyPress);
    
    // Undo button
    document.getElementById('undo-action').addEventListener('click', undoAction);
    
    document.getElementById('activate-glues').addEventListener('click', () => {
        if (gluesActivated) {
            // Deactivate: reload the board to reset glue connections
            const width = board.Cols;
            const height = board.Rows;
            const tiles = [];
            
            // Save current tiles
            for (let p of board.Polyominoes) {
                for (let tile of p.Tiles) {
                    tiles.push({
                        x: tile.x,
                        y: tile.y,
                        glues: [...tile.glues],
                        color: tile.color,
                        name: tile.name
                    });
                }
            }
            for (let tile of board.ConcreteTiles) {
                tiles.push({
                    x: tile.x,
                    y: tile.y,
                    glues: [...tile.glues],
                    color: tile.color,
                    name: tile.name,
                    isConcrete: true
                });
            }
            
            // Recreate board without activating glues
            board = new Board(height, width);
            for (let tileData of tiles) {
                if (tileData.isConcrete) {
                    board.AddConc(tileData.x, tileData.y, tileData.glues, tileData.color, tileData.name);
                } else {
                    const p = new Polyomino(board.getNextPolyId(), tileData.x, tileData.y, tileData.glues, tileData.color, tileData.name);
                    board.Add(p);
                }
            }
            
            gluesActivated = false;
        } else {
            // Activate glues
            board.ActivateGlues();
            gluesActivated = true;
        }
        updateGlueButtonState();
        drawBoard();
        updateInfo();
    });
    
    // Activate on load checkbox
    document.getElementById('activate-on-load').addEventListener('change', (e) => {
        gluesActivated = e.target.checked;
        updateGlueButtonState();
    });
    
    // Script controls
    document.getElementById('run-script').addEventListener('click', runScriptHandler);
    document.getElementById('stop-script').addEventListener('click', stopScriptHandler);
    
    // File controls
    document.getElementById('file-input').addEventListener('change', loadFileHandler);
    document.getElementById('load-file').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const fileInput = document.getElementById('file-input');
        fileInput.value = ''; // Reset to allow loading the same file again
        fileInput.click();
        console.log('Load XML button clicked, opening file dialog');
    });
    document.getElementById('save-file').addEventListener('click', saveFileHandler);
    document.getElementById('export-board').addEventListener('click', exportBoardHandler);
    document.getElementById('load-example').addEventListener('click', loadExampleHandler);
    
    // Zoom controls
    document.getElementById('zoom-in').addEventListener('click', () => {
        zoom = Math.min(zoom * 1.2, MAX_ZOOM);
        drawBoard();
    });
    document.getElementById('zoom-out').addEventListener('click', () => {
        zoom = Math.max(zoom / 1.2, MIN_ZOOM);
        drawBoard();
    });
    document.getElementById('zoom-reset').addEventListener('click', () => {
        zoom = 1.0;
        panX = 0;
        panY = 0;
        drawBoard();
    });
    
    document.getElementById('center-board').addEventListener('click', centerBoardHandler);
    document.getElementById('toggle-select-mode').addEventListener('click', toggleSelectMode);
    document.getElementById('copy-selection').addEventListener('click', copySelectionHandler);
    document.getElementById('paste-selection').addEventListener('click', pasteSelectionHandler);
    document.getElementById('clear-selection').addEventListener('click', clearSelectionHandler);
    
    // Tile Palette buttons
    document.getElementById('save-tile-type').addEventListener('click', saveTileType);
    document.getElementById('modify-tile-type').addEventListener('click', modifyTileType);
    document.getElementById('delete-tile-type').addEventListener('click', deleteTileType);
    document.getElementById('save-palette').addEventListener('click', savePalette);
    document.getElementById('load-palette').addEventListener('click', () => {
        document.getElementById('palette-input').click();
    });
    document.getElementById('palette-input').addEventListener('change', loadPalette);
    
    // Canvas mouse events for panning
    canvas.addEventListener('mousedown', canvasMouseDown);
    canvas.addEventListener('mousemove', canvasMouseMove);
    canvas.addEventListener('mouseup', canvasMouseUp);
    canvas.addEventListener('mouseleave', canvasMouseUp);
    canvas.addEventListener('wheel', canvasWheel);
    
    // Canvas click
    canvas.addEventListener('click', canvasClickHandler);
}

function resizeBoardHandler() {
    const width = parseInt(document.getElementById('board-width').value);
    const height = parseInt(document.getElementById('board-height').value);
    
    if (width < 5 || width > 1000 || height < 5 || height > 1000) {
        alert('Board dimensions must be between 5 and 1000');
        return;
    }
    
    // Save current tiles
    const tiles = [];
    for (let p of board.Polyominoes) {
        for (let tile of p.Tiles) {
            if (tile.x < width && tile.y < height) {
                tiles.push({
                    x: tile.x,
                    y: tile.y,
                    color: tile.color,
                    glues: [...tile.glues],
                    name: tile.name
                });
            }
        }
    }
    
    for (let conc of board.ConcreteTiles) {
        if (conc.x < width && conc.y < height) {
            tiles.push({
                x: conc.x,
                y: conc.y,
                color: board.ConcreteColor,
                glues: [],
                name: conc.name,
                isConcrete: true
            });
        }
    }
    
    // Create new board
    board = new Board(height, width);
    clearSelection(false);
    
    // Re-add tiles
    for (let tileData of tiles) {
        if (tileData.isConcrete) {
            const t = new Tile(null, 0, tileData.x, tileData.y, [], tileData.color, true);
            t.name = tileData.name;
            board.AddConc(t);
        } else {
            const p = new Polyomino(board.poly_id_c++, tileData.x, tileData.y, tileData.glues, tileData.color);
            p.Tiles[0].name = tileData.name;
            board.Add(p);
        }
    }
    
    resizeCanvas();

    // Fit and center the (possibly very large) board in the viewport.
    centerBoardHandler();
    updateInfo();
}

function clearBoardHandler() {
    if (confirm('Clear all tiles from the board?')) {
        board.clear();
        clearSelection(false);
        drawBoard();
        updateInfo();
    }
}

function centerBoardHandler() {
    const boardWidth = board.Cols * cellSize;
    const boardHeight = board.Rows * cellSize;

    // Fit the whole board in the canvas viewport with ~10% padding, never
    // zooming in past 1.0 and never below MIN_ZOOM.
    const zoomX = canvas.width / boardWidth;
    const zoomY = canvas.height / boardHeight;
    zoom = Math.max(MIN_ZOOM, Math.min(zoomX, zoomY, 1.0) * 0.9);

    // Center the board in the viewport
    panX = (canvas.width - boardWidth * zoom) / 2;
    panY = (canvas.height - boardHeight * zoom) / 2;

    drawBoard();
}

function toggleAddMode() {
    quickAddMode = !quickAddMode;
    if (quickAddMode) {
        quickDeleteMode = false; // Disable delete mode
        selectMode = false;
        clearSelection(false);
    }
    updateModeButtons();
}

function toggleDeleteMode() {
    quickDeleteMode = !quickDeleteMode;
    if (quickDeleteMode) {
        quickAddMode = false; // Disable add mode
        selectMode = false;
        clearSelection(false);
    }
    updateModeButtons();
}

function updateModeButtons() {
    const addBtn = document.getElementById('toggle-add-mode');
    const deleteBtn = document.getElementById('toggle-delete-mode');
    const selectBtn = document.getElementById('toggle-select-mode');
    
    if (quickAddMode) {
        addBtn.classList.add('active');
        canvas.style.cursor = 'crosshair';
    } else {
        addBtn.classList.remove('active');
    }
    
    if (quickDeleteMode) {
        deleteBtn.classList.add('active');
        canvas.style.cursor = 'not-allowed';
    } else {
        deleteBtn.classList.remove('active');
    }

    if (selectMode) {
        selectBtn.classList.add('active');
        selectBtn.textContent = 'Disable Select Mode';
        canvas.style.cursor = selectionMoveStart ? 'grabbing' : 'crosshair';
    } else {
        selectBtn.classList.remove('active');
        selectBtn.textContent = 'Enable Select Mode';
    }
    
    if (!quickAddMode && !quickDeleteMode && !selectMode) {
        canvas.style.cursor = 'default';
    }
}

function canvasMouseDown(e) {
    if (selectMode) {
        const start = getGridCoordinatesFromEvent(e, true);
        if (!start) return;
        isDragging = false;
        if (selectedTiles.size > 0 && selectedTiles.has(tileKey(start.x, start.y))) {
            selectionMoveStart = start;
            selectionMoveOffset = { x: 0, y: 0 };
            updateModeButtons();
            setSelectionStatus('Dragging selection...');
            drawBoard();
            return;
        }
        selectionDragStart = start;
        selectionDragCurrent = start;
        drawBoard();
        return;
    }

    // Don't pan in quick add/delete modes
    if (quickAddMode || quickDeleteMode) {
        if (quickAddMode) {
            addTileAtMouse(e);
        } else if (quickDeleteMode) {
            deleteTileAtMouse(e);
        }
        return;
    }
    
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    canvas.style.cursor = 'grabbing';
}

function canvasMouseMove(e) {
    // Track the last hovered grid cell so paste can place tiles under the cursor
    lastHoverGrid = getGridCoordinatesFromEvent(e, true);

    if (selectMode && selectionMoveStart && (e.buttons & 1) === 1) {
        const current = getGridCoordinatesFromEvent(e, true);
        if (!current) return;
        selectionMoveOffset = {
            x: current.x - selectionMoveStart.x,
            y: current.y - selectionMoveStart.y
        };
        drawBoard();
        return;
    }

    if (selectMode && selectionDragStart && (e.buttons & 1) === 1) {
        selectionDragCurrent = getGridCoordinatesFromEvent(e, true);
        drawBoard();
        return;
    }

    // Handle drag-to-add/delete in quick modes (no isDragging check needed)
    if (e.buttons === 1 && (quickAddMode || quickDeleteMode)) {
        if (quickAddMode) {
            addTileAtMouse(e);
        } else if (quickDeleteMode) {
            deleteTileAtMouse(e);
        }
        return;
    }
    
    if (!isDragging) return;
    
    const deltaX = e.clientX - lastMouseX;
    const deltaY = e.clientY - lastMouseY;
    
    panX += deltaX;
    panY += deltaY;
    
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    
    // Throttle redraw during pan for better performance
    if (mouseMoveTimeout) {
        return; // Skip this redraw
    }
    
    mouseMoveTimeout = setTimeout(() => {
        mouseMoveTimeout = null;
    }, 16); // Throttle to ~60fps
    
    drawBoard();
}

function canvasMouseUp(e) {
    if (selectMode && selectionMoveStart) {
        const offset = selectionMoveOffset || { x: 0, y: 0 };
        selectionMoveStart = null;
        selectionMoveOffset = null;
        updateModeButtons();
        if (offset.x !== 0 || offset.y !== 0) {
            moveSelectionByOffset(offset.x, offset.y);
        } else {
            setSelectionStatus(`Selected ${selectedTiles.size} tile(s).`);
            drawBoard();
        }
        return;
    }

    if (selectMode && selectionDragStart) {
        const end = selectionDragCurrent || getGridCoordinatesFromEvent(e, true);
        if (end) {
            captureSelectionRectangle(selectionDragStart, end);
        }
        selectionDragStart = null;
        selectionDragCurrent = null;
        drawBoard();
        return;
    }

    isDragging = false;
    canvas.style.cursor = 'grab';
}

function canvasWheel(e) {
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * delta));
    
    // Zoom towards mouse position
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Adjust pan to zoom towards cursor
    panX = mouseX - (mouseX - panX) * (newZoom / zoom);
    panY = mouseY - (mouseY - panY) * (newZoom / zoom);
    
    zoom = newZoom;
    drawBoard();
}

function canvasClickHandler(e) {
    if (selectMode) return;

    // Handle quick add mode
    if (quickAddMode) {
        addTileAtMouse(e);
        return;
    }

    // Handle quick delete mode
    if (quickDeleteMode) {
        deleteTileAtMouse(e);
        return;
    }
}

function addTileAtMouse(e) {
    const coords = getGridCoordinatesFromEvent(e);
    if (!coords) return;
    const { x: gridX, y: gridY } = coords;
    if (board.coordToTile[gridX][gridY] !== null) return;
    
    const name = document.getElementById('tile-name').value;
    const color = document.getElementById('tile-color').value;
    const isConcrete = document.getElementById('tile-concrete').checked;
    const glues = [
        document.getElementById('glue-n').value || ' ',
        document.getElementById('glue-e').value || ' ',
        document.getElementById('glue-s').value || ' ',
        document.getElementById('glue-w').value || ' '
    ];
    
    if (isConcrete) {
        const t = new Tile(null, 0, gridX, gridY, glues, color, true);
        t.name = name;
        board.AddConc(t);
    } else {
        const p = new Polyomino(board.poly_id_c++, gridX, gridY, glues, color);
        p.Tiles[0].name = name;
        board.Add(p);
    }
    
    drawBoard();
    updateInfo();
}

function deleteTileAtMouse(e) {
    const coords = getGridCoordinatesFromEvent(e);
    if (!coords) return;
    const { x: gridX, y: gridY } = coords;
    
    const tile = board.coordToTile[gridX][gridY];
    if (!tile) return;
    removeTileAtCoord(gridX, gridY);
    
    drawBoard();
    updateInfo();
}

function getGridCoordinatesFromEvent(e, clampToBoard = false) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const boardX = (mouseX - panX) / zoom;
    const boardY = (mouseY - panY) / zoom;
    let x = Math.floor(boardX / cellSize);
    let y = Math.floor(boardY / cellSize);
    
    if (clampToBoard) {
        if (board.Cols < 1 || board.Rows < 1) return null;
        x = Math.max(0, Math.min(board.Cols - 1, x));
        y = Math.max(0, Math.min(board.Rows - 1, y));
        return { x, y };
    }
    
    if (x < 0 || x >= board.Cols || y < 0 || y >= board.Rows) {
        return null;
    }
    
    return { x, y };
}

function tileKey(x, y) {
    return `${x},${y}`;
}

function parseTileKey(key) {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
}

function clearSelection(redraw = true) {
    selectedTiles.clear();
    selectionDragStart = null;
    selectionDragCurrent = null;
    selectionOrigin = null;
    selectionMoveStart = null;
    selectionMoveOffset = null;
    updateModeButtons();
    if (redraw) {
        drawBoard();
    }
}

function clearSelectionHandler() {
    clearSelection();
    setSelectionStatus('Selection cleared.');
}

function setSelectionStatus(message) {
    const status = document.getElementById('selection-status');
    if (status) {
        status.textContent = message;
    }
}

function toggleSelectMode() {
    selectMode = !selectMode;
    if (selectMode) {
        quickAddMode = false;
        quickDeleteMode = false;
        setSelectionStatus('Select mode enabled. Drag to select; drag selected tiles to move.');
    } else {
        selectionDragStart = null;
        selectionDragCurrent = null;
        selectionMoveStart = null;
        selectionMoveOffset = null;
        setSelectionStatus('Selection mode is off.');
    }
    updateModeButtons();
    drawBoard();
}

function captureSelectionRectangle(start, end) {
    const minX = Math.max(0, Math.min(start.x, end.x));
    const maxX = Math.min(board.Cols - 1, Math.max(start.x, end.x));
    const minY = Math.max(0, Math.min(start.y, end.y));
    const maxY = Math.min(board.Rows - 1, Math.max(start.y, end.y));
    
    selectedTiles.clear();
    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            if (board.coordToTile[x][y]) {
                selectedTiles.add(tileKey(x, y));
            }
        }
    }
    
    if (selectedTiles.size === 0) {
        selectionOrigin = null;
        setSelectionStatus('No tiles found in that area.');
        return;
    }
    
    selectionOrigin = { x: minX, y: minY };
    setSelectionStatus(`Selected ${selectedTiles.size} tile(s).`);
}

function copySelectionHandler() {
    if (selectedTiles.size === 0) {
        alert('No tiles selected. Enable select mode and drag over tiles first.');
        return;
    }
    
    const coords = Array.from(selectedTiles).map(parseTileKey);
    const minX = Math.min(...coords.map(c => c.x));
    const minY = Math.min(...coords.map(c => c.y));
    copiedSelection = [];
    
    for (const { x, y } of coords) {
        const tile = board.coordToTile[x][y];
        if (!tile) continue;
        copiedSelection.push({
            dx: x - minX,
            dy: y - minY,
            color: tile.color,
            glues: [...tile.glues],
            name: tile.name || '',
            isConcrete: tile.isConcrete === true
        });
    }
    
    selectionOrigin = { x: minX, y: minY };
    setSelectionStatus(`Copied ${copiedSelection.length} tile(s).`);
}

function pasteSelectionHandler() {
    if (copiedSelection.length === 0) {
        alert('Nothing to paste. Copy a selection first (Ctrl+C).');
        return;
    }

    // Place the copied block's top-left corner under the cursor when possible,
    // otherwise fall back to the last selection origin or the board origin.
    const base = lastHoverGrid || selectionOrigin || { x: 0, y: 0 };

    const placementError = validatePlacement(base.x, base.y, copiedSelection);
    if (placementError) {
        alert(`Cannot paste here: ${placementError}`);
        return;
    }

    saveStateToHistory();

    const newSelection = new Set();
    for (const item of copiedSelection) {
        const x = base.x + item.dx;
        const y = base.y + item.dy;
        placeTileAt(item, x, y);
        newSelection.add(tileKey(x, y));
    }

    selectedTiles = newSelection;
    selectionOrigin = { x: base.x, y: base.y };
    setSelectionStatus(`Pasted ${copiedSelection.length} tile(s).`);
    drawBoard();
    updateInfo();
}

function validatePlacement(baseX, baseY, items, allowedOccupied = new Set()) {
    for (const item of items) {
        const x = baseX + item.dx;
        const y = baseY + item.dy;
        if (x < 0 || x >= board.Cols || y < 0 || y >= board.Rows) {
            return `Tile at (${x}, ${y}) would be outside board bounds.`;
        }
        const occupied = board.coordToTile[x][y];
        if (occupied && !allowedOccupied.has(tileKey(x, y))) {
            return `Tile at (${x}, ${y}) is already occupied.`;
        }
    }
    return null;
}

function placeTileAt(tileData, x, y) {
    if (tileData.isConcrete) {
        const t = new Tile(null, 0, x, y, [...tileData.glues], tileData.color, true);
        t.name = tileData.name;
        board.AddConc(t);
    } else {
        const p = new Polyomino(board.poly_id_c++, x, y, [...tileData.glues], tileData.color);
        p.Tiles[0].name = tileData.name;
        board.Add(p);
    }
}

function removeTileAtCoord(x, y) {
    const tile = board.coordToTile[x][y];
    if (!tile) return;
    
    if (tile.isConcrete) {
        const index = board.ConcreteTiles.indexOf(tile);
        if (index > -1) {
            board.ConcreteTiles.splice(index, 1);
            board.coordToTile[x][y] = null;
        }
        return;
    }
    
    const parent = tile.parent;
    if (!parent) return;
    
    const tileIndex = parent.Tiles.indexOf(tile);
    if (tileIndex > -1) {
        parent.Tiles.splice(tileIndex, 1);
        board.coordToTile[x][y] = null;
    }
    if (parent.Tiles.length === 0) {
        const polyIndex = board.Polyominoes.indexOf(parent);
        if (polyIndex > -1) {
            board.Polyominoes.splice(polyIndex, 1);
        }
    }
}

function moveSelectionByOffset(offsetX, offsetY) {
    if (offsetX === 0 && offsetY === 0) {
        alert('Move offset cannot be (0, 0).');
        return;
    }
    
    const sourceCoords = Array.from(selectedTiles).map(parseTileKey);
    const movingTiles = [];
    for (const { x, y } of sourceCoords) {
        const tile = board.coordToTile[x][y];
        if (!tile) continue;
        movingTiles.push({
            sourceX: x,
            sourceY: y,
            dx: x - (selectionOrigin ? selectionOrigin.x : 0),
            dy: y - (selectionOrigin ? selectionOrigin.y : 0),
            color: tile.color,
            glues: [...tile.glues],
            name: tile.name || '',
            isConcrete: tile.isConcrete === true
        });
    }
    
    if (movingTiles.length === 0) {
        alert('Selected tiles are no longer available.');
        clearSelection();
        return;
    }
    
    const sourceSet = new Set(sourceCoords.map(c => tileKey(c.x, c.y)));
    const base = selectionOrigin || {
        x: Math.min(...sourceCoords.map(c => c.x)),
        y: Math.min(...sourceCoords.map(c => c.y))
    };
    
    const movedTemplate = movingTiles.map(tile => ({
        ...tile,
        dx: tile.dx + offsetX,
        dy: tile.dy + offsetY
    }));
    
    const placementError = validatePlacement(base.x, base.y, movedTemplate, sourceSet);
    if (placementError) {
        alert(`Cannot move selection: ${placementError}`);
        return;
    }
    
    saveStateToHistory();
    for (const tileData of movingTiles) {
        removeTileAtCoord(tileData.sourceX, tileData.sourceY);
    }
    
    const newSelection = new Set();
    for (const tileData of movedTemplate) {
        const x = base.x + tileData.dx;
        const y = base.y + tileData.dy;
        placeTileAt(tileData, x, y);
        newSelection.add(tileKey(x, y));
    }
    
    selectedTiles = newSelection;
    selectionOrigin = { x: base.x + offsetX, y: base.y + offsetY };
    setSelectionStatus(`Moved ${movingTiles.length} tile(s).`);
    drawBoard();
    updateInfo();
}

function handleKeyPress(e) {
    // Ignore if user is typing in an input field
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }
    
    const key = e.key.toLowerCase();
    let direction = null;
    
    switch(key) {
        case 'w':
        case 'arrowup':
            direction = 'N';
            break;
        case 'a':
        case 'arrowleft':
            direction = 'W';
            break;
        case 's':
        case 'arrowdown':
            direction = 'S';
            break;
        case 'd':
        case 'arrowright':
            direction = 'E';
            break;
    }
    
    if (direction) {
        e.preventDefault(); // Prevent scrolling with WASD and arrow keys
        tumbleDirection(direction);
    }
}

function tumbleDirection(direction) {
    // Save current state before tumbling
    saveStateToHistory();
    clearSelection(false);
    
    board.Tumble(direction, gluesDuringMotion);
    drawBoard();
    updateInfo();
}

function saveStateToHistory() {
    // Skip undo history for very large boards to save memory
    const totalTiles = board.Polyominoes.length + board.ConcreteTiles.length;
    if (totalTiles > 5000) {
        return; // No undo for huge boards
    }
    
    const state = {
        polyominoes: board.Polyominoes.map(p => ({
            id: p.id,
            tiles: p.Tiles.map(t => ({
                x: t.x,
                y: t.y,
                glues: [...t.glues],
                color: t.color,
                name: t.name
            }))
        })),
        concreteTiles: board.ConcreteTiles.map(t => ({
            x: t.x,
            y: t.y,
            glues: [...t.glues],
            color: t.color,
            name: t.name
        })),
        width: board.Cols,
        height: board.Rows,
        gluesActivated: gluesActivated
    };
    
    undoHistory.push(state);
    
    // Limit history size (smaller for large boards)
    const maxHistory = totalTiles > 2000 ? 10 : MAX_UNDO_HISTORY;
    if (undoHistory.length > maxHistory) {
        undoHistory.shift();
    }
}

function undoAction() {
    if (undoHistory.length === 0) {
        console.log('No actions to undo');
        return;
    }
    
    const state = undoHistory.pop();
    
    // Restore board state
    board = new Board(state.width, state.height);
    
    // Restore polyominoes
    for (let pData of state.polyominoes) {
        const firstTile = pData.tiles[0];
        const p = new Polyomino(pData.id, firstTile.x, firstTile.y, firstTile.glues, firstTile.color);
        p.Tiles[0].name = firstTile.name;
        
        // Add remaining tiles
        for (let i = 1; i < pData.tiles.length; i++) {
            const tData = pData.tiles[i];
            const t = new Tile(p, pData.id, tData.x, tData.y, tData.glues, tData.color);
            t.name = tData.name;
            p.Tiles.push(t);
            board.coordToTile[tData.x][tData.y] = t;
        }
        
        board.Polyominoes.push(p);
        if (board.poly_id_c <= pData.id) {
            board.poly_id_c = pData.id + 1;
        }
    }
    
    // Restore concrete tiles
    for (let tData of state.concreteTiles) {
        const t = new Tile(null, 0, tData.x, tData.y, tData.glues, tData.color, true);
        t.name = tData.name;
        board.AddConc(t);
    }
    
    // Restore glues state
    gluesActivated = state.gluesActivated;
    updateGlueButtonState();
    clearSelection(false);
    
    drawBoard();
    updateInfo();
}

function runScriptHandler() {
    if (scriptRunning) {
        alert('Script is already running');
        return;
    }
    
    const script = document.getElementById('script-input').value.toUpperCase();
    const delay = parseInt(document.getElementById('script-delay').value);
    const loop = document.getElementById('script-loop').checked;
    
    if (!script) {
        alert('Please enter a script sequence');
        return;
    }
    
    // Validate script
    for (let char of script) {
        if (!'NESW'.includes(char)) {
            alert('Script can only contain N, E, S, W characters');
            return;
        }
    }
    
    scriptRunning = true;
    document.getElementById('run-script').disabled = true;
    
    let index = 0;
    scriptInterval = setInterval(() => {
        if (index >= script.length) {
            if (loop) {
                index = 0;
            } else {
                stopScriptHandler();
                return;
            }
        }
        
        const direction = script[index];
        tumbleDirection(direction);
        index++;
    }, delay);
}

function stopScriptHandler() {
    if (scriptInterval) {
        clearInterval(scriptInterval);
        scriptInterval = null;
    }
    scriptRunning = false;
    document.getElementById('run-script').disabled = false;
}

function drawBoard() {
    // Debounce rapid redraws
    if (renderTimeout) {
        cancelAnimationFrame(renderTimeout);
    }
    
    renderTimeout = requestAnimationFrame(() => {
        drawBoardImmediate();
        renderTimeout = null;
    });
}

function drawBoardImmediate() {
    const startTime = performance.now();
    
    // Save context state
    ctx.save();
    
    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Apply zoom and pan transformations
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);
    
    // Calculate visible area (viewport culling)
    const viewMinX = Math.floor(-panX / zoom / cellSize) - 1;
    const viewMinY = Math.floor(-panY / zoom / cellSize) - 1;
    const viewMaxX = Math.ceil((canvas.width - panX) / zoom / cellSize) + 1;
    const viewMaxY = Math.ceil((canvas.height - panY) / zoom / cellSize) + 1;
    
    // Clamp to board boundaries
    const minX = Math.max(0, viewMinX);
    const minY = Math.max(0, viewMinY);
    const maxX = Math.min(board.Cols, viewMaxX);
    const maxY = Math.min(board.Rows, viewMaxY);
    
    // Draw grid (only visible portion). Skip it when cells are too small to
    // see (e.g. a large board zoomed out to fit) — it would just be noise and
    // wastes time drawing thousands of overlapping lines.
    if (!performanceMode && cellSize * zoom >= 4) {
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1 / zoom;
        
        ctx.beginPath();
        for (let i = minX; i <= maxX; i++) {
            ctx.moveTo(i * cellSize, minY * cellSize);
            ctx.lineTo(i * cellSize, maxY * cellSize);
        }
        for (let i = minY; i <= maxY; i++) {
            ctx.moveTo(minX * cellSize, i * cellSize);
            ctx.lineTo(maxX * cellSize, i * cellSize);
        }
        ctx.stroke();
    }
    
    // Determine level of detail based on zoom
    const useHighDetail = zoom >= 0.5 && !performanceMode;
    
    // Draw tiles (only visible ones)
    let tilesDrawn = 0;
    
    if (useColorBatching && performanceMode) {
        // Batch tiles by color for fewer fillStyle changes
        const tilesByColor = new Map();
        
        // Collect visible polyomino tiles
        for (let p of board.Polyominoes) {
            for (let tile of p.Tiles) {
                if (tile.x >= minX && tile.x < maxX && tile.y >= minY && tile.y < maxY) {
                    if (!tilesByColor.has(tile.color)) {
                        tilesByColor.set(tile.color, []);
                    }
                    tilesByColor.get(tile.color).push(tile);
                }
            }
        }
        
        // Collect visible concrete tiles
        for (let conc of board.ConcreteTiles) {
            if (conc.x >= minX && conc.x < maxX && conc.y >= minY && conc.y < maxY) {
                if (!tilesByColor.has(conc.color)) {
                    tilesByColor.set(conc.color, []);
                }
                tilesByColor.get(conc.color).push(conc);
            }
        }
        
        // Draw in batches by color
        for (let [color, tiles] of tilesByColor) {
            ctx.fillStyle = color;
            for (let tile of tiles) {
                const x = tile.x * cellSize;
                const y = tile.y * cellSize;
                ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
                tilesDrawn++;
            }
        }
        
        // Draw borders in one batch
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2 / zoom;
        for (let [_, tiles] of tilesByColor) {
            for (let tile of tiles) {
                const x = tile.x * cellSize;
                const y = tile.y * cellSize;
                ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
            }
        }
    } else {
        // Normal rendering
        for (let p of board.Polyominoes) {
            for (let tile of p.Tiles) {
                if (tile.x >= minX && tile.x < maxX && tile.y >= minY && tile.y < maxY) {
                    drawTile(tile, useHighDetail);
                    tilesDrawn++;
                }
            }
        }
        
        for (let conc of board.ConcreteTiles) {
            if (conc.x >= minX && conc.x < maxX && conc.y >= minY && conc.y < maxY) {
                drawTile(conc, useHighDetail);
                tilesDrawn++;
            }
        }
    }

    if (selectedTiles.size > 0) {
        ctx.save();
        ctx.lineWidth = Math.max(2 / zoom, 1 / zoom);
        const hasPreviewOffset = selectionMoveOffset && (selectionMoveOffset.x !== 0 || selectionMoveOffset.y !== 0);
        for (const key of selectedTiles) {
            const { x, y } = parseTileKey(key);
            if (x < 0 || x >= board.Cols || y < 0 || y >= board.Rows) continue;
            if (!board.coordToTile[x][y]) continue;
            let drawX = x;
            let drawY = y;
            let isInvalidPreview = false;
            if (hasPreviewOffset) {
                drawX = x + selectionMoveOffset.x;
                drawY = y + selectionMoveOffset.y;
                if (drawX < 0 || drawX >= board.Cols || drawY < 0 || drawY >= board.Rows) {
                    isInvalidPreview = true;
                } else {
                    const occupied = board.coordToTile[drawX][drawY];
                    if (occupied && !selectedTiles.has(tileKey(drawX, drawY))) {
                        isInvalidPreview = true;
                    }
                }
            }
            if (drawX < 0 || drawX >= board.Cols || drawY < 0 || drawY >= board.Rows) continue;
            ctx.strokeStyle = isInvalidPreview ? '#dc2626' : '#f59e0b';
            ctx.fillStyle = isInvalidPreview ? 'rgba(220, 38, 38, 0.25)' : 'rgba(245, 158, 11, 0.25)';
            const tileX = drawX * cellSize;
            const tileY = drawY * cellSize;
            ctx.fillRect(tileX + 1, tileY + 1, cellSize - 2, cellSize - 2);
            ctx.strokeRect(tileX + 1, tileY + 1, cellSize - 2, cellSize - 2);
        }
        ctx.restore();
    }

    if (selectionDragStart && selectionDragCurrent) {
        const minX = Math.min(selectionDragStart.x, selectionDragCurrent.x);
        const minY = Math.min(selectionDragStart.y, selectionDragCurrent.y);
        const maxX = Math.max(selectionDragStart.x, selectionDragCurrent.x);
        const maxY = Math.max(selectionDragStart.y, selectionDragCurrent.y);
        const rectX = minX * cellSize;
        const rectY = minY * cellSize;
        const rectW = (maxX - minX + 1) * cellSize;
        const rectH = (maxY - minY + 1) * cellSize;
        ctx.save();
        ctx.setLineDash([8 / zoom, 5 / zoom]);
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2 / zoom;
        ctx.fillStyle = 'rgba(37, 99, 235, 0.1)';
        ctx.fillRect(rectX, rectY, rectW, rectH);
        ctx.strokeRect(rectX, rectY, rectW, rectH);
        ctx.restore();
    }
    
    // Restore context state
    ctx.restore();
    
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    // Log performance stats for debugging
    if (renderTime > 50) {
        console.warn(`Rendering: ${renderTime.toFixed(1)}ms, Tiles drawn: ${tilesDrawn}`);
    }
}

function drawTile(tile, useHighDetail = true, c = ctx, scale = zoom) {
    const x = tile.x * cellSize;
    const y = tile.y * cellSize;

    // Draw tile background
    c.fillStyle = tile.color;
    c.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);

    // Draw border
    c.strokeStyle = '#000000';
    c.lineWidth = 2 / scale; // Adjust line width for zoom
    c.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);

    // Skip detailed rendering in performance mode or when zoomed out
    if (performanceMode || !useHighDetail) {
        // In performance mode, still show concrete indicators
        if (tile.isConcrete && performanceMode) {
            c.fillStyle = 'rgba(0, 0, 0, 0.3)';
            c.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        }
        return;
    }

    // Draw glues if showGlues is enabled
    if (tile.glues && tile.glues.length === 4 && showGlues) {
        c.fillStyle = '#000000';
        c.font = `${10 / scale}px Arial`; // Adjust font size for zoom
        c.textAlign = 'center';
        c.textBaseline = 'middle';

        // North
        if (tile.glues[0] && tile.glues[0] !== ' ') {
            c.fillText(tile.glues[0], x + cellSize / 2, y + 8);
        }
        // East
        if (tile.glues[1] && tile.glues[1] !== ' ') {
            c.fillText(tile.glues[1], x + cellSize - 8, y + cellSize / 2);
        }
        // South
        if (tile.glues[2] && tile.glues[2] !== ' ') {
            c.fillText(tile.glues[2], x + cellSize / 2, y + cellSize - 8);
        }
        // West
        if (tile.glues[3] && tile.glues[3] !== ' ') {
            c.fillText(tile.glues[3], x + 8, y + cellSize / 2);
        }
    }

    // Draw name if exists and labels are enabled
    if (tile.name && showLabels) {
        c.fillStyle = '#000000';
        c.font = `bold ${12 / scale}px Arial`; // Adjust font size for zoom
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(tile.name, x + cellSize / 2, y + cellSize / 2);
    }

    // Draw concrete indicator
    if (tile.isConcrete) {
        c.fillStyle = 'rgba(0, 0, 0, 0.3)';
        c.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        if (showLabels) {
            c.fillStyle = '#ffffff';
            c.font = `bold ${14 / scale}px Arial`; // Adjust font size for zoom
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText('C', x + cellSize / 2, y + cellSize / 2);
        }
    }
}

function updateInfo() {
    let tileCount = 0;
    for (let p of board.Polyominoes) {
        tileCount += p.Tiles.length;
    }
    tileCount += board.ConcreteTiles.length;
    
    document.getElementById('tile-count').textContent = tileCount;
    document.getElementById('poly-count').textContent = board.Polyominoes.length;
}

function updateGlueButtonState() {
    const btn = document.getElementById('activate-glues');
    if (gluesActivated) {
        btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        btn.textContent = 'Glues Active ✓';
    } else {
        btn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        btn.textContent = 'Activate Glues';
    }
}

function loadFileHandler() {
    const fileInput = document.getElementById('file-input');
    const file = fileInput.files[0];
    
    if (!file) {
        return; // No file selected yet
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const xmlText = e.target.result;
        parseXML(xmlText);
    };
    reader.readAsText(file);
}

function normalizeXmlColor(colorValue, fallback = '#3498db') {
    const rawColor = (colorValue ?? '').toString().trim();
    if (!rawColor) return fallback;
    
    const withoutHash = rawColor.startsWith('#') ? rawColor.slice(1) : rawColor;
    const normalized = withoutHash.length === 3
        ? withoutHash.split('').map(c => c + c).join('')
        : withoutHash;
    
    return /^[0-9a-fA-F]{6}$/.test(normalized) ? `#${normalized}` : fallback;
}

function colorToXmlText(colorValue) {
    return normalizeXmlColor(colorValue).slice(1).toUpperCase();
}

function parseGlueValue(glueValue) {
    const value = (glueValue ?? '').toString().trim();
    if (!value || value === 'None' || value === '0') {
        return ' ';
    }
    return value;
}

function escapeXml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function parseXML(xmlText) {
    try {
        // Convert to string if needed
        if (typeof xmlText !== 'string') {
            xmlText = String(xmlText);
        }
        
        // Validate that xmlText is not empty and looks like XML
        if (!xmlText || xmlText.trim().length === 0) {
            alert('Error: The file is empty. Please select a valid XML file.');
            return;
        }
        
        // Remove BOM if present
        if (xmlText.charCodeAt(0) === 0xFEFF) {
            xmlText = xmlText.slice(1);
        }
        
        const trimmedText = xmlText.trim();
        if (!trimmedText.startsWith('<')) {
            // Show first 100 characters to help diagnose the issue
            const preview = trimmedText.substring(0, 100).replace(/\n/g, '\\n');
            alert('Error: The file does not appear to be a valid XML file.\n\n' +
                  'XML files must start with "<".\n\n' +
                  'File starts with: ' + preview);
            console.error('Invalid XML content:', preview);
            return;
        }
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(trimmedText, "text/xml");
        
        // Check for parsing errors
        const parserError = xmlDoc.getElementsByTagName('parsererror');
        if (parserError.length > 0) {
            alert('Error parsing XML file: ' + parserError[0].textContent);
            return;
        }
        
        // Clear current board
        board.clear();
        clearSelection(false);
        
        // Get board size (supports both TileConfiguration and legacy static format)
        const boardSizeElem = xmlDoc.getElementsByTagName('BoardSize')[0];
        const legacyBoardElem = xmlDoc.getElementsByTagName('board')[0];
        if (boardSizeElem || legacyBoardElem) {
            const sourceElem = boardSizeElem || legacyBoardElem;
            const width = parseInt(sourceElem.getAttribute('width'));
            const height = parseInt(sourceElem.getAttribute('height'));
            board.resizeBoard(width, height);
            document.getElementById('board-width').value = width;
            document.getElementById('board-height').value = height;
            resizeCanvas();
        }
        
        // Parse tiles (supports both TileConfiguration and legacy static format)
        const tileData = xmlDoc.getElementsByTagName('TileData')[0];
        const legacyTilesContainer = xmlDoc.getElementsByTagName('tiles')[0];
        const usesTileConfigurationFormat = !!tileData;
        const tileElements = usesTileConfigurationFormat
            ? Array.from(tileData.getElementsByTagName('Tile'))
            : (legacyTilesContainer ? Array.from(legacyTilesContainer.getElementsByTagName('tile')) : []);
        
        for (let tileElem of tileElements) {
            let x;
            let y;
            let color = '#3498db';
            let glues = [' ', ' ', ' ', ' '];
            let isConcrete = false;
            let name = '';
            
            if (usesTileConfigurationFormat) {
                const locationElem = tileElem.getElementsByTagName('Location')[0];
                if (!locationElem) continue;
                
                x = parseInt(locationElem.getAttribute('x'));
                y = parseInt(locationElem.getAttribute('y'));
                
                const colorElem = tileElem.getElementsByTagName('Color')[0];
                color = normalizeXmlColor(colorElem ? colorElem.textContent : '', '#3498db');
                
                glues[0] = parseGlueValue(tileElem.getElementsByTagName('NorthGlue')[0]?.textContent);
                glues[1] = parseGlueValue(tileElem.getElementsByTagName('EastGlue')[0]?.textContent);
                glues[2] = parseGlueValue(tileElem.getElementsByTagName('SouthGlue')[0]?.textContent);
                glues[3] = parseGlueValue(tileElem.getElementsByTagName('WestGlue')[0]?.textContent);
                
                const concreteElem = tileElem.getElementsByTagName('Concrete')[0];
                isConcrete = (concreteElem?.textContent ?? '').trim().toLowerCase() === 'true';
                
                const labelElem = tileElem.getElementsByTagName('Label')[0];
                name = labelElem ? labelElem.textContent : '';
            } else {
                x = parseInt(tileElem.getAttribute('x'));
                y = parseInt(tileElem.getAttribute('y'));
                color = normalizeXmlColor(tileElem.getAttribute('color'), '#3498db');
                isConcrete = (tileElem.getAttribute('concrete') ?? '').trim().toLowerCase() === 'true';
                name = tileElem.getAttribute('name') || '';
                
                const glueElements = tileElem.getElementsByTagName('glue');
                for (let glueElem of glueElements) {
                    const direction = (glueElem.getAttribute('direction') || '').toUpperCase();
                    const label = parseGlueValue(glueElem.getAttribute('label'));
                    if (direction === 'N') glues[0] = label;
                    if (direction === 'E') glues[1] = label;
                    if (direction === 'S') glues[2] = label;
                    if (direction === 'W') glues[3] = label;
                }
            }
            
            if (Number.isNaN(x) || Number.isNaN(y)) {
                continue;
            }
            
            if (isConcrete) {
                const t = new Tile(null, 0, x, y, glues, color, true);
                t.name = name;
                board.AddConc(t);
            } else {
                const p = new Polyomino(board.poly_id_c++, x, y, glues, color);
                p.Tiles[0].name = name;
                board.Add(p);
            }
        }
        
        // Activate glues if checkbox is checked
        if (document.getElementById('activate-on-load').checked) {
            board.ActivateGlues();
            gluesActivated = true;
        } else {
            gluesActivated = false;
        }
        updateGlueButtonState();
        
        const totalTiles = board.Polyominoes.length + board.ConcreteTiles.length;
        
        // Auto-adjust cell size for very large boards
        if (totalTiles > 5000) {
            cellSize = 10; // Very small cells for huge boards
            useColorBatching = true;
        } else if (totalTiles > 2000) {
            cellSize = 15; // Small cells for large boards
            useColorBatching = true;
        } else if (totalTiles > 1000) {
            cellSize = 20; // Medium cells
            useColorBatching = true;
        } else {
            cellSize = baseCellSize; // Default size
            useColorBatching = false;
        }
        
        // Resize canvas with new cell size
        resizeCanvas();

        // Fit and center the loaded board in the viewport (works for any size).
        centerBoardHandler();
        updateInfo();
        
        console.log('XML loaded successfully. Tiles:', totalTiles, 'Cell size:', cellSize, 'Zoom:', zoom.toFixed(2));
        
        // Auto-enable performance mode for large boards
        if (totalTiles > 1000) {
            performanceMode = true;
            document.getElementById('performance-mode').checked = true;
            console.log(`Performance mode auto-enabled (color batching: ${useColorBatching})`);
            console.log('Tip: You can disable Performance Mode to see labels and glues (may be slower)');
            drawBoard();
        }
    } catch (error) {
        console.error('Error loading XML:', error);
        alert('Error loading XML file: ' + error.message);
    }
}

function saveFileHandler() {
    let xmlText = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xmlText += `<TileConfiguration>\n`;
    xmlText += `  <BoardSize height="${board.Rows}" width="${board.Cols}" />\n`;
    xmlText += `  <TileData>\n`;
    
    const appendTileXml = (tile, concreteValue) => {
        const tileName = tile.name || '';
        const glues = (tile.glues && tile.glues.length === 4) ? tile.glues : [' ', ' ', ' ', ' '];
        
        xmlText += `    <Tile>\n`;
        xmlText += `      <Location x="${tile.x}" y="${tile.y}" />\n`;
        xmlText += `      <Color>${colorToXmlText(tile.color)}</Color>\n`;
        xmlText += `      <NorthGlue>${glues[0] && glues[0] !== ' ' ? escapeXml(glues[0]) : 'None'}</NorthGlue>\n`;
        xmlText += `      <SouthGlue>${glues[2] && glues[2] !== ' ' ? escapeXml(glues[2]) : 'None'}</SouthGlue>\n`;
        xmlText += `      <EastGlue>${glues[1] && glues[1] !== ' ' ? escapeXml(glues[1]) : 'None'}</EastGlue>\n`;
        xmlText += `      <WestGlue>${glues[3] && glues[3] !== ' ' ? escapeXml(glues[3]) : 'None'}</WestGlue>\n`;
        xmlText += `      <Concrete>${concreteValue ? 'True' : 'False'}</Concrete>\n`;
        xmlText += `      <Label>${escapeXml(tileName)}</Label>\n`;
        xmlText += `    </Tile>\n`;
    };
    
    for (let p of board.Polyominoes) {
        for (let tile of p.Tiles) {
            appendTileXml(tile, false);
        }
    }
    
    for (let conc of board.ConcreteTiles) {
        appendTileXml(conc, true);
    }
    
    xmlText += `  </TileData>\n`;
    xmlText += `</TileConfiguration>`;
    
    // Download file
    const blob = new Blob([xmlText], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tumbletiles_config.xml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================
// Board Export (PNG / SVG / PDF)
// ============================================

function exportBoardHandler() {
    const format = document.getElementById('export-format').value;
    if (format === 'png') {
        exportPNG();
    } else if (format === 'svg') {
        exportSVG();
    } else if (format === 'pdf') {
        exportPDF();
    }
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Render the whole board to a fresh canvas at 1:1 scale (no zoom/pan/selection),
// reused by both the PNG and PDF exporters.
function createBoardImageCanvas() {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = Math.max(1, board.Cols * cellSize);
    exportCanvas.height = Math.max(1, board.Rows * cellSize);
    const c = exportCanvas.getContext('2d');

    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    if (!performanceMode) {
        c.strokeStyle = '#e0e0e0';
        c.lineWidth = 1;
        c.beginPath();
        for (let i = 0; i <= board.Cols; i++) {
            c.moveTo(i * cellSize, 0);
            c.lineTo(i * cellSize, board.Rows * cellSize);
        }
        for (let j = 0; j <= board.Rows; j++) {
            c.moveTo(0, j * cellSize);
            c.lineTo(board.Cols * cellSize, j * cellSize);
        }
        c.stroke();
    }

    for (let p of board.Polyominoes) {
        for (let tile of p.Tiles) {
            drawTile(tile, true, c, 1);
        }
    }
    for (let conc of board.ConcreteTiles) {
        drawTile(conc, true, c, 1);
    }

    return exportCanvas;
}

function exportPNG() {
    const imageCanvas = createBoardImageCanvas();
    imageCanvas.toBlob((blob) => {
        downloadBlob(blob, 'tumbletiles_board.png');
    }, 'image/png');
}

function exportSVG() {
    const width = board.Cols * cellSize;
    const height = board.Rows * cellSize;
    const parts = [];

    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
    parts.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`);

    if (!performanceMode) {
        let gridPath = '';
        for (let i = 0; i <= board.Cols; i++) {
            gridPath += `M${i * cellSize} 0V${height}`;
        }
        for (let j = 0; j <= board.Rows; j++) {
            gridPath += `M0 ${j * cellSize}H${width}`;
        }
        parts.push(`<path d="${gridPath}" stroke="#e0e0e0" stroke-width="1" fill="none"/>`);
    }

    const tiles = [];
    for (let p of board.Polyominoes) {
        for (let tile of p.Tiles) tiles.push(tile);
    }
    for (let conc of board.ConcreteTiles) tiles.push(conc);

    for (let tile of tiles) {
        parts.push(tileToSvg(tile));
    }

    parts.push('</svg>');

    const blob = new Blob([parts.join('\n')], { type: 'image/svg+xml' });
    downloadBlob(blob, 'tumbletiles_board.svg');
}

function tileToSvg(tile) {
    const x = tile.x * cellSize + 1;
    const y = tile.y * cellSize + 1;
    const size = cellSize - 2;
    const cx = tile.x * cellSize + cellSize / 2;
    const cy = tile.y * cellSize + cellSize / 2;
    let out = `<g>`;
    out += `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${escapeXml(tile.color)}" stroke="#000000" stroke-width="2"/>`;

    const detailed = !performanceMode;

    if (detailed && tile.glues && tile.glues.length === 4 && showGlues) {
        const glueStyle = `font-family="Arial" font-size="10" text-anchor="middle" fill="#000000"`;
        if (tile.glues[0] && tile.glues[0] !== ' ') {
            out += `<text x="${cx}" y="${tile.y * cellSize + 11}" ${glueStyle}>${escapeXml(tile.glues[0])}</text>`;
        }
        if (tile.glues[1] && tile.glues[1] !== ' ') {
            out += `<text x="${tile.x * cellSize + cellSize - 8}" y="${cy + 3}" ${glueStyle}>${escapeXml(tile.glues[1])}</text>`;
        }
        if (tile.glues[2] && tile.glues[2] !== ' ') {
            out += `<text x="${cx}" y="${tile.y * cellSize + cellSize - 5}" ${glueStyle}>${escapeXml(tile.glues[2])}</text>`;
        }
        if (tile.glues[3] && tile.glues[3] !== ' ') {
            out += `<text x="${tile.x * cellSize + 8}" y="${cy + 3}" ${glueStyle}>${escapeXml(tile.glues[3])}</text>`;
        }
    }

    if (detailed && tile.name && showLabels) {
        out += `<text x="${cx}" y="${cy + 4}" font-family="Arial" font-size="12" font-weight="bold" text-anchor="middle" fill="#000000">${escapeXml(tile.name)}</text>`;
    }

    if (tile.isConcrete) {
        out += `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#000000" fill-opacity="0.3"/>`;
        if (detailed && showLabels) {
            out += `<text x="${cx}" y="${cy + 5}" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle" fill="#ffffff">C</text>`;
        }
    }

    out += `</g>`;
    return out;
}

// Builds a minimal single-page PDF that embeds a JPEG snapshot of the board.
// JPEG + DCTDecode keeps it dependency-free (no external PDF library required).
function exportPDF() {
    const imageCanvas = createBoardImageCanvas();
    const jpegDataUrl = imageCanvas.toDataURL('image/jpeg', 0.95);
    const base64 = jpegDataUrl.split(',')[1];
    const binary = atob(base64);
    const imgBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        imgBytes[i] = binary.charCodeAt(i);
    }

    const imgW = imageCanvas.width;
    const imgH = imageCanvas.height;

    const encode = (str) => {
        const arr = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) {
            arr[i] = str.charCodeAt(i) & 0xff;
        }
        return arr;
    };

    const chunks = [];
    let offset = 0;
    const offsets = [];
    const pushBytes = (bytes) => {
        chunks.push(bytes);
        offset += bytes.length;
    };
    const pushStr = (str) => pushBytes(encode(str));

    pushStr('%PDF-1.3\n');

    offsets[1] = offset;
    pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    offsets[2] = offset;
    pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

    offsets[3] = offset;
    pushStr(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${imgW} ${imgH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);

    offsets[4] = offset;
    pushStr(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`);
    pushBytes(imgBytes);
    pushStr('\nendstream\nendobj\n');

    const content = `q\n${imgW} 0 0 ${imgH} 0 0 cm\n/Im0 Do\nQ\n`;
    offsets[5] = offset;
    pushStr(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

    const xrefOffset = offset;
    let xref = 'xref\n0 6\n0000000000 65535 f \n';
    for (let i = 1; i <= 5; i++) {
        xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    }
    pushStr(xref);
    pushStr(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const pdfBytes = new Uint8Array(total);
    let pos = 0;
    for (const c of chunks) {
        pdfBytes.set(c, pos);
        pos += c.length;
    }

    downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), 'tumbletiles_board.pdf');
}

async function loadExampleHandler() {
    const exampleSelect = document.getElementById('example-select');
    const filename = exampleSelect.value;
    
    if (!filename) {
        alert('Please select an example from the dropdown');
        return;
    }
    
    try {
        // Fetch the example file from the Verification folder
        // Encode the filename to handle spaces and special characters
        const encodedFilename = encodeURIComponent(filename);
        const response = await fetch(`../Verification/${encodedFilename}`);
        
        if (!response.ok) {
            throw new Error(`Failed to load example: ${response.statusText}`);
        }
        
        const xmlText = await response.text();
        
        // Parse and load the XML directly with parseXML
        parseXML(xmlText);
        
        console.log(`Loaded example: ${filename}`);
    } catch (error) {
        console.error('Error loading example:', error);
        alert(`Failed to load example: ${error.message}`);
    }
}

// ============================================
// Tile Palette System
// ============================================

function saveTileType() {
    const name = document.getElementById('tile-name').value || 'Tile ' + (tilePalette.length + 1);
    const color = document.getElementById('tile-color').value;
    const isConcrete = document.getElementById('tile-concrete').checked;
    const glues = [
        document.getElementById('glue-n').value || ' ',
        document.getElementById('glue-e').value || ' ',
        document.getElementById('glue-s').value || ' ',
        document.getElementById('glue-w').value || ' '
    ];
    
    const tileType = {
        name: name,
        color: color,
        isConcrete: isConcrete,
        glues: glues
    };
    
    tilePalette.push(tileType);
    renderTilePalette();
    
    console.log('Saved tile type to palette:', tileType);
}

function renderTilePalette() {
    const paletteContainer = document.getElementById('tile-palette');
    paletteContainer.innerHTML = '';
    
    if (tilePalette.length === 0) {
        paletteContainer.innerHTML = '<p style="font-size: 12px; color: #666; padding: 10px;">No tile types saved. Configure a tile and click "Save Current as Tile Type".</p>';
        document.getElementById('palette-actions').style.display = 'none';
        selectedPaletteIndex = -1;
        return;
    }
    
    // Create grid container
    const grid = document.createElement('div');
    grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(65px, 1fr));
        gap: 20px 8px;
        padding: 5px;
    `;
    
    tilePalette.forEach((tileType, index) => {
        // Create wrapper for tile + label
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position: relative;';
        
        const tileButton = document.createElement('div');
        tileButton.className = 'palette-tile';
        tileButton.dataset.index = index;
        
        const isSelected = index === selectedPaletteIndex;
        
        tileButton.style.cssText = `
            background-color: ${tileType.color};
            border: ${isSelected ? '3px' : '2px'} solid ${isSelected ? '#667eea' : '#333'};
            border-radius: 6px;
            width: 60px;
            height: 60px;
            cursor: pointer;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: ${isSelected ? '0 0 10px rgba(102, 126, 234, 0.5)' : 'none'};
            transition: all 0.2s;
        `;
        
        // Add glue indicators
        const glueOverlay = document.createElement('div');
        glueOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            pointer-events: none;
            font-size: 8px;
            color: #000;
            font-weight: bold;
            text-shadow: 0 0 2px #fff;
            padding: 2px;
        `;
        
        if (tileType.glues[0] && tileType.glues[0] !== ' ') {
            const n = document.createElement('div');
            n.textContent = tileType.glues[0];
            n.style.cssText = 'max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
            glueOverlay.appendChild(n);
        } else {
            glueOverlay.appendChild(document.createElement('div'));
        }
        
        const middle = document.createElement('div');
        middle.style.cssText = 'display: flex; justify-content: space-between; width: 100%; padding: 0 2px;';
        
        if (tileType.glues[3] && tileType.glues[3] !== ' ') {
            const w = document.createElement('div');
            w.textContent = tileType.glues[3];
            w.style.cssText = 'max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
            middle.appendChild(w);
        } else {
            middle.appendChild(document.createElement('div'));
        }
        
        if (tileType.glues[1] && tileType.glues[1] !== ' ') {
            const e = document.createElement('div');
            e.textContent = tileType.glues[1];
            e.style.cssText = 'max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
            middle.appendChild(e);
        } else {
            middle.appendChild(document.createElement('div'));
        }
        
        glueOverlay.appendChild(middle);
        
        if (tileType.glues[2] && tileType.glues[2] !== ' ') {
            const s = document.createElement('div');
            s.textContent = tileType.glues[2];
            s.style.cssText = 'max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
            glueOverlay.appendChild(s);
        } else {
            glueOverlay.appendChild(document.createElement('div'));
        }
        
        tileButton.appendChild(glueOverlay);
        
        // Add name label
        const nameLabel = document.createElement('div');
        nameLabel.style.cssText = `
            position: absolute;
            bottom: -18px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 10px;
            color: #333;
            white-space: nowrap;
            max-width: 80px;
            overflow: hidden;
            text-overflow: ellipsis;
        `;
        nameLabel.textContent = tileType.name;
        nameLabel.title = tileType.name;
        tileButton.appendChild(nameLabel);
        
        // Add concrete indicator
        if (tileType.isConcrete) {
            const concreteIndicator = document.createElement('div');
            concreteIndicator.style.cssText = `
                position: absolute;
                top: 2px;
                right: 2px;
                background: rgba(0, 0, 0, 0.6);
                color: white;
                border-radius: 3px;
                padding: 1px 3px;
                font-size: 8px;
                font-weight: bold;
            `;
            concreteIndicator.textContent = 'C';
            tileButton.appendChild(concreteIndicator);
        }
        
        tileButton.onclick = () => {
            selectPaletteTile(index);
        };
        
        wrapper.appendChild(tileButton);
        grid.appendChild(wrapper);
    });
    
    paletteContainer.appendChild(grid);
}

function selectPaletteTile(index) {
    if (selectedPaletteIndex === index) {
        // Deselect if clicking the same tile
        selectedPaletteIndex = -1;
        document.getElementById('palette-actions').style.display = 'none';
    } else {
        selectedPaletteIndex = index;
        const tileType = tilePalette[index];
        loadTileTypeToInputs(tileType);
        document.getElementById('palette-actions').style.display = 'block';
    }
    renderTilePalette();
}

function loadTileTypeToInputs(tileType) {
    document.getElementById('tile-color').value = tileType.color;
    document.getElementById('tile-name').value = tileType.name;
    document.getElementById('tile-concrete').checked = tileType.isConcrete;
    document.getElementById('glue-n').value = tileType.glues[0] === ' ' ? '' : tileType.glues[0];
    document.getElementById('glue-e').value = tileType.glues[1] === ' ' ? '' : tileType.glues[1];
    document.getElementById('glue-s').value = tileType.glues[2] === ' ' ? '' : tileType.glues[2];
    document.getElementById('glue-w').value = tileType.glues[3] === ' ' ? '' : tileType.glues[3];
    
    console.log('Loaded tile type from palette:', tileType);
}

function modifyTileType() {
    if (selectedPaletteIndex < 0) {
        alert('No tile selected. Please select a tile from the palette first.');
        return;
    }
    
    const oldTileType = tilePalette[selectedPaletteIndex];
    const oldName = oldTileType.name;
    
    // Get current values from inputs
    const newTileType = {
        name: document.getElementById('tile-name').value || 'Tile ' + (selectedPaletteIndex + 1),
        color: document.getElementById('tile-color').value,
        isConcrete: document.getElementById('tile-concrete').checked,
        glues: [
            document.getElementById('glue-n').value || ' ',
            document.getElementById('glue-e').value || ' ',
            document.getElementById('glue-s').value || ' ',
            document.getElementById('glue-w').value || ' '
        ]
    };
    
    // Update the palette
    tilePalette[selectedPaletteIndex] = newTileType;
    
    // Check if we should update board tiles
    const updateBoard = document.getElementById('update-board-tiles').checked;
    if (updateBoard && oldName) {
        let updatedCount = 0;
        
        // Update polyominoes
        for (let p of board.Polyominoes) {
            for (let tile of p.Tiles) {
                if (tile.name === oldName) {
                    tile.color = newTileType.color;
                    tile.name = newTileType.name;
                    tile.glues = [...newTileType.glues];
                    updatedCount++;
                }
            }
        }
        
        // Update concrete tiles
        for (let conc of board.ConcreteTiles) {
            if (conc.name === oldName) {
                conc.color = newTileType.color;
                conc.name = newTileType.name;
                conc.glues = [...newTileType.glues];
                updatedCount++;
            }
        }
        
        if (updatedCount > 0) {
            drawBoard();
            console.log(`Updated ${updatedCount} tiles on the board`);
            alert(`Modified tile type and updated ${updatedCount} tile(s) on the board.`);
        } else {
            alert('Modified tile type. No matching tiles found on the board.');
        }
    } else {
        alert('Modified tile type in palette.');
    }
    
    renderTilePalette();
    console.log('Modified tile type:', newTileType);
}

function deleteTileType() {
    if (selectedPaletteIndex < 0) {
        alert('No tile selected. Please select a tile from the palette first.');
        return;
    }
    
    const tileType = tilePalette[selectedPaletteIndex];
    if (confirm(`Delete tile type "${tileType.name}"?`)) {
        tilePalette.splice(selectedPaletteIndex, 1);
        selectedPaletteIndex = -1;
        document.getElementById('palette-actions').style.display = 'none';
        renderTilePalette();
        console.log('Deleted tile type');
    }
}

function savePalette() {
    if (tilePalette.length === 0) {
        alert('No tile types in palette to save.');
        return;
    }
    
    const paletteData = JSON.stringify(tilePalette, null, 2);
    const blob = new Blob([paletteData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tile-palette.json';
    a.click();
    
    URL.revokeObjectURL(url);
    console.log('Palette exported');
}

function loadPalette(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const loadedPalette = JSON.parse(event.target.result);
            
            if (!Array.isArray(loadedPalette)) {
                alert('Invalid palette file format.');
                return;
            }
            
            tilePalette = loadedPalette;
            renderTilePalette();
            console.log('Palette imported:', tilePalette);
            alert(`Successfully loaded ${tilePalette.length} tile type(s).`);
        } catch (error) {
            console.error('Error loading palette:', error);
            alert('Error loading palette file: ' + error.message);
        }
    };
    reader.readAsText(file);
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', init);
