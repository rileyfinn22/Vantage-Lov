import { Route, Router, Switch, Redirect } from 'wouter';
import SlopRoutes from './dashboard';
import Login from './dashboard/layout/Login';
import './index.css';
import { useBrowserLocation } from 'wouter/use-browser-location';
import { useEffect } from 'react';
import { $themeMode } from '../stores/theme';
import HealthCheck from '../components/HealthCheck';

export default function SlopApp() {
    useEffect(
        () =>
            $themeMode.subscribe((theme) => {
                const themeName = theme === 'dark' ? 'vantage-dark' : 'vantage';
                document.documentElement.setAttribute('data-theme', themeName);
            }),
        [],
    );

    return (
        <>
            <HealthCheck />
            <Router hook={useBrowserLocation}>
                <Switch>
                    <Route path="/login" component={Login} />
                    <Route path="/" component={SlopRoutes} nest />
                    <Route>
                        <Redirect to="/" />
                    </Route>
                </Switch>
            </Router>
        </>
    );
}
