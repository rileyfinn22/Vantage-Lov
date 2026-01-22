import type { Rating, RepInfo, Revenue, Insights } from '#data/dashboard';
import { tw } from '#util/tw';
import { Flag, ThumbsUp } from 'lucide-react';

const SelectedRepLayout = tw.div`grid grid-cols-1 gap-4 p-4`;
const ProfileAndName = tw.section`flex items-center gap-4`;
const Section = tw.section`border p-4 rounded-md shadow-md`;
const InsightsList = tw.ul`pl-4`;
const ProfileImage = tw.div`p-2 border rounded-lg`;

export function SelectedRepPage(props: {
    rep: RepInfo;
    week: {
        revenue: Revenue;
        score: Rating;
    };
    insights: Insights;
}) {
    const {
        week: {
            revenue: { amount },
            score: { score },
        },
    } = props;
    return (
        <SelectedRepLayout>
            {/* Profile Section */}
            <ProfileAndName>
                <ProfileImage>
                    <img src={props.rep.avatar ?? ''} alt="Representative Avatar" className="w-16 h-16 rounded-full" />
                </ProfileImage>
                <div>
                    <h2 className="text-lg font-bold">{props.rep.firstName}'s overview for this week</h2>
                    <ul>
                        <li>Revenue: ${amount}</li>
                        <li>Performance: {score}</li>
                    </ul>
                </div>
            </ProfileAndName>

            {/* Insights Section */}
            <Section>
                <h3 className="text-md font-semibold">Insights</h3>
                <InsightsList>
                    {props.insights?.flags.map((insight, _index) => (
                        <li key={insight} className="flex items-start gap-2">
                            <Flag className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{insight}</span>
                        </li>
                    ))}
                    {props.insights?.kudos.map((kudo, _index) => (
                        <li key={kudo} className="flex items-start gap-2">
                            <ThumbsUp className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{kudo}</span>
                        </li>
                    ))}
                </InsightsList>
            </Section>
        </SelectedRepLayout>
    );
}
