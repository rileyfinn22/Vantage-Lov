"""
Export utilities for optimized DSPy programs.

This module provides functions to export optimized prompts and programs
in various formats for integration with the backend.
"""

import json
from pathlib import Path
from typing import Any

import dspy


def extract_signature_instructions(module: dspy.Module) -> dict[str, str]:
    """
    Extract instruction text from all signatures in a DSPy module.

    Args:
        module: Optimized DSPy module

    Returns:
        Dictionary mapping predictor names to instruction strings
    """
    instructions = {}

    # Get all predictors from the module
    for name, predictor in module.named_predictors():
        if hasattr(predictor, "signature") and hasattr(
            predictor.signature, "instructions"
        ):
            instructions[name] = predictor.signature.instructions

    return instructions


def extract_demos(module: dspy.Module) -> dict[str, list[dict]]:
    """
    Extract few-shot demonstrations from a DSPy module.

    Args:
        module: Optimized DSPy module

    Returns:
        Dictionary mapping predictor names to lists of demos
    """
    all_demos = {}

    for name, predictor in module.named_predictors():
        if hasattr(predictor, "demos"):
            demos = []
            for demo in predictor.demos:
                if hasattr(demo, "toDict"):
                    demos.append(demo.toDict())
                elif isinstance(demo, dict):
                    demos.append(demo)
            all_demos[name] = demos

    return all_demos


def export_to_text(
    module: dspy.Module,
    output_path: Path | str,
    include_demos: bool = True,
) -> None:
    """
    Export optimized prompts to a human-readable text file.

    Args:
        module: Optimized DSPy module
        output_path: Path to save text file
        include_demos: Whether to include few-shot demonstrations
    """
    output_path = Path(output_path)

    with open(output_path, "w") as f:
        f.write("# Optimized Flag Extraction Prompts\n\n")
        f.write(
            "This file contains the optimized prompts from DSPy optimization.\n"
        )
        f.write("Use these instructions in your production system.\n\n")
        f.write("=" * 80 + "\n\n")

        # Extract and write instructions
        instructions = extract_signature_instructions(module)

        for predictor_name, instruction in instructions.items():
            f.write(f"## {predictor_name}\n\n")
            f.write("**Instructions:**\n\n")
            f.write(f"{instruction}\n\n")
            f.write("-" * 80 + "\n\n")

        # Extract and write demos if requested
        if include_demos:
            f.write("\n## Few-Shot Examples\n\n")
            demos = extract_demos(module)

            for predictor_name, predictor_demos in demos.items():
                f.write(f"### {predictor_name}\n\n")
                for i, demo in enumerate(predictor_demos, 1):
                    f.write(f"**Example {i}:**\n\n")
                    f.write(f"```json\n{json.dumps(demo, indent=2)}\n```\n\n")
                f.write("-" * 80 + "\n\n")

    print(f"Exported to {output_path}")


def export_to_json(
    module: dspy.Module,
    output_path: Path | str,
    include_metadata: bool = True,
) -> None:
    """
    Export optimized prompts to a structured JSON file.

    Args:
        module: Optimized DSPy module
        output_path: Path to save JSON file
        include_metadata: Whether to include metadata
    """
    output_path = Path(output_path)

    data: dict[str, Any] = {
        "instructions": extract_signature_instructions(module),
        "demos": extract_demos(module),
    }

    if include_metadata:
        data["metadata"] = {
            "module_type": module.__class__.__name__,
            "predictors": list(module.named_predictors()),
        }

    with open(output_path, "w") as f:
        json.dump(data, f, indent=2)

    print(f"Exported to {output_path}")


def export_typescript_types(
    output_path: Path | str,
) -> None:
    """
    Generate TypeScript type definitions for the flag structure.

    This creates a .ts file that matches the backend schema and can be
    used for type-safe integration.

    Args:
        output_path: Path to save TypeScript file
    """
    output_path = Path(output_path)

    typescript_content = '''/**
 * TypeScript definitions for flag extraction prompts.
 * Auto-generated from DSPy optimization.
 */

export interface OptimizedPrompts {
  instructions: {
    [predictorName: string]: string;
  };
  demos?: {
    [predictorName: string]: Array<{
      transcript: string;
      salesperson_context: string;
      [key: string]: any;
    }>;
  };
  metadata?: {
    module_type: string;
    predictors: string[];
  };
}

export interface FlagData {
  revision: 'v1';
  flag_title: string;
  confidenceOutOf100: number;
  validation_checklist: string[];
  what_happened: string;
  revenue_impact: string;
  better_response: string;
  benchmarking_context: string;
  pattern_analysis?: string;
  role_expectation: string;
  why_this_matters: string;
  timestamps: {
    start?: string;
    end?: string;
  };
}

export interface ExtractionInput {
  transcript: string;
  salesperson_context: string;
}
'''

    with open(output_path, "w") as f:
        f.write(typescript_content)

    print(f"Exported TypeScript types to {output_path}")


def export_all(
    module: dspy.Module,
    output_dir: Path | str = "exports",
    prefix: str = "optimized",
) -> dict[str, str]:
    """
    Export optimized module in all formats.

    Args:
        module: Optimized DSPy module
        output_dir: Directory to save exports
        prefix: Prefix for output files

    Returns:
        Dictionary mapping export type to file path
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(exist_ok=True)

    exports = {}

    # Export to text
    text_path = output_dir / f"{prefix}_prompts.txt"
    export_to_text(module, text_path)
    exports["text"] = str(text_path)

    # Export to JSON
    json_path = output_dir / f"{prefix}_prompts.json"
    export_to_json(module, json_path)
    exports["json"] = str(json_path)

    # Export TypeScript types
    ts_path = output_dir / f"{prefix}_types.ts"
    export_typescript_types(ts_path)
    exports["typescript"] = str(ts_path)

    # Save the full module
    module_path = output_dir / f"{prefix}_module.json"
    module.save(str(module_path))
    exports["module"] = str(module_path)

    print(f"\nAll exports completed in {output_dir}/")
    return exports


def load_optimized_module(module_path: Path | str, module_class: type):
    """
    Load a previously saved optimized module.

    Args:
        module_path: Path to saved module JSON
        module_class: Class to instantiate (FlagExtractor or MultiStageFlagExtractor)

    Returns:
        Loaded module instance
    """
    module = module_class()
    module.load(str(module_path))
    return module


if __name__ == "__main__":
    # Example usage
    from flag_extractor import FlagExtractor
    from config import configure_lm

    # Configure LM
    configure_lm()

    # Create a module (in practice, this would be your optimized module)
    module = FlagExtractor()

    # Export in all formats
    exports = export_all(module, output_dir="exports", prefix="example")

    print("\nExported files:")
    for export_type, path in exports.items():
        print(f"  {export_type}: {path}")