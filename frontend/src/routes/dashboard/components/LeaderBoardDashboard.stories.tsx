import type { Meta, StoryObj } from '@storybook/react-vite';
import { Dashboard } from './dashboard';
import { faker } from '@faker-js/faker';

const meta = {
    title: 'Dashboard/LeaderBoard Dashboard',
    component: Dashboard,
} satisfies Meta<typeof Dashboard>;
export default meta;
type Story = StoryObj<typeof Dashboard>;

export const Basic: Story = {
    args: {
        leaderboard: [
            {
                id: 1,
                firstName: 'John',
                lastName: 'Doe',
                avatar: faker.image.dataUri({
                    width: 100,
                    height: 100,
                    color: 'lightblue',
                }),
                score: 42,
                flags: 0,
                revenue: 0,
                mtdRevenue: 0,
                battleCardTasks: 0,
                skillsTasks: 0,
                createdAt: null,
                companyId: 0,
                associatedUserId: null,
            },
            {
                id: 2,
                firstName: 'Jane',
                lastName: 'Smith',
                avatar: faker.image.dataUri({
                    width: 70,
                    height: 70,
                    color: 'lightgreen',
                }),
                score: 85,
                flags: 0,
                revenue: 0,
                mtdRevenue: 0,
                battleCardTasks: 0,
                skillsTasks: 0,
                createdAt: null,
                companyId: 0,
                associatedUserId: null,
            },
            {
                id: 3,
                firstName: 'Alice',
                lastName: 'Wood',
                avatar: faker.image.dataUri({
                    width: 100,
                    height: 100,
                    color: 'grey',
                }),
                score: 42,
                flags: 3,
                revenue: 0,
                mtdRevenue: 0,
                battleCardTasks: 1,
                skillsTasks: 2,
                createdAt: null,
                companyId: 0,
                associatedUserId: null,
            },
        ],
        star: {
            id: 4,
            firstName: 'Star',
            lastName: 'Rep',
            avatar: faker.image.dataUri({
                width: 100,
                height: 100,
                color: 'gold',
            }),
            score: 100,
            flags: 0,
            revenue: 0,
            mtdRevenue: 0,
            battleCardTasks: 0,
            skillsTasks: 0,
            createdAt: null,
            companyId: 0,
            associatedUserId: null,
        },
    },
};
