class SimpleCheckers {
    constructor() {
        this.board = this.createBoard();
        this.currentPlayer = 'red';
        this.selectedPiece = null;
        this.validMoves = [];
        this.gameOver = false;
        this.redPieces = 12;
        this.whitePieces = 12;
        
        // Game mode settings
        this.gameMode = 'select'; // 'select', 'human-vs-ai', 'ai-vs-ai', 'human-vs-human'
        this.humanPlayer = 'red'; // Which color the human plays (in human-vs-ai mode)
        this.autorunActive = false;
        this.aiThinking = false;
        
        // Unique game session ID
        this.gameId = this.generateGameId();
        
        this.init();
    }
    
    /**
     * Generate a unique game ID for tracking sessions
     */
    generateGameId() {
        // Generate a UUID-like string
        return 'game_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    createBoard() {
        const board = Array(8).fill(null).map(() => Array(8).fill(null));
        
        // According to official rules: pieces are placed on dark squares only
        // Red pieces (traditionally black in standard checkers) start on top 3 rows
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 8; col++) {
                if ((row + col) % 2 === 1) { // Dark squares only
                    board[row][col] = { color: 'red', isKing: false };
                }
            }
        }
        
        // White pieces start on bottom 3 rows  
        for (let row = 5; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                if ((row + col) % 2 === 1) { // Dark squares only
                    board[row][col] = { color: 'white', isKing: false };
                }
            }
        }
        
        return board;
    }
    
    init() {
        this.setupEvents();
        // Set initial message for mode selection
        this.showMessage('Select a game mode to start');
        // Don't render board initially - wait for mode selection
    }
    
    renderBoard() {
        const boardEl = document.getElementById('checkerboard');
        boardEl.innerHTML = '';
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = document.createElement('div');
                square.className = `checker-cell ${(row + col) % 2 === 0 ? 'light-square' : 'dark-square'}`;
                square.dataset.row = row;
                square.dataset.col = col;
                
                const piece = this.board[row][col];
                if (piece) {
                    const pieceEl = document.createElement('div');
                    pieceEl.className = `checker-piece ${piece.color}-piece`;
                    if (piece.isKing) pieceEl.classList.add('king-piece');
                    square.appendChild(pieceEl);
                }
                
                boardEl.appendChild(square);
            }
        }
        
        this.updatePieceCounts();
    }
    
    setupEvents() {
        document.getElementById('checkerboard').addEventListener('click', (e) => {
            if (this.gameOver || this.aiThinking) return;
            
            const square = e.target.closest('.checker-cell');
            if (!square) return;
            
            const row = parseInt(square.dataset.row);
            const col = parseInt(square.dataset.col);
            
            this.handleClick(row, col);
        });
        
        // Mode selection events
        document.getElementById('mode-human-vs-ai').addEventListener('click', () => this.setGameMode('human-vs-ai'));
        document.getElementById('mode-ai-vs-ai').addEventListener('click', () => this.setGameMode('ai-vs-ai'));
        document.getElementById('mode-human-vs-human').addEventListener('click', () => this.setGameMode('human-vs-human'));
        
        // Game control events
        document.getElementById('new-game').addEventListener('click', () => this.newGame());
        document.getElementById('get-llm-move').addEventListener('click', () => this.getLLMMove());
        document.getElementById('toggle-autorun').addEventListener('click', () => this.toggleAutorun());
        document.getElementById('offer-draw').addEventListener('click', () => this.offerDraw());
        document.getElementById('resign').addEventListener('click', () => this.resign());
        document.getElementById('play-again').addEventListener('click', () => this.newGame());
        document.getElementById('close-modal').addEventListener('click', () => this.closeModal());
    }
    
    handleClick(row, col) {
        // In human-vs-ai mode, only allow human player to click
        if (this.gameMode === 'human-vs-ai' && this.currentPlayer !== this.humanPlayer) {
            return;
        }
        
        // In ai-vs-ai mode, don't allow manual clicks
        if (this.gameMode === 'ai-vs-ai') {
            return;
        }
        
        const piece = this.board[row][col];
        
        if (this.selectedPiece) {
            // Try to move
            if (this.isValidMove(row, col)) {
                this.makeMove(this.selectedPiece.row, this.selectedPiece.col, row, col);
                this.clearSelection();
                
                // In human-vs-ai mode, trigger AI response after human move
                if (this.gameMode === 'human-vs-ai' && !this.gameOver) {
                    setTimeout(async () => {
                        await this.getLLMMove();
                    }, 1000);
                }
            } else {
                this.clearSelection();
                if (piece && piece.color === this.currentPlayer) {
                    this.selectPiece(row, col);
                }
            }
        } else if (piece && piece.color === this.currentPlayer) {
            this.selectPiece(row, col);
        }
    }
    
    selectPiece(row, col) {
        this.selectedPiece = { row, col };
        this.validMoves = this.getValidMoves(row, col);
        this.highlightPiece(row, col);
        this.highlightMoves();
    }
    
    clearSelection() {
        this.selectedPiece = null;
        this.validMoves = [];
        
        // Remove all highlights
        document.querySelectorAll('.checker-piece').forEach(p => p.classList.remove('selected'));
        document.querySelectorAll('.checker-cell').forEach(s => s.classList.remove('valid-move'));
    }
    
    highlightPiece(row, col) {
        const square = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        const piece = square.querySelector('.checker-piece');
        if (piece) piece.classList.add('selected');
    }
    
    highlightMoves() {
        this.validMoves.forEach(move => {
            const square = document.querySelector(`[data-row="${move.row}"][data-col="${move.col}"]`);
            square.classList.add('valid-move');
        });
    }
    
    getValidMoves(row, col) {
        const piece = this.board[row][col];
        if (!piece || piece.color !== this.currentPlayer) return [];
        
        const moves = [];
        const directions = piece.isKing ? 
            [[-1, -1], [-1, 1], [1, -1], [1, 1]] :
            piece.color === 'red' ? [[1, -1], [1, 1]] : [[-1, -1], [-1, 1]];
        
        // Check regular moves
        directions.forEach(([dr, dc]) => {
            const newRow = row + dr;
            const newCol = col + dc;
            
            if (this.isValidPos(newRow, newCol) && !this.board[newRow][newCol]) {
                moves.push({ row: newRow, col: newCol, isJump: false });
            }
        });
        
        // Check jumps
        directions.forEach(([dr, dc]) => {
            const jumpRow = row + dr;
            const jumpCol = col + dc;
            const landRow = row + dr * 2;
            const landCol = col + dc * 2;
            
            if (this.isValidPos(jumpRow, jumpCol) && this.isValidPos(landRow, landCol)) {
                const jumpPiece = this.board[jumpRow][jumpCol];
                if (jumpPiece && jumpPiece.color !== piece.color && !this.board[landRow][landCol]) {
                moves.push({
                        row: landRow, 
                        col: landCol, 
                        isJump: true, 
                        jumpRow, 
                        jumpCol 
                    });
                }
            }
        });
        
        // If there are jumps available, only return jumps (mandatory)
        const jumps = moves.filter(m => m.isJump);
        return jumps.length > 0 ? jumps : moves;
    }
    
    isValidPos(row, col) {
        return row >= 0 && row < 8 && col >= 0 && col < 8;
    }
    
    isValidMove(row, col) {
        return this.validMoves.some(move => move.row === row && move.col === col);
    }
    
    makeMove(fromRow, fromCol, toRow, toCol) {
        const piece = this.board[fromRow][fromCol];
        let move = this.validMoves.find(m => m.row === toRow && m.col === toCol);
        
        // If move not found in validMoves, try to determine it manually
        if (!move) {
            // Get valid moves for this piece to find the move details
            const pieceMoves = this.getValidMoves(fromRow, fromCol);
            move = pieceMoves.find(m => m.row === toRow && m.col === toCol);
        }
        
        // Move piece
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;
        
        // Handle capture
        if (move && move.isJump) {
            this.board[move.jumpRow][move.jumpCol] = null;
            if (piece.color === 'red') {
                this.whitePieces--;
            } else {
                this.redPieces--;
            }
        }
        
        // Check for king promotion
        if (!piece.isKing) {
            if ((piece.color === 'red' && toRow === 7) || (piece.color === 'white' && toRow === 0)) {
                piece.isKing = true;
                this.showMessage(`${piece.color} piece promoted to King!`, 'warning');
            }
        }
        
        // Check for additional jumps
        if (move && move.isJump) {
            const additionalJumps = this.getValidMoves(toRow, toCol).filter(m => m.isJump);
            if (additionalJumps.length > 0) {
                this.selectedPiece = { row: toRow, col: toCol };
                this.validMoves = additionalJumps;
                this.renderBoard();
                this.highlightPiece(toRow, toCol);
                this.highlightMoves();
                this.showMessage(`${this.currentPlayer} must continue jumping!`, 'warning');
                return;
            }
        }
        
        this.switchPlayer();
        this.renderBoard();
        this.checkGameOver();
    }
    
    switchPlayer() {
        this.currentPlayer = this.currentPlayer === 'red' ? 'white' : 'red';
        this.updateStatus();
    }
    
    updateStatus() {
        const redPlayer = document.getElementById('red-player');
        const whitePlayer = document.getElementById('white-player');
        
        // Update visual indicators for current player
        if (this.currentPlayer === 'red') {
            redPlayer.className = 'flex justify-between items-center p-3 bg-red-600 rounded-lg transition-all duration-300 shadow-md';
            whitePlayer.className = 'flex justify-between items-center p-3 bg-gray-700 rounded-lg transition-all duration-300';
        } else {
            redPlayer.className = 'flex justify-between items-center p-3 bg-gray-700 rounded-lg transition-all duration-300';
            whitePlayer.className = 'flex justify-between items-center p-3 bg-green-600 rounded-lg transition-all duration-300 shadow-md';
        }
        
        if (!this.gameOver) {
            let message = `${this.currentPlayer} player's turn`;
            
            // Add mode-specific information
            if (this.gameMode === 'human-vs-ai') {
                if (this.currentPlayer === this.humanPlayer) {
                    message = `Your turn (${this.currentPlayer})`;
                } else {
                    message = `AI's turn (${this.currentPlayer})`;
                }
            } else if (this.gameMode === 'ai-vs-ai') {
                message = `AI vs AI - ${this.currentPlayer} AI's turn`;
            }
            
            this.showMessage(message);
        }
    }
    
    updatePieceCounts() {
        document.getElementById('red-count').textContent = this.redPieces;
        document.getElementById('white-count').textContent = this.whitePieces;
    }
    
    showMessage(text, type = 'info') {
        const messageEl = document.getElementById('message');
        messageEl.textContent = text;
        messageEl.className = `message ${type}`;
    }
    
    checkGameOver() {
        if (this.redPieces === 0) {
            this.endGame('White wins! All red pieces captured.');
        } else if (this.whitePieces === 0) {
            this.endGame('Red wins! All white pieces captured.');
        } else if (!this.hasValidMoves()) {
            const winner = this.currentPlayer === 'red' ? 'White' : 'Red';
            this.endGame(`${winner} wins! ${this.currentPlayer} has no valid moves.`);
        }
    }
    
    hasValidMoves() {
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.color === this.currentPlayer) {
                    if (this.getValidMoves(row, col).length > 0) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /**
     * Check if any jumps are available for the current player
     * According to official rules, if jumps are available, they MUST be taken
     */
    hasAvailableJumps() {
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.color === this.currentPlayer) {
                    const moves = this.getValidMoves(row, col);
                    const jumps = moves.filter(move => move.isJump);
                    if (jumps.length > 0) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    
    endGame(message) {
        this.gameOver = true;
        this.autorunActive = false;
        this.aiThinking = false;
        this.clearSelection();
        this.showMessage('Game Over', 'error');
        this.updateAIStatus('Game finished');
        this.showModal(message);
    }
    
    showModal(message) {
        document.getElementById('game-over-message').textContent = message;
        document.getElementById('game-over-modal').style.display = 'block';
    }
    
    closeModal() {
        document.getElementById('game-over-modal').style.display = 'none';
    }
    
    setGameMode(mode) {
        this.gameMode = mode;
        this.autorunActive = false;
        this.aiThinking = false;
        
        // For human-vs-ai mode, ask which color the human wants to play
        if (mode === 'human-vs-ai') {
            const choice = confirm('Do you want to play as Red (goes first)?\n\nClick OK for Red, Cancel for White');
            this.humanPlayer = choice ? 'red' : 'white';
        }
        
        // Hide mode selection and show game area
        document.getElementById('mode-selection').style.display = 'none';
        document.getElementById('game-area').style.display = 'flex';
        document.getElementById('game-mode-info').style.display = 'block';
        
        // Update UI based on mode
        this.updateModeUI();
        
        // Initialize the game board for the selected mode
        this.initializeGameForMode();
        
        // Auto-start AI vs AI if selected
        if (mode === 'ai-vs-ai') {
            this.startAutorun();
        } else if (mode === 'human-vs-ai' && this.humanPlayer === 'white') {
            // If human is white and AI is red, let AI make first move
            setTimeout(() => {
                this.getLLMMove();
            }, 1000);
        }
    }
    
    updateModeUI() {
        const modeText = document.getElementById('current-mode-text');
        const modeIcon = document.querySelector('#game-mode-info .material-icons-outlined');
        const getLLMBtn = document.getElementById('get-llm-move');
        const autorunBtn = document.getElementById('toggle-autorun');
        
        switch(this.gameMode) {
            case 'human-vs-ai':
                const humanColor = this.humanPlayer.charAt(0).toUpperCase() + this.humanPlayer.slice(1);
                modeText.textContent = `Human vs AI (You: ${humanColor})`;
                modeIcon.textContent = 'psychology';
                modeIcon.className = 'material-icons-outlined text-blue-400 text-3xl';
                getLLMBtn.style.display = 'flex';
                autorunBtn.style.display = 'none';
                break;
            case 'ai-vs-ai':
                modeText.textContent = 'AI vs AI (Autorun)';
                modeIcon.textContent = 'smart_toy';
                modeIcon.className = 'material-icons-outlined text-purple-400 text-3xl';
                getLLMBtn.style.display = 'none';
                autorunBtn.style.display = 'flex';
                break;
            case 'human-vs-human':
                modeText.textContent = 'Human vs Human';
                modeIcon.textContent = 'people';
                modeIcon.className = 'material-icons-outlined text-green-400 text-3xl';
                getLLMBtn.style.display = 'flex';
                autorunBtn.style.display = 'none';
                break;
        }
    }
    
    toggleAutorun() {
        if (this.autorunActive) {
            this.stopAutorun();
        } else {
            this.startAutorun();
        }
    }
    
    startAutorun() {
        this.autorunActive = true;
        const btn = document.getElementById('toggle-autorun');
        btn.innerHTML = '<span class="material-icons-outlined mr-2">pause</span>Pause Autorun';
        this.updateAIStatus('Autorun active - AI vs AI');
        this.continueAutorun();
    }
    
    stopAutorun() {
        this.autorunActive = false;
        this.aiThinking = false;
        const btn = document.getElementById('toggle-autorun');
        btn.innerHTML = '<span class="material-icons-outlined mr-2">play_arrow</span>Resume Autorun';
        this.updateAIStatus('Autorun paused');
    }
    
    async continueAutorun() {
        if (!this.autorunActive || this.gameOver) {
            return;
        }
        
        // Small delay between moves for better visualization
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        if (this.autorunActive && !this.gameOver) {
            await this.getLLMMove();
            // Continue the loop
            this.continueAutorun();
        }
    }
    
    updateAIStatus(message) {
        const statusEl = document.getElementById('ai-status');
        
        statusEl.textContent = message;
        
        if (message.includes('thinking') || message.includes('analyzing')) {
            statusEl.classList.add('ai-thinking');
        } else {
            statusEl.classList.remove('ai-thinking');
        }
    }

    initializeGameForMode() {
        // Initialize a fresh game without asking about mode selection
        this.board = this.createBoard();
        this.currentPlayer = 'red';
        this.selectedPiece = null;
        this.validMoves = [];
        this.gameOver = false;
        this.redPieces = 12;
        this.whitePieces = 12;
        this.aiThinking = false;
        this.autorunActive = false;
        
        // Generate new game ID for this session
        this.gameId = this.generateGameId();
        console.log('New game started with ID:', this.gameId);
        
        this.closeModal();
        this.renderBoard();
        this.updateStatus();
        this.updateAIStatus('');
    }

    newGame() {
        // If already in a game mode, ask if user wants to return to mode selection
        if (this.gameMode !== 'select') {
            const returnToModeSelection = confirm('Do you want to return to mode selection?\n\nClick OK to choose a new mode, Cancel to restart current game.');
            if (returnToModeSelection) {
                this.gameMode = 'select';
                this.autorunActive = false;
                this.aiThinking = false;
                document.getElementById('mode-selection').style.display = 'block';
                document.getElementById('game-area').style.display = 'none';
                document.getElementById('game-mode-info').style.display = 'none';
                this.showMessage('Select a game mode to start');
                return;
            }
        }
        
        this.board = this.createBoard();
        this.currentPlayer = 'red';
        this.selectedPiece = null;
        this.validMoves = [];
        this.gameOver = false;
        this.redPieces = 12;
        this.whitePieces = 12;
        this.aiThinking = false;
        this.autorunActive = false;
        
        // Generate new game ID for this session
        this.gameId = this.generateGameId();
        console.log('New game started with ID:', this.gameId);
        
        this.closeModal();
        this.renderBoard();
        this.updateStatus();
        
        // Reset to mode selection if no mode is set
        if (this.gameMode === 'select') {
            document.getElementById('mode-selection').style.display = 'block';
            document.getElementById('game-area').style.display = 'none';
            document.getElementById('game-mode-info').style.display = 'none';
            this.showMessage('Select a game mode to start');
        } else {
            this.updateAIStatus('');
            // Restart autorun if it was an AI vs AI game
            if (this.gameMode === 'ai-vs-ai') {
                this.startAutorun();
            } else if (this.gameMode === 'human-vs-ai' && this.humanPlayer === 'white') {
                // If human is white and AI is red, let AI make first move
                setTimeout(() => {
                    this.getLLMMove();
                }, 1000);
            }
        }
    }
    
    offerDraw() {
        if (this.gameOver) return;
        
        if (confirm(`${this.currentPlayer} offers a draw. Do you accept?`)) {
            this.endGame('Game ended in a draw by agreement.');
        }
    }
    
    resign() {
        if (this.gameOver) return;
        
        const winner = this.currentPlayer === 'red' ? 'White' : 'Red';
        if (confirm(`Are you sure you want to resign? ${winner} will win.`)) {
            this.endGame(`${winner} wins by resignation!`);
        }
    }
    
    /**
     * Get the complete board state for LLM analysis
     * Returns comprehensive game state including board position, current player, and all available moves
     */
    getBoardState() {
        // Get all available moves for current player
        const allMoves = [];
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.color === this.currentPlayer) {
                    const moves = this.getValidMoves(row, col);
                    moves.forEach(move => {
                        allMoves.push({
                            from: { row: row, col: col, notation: this.positionToNotation(row, col) },
                            to: { row: move.row, col: move.col, notation: this.positionToNotation(move.row, move.col) },
                            isJump: move.isJump,
                            capturedPiece: move.isJump ? { 
                                row: move.jumpRow, 
                                col: move.jumpCol, 
                                notation: this.positionToNotation(move.jumpRow, move.jumpCol)
                            } : null,
                            piece: {
                                color: piece.color,
                                isKing: piece.isKing
                            }
                        });
                    });
                }
            }
        }
        
        // Check if any moves are mandatory jumps
        // According to official rules: if jumps are available, you MUST take them
        // But if multiple jumps are available, you may choose which one
        const jumpMoves = allMoves.filter(move => move.isJump);
        const availableMoves = jumpMoves.length > 0 ? jumpMoves : allMoves;
        
        // Create board representation in multiple formats
        const boardMatrix = this.board.map(row => 
            row.map(cell => {
                if (cell === null) return null;
                return {
                    color: cell.color,
                    isKing: cell.isKing,
                    symbol: cell.color === 'red' ? (cell.isKing ? 'R' : 'r') : (cell.isKing ? 'W' : 'w')
                };
            })
        );
        
        // Create a simple string representation of the board
        const boardString = this.board.map((row, rowIndex) => 
            row.map((cell, colIndex) => {
                // Only use dark squares (where pieces can be)
                if ((rowIndex + colIndex) % 2 === 0) return ' '; // Light square
                if (cell === null) return '.'; // Empty dark square
                return cell.color === 'red' ? (cell.isKing ? 'R' : 'r') : (cell.isKing ? 'W' : 'w');
            }).join('')
        ).join('\n');
        
        // Count pieces by type
        const pieceCount = {
            red: { regular: 0, kings: 0, total: this.redPieces },
            white: { regular: 0, kings: 0, total: this.whitePieces }
        };
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece) {
                    if (piece.isKing) {
                        pieceCount[piece.color].kings++;
                    } else {
                        pieceCount[piece.color].regular++;
                    }
                }
            }
        }
        
        // Get all opponent pieces and their positions (for threat analysis)
        const opponentColor = this.currentPlayer === 'red' ? 'white' : 'red';
        const opponentPieces = [];
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.color === opponentColor) {
                    opponentPieces.push({
                        position: { row: row, col: col, notation: this.positionToNotation(row, col) },
                        color: piece.color,
                        isKing: piece.isKing,
                        possibleMoves: this.getValidMovesForPiece(row, col, opponentColor)
                    });
                }
            }
        }
        
        return {
            // Game state
            currentPlayer: this.currentPlayer,
            gameOver: this.gameOver,
            turnNumber: this.calculateTurnNumber(),
            
            // Board representation
            board: boardMatrix,
            boardString: boardString,
            boardNotation: this.getBoardNotation(),
            
            // Piece information
            pieceCount: pieceCount,
            
            // Available moves for current player
            availableMoves: availableMoves,
            mustJump: jumpMoves.length > 0,
            moveCount: availableMoves.length,
            
            // Opponent information (for strategic analysis)
            opponentPieces: opponentPieces,
            
            // Selected piece info (if any)
            selectedPiece: this.selectedPiece ? {
                position: this.selectedPiece,
                notation: this.positionToNotation(this.selectedPiece.row, this.selectedPiece.col),
                availableMoves: this.validMoves
            } : null,
            
            // Game context
            lastMove: this.lastMove || null,
            gamePhase: this.determineGamePhase(),
            
            // Coordinate system explanation
            coordinateSystem: {
                explanation: "Board uses 0-7 indexing. Row 0 is top, Col 0 is left. Notation uses A-H (cols) and 1-8 (rows).",
                example: "Position (0,1) = B8, Position (7,6) = G1"
            }
        };
    }
    
    /**
     * Convert board position to algebraic notation (like chess)
     */
    positionToNotation(row, col) {
        const files = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        return files[col] + (8 - row);
    }
    
    /**
     * Convert algebraic notation back to board coordinates
     */
    notationToPosition(notation) {
        const files = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        const col = files.indexOf(notation[0].toUpperCase());
        const row = 8 - parseInt(notation[1]);
        return { row, col };
    }
    
    /**
     * Get valid moves for a piece regardless of current player (for opponent analysis)
     */
    getValidMovesForPiece(row, col, forColor) {
        const piece = this.board[row][col];
        if (!piece || piece.color !== forColor) return [];
        
        const moves = [];
        const directions = piece.isKing ? 
            [[-1, -1], [-1, 1], [1, -1], [1, 1]] :
            piece.color === 'red' ? [[1, -1], [1, 1]] : [[-1, -1], [-1, 1]];
        
        // Check regular moves
        directions.forEach(([dr, dc]) => {
            const newRow = row + dr;
            const newCol = col + dc;
            
            if (this.isValidPos(newRow, newCol) && !this.board[newRow][newCol]) {
                moves.push({ 
                    row: newRow, 
                    col: newCol, 
                    notation: this.positionToNotation(newRow, newCol),
                    isJump: false 
                });
            }
        });
        
        // Check jumps
        directions.forEach(([dr, dc]) => {
            const jumpRow = row + dr;
            const jumpCol = col + dc;
            const landRow = row + dr * 2;
            const landCol = col + dc * 2;
            
            if (this.isValidPos(jumpRow, jumpCol) && this.isValidPos(landRow, landCol)) {
                const jumpPiece = this.board[jumpRow][jumpCol];
                if (jumpPiece && jumpPiece.color !== piece.color && !this.board[landRow][landCol]) {
                    moves.push({
                        row: landRow, 
                        col: landCol, 
                        notation: this.positionToNotation(landRow, landCol),
                        isJump: true, 
                        jumpRow, 
                        jumpCol,
                        jumpNotation: this.positionToNotation(jumpRow, jumpCol)
                    });
                }
            }
        });
        
        return moves;
    }
    
    /**
     * Get board in standard checkers notation
     */
    getBoardNotation() {
        const notation = [];
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                if ((row + col) % 2 === 1) { // Only dark squares
                    const piece = this.board[row][col];
                    if (piece) {
                        const square = this.positionToNotation(row, col);
                        const symbol = piece.color === 'red' ? (piece.isKing ? 'R' : 'r') : (piece.isKing ? 'W' : 'w');
                        notation.push(`${square}:${symbol}`);
                    }
                }
            }
        }
        return notation;
    }
    
    /**
     * Calculate approximate turn number
     */
    calculateTurnNumber() {
        const totalPiecesLost = (24 - this.redPieces - this.whitePieces);
        // Rough estimate: assume average 1 piece lost every 4 turns
        return Math.floor(totalPiecesLost * 2) + 1;
    }
    
    /**
     * Determine current game phase
     */
    determineGamePhase() {
        const totalPieces = this.redPieces + this.whitePieces;
        if (totalPieces >= 20) return 'opening';
        if (totalPieces >= 8) return 'midgame';
        return 'endgame';
    }
    
    /**
     * Send current board state to LLM for move suggestion using the new predict-move endpoint
     */
    async getLLMMove() {
        if (this.aiThinking || this.gameOver) {
            return;
        }
        
        this.aiThinking = true;
        const boardState = this.getBoardState();
        
        try {
            const playerName = this.currentPlayer === 'red' ? 'Red AI' : 'White AI';
            this.showMessage(`${playerName} is thinking...`, 'info');
            this.updateAIStatus(`${playerName} analyzing position...`);
            
            const response = await fetch('http://localhost:8000/predict-move', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    board_state: boardState,
                    game_id: this.gameId
                })
            });
            
            const result = await response.json();
            console.log('LLM Analysis:', result);
            
            // Show the LLM's analysis and auto-execute the move
            if (result.suggested_move && result.suggested_move.from && result.suggested_move.to) {
                const fromPos = this.notationToPosition(result.suggested_move.from);
                const toPos = this.notationToPosition(result.suggested_move.to);
                
                // Validate that the suggested move is in our available moves
                const isValidMove = boardState.availableMoves.some(move => 
                    move.from.notation === result.suggested_move.from && 
                    move.to.notation === result.suggested_move.to
                );
                
                if (isValidMove && fromPos.row >= 0 && fromPos.col >= 0 && toPos.row >= 0 && toPos.col >= 0) {
                    const playerName = this.currentPlayer === 'red' ? 'Red AI' : 'White AI';
                    this.showMessage(
                        `${playerName} suggests: ${result.suggested_move.from} → ${result.suggested_move.to} - Executing move...`, 
                        'info'
                    );
                    this.updateAIStatus(`Executing move: ${result.suggested_move.from} → ${result.suggested_move.to}`);
                    
                    // Auto-execute the move
                    setTimeout(() => {
                        // First select the piece to set up validMoves
                        this.selectPiece(fromPos.row, fromPos.col);
                        
                        // Then make the move
                        this.makeMove(fromPos.row, fromPos.col, toPos.row, toPos.col);
                        
                        this.showMessage(
                            `${playerName} move executed: ${result.suggested_move.from} → ${result.suggested_move.to}`, 
                            'info'
                        );
                        
                        this.aiThinking = false;
                        this.updateAIStatus('');
                    }, 1000); // Small delay to show the message first
                    
                } else {
                    this.showMessage(
                        `LLM suggested invalid move: ${result.suggested_move.from} → ${result.suggested_move.to}`, 
                        'error'
                    );
                    this.aiThinking = false;
                    this.updateAIStatus('');
                }
                
                // Log the move tool call to console
                console.log('Move tool was called:', result.tool_calls);
                console.log('Tool results:', result.tool_results);
            } else {
                this.showMessage('LLM provided analysis but no specific move', 'warning');
                this.aiThinking = false;
                this.updateAIStatus('');
            }
            
            // Also log the full reasoning
            console.log('LLM Reasoning:', result.reasoning);
            
            return result;
        } catch (error) {
            console.error('Error calling LLM:', error);
            this.showMessage('Error getting LLM move suggestion', 'error');
            this.aiThinking = false;
            this.updateAIStatus('');
            return null;
        }
    }
}

// Start the game
let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new SimpleCheckers();
}); 