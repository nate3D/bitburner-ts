import { NS } from "@ns";

/**
 * This updated script introduces enhanced endgame detection and a new "aggro" strategy.
 * It ensures that the script can intelligently decide when to pass, avoiding over-extension.
 */

/** @param {NS} ns */
export async function main(ns: NS) {
    const faction = "The Black Hand";
    const size = 9; // Adjust as needed

    // Strategy mode argument
    const strategyMode = (ns.args[0] && typeof ns.args[0] === 'string') ? ns.args[0].toLowerCase() : "aggro";

    if (!ns.go) {
        ns.tprint("Error: ns.go API not available.");
        return;
    }

    // Kill other instances of this script
    const scriptName = ns.getScriptName();
    const allRunningScripts = ns.ps(ns.getHostname());
    for (const script of allRunningScripts) {
        if (script.filename === scriptName && script.pid !== ns.pid) {
            ns.kill(script.pid);
        }
    }

    ns.tprint(`Starting continuous IPvGO games against ${faction} with strategy "${strategyMode}".`);

    while (true) {
        ns.go.resetBoardState(faction, size);
        ns.print(`Started a new IPvGO game against ${faction}.`);

        let result;
        let opponentPassed = false;
        let consecutivePasses = 0; // Track consecutive passes

        do {
            const board = ns.go.getBoardState();
            const validMoves = ns.go.analysis.getValidMoves();
            let move: { x: number; y: number } | null = null;

            // Check for endgame condition
            if (shouldPass(ns, board, validMoves, strategyMode, size)) {
                ns.print("Endgame detected or no beneficial moves available. Passing turn.");
                move = null; // Indicates a pass
            } else if (opponentPassed) {
                // Opponent passed last turn; attempt to find a beneficial move
                move = getBestMove(ns, board, validMoves, strategyMode);

                if (move) {
                    ns.print("Opponent passed, but found a beneficial move. Continuing play.");
                    opponentPassed = false;
                    consecutivePasses = 0;
                } else {
                    ns.print("Opponent passed last turn and no beneficial moves found, passing as well.");
                    consecutivePasses++;
                }
            } else {
                // Normal move selection
                move = getBestMove(ns, board, validMoves, strategyMode);
            }

            if (move) {
                result = await ns.go.makeMove(move.x, move.y);
                ns.print(`Placed router at (${move.x}, ${move.y}).`);
                consecutivePasses = 0; // Reset on successful move
            } else {
                result = await ns.go.passTurn();
                ns.print("Passed the turn.");
                consecutivePasses++;
            }

            // Update opponentPassed based on the result
            // Assuming result.type reflects the opponent's action after our move or pass
            opponentPassed = (result?.type === "pass");

            // If both players pass consecutively, end the game
            if (consecutivePasses >= 2) {
                ns.print("Both players passed consecutively. Ending game.");
                result = { type: "gameOver" };
            }

            await ns.go.opponentNextTurn();
            await ns.sleep(200);
            ns.tprint(`Game state: ${result?.type}`);
        } while (result?.type !== "gameOver");

        ns.print("Game over.");

        const gameResult = ns.go.getGameState();
        if (gameResult.blackScore > gameResult.whiteScore) {
            ns.print("You won!");
        } else {
            ns.print("You lost.");
        }

        await ns.sleep(1000);
    }
}

function getBestMove(ns: NS, board: string[], validMoves: boolean[][], strategyMode: string): { x: number; y: number } | null {
    // Collect candidate moves from each category
    const candidates: { x: number; y: number; type: string }[] = [];

    // Define strategy orders for each mode
    const strategyOrders: Record<string, Array<{ fn: (ns: NS, b: string[], v: boolean[][]) => { x: number; y: number } | null, type: string }>> = {
        "attack": [
            { fn: findCaptureMove, type: "capture" },
            { fn: findAttackMove, type: "attack" },
            { fn: findExpansionMove, type: "expansion" },
            { fn: findDefendMove, type: "defend" },
            { fn: getCenterFocusedMove, type: "center" }
        ],
        "defense": [
            { fn: findCaptureMove, type: "capture" },
            { fn: findDefendMove, type: "defend" },
            { fn: findExpansionMove, type: "expansion" },
            { fn: findAttackMove, type: "attack" },
            { fn: getCenterFocusedMove, type: "center" }
        ],
        "expansion": [
            { fn: findCaptureMove, type: "capture" },
            { fn: findExpansionMove, type: "expansion" },
            { fn: findAttackMove, type: "attack" },
            { fn: findDefendMove, type: "defend" },
            { fn: getCenterFocusedMove, type: "center" }
        ],
        "prioritized": [
            { fn: findCaptureMove, type: "capture" },
            { fn: getCenterFocusedMove, type: "center" },
            { fn: findAttackMove, type: "attack" },
            { fn: findDefendMove, type: "defend" },
            { fn: findExpansionMove, type: "expansion" }
        ],
        "balanced": [
            { fn: findCaptureMove, type: "capture" },
            { fn: findAttackMove, type: "attack" },
            { fn: findDefendMove, type: "defend" },
            { fn: findExpansionMove, type: "expansion" },
            { fn: getCenterFocusedMove, type: "center" }
        ],
        "aggro": [ // New Aggro Strategy
            { fn: findCaptureMove, type: "capture" },
            { fn: findAttackMove, type: "attack" },
            { fn: findDefendMove, type: "defend" },
            { fn: findExpansionMove, type: "expansion" },
            { fn: getCenterFocusedMove, type: "center" }
        ]
    };

    const order = strategyOrders[strategyMode] || strategyOrders["balanced"];

    // Gather all potential moves based on strategy priority
    for (const { fn, type } of order) {
        const move = fn(ns, board, validMoves);
        if (move) {
            candidates.push({ x: move.x, y: move.y, type });
            // Continue gathering to evaluate all possible candidates
        }
    }

    if (candidates.length === 0) return null;

    // Evaluate all candidate moves with a look-ahead heuristic
    let bestScore = -Infinity;
    let bestMove: { x: number; y: number } | null = null;

    for (const c of candidates) {
        const score = scoreMove(ns, board, c.x, c.y);
        if (score > bestScore) {
            bestScore = score;
            bestMove = { x: c.x, y: c.y };
        }
    }

    if (bestMove) {
        ns.print(`Chosen move at (${bestMove.x}, ${bestMove.y}) with score ${bestScore}.`);
    }

    return bestMove;
}

function scoreMove(ns: NS, board: string[], x: number, y: number): number {
    // Simulate placing 'X' (our router) at (x,y) and then evaluate the board.
    const newBoard = simulateBoardAfterMove(board, x, y, 'X');

    // Evaluate the board using a heuristic
    const { xCount, oCount, xLib, oLib } = countRoutersAndLiberties(newBoard);

    // Heuristic Formula:
    // (Our Routers - Opponent's Routers) + (Our Liberties - Opponent's Liberties) * 0.5
    const score = (xCount - oCount) + (xLib - oLib) * 0.5;
    return score;
}

function simulateBoardAfterMove(board: string[], x: number, y: number, router: 'X' | 'O'): string[] {
    const newBoard = board.map(row => row.split(''));
    newBoard[x][y] = router;
    return newBoard.map(rowArr => rowArr.join(''));
}

function countRoutersAndLiberties(board: string[]): { xCount: number; oCount: number; xLib: number; oLib: number } {
    const size = board.length;
    let xCount = 0, oCount = 0, xLib = 0, oLib = 0;
    const directions = [
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
    ];

    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const cell = board[i][j];
            if (cell === 'X') {
                xCount++;
                for (const dir of directions) {
                    const nx = i + dir.dx, ny = j + dir.dy;
                    if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
                    if (board[nx][ny] === '.') {
                        xLib++;
                    }
                }
            } else if (cell === 'O') {
                oCount++;
                for (const dir of directions) {
                    const nx = i + dir.dx, ny = j + dir.dy;
                    if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
                    if (board[nx][ny] === '.') {
                        oLib++;
                    }
                }
            }
        }
    }
    return { xCount, oCount, xLib, oLib };
}

function findCaptureMove(ns: NS, board: string[], validMoves: boolean[][]): { x: number; y: number } | null {
    const size = board.length;
    const liberties = ns.go.analysis.getLiberties();
    const directions = [
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
    ];

    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            if (!validMoves[x][y]) continue;
            for (const dir of directions) {
                const nx = x + dir.dx, ny = y + dir.dy;
                if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
                if (board[nx][ny] === 'O' && liberties[nx][ny] === 1) {
                    return { x, y };
                }
            }
        }
    }

    return null;
}

function findAttackMove(ns: NS, board: string[], validMoves: boolean[][]): { x: number; y: number } | null {
    const size = board.length;
    const liberties = ns.go.analysis.getLiberties();
    const directions = [
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
    ];

    // Prioritize attacking moves that reduce opponent's liberties significantly
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            if (!validMoves[x][y]) continue;
            let reducedLibs = 0;
            for (const dir of directions) {
                const nx = x + dir.dx, ny = y + dir.dy;
                if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
                if (board[nx][ny] === 'O' && liberties[nx][ny] > 1) {
                    reducedLibs += liberties[nx][ny] - 1; // Potential reduction
                }
            }
            if (reducedLibs > 0) {
                return { x, y };
            }
        }
    }

    return null;
}

function findDefendMove(ns: NS, board: string[], validMoves: boolean[][]): { x: number; y: number } | null {
    const size = board.length;
    const liberties = ns.go.analysis.getLiberties();
    const directions = [
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
    ];

    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            if (!validMoves[x][y]) continue;
            for (const dir of directions) {
                const nx = x + dir.dx, ny = y + dir.dy;
                if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
                if (board[nx][ny] !== 'X') continue;
                const lib = liberties[nx][ny];
                if (lib === 1) {
                    const adjacentEmptyCount = countAdjacentEmpty(board, x, y);
                    if (adjacentEmptyCount >= 2 || isAdjacentToFriendlyStrongNetwork(ns, board, liberties, x, y)) {
                        return { x, y };
                    }
                }
            }
        }
    }

    return null;
}

function findExpansionMove(ns: NS, board: string[], validMoves: boolean[][]): { x: number; y: number } | null {
    // Reserved space logic: Avoid placing on nodes where both x and y are even
    const size = board.length;
    const directions = [
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
    ];

    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            if (!validMoves[x][y]) continue;

            // Check reserved space logic
            if (x % 2 === 0 && y % 2 === 0) continue;

            for (const dir of directions) {
                const nx = x + dir.dx, ny = y + dir.dy;
                if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
                if (board[nx][ny] === 'X') {
                    return { x, y };
                }
            }
        }
    }

    return null;
}

function getCenterFocusedMove(ns: NS, board: string[], validMoves: boolean[][]): { x: number; y: number } | null {
    const size = board.length;
    const center = size / 2;
    const candidates: { x: number; y: number; dist: number }[] = [];

    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            if (!validMoves[x][y]) continue;
            const dist = Math.abs(x - center) + Math.abs(y - center);
            candidates.push({ x, y, dist });
        }
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => a.dist - b.dist);
    return { x: candidates[0].x, y: candidates[0].y };
}

function countAdjacentEmpty(board: string[], x: number, y: number): number {
    const size = board.length;
    let count = 0;
    const directions = [
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
    ];

    for (const dir of directions) {
        const nx = x + dir.dx, ny = y + dir.dy;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        if (board[nx][ny] === '.') {
            count++;
        }
    }
    return count;
}

function isAdjacentToFriendlyStrongNetwork(ns: NS, board: string[], liberties: number[][], x: number, y: number): boolean {
    const size = board.length;
    const directions = [
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
    ];

    for (const dir of directions) {
        const nx = x + dir.dx, ny = y + dir.dy;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        if (board[nx][ny] === 'X' && liberties[nx][ny] >= 3) {
            return true;
        }
    }

    return false;
}

function shouldPass(ns: NS, board: string[], validMoves: boolean[][], strategyMode: string, size: number): boolean {
    /**
     * Evaluates whether the script should pass based on the current board state.
     * Returns true if passing is advisable, false otherwise.
     */

    // Heuristic 1: No beneficial moves available
    const beneficialMoveExists = getBestMove(ns, board, validMoves, strategyMode) !== null;

    if (!beneficialMoveExists) {
        return true;
    }

    // Heuristic 2: Majority control of the board
    const { xCount, oCount } = countRoutersAndLiberties(board);
    if (xCount > oCount + 2) { // Threshold can be adjusted
        return true;
    }

    // Heuristic 3: High density of own routers, risking over-extension
    const densityThreshold = 0.7; // 70% of the board filled
    const totalRouters = xCount + oCount;
    if (totalRouters / (size * size) > densityThreshold) {
        return true;
    }

    // Additional heuristics can be added as needed

    return false;
}
