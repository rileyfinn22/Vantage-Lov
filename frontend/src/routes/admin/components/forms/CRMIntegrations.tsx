import { useEffect, useState } from 'react';
import { useSearchParams } from 'wouter';
import { Link2, Link2Off, RefreshCw, CheckCircle, AlertCircle, Clock, X, User, Building2, DollarSign } from 'lucide-react';
import { useCRMStatus, useConnectHubSpot, useDisconnectHubSpot, useSyncHubSpot, useHubSpotContacts, useHubSpotCompanies, useHubSpotDeals, type CRMConnection, type HubSpotContact, type HubSpotCompany, type HubSpotDeal } from '#data/crm';

type DataType = 'contacts' | 'companies' | 'deals';

function DataModal({
    isOpen,
    onClose,
    type,
    contacts,
    companies,
    deals,
    isLoading
}: {
    isOpen: boolean;
    onClose: () => void;
    type: DataType;
    contacts?: HubSpotContact[];
    companies?: HubSpotCompany[];
    deals?: HubSpotDeal[];
    isLoading: boolean;
}) {
    if (!isOpen) return null;

    const titles = {
        contacts: 'HubSpot Contacts',
        companies: 'HubSpot Companies',
        deals: 'HubSpot Deals',
    };

    return (
        <dialog className="modal modal-open">
            <div className="modal-box max-w-3xl">
                <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={onClose}>
                    <X className="w-4 h-4" />
                </button>
                <h3 className="font-bold text-lg mb-4">{titles[type]}</h3>

                {isLoading ? (
                    <div className="flex justify-center py-8">
                        <span className="loading loading-spinner loading-md"></span>
                    </div>
                ) : (
                    <div className="overflow-x-auto max-h-96">
                        {type === 'contacts' && contacts && (
                            <table className="table table-sm">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Email</th>
                                        <th>Company</th>
                                        <th>Job Title</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {contacts.map((c) => (
                                        <tr key={c.id}>
                                            <td>{[c.properties.firstname, c.properties.lastname].filter(Boolean).join(' ') || '-'}</td>
                                            <td>{c.properties.email ?? '-'}</td>
                                            <td>{c.properties.company ?? '-'}</td>
                                            <td>{c.properties.jobtitle ?? '-'}</td>
                                        </tr>
                                    ))}
                                    {contacts.length === 0 && (
                                        <tr><td colSpan={4} className="text-center text-base-content/50">No contacts found</td></tr>
                                    )}
                                </tbody>
                            </table>
                        )}

                        {type === 'companies' && companies && (
                            <table className="table table-sm">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Domain</th>
                                        <th>Industry</th>
                                        <th>Employees</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {companies.map((c) => (
                                        <tr key={c.id}>
                                            <td>{c.properties.name ?? '-'}</td>
                                            <td>{c.properties.domain ?? '-'}</td>
                                            <td>{c.properties.industry ?? '-'}</td>
                                            <td>{c.properties.numberofemployees ?? '-'}</td>
                                        </tr>
                                    ))}
                                    {companies.length === 0 && (
                                        <tr><td colSpan={4} className="text-center text-base-content/50">No companies found</td></tr>
                                    )}
                                </tbody>
                            </table>
                        )}

                        {type === 'deals' && deals && (
                            <table className="table table-sm">
                                <thead>
                                    <tr>
                                        <th>Deal Name</th>
                                        <th>Amount</th>
                                        <th>Stage</th>
                                        <th>Close Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {deals.map((d) => (
                                        <tr key={d.id}>
                                            <td>{d.properties.dealname ?? '-'}</td>
                                            <td>{d.properties.amount ? `$${Number(d.properties.amount).toLocaleString()}` : '-'}</td>
                                            <td>{d.properties.dealstage ?? '-'}</td>
                                            <td>{d.properties.closedate ? new Date(d.properties.closedate).toLocaleDateString() : '-'}</td>
                                        </tr>
                                    ))}
                                    {deals.length === 0 && (
                                        <tr><td colSpan={4} className="text-center text-base-content/50">No deals found</td></tr>
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>
            <form method="dialog" className="modal-backdrop">
                <button onClick={onClose}>close</button>
            </form>
        </dialog>
    );
}

function formatDate(dateString: string | null): string {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
}

function ConnectionCard({ connection }: { connection: CRMConnection }) {
    const disconnectHubSpot = useDisconnectHubSpot();
    const syncHubSpot = useSyncHubSpot();
    const [modalType, setModalType] = useState<DataType | null>(null);

    const contactsQuery = useHubSpotContacts();
    const companiesQuery = useHubSpotCompanies();
    const dealsQuery = useHubSpotDeals();

    const handleCountClick = (type: DataType) => {
        setModalType(type);
        if (type === 'contacts') contactsQuery.refetch();
        if (type === 'companies') companiesQuery.refetch();
        if (type === 'deals') dealsQuery.refetch();
    };

    const statusColors = {
        connected: 'badge-success',
        disconnected: 'badge-ghost',
        error: 'badge-error',
        expired: 'badge-warning',
    };

    const statusIcons = {
        connected: <CheckCircle className="w-4 h-4" />,
        disconnected: <Link2Off className="w-4 h-4" />,
        error: <AlertCircle className="w-4 h-4" />,
        expired: <Clock className="w-4 h-4" />,
    };

    return (
        <>
            <div className="card bg-base-100 shadow-sm border border-base-300">
                <div className="card-body p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="avatar placeholder">
                                <div className="bg-primary text-primary-content rounded-lg w-12 h-12 flex items-center justify-center">
                                    <span className="text-lg font-bold">HS</span>
                                </div>
                            </div>
                            <div>
                                <h3 className="font-semibold">HubSpot</h3>
                                <p className="text-sm text-base-content/70">{connection.connectedUserEmail ?? 'Connected'}</p>
                            </div>
                        </div>
                        <span className={`badge ${statusColors[connection.status]} gap-1`}>
                            {statusIcons[connection.status]}
                            {connection.status}
                        </span>
                    </div>

                    <div className="divider my-2"></div>

                    <div className="grid grid-cols-3 gap-4 text-center">
                        <button
                            className="hover:bg-base-200 rounded-lg p-2 transition-colors cursor-pointer"
                            onClick={() => handleCountClick('contacts')}
                        >
                            <User className="w-4 h-4 mx-auto mb-1 text-base-content/60" />
                            <div className="text-2xl font-bold text-primary">{connection.contactsCount ?? 0}</div>
                            <div className="text-xs text-base-content/60">Contacts</div>
                        </button>
                        <button
                            className="hover:bg-base-200 rounded-lg p-2 transition-colors cursor-pointer"
                            onClick={() => handleCountClick('companies')}
                        >
                            <Building2 className="w-4 h-4 mx-auto mb-1 text-base-content/60" />
                            <div className="text-2xl font-bold text-primary">{connection.companiesCount ?? 0}</div>
                            <div className="text-xs text-base-content/60">Companies</div>
                        </button>
                        <button
                            className="hover:bg-base-200 rounded-lg p-2 transition-colors cursor-pointer"
                            onClick={() => handleCountClick('deals')}
                        >
                            <DollarSign className="w-4 h-4 mx-auto mb-1 text-base-content/60" />
                            <div className="text-2xl font-bold text-primary">{connection.dealsCount ?? 0}</div>
                            <div className="text-xs text-base-content/60">Deals</div>
                        </button>
                    </div>

                    <div className="text-xs text-base-content/50 mt-2">Last synced: {formatDate(connection.lastSyncAt)}</div>

                    <div className="card-actions justify-end mt-4">
                        <button
                            className="btn btn-ghost btn-sm gap-1"
                            onClick={() => syncHubSpot.mutate()}
                            disabled={syncHubSpot.isPending}
                        >
                            <RefreshCw className={`w-4 h-4 ${syncHubSpot.isPending ? 'animate-spin' : ''}`} />
                            Sync
                        </button>
                        <button
                            className="btn btn-ghost btn-sm text-error gap-1"
                            onClick={() => {
                                if (confirm('Are you sure you want to disconnect HubSpot?')) {
                                    disconnectHubSpot.mutate();
                                }
                            }}
                            disabled={disconnectHubSpot.isPending}
                        >
                            <Link2Off className="w-4 h-4" />
                            Disconnect
                        </button>
                    </div>
                </div>
            </div>

            <DataModal
                isOpen={modalType !== null}
                onClose={() => setModalType(null)}
                type={modalType ?? 'contacts'}
                contacts={contactsQuery.data?.results}
                companies={companiesQuery.data?.results}
                deals={dealsQuery.data?.results}
                isLoading={
                    (modalType === 'contacts' && contactsQuery.isFetching) ||
                    (modalType === 'companies' && companiesQuery.isFetching) ||
                    (modalType === 'deals' && dealsQuery.isFetching)
                }
            />
        </>
    );
}

function ConnectHubSpotCard() {
    const connectHubSpot = useConnectHubSpot();

    return (
        <div className="card bg-base-100 shadow-sm border border-base-300 border-dashed">
            <div className="card-body p-4 items-center text-center">
                <div className="avatar placeholder">
                    <div className="bg-base-200 text-base-content/50 rounded-lg w-12 h-12 flex items-center justify-center">
                        <span className="text-lg font-bold">HS</span>
                    </div>
                </div>
                <h3 className="font-semibold mt-2">HubSpot</h3>
                <p className="text-sm text-base-content/70">Connect your HubSpot CRM to enrich meeting prep with contact data</p>
                <button
                    className="btn btn-primary btn-sm mt-4 gap-1"
                    onClick={() => connectHubSpot.mutate()}
                    disabled={connectHubSpot.isPending}
                >
                    <Link2 className="w-4 h-4" />
                    {connectHubSpot.isPending ? 'Connecting...' : 'Connect HubSpot'}
                </button>
            </div>
        </div>
    );
}

export default function CRMIntegrations() {
    const { data, isLoading, error, refetch } = useCRMStatus();
    const [searchParams] = useSearchParams();

    // Handle OAuth callback messages
    useEffect(() => {
        const success = searchParams.get('crm_success');
        const errorParam = searchParams.get('crm_error');

        if (success || errorParam) {
            // Refetch status after OAuth callback
            refetch();

            // Clear URL params
            const url = new URL(window.location.href);
            url.searchParams.delete('crm_success');
            url.searchParams.delete('crm_error');
            window.history.replaceState({}, '', url.toString());
        }
    }, [searchParams, refetch]);

    const hubspotConnection = data?.connections?.find((c: CRMConnection) => c.provider === 'hubspot');

    return (
        <div className="p-4">
            <div className="mb-6">
                <h2 className="text-xl font-bold">CRM Integrations</h2>
                <p className="text-base-content/70">
                    Connect your CRM to enrich meeting preparation with contact and deal data. All integrations are read-only.
                </p>
            </div>

            {/* Success/Error alerts */}
            {searchParams.get('crm_success') === 'hubspot' && (
                <div className="alert alert-success mb-4">
                    <CheckCircle className="w-5 h-5" />
                    <span>HubSpot connected successfully!</span>
                </div>
            )}

            {searchParams.get('crm_error') && (
                <div className="alert alert-error mb-4">
                    <AlertCircle className="w-5 h-5" />
                    <span>
                        Failed to connect:{' '}
                        {searchParams.get('crm_error') === 'denied'
                            ? 'Access was denied'
                            : searchParams.get('crm_error') === 'expired'
                                ? 'Session expired, please try again'
                                : 'An error occurred'}
                    </span>
                </div>
            )}

            {isLoading && (
                <div className="flex items-center justify-center py-8">
                    <span className="loading loading-spinner loading-md"></span>
                </div>
            )}

            {error && (
                <div className="alert alert-error">
                    <AlertCircle className="w-5 h-5" />
                    <span>Failed to load CRM status</span>
                </div>
            )}

            {!isLoading && !error && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {hubspotConnection ? (
                        <ConnectionCard connection={hubspotConnection} />
                    ) : (
                        <ConnectHubSpotCard />
                    )}

                    {/* Placeholder for future CRM integrations */}
                    {/* <div className="card bg-base-100 shadow-sm border border-base-300 border-dashed opacity-50">
                        <div className="card-body p-4 items-center text-center">
                            <div className="avatar placeholder">
                                <div className="bg-base-200 text-base-content/50 rounded-lg w-12 h-12 flex items-center justify-center">
                                    <span className="text-lg font-bold">ZO</span>
                                </div>
                            </div>
                            <h3 className="font-semibold mt-2">Zoho CRM</h3>
                            <p className="text-sm text-base-content/70">Coming soon</p>
                        </div>
                    </div>

                    <div className="card bg-base-100 shadow-sm border border-base-300 border-dashed opacity-50">
                        <div className="card-body p-4 items-center text-center">
                            <div className="avatar placeholder">
                                <div className="bg-base-200 text-base-content/50 rounded-lg w-12 h-12 flex items-center justify-center">
                                    <span className="text-lg font-bold">AG</span>
                                </div>
                            </div>
                            <h3 className="font-semibold mt-2">Agile CRM</h3>
                            <p className="text-sm text-base-content/70">Coming soon</p>
                        </div>
                    </div> */}
                </div>
            )}

            <div className="mt-8 p-4 bg-base-200 rounded-lg">
                <h3 className="font-semibold mb-2">About CRM Integrations</h3>
                <ul className="list-disc list-inside text-sm text-base-content/70 space-y-1">
                    <li>All CRM integrations are strictly read-only</li>
                    <li>We never write, modify, or delete any data in your CRM</li>
                    <li>Contact data is used to enrich Meeting Prep context</li>
                    <li>You can disconnect at any time</li>
                </ul>
            </div>
        </div>
    );
}
