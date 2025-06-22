class SimpleCheckers {
    constructor() {
        this.board = this.createBoard();
        this.currentPlayer = 'red';
        this.selectedPiece = null;
        this.validMoves = [];
        this.gameOver = false;
        this.redPieces = 12;
        this.whitePieces = 12;
        
        this.init();
    }
    
    createBoard() {
        const board = Array(8).fill(null).map(() => Array(8).fill(null));
        
        // Place red pieces (top 3 rows)
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 8; col++) {
                if ((row + col) % 2 === 1) {
                    board[row][col] = { color: 'red', isKing: false };
                }
            }
        }
        
        // Place white pieces (bottom 3 rows)
        for (let row = 5; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                if ((row + col) % 2 === 1) {
                    board[row][col] = { color: 'white', isKing: false };
                }
            }
        }
        
        return board;
    }
    
    init() {
        this.renderBoard();
        this.updateStatus();
        this.setupEvents();
    }
    
    renderBoard() {
        const boardEl = document.getElementById('checkerboard');
        boardEl.innerHTML = '';
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = document.createElement('div');
                square.className = `square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
                square.dataset.row = row;
                square.dataset.col = col;
                
                const piece = this.board[row][col];
                if (piece) {
                    const pieceEl = document.createElement('div');
                    pieceEl.className = `piece ${piece.color}`;
                    if (piece.isKing) pieceEl.classList.add('king');
                    square.appendChild(pieceEl);
                }
                
                boardEl.appendChild(square);
            }
        }
        
        this.updatePieceCounts();
    }
    
    setupEvents() {
        document.getElementById('checkerboard').addEventListener('click', (e) => {
            if (this.gameOver) return;
            
            const square = e.target.closest('.square');
            if (!square) return;
            
            const row = parseInt(square.dataset.row);
            const col = parseInt(square.dataset.col);
            
            this.handleClick(row, col);
        });
        
        document.getElementById('new-game').addEventListener('click', () => this.newGame());
        document.getElementById('offer-draw').addEventListener('click', () => this.offerDraw());
        document.getElementById('resign').addEventListener('click', () => this.resign());
        document.getElementById('play-again').addEventListener('click', () => this.newGame());
        document.getElementById('close-modal').addEventListener('click', () => this.closeModal());
    }
    
    handleClick(row, col) {
        const piece = this.board[row][col];
        
        if (this.selectedPiece) {
            // Try to move
            if (this.isValidMove(row, col)) {
                this.makeMove(this.selectedPiece.row, this.selectedPiece.col, row, col);
                this.clearSelection();
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
        document.querySelectorAll('.piece').forEach(p => p.classList.remove('selected'));
        document.querySelectorAll('.square').forEach(s => s.classList.remove('valid-move'));
    }
    
    highlightPiece(row, col) {
        const square = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        const piece = square.querySelector('.piece');
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
        const move = this.validMoves.find(m => m.row === toRow && m.col === toCol);
        
        // Move piece
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;
        
        // Handle capture
        if (move.isJump) {
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
        if (move.isJump) {
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
        
        redPlayer.classList.toggle('current', this.currentPlayer === 'red');
        whitePlayer.classList.toggle('current', this.currentPlayer === 'white');
        
        if (!this.gameOver) {
            this.showMessage(`${this.currentPlayer} player's turn`);
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
    
    endGame(message) {
        this.gameOver = true;
        this.clearSelection();
        this.showMessage('Game Over', 'error');
        this.showModal(message);
    }
    
    showModal(message) {
        document.getElementById('game-over-message').textContent = message;
        document.getElementById('game-over-modal').style.display = 'block';
    }
    
    closeModal() {
        document.getElementById('game-over-modal').style.display = 'none';
    }
    
    newGame() {
        this.board = this.createBoard();
        this.currentPlayer = 'red';
        this.selectedPiece = null;
        this.validMoves = [];
        this.gameOver = false;
        this.redPieces = 12;
        this.whitePieces = 12;
        
        this.closeModal();
        this.renderBoard();
        this.updateStatus();
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
}

// Start the game
let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new SimpleCheckers();
}); 