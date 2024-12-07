import { NS } from "@ns";

/**
 * This updated script introduces enhanced defensive strategies specifically tailored
 * for combating aggressive AI opponents like "The Black Hand". It prioritizes defense,
 * reinforces vulnerable networks, and prevents overextension within the "aggro" strategy.
 */

/** @param {NS} ns */
export async function main(ns: NS) {
    const faction = "The Black Hand";
    const size = 9; // Adjust as needed

    // Strategy mode argument
    const strategyMode = (ns.args[0] && typeof ns.args[0] === 'string') ? ns.args[0].toLowerCase() : "balanced";

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
            await ns.sleep(100);
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

function getBestMove(
    ns: NS,
    board: string[],
    validMoves: boolean[][],
    strategyMode: string
): { x: number; y: number } | null {
    // Define the type for move strategies
    type MoveStrategy = {
        fn: (
            ns: NS,
            b: string[],
            v: boolean[][]
        ) => { x: number; y: number } | null;
        type: string;
    };

    // Define the strategies
    const strategyOrders: Record<string, MoveStrategy[]> = {
        aggro: [
            { fn: findCaptureMove, type: "capture" },
            { fn: findDefendMove, type: "defend" },
            { fn: findAttackMove, type: "attack" },
            { fn: findExpansionMove, type: "expansion" },
            { fn: getCenterFocusedMove, type: "center" }
        ],
        balanced: [
            { fn: findCaptureMove, type: "capture" },
            { fn: findAttackMove, type: "attack" },
            { fn: findDefendMove, type: "defend" },
            { fn: findExpansionMove, type: "expansion" },
            { fn: getCenterFocusedMove, type: "center" }
        ],
        defense: [
            { fn: findCaptureMove, type: "capture" },
            { fn: findDefendMove, type: "defend" },
            { fn: findExpansionMove, type: "expansion" },
            { fn: findAttackMove, type: "attack" },
            { fn: getCenterFocusedMove, type: "center" }
        ]
    };

    // Ensure strategyMode is a valid key in strategyOrders
    const order = strategyOrders[strategyMode] || strategyOrders["balanced"];
    const candidates: { x: number; y: number; type: string }[] = [];

    // Collect candidate moves
    for (const { fn, type } of order) {
        const move = fn(ns, board, validMoves);
        if (move) {
            candidates.push({ ...move, type });
        }
    }

    if (candidates.length === 0) return null;

    let bestMove: { x: number; y: number } | null = null;
    let bestScore = -Infinity;

    // Evaluate candidates
    for (const candidate of candidates) {
        const score = scoreMove(ns, board, candidate.x, candidate.y, candidate.type);
        if (score > bestScore) {
            bestScore = score;
            bestMove = { x: candidate.x, y: candidate.y };
        }
    }

    return bestMove;
}


function scoreMove(ns: NS, board: string[], x: number, y: number, moveType: string) {
    const simulatedBoard = simulateBoardAfterMove(board, x, y, 'X');
    const { xCount, oCount, xLib, oLib } = countRoutersAndLiberties(simulatedBoard);

    let score = (xCount - oCount) + (xLib - oLib) * 0.5;
    const disconnectionPenalty = evaluateDisconnection(simulatedBoard, x, y);
    score -= disconnectionPenalty;

    switch (moveType) {
        case "capture": score += 3; break;
        case "defend": score += 2; break;
        case "attack": score += 1; break;
        case "expansion": score += 0.5; break;
    }

    return score;
}

function evaluateDisconnection(board: string[], x: number, y: number) {
    // Evaluate if placing a router at (x, y) creates disconnected groups
    // Higher penalty for isolated groups
    const size = board.length;
    const directions = [
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
    ];
    let penalty = 0;

    for (const dir of directions) {
        const nx = x + dir.dx, ny = y + dir.dy;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        if (board[nx][ny] === '.') {
            penalty += 0.5; // Add penalty for creating isolated nodes
        }
    }

    return penalty;
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

function shouldPass(ns: NS, board: string[], validMoves: boolean[][], strategyMode: string, size: number) {
    const beneficialMoveExists = getBestMove(ns, board, validMoves, strategyMode) !== null;
    if (!beneficialMoveExists) return true;

    const { xCount, oCount } = countRoutersAndLiberties(board);
    if (xCount > oCount + 2) return true;

    const density = (xCount + oCount) / (size * size);
    if (density > 0.7) return true;

    return false;
}
