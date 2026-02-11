import { Route, Switch } from 'wouter';
import { Dashboard } from './components/dashboard';
import { Suspense, lazy } from 'react';
import { useDashboard } from '#data/dashboard';
import Authed from './layout/Authed';
import { DashboardLayout } from './layout/DashboardLayout';
import { Salesperson } from './salesperson/salesperson/SalesPerson';
import { SkillDrillDown } from './salesperson/skills/SkillDrillDown';
import { SkillTraining } from './salesperson/skills/SkillTraining';
import { ScenarioTrainingSession } from './salesperson/training/ScenarioTrainingSession';
import { UploadCall } from './salesperson/UploadCall';
import { TrainingFlagDetail } from './training/TrainingFlagDetail';
import { InsightsPage } from '../insights/page';
import { InsightDetailPage } from '../insights/detail/page';
import { TrainingPage } from '../training/page';
import { TeamPage } from '../team/page';
import { CallLibraryPage } from '../calls/page';
import { FlagTuningPage } from '../flag-tuning/page';
import { PrepListPage } from '../prep/page';
import { NewPrepPage } from '../prep/NewPrepPage';
import { PrepDetailPage } from '../prep/PrepDetailPage';

// Lazy load admin routes for code splitting
const AdminRoutes = lazy(() => import('../admin/index'));

const loading = <div className="flex items-center justify-center h-full">Loading...</div>;

// Admin-specific loading component with better UX
const AdminLoading = () => (
    <div className="flex flex-col items-center justify-center h-full min-h-screen">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="mt-4 text-base-content/70">Loading Admin Panel...</p>
        <p className="text-sm text-base-content/50 mt-1">Initializing admin features</p>
    </div>
);

function DashboardComponent() {
    const dashboardData = useDashboard();
    return <Dashboard {...dashboardData} />;
}
export default function SlopRoutes() {
    return (
        <Authed>
            <DashboardLayout>
                <Suspense fallback={loading}>
                    <Switch>
                        <Route path="/admin">
                            {() => (
                                <Suspense fallback={<AdminLoading />}>
                                    <AdminRoutes />
                                </Suspense>
                            )}
                        </Route>
                        <Route path="/insights" component={InsightsPage} />
                        <Route path="/insights/:itemType/:itemId" component={InsightDetailPage} />
                        <Route path="/training" component={TrainingPage} />
                        <Route path="/team" component={TeamPage} />
                        <Route path="/calls" component={CallLibraryPage} />
                        <Route path="/upload-call" component={UploadCall} />
                        <Route path="/flag-tuning" component={FlagTuningPage} />
                        <Route path="/prep" component={PrepListPage} />
                        <Route path="/prep/new" component={NewPrepPage} />
                        <Route path="/prep/:prepId">
                            {(params) => <PrepDetailPage prepId={params.prepId} />}
                        </Route>
                        <Route path="/salesperson/:salespersonId/training/:scenarioId" component={ScenarioTrainingSession} />
                        <Route path="/salesperson/:id/skills/:skillKey" component={SkillTraining} />
                        <Route path="/salesperson/:id">
                            {(params) => {
                                return <Salesperson id={params.id} />;
                            }}
                        </Route>
                        <Route path="/training-flag/:id">
                            {(params) => {
                                return <TrainingFlagDetail id={params.id} />;
                            }}
                        </Route>
                        <Route component={DashboardComponent} />
                    </Switch>
                </Suspense>
            </DashboardLayout>
        </Authed>
    );
}
