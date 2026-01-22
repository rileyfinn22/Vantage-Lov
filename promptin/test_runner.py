"""
Simple test runner for flag extractor.
Reads TOML test files and runs them through the extractor.
"""

import tomllib
from pathlib import Path
from flag_extractor import extract_flag
from config import configure_lm
import dspy


def load_test_cases(test_dir: Path) -> list[dict]:
    """Load all test case TOML files from the test directory."""
    test_cases = []
    for toml_file in sorted(test_dir.glob("*.toml")):
        with open(toml_file, "rb") as f:
            data = tomllib.load(f)
            data["filename"] = toml_file.name
            test_cases.append(data)
    return test_cases


def run_tests():
    """Run all tests and print results."""
    # Configure DSPy (defaults to Ollama with smallthinker:3b)
    configure_lm()

    test_dir = Path(__file__).parent / "tests"
    test_cases = load_test_cases(test_dir)

    print(f"\n{'='*60}")
    print(f"Running {len(test_cases)} test case(s)")
    print(f"{'='*60}\n")

    for i, test_case in enumerate(test_cases, 1):
        filename = test_case["filename"]
        transcript = test_case["transcript"]
        context = test_case["salesperson_context"]
        expected_title = test_case.get("expected_flag_title", "N/A")

        print(f"Test {i}: {filename}")
        print(f"Expected: {expected_title}")
        print("-" * 60)

        try:
            # Run the flag extractor
            result = extract_flag(transcript, context)

            print(f"✓ Flag extracted successfully")
            print(f"  Title: {result['flag_title']}")
            print(f"  Confidence: {result['confidenceOutOf100']}/100")
            print(f"  What happened: {result['what_happened'][:100]}...")
            print(f"  Better response: {result['better_response'][:100]}...")
            print()

        except Exception as e:
            print(f"✗ Error: {e}")
            print()

    print(f"{'='*60}")
    print("Tests complete!")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    run_tests()