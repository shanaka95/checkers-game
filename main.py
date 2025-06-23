import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from huggingface_hub import InferenceClient
from transformers import AutoTokenizer

app = FastAPI(title="Checkers AI API", description="FastAPI backend for checkers move prediction")

# Add CORS middleware to allow requests from your frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = "Qwen/Qwen3-32B"
# Initialize the Hugging Face client
client = InferenceClient(
    provider="auto",
    api_key=os.environ.get("HF_TOKEN"),
)

# Initialize tokenizer for proper tool calling support
try:
    tokenizer = AutoTokenizer.from_pretrained(model)
    print("Tokenizer loaded successfully")
except Exception as e:
    print(f"Warning: Could not load tokenizer: {e}")
    tokenizer = None

# Define available tool
def make_move(from_position: str, to_position: str) -> str:
    """
    Make a move in the checkers game.
    
    Args:
        from_position: Starting position in notation (e.g., "C3")
        to_position: Destination position in notation (e.g., "D4")
    
    Returns:
        Confirmation message
    """
    print(f"MOVE TOOL CALLED: From {from_position} to {to_position}")
    return f"Move executed: {from_position} -> {to_position}"

# Tool registry
AVAILABLE_TOOLS = {
    "move": make_move
}

# Tool definition for the LLM
TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "move",
            "description": "Make a move in the checkers game. Call this tool when you want to execute a move.",
            "parameters": {
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
    }
]

def execute_tool_call(tool_name: str, arguments: Dict[str, Any]) -> Any:
    """Execute a tool call with the given arguments"""
    if tool_name not in AVAILABLE_TOOLS:
        raise ValueError(f"Unknown tool: {tool_name}")
    
    tool_function = AVAILABLE_TOOLS[tool_name]
    try:
        result = tool_function(**arguments)
        return result
    except Exception as e:
        return f"Error executing tool: {str(e)}"

def parse_tool_calls_with_template(messages: List[Dict], response_text: str) -> List[Dict[str, Any]]:
    """
    Parse tool calls using proper chat template and tokenizer.
    This is more robust than regex parsing.
    """
    tool_calls = []
    
    if tokenizer is None:
        # Fallback to regex if tokenizer not available
        return parse_tool_calls_from_response_fallback(response_text)
    
    try:
        # Format the conversation with tools for proper parsing
        formatted_messages = messages.copy()
        formatted_messages.append({
            "role": "assistant", 
            "content": response_text
        })
        
        # Apply chat template with tools
        if hasattr(tokenizer, 'apply_chat_template'):
            try:
                # Try to apply chat template with tools
                formatted_text = tokenizer.apply_chat_template(
                    formatted_messages,
                    tools=TOOL_DEFINITIONS,
                    tokenize=False,
                    add_generation_prompt=False
                )
                
                # Look for tool calls in the formatted output
                tool_calls = extract_tool_calls_from_formatted_response(response_text)
                
            except Exception as e:
                print(f"Chat template application failed: {e}")
                # Fallback to regex
                tool_calls = parse_tool_calls_from_response_fallback(response_text)
        else:
            # Fallback to regex
            tool_calls = parse_tool_calls_from_response_fallback(response_text)
            
    except Exception as e:
        print(f"Template parsing failed: {e}")
        # Fallback to regex
        tool_calls = parse_tool_calls_from_response_fallback(response_text)
    
    return tool_calls

def extract_tool_calls_from_formatted_response(response_text: str) -> List[Dict[str, Any]]:
    """
    Extract tool calls from properly formatted response.
    Handles both JSON-style and function call style outputs.
    """
    import re
    tool_calls = []
    
    # Method 1: Look for JSON tool call format
    try:
        # Try to find JSON objects that look like tool calls
        json_pattern = r'\{[^{}]*"name"\s*:\s*"move"[^{}]*\}'
        json_matches = re.findall(json_pattern, response_text)
        
        for match in json_matches:
            try:
                tool_data = json.loads(match)
                if tool_data.get("name") == "move" and "arguments" in tool_data:
                    tool_calls.append({
                        "tool": "move",
                        "arguments": tool_data["arguments"]
                    })
            except json.JSONDecodeError:
                continue
                
    except Exception as e:
        print(f"JSON parsing failed: {e}")
    
    # Method 2: Look for function call format (fallback)
    if not tool_calls:
        tool_calls = parse_tool_calls_from_response_fallback(response_text)
    
    return tool_calls

def parse_tool_calls_from_response_fallback(response_text: str) -> List[Dict[str, Any]]:
    """
    Fallback regex-based tool call parsing.
    """
    import re
    tool_calls = []
    
    # Multiple patterns to catch different formats
    patterns = [
        r'move\(from_position="([^"]+)",\s*to_position="([^"]+)"\)',
        r'"name":\s*"move"[^}]*"from_position":\s*"([^"]+)"[^}]*"to_position":\s*"([^"]+)"',
        r'"name":\s*"move"[^}]*"to_position":\s*"([^"]+)"[^}]*"from_position":\s*"([^"]+)"'
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, response_text)
        for match in matches:
            if len(match) >= 2:
                from_pos, to_pos = match[0], match[1]
                tool_calls.append({
                    "tool": "move",
                    "arguments": {
                        "from_position": from_pos,
                        "to_position": to_pos
                    }
                })
    
    return tool_calls

# Pydantic models for move prediction
class PredictMoveRequest(BaseModel):
    board_state: Dict[str, Any]
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
    return {"message": "Checkers AI API is running", "available_endpoints": ["/predict-move"]}

@app.post("/predict-move", response_model=PredictMoveResponse)
async def predict_next_move(request: PredictMoveRequest):
    """
    Analyze checkers board state and predict the best move using LLM with move tool calling
    """
    try:
        if not os.environ.get("HF_TOKEN"):
            raise HTTPException(status_code=500, detail="HF_TOKEN environment variable is not set")
        
        board_state = request.board_state
        current_player = board_state.get("currentPlayer", "unknown")
        available_moves = board_state.get("availableMoves", [])
        
        # Create a detailed system message for checkers analysis with proper tool calling
        system_message = """You are a highly skilled, competitive checkers-playing AI following official American Checkers (English Draughts) rules. Your sole objective is to play the game to win, making moves that maximize your chances of victory.

You have access to the following tool:
move: Execute your chosen move in the checkers game using algebraic notation.
Format: move(from_position, to_position)

When you decide on your move, you MUST use the move tool with the precise from and to positions in correct algebraic notation.

OFFICIAL CHECKERS RULES (Strictly Followed):

BASIC MOVEMENT:
- All play occurs on dark squares only (8x8 board)
- Regular pieces move diagonally forward only, one square at a time
- Kings move diagonally in any direction (forward or backward), one square at a time
- Red pieces start on top 3 rows, White pieces start on bottom 3 rows
- Red traditionally moves first (like black in standard checkers)

CAPTURES (JUMPS):
- You MUST jump if a jump move is available (mandatory rule)
- Capture by jumping diagonally over an adjacent opponent piece to an empty square behind it
- Multiple jumps MUST be taken consecutively if available after landing
- During multiple jumps, you may change direction but must continue jumping
- Remove captured pieces from the board immediately
- Both regular pieces and kings can be captured

KING PROMOTION:
- Pieces become kings when reaching the opponent's back row (far end)
- Kings are marked with a crown symbol (👑)
- Kings can move and capture in any diagonal direction

WIN CONDITIONS:
- Capture all opponent pieces, OR
- Block opponent so they have no legal moves available
- Draw occurs when neither player can force a win (usually with 2 or fewer pieces each)
- In tournament play: draw after 40 moves without capture, or same move repeated 3 times

STRATEGIC PRIORITIES:
1. Control the center 8 squares for mobility
2. Trade pieces when you're ahead in count
3. Use forced jumps to your advantage
4. Be first to get a king for mobility advantage
5. Build defensive formations when needed
6. Plan multiple moves ahead

Your Objective:
Win by capturing all opponent pieces or forcing them into a position with no legal moves. Think strategically, anticipate opponent responses, and make moves that improve your long-term position.

CRITICAL: You MUST call the move tool with your chosen move using exact algebraic notation from the available moves list!"""

        # Create detailed prompt with board analysis
        moves_list = []
        for move in available_moves:
            move_type = " (JUMP - MANDATORY)" if move.get("isJump") else ""
            moves_list.append(f"  • {move['from']['notation']} → {move['to']['notation']}{move_type}")
        
        moves_text = "\n".join(moves_list) if moves_list else "  • No moves available"
        
        analysis_prompt = f"""Analyze this checkers position for {current_player} player:

CURRENT BOARD STATE:
- Current Player: {current_player}
- Game Phase: {board_state.get('gamePhase', 'unknown')}
- Turn Number: {board_state.get('turnNumber', '?')}
- Must Jump: {board_state.get('mustJump', False)}

PIECE COUNT:
- Red: {board_state.get('pieceCount', {}).get('red', {}).get('total', '?')} pieces ({board_state.get('pieceCount', {}).get('red', {}).get('kings', 0)} kings)
- White: {board_state.get('pieceCount', {}).get('white', {}).get('total', '?')} pieces ({board_state.get('pieceCount', {}).get('white', {}).get('kings', 0)} kings)

BOARD LAYOUT:
{board_state.get('boardString', 'Board representation not available')}

Legend: r=red piece, R=red king, w=white piece, W=white king, .=empty dark square, space=light square

AVAILABLE MOVES FOR {current_player.upper()}:
{moves_text}

OPPONENT PIECES:
""" + "\n".join([f"  • {piece['position']['notation']}: {piece['color']} {'king' if piece['isKing'] else 'piece'}" 
                for piece in board_state.get('opponentPieces', [])]) + f"""

Please:
1. Analyze the current position thoroughly
2. Consider all tactical and strategic factors
3. Choose the best move from the available options
4. Call the move tool with your chosen move using exact notation
5. Explain your reasoning

Remember: You MUST call the move(from_position="X", to_position="Y") tool with your final decision!"""

        messages = [
            {"role": "system", "content": system_message},
            {"role": "user", "content": analysis_prompt}
        ]

        # Make the completion request with tool calling support
        try:
            completion = client.chat.completions.create(
                model=request.model,
                messages=messages,
                tools=TOOL_DEFINITIONS,
                tool_choice="auto"  # Let the model decide when to use tools
            )
        except Exception as e:
            print(f"Tool calling failed, falling back to regular completion: {e}")
            # Fallback to regular completion without tools
            completion = client.chat.completions.create(
                model=request.model,
                messages=messages,
            )
        
        response_text = completion.choices[0].message.content
        
        # Check if the model returned structured tool calls
        tool_calls = []
        if hasattr(completion.choices[0].message, 'tool_calls') and completion.choices[0].message.tool_calls:
            # Handle structured tool calls from the API
            print("Found structured tool calls in response")
            for tool_call in completion.choices[0].message.tool_calls:
                if tool_call.function.name == "move":
                    try:
                        args = json.loads(tool_call.function.arguments)
                        tool_calls.append({
                            "tool": "move",
                            "arguments": args
                        })
                    except json.JSONDecodeError as e:
                        print(f"Failed to parse tool call arguments: {e}")
        
        # If no structured tool calls found, parse from response text
        if not tool_calls:
            print("No structured tool calls found, parsing from text")
            tool_calls = parse_tool_calls_with_template(messages, response_text)
        tool_results = []
        suggested_move = {}
        
        # Execute any detected tool calls
        for tool_call in tool_calls:
            try:
                result = execute_tool_call(tool_call["tool"], tool_call["arguments"])
                tool_results.append({
                    "tool": tool_call["tool"],
                    "arguments": tool_call["arguments"],
                    "result": result
                })
                
                # If it's a move tool call, extract the suggested move
                if tool_call["tool"] == "move":
                    suggested_move = {
                        "from": tool_call["arguments"]["from_position"],
                        "to": tool_call["arguments"]["to_position"]
                    }
                    
            except Exception as e:
                tool_results.append({
                    "tool": tool_call["tool"],
                    "arguments": tool_call["arguments"],
                    "error": str(e)
                })
        
        # Extract reasoning from the response
        reasoning = response_text
        
        return PredictMoveResponse(
            analysis=response_text,
            suggested_move=suggested_move,
            reasoning=reasoning,
            tool_calls=tool_calls,
            tool_results=tool_results
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error predicting move: {str(e)}")



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 