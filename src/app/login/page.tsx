'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, signInWithGoogleOnly } from '@/firebase/auth';
import { isFirebaseConfigured } from '@/firebase/app';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RobinIcon } from '@/components/icons/robin-icon';
import { useEffect } from 'react';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/firebase/provider';
import { AlertCircle } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email('Invalid email address.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
});

const signupSchema = z.object({
    name: z.string().min(2, 'Name is required.'),
    email: z.string().email('Invalid email address.'),
    password: z.string().min(6, 'Password must be at least 6 characters.'),
});


type LoginFormValues = z.infer<typeof loginSchema>;
type SignupFormValues = z.infer<typeof signupSchema>;

const FirebaseConfigWarning = () => (
    <Alert variant="destructive" className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Firebase Not Configured</AlertTitle>
        <AlertDescription>
            Your application's Firebase client configuration is missing or incomplete. Please copy the configuration from your Firebase project settings into your `.env` file and restart the development server.
        </AlertDescription>
    </Alert>
);


export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading } = useAuth();
  
  useEffect(() => {
    if (!loading && user) {
        router.push('/dashboard');
    }
  }, [user, loading, router]);
  

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const signupForm = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', email: '', password: '' },
  });


  const onLoginSubmit = async (data: LoginFormValues) => {
    if (!auth) return;
    try {
      await signInWithEmailAndPassword(auth, data.email, data.password);
      toast({ title: 'Login Successful', description: "Welcome back!" });
      // The useEffect will handle the redirect
    } catch (error: any) {
       toast({
          variant: 'destructive',
          title: 'Login Failed',
          description: error.message || 'An unknown error occurred.',
       });
    }
  };
  
  const onSignupSubmit = async (data: SignupFormValues) => {
    if (!auth) return;
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      await updateProfile(userCredential.user, { displayName: data.name });
      toast({ title: 'Signup Successful', description: 'Welcome to LocalDink!' });
      // The useEffect will handle the redirect.
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Signup Failed',
        description: error.message || 'An unknown error occurred.',
      });
    }
  };

  const onGoogleSignIn = async () => {
    try {
      await signInWithGoogleOnly();
      // The useEffect hook will handle the redirect and user doc creation.
      toast({ title: 'Signed in with Google!', description: 'Welcome to LocalDink!' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Google Sign-In Failed',
        description: error.message || 'Could not sign in with Google.',
      });
    }
  };


  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-md">
            <div className="text-center mb-6">
                <RobinIcon className="h-16 w-16 text-primary mx-auto mb-4" />
                <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Welcome to LocalDink</h1>
                <p className="text-muted-foreground mt-2">Sign in or create an account to start scheduling.</p>
            </div>
            
            {!isFirebaseConfigured && <FirebaseConfigWarning />}

             <div className="bg-card p-6 rounded-lg shadow-sm">
                <Button variant="outline" className="w-full" onClick={onGoogleSignIn} disabled={loading || !isFirebaseConfigured}>
                    <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 381.5 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 126 21.2 172.4 56.2L376.8 128C340.6 96.7 298.4 80 248 80c-82.3 0-150.1 63.3-150.1 140.2-0.1 76.5 61.2 138.3 138.8 138.3 43.1 0 81.9-20.3 108.6-52.9 14-17.1 21.6-38.3 21.6-61.9H248v-85.3h236.1c2.3 12.7 3.9 25.9 3.9 40.2z"></path></svg>
                    {loading ? 'Loading...' : 'Sign in with Google'}
                </Button>
                <div className="my-4 flex items-center">
                    <Separator className="flex-1" />
                    <span className="px-4 text-xs uppercase text-muted-foreground">or</span>
                    <Separator className="flex-1" />
                </div>
                <Tabs defaultValue="login" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="login" disabled={!isFirebaseConfigured}>Log In</TabsTrigger>
                        <TabsTrigger value="signup" disabled={!isFirebaseConfigured}>Sign Up</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="login">
                        <Form {...loginForm}>
                            <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4 pt-4">
                                <FormField
                                    control={loginForm.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Email</FormLabel>
                                            <FormControl><Input placeholder="you@example.com" {...field} disabled={!isFirebaseConfigured} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={loginForm.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Password</FormLabel>
                                            <FormControl><Input type="password" placeholder="password" {...field} disabled={!isFirebaseConfigured} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <Button type="submit" className="w-full" disabled={loginForm.formState.isSubmitting || !isFirebaseConfigured}>
                                    {loginForm.formState.isSubmitting ? 'Logging In...' : 'Log In'}
                                </Button>
                            </form>
                        </Form>
                    </TabsContent>

                    <TabsContent value="signup">
                       <Form {...signupForm}>
                            <form onSubmit={signupForm.handleSubmit(onSignupSubmit)} className="space-y-4 pt-4">
                                <FormField
                                    control={signupForm.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Full Name</FormLabel>
                                            <FormControl><Input placeholder="Alex Johnson" {...field} disabled={!isFirebaseConfigured} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={signupForm.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Email</FormLabel>
                                            <FormControl><Input placeholder="you@example.com" {...field} disabled={!isFirebaseConfigured} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={signupForm.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Password</FormLabel>
                                            <FormControl><Input type="password" {...field} disabled={!isFirebaseConfigured} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <Button type="submit" className="w-full" disabled={signupForm.formState.isSubmitting || !isFirebaseConfigured}>
                                    {signupForm.formState.isSubmitting ? 'Creating Account...' : 'Sign Up'}
                                </Button>
                            </form>
                        </Form>
                    </TabsContent>
                </Tabs>
             </div>
        </div>
    </div>
  );
}
