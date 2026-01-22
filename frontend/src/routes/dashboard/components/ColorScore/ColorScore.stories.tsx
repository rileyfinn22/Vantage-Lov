import type { Meta, StoryObj } from '@storybook/react-vite';
import { OverallScore } from './ColorScore';

const meta = {
    title: 'Dashboard/Color Score',
    component: OverallScore,
    argTypes: {
        score: {
            control: {
                type: 'range',
            },
        },
    },
} satisfies Meta<typeof OverallScore>;
export default meta;
type Story = StoryObj<typeof OverallScore>;

export const Basic: Story = {
    args: {
        score: 90,
    },
};
