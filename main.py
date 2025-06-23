import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import anthropic

app = FastAPI(title="Checkers AI API", description="FastAPI backend for checkers move prediction")

# Add CORS middleware to allow requests from your frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Claude Sonnet 4 model
model = "claude-3-sonnet-20240229"

# Initialize the Anthropic client
client = anthropic.Anthropic(
    api_key=os.environ.get("ANTHROPIC_S"),
)

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
    print(f"[Game {game_id}] MOVE TOOL CALLED: From {from_position} to {to_position}")
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

def parse_tool_calls_from_response(response_content: List[Any]) -> List[Dict[str, Any]]:
    """
    Parse tool calls from Claude's response content blocks.
    """
    tool_calls = []
    
    for content_block in response_content:
        if hasattr(content_block, 'type') and content_block.type == "tool_use":
            tool_calls.append({
                "tool": content_block.name,
                "arguments": content_block.input,
                "id": content_block.id
            })
    
    return tool_calls

# Pydantic models for move prediction
class PredictMoveRequest(BaseModel):
    board_state: Dict[str, Any]
    game_id: Optional[str] = None
    model: Optional[str] = model

class PredictMoveResponse(BaseModel):
    analysis: str
    suggested_move: Dict[str, str] = {}
    reasoning: str = ""
    tool_calls: List[Dict[str, Any]] = []
    tool_results: List[Dict[str, Any]] = []

@app.get("/")
async def root():
    """Health check endpoint"""
    return {"message": "Checkers AI API is running with Claude Sonnet 4", "available_endpoints": ["/predict-move"]}

@app.post("/predict-move", response_model=PredictMoveResponse)
async def predict_next_move(request: PredictMoveRequest):
    """
    Analyze checkers board state and predict the best move using Claude Sonnet 4 with tool calling
    """
    try:
        if not os.environ.get("ANTHROPIC_S"):
            raise HTTPException(status_code=500, detail="ANTHROPIC_S environment variable is not set")
        
        # Log game ID for tracking
        game_id = request.game_id or "unknown"
        print(f"[Game {game_id}] Processing move prediction request with Claude Sonnet 4")
        
        board_state = request.board_state
        current_player = board_state.get("currentPlayer", "unknown")
        available_moves = board_state.get("availableMoves", [])
        
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

        # Make the completion request using Anthropic's Messages API
        try:
            
            response = client.messages.create(
                model=request.model,
                max_tokens=1024,
                system=system_message,
                tools=TOOL_DEFINITIONS,
                messages=[
                    {
                        "role": "user",
                        "content": analysis_prompt
                    }
                ]
            )
            print(response)
        except Exception as e:
            print(f"Claude API call failed: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to get response from Claude: {str(e)}")
        
        # Extract response content
        response_content = response.content
        
        # Get text content from response
        analysis_text = ""
        for content_block in response_content:
            if content_block.type == "text":
                analysis_text += content_block.text
        
        # Parse tool calls from Claude's response
        tool_calls = parse_tool_calls_from_response(response_content)
        
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
        
        return PredictMoveResponse(
            analysis=analysis_text,
            suggested_move=suggested_move,
            reasoning=analysis_text,
            tool_calls=tool_calls,
            tool_results=tool_results
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error predicting move: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 