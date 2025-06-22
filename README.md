# Intelligent Checkers AI

An advanced checkers game with integrated AI powered by Large Language Models (LLM). Features a complete web-based checkers interface with an intelligent AI opponent that can analyze positions, predict moves, and play competitively using modern transformer models.

## 🎯 Features

- **Complete Checkers Game**: Full-featured web interface with drag-and-drop functionality
- **AI Integration**: LLM-powered move prediction and analysis
- **Enhanced Tool Calling**: Advanced tool parsing using transformers library
- **Real-time Analysis**: Live board state analysis and strategic recommendations
- **Auto-execution**: AI moves are automatically executed in the game
- **Competitive AI**: Strategic, forward-thinking AI opponent

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Set Up Environment
```bash
export HF_TOKEN="your_huggingface_token_here"
```

Or create a `.env` file:
```
HF_TOKEN=your_huggingface_token_here
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

### Enhanced Tool Calling System
The AI uses a sophisticated multi-level tool calling approach:

```python
# Level 1: Native API tool calls (structured)
if completion.choices[0].message.tool_calls:
    # Handle structured tool calls from API

# Level 2: Template-based parsing with transformers
elif tokenizer.apply_chat_template():
    # Use proper chat templates for parsing

# Level 3: Enhanced regex fallback
else:
    # Multiple regex patterns for different formats
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
    "model": "Qwen/Qwen3-4B"
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
The system uses Qwen3-4B by default but supports other models:

```python
# In main.py
model: Optional[str] = "Qwen/Qwen3-4B"  # Default model
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
- **Transformers**: Advanced NLP and tool calling
- **Hugging Face Hub**: Model access and inference
- **PyTorch**: Machine learning backend

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
  }
}
```

## 🎯 AI Strategy

The AI employs advanced checkers strategy:
- **Opening**: Control center squares and develop pieces
- **Midgame**: Seek tactical opportunities and king promotion
- **Endgame**: Precise calculation and piece coordination

## 🔍 API Documentation

Interactive API documentation available at:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 🏆 Model Performance

Optimized for:
- **Qwen3-4B**: Primary model with excellent tool calling
- **Fast Response**: Typically 2-5 seconds per move
- **Strategic Depth**: Multi-move ahead planning
- **Rule Compliance**: 100% legal move generation

## 🔧 Environment Variables

- `HF_TOKEN` - Your Hugging Face API token (required)


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