import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button, Input, ErrorBanner } from '@/components/ui';
import { CreditCard } from 'lucide-react';

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    if (mode === 'signin') {
      const { error } = await signIn(email.trim(), password);
      if (error) setError(error);
    } else {
      if (fullName.trim().length < 2) {
        setError('Please enter your full name');
        setBusy(false);
        return;
      }
      const { error } = await signUp(email.trim(), password, fullName.trim());
      if (error) setError(error);
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-blue-900 to-blue-700">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-lg">
            <CreditCard className="h-7 w-7 text-blue-700" />
          </div>
          <h1 className="text-2xl font-bold text-white">Wema Super Agent</h1>
          <p className="mt-1 text-sm text-blue-200">Terminal inventory, agent & sales management</p>
        </div>

        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
          <div className="mb-5 flex rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => setMode('signin')}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === 'signin' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === 'signup' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <Input label="Full Name" value={fullName} onChange={setFullName} placeholder="Your name" required />
            )}
            <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@business.com" required />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              required
            />
            {error && <ErrorBanner message={error} />}
            <Button type="submit" disabled={busy} className="w-full" size="lg">
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-400">
            The first account created becomes the business owner.
          </p>
        </div>
      </div>
    </div>
  );
}
