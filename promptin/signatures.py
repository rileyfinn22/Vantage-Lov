"""
Modular DSPy signatures for flag extraction.

This module defines composable signatures that break down the flag extraction
process into focused components that can be optimized independently.
"""

import dspy


class AnalyzeInteraction(dspy.Signature):
    """Analyze a sales call interaction to identify what happened."""

    transcript: str = dspy.InputField(desc="The raw sales call transcript")
    salesperson_context: str = dspy.InputField(
        desc="Context about the salesperson (role, experience, company)"
    )

    what_happened: str = dspy.OutputField(
        desc="Clear description of what occurred in the interaction, focusing on the specific behavior or issue"
    )
    timestamps: dict[str, str | None] = dspy.OutputField(
        desc="Start and end timestamps where the issue occurred",
        default_factory=lambda: {"start": None, "end": None},
    )


class AssessImpact(dspy.Signature):
    """Assess the business and revenue impact of a sales interaction issue."""

    what_happened: str = dspy.InputField(desc="Description of what occurred")
    salesperson_context: str = dspy.InputField(desc="Context about the salesperson")

    revenue_impact: str = dspy.OutputField(
        desc="Analysis of how this impacts revenue (lost opportunities, deal velocity, conversion rates)"
    )
    why_this_matters: str = dspy.OutputField(
        desc="Explanation of why this behavior matters for sales success and business outcomes"
    )
    role_expectation: str = dspy.OutputField(
        desc="What the expected behavior should be for someone in this role"
    )


class GenerateGuidance(dspy.Signature):
    """Generate actionable guidance for improving the sales interaction."""

    what_happened: str = dspy.InputField(desc="Description of what occurred")
    salesperson_context: str = dspy.InputField(desc="Context about the salesperson")
    role_expectation: str = dspy.InputField(desc="Expected behavior for the role")

    better_response: str = dspy.OutputField(
        desc="Specific, actionable suggestion for what the salesperson should have said or done instead"
    )
    benchmarking_context: str = dspy.OutputField(
        desc="Context about how this compares to best practices or top performers"
    )
    pattern_analysis: str | None = dspy.OutputField(
        default=None,
        desc="Optional: Pattern analysis if this is part of a recurring behavioral pattern",
    )


class BuildValidation(dspy.Signature):
    """Build a validation checklist for the identified flag."""

    what_happened: str = dspy.InputField(desc="Description of what occurred")
    better_response: str = dspy.InputField(desc="Suggested improvement")
    role_expectation: str = dspy.InputField(desc="Expected behavior")

    flag_title: str = dspy.OutputField(
        desc="Brief, clear title describing the flag (5-10 words)"
    )
    validation_checklist: list[str] = dspy.OutputField(
        desc="List of 3-5 validation criteria to verify this flag is accurate and actionable"
    )
    confidence_score: int = dspy.OutputField(
        desc="Confidence level 0-100 that this flag is accurate and actionable",
        ge=0,
        le=100,
    )


class CompleteFlagExtraction(dspy.Signature):
    """
    Extract a complete structured flag from a sales call transcript.

    This signature is used for single-stage extraction where all components
    are generated together.
    """

    transcript: str = dspy.InputField(desc="The raw sales call transcript")
    salesperson_context: str = dspy.InputField(
        desc="Context about the salesperson and their role"
    )

    flag_title: str = dspy.OutputField(desc="Brief title describing the flag")
    confidence_out_of_100: int = dspy.OutputField(
        ge=0, le=100, desc="Confidence level 0-100"
    )
    validation_checklist: list[str] = dspy.OutputField(
        desc="List of validation criteria"
    )
    what_happened: str = dspy.OutputField(
        desc="Description of what occurred in the interaction"
    )
    revenue_impact: str = dspy.OutputField(desc="Analysis of revenue impact")
    better_response: str = dspy.OutputField(
        desc="Suggested better response or approach"
    )
    benchmarking_context: str = dspy.OutputField(
        desc="Benchmarking or context information"
    )
    pattern_analysis: str | None = dspy.OutputField(
        default=None, desc="Optional pattern analysis"
    )
    role_expectation: str = dspy.OutputField(desc="Expected behavior for this role")
    why_this_matters: str = dspy.OutputField(desc="Explanation of importance")
    timestamps: dict[str, str | None] = dspy.OutputField(
        desc="Start and end timestamps",
        default_factory=lambda: {"start": None, "end": None},
    )