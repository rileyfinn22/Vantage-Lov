import { faker } from '@faker-js/faker';
import { LeaderboardEntry } from './LeaderBoard';
import type { Meta } from '@storybook/react-vite';

const meta = {
    title: 'Dashboard/LeaderBoard Entry',
    component: LeaderboardEntry,
} satisfies Meta<typeof LeaderboardEntry>;
export default meta;

export const BasicEntry = {
    args: {
        name: 'John Doe',
        avatar: faker.image.dataUri({
            width: 100,
            height: 100,
            color: 'lightblue',
        }),
        score: 42,
    },
};

export const BasicEntryWithFlags = {
    args: {
        name: 'John Doe',
        avatar: faker.image.dataUri({
            width: 100,
            height: 100,
            color: 'lightblue',
        }),
        score: 42,
        flags: 3,
    },
};

export const StarEntry = {
    args: {
        name: 'Jane Smith',
        star: true,
        avatar: faker.image.dataUri({
            width: 100,
            height: 100,
            color: 'lightgreen',
        }),
        score: 85,
    },
};
