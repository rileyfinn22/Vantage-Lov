import { useState } from 'react';
import { useTable, useDelete } from '@refinedev/core';
import { addNotification } from '#/routes/dashboard/layout/Notifications';
import GenericEditModal from '../forms/GenericEditModal';
import type { GenericCRUDTableProps } from '../types';

const GenericCRUDTable = ({ resource }: GenericCRUDTableProps) => {
    const [pageSize, setPageSize] = useState(10);
    const [editingRecord, setEditingRecord] = useState<any>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [viewingJson, setViewingJson] = useState<{ key: string; value: any; index: number } | null>(null);

    const {
        tableQuery,
        currentPage,
        setCurrentPage,
        pageCount,
        setPageSize: setTablePageSize,
    } = useTable({
        resource,
        pagination: { currentPage: 1, pageSize },
    });

    const { mutate: deleteRecord } = useDelete();

    const { data: result, isLoading: query_isLoading, error: query_error } = tableQuery;
    const query = { isLoading: query_isLoading, error: query_error };

    const handlePageSizeChange = (newPageSize: number) => {
        setPageSize(newPageSize);
        setTablePageSize(newPageSize);
        setCurrentPage(1);
    };

    const handleEdit = (record: any) => {
        setEditingRecord(record);
        setIsEditModalOpen(true);
    };

    const handleDelete = async (record: any) => {
        const displayName = record.name ?? record.title ?? record.id ?? 'this record';
        if (window.confirm(`Are you sure you want to delete "${displayName}"?`)) {
            try {
                await deleteRecord({
                    resource,
                    id: record.id,
                });
                addNotification('Record deleted successfully', 'success');
            } catch (_error) {
                addNotification('Failed to delete record', 'error');
            }
        }
    };

    const isObject = (value: any): boolean => {
        return value !== null && typeof value === 'object';
    };

    const handleKeyDown = (e: React.KeyboardEvent, callback: () => void) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            callback();
        }
    };

    if (query.isLoading)
        return (
            <div className="p-4">
                <div className="skeleton h-8 w-64 mb-4"></div>
                <div className="skeleton h-4 w-full mb-2"></div>
                <div className="skeleton h-4 w-3/4 mb-2"></div>
                <div className="skeleton h-4 w-1/2"></div>
            </div>
        );
    if (query.error)
        return (
            <div className="p-4">
                Error loading {resource}: {query.error.message}
            </div>
        );
    if (!result?.data || result.data.length === 0)
        return (
            <div className="p-4">
                <h2 className="text-2xl font-bold mb-4">{resource} (0 total)</h2>
                <div className="text-center py-8 text-base-content/70">No {resource} found.</div>
            </div>
        );

    // Get all unique keys from all objects using reduce and Object.keys
    const allKeys = result.data.reduce((keys: string[], item: any) => {
        const itemKeys = Object.keys(item);
        itemKeys.forEach((key) => {
            if (!keys.includes(key)) {
                keys.push(key);
            }
        });
        return keys;
    }, []);

    // Only render table if 20 or fewer columns
    if (allKeys.length > 20) {
        return (
            <div className="p-4">
                <h2 className="text-2xl font-bold mb-4">
                    {resource} (Too many columns: {allKeys.length})
                </h2>
                <p className="text-base-content/70">
                    This resource has {allKeys.length} columns, which is too many to display in a table view.
                </p>
                <details className="mt-4">
                    <summary className="cursor-pointer link link-primary">Show raw data</summary>
                    <pre className="mt-2 p-4 bg-base-200 rounded overflow-auto text-sm">{JSON.stringify(result.data, null, 2)}</pre>
                </details>
            </div>
        );
    }

    return (
        <div className="p-4">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">
                    {resource} ({result?.total ?? 0} total)
                </h2>
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
            </div>

            <div className="overflow-x-auto">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Actions</th>
                            {allKeys.map((key) => (
                                <th key={key}>{key}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {result.data.map((item: any, index: number) => (
                            <tr key={item.id ?? index}>
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
                                {allKeys.map((key) => {
                                    const value = item[key];

                                    if (isObject(value)) {
                                        const jsonString = JSON.stringify(value, null, 2);
                                        const lines = jsonString.split('\n');
                                        const preview = lines.slice(0, 6).join('\n');
                                        const hasMore = lines.length > 6;

                                        return (
                                            <td key={key} className="max-w-xs">
                                                <button
                                                    type="button"
                                                    className="cursor-pointer hover:bg-base-200 p-1 rounded w-full text-left"
                                                    onClick={() => setViewingJson({ key, value, index })}
                                                    onKeyDown={(e) => handleKeyDown(e, () => setViewingJson({ key, value, index }))}
                                                >
                                                    <pre className="text-xs overflow-hidden">{preview}</pre>
                                                    {hasMore && <span className="text-xs text-primary">... click to expand</span>}
                                                </button>
                                            </td>
                                        );
                                    }

                                    const cellValue = String(value ?? '');
                                    return (
                                        <td key={key} className="truncate max-w-xs" title={cellValue}>
                                            {cellValue}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {pageCount > 1 && (
                <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-base-content/70">
                        Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, result?.total ?? 0)} of{' '}
                        {result?.total ?? 0} results
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

            {/* Edit Modal */}
            <GenericEditModal
                resource={resource}
                record={editingRecord}
                isOpen={isEditModalOpen}
                onClose={() => {
                    setIsEditModalOpen(false);
                    setEditingRecord(null);
                }}
                onSuccess={() => {
                    setIsEditModalOpen(false);
                    setEditingRecord(null);
                    tableQuery.refetch();
                }}
            />

            {/* JSON Viewer Modal */}
            {viewingJson && (
                <div className={`modal ${viewingJson ? 'modal-open' : ''}`}>
                    <div className="modal-box max-w-4xl">
                        <h3 className="font-bold text-lg mb-2">
                            Row {viewingJson.index + 1} - {viewingJson.key}
                        </h3>
                        <pre className="bg-base-200 p-4 rounded overflow-auto max-h-96 text-xs">
                            {JSON.stringify(viewingJson.value, null, 2)}
                        </pre>
                        <div className="modal-action">
                            <button className="btn" onClick={() => setViewingJson(null)}>
                                Close
                            </button>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="modal-backdrop"
                        onClick={() => setViewingJson(null)}
                        onKeyDown={(e) => handleKeyDown(e, () => setViewingJson(null))}
                    ></button>
                </div>
            )}
        </div>
    );
};

export default GenericCRUDTable;
