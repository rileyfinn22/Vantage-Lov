import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { Sidebar } from './Sidebar';
import { describe, it, expect, beforeEach } from 'vitest';

const mockNavigate = vi.fn();

vi.mock('wouter', () => ({
    useLocation: () => ['/', mockNavigate],
}));

describe('Sidebar', () => {
    beforeEach(() => {
        mockNavigate.mockClear();
    });

    it('renders navigation items for manager role', () => {
        render(<Sidebar userRole="manager" />);

        expect(screen.getAllByText('Dashboard')).toHaveLength(2);
        expect(screen.getAllByText('Insights')).toHaveLength(2);
        expect(screen.getAllByText('Training')).toHaveLength(2);
        expect(screen.getAllByText('Team')).toHaveLength(2);
        expect(screen.getAllByText('Call Library')).toHaveLength(2);
        expect(screen.getAllByText('Flag Tuning')).toHaveLength(2);
    });

    it('renders limited navigation items for rep role', () => {
        render(<Sidebar userRole="rep" />);

        expect(screen.getAllByText('Dashboard')).toHaveLength(2);
        expect(screen.getAllByText('Insights')).toHaveLength(2);
        expect(screen.getAllByText('Training')).toHaveLength(2);
        expect(screen.getAllByText('Call Library')).toHaveLength(2);

        expect(screen.queryByText('Team')).not.toBeInTheDocument();
        expect(screen.queryByText('Flag Tuning')).not.toBeInTheDocument();
    });

    it('navigates when clicking nav items', async () => {
        const user = userEvent.setup();
        render(<Sidebar userRole="manager" />);

        await user.click(screen.getAllByText('Insights')[0]);

        expect(mockNavigate).toHaveBeenCalledWith('/insights');
    });

    it('toggles collapsed state when clicking collapse button', async () => {
        const user = userEvent.setup();
        render(<Sidebar userRole="manager" />);

        const collapseButton = screen.getByText('Collapse');
        expect(collapseButton).toBeInTheDocument();

        await user.click(collapseButton);

        expect(screen.queryByText('Collapse')).not.toBeInTheDocument();
    });
});
