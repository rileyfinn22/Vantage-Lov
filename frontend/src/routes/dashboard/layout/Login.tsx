import { useAuth } from '#util/useMe.ts';
import { map } from 'nanostores';
import { useFormStore } from '#util/formStore.ts';
import { useEffect } from 'react';
import { useLocation } from 'wouter';

const $loginForm = map({
    email: '',
    password: '',
    error: null as string | null,
    submitting: false,
});

export default function Login() {
    const { login, isAuthenticated } = useAuth();
    const [, navigate] = useLocation();

    const {
        state: { email, password, error, submitting },
        props,
    } = useFormStore($loginForm);

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/');
        }
    }, [isAuthenticated, navigate]);

    const handler = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const _formData = new FormData(event.currentTarget as HTMLFormElement);

        try {
            $loginForm.setKey('submitting', true);
            await login(email, password);
        } catch (error) {
            console.error('Login error:', error);
            $loginForm.setKey('error', 'Login failed. Please check your credentials and try again.');
        } finally {
            $loginForm.setKey('submitting', false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-base-100">
            <div className="card w-96 bg-base-200 shadow-xl">
                <div className="card-body">
                    <h1 className="card-title text-2xl font-bold text-center justify-center">Vantage.ai</h1>
                    <p className="text-center text-base-content/70">Please log in to access the dashboard</p>
                    <form className="flex flex-col gap-4 mt-4" onSubmit={handler}>
                        <input type="text" placeholder="Email" className="input input-bordered" {...props('email')} />
                        <input type="password" placeholder="Password" className="input input-bordered" {...props('password')} />
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? <span className="loading loading-spinner"></span> : 'Login'}
                        </button>
                    </form>
                    {error && (
                        <div className="alert alert-error mt-4">
                            <span>{error}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
