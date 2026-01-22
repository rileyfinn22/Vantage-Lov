import { useState } from 'react';
import { useTable, useDelete } from '@refinedev/core';
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
import { formatDateShort, formatNumber } from '#util';
import { addNotification } from '#/routes/dashboard/layout/Notifications';
import FormFloatingUI from '../forms/FormFloatingUI';
import CompanyForm from '../forms/CompanyForm';

interface Company {
    id: number;
    name: string;
    revenueGoal?: string | null;
    createdAt: string;
}

const CompanyTable = () => {
    const [pageSize, setPageSize] = useState(10);
    const [editingCompany, setEditingCompany] = useState<Company | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const {
        tableQuery,
        currentPage,
        setCurrentPage,
        pageCount,
        setPageSize: setTablePageSize,
    } = useTable({
        resource: 'company',
        pagination: { currentPage: 1, pageSize },
    });

    const { mutate: deleteCompany } = useDelete();

    const { data: tableData, isLoading, error } = tableQuery;

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

    const handleEdit = (company: Company) => {
        setEditingCompany(company);
        setIsEditModalOpen(true);
    };

    const handleDelete = async (company: Company) => {
        if (window.confirm(`Are you sure you want to delete "${company.name}"?`)) {
            try {
                await deleteCompany({
                    resource: 'company',
                    id: company.id,
                });
                addNotification('Company deleted successfully', 'success');
            } catch (_error) {
                addNotification('Failed to delete company', 'error');
            }
        }
    };

    const handleFormSuccess = () => {
        setIsCreateModalOpen(false);
        setIsEditModalOpen(false);
        setEditingCompany(null);
        tableQuery.refetch();
    };

    const handleFormCancel = () => {
        setIsCreateModalOpen(false);
        setIsEditModalOpen(false);
        setEditingCompany(null);
    };

    if (isLoading)
        return (
            <div className="p-4">
                <div className="skeleton h-8 w-64 mb-4"></div>
                <div className="skeleton h-4 w-full mb-2"></div>
                <div className="skeleton h-4 w-3/4 mb-2"></div>
                <div className="skeleton h-4 w-1/2"></div>
            </div>
        );
    if (error) return <div>Error loading companies: {error.message}</div>;
    if (!tableData?.data || tableData.data.length === 0)
        return (
            <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold">Companies (0 total)</h2>
                    <button ref={createRefs.setReference} {...getCreateReferenceProps()} className="btn btn-primary">
                        Add Company
                    </button>
                </div>
                <div className="text-center py-8 text-base-content/70">No companies found. Create your first company to get started.</div>
            </div>
        );

    return (
        <div className="p-4">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">Companies ({tableData?.total ?? 0} total)</h2>
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
                        Add Company
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Revenue Goal</th>
                            <th>Created At</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(tableData.data as Company[]).map((company) => (
                            <tr key={company.id}>
                                <td>{company.id}</td>
                                <td className="font-medium">{company.name}</td>
                                <td>{company.revenueGoal ? `$${formatNumber(Number(company.revenueGoal))}/month` : '-'}</td>
                                <td>{formatDateShort(company.createdAt)}</td>
                                <td>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleEdit(company)} className="btn btn-ghost btn-sm">
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => handleDelete(company)}
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
            {pageCount > 1 && (
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
            )}

            {/* Create Company Modal */}
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
                                        'relative flex h-auto w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl',
                                    role: 'dialog',
                                    'aria-modal': true,
                                })}
                            >
                                <FormFloatingUI title="Create Company" onClose={() => setIsCreateModalOpen(false)}>
                                    <CompanyForm onSuccess={handleFormSuccess} onCancel={handleFormCancel} />
                                </FormFloatingUI>
                            </div>
                        </FloatingFocusManager>
                    </FloatingOverlay>
                </FloatingPortal>
            )}

            {/* Edit Company Modal */}
            {isEditModalOpen && editingCompany && (
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
                                        'relative flex h-auto w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl',
                                    role: 'dialog',
                                    'aria-modal': true,
                                })}
                            >
                                <FormFloatingUI title="Edit Company" onClose={() => setIsEditModalOpen(false)}>
                                    <CompanyForm company={editingCompany} onSuccess={handleFormSuccess} onCancel={handleFormCancel} />
                                </FormFloatingUI>
                            </div>
                        </FloatingFocusManager>
                    </FloatingOverlay>
                </FloatingPortal>
            )}
        </div>
    );
};

export default CompanyTable;
