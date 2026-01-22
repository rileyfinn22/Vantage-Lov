"""
Flag Extractor using DSPy for prompt optimization.

This module extracts structured flags from sales call interactions.
The flag structure is based on the database schema in backend/src/data/schema.ts
"""

import dspy
from pydantic import BaseModel, Field

from signatures import (
    AnalyzeInteraction,
    AssessImpact,
    GenerateGuidance,
    BuildValidation,
    CompleteFlagExtraction,
)


class FlagData(BaseModel):
    """
    Structured flag data matching the schema from backend/src/data/schema.ts

    Flag structure (revision v1):
    - flag_title: Brief title of the issue
    - confidenceOutOf100: Confidence level (0-100)
    - validation_checklist: List of validation points
    - what_happened: Description of what occurred
    - revenue_impact: Impact on revenue
    - better_response: Suggested improvement
    - benchmarking_context: Context for comparison
    - pattern_analysis: Optional pattern identification
    - role_expectation: Expected behavior for the role
    - why_this_matters: Importance explanation
    - timestamps: Start and end timestamps
    """

    revision: str = Field(default="v1", description="Flag data revision version")
    flag_title: str = Field(description="Brief title describing the flag")
    confidenceOutOf100: int = Field(ge=0, le=100, description="Confidence level 0-100")
    validation_checklist: list[str] = Field(description="List of validation criteria")
    what_happened: str = Field(
        description="Description of what occurred in the interaction"
    )
    revenue_impact: str = Field(description="Analysis of revenue impact")
    better_response: str = Field(description="Suggested better response or approach")
    benchmarking_context: str = Field(description="Benchmarking or context information")
    pattern_analysis: None | str = Field(
        default=None, description="Optional pattern analysis"
    )
    role_expectation: str = Field(description="Expected behavior for this role")
    why_this_matters: str = Field(description="Explanation of importance")
    timestamps: dict[str, str | None] = Field(
        description="Start and end timestamps",
        default_factory=lambda: {"start": None, "end": None},
    )


class FlagExtractor(dspy.Module):
    """
    Single-stage DSPy module for extracting flags from sales call transcripts.

    This module uses Chain of Thought reasoning to analyze sales calls
    and extract structured flag data in one pass.
    """

    def __init__(self):
        super().__init__()
        self.extract = dspy.ChainOfThought(CompleteFlagExtraction)

    def forward(self, transcript: str, salesperson_context: str = "") -> FlagData:
        """
        Extract flag data from a transcript.

        Args:
            transcript: Raw text of the sales call
            salesperson_context: Additional context about the salesperson

        Returns:
            FlagData object with extracted information
        """
        result = self.extract(
            transcript=transcript, salesperson_context=salesperson_context
        )

        # Convert to FlagData
        return FlagData(
            revision="v1",
            flag_title=result.flag_title,
            confidenceOutOf100=result.confidence_out_of_100,
            validation_checklist=result.validation_checklist,
            what_happened=result.what_happened,
            revenue_impact=result.revenue_impact,
            better_response=result.better_response,
            benchmarking_context=result.benchmarking_context,
            pattern_analysis=result.pattern_analysis,
            role_expectation=result.role_expectation,
            why_this_matters=result.why_this_matters,
            timestamps=result.timestamps,
        )


class MultiStageFlagExtractor(dspy.Module):
    """
    Multi-stage DSPy module that breaks flag extraction into modular components.

    This approach allows DSPy to optimize each stage independently, potentially
    leading to better overall results. It chains together:
    1. AnalyzeInteraction - Identify what happened
    2. AssessImpact - Evaluate business impact
    3. GenerateGuidance - Create actionable recommendations
    4. BuildValidation - Generate title and validation checklist
    """

    def __init__(self):
        super().__init__()
        self.analyze = dspy.ChainOfThought(AnalyzeInteraction)
        self.assess = dspy.ChainOfThought(AssessImpact)
        self.guide = dspy.ChainOfThought(GenerateGuidance)
        self.validate = dspy.ChainOfThought(BuildValidation)

    def forward(self, transcript: str, salesperson_context: str = "") -> FlagData:
        """
        Extract flag data from a transcript using multi-stage processing.

        Args:
            transcript: Raw text of the sales call
            salesperson_context: Additional context about the salesperson

        Returns:
            FlagData object with extracted information
        """
        # Stage 1: Analyze what happened
        analysis = self.analyze(
            transcript=transcript, salesperson_context=salesperson_context
        )

        # Stage 2: Assess impact
        impact = self.assess(
            what_happened=analysis.what_happened,
            salesperson_context=salesperson_context,
        )

        # Stage 3: Generate guidance
        guidance = self.guide(
            what_happened=analysis.what_happened,
            salesperson_context=salesperson_context,
            role_expectation=impact.role_expectation,
        )

        # Stage 4: Build validation
        validation = self.validate(
            what_happened=analysis.what_happened,
            better_response=guidance.better_response,
            role_expectation=impact.role_expectation,
        )

        # Combine all results
        return FlagData(
            revision="v1",
            flag_title=validation.flag_title,
            confidenceOutOf100=validation.confidence_score,
            validation_checklist=validation.validation_checklist,
            what_happened=analysis.what_happened,
            revenue_impact=impact.revenue_impact,
            better_response=guidance.better_response,
            benchmarking_context=guidance.benchmarking_context,
            pattern_analysis=guidance.pattern_analysis,
            role_expectation=impact.role_expectation,
            why_this_matters=impact.why_this_matters,
            timestamps=analysis.timestamps,
        )


# Legacy optimizer class - moved to optimizer.py
# Keeping for backwards compatibility


def extract_flag(
    transcript: str, salesperson_context: str = "", use_multistage: bool = False
) -> dict:
    """
    Convenience function to extract a flag from a transcript.

    Args:
        transcript: Raw sales call transcript
        salesperson_context: Context about the salesperson
        use_multistage: If True, use MultiStageFlagExtractor instead of single-stage

    Returns:
        Dictionary representation of the flag data
    """
    if use_multistage:
        extractor = MultiStageFlagExtractor()
    else:
        extractor = FlagExtractor()

    flag_data = extractor(transcript, salesperson_context)
    return flag_data.model_dump()


if __name__ == "__main__":
    # Example usage
    from config import configure_lm

    sample_transcript = """
    Salesperson: Hi, thanks for taking the call today.
    Prospect: Sure, what's this about?
    Salesperson: Well, I wanted to tell you about our amazing product.
    Prospect: I'm actually quite busy...
    Salesperson: This will only take a few minutes!
    """

    # Configure DSPy (defaults to Ollama)
    configure_lm()

    result = extract_flag(
        sample_transcript, salesperson_context="Junior SDR, 3 months experience"
    )
    print(result)
