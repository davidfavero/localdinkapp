'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { 
  signInWithEmail, 
  signUpWithEmail, 
  signInWithGoogle,
  getClientAuth,
  setupRecaptcha,
  sendSMSCode,
  verifySMSCode,
  clearRecaptcha
} from '@/firebase/auth';
import { setAuthTokenAction } from '@/lib/auth-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RobinIcon } from '@/components/icons/robin-icon';
import { useUser } from '@/firebase';
import { Loader2, Mail, Chrome, Phone, ArrowLeft } from 'lucide-react';
import type { ConfirmationResult } from 'firebase/auth';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isUserLoading: loading } = useUser();
  
  // Email/Password state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  
  // Phone authentication state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isCodeSent, setIsCodeSent] = useState(false);
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  const recaptchaInitialized = useRef(false);
  
  // General state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('phone'); // Phone is now default

  // DEV MODE: Sign in anonymously for testing
  const handleDevBypass = async () => {
    if (process.env.NODE_ENV === 'development') {
      try {
        const { signInAnonymously } = await import('firebase/auth');
        const auth = getClientAuth();
        const userCredential = await signInAnonymously(auth);
        console.log('🔧 Dev: Signed in anonymously as', userCredential.user.uid);
        
        // Set auth token on server
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

  // Initialize reCAPTCHA when phone tab is active
  useEffect(() => {
    if (activeTab === 'phone' && !recaptchaInitialized.current && recaptchaContainerRef.current) {
      try {
        setupRecaptcha('recaptcha-container');
        recaptchaInitialized.current = true;
      } catch (error) {
        console.error('Error setting up reCAPTCHA:', error);
      }
    }
    
    return () => {
      // Cleanup on unmount
      if (recaptchaInitialized.current) {
        clearRecaptcha();
        recaptchaInitialized.current = false;
      }
    };
  }, [activeTab]);

  useEffect(() => {
    const syncAuthToken = async () => {
      if (!loading && user) {
        try {
          // Check if we already have the cookie (avoid unnecessary redirects)
          const hasCookie = document.cookie.includes('auth-token=');
          
          if (!hasCookie) {
            // Get the ID token and sync it with the server
            const auth = getClientAuth();
            const idToken = await auth.currentUser?.getIdToken();
            
            if (idToken) {
              // Set the auth token on the server
              const result = await setAuthTokenAction(idToken);
              if (!result.success) {
                console.error('Failed to set auth token:', result.error);
                return; // Don't redirect if token setting failed
              }
              
              // Wait a moment for the cookie to be set
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
          
          // Redirect to dashboard
          router.push('/dashboard');
        } catch (error) {
          console.error('Error syncing auth token:', error);
          // Don't redirect on error - let user stay on login page
        }
      }
    };
    
    syncAuthToken();
  }, [user, loading, router]);

  // Email/Password handlers
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      let userCredential;
      if (isSignUp) {
        userCredential = await signUpWithEmail(email, password);
        toast({
          title: 'Account Created!',
          description: 'Welcome to LocalDink!',
        });
      } else {
        userCredential = await signInWithEmail(email, password);
        toast({
          title: 'Welcome Back!',
          description: 'Successfully signed in.',
        });
      }
      
      // Get the ID token and set it server-side
      const idToken = await userCredential.user.getIdToken();
      const result = await setAuthTokenAction(idToken);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to set authentication token');
      }
      
      // Redirect to dashboard
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Email auth error:', error);
      let errorMessage = 'Please try again.';
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email.';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password.';
      } else if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'An account with this email already exists.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password should be at least 6 characters.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        variant: 'destructive',
        title: isSignUp ? 'Sign Up Failed' : 'Sign In Failed',
        description: errorMessage,
      });
      setIsSubmitting(false);
    }
  };

  // Google Sign-In handler
  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    try {
      const userCredential = await signInWithGoogle();
      
      // Get the ID token and set it server-side
      const idToken = await userCredential.user.getIdToken();
      const result = await setAuthTokenAction(idToken);
      
      // Even if token setting fails, proceed if we have a user
      // (The client-side auth is working, server-side is just for middleware)
      if (!result.success && !userCredential.user) {
        throw new Error(result.error || 'Failed to set authentication token');
      }
      
      toast({
        title: 'Welcome!',
        description: 'Successfully signed in with Google.',
      });
      
      // Small delay to ensure state updates
      setTimeout(() => {
        router.push('/dashboard');
      }, 500);
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      toast({
        variant: 'destructive',
        title: 'Sign In Failed',
        description: error.message || 'Failed to sign in with Google. Please try again.',
      });
      setIsSubmitting(false);
    }
  };

  // Phone Sign-In handlers
  const formatPhoneNumber = (value: string): string => {
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

  const getE164PhoneNumber = (formatted: string): string => {
    const digits = formatted.replace(/\D/g, '');
    // Assume US numbers if 10 digits
    if (digits.length === 10) {
      return `+1${digits}`;
    }
    // If already has country code
    return `+${digits}`;
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Re-initialize reCAPTCHA if needed
      if (!recaptchaInitialized.current) {
        setupRecaptcha('recaptcha-container');
        recaptchaInitialized.current = true;
      }

      const e164Phone = getE164PhoneNumber(phoneNumber);
      const result = await sendSMSCode(e164Phone);
      setConfirmationResult(result);
      setIsCodeSent(true);
      
      toast({
        title: 'Code Sent!',
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
      
      // Reset reCAPTCHA on error
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
      
      // Get the ID token and set it server-side
      const idToken = await userCredential.user.getIdToken();
      const result = await setAuthTokenAction(idToken);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to set authentication token');
      }
      
      toast({
        title: 'Welcome!',
        description: 'Successfully signed in.',
      });
      
      // Small delay to ensure state updates
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
    // Reset reCAPTCHA for new attempt
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
          <h2 className="text-4xl font-bold text-foreground font-headline">
            Welcome to LocalDink
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Sign in or create an account to start scheduling
          </p>
        </div>

        <Card className="shadow-xl border-accent/20">
          <CardHeader className="space-y-1 pb-6">
            <CardTitle className="text-2xl font-headline">Sign In</CardTitle>
            <CardDescription>
              Choose your preferred sign-in method
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Phone
                </TabsTrigger>
                <TabsTrigger value="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </TabsTrigger>
                <TabsTrigger value="google" className="flex items-center gap-2">
                  <Chrome className="h-4 w-4" />
                  Google
                </TabsTrigger>
              </TabsList>

              <TabsContent value="phone" className="space-y-4 mt-6">
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
                      <p className="text-xs text-muted-foreground">
                        We'll send you a verification code via SMS
                      </p>
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
                    
                    {/* Invisible reCAPTCHA container */}
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
                      <p className="text-xs text-muted-foreground">
                        Enter the code we sent to {phoneNumber}
                      </p>
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
                      Didn't receive a code? Try again
                    </Button>
                  </form>
                )}
              </TabsContent>

              <TabsContent value="email" className="space-y-4 mt-6">
                <form onSubmit={handleEmailAuth} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11"
                      required
                      autoFocus
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11"
                      required
                      minLength={6}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="flex items-center space-x-2 text-sm">
                      <input
                        type="checkbox"
                        checked={isSignUp}
                        onChange={(e) => setIsSignUp(e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-muted-foreground">Create new account</span>
                    </label>
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full h-11 bg-gradient-to-r from-primary to-green-700 hover:opacity-90"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {isSignUp ? 'Creating Account...' : 'Signing In...'}
                      </>
                    ) : (
                      isSignUp ? 'Create Account' : 'Sign In'
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="google" className="space-y-4 mt-6">
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground text-center">
                    Sign in quickly with your Google account
                  </p>
                  <Button 
                    onClick={handleGoogleSignIn}
                    className="w-full h-11 bg-white hover:bg-gray-50 text-gray-900 border border-gray-300"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing In...
                      </>
                    ) : (
                      <>
                        <Chrome className="mr-2 h-4 w-4" />
                        Continue with Google
                      </>
                    )}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>

        {/* DEV MODE BYPASS */}
        {process.env.NODE_ENV === 'development' && (
          <div className="text-center">
            <Button
              onClick={handleDevBypass}
              variant="outline"
              className="text-xs"
            >
              🔧 Dev: Skip Login
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
