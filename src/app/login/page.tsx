'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { 
  signInWithEmail, 
  signUpWithEmail, 
  signInWithGoogle,
  getClientAuth
} from '@/firebase/auth';
import { setAuthTokenAction } from '@/lib/auth-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RobinIcon } from '@/components/icons/robin-icon';
import { useUser } from '@/firebase';
import { Loader2, Mail, Chrome } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isUserLoading: loading } = useUser();
  
  // Email/Password state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  
  // General state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('email');

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
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </TabsTrigger>
                <TabsTrigger value="google" className="flex items-center gap-2">
                  <Chrome className="h-4 w-4" />
                  Google
                </TabsTrigger>
              </TabsList>

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
