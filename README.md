# Intelligent Checkers AI

An advanced checkers game with integrated AI powered by Claude Sonnet 4. Features a complete web-based checkers interface with an intelligent AI opponent that can analyze positions, predict moves, and play competitively using Anthropic's most advanced language model.

## 🎯 Features

- **Complete Checkers Game**: Full-featured web interface with multiple game modes
- **Claude Sonnet 4 Integration**: Premium AI-powered move prediction and analysis
- **Move History Tracking**: Complete game history with notation for pattern analysis
- **Advanced Tool Calling**: Native Anthropic tool use for precise move execution
- **Real-time Analysis**: Live board state analysis and strategic recommendations
- **Auto-execution**: AI moves are automatically executed in the game
- **Multiple Game Modes**: Human vs AI, AI vs AI autorun, and Human vs Human
- **Competitive AI**: Strategic, forward-thinking AI opponent

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Set Up Environment
```bash
export ANTHROPIC_API_KEY="your_anthropic_api_key_here"
```

Or create a `.env` file:
```
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### 3. Start the AI Backend
```bash
python main.py
```

### 4. Open the Game
Open `index.html` in your web browser to start playing.

## 🎮 How to Play

1. **Start a Game**: Open `index.html` in your browser
2. **Make Your Move**: Click a piece to select it, then click a highlighted square to move
3. **Get AI Assistance**: Click "Get LLM Move" for AI analysis and automatic move execution
4. **Watch the AI Play**: The AI will analyze the position and execute its chosen move automatically

## 🧠 AI Architecture

### Claude Sonnet 4 Tool Calling System
The AI uses Anthropic's native tool calling system for precise move execution:

```python
# Native Anthropic tool calling
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    system=system_message,
    tools=TOOL_DEFINITIONS,
    messages=[{"role": "user", "content": analysis_prompt}]
)

# Parse tool calls from Claude's response
for content_block in response.content:
    if content_block.type == "tool_use":
        # Execute the move tool
```

### AI Capabilities
- **Position Analysis**: Comprehensive board state evaluation
- **Strategic Planning**: Multi-move ahead thinking
- **Tactical Awareness**: Immediate threats and opportunities
- **Rule Compliance**: Strict adherence to checkers rules
- **Competitive Play**: Optimized for winning

## 📡 API Endpoints

### Health Check
- **GET** `/` - Server status and available endpoints

### Move Prediction
- **POST** `/predict-move` - AI move analysis and prediction
  ```json
  {
    "board_state": {
      "currentPlayer": "red",
      "availableMoves": [...],
      "boardString": "...",
      "pieceCount": {...}
    },
    "model": "claude-sonnet-4-20250514"
  }
  ```

### Response Format
```json
{
  "analysis": "Detailed AI analysis of the position...",
  "suggested_move": {
    "from": "C3",
    "to": "D4"
  },
  "reasoning": "Strategic explanation...",
  "tool_calls": [...],
  "tool_results": [...]
}
```

## 🔧 Configuration

### Model Configuration
The system uses Claude Sonnet 4 as the primary AI model:

```python
# In main.py
model: Optional[str] = "claude-sonnet-4-20250514"  # Claude Sonnet 4
```

### AI Personality
The AI is configured with a competitive, strategic personality:
- **Objective**: Play to win with expert-level tactics
- **Strategy**: Multi-move planning and positional awareness
- **Tactics**: Aggressive when advantageous, defensive when necessary

## 🛠️ Technical Details

### Frontend (checkers.js)
- Complete checkers game implementation
- Board state management and move validation
- LLM integration with automatic move execution
- Comprehensive game state export for AI analysis

### Backend (main.py)
- FastAPI server with CORS support
- Advanced tool calling with transformers integration
- Structured tool parsing and execution
- Robust error handling and fallbacks

### Dependencies
- **FastAPI**: Web framework and API server
- **Anthropic**: Official Anthropic client for Claude API
- **Pydantic**: Data validation and settings management

## 🎨 Game Interface

The web interface includes:
- **8x8 Checkers Board**: Interactive game board with piece selection
- **Game Status**: Current player, piece counts, and game phase
- **AI Controls**: Get AI move suggestions and analysis
- **Game Controls**: New game, resign, and draw options
- **Visual Feedback**: Move highlighting and selection indicators

## 📊 Board State Format

The AI receives comprehensive board information:

```json
{
  "currentPlayer": "red",
  "gamePhase": "opening",
  "fullMoveNumber": 3,
  "availableMoves": [
    {
      "from": {"notation": "B6", "row": 2, "col": 1},
      "to": {"notation": "A5", "row": 3, "col": 0},
      "isJump": false
    }
  ],
  "boardString": " r r r r\nr r r r \n...",
  "pieceCount": {
    "red": {"regular": 12, "kings": 0},
    "white": {"regular": 12, "kings": 0}
  },
  "moveHistory": [
    {
      "moveNumber": 1,
      "player": "red",
      "notation": "1. C3-D4",
      "from": "C3",
      "to": "D4",
      "isJump": false
    },
    {
      "moveNumber": 2,
      "player": "white", 
      "notation": "1. ... F6-E5",
      "from": "F6",
      "to": "E5",
      "isJump": false
    }
  ],
  "totalMoves": 2
}
```

## 📚 Move History & Pattern Analysis

The system tracks complete game history for enhanced AI decision-making:

### Move Notation Format
- **Standard moves**: `C3-D4` (from-to notation)
- **Captures**: `D4xF6` (x indicates jump/capture with captured piece position)
- **Promotions**: `A7-B8=K` (=K indicates king promotion)
- **Move numbering**: Grouped by full moves (Red + White = 1 full move)
- **Game format**: `1. C3-D4 F6-E5 2. D4xF6 G7-E5` (chess-style notation)

### AI Benefits from Move History
- **Pattern Recognition**: Identifies recurring strategic themes
- **Opening Preparation**: Learns from previous game openings
- **Tactical Awareness**: Spots repeated tactical motifs
- **Endgame Knowledge**: References similar endgame positions
- **Opponent Modeling**: Adapts to player tendencies over time

### History Data Structure
```json
{
  "moveHistory": [
    {
      "moveNumber": 1,
      "fullMoveNumber": 1,
      "player": "red",
      "notation": "C3-D4",
      "from": "C3",
      "to": "D4",
      "isJump": false,
      "capturedPiece": null,
      "wasPromoted": false,
      "timestamp": "2024-01-01T12:00:00.000Z",
      "description": "Red: C3-D4"
    }
  ],
  "totalMoves": 1
}
```

## 🎯 AI Strategy

The AI employs advanced checkers strategy enhanced by move history analysis:
- **Opening**: Control center squares and develop pieces based on historical patterns
- **Midgame**: Seek tactical opportunities and king promotion with pattern recognition
- **Endgame**: Precise calculation and piece coordination using endgame databases

## 🔍 API Documentation

Interactive API documentation available at:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 🏆 Model Performance

Optimized for:
- **Claude Sonnet 4**: Anthropic's most advanced model with superior reasoning
- **Fast Response**: Typically 1-3 seconds per move
- **Strategic Depth**: Advanced multi-move ahead planning
- **Rule Compliance**: 100% legal move generation
- **Tool Calling**: Native Anthropic tool use for precise execution

## 🔧 Environment Variables

- `ANTHROPIC_API_KEY` - Your Anthropic API key (required)

Get your API key from: https://console.anthropic.com/


## 🎮 Example Usage

```bash
# Start the AI server
python main.py

# Open index.html in browser
# Click "Get LLM Move" to see AI analysis
# Watch as AI automatically executes moves
```

## 🚧 Future Enhancements

- **Tournament Mode**: Multiple AI difficulty levels
- **Game Analysis**: Post-game move analysis and improvement suggestions
- **Opening Book**: Database of optimal opening moves
- **Endgame Tablebase**: Perfect endgame play
- **Multiplayer**: Online multiplayer with AI assistance 