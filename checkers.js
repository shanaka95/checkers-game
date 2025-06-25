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
        this.autoRestartGames = false; // Auto-restart AI vs AI games
        
        // AI Configuration
        this.aiConfig = {
            red: {
                provider: 'anthropic',
                model: 'claude-3-5-sonnet-20240620'
            },
            white: {
                provider: 'anthropic', 
                model: 'claude-3-5-sonnet-20240620'
            }
        };
        
        // Available providers and models
        this.availableProviders = null;
        
        // Preferred models for auto-restart (one player always Anthropic)
        this.preferredModels = {
            anthropic: [
                'claude-3-5-sonnet-20240620',
                'claude-3-haiku-20240307',
                'claude-3-opus-20240229'
            ],
            huggingface: [
                'Qwen/Qwen2.5-72B-Instruct',
                'Qwen/Qwen3-32B',
                'Qwen/Qwen3-14B',
                'Qwen/Qwen3-8B'
            ]
        };
        
        // Move history tracking
        this.moveHistory = [];
        this.fullMoveNumber = 1; // Increments after white moves (like chess)
        
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
    
    /**
     * Randomly configure AI players for auto-restart games
     * One player is always Anthropic, the other can be Anthropic or HuggingFace
     */
    randomizeAIPlayers() {
        // Randomly decide which player gets Anthropic (always one of them)
        const anthropicPlayer = Math.random() < 0.5 ? 'red' : 'white';
        const otherPlayer = anthropicPlayer === 'red' ? 'white' : 'red';
        
        // Configure Anthropic player
        const anthropicModel = this.preferredModels.anthropic[
            Math.floor(Math.random() * this.preferredModels.anthropic.length)
        ];
        this.aiConfig[anthropicPlayer] = {
            provider: 'anthropic',
            model: anthropicModel
        };
        
        // Configure other player (can be Anthropic or HuggingFace)
        const useHuggingFace = Math.random() < 0.5; // 50% chance for HuggingFace
        
        if (useHuggingFace) {
            const hfModel = this.preferredModels.huggingface[
                Math.floor(Math.random() * this.preferredModels.huggingface.length)
            ];
            this.aiConfig[otherPlayer] = {
                provider: 'huggingface',
                model: hfModel
            };
        } else {
            // Use another Anthropic model
            const anthropicModel2 = this.preferredModels.anthropic[
                Math.floor(Math.random() * this.preferredModels.anthropic.length)
            ];
            this.aiConfig[otherPlayer] = {
                provider: 'anthropic',
                model: anthropicModel2
            };
        }
        
        console.log('Randomized AI config:', {
            [anthropicPlayer]: this.aiConfig[anthropicPlayer],
            [otherPlayer]: this.aiConfig[otherPlayer]
        });
        
        // Update the UI to reflect the new configuration
        this.updateAIConfigUI();
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
    
    async init() {
        this.setupEvents();
        // Load available providers from backend
        await this.loadAvailableProviders();
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
        document.getElementById('checkerboard').addEventListener('click', async (e) => {
            if (this.gameOver || this.aiThinking) return;
            
            const square = e.target.closest('.checker-cell');
            if (!square) return;
            
            const row = parseInt(square.dataset.row);
            const col = parseInt(square.dataset.col);
            
            await this.handleClick(row, col);
        });
        
        // Mode selection events
        document.getElementById('mode-human-vs-ai').addEventListener('click', () => this.setGameMode('human-vs-ai'));
        document.getElementById('mode-ai-vs-ai').addEventListener('click', () => this.setGameMode('ai-vs-ai'));
        document.getElementById('mode-human-vs-human').addEventListener('click', () => this.setGameMode('human-vs-human'));
        
        // Game control events
        document.getElementById('new-game').addEventListener('click', () => this.newGame());
        document.getElementById('get-llm-move').addEventListener('click', () => this.getLLMMove());
        document.getElementById('toggle-autorun').addEventListener('click', () => this.toggleAutorun());
        document.getElementById('offer-draw').addEventListener('click', async () => await this.offerDraw());
        document.getElementById('resign').addEventListener('click', async () => await this.resign());
        document.getElementById('play-again').addEventListener('click', () => this.newGame());
        document.getElementById('close-modal').addEventListener('click', () => this.closeModal());
        
        // AI Configuration events
        document.getElementById('red-provider').addEventListener('change', (e) => this.updateAIConfig('red', 'provider', e.target.value));
        document.getElementById('red-model').addEventListener('change', (e) => this.updateAIConfig('red', 'model', e.target.value));
        document.getElementById('white-provider').addEventListener('change', (e) => this.updateAIConfig('white', 'provider', e.target.value));
        document.getElementById('white-model').addEventListener('change', (e) => this.updateAIConfig('white', 'model', e.target.value));
        
        // Auto-restart checkbox event
        document.getElementById('auto-restart-games').addEventListener('change', (e) => {
            this.autoRestartGames = e.target.checked;
            console.log('Auto-restart games:', this.autoRestartGames ? 'enabled' : 'disabled');
        });
    }
    
    async handleClick(row, col) {
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
                await this.makeMove(this.selectedPiece.row, this.selectedPiece.col, row, col);
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
    
    async makeMove(fromRow, fromCol, toRow, toCol) {
        const piece = this.board[fromRow][fromCol];
        let move = this.validMoves.find(m => m.row === toRow && m.col === toCol);
        
        // If move not found in validMoves, try to determine it manually
        if (!move) {
            // Get valid moves for this piece to find the move details
            const pieceMoves = this.getValidMoves(fromRow, fromCol);
            move = pieceMoves.find(m => m.row === toRow && m.col === toCol);
        }
        
        // Record the move before making it
        const moveRecord = {
            fullMoveNumber: this.fullMoveNumber,
            player: this.currentPlayer,
            from: {
                row: fromRow,
                col: fromCol,
                notation: this.positionToNotation(fromRow, fromCol)
            },
            to: {
                row: toRow,
                col: toCol,
                notation: this.positionToNotation(toRow, toCol)
            },
            piece: {
                color: piece.color,
                isKing: piece.isKing,
                wasPromoted: false
            },
            isJump: move ? move.isJump : false,
            capturedPiece: null,
            timestamp: new Date().toISOString()
        };
        
        // Move piece
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;
        
        // Handle capture
        if (move && move.isJump) {
            const capturedPiece = this.board[move.jumpRow][move.jumpCol];
            moveRecord.capturedPiece = {
                row: move.jumpRow,
                col: move.jumpCol,
                notation: this.positionToNotation(move.jumpRow, move.jumpCol),
                color: capturedPiece.color,
                isKing: capturedPiece.isKing
            };
            
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
                moveRecord.piece.wasPromoted = true;
                this.showMessage(`${piece.color} piece promoted to King!`, 'warning');
            }
        }
        
        // Add move to history
        this.moveHistory.push(moveRecord);
        
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
        await this.checkGameOver();
    }
    
    switchPlayer() {
        this.currentPlayer = this.currentPlayer === 'red' ? 'white' : 'red';
        
        // Increment full move number after white moves (like chess notation)
        if (this.currentPlayer === 'red') {
            this.fullMoveNumber++;
        }
        
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
        messageEl.className = `text-center text-gray-300 mb-6 text-lg font-medium message ${type}`;
    }
    
    async checkGameOver() {
        if (this.redPieces === 0) {
            await this.endGame('White wins! All red pieces captured.');
        } else if (this.whitePieces === 0) {
            await this.endGame('Red wins! All white pieces captured.');
        } else if (!this.hasValidMoves()) {
            const winner = this.currentPlayer === 'red' ? 'White' : 'Red';
            await this.endGame(`${winner} wins! ${this.currentPlayer} has no valid moves.`);
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
    
    async endGame(message) {
        this.gameOver = true;
        this.autorunActive = false;
        this.aiThinking = false;
        this.clearSelection();
        this.showMessage('Game Over', 'error');
        this.updateAIStatus('Game finished');
        
        // Determine the winner from the message and update the database
        await this.updateGameResults(message);
        
        // Check if auto-restart is enabled for AI vs AI games
        if (this.autoRestartGames && this.gameMode === 'ai-vs-ai') {
            console.log('Auto-restarting AI vs AI game with randomized players...');
            this.showMessage('Game finished! Auto-restarting with new AI configuration...', 'info');
            
            // Wait a moment to show the message
            setTimeout(() => {
                this.autoRestartGame();
            }, 2000);
        } else {
            // Show the normal game over modal
            this.showModal(message);
        }
    }
    
    /**
     * Auto-restart a new AI vs AI game with randomized players
     */
    autoRestartGame() {
        // Randomize AI player configurations
        this.randomizeAIPlayers();
        
        // Initialize a new game
        this.board = this.createBoard();
        this.currentPlayer = 'red';
        this.selectedPiece = null;
        this.validMoves = [];
        this.gameOver = false;
        this.redPieces = 12;
        this.whitePieces = 12;
        this.aiThinking = false;
        
        // Reset move history
        this.moveHistory = [];
        this.fullMoveNumber = 1;
        
        // Generate new game ID
        this.gameId = this.generateGameId();
        console.log('Auto-restarted game with ID:', this.gameId);
        
        // Update the board and UI
        this.renderBoard();
        this.updateStatus();
        
        // Start autorun immediately
        this.startAutorun();
    }

    /**
     * Log the game winner to the database
     */
    async updateGameResults(endGameMessage) {
        try {
            // Extract winner from the end game message
            let winnerColor = null;
            
            if (endGameMessage.includes('Red wins') || endGameMessage.includes('red wins')) {
                winnerColor = 'red';
            } else if (endGameMessage.includes('White wins') || endGameMessage.includes('white wins')) {
                winnerColor = 'white';
            } else if (endGameMessage.includes('draw') || endGameMessage.includes('Draw')) {
                // Handle draws - we'll skip database update for now since our schema expects a winner
                console.log('Game ended in a draw - skipping database update');
                return;
            }
            
            if (!winnerColor) {
                console.error('Could not determine winner from message:', endGameMessage);
                return;
            }
            
            // Determine if winner is human or AI based on game mode
            let winnerType, winnerProvider, winnerModel;
            
            if (this.gameMode === 'human-vs-human') {
                winnerType = 'human';
                winnerProvider = null;
                winnerModel = null;
            } else if (this.gameMode === 'ai-vs-ai') {
                // Both players are AI, get the winner's config
                winnerType = 'ai';
                winnerProvider = this.aiConfig[winnerColor].provider;
                winnerModel = this.aiConfig[winnerColor].model;
            } else if (this.gameMode === 'human-vs-ai') {
                // Check if the winner is the human or AI player
                if (winnerColor === this.humanPlayer) {
                    winnerType = 'human';
                    winnerProvider = null;
                    winnerModel = null;
                } else {
                    winnerType = 'ai';
                    const aiColor = this.humanPlayer === 'red' ? 'white' : 'red';
                    winnerProvider = this.aiConfig[aiColor].provider;
                    winnerModel = this.aiConfig[aiColor].model;
                }
            }
            
            console.log(`Game ${this.gameId} finished. Winner: ${winnerColor} (${winnerType})`);
            if (winnerType === 'ai') {
                console.log(`AI Winner: ${winnerProvider}/${winnerModel}`);
            }
            
            // Prepare winner logging request
            const winnerData = {
                game_id: this.gameId,
                winner_color: winnerColor,
                winner_type: winnerType,
                total_moves: this.moveHistory.length,
                finish_reason: this.getFinishReason(endGameMessage)
            };
            
            // Add AI-specific data if winner is AI
            if (winnerType === 'ai') {
                winnerData.provider = winnerProvider;
                winnerData.model = winnerModel;
            }
            
            // Call the log-winner endpoint
            const response = await fetch('http://localhost:8000/log-winner', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(winnerData)
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('Game winner logged in database:', result);
                this.showMessage(`Game winner logged successfully`, 'success');
            } else {
                const error = await response.text();
                console.error('Failed to log game winner:', error);
                this.showMessage('Failed to save game winner to database', 'warning');
            }
            
        } catch (error) {
            console.error('Error logging game winner:', error);
            this.showMessage('Error saving game winner', 'warning');
        }
    }
    
    /**
     * Determine the finish reason based on the end game message
     */
    getFinishReason(endGameMessage) {
        if (endGameMessage.includes('resignation')) {
            return 'resignation';
        } else if (endGameMessage.includes('draw')) {
            return 'draw';
        } else if (endGameMessage.includes('no valid moves')) {
            return 'no_moves';
        } else if (endGameMessage.includes('captured all')) {
            return 'capture_all';
        } else {
            return 'unknown';
        }
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
        const autoRestartContainer = document.getElementById('auto-restart-container');
        
        switch(this.gameMode) {
            case 'human-vs-ai':
                const humanColor = this.humanPlayer.charAt(0).toUpperCase() + this.humanPlayer.slice(1);
                modeText.textContent = `Human vs AI (You: ${humanColor})`;
                modeIcon.textContent = 'psychology';
                modeIcon.className = 'material-icons-outlined text-blue-400 text-3xl';
                getLLMBtn.style.display = 'flex';
                autorunBtn.style.display = 'none';
                autoRestartContainer.style.display = 'none';
                break;
            case 'ai-vs-ai':
                modeText.textContent = 'AI vs AI (Autorun)';
                modeIcon.textContent = 'smart_toy';
                modeIcon.className = 'material-icons-outlined text-purple-400 text-3xl';
                getLLMBtn.style.display = 'none';
                autorunBtn.style.display = 'flex';
                autoRestartContainer.style.display = 'block';
                break;
            case 'human-vs-human':
                modeText.textContent = 'Human vs Human';
                modeIcon.textContent = 'people';
                modeIcon.className = 'material-icons-outlined text-green-400 text-3xl';
                getLLMBtn.style.display = 'flex';
                autorunBtn.style.display = 'none';
                autoRestartContainer.style.display = 'none';
                break;
        }
        
        // Update AI configuration UI
        this.updateAIConfigUI();
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
        
        // Reset move history
        this.moveHistory = [];
        this.fullMoveNumber = 1;
        
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
        
        // Reset move history
        this.moveHistory = [];
        this.fullMoveNumber = 1;
        
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
    
    async offerDraw() {
        if (this.gameOver) return;
        
        if (confirm(`${this.currentPlayer} offers a draw. Do you accept?`)) {
            await this.endGame('Game ended in a draw by agreement.');
        }
    }
    
    async resign() {
        if (this.gameOver) return;
        
            const winner = this.currentPlayer === 'red' ? 'White' : 'Red';
        if (confirm(`Are you sure you want to resign? ${winner} will win.`)) {
            await this.endGame(`${winner} wins by resignation!`);
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
        
        // Create a board string with coordinate labels for better AI understanding
        const files = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        let boardString = '  ' + files.join(' ') + '\n'; // Column headers
        
        boardString += this.board.map((row, rowIndex) => {
            const rank = 8 - rowIndex; // Row numbers (8 to 1)
            const rowString = row.map((cell, colIndex) => {
                // Only use dark squares (where pieces can be)
                if ((rowIndex + colIndex) % 2 === 0) return ' '; // Light square
                if (cell === null) return '.'; // Empty dark square
                return cell.color === 'red' ? (cell.isKing ? 'R' : 'r') : (cell.isKing ? 'W' : 'w');
            }).join(' ');
            return rank + ' ' + rowString;
        }).join('\n');
        
        console.log('Generated board string with notation:', boardString);
        
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
        
        // Format move history for AI analysis
        const formattedMoveHistory = this.moveHistory.map((move, index) => {
            // Create proper checkers notation
            let moveNotation;
            
            if (move.isJump) {
                // For captures: from x captured_piece
                moveNotation = `${move.from.notation}x${move.capturedPiece.notation}`;
            } else {
                // For regular moves: from-to
                moveNotation = `${move.from.notation}-${move.to.notation}`;
            }
            
            // Add promotion notation
            if (move.piece.wasPromoted) {
                moveNotation += '=K';
            }
            
            return {
                moveNumber: index + 1,
                fullMoveNumber: move.fullMoveNumber,
                player: move.player,
                notation: moveNotation,
                from: move.from.notation,
                to: move.to.notation,
                isJump: move.isJump,
                capturedPiece: move.capturedPiece ? move.capturedPiece.notation : null,
                wasPromoted: move.piece.wasPromoted,
                timestamp: move.timestamp,
                // Add descriptive text for UI display
                description: `${move.player === 'red' ? 'Red' : 'White'}: ${moveNotation}`
            };
        });

        return {
            // Game state
            currentPlayer: this.currentPlayer,
            gameOver: this.gameOver,
            turnNumber: this.calculateTurnNumber(),
            fullMoveNumber: this.fullMoveNumber,
            
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
            lastMove: this.moveHistory.length > 0 ? this.moveHistory[this.moveHistory.length - 1] : null,
            gamePhase: this.determineGamePhase(),
            
            // Move history
            moveHistory: formattedMoveHistory,
            totalMoves: this.moveHistory.length,
            
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
     * Load available AI providers and models from backend
     */
    async loadAvailableProviders() {
        try {
            const response = await fetch('http://localhost:8000/providers');
            const data = await response.json();
            this.availableProviders = data;
            this.updateProviderUI();
        } catch (error) {
            console.error('Error loading providers:', error);
            // Use fallback configuration if backend is not available
            this.availableProviders = {
                available_providers: ['anthropic', 'huggingface'],
                provider_details: {
                    anthropic: { 
                        default_model: 'claude-3-5-sonnet-20240620',
                        description: 'Claude models from Anthropic'
                    },
                    huggingface: { 
                        default_model: 'Qwen/Qwen2.5-72B-Instruct',
                        description: 'Open source models via Hugging Face'
                    }
                }
            };
            this.updateProviderUI();
        }
    }

    /**
     * Update provider and model dropdowns in UI
     */
    updateProviderUI() {
        if (!this.availableProviders) return;

        const providers = this.availableProviders.available_providers || [];
        const providerDetails = this.availableProviders.provider_details || {};

        // Update provider dropdowns
        ['red', 'white'].forEach(color => {
            const providerSelect = document.getElementById(`${color}-provider`);
            const modelSelect = document.getElementById(`${color}-model`);
            
            if (providerSelect && modelSelect) {
                // Clear existing options
                providerSelect.innerHTML = '';
                
                // Add provider options
                providers.forEach(provider => {
                    const option = document.createElement('option');
                    option.value = provider;
                    option.textContent = this.getProviderDisplayName(provider);
                    providerSelect.appendChild(option);
                });
                
                // Set default provider
                providerSelect.value = this.aiConfig[color].provider;
                
                // Update models for current provider
                this.updateModelOptions(color, this.aiConfig[color].provider);
            }
        });
    }

    /**
     * Get display name for provider
     */
    getProviderDisplayName(provider) {
        const displayNames = {
            anthropic: 'Anthropic (Claude)',
            huggingface: 'Hugging Face',
            openai: 'OpenAI (GPT)'
        };
        return displayNames[provider] || provider;
    }

    /**
     * Update model options based on selected provider
     */
    updateModelOptions(color, provider) {
        const modelSelect = document.getElementById(`${color}-model`);
        if (!modelSelect || !this.availableProviders) return;

        // Clear existing options
        modelSelect.innerHTML = '';

        // Define available models for each provider
        const availableModels = {
            anthropic: [
                { value: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet' },
                { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku (Fast)' },
                { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus (Most Capable)' }
            ],
            huggingface: [
                // Qwen Models
                { value: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 72B (Default)' },
                { value: 'Qwen/Qwen3-235B-A22B', label: 'Qwen 3 235B' },
                { value: 'Qwen/Qwen3-32B', label: 'Qwen 3 32B' },
                { value: 'Qwen/Qwen3-30B-A3B', label: 'Qwen 3 30B' },
                { value: 'Qwen/Qwen3-14B', label: 'Qwen 3 14B' },
                { value: 'Qwen/Qwen3-8B', label: 'Qwen 3 8B' },
                { value: 'Qwen/Qwen3-4B', label: 'Qwen 3 4B' },
                // Mistral Models
                { value: 'mistralai/Mistral-Small-3.1-24B-Instruct-2503', label: 'Mistral Small 3.1 24B' },
                { value: 'mistralai/Mistral-Small-24B-Instruct-2501', label: 'Mistral Small 24B' },
                { value: 'mistralai/Magistral-Small-2506', label: 'Magistral Small' },
                { value: 'mistralai/Mixtral-8x7B-Instruct-v0.1', label: 'Mixtral 8x7B' },
                // Other Models
                { value: 'meta-llama/Llama-3.1-70B-Instruct', label: 'Llama 3.1 70B' },
                { value: 'microsoft/DialoGPT-medium', label: 'DialoGPT Medium' }
            ]
        };

        const models = availableModels[provider] || [
            { value: this.availableProviders.provider_details[provider]?.default_model || 'default-model', 
              label: 'Default Model' }
        ];

        // Add model options
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.value;
            option.textContent = model.label;
            modelSelect.appendChild(option);
        });

        // Set current model or default
        const currentModel = this.aiConfig[color].model;
        const modelExists = models.some(m => m.value === currentModel);
        modelSelect.value = modelExists ? currentModel : models[0].value;
        
        // Update config if model changed
        if (!modelExists) {
            this.aiConfig[color].model = models[0].value;
        }
    }

    /**
     * Update AI configuration
     */
    updateAIConfig(color, setting, value) {
        this.aiConfig[color][setting] = value;
        
        // If provider changed, update model options
        if (setting === 'provider') {
            this.updateModelOptions(color, value);
            // Set to default model for new provider
            const defaultModel = this.availableProviders?.provider_details[value]?.default_model;
            if (defaultModel) {
                this.aiConfig[color].model = defaultModel;
                document.getElementById(`${color}-model`).value = defaultModel;
            }
        }
        
        console.log(`Updated ${color} AI: ${setting} = ${value}`, this.aiConfig[color]);
    }

    /**
     * Show/hide AI configuration UI based on game mode
     */
    updateAIConfigUI() {
        const aiConfigPanel = document.getElementById('ai-config');
        const redAIConfig = document.getElementById('red-ai-config');
        const whiteAIConfig = document.getElementById('white-ai-config');
        
        if (!aiConfigPanel || !redAIConfig || !whiteAIConfig) return;

        let showRedAI = false;
        let showWhiteAI = false;

        switch (this.gameMode) {
            case 'human-vs-ai':
                // Show AI config for non-human player
                showRedAI = this.humanPlayer !== 'red';
                showWhiteAI = this.humanPlayer !== 'white';
                break;
            case 'ai-vs-ai':
                // Show both AI configs
                showRedAI = true;
                showWhiteAI = true;
                break;
            case 'human-vs-human':
            case 'select':
            default:
                // Hide AI config
                break;
        }

        // Show/hide the entire AI config panel
        const showPanel = showRedAI || showWhiteAI;
        aiConfigPanel.style.display = showPanel ? 'block' : 'none';
        
        // Show/hide individual player configs
        redAIConfig.style.display = showRedAI ? 'block' : 'none';
        whiteAIConfig.style.display = showWhiteAI ? 'block' : 'none';
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
            
            // Get AI configuration for current player
            const aiConfig = this.aiConfig[this.currentPlayer];
            
            const response = await fetch('http://localhost:8000/predict-move', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    board_state: boardState,
                    game_id: this.gameId,
                    provider: aiConfig.provider,
                    model: aiConfig.model
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
                    setTimeout(async () => {
                        // First select the piece to set up validMoves
                        this.selectPiece(fromPos.row, fromPos.col);
                        
                        // Then make the move
                        await this.makeMove(fromPos.row, fromPos.col, toPos.row, toPos.col);
                        
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
document.addEventListener('DOMContentLoaded', async () => {
    game = new SimpleCheckers();
    // Note: init() is already called in constructor, but it's async now
}); 