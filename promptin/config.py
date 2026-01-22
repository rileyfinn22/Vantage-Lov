"""
Configuration management for DSPy language models.

Supports multiple environments:
- Ollama (local development with smallthinker:3b)
- OpenAI (production with GPT models)
- Other LM providers as needed
"""

import os
from typing import Literal

import dspy

LMProvider = Literal["ollama", "openai", "anthropic"]


class Config:
    """Configuration for DSPy language models."""

    # Ollama settings
    OLLAMA_MODEL = "smallthinker:3b"
    OLLAMA_BASE_URL = "http://localhost:11434"

    # OpenAI settings
    OPENAI_MODEL = "gpt-4o-mini"
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

    # Anthropic settings
    ANTHROPIC_MODEL = "claude-3-5-sonnet-20241022"
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

    # Default provider
    DEFAULT_PROVIDER: LMProvider = "ollama"

    # Optimization settings
    OPTIMIZATION_MODE = "light"  # micro, light, medium, heavy
    NUM_THREADS = 4
    MAX_BOOTSTRAPPED_DEMOS = 3
    MAX_LABELED_DEMOS = 2


def configure_lm(
    provider: LMProvider | None = None,
    model: str | None = None,
    **kwargs,
) -> dspy.LM:
    """
    Configure DSPy with the specified language model.

    Args:
        provider: LM provider (ollama, openai, anthropic). Defaults to Config.DEFAULT_PROVIDER
        model: Specific model name. Defaults to provider's default model
        **kwargs: Additional arguments passed to dspy.LM()

    Returns:
        Configured dspy.LM instance

    Examples:
        # Use default (Ollama with smallthinker:3b)
        configure_lm()

        # Use OpenAI GPT-4o-mini
        configure_lm("openai")

        # Use custom Ollama model
        configure_lm("ollama", model="llama3:8b")
    """
    provider = provider or Config.DEFAULT_PROVIDER

    if provider == "ollama":
        model = model or Config.OLLAMA_MODEL
        lm = dspy.LM(
            f"ollama_chat/{model}",
            api_base=Config.OLLAMA_BASE_URL,
            api_key="",
            **kwargs,
        )

    elif provider == "openai":
        model = model or Config.OPENAI_MODEL
        if not Config.OPENAI_API_KEY:
            raise ValueError(
                "OPENAI_API_KEY environment variable not set. "
                "Set it with: export OPENAI_API_KEY=your_key"
            )
        lm = dspy.LM(
            f"openai/{model}",
            api_key=Config.OPENAI_API_KEY,
            **kwargs,
        )

    elif provider == "anthropic":
        model = model or Config.ANTHROPIC_MODEL
        if not Config.ANTHROPIC_API_KEY:
            raise ValueError(
                "ANTHROPIC_API_KEY environment variable not set. "
                "Set it with: export ANTHROPIC_API_KEY=your_key"
            )
        lm = dspy.LM(
            f"anthropic/{model}",
            api_key=Config.ANTHROPIC_API_KEY,
            **kwargs,
        )

    else:
        raise ValueError(f"Unsupported provider: {provider}")

    # Configure DSPy globally
    dspy.configure(lm=lm)

    return lm


def get_optimization_config(mode: str | None = None) -> dict:
    """
    Get optimization configuration for MIPROv2.

    Args:
        mode: Optimization mode (micro, light, medium, heavy). Defaults to Config.OPTIMIZATION_MODE

    Returns:
        Dictionary of optimization parameters
    """
    mode = mode or Config.OPTIMIZATION_MODE

    base_config = {
        "num_threads": Config.NUM_THREADS,
        "max_bootstrapped_demos": Config.MAX_BOOTSTRAPPED_DEMOS,
        "max_labeled_demos": Config.MAX_LABELED_DEMOS,
    }

    if mode == "micro":
        return {
            **base_config,
            "auto": "light",
            "num_threads": 1,
            "max_bootstrapped_demos": 1,
            "max_labeled_demos": 1,
        }
    elif mode == "light":
        return {
            **base_config,
            "auto": "light",
            "max_bootstrapped_demos": 2,
            "max_labeled_demos": 2,
        }
    elif mode == "medium":
        return {
            **base_config,
            "auto": "medium",
            "max_bootstrapped_demos": 3,
            "max_labeled_demos": 2,
        }
    elif mode == "heavy":
        return {
            **base_config,
            "auto": "heavy",
            "max_bootstrapped_demos": 4,
            "max_labeled_demos": 3,
        }
    else:
        raise ValueError(f"Unsupported optimization mode: {mode}")


# Backwards compatibility
def configure_ollama(model: str = "smallthinker:3b") -> None:
    """
    Configure DSPy to use Ollama with the specified model.

    Args:
        model: The Ollama model to use (default: smallthinker:3b)

    Note:
        Ensure Ollama is running with: ollama run smallthinker:3b

    Deprecated: Use configure_lm("ollama", model=model) instead
    """
    configure_lm("ollama", model=model)