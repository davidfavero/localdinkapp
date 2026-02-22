'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ConfirmationResult } from 'firebase/auth';
import { Loader2, ArrowLeft, Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  getClientAuth,
  setupRecaptcha,
  sendSMSCode,
  verifySMSCode,
  clearRecaptcha,
} from '@/firebase/auth';
import { setAuthTokenAction } from '@/lib/auth-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RobinIcon } from '@/components/icons/robin-icon';
import { useUser } from '@/firebase';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isUserLoading: loading } = useUser();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  const recaptchaInitialized = useRef(false);

  const handleDevBypass = async () => {
    if (process.env.NODE_ENV === 'development') {
      try {
        const { signInAnonymously } = await import('firebase/auth');
        const auth = getClientAuth();
        const userCredential = await signInAnonymously(auth);
        console.log('Dev: Signed in anonymously as', userCredential.user.uid);

        const idToken = await userCredential.user.getIdToken();
        await setAuthTokenAction(idToken);

        toast({
          title: 'Dev Mode',
          description: 'Signed in anonymously for testing.',
        });
        setTimeout(() => {
          router.push('/dashboard');
        }, 500);
      } catch (error: any) {
        console.error('Dev sign-in error:', error);
        toast({
          variant: 'destructive',
          title: 'Dev Sign-In Failed',
          description: error.message || 'Please enable Anonymous Auth in Firebase Console.',
        });
      }
    }
  };

  useEffect(() => {
    if (!recaptchaInitialized.current && recaptchaContainerRef.current) {
      try {
        setupRecaptcha('recaptcha-container');
        recaptchaInitialized.current = true;
      } catch (error) {
        console.error('Error setting up reCAPTCHA:', error);
      }
    }

    return () => {
      if (recaptchaInitialized.current) {
        clearRecaptcha();
        recaptchaInitialized.current = false;
      }
    };
  }, []);

  useEffect(() => {
    const syncAuthToken = async () => {
      if (!loading && user) {
        try {
          const hasCookie = document.cookie.includes('auth-token=');

          if (!hasCookie) {
            const auth = getClientAuth();
            const idToken = await auth.currentUser?.getIdToken();

            if (idToken) {
              const result = await setAuthTokenAction(idToken);
              if (!result.success) {
                console.error('Failed to set auth token:', result.error);
                return;
              }

              await new Promise((resolve) => setTimeout(resolve, 100));
            }
          }

          router.push('/dashboard');
        } catch (error) {
          console.error('Error syncing auth token:', error);
        }
      }
    };

    syncAuthToken();
  }, [user, loading, router]);

  const formatPhoneNumber = (value: string): string => {
    const digits = value.replace(/\D/g, '');

    if (digits.length <= 3) {
      return digits;
    }
    if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    }
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const getE164PhoneNumber = (formatted: string): string => {
    const digits = formatted.replace(/\D/g, '');
    if (digits.length === 10) {
      return `+1${digits}`;
    }
    return `+${digits}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneNumber(formatPhoneNumber(e.target.value));
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (!recaptchaInitialized.current) {
        setupRecaptcha('recaptcha-container');
        recaptchaInitialized.current = true;
      }

      const e164Phone = getE164PhoneNumber(phoneNumber);
      const result = await sendSMSCode(e164Phone);
      setConfirmationResult(result);
      setIsCodeSent(true);

      toast({
        title: 'Code Sent',
        description: `We sent a verification code to ${phoneNumber}`,
      });
    } catch (error: any) {
      console.error('Phone auth error:', error);
      let errorMessage = 'Failed to send verification code. Please try again.';

      if (error.code === 'auth/invalid-phone-number') {
        errorMessage = 'Please enter a valid phone number.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many attempts. Please try again later.';
      } else if (error.code === 'auth/captcha-check-failed') {
        errorMessage = 'reCAPTCHA verification failed. Please refresh and try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage,
      });

      clearRecaptcha();
      recaptchaInitialized.current = false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationResult) return;

    setIsSubmitting(true);

    try {
      const userCredential = await verifySMSCode(confirmationResult, verificationCode);
      const idToken = await userCredential.user.getIdToken();
      const result = await setAuthTokenAction(idToken);

      if (!result.success) {
        throw new Error(result.error || 'Failed to set authentication token');
      }

      toast({
        title: 'Welcome',
        description: 'Successfully signed in.',
      });

      setTimeout(() => {
        router.push('/dashboard');
      }, 500);
    } catch (error: any) {
      console.error('Verification error:', error);
      let errorMessage = 'Invalid code. Please try again.';

      if (error.code === 'auth/invalid-verification-code') {
        errorMessage = 'The verification code is incorrect.';
      } else if (error.code === 'auth/code-expired') {
        errorMessage = 'The verification code has expired. Please request a new one.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        variant: 'destructive',
        title: 'Verification Failed',
        description: errorMessage,
      });
      setIsSubmitting(false);
    }
  };

  const handleBackToPhone = () => {
    setIsCodeSent(false);
    setVerificationCode('');
    setConfirmationResult(null);
    clearRecaptcha();
    recaptchaInitialized.current = false;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-accent/5 to-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-accent/5 to-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-primary to-green-700 rounded-full flex items-center justify-center shadow-lg">
              <RobinIcon className="w-12 h-12 text-background" />
            </div>
          </div>
          <h2 className="text-4xl font-bold text-foreground font-headline">Welcome to LocalDink</h2>
          <p className="mt-3 text-base text-muted-foreground">Sign in with your phone number</p>
        </div>

        <Card className="shadow-xl border-accent/20">
          <CardHeader className="space-y-1 pb-6">
            <CardTitle className="text-2xl font-headline flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Phone Sign In
            </CardTitle>
            <CardDescription>Enter your number and confirm with a one-time code</CardDescription>
          </CardHeader>
          <CardContent>
            {!isCodeSent ? (
              <form onSubmit={handleSendCode} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(555) 555-5555"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    className="h-11"
                    required
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">We&apos;ll send you a verification code via SMS</p>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-gradient-to-r from-primary to-green-700 hover:opacity-90"
                  disabled={isSubmitting || phoneNumber.replace(/\D/g, '').length < 10}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending Code...
                    </>
                  ) : (
                    'Send Verification Code'
                  )}
                </Button>

                <div id="recaptcha-container" ref={recaptchaContainerRef}></div>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleBackToPhone}
                  className="mb-2 -ml-2 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Change number
                </Button>

                <div className="space-y-2">
                  <Label htmlFor="code">Verification Code</Label>
                  <Input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Enter 6-digit code"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="h-11 text-center text-lg tracking-widest"
                    required
                    autoFocus
                    maxLength={6}
                  />
                  <p className="text-xs text-muted-foreground">Enter the code we sent to {phoneNumber}</p>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-gradient-to-r from-primary to-green-700 hover:opacity-90"
                  disabled={isSubmitting || verificationCode.length !== 6}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify & Sign In'
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-sm"
                  onClick={handleBackToPhone}
                  disabled={isSubmitting}
                >
                  Didn&apos;t receive a code? Try again
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>

        {process.env.NODE_ENV === 'development' && (
          <div className="text-center">
            <Button onClick={handleDevBypass} variant="outline" className="text-xs">
              Dev: Skip Login
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
