import type { Meta, StoryObj } from '@storybook/react-vite';
import { SelectedRepPage } from './SelectedRep';
import { faker } from '@faker-js/faker';

const meta = {
    title: 'Dashboard/Selected Representative',
    component: SelectedRepPage,
    decorators: [
        (Story) => (
            <div className="max-w-3xl">
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof SelectedRepPage>;
export default meta;
type Story = StoryObj<typeof SelectedRepPage>;

export const Basic: Story = {
    args: {
        // compliance: 80,
        week: {
            revenue: {
                amount: 12_000,
            },
            score: {
                score: 85,
            },
        },
        rep: {
            firstName: faker.person.firstName(),
            lastName: faker.person.lastName(),
            avatar: faker.image.dataUri({
                width: 100,
                height: 100,
                color: 'lightblue',
            }),
            id: 0,
        },
        insights: {
            kudos: ['High customer satisfaction', 'Increased sales in Q3'],
            flags: ['Low response time', 'Undergoing training on sales pitches for NEW PRODUCT A'],
        },
    },
};
