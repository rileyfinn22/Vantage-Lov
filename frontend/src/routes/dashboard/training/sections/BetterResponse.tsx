import { tw } from '#util/tw';
import { Lightbulb, Copy, Check } from 'lucide-react';
import { useState } from 'react';

const SectionHeader = tw.h2`text-lg font-semibold flex items-center gap-2`;

interface BetterResponseProps {
    flagData: any;
}

// Parse better response - handles both new array format and legacy string format
function getBetterResponses(betterResponse: string | string[] | undefined): string[] {
    if (!betterResponse) {
        return [];
    }

    // New format: already an array
    if (Array.isArray(betterResponse)) {
        return betterResponse.filter((s) => s && s.length > 0);
    }

    // Legacy format: string with "Option 1:" / "Option 2:" markers
    const text = betterResponse;

    // Split by "Option N:" markers (with or without asterisks, case insensitive)
    const parts = text.split(/\*?Option\s+\d+:\*?\s*/i);

    if (parts.length >= 2) {
        // Extract content, removing surrounding quotes (including curly quotes)
        const extractContent = (str: string) => {
            let cleaned = str.trim();
            // Remove surrounding single quotes (straight and curly)
            cleaned = cleaned.replace(/^[''']/, '').replace(/[''']$/, '');
            // Remove surrounding double quotes (straight and curly)
            cleaned = cleaned.replace(/^[""]/, '').replace(/[""]$/, '');
            return cleaned.trim();
        };

        // Filter out empty parts and extract content
        return parts
            .filter((p) => p.trim().length > 0)
            .map(extractContent)
            .filter((s) => s.length > 0);
    }

    // Fallback: return the whole text as a single response
    return [text.trim()];
}

export function BetterResponse({ flagData }: BetterResponseProps) {
    const betterResponses = getBetterResponses(flagData.flagData?.better_response);
    const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

    const handleCopy = (text: string, idx: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIdx(idx);
        setTimeout(() => setCopiedIdx(null), 2000);
    };

    return (
        <>
            <SectionHeader>
                <Lightbulb className="w-5 h-5" />
                Better Responses
            </SectionHeader>

            {/* Script-style better responses */}
            <div className="space-y-3">
                {betterResponses.length > 0 ? (
                    betterResponses.map((response, idx) => (
                        <div key={idx} className="bg-success/5 rounded-lg p-4 border border-success/20">
                            <div className="text-sm leading-relaxed mb-3">"{response}"</div>
                            <button type="button" onClick={() => handleCopy(response, idx)} className="btn btn-outline btn-xs gap-1">
                                {copiedIdx === idx ? (
                                    <>
                                        <Check className="w-3 h-3" />
                                        Copied!
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-3 h-3" />
                                        Copy
                                    </>
                                )}
                            </button>
                        </div>
                    ))
                ) : (
                    <div className="alert alert-warning">
                        <Lightbulb className="w-5 h-5" />
                        <span>No better response data available</span>
                    </div>
                )}
            </div>
        </>
    );
}
