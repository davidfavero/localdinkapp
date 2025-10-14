'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { useAuth, useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult, updateProfile, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RobinIcon } from '@/components/icons/robin-icon';
import { useState, useRef, useEffect } from 'react';
import { Separator } from '@/components/ui/separator';

const loginSchema = z.object({
  email: z.string().email('Invalid email address.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
});

const signupSchema = z.object({
    name: z.string().min(2, 'Name is required.'),
    email: z.string().email('Invalid email address.'),
    password: z.string().min(6, 'Password must be at least 6 characters.'),
});

const phoneSchema = z.object({
    phone: z.string().min(10, 'Please enter a valid phone number.'),
});

const codeSchema = z.object({
    code: z.string().min(6, 'Verification code must be 6 digits.'),
});


type LoginFormValues = z.infer<typeof loginSchema>;
type SignupFormValues = z.infer<typeof signupSchema>;
type PhoneFormValues = z.infer<typeof phoneSchema>;
type CodeFormValues = z.infer<typeof codeSchema>;


export default function LoginPage() {
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isSubmittingPhone, setIsSubmittingPhone] = useState(false);
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);

  // Helper to create user document if it doesn't exist
  const ensureUserDocument = async (user: import('firebase/auth').User) => {
    if (!firestore) return;
    const userDocRef = doc(firestore, 'users', user.uid);
    const docSnap = await getDoc(userDocRef);

    if (!docSnap.exists()) {
        const [firstName, ...lastNameParts] = (user.displayName || 'New User').split(' ');
        const lastName = lastNameParts.join(' ');
        await setDoc(userDocRef, {
            firstName: firstName || 'New',
            lastName: lastName || 'User',
            email: user.email,
            phone: user.phoneNumber,
            avatarUrl: user.photoURL,
        }, { merge: true });
    }
  };

  useEffect(() => {
    if (auth && recaptchaContainerRef.current && !((window as any).recaptchaVerifier)) {
      const recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
        size: 'invisible',
        'callback': () => {},
      });
      (window as any).recaptchaVerifier = recaptchaVerifier;
    }
  }, [auth]);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const signupForm = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', email: '', password: '' },
  });
  
  const phoneForm = useForm<PhoneFormValues>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: '' },
  });

  const codeForm = useForm<CodeFormValues>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
  });


  const onLoginSubmit = async (data: LoginFormValues) => {
    if (!auth) {
        toast({ variant: 'destructive', title: 'Auth not ready', description: 'Please try again in a moment.' });
        return;
    }
    try {
      const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
      await ensureUserDocument(userCredential.user);
      toast({ title: 'Login Successful', description: "Welcome back!" });
      router.push('/dashboard');
    } catch (error: any) {
       toast({
          variant: 'destructive',
          title: 'Login Failed',
          description: error.message || 'An unknown error occurred.',
       });
    }
  };
  
  const onSignupSubmit = async (data: SignupFormValues) => {
    if (!auth || !firestore) {
        toast({ variant: 'destructive', title: 'Auth not ready', description: 'Please try again in a moment.' });
        return;
    }
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      const user = userCredential.user;
      
      await updateProfile(user, { displayName: data.name });
      await ensureUserDocument(user);

      toast({ title: 'Signup Successful', description: 'Welcome to LocalDink!' });
      router.push('/dashboard');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Signup Failed',
        description: error.message || 'An unknown error occurred.',
      });
    }
  };

  const onGoogleSignIn = async () => {
    if (!auth) {
      toast({ variant: 'destructive', title: 'Auth not ready' });
      return;
    }
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      await ensureUserDocument(result.user);
      toast({ title: 'Signed in with Google!', description: 'Welcome to LocalDink!' });
      router.push('/dashboard');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Google Sign-In Failed',
        description: error.message || 'Could not sign in with Google.',
      });
    }
  };
  
  const onPhoneSubmit = async (data: PhoneFormValues) => {
    if (!auth) {
        toast({ variant: 'destructive', title: 'Auth not ready' });
        return;
    }
    setIsSubmittingPhone(true);
    try {
        const verifier = (window as any).recaptchaVerifier;
        const confirmation = await signInWithPhoneNumber(auth, data.phone, verifier);
        setConfirmationResult(confirmation);
        toast({ title: 'Verification Code Sent', description: 'Check your phone for a 6-digit code.'});
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'SMS Failed', description: error.message });
        console.error(error);
    } finally {
        setIsSubmittingPhone(false);
    }
  };

  const onCodeSubmit = async (data: CodeFormValues) => {
    if (!confirmationResult) {
        toast({ variant: 'destructive', title: 'No confirmation pending' });
        return;
    }
    try {
        const userCredential = await confirmationResult.confirm(data.code);
        await ensureUserDocument(userCredential.user);
        toast({ title: 'Phone Verification Successful', description: "Welcome to LocalDink!" });
        router.push('/dashboard');
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Verification Failed', description: error.message });
    }
  };


  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div ref={recaptchaContainerRef}></div>
        <div className="w-full max-w-md">
            <div className="text-center mb-6">
                <RobinIcon className="h-16 w-16 text-primary mx-auto mb-4" />
                <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Welcome to LocalDink</h1>
                <p className="text-muted-foreground mt-2">Sign in or create an account to start scheduling.</p>
            </div>
             <div className="bg-card p-6 rounded-lg shadow-sm">
                <Button variant="outline" className="w-full" onClick={onGoogleSignIn}>
                    <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 381.5 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 126 21.2 172.4 56.2L376.8 128C340.6 96.7 298.4 80 248 80c-82.3 0-150.1 63.3-150.1 140.2-0.1 76.5 61.2 138.3 138.8 138.3 43.1 0 81.9-20.3 108.6-52.9 14-17.1 21.6-38.3 21.6-61.9H248v-85.3h236.1c2.3 12.7 3.9 25.9 3.9 40.2z"></path></svg>
                    Sign in with Google
                </Button>
                <div className="my-4 flex items-center">
                    <Separator className="flex-1" />
                    <span className="px-4 text-xs uppercase text-muted-foreground">or</span>
                    <Separator className="flex-1" />
                </div>
                <Tabs defaultValue="login" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="login">Log In</TabsTrigger>
                        <TabsTrigger value="signup">Sign Up</TabsTrigger>
                        <TabsTrigger value="phone">Phone</TabsTrigger>
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
                                            <FormControl><Input placeholder="you@example.com" {...field} /></FormControl>
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
                                            <FormControl><Input type="password" placeholder="password" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <Button type="submit" className="w-full" disabled={loginForm.formState.isSubmitting}>
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
                                            <FormControl><Input placeholder="Alex Johnson" {...field} /></FormControl>
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
                                            <FormControl><Input placeholder="you@example.com" {...field} /></FormControl>
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
                                            <FormControl><Input type="password" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <Button type="submit" className="w-full" disabled={signupForm.formState.isSubmitting}>
                                    {signupForm.formState.isSubmitting ? 'Creating Account...' : 'Sign Up'}
                                </Button>
                            </form>
                        </Form>
                    </TabsContent>
                    
                    <TabsContent value="phone">
                        {!confirmationResult ? (
                            <Form {...phoneForm}>
                                <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-4 pt-4">
                                    <FormField
                                        control={phoneForm.control}
                                        name="phone"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Phone Number</FormLabel>
                                                <FormControl><Input placeholder="+1 555-123-4567" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="submit" className="w-full" disabled={isSubmittingPhone}>
                                        {isSubmittingPhone ? 'Sending...' : 'Send Code'}
                                    </Button>
                                </form>
                            </Form>
                        ) : (
                           <Form {...codeForm}>
                                <form onSubmit={codeForm.handleSubmit(onCodeSubmit)} className="space-y-4 pt-4">
                                    <FormField
                                        control={codeForm.control}
                                        name="code"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Verification Code</FormLabel>
                                                <FormControl><Input placeholder="123456" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="submit" className="w-full" disabled={codeForm.formState.isSubmitting}>
                                        {codeForm.formState.isSubmitting ? 'Verifying...' : 'Verify & Sign In'}
                                    </Button>
                                </form>
                            </Form>
                        )}
                    </TabsContent>
                </Tabs>
             </div>
        </div>
    </div>
  );
}
