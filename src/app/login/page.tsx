'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { setupRecaptcha, sendSMSCode, verifySMSCode, clearRecaptcha } from '@/firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RobinIcon } from '@/components/icons/robin-icon';
import { useUser } from '@/firebase';
import type { ConfirmationResult } from 'firebase/auth';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isUserLoading: loading } = useUser();
  
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const recaptchaInitialized = useRef(false);

  useEffect(() => {
    if (!loading && user) {
      console.log('User detected, redirecting to dashboard...', user.uid);
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Handle unhandled promise rejections (specifically reCAPTCHA timeout errors)
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // Suppress reCAPTCHA timeout errors that occur after successful verification
      if (event.reason?.message?.includes('Timeout') || event.reason?.message?.includes('timeout')) {
        console.log('Caught and suppressed reCAPTCHA timeout error (verification already succeeded)');
        event.preventDefault();
      }
    };
    
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  }, []);

  useEffect(() => {
    // Setup reCAPTCHA only once when component mounts
    if (typeof window === 'undefined' || recaptchaInitialized.current) {
      return;
    }
    
    const initRecaptcha = async () => {
      try {
        // Wait for DOM to be ready
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Double check we haven't initialized yet
        if (!recaptchaInitialized.current) {
          await setupRecaptcha('recaptcha-container', true);
          recaptchaInitialized.current = true;
          console.log('Invisible reCAPTCHA initialized successfully');
        }
      } catch (error) {
        console.error('Failed to setup reCAPTCHA:', error);
        recaptchaInitialized.current = false;
      }
    };
    
    initRecaptcha();
    
    // Cleanup on unmount only
    return () => {
      if (recaptchaInitialized.current) {
        clearRecaptcha();
        recaptchaInitialized.current = false;
      }
    };
  }, []);

  const formatPhoneNumber = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');
    
    // Format as (XXX) XXX-XXXX
    if (digits.length <= 3) {
      return digits;
    } else if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhoneNumber(formatted);
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Ensure reCAPTCHA is initialized
      if (!recaptchaInitialized.current) {
        console.log('Reinitializing invisible reCAPTCHA...');
        await new Promise(resolve => setTimeout(resolve, 500));
        await setupRecaptcha('recaptcha-container', true);
        recaptchaInitialized.current = true;
      }

      // Convert formatted phone to E.164 format (+1XXXXXXXXXX)
      const digits = phoneNumber.replace(/\D/g, '');
      if (digits.length !== 10) {
        throw new Error('Please enter a valid 10-digit phone number');
      }
      const e164Phone = `+1${digits}`;

      console.log('Sending SMS to:', e164Phone);
      const confirmation = await sendSMSCode(e164Phone);
      setConfirmationResult(confirmation);
      setStep('code');
      
      toast({
        title: 'Code Sent!',
        description: 'Check your phone for the verification code.',
      });
    } catch (error: any) {
      console.error('SMS send error details:', {
        code: error.code,
        message: error.message,
        fullError: error
      });
      
      let errorMessage = error.message || 'Please try again.';
      
      // Provide more specific error messages
      if (error.code === 'auth/invalid-app-credential') {
        errorMessage = 'Please check that localhost is in your Firebase authorized domains.';
      } else if (error.code === 'auth/captcha-check-failed') {
        errorMessage = 'reCAPTCHA verification failed. Please refresh and try again.';
      } else if (error.code === 'auth/quota-exceeded') {
        errorMessage = 'SMS quota exceeded. Please try again later.';
      }
      
      toast({
        variant: 'destructive',
        title: 'Failed to Send Code',
        description: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationResult) return;
    
    setIsSubmitting(true);

    try {
      console.log('Verifying code...');
      const userCredential = await verifySMSCode(confirmationResult, verificationCode);
      console.log('Verification successful! User:', userCredential.user.uid);
      
      toast({
        title: 'Success!',
        description: 'Welcome to LocalDink!',
      });
      
      // Manual redirect after short delay to allow profile creation
      setTimeout(() => {
        console.log('Redirecting to dashboard...');
        router.push('/dashboard');
      }, 2000);
    } catch (error: any) {
      console.error('Verification error:', error);
      toast({
        variant: 'destructive',
        title: 'Invalid Code',
        description: 'Please check the code and try again.',
      });
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    setStep('phone');
    setVerificationCode('');
    setConfirmationResult(null);
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
          <h2 className="text-4xl font-bold text-foreground font-headline">
            Welcome to LocalDink
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Sign in or create an account to start scheduling
          </p>
        </div>

        <Card className="shadow-xl border-accent/20">
          <CardHeader className="space-y-1 pb-6">
            <CardTitle className="text-2xl font-headline">Sign In with SMS</CardTitle>
            <CardDescription>
              {step === 'phone' 
                ? 'Enter your phone number to receive a verification code'
                : 'Enter the 6-digit code sent to your phone'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 'phone' ? (
              <form onSubmit={handleSendCode} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-base">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(555) 555-5555"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    maxLength={14}
                    className="text-lg h-12"
                    required
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    US numbers only. Standard message rates may apply.
                  </p>
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full h-12 text-base bg-gradient-to-r from-primary to-green-700 hover:opacity-90 transition-opacity"
                  disabled={isSubmitting || phoneNumber.replace(/\D/g, '').length !== 10}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send Code'
                  )}
                </Button>

                {/* Invisible reCAPTCHA container - hidden from view */}
                <div id="recaptcha-container" className="hidden"></div>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="code" className="text-base">Verification Code</Label>
                  <Input
                    id="code"
                    type="text"
                    placeholder="000000"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                    className="text-lg h-12 text-center tracking-widest"
                    required
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    Code sent to {phoneNumber}
                  </p>
                </div>
                
                <div className="space-y-3">
                  <Button 
                    type="submit" 
                    className="w-full h-12 text-base bg-gradient-to-r from-primary to-green-700 hover:opacity-90 transition-opacity"
                    disabled={isSubmitting || verificationCode.length !== 6}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      'Verify Code'
                    )}
                  </Button>
                  
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleBack}
                    className="w-full"
                    disabled={isSubmitting}
                  >
                    Use a different number
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
