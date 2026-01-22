import { useTable, useDelete } from '@refinedev/core';
import { useSearchParams } from 'wouter';
import { useState } from 'react';
import {
    useFloating,
    autoUpdate,
    useClick,
    useDismiss,
    useInteractions,
    FloatingPortal,
    FloatingFocusManager,
    FloatingOverlay,
} from '@floating-ui/react';
import { formatDateShort } from '#util';
import { addNotification } from '#/routes/dashboard/layout/Notifications';
import CompanyName from '../core/CompanyName';
import UserName from '../core/UserName';
import InteractionCount from '../interactions/InteractionCount';
import FormFloatingUI from '../forms/FormFloatingUI';
import SalespersonForm from '../forms/SalespersonForm';
import type { GenericCRUDTableProps } from '../types';

interface SalespersonRecord {
    id: number;
    firstName: string;
    lastName: string;
    avatar?: string | null;
    companyId: number;
    associatedUserId?: string | null;
    createdAt: string;
}

const SalespeopleTable = ({ resource }: GenericCRUDTableProps) => {
    const [searchParams] = useSearchParams();
    const selectedCompany = searchParams.get('company') ? Number(searchParams.get('company')) : null;
    const [pageSize, setPageSize] = useState(10);
    const [editingSalesperson, setEditingSalesperson] = useState<SalespersonRecord | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    // Build filters array based on selected company
    const filters = selectedCompany ? [{ field: 'companyId', operator: 'eq' as const, value: selectedCompany }] : [];

    const {
        tableQuery,
        currentPage,
        setCurrentPage,
        pageCount,
        sorters,
        setSorters,
        setPageSize: setTablePageSize,
    } = useTable<SalespersonRecord>({
        resource,
        pagination: { currentPage: 1, pageSize },
        filters: { permanent: filters },
    });

    const { mutate: deleteSalesperson } = useDelete();

    // Create modal floating UI
    const { refs: createRefs, context: createContext } = useFloating({
        open: isCreateModalOpen,
        onOpenChange: setIsCreateModalOpen,
        whileElementsMounted: autoUpdate,
    });

    const createClick = useClick(createContext);
    const createDismiss = useDismiss(createContext, { outsidePress: false });
    const { getReferenceProps: getCreateReferenceProps, getFloatingProps: getCreateFloatingProps } = useInteractions([
        createClick,
        createDismiss,
    ]);

    // Edit modal floating UI
    const { refs: editRefs, context: editContext } = useFloating({
        open: isEditModalOpen,
        onOpenChange: setIsEditModalOpen,
        whileElementsMounted: autoUpdate,
    });

    const editClick = useClick(editContext);
    const editDismiss = useDismiss(editContext, { outsidePress: false });
    const { getReferenceProps: getEditReferenceProps, getFloatingProps: getEditFloatingProps } = useInteractions([editClick, editDismiss]);

    const handlePageSizeChange = (newPageSize: number) => {
        setPageSize(newPageSize);
        setTablePageSize(newPageSize);
        setCurrentPage(1);
    };

    const handleEdit = (salesperson: SalespersonRecord) => {
        setEditingSalesperson(salesperson);
        setIsEditModalOpen(true);
    };

    const handleDelete = async (salesperson: SalespersonRecord) => {
        if (window.confirm(`Are you sure you want to delete "${salesperson.firstName} ${salesperson.lastName}"?`)) {
            try {
                await deleteSalesperson({
                    resource: 'salespeople',
                    id: salesperson.id,
                });
                addNotification('Salesperson deleted successfully', 'success');
            } catch (_error) {
                addNotification('Failed to delete salesperson', 'error');
            }
        }
    };

    const handleFormSuccess = () => {
        setIsCreateModalOpen(false);
        setIsEditModalOpen(false);
        setEditingSalesperson(null);
        tableQuery.refetch();
    };

    const handleFormCancel = () => {
        setIsCreateModalOpen(false);
        setIsEditModalOpen(false);
        setEditingSalesperson(null);
    };

    const { data: tableData, isLoading, error } = tableQuery;

    if (isLoading)
        return (
            <div className="p-4">
                <div className="skeleton h-8 w-64 mb-4"></div>
                <div className="skeleton h-4 w-full mb-2"></div>
                <div className="skeleton h-4 w-3/4 mb-2"></div>
                <div className="skeleton h-4 w-1/2"></div>
            </div>
        );
    if (error)
        return (
            <div>
                Error loading {resource}: {error.message}
            </div>
        );

    const hasNoData = !tableData?.data || tableData.data.length === 0;

    return (
        <div className="p-4">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">Salespeople ({tableData?.total ?? 0} total)</h2>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm">Show:</span>
                        <select
                            className="select select-bordered select-sm w-20"
                            value={pageSize}
                            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                        >
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                        </select>
                        <span className="text-sm">per page</span>
                    </div>
                    <button ref={createRefs.setReference} {...getCreateReferenceProps()} className="btn btn-primary">
                        Add Salesperson
                    </button>
                </div>
            </div>

            {hasNoData ? (
                <div className="text-center py-8 text-base-content/70">
                    No salespeople found. Create your first salesperson to get started.
                </div>
            ) : (
                <>
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>First Name</th>
                                    <th>Last Name</th>
                                    <th>Company</th>
                                    <th>User</th>
                                    <th>Interactions</th>
                                    <th>Created At</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tableData.data.map((item) => (
                                    <tr key={item.id}>
                                        <td>{item.id}</td>
                                        <td>{item.firstName}</td>
                                        <td>{item.lastName}</td>
                                        <td>
                                            <CompanyName companyId={item.companyId} />
                                        </td>
                                        <td>
                                            <UserName userId={item.associatedUserId ?? null} />
                                        </td>
                                        <td>
                                            <InteractionCount salespersonId={item.id} />
                                        </td>
                                        <td>{formatDateShort(item.createdAt)}</td>
                                        <td>
                                            <div className="flex gap-2">
                                                <button onClick={() => handleEdit(item)} className="btn btn-ghost btn-sm">
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(item)}
                                                    className="btn btn-ghost btn-sm text-error hover:bg-error hover:text-error-content"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Controls */}
                    <div className="flex items-center justify-between mt-4">
                        <div className="text-sm text-base-content/70">
                            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, tableData?.total ?? 0)} of{' '}
                            {tableData?.total ?? 0} results
                        </div>
                        <div className="join">
                            <button
                                className="join-item btn btn-sm"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(currentPage - 1)}
                            >
                                Previous
                            </button>
                            {Array.from({ length: Math.min(pageCount, 5) }, (_, i) => {
                                const page = i + 1;
                                return (
                                    <button
                                        key={page}
                                        className={`join-item btn btn-sm ${currentPage === page ? 'btn-active' : ''}`}
                                        onClick={() => setCurrentPage(page)}
                                    >
                                        {page}
                                    </button>
                                );
                            })}
                            <button
                                className="join-item btn btn-sm"
                                disabled={currentPage === pageCount}
                                onClick={() => setCurrentPage(currentPage + 1)}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Create Salesperson Modal */}
            {isCreateModalOpen && (
                <FloatingPortal>
                    <FloatingOverlay
                        lockScroll
                        className="z-50 flex items-center justify-center bg-base-content/50 backdrop-blur-sm p-4"
                        onClick={(event) => {
                            if (event.target === event.currentTarget) {
                                setIsCreateModalOpen(false);
                            }
                        }}
                    >
                        <FloatingFocusManager context={createContext} modal>
                            <div
                                ref={createRefs.setFloating}
                                {...getCreateFloatingProps({
                                    className:
                                        'relative flex h-auto w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl',
                                    role: 'dialog',
                                    'aria-modal': true,
                                })}
                            >
                                <FormFloatingUI title="Create Salesperson" onClose={() => setIsCreateModalOpen(false)}>
                                    <SalespersonForm onSuccess={handleFormSuccess} onCancel={handleFormCancel} />
                                </FormFloatingUI>
                            </div>
                        </FloatingFocusManager>
                    </FloatingOverlay>
                </FloatingPortal>
            )}

            {/* Edit Salesperson Modal */}
            {isEditModalOpen && editingSalesperson && (
                <FloatingPortal>
                    <FloatingOverlay
                        lockScroll
                        className="z-50 flex items-center justify-center bg-base-content/50 backdrop-blur-sm p-4"
                        onClick={(event) => {
                            if (event.target === event.currentTarget) {
                                setIsEditModalOpen(false);
                            }
                        }}
                    >
                        <FloatingFocusManager context={editContext} modal>
                            <div
                                ref={editRefs.setFloating}
                                {...getEditFloatingProps({
                                    className:
                                        'relative flex h-auto w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl',
                                    role: 'dialog',
                                    'aria-modal': true,
                                })}
                            >
                                <FormFloatingUI title="Edit Salesperson" onClose={() => setIsEditModalOpen(false)}>
                                    <SalespersonForm
                                        salesperson={editingSalesperson}
                                        onSuccess={handleFormSuccess}
                                        onCancel={handleFormCancel}
                                    />
                                </FormFloatingUI>
                            </div>
                        </FloatingFocusManager>
                    </FloatingOverlay>
                </FloatingPortal>
            )}
        </div>
    );
};

export default SalespeopleTable;
