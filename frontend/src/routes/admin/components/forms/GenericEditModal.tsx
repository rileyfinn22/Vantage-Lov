import { useEffect } from 'react';
import { useForm } from '@tanstack/react-form';
import { useUpdate } from '@refinedev/core';
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
import { addNotification } from '#/routes/dashboard/layout/Notifications';

interface GenericEditModalProps {
    resource: string;
    record: any;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const GenericEditModal = ({ resource, record, isOpen, onClose, onSuccess }: GenericEditModalProps) => {
    const { mutate: updateRecord } = useUpdate();

    const form = useForm({
        defaultValues: record ?? {},
        onSubmit: async ({ value, formApi }) => {
            // Collect only dirty (changed) fields
            const changedValues: Record<string, any> = {};

            Object.keys(record).forEach((key) => {
                const fieldMeta = formApi.getFieldMeta(key as any);
                // Only include fields that have been modified and are not the ID
                if (fieldMeta?.isDirty && key !== 'id') {
                    changedValues[key] = value[key];
                }
            });

            // If no fields were changed, just close the modal
            if (Object.keys(changedValues).length === 0) {
                addNotification('No changes to save', 'info');
                onClose();
                return;
            }

            // Submit the changed values
            updateRecord(
                {
                    resource,
                    id: record.id,
                    values: changedValues,
                },
                {
                    onSuccess: () => {
                        addNotification('Record updated successfully', 'success');
                        onSuccess();
                    },
                    onError: () => {
                        addNotification('Failed to update record', 'error');
                    },
                },
            );
        },
    });

    // Reset form with new values when record changes
    useEffect(() => {
        if (record) {
            form.reset(record);
        }
    }, [record?.id, form.reset, record]); // eslint-disable-line react-hooks/exhaustive-deps

    const { refs, context } = useFloating({
        open: isOpen,
        onOpenChange: (open) => {
            if (!open) onClose();
        },
        whileElementsMounted: autoUpdate,
    });

    const click = useClick(context);
    const dismiss = useDismiss(context, { outsidePress: false });
    const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

    if (!record) return null;

    return (
        <FloatingPortal>
            <FloatingOverlay
                lockScroll
                className="z-50 flex items-center justify-center bg-base-content/50 backdrop-blur-sm p-4"
                onClick={(event) => {
                    if (event.target === event.currentTarget) {
                        onClose();
                    }
                }}
            >
                <FloatingFocusManager context={context} modal>
                    <div
                        ref={refs.setFloating}
                        {...getFloatingProps({
                            className:
                                'relative flex h-auto w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl',
                            role: 'dialog',
                            'aria-modal': true,
                        })}
                    >
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold">Edit {resource}</h3>
                                <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle" aria-label="Close">
                                    ✕
                                </button>
                            </div>

                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    form.handleSubmit();
                                }}
                                className="space-y-4"
                            >
                                <div className="max-h-96 overflow-y-auto space-y-3">
                                    {Object.entries(record).map(([key, value]) => {
                                        // Skip editing ID field
                                        if (key === 'id') {
                                            return (
                                                <form.Field key={key} name={key as any}>
                                                    {(field) => (
                                                        <div className="grid grid-cols-[minmax(150px,auto)_1fr] gap-x-4 items-start py-2">
                                                            <label htmlFor="field-id" className="label justify-start py-0 h-auto">
                                                                <span className="label-text font-medium">{key}</span>
                                                            </label>
                                                            <div className="w-full">
                                                                <input
                                                                    id="field-id"
                                                                    type="text"
                                                                    value={String(field.state.value)}
                                                                    className="input input-bordered w-full"
                                                                    disabled
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </form.Field>
                                            );
                                        }

                                        // Handle different value types
                                        const isObject = typeof value === 'object' && value !== null;
                                        const isBoolean = typeof value === 'boolean';
                                        const isNumber = typeof value === 'number';

                                        return (
                                            <form.Field key={key} name={key as any}>
                                                {(field) => {
                                                    const fieldId = `field-${key}`;
                                                    return (
                                                        <div className="grid grid-cols-[minmax(150px,auto)_1fr] gap-x-4 items-start py-2">
                                                            <label htmlFor={fieldId} className="label justify-start py-0 h-auto">
                                                                <span className="label-text font-medium">
                                                                    {key}
                                                                    {field.state.meta.isDirty && (
                                                                        <span className="ml-2 badge badge-primary badge-xs">modified</span>
                                                                    )}
                                                                </span>
                                                            </label>
                                                            <div className="w-full">
                                                                {isObject ? (
                                                                    <textarea
                                                                        id={fieldId}
                                                                        value={
                                                                            typeof field.state.value === 'object'
                                                                                ? JSON.stringify(field.state.value, null, 2)
                                                                                : String(field.state.value ?? '')
                                                                        }
                                                                        onChange={(e) => {
                                                                            try {
                                                                                const parsed = JSON.parse(e.target.value);
                                                                                field.handleChange(parsed);
                                                                            } catch {
                                                                                // If invalid JSON, store as string for now
                                                                                field.handleChange(e.target.value as any);
                                                                            }
                                                                        }}
                                                                        className="textarea textarea-bordered font-mono text-xs w-full"
                                                                        rows={4}
                                                                    />
                                                                ) : isBoolean ? (
                                                                    <select
                                                                        id={fieldId}
                                                                        value={String(field.state.value)}
                                                                        onChange={(e) => field.handleChange(e.target.value === 'true')}
                                                                        className="select select-bordered w-full"
                                                                    >
                                                                        <option value="true">true</option>
                                                                        <option value="false">false</option>
                                                                    </select>
                                                                ) : (
                                                                    <input
                                                                        id={fieldId}
                                                                        type={isNumber ? 'number' : 'text'}
                                                                        value={String(field.state.value ?? '')}
                                                                        onChange={(e) =>
                                                                            field.handleChange(
                                                                                isNumber ? Number(e.target.value) : (e.target.value as any),
                                                                            )
                                                                        }
                                                                        className="input input-bordered w-full"
                                                                    />
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                }}
                                            </form.Field>
                                        );
                                    })}
                                </div>
                                <div className="flex gap-2 justify-end pt-4 border-t">
                                    <button type="button" onClick={onClose} className="btn btn-ghost">
                                        Cancel
                                    </button>
                                    <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting, state.isDirty]}>
                                        {([canSubmit, isSubmitting, isDirty]) => (
                                            <button type="submit" className="btn btn-primary" disabled={!canSubmit || !isDirty}>
                                                {isSubmitting ? (
                                                    <>
                                                        <span className="loading loading-spinner loading-sm"></span>
                                                        Saving...
                                                    </>
                                                ) : (
                                                    'Save Changes'
                                                )}
                                            </button>
                                        )}
                                    </form.Subscribe>
                                </div>
                            </form>
                        </div>
                    </div>
                </FloatingFocusManager>
            </FloatingOverlay>
        </FloatingPortal>
    );
};

export default GenericEditModal;
