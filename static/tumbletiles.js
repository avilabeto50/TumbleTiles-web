// TumbleTiles JavaScript Implementation
// Converted from Python version

// Global settings
const TEMP = 1;
const GLUEFUNC = {'N':1, 'E':1, 'S':1, 'W':1, 'A':1, 'B':1, 'C':1, 'D':1, 'X':1, 'Y':1, 'Z':1};
const DEBUGGING = false;
let FACTORYMODE = true;

let TILE_UID_COUNTER = 0;

function getNextUID() {
    return ++TILE_UID_COUNTER;
}

// Tile class
class Tile {
    constructor(parent, id, x, y, glues, color, isConcrete) {
        this.parent = parent;
        this.id = id;
        this.symbol = id;
        this.color = color;
        this.x = parseInt(x);
        this.y = parseInt(y);
        this.uid = getNextUID();
        this.name = "";
        
        if (isConcrete === true || isConcrete === "True") {
            this.isConcrete = true;
            this.glues = glues || [];
        } else {
            this.isConcrete = false;
            this.glues = glues || [];
        }
    }
}

// Polyomino class
class Polyomino {
    constructor(pId, x, y, glues, color) {
        this.id = pId;
        if (x !== undefined && y !== undefined) {
            const newTile = new Tile(this, pId, x, y, glues, color, false);
            this.Tiles = [newTile];
            this.NumTiles = 1;
        } else {
            this.Tiles = [];
            this.NumTiles = 0;
        }
        this.HasMoved = false;
    }
    
    Join(poly) {
        const sym = this.id;
        const parent = this;
        this.Tiles = this.Tiles.concat(poly.Tiles);
        this.NumTiles = this.Tiles.length;
        
        for (let t of this.Tiles) {
            t.symbol = sym;
            t.parent = parent;
        }
    }
    
    CanJoin(poly) {
        if (!poly) return false;
        
        let gluestrength = 0;
        const [N, E, S, W] = [0, 1, 2, 3];
        
        try {
            for (let t of this.Tiles) {
                for (let pt of poly.Tiles) {
                    // pt on left, t on right
                    if (pt.glues[E] && t.x - pt.x === 1 && pt.glues[E] !== " " && 
                        pt.glues[E].length > 0 && t.y === pt.y) {
                        if (t.glues[W] && t.glues[W] !== " " && t.glues[W] === pt.glues[E]) {
                            gluestrength += parseInt(GLUEFUNC[pt.glues[E]] || 0);
                        }
                    }
                    // t on left, pt on right
                    if (pt.glues[W] && pt.x - t.x === 1 && pt.glues[W] !== " " && 
                        pt.glues[W].length > 0 && t.y === pt.y) {
                        if (t.glues[E] && t.glues[E] !== " " && t.glues[E] === pt.glues[W]) {
                            gluestrength += parseInt(GLUEFUNC[pt.glues[W]] || 0);
                        }
                    }
                    // t on top, pt on bottom
                    if (pt.glues[N] && t.x === pt.x && pt.glues[N] !== " " && 
                        pt.glues[N].length > 0 && t.y - pt.y === -1) {
                        if (t.glues[S] && t.glues[S] !== " " && t.glues[S] === pt.glues[N]) {
                            gluestrength += parseInt(GLUEFUNC[pt.glues[N]] || 0);
                        }
                    }
                    // pt on top, t on bottom
                    if (pt.glues[S] && t.x === pt.x && pt.glues[S] !== " " && 
                        pt.glues[S].length > 0 && pt.y - t.y === -1) {
                        if (t.glues[N] && t.glues[N] !== " " && t.glues[N] === pt.glues[S]) {
                            gluestrength += parseInt(GLUEFUNC[pt.glues[S]] || 0);
                        }
                    }
                }
            }
            return gluestrength >= TEMP;
        } catch (e) {
            if (DEBUGGING) console.error("Glue Error:", e);
            return false;
        }
    }
    
    Move(direction) {
        let dx = 0, dy = 0;
        
        if (direction === "N") dy = -1;
        else if (direction === "E") dx = 1;
        else if (direction === "S") dy = 1;
        else if (direction === "W") dx = -1;
        
        for (let tile of this.Tiles) {
            tile.x += dx;
            tile.y += dy;
        }
        
        this.HasMoved = true;
    }
}

// Board class
class Board {
    constructor(rows, cols) {
        this.Rows = rows;
        this.Cols = cols;
        this.Board = Array(rows).fill().map(() => Array(cols).fill(' '));
        this.Polyominoes = [];
        this.ConcreteTiles = [];
        this.ConcreteColor = "#686868";
        this.LookUp = {};
        this.coordToTile = Array(cols).fill().map(() => Array(rows).fill(null));
        this.poly_id_c = 0;
    }
    
    Add(p) {
        const tile = p.Tiles[0];
        
        if (tile.x < 0 || tile.x >= this.Cols || tile.y < 0 || tile.y >= this.Rows) {
            if (DEBUGGING) console.log("Can't add tile outside board boundaries");
            return;
        }
        
        if (this.coordToTile[tile.x][tile.y] === null) {
            this.coordToTile[tile.x][tile.y] = tile;
            this.Polyominoes.push(p);
        } else if (DEBUGGING) {
            console.log("Can not add tile. A tile already exists at this location");
        }
    }
    
    AddConc(t) {
        try {
            if (this.coordToTile[t.x][t.y] === null) {
                this.coordToTile[t.x][t.y] = t;
                this.ConcreteTiles.push(t);
            } else if (DEBUGGING) {
                console.log("Can not add concrete tile. A tile already exists at this location");
            }
        } catch (e) {
            console.log("Can't add concrete there");
        }
    }
    
    CombinePolys(p1, p2) {
        if (p1 === p2) return;
        
        p1.Join(p2);
        
        const index = this.Polyominoes.indexOf(p2);
        if (index > -1) {
            this.Polyominoes.splice(index, 1);
        }
    }
    
    resizeBoard(w, h) {
        this.Rows = h;
        this.Cols = w;
        this.remapArray();
    }
    
    ActivateGlues() {
        let changed = true;
        
        while (changed) {
            changed = false;
            
            for (let p of this.Polyominoes) {
                for (let tile of p.Tiles) {
                    const neighbors = [];
                    
                    // Check all four directions
                    if (tile.x + 1 < this.Cols) {
                        const neighbor = this.coordToTile[tile.x + 1][tile.y];
                        if (neighbor && neighbor.parent !== tile.parent) {
                            neighbors.push(neighbor);
                        }
                    }
                    
                    if (tile.x - 1 >= 0) {
                        const neighbor = this.coordToTile[tile.x - 1][tile.y];
                        if (neighbor && neighbor.parent !== tile.parent) {
                            neighbors.push(neighbor);
                        }
                    }
                    
                    if (tile.y + 1 < this.Rows) {
                        const neighbor = this.coordToTile[tile.x][tile.y + 1];
                        if (neighbor && neighbor.parent !== tile.parent) {
                            neighbors.push(neighbor);
                        }
                    }
                    
                    if (tile.y - 1 >= 0) {
                        const neighbor = this.coordToTile[tile.x][tile.y - 1];
                        if (neighbor && neighbor.parent !== tile.parent) {
                            neighbors.push(neighbor);
                        }
                    }
                    
                    for (let nei of neighbors) {
                        if (nei && nei.parent !== tile.parent && p.CanJoin(nei.parent)) {
                            this.CombinePolys(p, nei.parent);
                            this.remapArray();
                            changed = true;
                            break;
                        }
                    }
                    
                    if (changed) break;
                }
                if (changed) break;
            }
        }
    }
    
    Tumble(direction, gluesDuringMotion = false) {
        if (!["N", "S", "E", "W"].includes(direction)) {
            console.log("Invalid direction. Use N, E, S, or W");
            return;
        }

        if (gluesDuringMotion) {
            // TumbleGlue mode: activate glues after every individual step so that
            // tiles can bond with each other as they "fly past" (matching glues on
            // adjacent faces fire the moment the tiles become neighbours, even if
            // they would continue moving past each other in a plain Tumble).
            let stepTaken = this.Step(direction);
            this.ActivateGlues();
            while (stepTaken) {
                stepTaken = this.Step(direction);
                this.ActivateGlues();
            }
        } else {
            let stepTaken = this.Step(direction);
            while (stepTaken) {
                stepTaken = this.Step(direction);
            }
        }
        
        // Factory mode: remove tiles that hit borders
        if (FACTORYMODE) {
            const tilesToRemove = [];
            
            for (let p of this.Polyominoes) {
                for (let tile of p.Tiles) {
                    // Check if tile is at or beyond border
                    if (tile.x <= 0 || tile.x >= this.Cols - 1 || 
                        tile.y <= 0 || tile.y >= this.Rows - 1) {
                        tilesToRemove.push({poly: p, tile: tile});
                    }
                }
            }
            
            // Remove tiles from polyominoes
            for (let item of tilesToRemove) {
                const tileIndex = item.poly.Tiles.indexOf(item.tile);
                if (tileIndex > -1) {
                    item.poly.Tiles.splice(tileIndex, 1);
                    // Remove from coordToTile
                    this.coordToTile[item.tile.x][item.tile.y] = null;
                }
            }
            
            // Remove empty polyominoes
            this.Polyominoes = this.Polyominoes.filter(p => p.Tiles.length > 0);
        }

        // Final glue activation (no-op in gluesDuringMotion mode since we already
        // did it after the last step, but harmless and keeps the two paths consistent).
        this.ActivateGlues();
    }
    
    Step(direction) {
        // Reset HasMoved for all polyominoes
        for (let p of this.Polyominoes) {
            p.HasMoved = false;
        }
        
        let stepTaken = false;
        let dx = 0, dy = 0;
        let wallindex = 0;
        
        if (direction === "N") {
            wallindex = -1;
            dy = -1;
        } else if (direction === "S") {
            wallindex = this.Rows;
            dy = 1;
        } else if (direction === "W") {
            wallindex = -1;
            dx = -1;
        } else if (direction === "E") {
            wallindex = this.Cols;
            dx = 1;
        }
        
        // Mark polyominoes that are blocked
        let anyMarked = true;
        while (anyMarked) {
            anyMarked = false;
            
            for (let p of this.Polyominoes) {
                if (p.HasMoved) continue;
                
                for (let tile of p.Tiles) {
                    // Check wall collision
                    if ((direction === "N" || direction === "S") && tile.y + dy === wallindex) {
                        anyMarked = true;
                        p.HasMoved = true;
                    }
                    
                    if ((direction === "W" || direction === "E") && tile.x + dx === wallindex) {
                        anyMarked = true;
                        p.HasMoved = true;
                    }
                    
                    // Check collision with other tiles
                    try {
                        const neighbor = this.coordToTile[tile.x + dx][tile.y + dy];
                        if (neighbor) {
                            if (neighbor.isConcrete || neighbor.parent.HasMoved) {
                                anyMarked = true;
                                p.HasMoved = true;
                            }
                        }
                    } catch (e) {
                        if (DEBUGGING) console.log("Index error in Step");
                    }
                }
            }
        }
        
        // Move unmarked polyominoes
        for (let p of this.Polyominoes) {
            if (!p.HasMoved) {
                p.HasMoved = true;
                stepTaken = true;
                
                // Clear old positions
                for (let tile of p.Tiles) {
                    try {
                        this.coordToTile[tile.x][tile.y] = null;
                    } catch (e) {
                        if (DEBUGGING) console.log("Index error clearing tile");
                    }
                }
                
                // Update positions
                for (let tile of p.Tiles) {
                    tile.x += dx;
                    tile.y += dy;
                    this.coordToTile[tile.x][tile.y] = tile;
                }
            }
        }
        
        // Remap all tiles
        for (let p of this.Polyominoes) {
            for (let tile of p.Tiles) {
                this.coordToTile[tile.x][tile.y] = tile;
            }
        }
        
        return stepTaken;
    }
    
    relistPolyominoes() {
        const tileList = [];
        
        for (let p of this.Polyominoes) {
            for (let tile of p.Tiles) {
                tileList.push(tile);
            }
            p.Tiles = [];
        }
        
        this.Polyominoes = [];
        
        for (let tile of tileList) {
            const color = tile.color;
            const poly = new Polyomino(0, tile.x, tile.y, tile.glues, color);
            poly.Tiles[0].name = tile.name;
            this.Polyominoes.push(poly);
        }
        
        this.remapArray();
        this.ActivateGlues();
    }
    
    remapArray() {
        this.coordToTile = Array(this.Cols).fill().map(() => Array(this.Rows).fill(null));
        
        for (let p of this.Polyominoes) {
            for (let tile of p.Tiles) {
                this.coordToTile[tile.x][tile.y] = tile;
            }
        }
        
        for (let conc of this.ConcreteTiles) {
            this.coordToTile[conc.x][conc.y] = conc;
        }
    }
    
    clear() {
        this.Polyominoes = [];
        this.ConcreteTiles = [];
        this.coordToTile = Array(this.Cols).fill().map(() => Array(this.Rows).fill(null));
        this.Board = Array(this.Rows).fill().map(() => Array(this.Cols).fill(' '));
    }
}
