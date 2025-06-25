import os
import json
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import anthropic
from huggingface_hub import InferenceClient


class AIProvider(ABC):
    """Abstract base class for AI providers"""
    
    @abstractmethod
    def __init__(self, api_key: str, model: str):
        pass
    
    @abstractmethod
    def generate_move_prediction(self, system_message: str, user_prompt: str, 
                               tools: List[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Generate a move prediction with optional tool calling
        
        Returns:
            Dict containing:
            - text_content: str - The AI's text response
            - tool_calls: List[Dict] - Any tool calls made
            - raw_response: Any - The raw response from the provider
        """
        pass
    
    @abstractmethod
    def get_provider_name(self) -> str:
        """Return the name of the AI provider"""
        pass


class AnthropicProvider(AIProvider):
    """Anthropic Claude provider implementation"""
    
    def __init__(self, api_key: str = None, model: str = "claude-3-5-sonnet-20240620"):
        self.api_key = api_key or os.environ.get("ANTHROPIC_S")
        if not self.api_key:
            raise ValueError("Anthropic API key is required. Set ANTHROPIC_S environment variable or pass api_key parameter.")
        
        self.model = model
        self.client = anthropic.Anthropic(api_key=self.api_key)
    
    def generate_move_prediction(self, system_message: str, user_prompt: str, 
                               tools: List[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Generate move prediction using Claude"""
        try:
            # Prepare the request parameters
            request_params = {
                "model": self.model,
                "max_tokens": 1024,
                "system": system_message,
                "messages": [{"role": "user", "content": user_prompt}]
            }
            
            # Add tools if provided
            if tools:
                request_params["tools"] = tools
            
            # Make the API call
            response = self.client.messages.create(**request_params)
            
            # Extract text content
            text_content = ""
            for content_block in response.content:
                if content_block.type == "text":
                    text_content += content_block.text
            
            # Parse tool calls
            tool_calls = self._parse_tool_calls(response.content)
            
            return {
                "text_content": text_content,
                "tool_calls": tool_calls,
                "raw_response": response
            }
            
        except Exception as e:
            raise Exception(f"Anthropic API call failed: {str(e)}")
    
    def _parse_tool_calls(self, response_content: List[Any]) -> List[Dict[str, Any]]:
        """Parse tool calls from Claude's response content blocks"""
        tool_calls = []
        
        for content_block in response_content:
            if hasattr(content_block, 'type') and content_block.type == "tool_use":
                tool_calls.append({
                    "tool": content_block.name,
                    "arguments": content_block.input,
                    "id": content_block.id
                })
        
        return tool_calls
    
    def get_provider_name(self) -> str:
        """Return the provider name"""
        return "anthropic"


class HuggingFaceProvider(AIProvider):
    """Hugging Face provider implementation"""
    
    def __init__(self, api_key: str = None, model: str = "Qwen/Qwen2.5-72B-Instruct", provider: str = "nebius"):
        self.api_key = api_key or os.environ.get("HF_TOKEN")
        if not self.api_key:
            raise ValueError("Hugging Face API key is required. Set HF_TOKEN environment variable or pass api_key parameter.")
        
        self.model = model
        self.provider = provider
        self.client = InferenceClient(
            provider=self.provider,
            api_key=self.api_key
        )
    
    def generate_move_prediction(self, system_message: str, user_prompt: str, 
                               tools: List[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Generate move prediction using Hugging Face"""
        try:
            # Prepare messages - combine system and user messages since HF format may be different
            messages = [
                {"role": "system", "content": system_message},
                {"role": "user", "content": user_prompt}
            ]
            
            # Prepare request parameters
            request_params = {
                "model": self.model,
                "messages": messages,
                "max_tokens": 1024,
                "temperature": 0.1  # Lower temperature for more consistent chess moves
            }
            
            # Note: Tool calling support may vary by model/provider
            # For now, we'll handle tools in the prompt if they exist
            if tools:
                # Convert tools to text description since not all HF models support function calling
                tools_description = self._tools_to_text(tools)
                messages[-1]["content"] += f"\n\nAvailable tools:\n{tools_description}"
                messages[-1]["content"] += "\n\nIf you want to make a move, respond with: TOOL_CALL:move:from_position:to_position"
            
            # Make the API call
            response = self.client.chat.completions.create(**request_params)
            
            # Extract text content
            text_content = response.choices[0].message.content or ""
            
            # Parse tool calls from text response
            tool_calls = self._parse_text_tool_calls(text_content) if tools else []
            
            return {
                "text_content": text_content,
                "tool_calls": tool_calls,
                "raw_response": response
            }
            
        except Exception as e:
            raise Exception(f"Hugging Face API call failed: {str(e)}")
    
    def _tools_to_text(self, tools: List[Dict[str, Any]]) -> str:
        """Convert tools to text description"""
        descriptions = []
        for tool in tools:
            desc = f"- {tool['name']}: {tool['description']}"
            if 'input_schema' in tool and 'properties' in tool['input_schema']:
                props = tool['input_schema']['properties']
                params = []
                for param_name, param_info in props.items():
                    params.append(f"{param_name} ({param_info.get('type', 'string')}): {param_info.get('description', '')}")
                if params:
                    desc += f"\n  Parameters: {', '.join(params)}"
            descriptions.append(desc)
        return "\n".join(descriptions)
    
    def _parse_text_tool_calls(self, text_content: str) -> List[Dict[str, Any]]:
        """Parse tool calls from text response"""
        tool_calls = []
        lines = text_content.split('\n')
        
        for line in lines:
            line = line.strip()
            if line.startswith('TOOL_CALL:'):
                try:
                    # Format: TOOL_CALL:move:from_position:to_position
                    parts = line.split(':')
                    if len(parts) >= 4 and parts[1] == 'move':
                        tool_calls.append({
                            "tool": "move",
                            "arguments": {
                                "from_position": parts[2],
                                "to_position": parts[3]
                            },
                            "id": f"hf_call_{len(tool_calls)}"
                        })
                except Exception as e:
                    print(f"Error parsing tool call from HF response: {e}")
                    continue
        
        return tool_calls
    
    def get_provider_name(self) -> str:
        """Return the provider name"""
        return "huggingface"


class AIProviderFactory:
    """Factory class for creating AI providers"""
    
    _providers = {
        "anthropic": AnthropicProvider,
        "huggingface": HuggingFaceProvider,
        # Add other providers here as they're implemented
        # "openai": OpenAIProvider,
        # "google": GoogleProvider,
    }
    
    @classmethod
    def create_provider(cls, provider_name: str, api_key: str = None, 
                       model: str = None) -> AIProvider:
        """Create an AI provider instance"""
        if provider_name not in cls._providers:
            available = ", ".join(cls._providers.keys())
            raise ValueError(f"Unknown provider: {provider_name}. Available providers: {available}")
        
        provider_class = cls._providers[provider_name]
        
        # Use default models if not specified
        if model is None:
            default_models = {
                "anthropic": "claude-3-5-sonnet-20240620",
                "huggingface": "Qwen/Qwen2.5-72B-Instruct",
                # Add defaults for other providers
            }
            model = default_models.get(provider_name)
        
        return provider_class(api_key=api_key, model=model)
    
    @classmethod
    def get_available_providers(cls) -> List[str]:
        """Get list of available provider names"""
        return list(cls._providers.keys())
    
    @classmethod
    def register_provider(cls, name: str, provider_class: type):
        """Register a new provider class"""
        if not issubclass(provider_class, AIProvider):
            raise ValueError("Provider class must inherit from AIProvider")
        cls._providers[name] = provider_class


# Convenience function for creating providers
def create_ai_provider(provider_name: str = "anthropic", api_key: str = None, 
                      model: str = None) -> AIProvider:
    """Convenience function to create an AI provider"""
    return AIProviderFactory.create_provider(provider_name, api_key, model)
