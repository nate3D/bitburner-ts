import { NS } from "@ns";
import { logToFile } from "logger";

/** @param {NS} ns */
export async function main(ns: NS) {
    // Kill other instances of this script
    const scriptName = ns.getScriptName();
    const runningScripts = ns.ps().filter(s => s.filename === scriptName && s.pid !== ns.pid);
    for (const script of runningScripts) {
        ns.kill(script.pid);
    }

    const faction = "Netburners"; // Change to the faction you're playing against
    const boardSize = 7;          // Board size can be 5, 7, or 9

    while (true) {
        ns.go.resetBoardState(faction, boardSize);
        await playGame(ns);
    }
}

async function playGame(ns: NS) {
    let result;
    let passedTurns = 0; // Track consecutive passes
    let turn = 0;

    do {
        const board: string[] = ns.go.getBoardState(); // Array of strings, each string is a row
        const validMoves: boolean[][] = ns.go.analysis.getValidMoves();
        const liberties: number[][] = ns.go.analysis.getLiberties();
        const chains: (number | null)[][] = ns.go.analysis.getChains();
        const largestChainId = getLargestFriendlyChain(chains, board);
        const size = board.length;
        const cx = Math.floor(size / 2);
        const cy = Math.floor(size / 2);

        // **Check for End Game Condition**
        if (checkEndGameCondition(ns, board, validMoves)) {
            // Pass turn if we've already won or no beneficial moves are left
            result = await ns.go.passTurn();
            passedTurns++;
        } else {
            let move: [number, number] | null = null;

            if (turn < 5) {
                // For the first 5 turns, place tiles that are separated by a one-tile gap
                switch (turn) {
                    case 0:
                        move = [cx, cy]; // Center
                        break;
                    case 1:
                        move = [cx + 2, cy];
                        break;
                    case 2:
                        move = [cx, cy + 2];
                        break;
                    case 3:
                        move = [cx - 2, cy];
                        break;
                    case 4:
                        move = [cx, cy - 2];
                        break;
                }
                // Check if move is within board boundaries and is valid
                if (
                    move &&
                    move[0] >= 0 && move[0] < size &&
                    move[1] >= 0 && move[1] < size &&
                    validMoves[move[0]][move[1]]
                ) {
                    result = await ns.go.makeMove(move[0], move[1]);
                    logToFile(ns, `First moves: Turn ${turn}, placing at ${move}`);
                    turn++;
                    passedTurns = 0; // Reset passedTurns since we made a move
                    continue;
                } else {
                    logToFile(ns, `First moves: Move ${move} is invalid, proceeding to normal move selection`);
                    // Proceed to normal move selection
                }
            }
            // Normal move selection logic
            // Priority 1: Defend our networks
            const defenseMoves = getDefenseMoves(board, validMoves, liberties);
            if (defenseMoves.length > 0) {
                logToFile(ns, `Defending: ${defenseMoves[0]}`);
                move = defenseMoves[0];
            } else {
                // Priority 2: Capture opponent networks
                const captureMoves = getCaptureMoves(board, validMoves, liberties);
                if (captureMoves.length > 0) {
                    logToFile(ns, `Capturing: ${captureMoves[0]}`);
                    move = captureMoves[0];
                } else {
                    // Priority 3: Expand our largest network
                    const expansionMoves = getExpansionMoves(board, validMoves, chains, largestChainId);
                    if (expansionMoves.length > 0) {
                        logToFile(ns, `Expanding: ${expansionMoves[0]}`);
                        move = expansionMoves[0];
                    } else {
                        // Priority 4: Encircle empty spaces adjacent to our largest network
                        const encircleMoves = getEncircleMoves(board, validMoves, chains, largestChainId);
                        if (encircleMoves.length > 0) {
                            logToFile(ns, `Encircling: ${encircleMoves[0]}`);
                            move = encircleMoves[0];
                        } else {
                            // No beneficial moves left, pass turn
                            logToFile(ns, "No beneficial moves left, passing turn.");
                            result = await ns.go.passTurn();
                            passedTurns++;
                            turn++;
                            continue;
                        }
                    }
                }
            }

            if (move) {
                result = await ns.go.makeMove(move[0], move[1]);
                turn++;
                passedTurns = 0; // Reset passedTurns since we made a move
            }
        }

        // Wait for the opponent's move
        const opponentResult = await ns.go.opponentNextTurn();
        await ns.sleep(200);

        // Check if the opponent passed
        if (opponentResult.type === "pass") {
            passedTurns++;
        } else {
            passedTurns = 0; // Reset passedTurns since opponent made a move
        }

        // Check for two consecutive passes to end the game
        if (passedTurns >= 2) {
            logToFile(ns, "Both players passed consecutively. Ending game.");
            break;
        }

    } while (result?.type !== "gameOver");

    logToFile(ns, "Game over!");
}

function checkEndGameCondition(ns: NS, board: string[], validMoves: boolean[][]): boolean {
    const size = board.length;

    // Count the number of valid moves left
    let validMoveCount = 0;
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < validMoves[x].length; y++) {
            if (validMoves[x][y]) {
                validMoveCount++;
            }
        }
    }

    // If no valid moves are left
    if (validMoveCount === 0) {
        return true;
    }

    // If we have more than 40% of the board, we've won
    const totalTiles = board.length * board[0].length;
    const playerTiles = board.join("").split("X").length - 1;
    const opponentTiles = board.join("").split("O").length - 1;
    logToFile(ns, `Player tiles: ${playerTiles}, Opponent tiles: ${opponentTiles}, Total tiles: ${totalTiles}, Valid moves: ${validMoveCount}`);
    if (playerTiles > totalTiles * 0.4) {
        logToFile(ns, "Player has more than 50% of the board. Player wins!");
        return true;
    }

    // Otherwise, continue playing
    return false;
}


function getLargestFriendlyChain(chains: (number | null)[][], board: string[]): number | null {
    const chainSizes: { [key: number]: number } = {};
    const size = board.length;
    for (let x = 0; x < size; x++) {
        const row = board[x];
        for (let y = 0; y < row.length; y++) {
            if (row.charAt(y) === 'X') {
                const chainId = chains[x][y];
                if (chainId !== null) {
                    if (chainSizes[chainId] !== undefined) {
                        chainSizes[chainId]++;
                    } else {
                        chainSizes[chainId] = 1;
                    }
                }
            }
        }
    }
    // Find the chain ID with the maximum size
    let largestChainId: number | null = null;
    let maxSize = 0;
    for (const chainIdStr in chainSizes) {
        const chainId = Number(chainIdStr);
        if (chainSizes[chainId] > maxSize) {
            maxSize = chainSizes[chainId];
            largestChainId = chainId;
        }
    }
    return largestChainId;
}

function getDefenseMoves(board: string[], validMoves: boolean[][], liberties: number[][]): [number, number][] {
    const moves: [number, number][] = [];
    const size = board.length;

    for (let x = 0; x < size; x++) {
        const row = board[x];
        for (let y = 0; y < row.length; y++) {
            if (!validMoves[x][y]) continue;

            const neighbors = getNeighbors(x, y, size);
            for (const [nx, ny] of neighbors) {
                if (board[nx].charAt(ny) === 'X' && liberties[nx][ny] === 1) {
                    if (isSafeMove(board, x, y)) {
                        moves.push([x, y]);
                        break;
                    }
                }
            }
        }
    }

    // Prioritize moves closer to the center
    moves.sort((a, b) => {
        const distA = getDistanceFromCenter(a[0], a[1], size);
        const distB = getDistanceFromCenter(b[0], b[1], size);
        return distA - distB;
    });

    return moves;
}

function getCaptureMoves(board: string[], validMoves: boolean[][], liberties: number[][]): [number, number][] {
    const moves: [number, number][] = [];
    const size = board.length;

    for (let x = 0; x < size; x++) {
        const row = board[x];
        for (let y = 0; y < row.length; y++) {
            if (!validMoves[x][y]) continue;

            const neighbors = getNeighbors(x, y, size);
            for (const [nx, ny] of neighbors) {
                if (board[nx].charAt(ny) === 'O' && liberties[nx][ny] === 1) {
                    moves.push([x, y]);
                    break;
                }
            }
        }
    }

    // Prioritize moves closer to the center
    moves.sort((a, b) => {
        const distA = getDistanceFromCenter(a[0], a[1], size);
        const distB = getDistanceFromCenter(b[0], b[1], size);
        return distA - distB;
    });

    return moves;
}

function isSafeMove(board: string[], x: number, y: number): boolean {
    const size = board.length;
    const neighbors = getNeighbors(x, y, size);
    let emptyCount = 0;
    for (const [nx, ny] of neighbors) {
        if (board[nx].charAt(ny) === '.') emptyCount++;
    }
    return emptyCount >= 2;
}

function getExpansionMoves(board: string[], validMoves: boolean[][], chains: (number | null)[][], largestChainId: number | null): [number, number][] {
    const moves: [number, number][] = [];
    const size = board.length;

    if (largestChainId === null) return moves;

    for (let x = 0; x < size; x++) {
        const row = board[x];
        for (let y = 0; y < row.length; y++) {
            if (!validMoves[x][y]) continue;

            const neighbors = getNeighbors(x, y, size);
            for (const [nx, ny] of neighbors) {
                if (
                    board[nx].charAt(ny) === 'X' &&
                    chains[nx][ny] === largestChainId
                ) {
                    moves.push([x, y]);
                    break;
                }
            }
        }
    }

    // Prioritize moves closer to the center
    moves.sort((a, b) => {
        const distA = getDistanceFromCenter(a[0], a[1], size);
        const distB = getDistanceFromCenter(b[0], b[1], size);
        return distA - distB;
    });

    return moves;
}

function getEncircleMoves(board: string[], validMoves: boolean[][], chains: (number | null)[][], largestChainId: number | null): [number, number][] {
    const moves: [number, number][] = [];
    const size = board.length;

    if (largestChainId === null) return moves;

    for (let x = 0; x < size; x++) {
        const row = board[x];
        for (let y = 0; y < row.length; y++) {
            if (!validMoves[x][y]) continue;

            const neighbors = getNeighbors(x, y, size);
            let emptyNeighbors = 0;
            let friendlyNeighbors = 0;
            for (const [nx, ny] of neighbors) {
                if (board[nx].charAt(ny) === '.') emptyNeighbors++;
                if (
                    board[nx].charAt(ny) === 'X' &&
                    chains[nx][ny] === largestChainId
                ) {
                    friendlyNeighbors++;
                }
            }

            if (emptyNeighbors >= 2 && friendlyNeighbors >= 1) {
                moves.push([x, y]);
            }
        }
    }

    // Prioritize moves closer to the center
    moves.sort((a, b) => {
        const distA = getDistanceFromCenter(a[0], a[1], size);
        const distB = getDistanceFromCenter(b[0], b[1], size);
        return distA - distB;
    });

    return moves;
}

function getNeighbors(x: number, y: number, size: number): [number, number][] {
    const neighbors: [number, number][] = [];
    if (x > 0) neighbors.push([x - 1, y]);
    if (x < size - 1) neighbors.push([x + 1, y]);
    if (y > 0) neighbors.push([x, y - 1]);
    if (y < size - 1) neighbors.push([x, y + 1]);
    return neighbors;
}

function getDistanceFromCenter(x: number, y: number, size: number): number {
    const center = (size - 1) / 2;
    return Math.abs(x - center) + Math.abs(y - center);
}
