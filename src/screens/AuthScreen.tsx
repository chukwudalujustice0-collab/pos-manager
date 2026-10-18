import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button, Input, ErrorBanner } from '@/components/ui';
import { CreditCard, Eye, EyeOff, UserPlus, LogIn, KeyRound } from 'lucide-react';

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [passKey, setPassKey] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
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
      if (!phone.trim()) {
        setError('Phone number is required');
        setBusy(false);
        return;
      }
      if (!passKey.trim()) {
        setError('A valid invitation pass key is required to register');
        setBusy(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        setBusy(false);
        return;
      }
      const { error } = await signUp({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        phone: phone.trim(),
        passKey: passKey.trim(),
        referralCode: referralCode.trim() || undefined,
      });
      if (error) setError(error);
      else {
        setInfo('Account created successfully. You can now sign in.');
        setMode('signin');
      }
    }
    setBusy(false);
  };

  const isSignup = mode === 'signup';

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
          <div className="mb-5 flex items-center gap-2">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${isSignup ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
              {isSignup ? <UserPlus className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {isSignup ? 'Create your account' : 'Sign in'}
              </h2>
              <p className="text-xs text-slate-500">
                {isSignup ? 'Enter your invitation details below' : 'Welcome back, sign in to continue'}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignup && (
              <Input label="Full Name" value={fullName} onChange={setFullName} placeholder="Your name" required />
            )}
            <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@business.com" required />
            {isSignup && (
              <Input label="Phone Number" type="tel" value={phone} onChange={setPhone} placeholder="e.g. +2348012345678" required />
            )}
            {isSignup && (
              <Input label="Invitation Pass Key" value={passKey} onChange={setPassKey} placeholder="Enter the key from your invitation" required />
            )}
            <div className="relative">
              <Input
                label={isSignup ? 'Password' : 'Password'}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-9 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {isSignup && (
              <Input
                label="Confirm Password"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="••••••••"
                required
              />
            )}
            {isSignup && (
              <Input label="Referral Code (optional)" value={referralCode} onChange={setReferralCode} placeholder="Enter a referral code if you have one" />
            )}
            {error && <ErrorBanner message={error} />}
            {info && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {info}
              </div>
            )}
            <Button type="submit" disabled={busy} className="w-full" size="lg">
              {busy ? 'Please wait…' : isSignup ? 'Create Account' : 'Sign In'}
            </Button>
          </form>

          {isSignup && (
            <div className="mt-4 rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
              <p className="flex items-center gap-1.5 font-medium"><KeyRound className="h-4 w-4" /> Invitation-only registration</p>
              <p className="mt-1">You need a valid pass key from an authorized administrator to create an account. The pass key is bound to your phone number and can only be used once. If an agent record already exists with your phone or email, your account will be linked to it automatically.</p>
            </div>
          )}

          <div className="mt-5 text-center">
            {isSignup ? (
              <p className="text-sm text-blue-100">
                Already have an account?{' '}
                <button
                  onClick={() => { setMode('signin'); setError(null); setInfo(null); }}
                  className="font-semibold text-white underline underline-offset-2 hover:text-white/90"
                >
                  Sign in
                </button>
              </p>
            ) : (
              <p className="text-sm text-blue-100">
                Don't have an account?{' '}
                <button
                  onClick={() => { setMode('signup'); setError(null); setInfo(null); }}
                  className="font-semibold text-white underline underline-offset-2 hover:text-white/90"
                >
                  Create account
                </button>
              </p>
            )}
          </div>

          {!isSignup && (
            <p className="mt-3 max-w-sm text-center text-xs text-blue-200/70">
              Registration requires an invitation pass key from an authorized administrator.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
