"""
Optimizer for flag extraction using DSPy's MIPROv2.

This module handles the training and optimization of flag extraction prompts
using DSPy's state-of-the-art Multi-stage Instruction Proposal and Refinement Optimizer.
"""

from pathlib import Path
from typing import Literal

import dspy
import tomllib

from flag_extractor import FlagExtractor, MultiStageFlagExtractor
from metrics import flag_extraction_metric, title_match_metric
from config import configure_lm, get_optimization_config


def load_test_cases(test_dir: Path | str) -> list[dspy.Example]:
    """
    Load test cases from TOML files and convert to DSPy Examples.

    Args:
        test_dir: Directory containing .toml test case files

    Returns:
        List of DSPy Example objects
    """
    test_dir = Path(test_dir)
    examples = []

    for toml_file in sorted(test_dir.glob("*.toml")):
        with open(toml_file, "rb") as f:
            data = tomllib.load(f)

            example = dspy.Example(
                transcript=data["transcript"],
                salesperson_context=data["salesperson_context"],
                expected_flag_title=data.get("expected_flag_title"),
                filename=toml_file.name,
            ).with_inputs("transcript", "salesperson_context")

            examples.append(example)

    return examples


def split_train_val(
    examples: list[dspy.Example], val_size: int = 1
) -> tuple[list[dspy.Example], list[dspy.Example]]:
    """
    Split examples into training and validation sets.

    Args:
        examples: List of examples to split
        val_size: Number of examples to use for validation (default: 1)

    Returns:
        Tuple of (trainset, valset)
    """
    if len(examples) <= val_size:
        raise ValueError(
            f"Not enough examples ({len(examples)}) for validation size {val_size}"
        )

    # Use last val_size examples for validation
    trainset = examples[:-val_size]
    valset = examples[-val_size:]

    return trainset, valset


class FlagExtractorOptimizer:
    """
    Optimizer for flag extraction modules using MIPROv2.

    This class provides a high-level interface for training and optimizing
    flag extraction prompts with various configuration options.
    """

    def __init__(
        self,
        module_type: Literal["single", "multi"] = "single",
        metric: str | None = None,
        optimization_mode: str = "light",
    ):
        """
        Initialize the optimizer.

        Args:
            module_type: Type of extractor module ("single" or "multi")
            metric: Metric to use ("flag_extraction" or "title_match"). Defaults to flag_extraction
            optimization_mode: Optimization intensity ("light", "medium", "heavy")
        """
        self.module_type = module_type
        self.optimization_mode = optimization_mode

        # Select metric
        if metric == "title_match":
            self.metric = title_match_metric
        else:
            self.metric = flag_extraction_metric

        # Get optimization config
        self.opt_config = get_optimization_config(optimization_mode)

    def create_module(self):
        """Create a fresh instance of the flag extractor module."""
        if self.module_type == "multi":
            return MultiStageFlagExtractor()
        else:
            return FlagExtractor()

    def optimize(
        self,
        trainset: list[dspy.Example],
        valset: list[dspy.Example] | None = None,
        prompt_model: dspy.LM | None = None,
    ):
        """
        Optimize the flag extractor using MIPROv2.

        Args:
            trainset: Training examples
            valset: Optional validation examples
            prompt_model: Optional LM to use for prompt generation (defaults to main LM)

        Returns:
            Optimized flag extractor module
        """
        print(f"\n{'='*60}")
        print(f"Optimizing Flag Extractor ({self.module_type} stage)")
        print(f"Mode: {self.optimization_mode}")
        print(f"Training examples: {len(trainset)}")
        if valset:
            print(f"Validation examples: {len(valset)}")
        print(f"{'='*60}\n")

        # Create fresh module
        module = self.create_module()

        # Initialize MIPROv2
        optimizer_kwargs = {
            "metric": self.metric,
            "auto": self.opt_config["auto"],
            "num_threads": self.opt_config["num_threads"],
        }

        if prompt_model:
            optimizer_kwargs["prompt_model"] = prompt_model

        optimizer = dspy.MIPROv2(**optimizer_kwargs)

        # Compile (optimize) the module
        compile_kwargs = {
            "max_bootstrapped_demos": self.opt_config["max_bootstrapped_demos"],
            "max_labeled_demos": self.opt_config["max_labeled_demos"],
        }

        if valset:
            compile_kwargs["valset"] = valset

        print("Starting optimization...\n")
        optimized_module = optimizer.compile(
            module,
            trainset=trainset,
            **compile_kwargs,
        )

        print("\nOptimization complete!")
        return optimized_module

    def evaluate(
        self,
        module,
        examples: list[dspy.Example],
        display_progress: bool = True,
    ) -> dict:
        """
        Evaluate a module on a set of examples.

        Args:
            module: Module to evaluate
            examples: Examples to evaluate on
            display_progress: Whether to show progress bar

        Returns:
            Dictionary with evaluation results
        """
        from dspy.evaluate import Evaluate

        evaluator = Evaluate(
            devset=examples,
            metric=self.metric,
            num_threads=self.opt_config["num_threads"],
            display_progress=display_progress,
        )

        score = evaluator(module)

        return {
            "score": score,
            "num_examples": len(examples),
            "metric": self.metric.__name__,
        }


def optimize_from_tests(
    test_dir: Path | str = "tests",
    output_path: Path | str = "optimized_extractor.json",
    module_type: Literal["single", "multi"] = "single",
    optimization_mode: str = "light",
    val_size: int = 1,
    lm_provider: str = "ollama",
    lm_model: str | None = None,
) -> dict:
    """
    High-level function to optimize a flag extractor from test cases.

    Args:
        test_dir: Directory containing test case TOML files
        output_path: Path to save optimized module
        module_type: Type of extractor ("single" or "multi")
        optimization_mode: Optimization intensity ("light", "medium", "heavy")
        val_size: Number of examples for validation
        lm_provider: Language model provider
        lm_model: Specific model name (optional)

    Returns:
        Dictionary with optimization results
    """
    # Configure language model
    print(f"Configuring {lm_provider} language model...")
    configure_lm(lm_provider, model=lm_model)

    # Load test cases
    print(f"Loading test cases from {test_dir}...")
    examples = load_test_cases(test_dir)
    print(f"Loaded {len(examples)} test cases")

    # Split train/val
    trainset, valset = split_train_val(examples, val_size=val_size)

    # Create optimizer
    optimizer = FlagExtractorOptimizer(
        module_type=module_type,
        optimization_mode=optimization_mode,
    )

    # Optimize
    optimized_module = optimizer.optimize(trainset, valset)

    # Evaluate on validation set
    print(f"\nEvaluating on validation set...")
    val_results = optimizer.evaluate(optimized_module, valset)
    print(f"Validation score: {val_results['score']:.3f}")

    # Save optimized module
    output_path = Path(output_path)
    print(f"\nSaving optimized module to {output_path}...")
    optimized_module.save(str(output_path))

    return {
        "output_path": str(output_path),
        "module_type": module_type,
        "optimization_mode": optimization_mode,
        "train_size": len(trainset),
        "val_size": len(valset),
        "val_score": val_results["score"],
    }