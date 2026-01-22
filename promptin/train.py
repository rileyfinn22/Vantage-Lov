"""
Training script for flag extraction optimization.

This is the main entry point for training and optimizing flag extraction prompts.
Run with: uv run python train.py
"""

import argparse

from optimizer import optimize_from_tests
from exporter import export_all, load_optimized_module
from flag_extractor import FlagExtractor, MultiStageFlagExtractor


def main():
    parser = argparse.ArgumentParser(
        description="Train and optimize flag extraction prompts with DSPy"
    )

    # Model configuration
    parser.add_argument(
        "--provider",
        type=str,
        default="ollama",
        choices=["ollama", "openai", "anthropic"],
        help="Language model provider",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Specific model name (defaults to provider's default)",
    )

    # Optimization configuration
    parser.add_argument(
        "--mode",
        type=str,
        default="light",
        choices=["micro", "light", "medium", "heavy"],
        help="Optimization mode (micro=fastest/minimal, light=fast, heavy=thorough)",
    )
    parser.add_argument(
        "--module-type",
        type=str,
        default="single",
        choices=["single", "multi"],
        help="Module type: single-stage or multi-stage",
    )

    # Data configuration
    parser.add_argument(
        "--test-dir",
        type=str,
        default="tests",
        help="Directory containing test case TOML files",
    )
    parser.add_argument(
        "--val-size",
        type=int,
        default=1,
        help="Number of examples to use for validation",
    )

    # Output configuration
    parser.add_argument(
        "--output",
        type=str,
        default="optimized_extractor.json",
        help="Path to save optimized module",
    )
    parser.add_argument(
        "--export-dir",
        type=str,
        default="exports",
        help="Directory for prompt exports",
    )
    parser.add_argument(
        "--no-export",
        action="store_true",
        help="Skip exporting prompts to text/JSON",
    )

    args = parser.parse_args()

    print("\n" + "=" * 80)
    print("FLAG EXTRACTION OPTIMIZATION")
    print("=" * 80)
    print("\nConfiguration:")
    print(f"  Provider: {args.provider}")
    if args.model:
        print(f"  Model: {args.model}")
    print(f"  Optimization mode: {args.mode}")
    print(f"  Module type: {args.module_type}")
    print(f"  Test directory: {args.test_dir}")
    print(f"  Validation size: {args.val_size}")
    print(f"  Output: {args.output}")
    print(f"  Export directory: {args.export_dir}")
    print()

    # Run optimization
    try:
        results = optimize_from_tests(
            test_dir=args.test_dir,
            output_path=args.output,
            module_type=args.module_type,
            optimization_mode=args.mode,
            val_size=args.val_size,
            lm_provider=args.provider,
            lm_model=args.model,
        )

        print("\n" + "=" * 80)
        print("OPTIMIZATION COMPLETE")
        print("=" * 80)
        print("\nResults:")
        print(f"  Training examples: {results['train_size']}")
        print(f"  Validation examples: {results['val_size']}")
        print(f"  Validation score: {results['val_score']:.3f}")
        print(f"  Saved to: {results['output_path']}")

        # Export prompts
        if not args.no_export:
            print(f"\n{'=' * 80}")
            print("EXPORTING PROMPTS")
            print("=" * 80 + "\n")

            # Load the optimized module
            module_class = (
                MultiStageFlagExtractor
                if args.module_type == "multi"
                else FlagExtractor
            )
            optimized_module = load_optimized_module(args.output, module_class)

            # Export in all formats
            exports = export_all(
                optimized_module,
                output_dir=args.export_dir,
                prefix="optimized",
            )

            print("\n" + "=" * 80)
            print("EXPORTS COMPLETE")
            print("=" * 80)
            print("\nExported files:")
            for export_type, path in exports.items():
                print(f"  {export_type}: {path}")

        print("\n" + "=" * 80)
        print("ALL DONE!")
        print("=" * 80)
        print("\nNext steps:")
        print("  1. Review the exported prompts in the exports/ directory")
        print(
            "  2. Test the optimized module with: uv run python test_runner.py --optimized"
        )
        print("  3. Integrate the prompts into your backend")
        print()

    except Exception as e:
        print(f"\n{'=' * 80}")
        print("ERROR")
        print("=" * 80)
        print(f"\n{e}\n")
        import traceback

        traceback.print_exc()
        return 1

    return 0


if __name__ == "__main__":
    exit(main())
