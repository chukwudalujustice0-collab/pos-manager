import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button, Input, ErrorBanner } from '@/components/ui';
import { CreditCard, Eye, EyeOff, UserPlus, LogIn, KeyRound, BadgeCheck, Loader2, CheckCircle2 } from 'lucide-react';

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
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<null | { role: string; full_name: string | null }>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const verifyPhone = async () => {
    setVerifyError(null);
    setVerified(null);
    if (!phone.trim()) { setVerifyError('Enter a phone number first'); return; }
    setVerifying(true);
    const { data, error: rpcErr } = await supabase.rpc('lookup_invitation_by_phone', { p_phone: phone.trim() });
    setVerifying(false);
    if (rpcErr) { setVerifyError(rpcErr.message); return; }
    const row = (data as { pass_key?: string; role?: string; full_name?: string | null }[] | null)?.[0];
    if (!row || !row.pass_key) { setVerifyError('No active invitation found for this phone number. Ask your administrator to generate a pass key.'); return; }
    setPassKey(row.pass_key);
    setVerified({ role: row.role ?? 'field_agent', full_name: row.full_name ?? null });
  };

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
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-purple-900 to-purple-700">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-lg">
            <CreditCard className="h-7 w-7 text-purple-800" />
          </div>
          <h1 className="text-2xl font-bold text-white">Wema Super Agent</h1>
          <p className="mt-1 text-sm text-purple-200">Terminal inventory, agent & sales management</p>
        </div>

        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
          <div className="mb-5 flex items-center gap-2">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${isSignup ? 'bg-emerald-50 text-emerald-600' : 'bg-purple-50 text-purple-600'}`}>
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
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Phone Number <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setVerified(null); setVerifyError(null); }}
                    placeholder="e.g. +2348012345678"
                    required
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={verifyPhone}
                    disabled={verifying || !phone.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-purple-100 px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                    Verify
                  </button>
                </div>
                {verifyError && <p className="mt-1 text-xs text-red-600">{verifyError}</p>}
                {verified && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Invitation found</p>
                      <p>Role: {verified.role.replace('_', ' ')}{verified.full_name ? ` · Name: ${verified.full_name}` : ''}. Your pass key has been filled in below.</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            {isSignup && (
              <Input label="Invitation Pass Key" value={passKey} onChange={setPassKey} placeholder="Tap Verify above to auto-fill" required />
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
            <div className="mt-4 rounded-lg bg-purple-50 p-3 text-xs text-purple-700">
              <p className="flex items-center gap-1.5 font-medium"><KeyRound className="h-4 w-4" /> Invitation-only registration</p>
              <p className="mt-1">You need a valid pass key from an authorized administrator to create an account. The pass key is bound to your phone number and can only be used once. If an agent record already exists with your phone or email, your account will be linked to it automatically.</p>
            </div>
          )}

          <div className="mt-5 text-center">
            {isSignup ? (
              <p className="text-sm text-slate-600">
                Already have an account?{' '}
                <button
                  onClick={() => { setMode('signin'); setError(null); setInfo(null); }}
                  className="font-semibold text-purple-700 underline underline-offset-2 hover:text-purple-900"
                >
                  Sign in
                </button>
              </p>
            ) : (
              <p className="text-sm text-slate-600">
                Don't have an account?{' '}
                <button
                  onClick={() => { setMode('signup'); setError(null); setInfo(null); }}
                  className="font-semibold text-purple-700 underline underline-offset-2 hover:text-purple-900"
                >
                  Create account
                </button>
              </p>
            )}
          </div>

          {!isSignup && (
            <p className="mt-3 max-w-sm text-center text-xs text-slate-500">
              Registration requires an invitation pass key from an authorized administrator.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
