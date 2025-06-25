import os
import json
import sqlite3
import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from ai_providers import create_ai_provider, AIProviderFactory

app = FastAPI(title="Checkers AI API", description="FastAPI backend for checkers move prediction")

# Add CORS middleware to allow requests from your frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database setup
DATABASE_PATH = "checkers_game_data.db"

def init_database():
    """Initialize the SQLite database and create tables if they don't exist"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    # Game moves table with provider and model information
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS game_moves (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id TEXT NOT NULL,
            player TEXT NOT NULL,
            move_number INTEGER NOT NULL,
            timestamp TEXT NOT NULL,
            user_prompt TEXT NOT NULL,
            llm_analysis TEXT NOT NULL,
            tool_name TEXT,
            tool_parameters TEXT,
            previous_moves TEXT,
            board_state TEXT NOT NULL,
            provider TEXT,
            model TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Game winners table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS game_winners (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id TEXT NOT NULL UNIQUE,
            winner_color TEXT NOT NULL,
            winner_type TEXT NOT NULL,  -- 'human' or 'ai'
            provider TEXT,              -- NULL if human, provider name if AI
            model TEXT,                 -- NULL if human, model name if AI
            game_duration_seconds INTEGER,
            total_moves INTEGER,
            finish_reason TEXT,         -- 'capture_all', 'resignation', 'draw', etc.
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    conn.commit()
    conn.close()

def save_move_to_db(game_id: str, player: str, move_number: int, user_prompt: str, 
                   llm_analysis: str, tool_name: str = None, tool_parameters: str = None, 
                   previous_moves: str = "", board_state: str = "", provider: str = None, model: str = None):
    """Save move data to the database"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    timestamp = datetime.datetime.now().isoformat()
    
    cursor.execute("""
        INSERT INTO game_moves 
        (game_id, player, move_number, timestamp, user_prompt, llm_analysis, 
         tool_name, tool_parameters, previous_moves, board_state, provider, model)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (game_id, player, move_number, timestamp, user_prompt, llm_analysis,
          tool_name, tool_parameters, previous_moves, board_state, provider, model))
    
    conn.commit()
    conn.close()

def save_game_winner(game_id: str, winner_color: str, winner_type: str, provider: str = None, 
                    model: str = None, game_duration_seconds: int = None, total_moves: int = None, 
                    finish_reason: str = "unknown"):
    """Save game winner information to the database"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            INSERT INTO game_winners 
            (game_id, winner_color, winner_type, provider, model, game_duration_seconds, total_moves, finish_reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (game_id, winner_color, winner_type, provider, model, game_duration_seconds, total_moves, finish_reason))
        
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        # Game already recorded
        return False
    finally:
        conn.close()

# Initialize database on startup
init_database()

# Default AI provider configuration (used as fallbacks)
DEFAULT_PROVIDER = "anthropic"
DEFAULT_MODEL = "claude-3-5-sonnet-20240620"

# Define available tool
def make_move(from_position: str, to_position: str, game_id: str = "unknown") -> str:
    """
    Make a move in the checkers game.
    
    Args:
        from_position: Starting position in notation (e.g., "C3")
        to_position: Destination position in notation (e.g., "D4")
        game_id: Unique game session identifier
    
    Returns:
        Confirmation message
    """

    return f"Move executed: {from_position} -> {to_position}"

# Tool registry
AVAILABLE_TOOLS = {
    "move": make_move
}

# Tool definition for Claude (Anthropic format)
TOOL_DEFINITIONS = [
    {
        "name": "move",
        "description": "Make a move in the checkers game. Call this tool when you want to execute a move.",
        "input_schema": {
            "type": "object",
            "properties": {
                "from_position": {
                    "type": "string",
                    "description": "Starting position in algebraic notation (e.g., 'C3', 'E5')"
                },
                "to_position": {
                    "type": "string",
                    "description": "Destination position in algebraic notation (e.g., 'D4', 'F6')"
                }
            },
            "required": ["from_position", "to_position"]
        }
    }
]

def execute_tool_call(tool_name: str, arguments: Dict[str, Any], game_id: str = "unknown") -> Any:
    """Execute a tool call with the given arguments"""
    if tool_name not in AVAILABLE_TOOLS:
        raise ValueError(f"Unknown tool: {tool_name}")
    
    tool_function = AVAILABLE_TOOLS[tool_name]
    try:
        # Add game_id to arguments if it's the move tool
        if tool_name == "move":
            arguments = arguments.copy()
            arguments["game_id"] = game_id
        
        result = tool_function(**arguments)
        return result
    except Exception as e:
        return f"Error executing tool: {str(e)}"

# Note: Tool call parsing is now handled by the AI provider classes

# Pydantic models for move prediction
class PredictMoveRequest(BaseModel):
    board_state: Dict[str, Any]
    game_id: Optional[str] = None
    provider: str  # Required: frontend must specify provider
    model: str     # Required: frontend must specify model

class PredictMoveResponse(BaseModel):
    analysis: str
    suggested_move: Dict[str, str] = {}
    reasoning: str = ""
    tool_calls: List[Dict[str, Any]] = []
    tool_results: List[Dict[str, Any]] = []

# Pydantic models for game winner logging
class LogWinnerRequest(BaseModel):
    game_id: str
    winner_color: str  # "red" or "white"
    winner_type: str   # "human" or "ai"
    provider: Optional[str] = None      # Required if winner_type is "ai"
    model: Optional[str] = None         # Required if winner_type is "ai"
    game_duration_seconds: Optional[int] = None
    total_moves: Optional[int] = None
    finish_reason: Optional[str] = "unknown"  # e.g., "capture_all", "resignation", "draw"

class LogWinnerResponse(BaseModel):
    message: str
    game_id: str
    winner_info: Dict[str, Any]

@app.get("/")
async def root():
    """Health check endpoint"""
    available_providers = AIProviderFactory.get_available_providers()
    return {
        "message": "Checkers AI API is running with per-request provider selection", 
        "available_endpoints": ["/predict-move", "/log-winner", "/providers"],
        "available_providers": available_providers,
        "note": "Each request must specify 'provider' and 'model' parameters"
    }

@app.post("/predict-move", response_model=PredictMoveResponse)
async def predict_next_move(request: PredictMoveRequest):
    """
    Analyze checkers board state and predict the best move using AI provider with tool calling
    """
    try:
        # Validate provider is available
        available_providers = AIProviderFactory.get_available_providers()
        if request.provider not in available_providers:
            raise HTTPException(
                status_code=400, 
                detail=f"Provider '{request.provider}' not available. Available providers: {available_providers}"
            )
        
        # Create AI provider based on request
        current_provider = create_ai_provider(
            provider_name=request.provider,
            model=request.model
        )
        
        # Log game ID for tracking
        game_id = request.game_id or "unknown"
        print(f"[Game {game_id}] Processing move prediction request with {current_provider.get_provider_name()} provider (model: {request.model})")
        
        board_state = request.board_state
        current_player = board_state.get("currentPlayer", "unknown")
        available_moves = board_state.get("availableMoves", [])
        # Use the actual move history length + 1 for the next move number
        move_history = board_state.get("moveHistory", [])
        move_number = len(move_history) + 1
        
        print(f"[Game {game_id}] Current player: {current_player}, Available moves: {len(available_moves)}")
        
        # Create an optimized system message for competitive checkers play
        system_message = """You are an expert AI playing competitive American Checkers. Your goal is to win by making optimal moves. Analyze the given position and select the best move based on the following information:

Analysis Process:
1. Evaluate the current board state, considering piece count, positions, and potential king promotions.
2. Analyze the move history to identify patterns, tactical themes, and opponent tendencies.
3. Assess immediate tactics, including mandatory jumps, threats, and piece safety.
4. Consider positional factors such as center control, piece activity, and mobility.
5. Develop a strategic plan, focusing on king promotion opportunities and long-term objectives.
6. Anticipate opponent's likely responses to your potential moves.

Decision-Making and Strategy:
1. If jumps are available, you MUST take the best jump. Consider multiple jump sequences if possible.
2. If no jumps are available, prioritize moves that:
   a. Control the center squares
   b. Develop pieces safely
   c. Create opportunities for king promotion
   d. Protect your pieces and create threats to opponent's pieces
3. Plan 2-3 moves ahead when possible, considering both offensive and defensive strategies.
4. Adapt your strategy based on the game phase:
   - Opening (turns 1-10): Focus on center control and safe development
   - Midgame (turns 11-30): Create tactical opportunities and advance for kings
   - Endgame (30+ turns): Calculate precisely and force opponent into unfavorable positions
5. Play aggressively but safely, maximizing winning chances while minimizing risks.

Move Execution:
Select the best move from the available moves list. Consider how this move will impact the board state, your strategic position, and your opponent's options.

Output your analysis, strategic reasoning, and chosen move in the following format:

<analysis>
Provide a detailed analysis of the current position, including material count, positional advantages/disadvantages, and key tactical considerations.
</analysis>

<strategy>
Explain your strategic plan for the next few moves, considering both offensive and defensive elements.
</strategy>

<move_selection>
State your chosen move and provide a comprehensive justification for why this move is optimal given the current game state and your strategic goals.
</move_selection>

<move_execution>
Execute your chosen move using the exact notation format: from_position="X1", to_position="Y2"
</move_execution>

Your final output should include all the reasoning data"""

        # Create optimized prompt with concise board analysis
        moves_list = []
        jump_moves = []
        regular_moves = []
        
        for move in available_moves:
            move_notation = f"{move['from']['notation']}-{move['to']['notation']}"
            if move.get("isJump"):
                jump_moves.append(move_notation)
            else:
                regular_moves.append(move_notation)
        
        # Format moves compactly
        if jump_moves:
            moves_text = f"JUMPS (mandatory): {', '.join(jump_moves)}"
        elif regular_moves:
            moves_text = f"Available: {', '.join(regular_moves)}"
        else:
            moves_text = "No moves available"
        
        # Get strategic context based on game phase
        phase = board_state.get('gamePhase', 'unknown')
        turn = board_state.get('turnNumber', 0)
        
        if phase == 'opening' and turn <= 10:
            strategy_hint = "Opening: Control center, develop pieces safely"
        elif phase == 'midgame' or (10 < turn <= 30):
            strategy_hint = "Midgame: Seek tactical opportunities, advance for kings"
        else:
            strategy_hint = "Endgame: Calculate precisely, coordinate pieces"
        
        # Compact piece analysis
        red_total = board_state.get('pieceCount', {}).get('red', {}).get('total', 0)
        white_total = board_state.get('pieceCount', {}).get('white', {}).get('total', 0)
        red_kings = board_state.get('pieceCount', {}).get('red', {}).get('kings', 0)
        white_kings = board_state.get('pieceCount', {}).get('white', {}).get('kings', 0)
        
        material_balance = "Even" if red_total == white_total else f"{'Red' if red_total > white_total else 'White'} +{abs(red_total - white_total)}"
        
        # Format move history for the prompt
        move_history = board_state.get('moveHistory', [])
        total_moves = board_state.get('totalMoves', 0)
        
        if move_history:
            # Show last 12 moves to avoid overwhelming the prompt
            recent_moves = move_history[-12:] if len(move_history) > 12 else move_history
            
            # Format moves with clear player indication and better grouping
            formatted_moves = []
            current_move_pair = ""
            
            for i, move in enumerate(recent_moves):
                player_indicator = "Red" if move['player'] == 'red' else "White"
                move_str = f"{move['from']}-{move['to']}"
                
                # Add capture notation
                if move.get('isJump') and move.get('capturedPiece'):
                    move_str = f"{move['from']}x{move['capturedPiece']}"
                
                # Add promotion notation
                if move.get('wasPromoted'):
                    move_str += "=K"
                
                # Group moves by full move number (Red + White = 1 full move)
                if move['player'] == 'red':
                    current_move_pair = f"{move['fullMoveNumber']}. {move_str}"
                else:  # white
                    if current_move_pair:
                        current_move_pair += f" {move_str}"
                        formatted_moves.append(current_move_pair)
                        current_move_pair = ""
                    else:
                        # White move without preceding red move (shouldn't normally happen)
                        formatted_moves.append(f"{move['fullMoveNumber']}... {move_str}")
            
            # Add any remaining unpaired red move
            if current_move_pair:
                formatted_moves.append(current_move_pair)
            
            # Create the history text
            if len(move_history) > 12:
                history_text = f"MOVE HISTORY (last 12 of {total_moves} moves):\n"
            else:
                history_text = f"MOVE HISTORY ({total_moves} moves):\n"
            
            # Format in lines of 3 move pairs for readability
            move_lines = []
            for i in range(0, len(formatted_moves), 3):
                line_moves = formatted_moves[i:i+3]
                move_lines.append(" ".join(line_moves))
            
            history_text += "\n".join(move_lines)
            
            # Add last move summary for context
            last_move = recent_moves[-1]
            last_player = "Red" if last_move['player'] == 'red' else "White"
            last_move_desc = f"{last_move['from']}-{last_move['to']}"
            if last_move.get('isJump'):
                last_move_desc = f"{last_move['from']}x{last_move.get('capturedPiece', '?')}"
            if last_move.get('wasPromoted'):
                last_move_desc += " (promoted to King)"
            
            history_text += f"\nLAST MOVE: {last_player} played {last_move_desc}"
            
        else:
            history_text = "GAME START: No moves played yet - opening position"
        
        analysis_prompt = f"""Position Analysis - {current_player.title()} to move (Turn {turn})

BOARD:
{board_state.get('boardString', 'Board not available')}

{history_text}

POSITION: {material_balance} material | Red: {red_total}({red_kings}♔) White: {white_total}({white_kings}♔)
MOVES: {moves_text}
STRATEGY: {strategy_hint}

Analyze this position and select your best move. Consider:
• MOVE HISTORY ANALYSIS: What patterns emerge from the game so far? Are there tactical themes, repeated motifs, or strategic plans developing?
• IMMEDIATE TACTICS: Mandatory jumps, threats, piece safety, and forcing moves
• POSITIONAL FACTORS: Center control, piece activity, pawn structure, and mobility
• STRATEGIC PLANNING: King promotion opportunities, piece coordination, and long-term objectives
• OPPONENT TENDENCIES: Based on move history, what is your opponent's playing style and likely next moves?

Execute your chosen move using the move tool with exact notation (e.g., "C3" to "D4")."""

        # Make the AI prediction request
        try:
            ai_response = current_provider.generate_move_prediction(
                system_message=system_message,
                user_prompt=analysis_prompt,
                tools=TOOL_DEFINITIONS
            )
            
            analysis_text = ai_response["text_content"]
            tool_calls = ai_response["tool_calls"]
            
        except Exception as e:
            print(f"{current_provider.get_provider_name()} API call failed: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to get response from {current_provider.get_provider_name()}: {str(e)}")
        
        tool_results = []
        suggested_move = {}
        
        # Execute any detected tool calls
        for tool_call in tool_calls:
            try:
                result = execute_tool_call(tool_call["tool"], tool_call["arguments"], game_id)
                tool_results.append({
                    "tool": tool_call["tool"],
                    "arguments": tool_call["arguments"],
                    "result": result,
                    "id": tool_call.get("id")
                })
                
                # If it's a move tool call, extract the suggested move
                if tool_call["tool"] == "move":
                    suggested_move = {
                        "from": tool_call["arguments"]["from_position"],
                        "to": tool_call["arguments"]["to_position"]
                    }
                    print(f"[Game {game_id}] Suggested move: {suggested_move['from']} → {suggested_move['to']}")
                    
            except Exception as e:
                tool_results.append({
                    "tool": tool_call["tool"],
                    "arguments": tool_call["arguments"],
                    "error": str(e),
                    "id": tool_call.get("id")
                })
        
        # Save move data to database
        try:
            # Prepare data for database storage
            previous_moves_json = json.dumps(board_state.get('moveHistory', []))
            board_state_json = json.dumps(board_state)
            tool_name = tool_calls[0]["tool"] if tool_calls else None
            tool_parameters = json.dumps(tool_calls[0]["arguments"]) if tool_calls else None
            
            save_move_to_db(
                game_id=game_id,
                player=current_player,
                move_number=move_number,
                user_prompt=analysis_prompt,
                llm_analysis=analysis_text,
                tool_name=tool_name,
                tool_parameters=tool_parameters,
                previous_moves=previous_moves_json,
                board_state=board_state_json,
                provider=request.provider,
                model=request.model
            )
            print(f"[Game {game_id}] Move data saved to database with {request.provider}/{request.model}")
        except Exception as e:
            print(f"[Game {game_id}] Failed to save to database: {e}")
        
        return PredictMoveResponse(
            analysis=analysis_text,
            suggested_move=suggested_move,
            reasoning=analysis_text,
            tool_calls=tool_calls,
            tool_results=tool_results
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error predicting move: {str(e)}")

@app.post("/log-winner", response_model=LogWinnerResponse)
async def log_game_winner(request: LogWinnerRequest):
    """
    Log the winner of a completed game
    """
    try:
        game_id = request.game_id
        winner_color = request.winner_color.lower()
        winner_type = request.winner_type.lower()
        
        # Validation
        if winner_color not in ["red", "white"]:
            raise HTTPException(status_code=400, detail="winner_color must be 'red' or 'white'")
        
        if winner_type not in ["human", "ai"]:
            raise HTTPException(status_code=400, detail="winner_type must be 'human' or 'ai'")
        
        if winner_type == "ai" and (not request.provider or not request.model):
            raise HTTPException(status_code=400, detail="provider and model are required when winner_type is 'ai'")
        
        # Check if game exists in moves table
        conn = sqlite3.connect(DATABASE_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM game_moves WHERE game_id = ?", (game_id,))
        total_records = cursor.fetchone()[0]
        conn.close()
        
        if total_records == 0:
            raise HTTPException(status_code=404, detail=f"No game records found for game_id: {game_id}")
        
        print(f"[Game {game_id}] Logging winner: {winner_color} ({winner_type})")
        if winner_type == "ai":
            print(f"[Game {game_id}] AI Winner details: {request.provider}/{request.model}")
        
        # Save winner information
        success = save_game_winner(
            game_id=game_id,
            winner_color=winner_color,
            winner_type=winner_type,
            provider=request.provider if winner_type == "ai" else None,
            model=request.model if winner_type == "ai" else None,
            game_duration_seconds=request.game_duration_seconds,
            total_moves=request.total_moves,
            finish_reason=request.finish_reason
        )
        
        if not success:
            raise HTTPException(status_code=409, detail=f"Winner for game {game_id} has already been logged")
        
        winner_info = {
            "color": winner_color,
            "type": winner_type,
            "provider": request.provider if winner_type == "ai" else None,
            "model": request.model if winner_type == "ai" else None,
            "game_duration_seconds": request.game_duration_seconds,
            "total_moves": request.total_moves,
            "finish_reason": request.finish_reason
        }
        
        return LogWinnerResponse(
            message=f"Game {game_id} winner logged successfully",
            game_id=game_id,
            winner_info=winner_info
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error logging winner: {str(e)}")

# Note: Provider switching is now handled per-request, no global state needed

@app.get("/providers")
async def get_available_providers():
    """
    Get list of available AI providers and their default models
    """
    available_providers = AIProviderFactory.get_available_providers()
    
    # Default models for each provider
    default_models = {
        "anthropic": "claude-3-5-sonnet-20240620",
        "huggingface": "Qwen/Qwen2.5-72B-Instruct"
    }
    
    provider_info = {}
    for provider in available_providers:
        provider_info[provider] = {
            "default_model": default_models.get(provider, "unknown"),
            "description": _get_provider_description(provider)
        }
    
    return {
        "available_providers": available_providers,
        "provider_details": provider_info,
        "usage": "Include 'provider' and 'model' in your /predict-move requests"
    }

def _get_provider_description(provider: str) -> str:
    """Get description for each provider"""
    descriptions = {
        "anthropic": "Claude models from Anthropic (excellent for reasoning and tool calling)",
        "huggingface": "Open source models via Hugging Face (configurable, cost-effective)"
    }
    return descriptions.get(provider, "AI provider")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 