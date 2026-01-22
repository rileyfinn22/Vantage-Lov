import { tw } from '#util/tw';
import './colorscore.css';
const _OverallScore = tw.span`ml-2 p-[1px]
            border border-(--font-color) rounded
            max-w-[2in] w-fit
            x-calced-background
            `;

export const OverallScore = (props: { score: number; label: string | React.ReactNode }) => {
    const { label = `Overall ${props.score}` } = props;
    return <_OverallScore style={{ '--points': `${props.score}%` } as React.CSSProperties}>{label}</_OverallScore>;
};
