"""
Evaluation metrics for flag extraction quality.

These metrics are used during DSPy optimization to guide prompt improvement.
"""

from typing import Any
import dspy


def field_completeness_score(flag_data: dict[str, Any]) -> float:
    """
    Score based on presence and quality of required fields.

    Returns a score between 0.0 and 1.0 based on:
    - Presence of all required fields
    - Non-empty string fields
    - Valid numeric ranges
    - List fields having reasonable length
    """
    score = 0.0
    max_score = 10.0

    # Required string fields - 1 point each if present and non-trivial
    string_fields = [
        "flag_title",
        "what_happened",
        "revenue_impact",
        "better_response",
        "benchmarking_context",
        "role_expectation",
        "why_this_matters",
    ]

    for field in string_fields:
        value = flag_data.get(field, "")
        if value and len(str(value).strip()) > 20:  # Non-trivial content
            score += 1.0

    # Confidence score validation - 1 point if in valid range
    confidence = flag_data.get("confidenceOutOf100", -1)
    if 0 <= confidence <= 100:
        score += 1.0

    # Validation checklist - 1 point if present with 2+ items
    checklist = flag_data.get("validation_checklist", [])
    if isinstance(checklist, list) and len(checklist) >= 2:
        score += 1.0

    # Timestamps - 0.5 points if structure exists
    timestamps = flag_data.get("timestamps", {})
    if isinstance(timestamps, dict):
        score += 0.5

    return min(score / max_score, 1.0)


def semantic_quality_score(flag_data: dict[str, Any]) -> float:
    """
    Score based on semantic quality of text fields.

    Checks for:
    - Reasonable length (not too short, not too long)
    - Specificity (mentions specific behaviors, not generic)
    - Actionability (for better_response field)
    """
    score = 0.0
    max_score = 6.0

    # What happened - should be specific and clear
    what_happened = flag_data.get("what_happened", "")
    if what_happened:
        length = len(what_happened)
        if 50 <= length <= 500:  # Reasonable length
            score += 1.0
        # Check for specificity indicators
        if any(
            indicator in what_happened.lower()
            for indicator in [
                "didn't ask",
                "skipped",
                "jumped to",
                "failed to",
                "missed",
            ]
        ):
            score += 0.5

    # Better response - should be actionable and specific
    better_response = flag_data.get("better_response", "")
    if better_response:
        length = len(better_response)
        if 50 <= length <= 800:  # Reasonable length for guidance
            score += 1.0
        # Check for action words
        if any(
            word in better_response.lower()
            for word in ["should", "could", "ask", "say", "try", "start with"]
        ):
            score += 0.5

    # Revenue impact - should connect to business outcomes
    revenue_impact = flag_data.get("revenue_impact", "")
    if revenue_impact:
        if any(
            term in revenue_impact.lower()
            for term in [
                "revenue",
                "deal",
                "conversion",
                "pipeline",
                "close rate",
                "velocity",
            ]
        ):
            score += 1.0

    # Flag title - should be concise
    flag_title = flag_data.get("flag_title", "")
    if flag_title:
        word_count = len(flag_title.split())
        if 3 <= word_count <= 12:  # Good title length
            score += 1.0

    # Role expectation - should be clear
    role_expectation = flag_data.get("role_expectation", "")
    if role_expectation and len(role_expectation) > 30:
        score += 1.0

    # Why this matters - should explain importance
    why_this_matters = flag_data.get("why_this_matters", "")
    if why_this_matters and len(why_this_matters) > 30:
        score += 0.5

    return min(score / max_score, 1.0)


def confidence_calibration_score(flag_data: dict[str, Any]) -> float:
    """
    Score based on whether confidence aligns with output quality.

    High confidence should correspond to specific, detailed outputs.
    Low confidence might be appropriate for ambiguous cases.
    """
    confidence = flag_data.get("confidenceOutOf100", 50)

    # Get quality indicators
    what_happened = flag_data.get("what_happened", "")
    better_response = flag_data.get("better_response", "")
    validation_checklist = flag_data.get("validation_checklist", [])

    quality_indicators = 0
    if len(what_happened) > 100:
        quality_indicators += 1
    if len(better_response) > 100:
        quality_indicators += 1
    if len(validation_checklist) >= 3:
        quality_indicators += 1

    # High confidence (>80) should have high quality
    if confidence > 80:
        if quality_indicators >= 2:
            return 1.0
        else:
            return 0.3  # Penalize overconfidence

    # Medium confidence (50-80) - flexible
    if 50 <= confidence <= 80:
        return 0.8  # Reasonable middle ground

    # Low confidence (<50) - should still have some quality
    if confidence < 50:
        if quality_indicators >= 1:
            return 0.6
        else:
            return 0.4  # Appropriate low confidence

    return 0.5


def flag_extraction_metric(
    example: dspy.Example, pred: dspy.Prediction, trace: Any | None = None
) -> float:
    """
    Combined metric for flag extraction quality.

    This is the main metric used by DSPy optimizers. It combines:
    - Field completeness (40%)
    - Semantic quality (40%)
    - Confidence calibration (20%)

    Args:
        example: Ground truth example (may not have full expected output)
        pred: Predicted output from the model
        trace: Optional execution trace

    Returns:
        Score between 0.0 and 1.0
    """
    # Extract flag data from prediction
    if hasattr(pred, "flag_data"):
        flag_data = (
            pred.flag_data.model_dump()
            if hasattr(pred.flag_data, "model_dump")
            else pred.flag_data
        )
    else:
        # For modular predictions, construct flag_data from individual fields
        flag_data = {
            "flag_title": getattr(pred, "flag_title", ""),
            "confidenceOutOf100": getattr(pred, "confidence_out_of_100", 50),
            "validation_checklist": getattr(pred, "validation_checklist", []),
            "what_happened": getattr(pred, "what_happened", ""),
            "revenue_impact": getattr(pred, "revenue_impact", ""),
            "better_response": getattr(pred, "better_response", ""),
            "benchmarking_context": getattr(pred, "benchmarking_context", ""),
            "pattern_analysis": getattr(pred, "pattern_analysis", None),
            "role_expectation": getattr(pred, "role_expectation", ""),
            "why_this_matters": getattr(pred, "why_this_matters", ""),
            "timestamps": getattr(
                pred, "timestamps", {"start": None, "end": None}
            ),
        }

    # Calculate component scores
    completeness = field_completeness_score(flag_data)
    quality = semantic_quality_score(flag_data)
    calibration = confidence_calibration_score(flag_data)

    # Weighted combination
    total_score = (completeness * 0.4) + (quality * 0.4) + (calibration * 0.2)

    return total_score


def title_match_metric(
    example: dspy.Example, pred: dspy.Prediction, trace: Any | None = None
) -> float:
    """
    Metric that checks if the predicted flag title matches expected title.

    This is useful when you have ground truth titles in your test cases.
    Returns 1.0 for exact match, partial score for semantic similarity.
    """
    expected_title = getattr(example, "expected_flag_title", None)
    if not expected_title:
        # No ground truth, fall back to general metric
        return flag_extraction_metric(example, pred, trace)

    # Get predicted title
    if hasattr(pred, "flag_data"):
        flag_data = (
            pred.flag_data.model_dump()
            if hasattr(pred.flag_data, "model_dump")
            else pred.flag_data
        )
        predicted_title = flag_data.get("flag_title", "")
    else:
        predicted_title = getattr(pred, "flag_title", "")

    # Exact match
    if predicted_title.lower().strip() == expected_title.lower().strip():
        return 1.0

    # Partial match - check for key words
    expected_words = set(expected_title.lower().split())
    predicted_words = set(predicted_title.lower().split())

    if len(expected_words) == 0:
        return 0.0

    overlap = len(expected_words & predicted_words) / len(expected_words)

    # Combine with general quality
    general_score = flag_extraction_metric(example, pred, trace)

    return (overlap * 0.5) + (general_score * 0.5)